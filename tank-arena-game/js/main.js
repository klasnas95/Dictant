// ============================================================
// Главный файл: игровой цикл, мир, столкновения, камера и отрисовка
// ============================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const COLORS = {
  background: '#eef1f7',   // фон за пределами арены
  arena: '#f8fafd',        // поле арены
  grid: '#e2e8f2',         // линии сетки
};

let W = 0;                 // ширина окна в CSS-пикселях
let H = 0;
let dpr = 1;

// Камера: центр экрана смотрит на (x, y), zoom — масштаб
const camera = { x: CONFIG.WORLD_SIZE / 2, y: CONFIG.WORLD_SIZE / 2, zoom: 1 };

const game = {
  state: 'menu',           // 'menu' — старт, 'playing' — бой, 'dead' — экран смерти
  nick: 'Игрок',
  player: null,
  bots: [],
  shapes: [],
  bullets: [],
  particles: [],
  leaderboardTimer: 0,
};

// Все танки арены: боты и игрок (если он есть)
function allTanks() {
  return game.player ? game.bots.concat([game.player]) : game.bots;
}

function livingTanks() {
  return allTanks().filter((t) => t.alive);
}

// Уровень, от которого боты берут свой уровень при появлении
function baseLevel() {
  return game.player ? game.player.level : 1;
}

function makeBot() {
  const bot = new Bot(pick(BOT_NAMES), pick(BOT_COLORS));
  bot.respawn(baseLevel());
  return bot;
}

function createWorld() {
  game.shapes = [];
  for (const [type, count] of Object.entries(CONFIG.SHAPE_COUNTS)) {
    for (let i = 0; i < count; i++) game.shapes.push(new Shape(type));
  }
  game.bots = Array.from({ length: randInt(CONFIG.BOT_MIN, CONFIG.BOT_MAX) }, makeBot);
}

// ---------- Жизненный цикл игрока ----------

function startGame(nick) {
  game.nick = nick;
  game.player = new Player(nick);
  game.state = 'playing';
  ui.hideStart();
  ui.hideDeath();
  if (document.activeElement) document.activeElement.blur();
}

function onPlayerDied() {
  game.state = 'dead';
  ui.showDeath(game.player);
}

function investStat(index) {
  if (game.state !== 'playing' || !game.player) return;
  game.player.invest(index);
}

function evolvePlayer(id) {
  if (game.player) game.player.evolve(id);
}

// ---------- Уничтожение ----------

// Полигон разрушен: опыт тому, кто последним в него попал
function onShapeDestroyed(s) {
  if (s.lastHitBy instanceof Tank) s.lastHitBy.addXp(s.def.xp);
  spawnBurst(s.x, s.y, s.def.fill, 14, 220);
  s.destroy();
}

// Танк уничтожен: опыт и счётчик убийств тому, кто нанёс последний удар
function onTankDestroyed(t) {
  t.die();
  const killer = t.lastHitBy;
  const recent = (performance.now() - t.lastHitAt) / 1000 < CONFIG.KILL_CREDIT_TIME;
  if (killer && killer !== t && recent) {
    killer.kills++;
    killer.addXp(CONFIG.KILL_XP_BASE + t.level * CONFIG.KILL_XP_PER_LEVEL);
  }
  spawnBurst(t.x, t.y, t.color, 40, 380);
  if (t.isPlayer) onPlayerDied();
}

// ---------- Частицы ----------

function spawnBurst(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = rand(0.3, 1) * speed;
    const life = rand(0.4, 0.9);
    game.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life,
      total: life,
      size: rand(3, 7),
      color,
    });
  }
}

function updateParticles(dt) {
  for (const p of game.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const f = Math.exp(-dt * 4);
    p.vx *= f;
    p.vy *= f;
    p.life -= dt;
  }
  game.particles = game.particles.filter((p) => p.life > 0);
}

// ---------- Столкновения ----------

// Пуля попадает в танк или полигон; пробивает до pierce целей
function resolveBulletHits(alive) {
  for (const b of game.bullets) {
    if (b.dead) continue;
    for (const t of alive) {
      if (!t.alive || t === b.owner || b.hit.has(t)) continue;
      if (dist(b.x, b.y, t.x, t.y) < b.radius + CONFIG.TANK_RADIUS) {
        t.damage(b.dmg, b.owner);
        b.hit.add(t);
        if (--b.pierce <= 0) { b.dead = true; break; }
      }
    }
    if (b.dead) continue;
    for (const s of game.shapes) {
      if (!s.alive || b.hit.has(s)) continue;
      if (dist(b.x, b.y, s.x, s.y) < b.radius + s.def.radius) {
        s.damage(b.dmg, b.owner);
        b.hit.add(s);
        if (--b.pierce <= 0) { b.dead = true; break; }
      }
    }
  }
}

// Танки давят друг друга и наносят таранный урон
function resolveTankCollisions(list, dt) {
  const minD = CONFIG.TANK_RADIUS * 2;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (!a.alive || !b.alive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= minD || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      const overlap = (minD - d) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      a.damage(CONFIG.BASE_BODY_DAMAGE * b.bodyMul * dt, b);
      b.damage(CONFIG.BASE_BODY_DAMAGE * a.bodyMul * dt, a);
    }
  }
}

// ---------- Обновление мира ----------

function update(dt) {
  const player = game.player;
  if (game.state === 'playing' && player && player.alive) {
    player.applyInput(dt, screenToWorld);
  }

  // Решения ботов и движение всех живых танков
  const tanks = allTanks();
  for (const bot of game.bots) bot.tick(dt, tanks, game.shapes, baseLevel());
  const alive = tanks.filter((t) => t.alive);
  for (const t of alive) t.update(dt, game.bullets);

  for (const b of game.bullets) b.update(dt);
  for (const s of game.shapes) s.update(dt);

  // Столкновения
  resolveBulletHits(alive);
  resolveTankCollisions(alive, dt);
  for (const s of game.shapes) {
    for (const t of alive) s.collideWithTank(t, dt);
  }

  // Разрушения: полигоны и танки с hp <= 0
  for (const s of game.shapes) {
    if (s.alive && s.hp <= 0) onShapeDestroyed(s);
  }
  for (const t of alive) {
    if (t.alive && t.hp <= 0) onTankDestroyed(t);
  }

  game.bullets = game.bullets.filter((b) => !b.dead);
  updateParticles(dt);
  updateCamera(dt);
  updateHud(dt);
}

// Камера плавно следует за игроком и отдаляется с ростом уровня
function updateCamera(dt) {
  const p = game.player;
  const tx = p ? p.x : CONFIG.WORLD_SIZE / 2;
  const ty = p ? p.y : CONFIG.WORLD_SIZE / 2;
  const k = Math.min(1, dt * 6);
  camera.x += (tx - camera.x) * k;
  camera.y += (ty - camera.y) * k;

  const level = p ? p.level : 1;
  const targetZoom = clamp(1 - (level - 1) * 0.006, 0.72, 1);
  camera.zoom += (targetZoom - camera.zoom) * Math.min(1, dt * 2);
}

function hudVisible() {
  return game.state === 'playing' && !!game.player;
}

function updateHud(dt) {
  const visible = hudVisible();
  const p = visible ? game.player : null;
  ui.setHudVisible(visible);
  ui.updateEvolution(p);
  if (!p) return;

  ui.updateStats(p);
  ui.updateXp(p);
  ui.updateToggles(input);

  game.leaderboardTimer -= dt;
  if (game.leaderboardTimer <= 0) {
    game.leaderboardTimer = 0.25;
    ui.updateLeaderboard(livingTanks(), p);
  }
}

// Экран -> мир: координаты курсора с учётом камеры и масштаба
function screenToWorld(sx, sy) {
  return {
    x: (sx - W / 2) / camera.zoom + camera.x,
    y: (sy - H / 2) / camera.zoom + camera.y,
  };
}

// ---------- Отрисовка ----------

function drawArena() {
  const S = CONFIG.WORLD_SIZE;
  ctx.fillStyle = COLORS.arena;
  ctx.fillRect(0, 0, S, S);

  // Сетка только в видимой части арены
  const step = CONFIG.GRID_STEP;
  const halfW = W / 2 / camera.zoom;
  const halfH = H / 2 / camera.zoom;
  const x0 = Math.max(0, Math.floor((camera.x - halfW) / step) * step);
  const x1 = Math.min(S, camera.x + halfW);
  const y0 = Math.max(0, Math.floor((camera.y - halfH) / step) * step);
  const y1 = Math.min(S, camera.y + halfH);
  ctx.beginPath();
  for (let x = x0; x <= x1; x += step) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
  }
  for (let y = y0; y <= y1; y += step) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.grid;
  ctx.stroke();
}

function drawParticles() {
  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.total);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function render() {
  // Фон экрана
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Мировые координаты: центр экрана — камера, масштаб — zoom
  const z = camera.zoom * dpr;
  ctx.setTransform(
    z, 0, 0, z,
    (W / 2 - camera.x * camera.zoom) * dpr,
    (H / 2 - camera.y * camera.zoom) * dpr,
  );

  drawArena();
  for (const s of game.shapes) s.draw(ctx);
  drawParticles();
  for (const b of game.bullets) b.draw(ctx);

  const tanks = allTanks();
  for (const t of tanks) t.draw(ctx);
  for (const t of tanks) t.drawLabel(ctx);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (hudVisible()) ui.drawMinimap(livingTanks(), game.player);
}

// ---------- Запуск ----------

function resize() {
  dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}

let lastTime = performance.now();
function frame(now) {
  // dt ограничиваем, чтобы после паузы вкладки мир не «прыгал»
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
createWorld();

ui.onStart = startGame;
ui.onRestart = () => startGame(game.nick);
ui.onInvest = investStat;
ui.onEvolve = evolvePlayer;
ui.init();
bindInput(canvas, investStat);
ui.showStart();

requestAnimationFrame(frame);
