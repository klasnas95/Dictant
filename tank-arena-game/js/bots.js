// Боты: простой ИИ — блуждают по арене, стреляют в ближайшую цель и избегают столкновений.

const BOT_NAMES = [
  'Shadow', 'Rex', 'Nova', 'Viper', 'Orbit', 'Blaze', 'Echo', 'Pixel', 'Raven',
  'Comet', 'Titan', 'Luna', 'Ghost', 'Falcon', 'Atlas', 'Mira', 'Zephyr', 'Onyx',
];
const BOT_COLORS = ['#ff8a65', '#81c784', '#ba68c8', '#ffd54f', '#4db6ac', '#f06292', '#7986cb', '#a1887f'];

const bots = [];

// Имя, которого сейчас нет у живых ботов, чтобы в таблице лидеров не повторялись ники
function pickBotName() {
  const used = new Set(bots.filter((b) => b.alive).map((b) => b.name));
  const free = BOT_NAMES.filter((n) => !used.has(n));
  const pool = free.length ? free : BOT_NAMES;
  return pool[randInt(0, pool.length - 1)];
}

// Создать бота со случайным уровнем (1–25) и случайными улучшениями
function createBot(others) {
  const bot = new Tank(
    pickBotName(),
    BOT_COLORS[randInt(0, BOT_COLORS.length - 1)],
    true,
  );
  const p = randomSpawnPoint(others);
  bot.spawn(p.x, p.y);

  // Разный стартовый уровень, чтобы боты отличались по силе
  const targetLevel = randInt(1, 25);
  while (bot.level < targetLevel) {
    bot.addXp(xpToNext(bot.level) - bot.xp);
    bot.autoUpgrade();
  }

  bot.ai = {
    wanderX: p.x,
    wanderY: p.y,
    wanderTimer: 0,
    strafe: Math.random() < 0.5 ? 1 : -1, // направление кружения в бою
    strafeTimer: 0,
  };
  return bot;
}

// Обновить всех ботов: возрождение погибших и работа ИИ живых
function updateBots(dt, tanks) {
  for (let i = 0; i < bots.length; i++) {
    const bot = bots[i];
    if (!bot.alive) {
      bot.respawnTimer -= dt;
      if (bot.respawnTimer <= 0) bots[i] = createBot(tanks);
      continue;
    }
    bot.autoUpgrade();
    updateBotAI(bot, dt, tanks);
  }
}

// Ближайший живой полигон в радиусе r от точки from (или null)
function nearestShape(from, r) {
  let best = null;
  let bestDist = r;
  for (const s of shapes) {
    if (s.dead) continue;
    const d = dist(from.x, from.y, s.x, s.y);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

// ИИ одного бота: выбор цели, движение, избегание столкновений и стрельба
function updateBotAI(bot, dt, tanks) {
  const ai = bot.ai;
  const range = bot.bulletSpeed * CONFIG.BULLET_LIFE;
  const W = CONFIG.WORLD_SIZE;
  let moveX = 0;
  let moveY = 0;
  let shoot = false;

  // 1. Ближайший живой враг в зоне видимости
  let target = null;
  let best = CONFIG.BOT_SIGHT;
  for (const t of tanks) {
    if (t === bot || !t.alive) continue;
    const d = dist(bot.x, bot.y, t.x, t.y);
    if (d < best) {
      best = d;
      target = t;
    }
  }

  if (target) {
    // Целимся в танк. Держим дистанцию: подходим издалека, отходим вплотную, кружим на середине
    const aim = Math.atan2(target.y - bot.y, target.x - bot.x);
    const cos = Math.cos(aim);
    const sin = Math.sin(aim);
    bot.aim = aim;
    shoot = best < range * 0.9;

    ai.strafeTimer -= dt;
    if (ai.strafeTimer <= 0) {
      ai.strafe = -ai.strafe;
      ai.strafeTimer = rand(1.5, 3);
    }

    if (best > 420) {
      moveX = cos;
      moveY = sin;
    } else if (best < 220) {
      moveX = -cos;
      moveY = -sin;
    } else {
      moveX = -sin * ai.strafe;
      moveY = cos * ai.strafe;
    }
  } else {
    // 2. Врагов нет: блуждаем; если рядом есть полигон — стреляем в него ради опыта
    ai.wanderTimer -= dt;
    if (ai.wanderTimer <= 0 || dist(bot.x, bot.y, ai.wanderX, ai.wanderY) < 80) {
      ai.wanderX = rand(400, W - 400);
      ai.wanderY = rand(400, W - 400);
      ai.wanderTimer = rand(3, 6);
    }
    moveX = ai.wanderX - bot.x;
    moveY = ai.wanderY - bot.y;
    const len = Math.hypot(moveX, moveY) || 1;
    moveX /= len;
    moveY /= len;

    const s = nearestShape(bot, 600);
    if (s) {
      bot.aim = Math.atan2(s.y - bot.y, s.x - bot.x);
      shoot = dist(bot.x, bot.y, s.x, s.y) < range * 0.9;
    } else {
      bot.aim = Math.atan2(moveY, moveX);
    }
  }

  // 3. Не подходим к границе арены: у края подталкиваем к центру
  const m = 250;
  if (bot.x < m) moveX += ((m - bot.x) / m) * 2;
  if (bot.x > W - m) moveX -= ((bot.x - (W - m)) / m) * 2;
  if (bot.y < m) moveY += ((m - bot.y) / m) * 2;
  if (bot.y > W - m) moveY -= ((bot.y - (W - m)) / m) * 2;

  // 4. Не врезаемся в другие танки: отталкиваемся от ближних
  for (const t of tanks) {
    if (t === bot || !t.alive) continue;
    const d = dist(bot.x, bot.y, t.x, t.y);
    if (d < 130 && d > 0) {
      const k = ((130 - d) / 130) * 2;
      moveX += ((bot.x - t.x) / d) * k;
      moveY += ((bot.y - t.y) / d) * k;
    }
  }

  // Итоговое направление движения нормализуем; без направления танк просто тормозит
  const len = Math.hypot(moveX, moveY);
  const k = len > 0.001 ? 1 / len : 0;
  bot.move(dt, moveX * k, moveY * k);

  if (shoot) bot.fire();
}
