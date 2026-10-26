// ============================================================
//  main.js — главный класс игры и игровой цикл (requestAnimationFrame)
// ============================================================

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.time = 0;
    this.state = 'menu';   // menu -> playing -> dying -> dead -> playing ...
    this.dyingTimer = 0;
    this.player = null;
    this.playerName = 'Игрок';
    this.tanks = [];       // живые танки (игрок + боты), обновляется каждый кадр
    this.deathInfo = null;

    this.camera = new Camera();
    this.particles = new ParticleSystem();
    this.bullets = new BulletManager();
    this.shapes = new ShapeManager(this);
    this.bots = new BotManager(this);
    this.collisions = new CollisionSystem();

    Input.init(this.canvas);
    this.ui = new UI(this);

    window.addEventListener('resize', () => this.resize());
    this.resize();

    // Мир живёт уже на стартовом экране: полигоны и боты на заднем плане
    this.shapes.populate();
    this.bots.populate();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.resize(w, h);
  }

  // ---------------- Управление жизненным циклом ----------------

  startGame(name) {
    this.playerName = name;
    this.spawnPlayer();
    this.state = 'playing';
  }

  respawn() {
    if (this.state !== 'dead') return;
    this.ui.hideDeath();
    this.spawnPlayer();
    this.state = 'playing';
  }

  spawnPlayer() {
    const pos = this.findSpawnPoint(900);
    this.player = new Player(this, this.playerName, pos.x, pos.y);
    this.rebuildTanks();
    this.camera.snapTo(pos.x, pos.y, this.player.fov);
    this.ui.statKey = '';
    this.ui.evolveKey = '';
  }

  // Случайная точка, подальше от других танков
  findSpawnPoint(minDist) {
    const W = CONFIG.WORLD_SIZE, m = 300;
    for (let i = 0; i < 30; i++) {
      const x = rand(m, W - m), y = rand(m, W - m);
      let ok = true;
      for (const t of this.tanks) {
        if (!t.dead && Math.hypot(t.x - x, t.y - y) < minDist) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    return { x: rand(m, W - m), y: rand(m, W - m) };
  }

  pickBotName() {
    const used = new Set(this.bots.list.map((b) => b.name));
    const free = BOT_NAMES.filter((n) => !used.has(n));
    return pick(free.length ? free : BOT_NAMES);
  }

  rebuildTanks() {
    const list = this.tanks;
    list.length = 0;
    if (this.player && !this.player.dead) list.push(this.player);
    for (const b of this.bots.list) if (!b.dead) list.push(b);
  }

  investStat(i) {
    const p = this.player;
    if (this.state !== 'playing' || !p || p.dead) return;
    p.invest(i);
  }

  chooseClass(id) {
    const p = this.player;
    if (!p || p.dead) return;
    if (p.evolve(id)) this.ui.toast(`Класс: ${CLASSES[id].name}`);
  }

  // ---------------- События ----------------

  onShapeKilled(shape, owner) {
    const d = shape.def;
    this.particles.burstShape(shape.x, shape.y, d.fill, d.stroke, d.drawR, shape.type === 'alpha' ? 24 : 9);
    if (owner && owner.kind === 'tank' && !owner.dead) {
      owner.addScore(d.xp);
      if (owner === this.player) {
        this.particles.floatText(shape.x, shape.y - shape.def.drawR, `+${d.xp}`, '#ffffff');
      }
    }
  }

  onTankKilled(victim, attacker) {
    this.particles.burstTank(victim.x, victim.y, victim.color, victim.stroke, victim.r);
    const killer = attacker && attacker.kind === 'tank' ? attacker : null;
    if (killer && killer !== victim && !killer.dead) {
      const reward = clamp(victim.score * CONFIG.KILL_REWARD_SHARE, 40, CONFIG.KILL_REWARD_MAX);
      killer.addScore(reward);
      killer.kills++;
      if (killer === this.player) this.particles.floatText(victim.x, victim.y, `+${Math.floor(reward)}`, '#ffffff');
    }

    if (victim === this.player) {
      this.deathInfo = {
        killer: attacker ? attacker.name : '',
        score: victim.score,
        level: victim.level,
        className: victim.cls.name,
        time: this.time - victim.bornAt,
        kills: victim.kills,
      };
      this.state = 'dying';
      this.dyingTimer = 1.1;
    } else {
      this.bots.onBotDied();
    }
  }

  // ---------------- Обновление ----------------

  handlePresses() {
    const presses = Input.takePresses();
    const p = this.player;
    if (this.state !== 'playing' || !p || p.dead) return;
    for (const code of presses) {
      if (code === 'KeyE') {
        p.autoFire = !p.autoFire;
        this.ui.toast(`Автострельба: ${p.autoFire ? 'ВКЛ' : 'ВЫКЛ'}`);
      } else if (code === 'KeyC') {
        p.autoSpin = !p.autoSpin;
        this.ui.toast(`Автоповорот: ${p.autoSpin ? 'ВКЛ' : 'ВЫКЛ'}`);
      } else {
        const m = /^(?:Digit|Numpad)([1-8])$/.exec(code);
        if (m) this.investStat(Number(m[1]) - 1);
      }
    }
  }

  update(dt) {
    this.time += dt;
    this.rebuildTanks();
    this.handlePresses();

    const p = this.player;
    const playerAlive = this.state === 'playing' && p && !p.dead;
    if (playerAlive) p.control(dt, Input, this.camera);

    this.shapes.update(dt);
    this.bots.update(dt);
    if (p && !p.dead) p.update(dt);
    this.bullets.update(dt);

    this.rebuildTanks();
    this.collisions.update(dt, this);
    this.particles.update(dt);

    if (this.state === 'dying') {
      this.dyingTimer -= dt;
      if (this.dyingTimer <= 0) {
        this.state = 'dead';
        this.ui.showDeath(this.deathInfo);
      }
    }

    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const p = this.player;
    if (p && !p.dead) {
      this.camera.update(dt, p.x, p.y, p.fov);
    } else if (this.state === 'menu') {
      // На стартовом экране камера наблюдает за каким-нибудь ботом
      const bot = this.bots.list.find((b) => !b.dead);
      if (bot) this.camera.update(dt, bot.x, bot.y, 1);
    }
    // После смерти камера просто остаётся на месте
  }

  // ---------------- Отрисовка ----------------

  render() {
    const ctx = this.ctx, cam = this.camera;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#c3c9cf'; // область за пределами арены
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    cam.apply(ctx, this.dpr);
    this.drawBackground(ctx, cam);

    this.shapes.draw(ctx, cam);
    this.bullets.draw(ctx, cam);

    // Игрок рисуется поверх ботов
    for (const b of this.bots.list) if (!b.dead && cam.isVisible(b.x, b.y, b.r * 4)) b.draw(ctx, this.time);
    const p = this.player;
    if (p && !p.dead) p.draw(ctx, this.time);

    this.particles.draw(ctx, cam.scale);

    for (const b of this.bots.list) if (!b.dead && cam.isVisible(b.x, b.y, b.r * 4)) b.drawLabel(ctx);
    if (p && !p.dead) p.drawLabel(ctx);
  }

  drawBackground(ctx, cam) {
    const W = CONFIG.WORLD_SIZE, step = CONFIG.GRID_STEP;
    // Светлое поле арены
    ctx.fillStyle = '#eceff2';
    ctx.fillRect(0, 0, W, W);

    // «Гнездо» пятиугольников в центре
    ctx.fillStyle = 'rgba(118,141,252,0.07)';
    ctx.beginPath();
    ctx.arc(W / 2, W / 2, CONFIG.NEST_RADIUS, 0, TAU);
    ctx.fill();

    // Сетка рисуется только в видимой области
    const x0 = Math.max(0, cam.x - cam.w / 2 / cam.scale), x1 = Math.min(W, cam.x + cam.w / 2 / cam.scale);
    const y0 = Math.max(0, cam.y - cam.h / 2 / cam.scale), y1 = Math.min(W, cam.y + cam.h / 2 / cam.scale);
    ctx.beginPath();
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.lineWidth = 1.2 / cam.scale;
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.stroke();
  }

  // ---------------- Цикл ----------------

  step(dt) {
    // При просадках FPS делим кадр на подшаги, чтобы пули не «пролетали» сквозь цели
    const n = Math.max(1, Math.ceil(dt / (1 / 50)));
    for (let i = 0; i < n; i++) this.update(dt / n);
    this.ui.update(dt);
  }
}

const game = new Game();

let lastTime = performance.now();
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1); // защита от больших скачков (вкладка была неактивна)
  lastTime = now;
  game.step(dt);
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
