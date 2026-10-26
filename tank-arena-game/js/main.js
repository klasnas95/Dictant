// Точка входа и игровой цикл: создание мира, обновление, столкновения, смерть и отрисовка.

const PLAYER_COLOR = '#3fa9f5';

let player = null;        // танк игрока; null, пока игра не начата
let state = 'menu';       // 'menu' — стартовый экран, 'playing' — игра, 'dead' — экран смерти
let lastTime = performance.now();
let fpsCount = 0;
let fpsTimer = 0;
let fps = 0;

// Пересоздать мир: полигоны и боты (игрок добавляется отдельно)
function resetWorld() {
  bullets.length = 0;
  particles.length = 0;
  fillShapes();
  bots.length = 0;
  for (let i = 0; i < CONFIG.BOT_COUNT; i++) bots.push(createBot(bots));
  player = null;
}

// Все танки арены: боты и игрок
function getTanks() {
  return player ? bots.concat(player) : bots.slice();
}

// Начать новую игру с указанным ником
function startGame(name) {
  resetWorld();
  player = new Tank(name, PLAYER_COLOR, false);
  const p = randomSpawnPoint(bots);
  player.spawn(p.x, p.y);
  state = 'playing';
  hideStartScreen();
  hideDeathScreen();
  setHudVisible(true);
}

// Гибель танка: взрыв, награда убийце, возрождение бота или экран смерти игрока
function killTank(t) {
  t.alive = false;
  spawnParticles(t.x, t.y, t.color, 40, 380);

  const killer = t.lastDamager;
  if (killer && killer !== t) killer.addXp(40 + t.level * 15 + t.score * 0.1);

  if (t.isBot) {
    t.respawnTimer = CONFIG.BOT_RESPAWN;
  } else {
    state = 'dead';
    showDeathScreen(t.score, t.level, (performance.now() - t.spawnedAt) / 1000);
  }
}

// Таблица лидеров: живые танки по убыванию очков
function leaderboard() {
  return getTanks().filter((t) => t.alive).sort((a, b) => b.score - a.score);
}

// За кем следит камера: за игроком, а после смерти — за живым ботом
function focusTarget() {
  if (player && player.alive) return player;
  const bot = bots.find((b) => b.alive);
  return bot || { x: CONFIG.WORLD_SIZE / 2, y: CONFIG.WORLD_SIZE / 2, level: 1 };
}

// Обновление мира на шаг dt (секунды)
function update(dt) {
  const tanks = getTanks();

  if (state === 'playing' && player) updatePlayer(player, dt);
  updateBots(dt, tanks);

  for (const t of tanks) t.tick(dt);

  for (let i = 0; i < tanks.length; i++) {
    for (let j = i + 1; j < tanks.length; j++) collideTanks(tanks[i], tanks[j], dt);
  }

  for (const t of tanks) {
    if (!t.alive) continue;
    t.clampToArena();
    collideTankWithShapes(t, dt);
  }

  for (const s of shapes) s.update(dt);
  updateBullets(dt, tanks);

  for (const t of tanks) {
    if (t.alive && t.hp <= 0) killTank(t);
  }

  cleanupShapes();
  updateShapeSpawns(dt);
  updateParticles(dt);
}

// Главный цикл: deltaTime ограничен, чтобы не было «скачков» при паузах вкладки
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  updateCamera(dt, focusTarget());
  update(dt);
  render(getTanks(), player);

  fpsCount++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    fps = Math.round(fpsCount / fpsTimer);
    fpsCount = 0;
    fpsTimer = 0;
  }
  if (state === 'playing' && player) {
    updateHud(player, leaderboard(), dt, fps);
  }

  requestAnimationFrame(frame);
}

// Нажатие цифр 1–8 или клик по панели статов: вложить очко
function spendStat(index) {
  if (state === 'playing' && player) player.spendPoint(index);
}

function init() {
  resizeCanvas();
  resetWorld();
  buildStatPanel(spendStat);
  initInput(canvas, { onStat: spendStat });
  bindMenus(startGame);
  showStartScreen();
  requestAnimationFrame(frame);
}

init();
