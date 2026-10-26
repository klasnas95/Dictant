'use strict';
// ============================================================
//  main.js — игровой мир: цикл с фиксированным шагом физики
//  и интерполяцией отрисовки, пространственная сетка,
//  столкновения, спавн объектов, камера и рендер
// ============================================================

// ---------- Пространственная сетка для быстрых столкновений ----------
// Каждый объект кладётся в ячейку по своему центру. Размер ячейки больше
// суммы радиусов любых двух объектов, поэтому достаточно проверять 3×3 ячейки.
class SpatialGrid {
  constructor(worldSize, cellSize) {
    this.cell = cellSize;
    this.cols = Math.ceil(worldSize / cellSize) + 2;   // +2 — поля за краями арены
    this.cells = [];
    for (let i = 0; i < this.cols * this.cols; i++) this.cells.push([]);
  }

  clear() {
    for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0;
  }

  coord(v) { return clamp(Math.floor(v / this.cell) + 1, 0, this.cols - 1); }

  insert(e) {
    const i = this.coord(e.y) * this.cols + this.coord(e.x);
    e._cell = i;
    this.cells[i].push(e);
  }

  // Перебор объектов в квадрате со стороной 2*rad вокруг точки
  query(x, y, rad, fn) {
    const x0 = this.coord(x - rad), x1 = this.coord(x + rad);
    const y0 = this.coord(y - rad), y1 = this.coord(y + rad);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells[cy * this.cols + cx];
        for (let i = 0; i < cell.length; i++) fn(cell[i]);
      }
    }
  }
}

// ---------- Игра ----------
const Game = {
  canvas: null,
  ctx: null,
  w: 0, h: 0, dpr: 1,
  state: 'menu',                 // menu | playing | dead
  time: 0,

  shapes: [],
  bullets: [],
  tanks: [],
  dying: [],                     // объекты, проигрывающие анимацию исчезновения
  shapeCounts: { square: 0, triangle: 0, pentagon: 0, alpha: 0 },
  alphaCooldown: 0,
  shapeSpawnAcc: 0,
  respawnQueue: [],
  player: null,

  camera: { x: CONFIG.WORLD_SIZE / 2, y: CONFIG.WORLD_SIZE / 2, zoom: 1 },
  spectate: null,                // за кем следит камера в меню / после смерти
  spectateT: 0,
  deathTimer: 0,
  deathInfo: null,

  acc: 0,
  lastTime: 0,
  fps: 60, fpsFrames: 0, fpsTime: 0,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.grid = new SpatialGrid(CONFIG.WORLD_SIZE, CONFIG.GRID_CELL);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    Input.init(this.canvas);
    UI.init(this);
    this.populateWorld();
    this.loop = this.loop.bind(this);
    requestAnimationFrame((t) => {
      this.lastTime = t / 1000;
      requestAnimationFrame(this.loop);
    });
  },

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  },

  // ---------- Создание мира ----------
  populateWorld() {
    for (const type in CONFIG.SHAPE_LIMITS) {
      for (let i = 0; i < CONFIG.SHAPE_LIMITS[type]; i++) this.spawnShape(type, true);
    }
    const names = shuffle(BOT_NAMES.slice());
    for (let i = 0; i < CONFIG.BOT_COUNT; i++) {
      this.spawnBot(names[i % names.length], COLORS.botPalette[i % COLORS.botPalette.length]);
    }
  },

  spawnBot(name, color) {
    const pos = this.findSpawnPos(800);
    const bot = new Bot(name, color, pos.x, pos.y, Bot.randomLevel());
    bot.spawnTime = this.time;
    this.tanks.push(bot);
    return bot;
  },

  // Случайная точка вне гнезда, по возможности подальше от других танков
  findSpawnPos(minDist) {
    const W = CONFIG.WORLD_SIZE, c = W / 2;
    let best = null, bestD = -1;
    for (let tries = 0; tries < 40; tries++) {
      const x = rand(400, W - 400), y = rand(400, W - 400);
      if (Math.hypot(x - c, y - c) < CONFIG.NEST_RADIUS + 250) continue;
      let md = Infinity;
      for (const t of this.tanks) if (!t.dead) md = Math.min(md, Math.hypot(t.x - x, t.y - y));
      if (md >= minDist) return { x, y };
      if (md > bestD) { bestD = md; best = { x, y }; }
    }
    return best || { x: rand(250, W - 250), y: rand(250, W - 250) };
  },

  isNearTank(x, y, dist) {
    for (const t of this.tanks) {
      if (!t.dead && Math.abs(t.x - x) < dist && Math.abs(t.y - y) < dist) return true;
    }
    return false;
  },

  spawnShape(type, initial) {
    const W = CONFIG.WORLD_SIZE, c = W / 2, nest = CONFIG.NEST_RADIUS;
    let x = 0, y = 0;
    for (let tries = 0; tries < 12; tries++) {
      if (type === 'alpha' || (type === 'pentagon' && Math.random() < 0.6)) {
        // Пятиугольники чаще, а альфа-пятиугольники — только в гнезде в центре
        const a = Math.random() * TAU;
        const d = Math.sqrt(Math.random()) * nest * (type === 'alpha' ? 0.6 : 0.95);
        x = c + Math.cos(a) * d;
        y = c + Math.sin(a) * d;
      } else {
        x = rand(60, W - 60);
        y = rand(60, W - 60);
        if (Math.hypot(x - c, y - c) < nest && Math.random() < 0.85) continue;
      }
      if (!initial && this.isNearTank(x, y, 160)) continue;   // не создаём прямо на танке
      break;
    }
    const s = new Shape(type, x, y);
    if (initial) s.spawnT = 1;
    this.shapes.push(s);
    this.shapeCounts[type]++;
  },

  startGame(nick) {
    if (this.player) {
      const i = this.tanks.indexOf(this.player);
      if (i >= 0) this.tanks.splice(i, 1);
    }
    const pos = this.findSpawnPos(900);
    this.player = new Player(nick, pos.x, pos.y);
    this.player.spawnTime = this.time;
    this.tanks.push(this.player);
    this.state = 'playing';
    this.deathTimer = 0;
    this.camera.x = pos.x;
    this.camera.y = pos.y;
    Input.consumePressed();
    UI.notify('Удачи, <b>' + escapeHtml(nick) + '</b>! Уничтожайте полигоны и прокачивайтесь');
  },

  addBullet(b) { this.bullets.push(b); },

  upgradeStat(i) {
    const p = this.player;
    if (this.state === 'playing' && p && !p.dead) p.upgradeStat(i);
  },

  evolvePlayer(id) {
    const p = this.player;
    if (this.state !== 'playing' || !p || p.dead) return;
    if (p.evolve(id)) {
      UI.notify('Новый класс: <b>' + TANK_CLASSES[id].name + '</b>', 'evolve');
      Particles.ring(p.x, p.y, COLORS.player, p.r * 3.5);
    }
  },

  // Однократные нажатия: переключатели и прокачка
  handlePressed() {
    const keys = Input.consumePressed();
    const p = this.player;
    if (this.state !== 'playing' || !p || p.dead) return;
    for (const code of keys) {
      if (code === 'KeyE') {
        p.autoFire = !p.autoFire;
        UI.notify('Автострельба: <b>' + (p.autoFire ? 'ВКЛ' : 'ВЫКЛ') + '</b>');
      } else if (code === 'KeyC') {
        p.autoSpin = !p.autoSpin;
        UI.notify('Автоповорот: <b>' + (p.autoSpin ? 'ВКЛ' : 'ВЫКЛ') + '</b>');
      } else {
        const m = /^(?:Digit|Numpad)([1-8])$/.exec(code);
        if (m) this.upgradeStat(Number(m[1]) - 1);
      }
    }
  },

  // ---------- Главный цикл ----------
  loop(ts) {
    requestAnimationFrame(this.loop);   // планируем следующий кадр сразу
    const now = ts / 1000;
    let frameDt = now - this.lastTime;
    this.lastTime = now;
    if (!(frameDt > 0)) frameDt = 0;
    if (frameDt > 0.25) frameDt = 0.25;  // после сворачивания вкладки не «догоняем» долго

    this.handlePressed();

    // Физика — фиксированными шагами, независимо от частоты кадров
    const FDT = CONFIG.FIXED_DT;
    this.acc += frameDt;
    let steps = 0;
    while (this.acc >= FDT && steps < CONFIG.MAX_STEPS_PER_FRAME) {
      this.step(FDT);
      this.acc -= FDT;
      steps++;
    }
    if (this.acc >= FDT) this.acc = 0;

    // Интерполяция между двумя последними шагами физики
    const alpha = this.acc / FDT;
    this.interpolate(alpha);
    this.updateCamera(frameDt);
    if (this.state === 'playing' && this.player && !this.player.dead) this.player.updateAim(this, frameDt);
    this.render(alpha);
    UI.update(frameDt, this);

    this.fpsFrames++;
    this.fpsTime += frameDt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
  },

  step(dt) {
    this.time += dt;

    // 1. Запоминаем позиции для интерполяции
    for (const s of this.shapes) { s.px = s.x; s.py = s.y; }
    for (const b of this.bullets) { b.px = b.x; b.py = b.y; }
    for (const t of this.tanks) { t.px = t.x; t.py = t.y; }

    // 2. Управление: игрок и ИИ ботов
    if (this.state === 'playing' && this.player && !this.player.dead) this.player.handleInput();
    for (const t of this.tanks) if (t.isBot) t.steer(this, dt);

    // 3. Движение и стрельба
    for (let i = 0; i < this.tanks.length; i++) this.tanks[i].update(dt, this);
    for (const b of this.bullets) b.update(dt);
    for (const s of this.shapes) s.update(dt);

    // 4. Столкновения и смерти
    this.collide(dt);
    this.processDeaths();

    // 5. Появление новых объектов и эффекты
    this.spawnStep(dt);
    Particles.update(dt);
    this.updateDying(dt);

    if (this.deathTimer > 0) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) UI.showDeath(this.deathInfo);
    }
  },

  // ---------- Столкновения ----------
  collide(dt) {
    const grid = this.grid;
    grid.clear();
    for (const s of this.shapes) grid.insert(s);
    for (const t of this.tanks) grid.insert(t);
    for (const b of this.bullets) grid.insert(b);
    for (const s of this.shapes) this.checkNeighbors(s, dt);
    for (const t of this.tanks) this.checkNeighbors(t, dt);
    for (const b of this.bullets) this.checkNeighbors(b, dt);
  },

  // Каждая пара проверяется один раз: только с объектами с большим id
  checkNeighbors(a, dt) {
    if (a.dead) return;
    const grid = this.grid, n = grid.cols, cells = grid.cells;
    const cx = a._cell % n, cy = (a._cell / n) | 0;
    for (let oy = -1; oy <= 1; oy++) {
      const yy = cy + oy;
      if (yy < 0 || yy >= n) continue;
      for (let ox = -1; ox <= 1; ox++) {
        const xx = cx + ox;
        if (xx < 0 || xx >= n) continue;
        const cell = cells[yy * n + xx];
        for (let k = 0; k < cell.length; k++) {
          const b = cell[k];
          if (b.id <= a.id || b.dead) continue;
          const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
          if (dx * dx + dy * dy >= rr * rr) continue;
          this.resolvePair(a, b, dx, dy, dt);
          if (a.dead) return;
        }
      }
    }
  },

  resolvePair(a, b, dx, dy, dt) {
    const ka = a.kind, kb = b.kind;
    if (ka === 'bullet' || kb === 'bullet') {
      if (ka === 'bullet' && kb === 'bullet') {
        if (a.owner !== b.owner) this.bulletVsBullet(a, b);
      } else if (ka === 'bullet') {
        this.bulletHit(a, b);
      } else {
        this.bulletHit(b, a);
      }
      return;
    }
    this.bodyCollision(a, b, dx, dy, dt);
  },

  // Пуля попала в полигон или танк
  bulletHit(bullet, target) {
    if (target === bullet.owner || bullet.hits.has(target.id)) return;
    bullet.hits.add(target.id);
    target.takeDamage(bullet.damage, bullet.owner);
    // Отталкивание цели по направлению полёта пули
    const sp = Math.hypot(bullet.vx, bullet.vy) || 1;
    const knock = 22 * Math.sqrt(bullet.damage / 7) / target.mass;
    target.vx += bullet.vx / sp * knock;
    target.vy += bullet.vy / sp * knock;
    // Пуля теряет «пробивание»
    bullet.hp -= target.pierceCost;
    if (bullet.hp <= 0) bullet.dead = true;
    // Искры — только рядом с игроком, чтобы не тратить ресурсы
    if (bullet.owner === this.player || target === this.player) {
      const color = target.kind === 'shape' ? target.def.color : target.color;
      Particles.burst(bullet.x, bullet.y, color, 2, { speed: 120, size: 3, life: 0.3 });
    }
  },

  bulletVsBullet(a, b) {
    if (a.hits.has(b.id)) return;
    a.hits.add(b.id);
    b.hits.add(a.id);
    const da = a.damage, db = b.damage;
    a.hp -= db + 2;
    b.hp -= da + 2;
    if (a.hp <= 0) a.dead = true;
    if (b.hp <= 0) b.dead = true;
  },

  // Столкновение тел: мягкое расталкивание (с учётом масс) и урон при касании
  bodyCollision(a, b, dx, dy, dt) {
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const nx = dx / d, ny = dy / d;
    const overlap = a.r + b.r - d;
    const ma = a.mass, mb = b.mass, total = ma + mb;
    const bothShapes = a.kind === 'shape' && b.kind === 'shape';
    const imp = overlap * (bothShapes ? 300 : 1000) * dt;
    a.vx -= nx * imp * (mb / total);
    a.vy -= ny * imp * (mb / total);
    b.vx += nx * imp * (ma / total);
    b.vy += ny * imp * (ma / total);
    // Частичная позиционная коррекция, чтобы объекты не «проваливались» друг в друга
    const corr = overlap * 0.15;
    a.x -= nx * corr * (mb / total);
    a.y -= ny * corr * (mb / total);
    b.x += nx * corr * (ma / total);
    b.y += ny * corr * (ma / total);
    if (!bothShapes) {
      a.takeDamage(b.contactDps * dt, b);
      b.takeDamage(a.contactDps * dt, a);
    }
  },

  // ---------- Смерти и награды ----------
  processDeaths() {
    const shapes = this.shapes;
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (!s.dead) continue;
      shapes[i] = shapes[shapes.length - 1];
      shapes.pop();
      this.shapeCounts[s.type]--;
      if (s.type === 'alpha') this.alphaCooldown = CONFIG.ALPHA_COOLDOWN;
      this.dying.push(s);
      const big = s.type === 'alpha';
      Particles.burst(s.x, s.y, s.def.color, big ? 40 : 4 + s.def.sides, {
        sides: s.def.sides, size: s.def.radius * (big ? 0.18 : 0.32), speed: big ? 320 : 150, life: big ? 1.1 : 0.6,
      });
      const k = s.lastHitBy;
      if (k && k.kind === 'tank' && !k.dead) {
        k.addScore(s.def.xp);
        if (k === this.player) Particles.text(s.x, s.y, '+' + s.def.xp, s.def.color);
      }
    }

    const bullets = this.bullets;
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      if (!b.dead) continue;
      bullets[i] = bullets[bullets.length - 1];
      bullets.pop();
      this.dying.push(b);
    }

    const tanks = this.tanks;
    for (let i = tanks.length - 1; i >= 0; i--) {
      const t = tanks[i];
      if (!t.dead) continue;
      tanks.splice(i, 1);
      this.onTankKilled(t);
    }
  },

  onTankKilled(t) {
    this.dying.push(t);
    Particles.burst(t.x, t.y, t.color, 22, { speed: 260, size: t.r * 0.28, life: 0.9 });
    Particles.burst(t.x, t.y, COLORS.barrel, 8, { speed: 200, size: t.r * 0.22, life: 0.8, sides: 4 });
    Particles.ring(t.x, t.y, t.color, t.r * 3);

    const killer = t.lastHitBy;
    if (killer && killer.kind === 'tank' && !killer.dead) {
      killer.kills++;
      const xp = Math.floor(Math.min(t.score, LEVEL_XP[CONFIG.MAX_LEVEL]) * CONFIG.KILL_XP_SHARE) + 25;
      killer.addScore(xp);
      if (killer === this.player) {
        UI.notify('Вы уничтожили <b>' + escapeHtml(t.name) + '</b> (+' + formatScore(xp) + ')', 'kill');
        Particles.text(t.x, t.y, '+' + formatScore(xp), '#ffffff');
      }
    }

    if (t.isBot) {
      this.respawnQueue.push({ t: rand(CONFIG.BOT_RESPAWN_MIN, CONFIG.BOT_RESPAWN_MAX), name: t.name, color: t.color });
    }

    if (t === this.player) {
      let killerText = 'Танк уничтожен';
      if (killer && killer.kind === 'tank') {
        killerText = 'Вас уничтожил: <b>' + escapeHtml(killer.name) + '</b> (' + killer.cls.name + ', ур. ' + killer.level + ')';
      } else if (killer && killer.kind === 'shape') {
        killerText = 'Вас уничтожил: <b>' + killer.def.name + '</b>';
      }
      this.state = 'dead';
      this.deathTimer = 1.3;
      this.deathInfo = {
        score: t.score, level: t.level, className: t.cls.name,
        time: this.time - t.spawnTime, kills: t.kills, killer: killerText,
      };
      this.spectate = killer && killer.kind === 'tank' ? killer : null;
      this.spectateT = 15;
    }
  },

  // ---------- Появление полигонов и ботов ----------
  spawnStep(dt) {
    if (this.alphaCooldown > 0) this.alphaCooldown -= dt;
    this.shapeSpawnAcc = Math.min(this.shapeSpawnAcc + dt * CONFIG.SHAPE_SPAWN_PER_SEC, 10);
    while (this.shapeSpawnAcc >= 1) {
      // Создаём тип с наибольшим относительным дефицитом
      let bestType = null, bestDef = 0;
      for (const type in CONFIG.SHAPE_LIMITS) {
        if (type === 'alpha' && this.alphaCooldown > 0) continue;
        const lim = CONFIG.SHAPE_LIMITS[type];
        const deficit = (lim - this.shapeCounts[type]) / lim;
        if (deficit > bestDef) { bestDef = deficit; bestType = type; }
      }
      if (!bestType) break;
      this.spawnShape(bestType, false);
      this.shapeSpawnAcc -= 1;
    }

    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const r = this.respawnQueue[i];
      r.t -= dt;
      if (r.t <= 0) {
        this.respawnQueue.splice(i, 1);
        this.spawnBot(r.name, r.color);
      }
    }
  },

  updateDying(dt) {
    const L = this.dying;
    for (let i = L.length - 1; i >= 0; i--) {
      const e = L[i];
      e.deathT += dt;
      e.px = e.x; e.py = e.y;
      e.x += e.vx * dt * 0.5;
      e.y += e.vy * dt * 0.5;
      if (e.deathT >= CONFIG.DEATH_ANIM) { L[i] = L[L.length - 1]; L.pop(); }
    }
  },

  // ---------- Камера ----------
  interpolate(alpha) {
    const ip = (e) => { e.rx = e.px + (e.x - e.px) * alpha; e.ry = e.py + (e.y - e.py) * alpha; };
    for (const s of this.shapes) ip(s);
    for (const b of this.bullets) ip(b);
    for (const t of this.tanks) ip(t);
    for (const d of this.dying) ip(d);
  },

  updateCamera(frameDt) {
    let focus = null, fov = 1.15, speed = 10;
    if (this.player && (this.state === 'playing' || this.deathTimer > 0)) {
      focus = this.player;
      fov = this.player.viewFov;
    } else {
      // В меню и после смерти — наблюдаем за одним из ботов
      this.spectateT -= frameDt;
      if (!this.spectate || this.spectate.dead || this.spectateT <= 0) {
        let best = null;
        for (const t of this.tanks) if (!t.dead && t.isBot && (!best || t.score > best.score)) best = t;
        this.spectate = best;
        this.spectateT = 12;
      }
      focus = this.spectate;
      speed = 2.5;
    }
    const cam = this.camera;
    if (focus) {
      const k = smoothFactor(speed, frameDt);
      cam.x += (focus.rx - cam.x) * k;
      cam.y += (focus.ry - cam.y) * k;
    }
    const target = Math.max(this.w, this.h * 16 / 9) / (CONFIG.BASE_VIEW * fov);
    cam.zoom += (target - cam.zoom) * smoothFactor(3, frameDt);
  },

  screenToWorld(sx, sy) {
    const cam = this.camera;
    return { x: (sx - this.w / 2) / cam.zoom + cam.x, y: (sy - this.h / 2) / cam.zoom + cam.y };
  },

  // ---------- Отрисовка ----------
  render(alpha) {
    const ctx = this.ctx, w = this.w, h = this.h, dpr = this.dpr;
    const cam = this.camera, z = cam.zoom;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.outside;
    ctx.fillRect(0, 0, w, h);

    const view = { l: cam.x - w / 2 / z, r: cam.x + w / 2 / z, t: cam.y - h / 2 / z, b: cam.y + h / 2 / z };
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (w / 2 - cam.x * z), dpr * (h / 2 - cam.y * z));
    this.drawArena(ctx, view);

    // Отбираем только видимые объекты
    const vis = (e, m) => e.rx + e.r + m > view.l && e.rx - e.r - m < view.r && e.ry + e.r + m > view.t && e.ry - e.r - m < view.b;
    const vShapes = [], vBullets = [], vTanks = [];
    for (const s of this.shapes) if (vis(s, 20)) vShapes.push(s);
    for (const b of this.bullets) if (vis(b, 10)) vBullets.push(b);
    for (const t of this.tanks) if (vis(t, t.r * 3.2)) vTanks.push(t);
    for (const d of this.dying) {
      if (!vis(d, 60)) continue;
      if (d.kind === 'shape') vShapes.push(d);
      else if (d.kind === 'bullet') vBullets.push(d);
      else vTanks.push(d);
    }

    // Тени полигонов одним путём, затем сами полигоны
    ctx.fillStyle = COLORS.shadow;
    ctx.beginPath();
    for (const s of vShapes) if (!s.dead) s.shadowPath(ctx);
    ctx.fill();
    ctx.lineJoin = 'round';
    for (const s of vShapes) s.draw(ctx);

    for (const b of vBullets) b.draw(ctx);

    ctx.fillStyle = COLORS.shadow;
    ctx.beginPath();
    for (const t of vTanks) if (!t.dead && t.opacity > 0.6) t.shadowPath(ctx);
    ctx.fill();
    for (const t of vTanks) t.draw(ctx, this.time);

    Particles.draw(ctx, view, alpha);

    // Надписи и полоски здоровья — в экранных координатах (не зависят от зума)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const toScreen = (x, y) => ({ x: (x - cam.x) * z + w / 2, y: (y - cam.y) * z + h / 2 });
    for (const s of vShapes) {
      if (s.dead || s.hpShowT <= 0 || s.hp >= s.maxHp) continue;
      const p = toScreen(s.rx, s.ry);
      const bw = Math.max(30, s.def.radius * 1.8 * z);
      ctx.globalAlpha = Math.min(1, s.hpShowT);
      drawHealthBar(ctx, p.x, p.y + s.def.radius * z + 8, bw, 5, s.hp / s.maxHp, COLORS.hpFill);
    }
    ctx.globalAlpha = 1;
    for (const t of vTanks) {
      if (t.dead) continue;
      const p = toScreen(t.rx, t.ry);
      this.drawTankOverlay(ctx, t, p.x, p.y, z);
    }
    Particles.drawTexts(ctx, toScreen);
  },

  drawArena(ctx, view) {
    const W = CONFIG.WORLD_SIZE;
    ctx.fillStyle = COLORS.arena;
    ctx.fillRect(0, 0, W, W);

    // Гнездо пятиугольников
    ctx.beginPath();
    ctx.arc(W / 2, W / 2, CONFIG.NEST_RADIUS, 0, TAU);
    ctx.fillStyle = COLORS.nest;
    ctx.fill();
    ctx.setLineDash([22, 16]);
    ctx.lineWidth = 4;
    ctx.strokeStyle = COLORS.nestBorder;
    ctx.stroke();
    ctx.setLineDash([]);

    // Сетка — только в пределах экрана
    const step = 40;
    const x0 = Math.floor(view.l / step) * step, y0 = Math.floor(view.t / step) * step;
    ctx.beginPath();
    for (let x = x0; x <= view.r; x += step) { ctx.moveTo(x, view.t); ctx.lineTo(x, view.b); }
    for (let y = y0; y <= view.b; y += step) { ctx.moveTo(view.l, y); ctx.lineTo(view.r, y); }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = COLORS.grid;
    ctx.stroke();

    // Граница арены
    ctx.lineWidth = 6;
    ctx.strokeStyle = COLORS.arenaBorder;
    ctx.strokeRect(0, 0, W, W);
  },

  // Ник, уровень и полоска здоровья над танком
  drawTankOverlay(ctx, t, sx, sy, z) {
    const op = t.isPlayer ? 1 : t.opacity;
    if (op < 0.1) return;
    ctx.globalAlpha = op;
    const rs = t.r * z;
    const frac = t.hp / t.maxHp;
    const bw = Math.max(40, rs * 2.2), bh = 6;
    let y = sy - rs - 12 - bh;
    if (!t.isPlayer || frac < 0.999) {
      drawHealthBar(ctx, sx, y, bw, bh, frac, frac < 0.35 ? COLORS.hpLow : COLORS.hpFill);
      y -= 6;
    }
    if (!t.isPlayer) {
      const font = '"Trebuchet MS", "Segoe UI", sans-serif';
      ctx.textBaseline = 'bottom';
      ctx.lineJoin = 'round';
      ctx.font = '700 15px ' + font;
      const nameW = ctx.measureText(t.name).width;
      ctx.font = '700 11px ' + font;
      const lvText = 'ур.' + t.level;
      const lvW = ctx.measureText(lvText).width;
      const left = sx - (nameW + 5 + lvW) / 2;
      ctx.textAlign = 'left';
      ctx.font = '700 15px ' + font;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(30, 40, 50, 0.75)';
      ctx.strokeText(t.name, left, y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(t.name, left, y);
      ctx.font = '700 11px ' + font;
      ctx.lineWidth = 3;
      ctx.strokeText(lvText, left + nameW + 5, y - 1);
      ctx.fillStyle = '#ffe9a3';
      ctx.fillText(lvText, left + nameW + 5, y - 1);
    }
    ctx.globalAlpha = 1;
  },
};

window.addEventListener('load', () => Game.init());
