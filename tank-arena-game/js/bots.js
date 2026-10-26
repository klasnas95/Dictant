// ============================================================
// Боты: простой ИИ. Блуждают, охотятся на танки и полигоны,
// держат дистанцию, обходят стены и других танков, сбегают при низком здоровье.
// ============================================================

class Bot extends Tank {
  constructor(name, color) {
    super(name, color);
    this.respawnTimer = 0;
    this.wanderX = 0;
    this.wanderY = 0;
    this.wanderTimer = 0;
    this.strafe = Math.random() < 0.5 ? -1 : 1;   // направление обхода цели
    this.strafeTimer = 0;
    this.aimNoise = 0;                             // небольшая неточность прицела
    this.noiseTimer = 0;
  }

  // Появление заново с уровнем около уровня игрока
  respawn(baseLevel) {
    const spread = CONFIG.BOT_LEVEL_SPREAD;
    const lo = Math.max(1, baseLevel - spread);
    const hi = Math.min(CONFIG.MAX_LEVEL, baseLevel + spread);
    this.setLevel(randInt(lo, hi));
    this.autoUpgrade();
    this.spawn();
    this.pickWander();
  }

  die() {
    super.die();
    this.respawnTimer = rand(CONFIG.BOT_RESPAWN_MIN, CONFIG.BOT_RESPAWN_MAX);
  }

  // Случайная точка, куда бот пойдёт блуждать
  pickWander() {
    const m = 300;
    this.wanderX = rand(m, CONFIG.WORLD_SIZE - m);
    this.wanderY = rand(m, CONFIG.WORLD_SIZE - m);
    this.wanderTimer = rand(4, 8);
  }

  // Бот сам распределяет очки улучшений и выбирает эволюции
  autoUpgrade() {
    while (this.points > 0) {
      const open = STATS.map((_, i) => i).filter((i) => this.stats[i] < CONFIG.MAX_STAT_POINTS);
      if (!open.length) break;
      this.invest(pick(open));
    }
    while (this.pendingEvolutions > 0 && this.evolutionOptions().length) {
      this.evolve(pick(this.evolutionOptions()));
    }
  }

  // Один шаг бота: ждать респавна или действовать
  tick(dt, tanks, shapes, baseLevel) {
    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn(baseLevel);
      return;
    }
    this.autoUpgrade();
    this.think(dt, tanks, shapes);
  }

  // Решение: куда идти, куда целиться и стрелять ли
  think(dt, tanks, shapes) {
    const SIGHT = 900;          // радиус обзора
    const W = CONFIG.WORLD_SIZE;

    // Ближайший живой враг в поле зрения
    let enemy = null;
    let enemyD = SIGHT;
    for (const t of tanks) {
      if (t === this || !t.alive) continue;
      const d = dist(this.x, this.y, t.x, t.y);
      if (d < enemyD) { enemyD = d; enemy = t; }
    }
    // Ближайший полигон — для фарма опыта
    let prey = null;
    let preyD = 500;
    for (const s of shapes) {
      if (!s.alive) continue;
      const d = dist(this.x, this.y, s.x, s.y);
      if (d < preyD) { preyD = d; prey = s; }
    }

    let mx = 0;                 // желаемое направление движения
    let my = 0;
    let aimX = this.x + Math.cos(this.aim) * 100;
    let aimY = this.y + Math.sin(this.aim) * 100;
    let shoot = false;

    this.wanderTimer -= dt;
    if (enemy && this.hp < this.maxHp * 0.35) {
      // Мало здоровья: отступаем от врага и отстреливаемся
      mx = this.x - enemy.x;
      my = this.y - enemy.y;
      aimX = enemy.x;
      aimY = enemy.y;
      shoot = enemyD < 600;
    } else if (enemy) {
      // Держим дистанцию около 380 и обходим цель по кругу
      const ed = Math.max(enemyD, 1);
      const ux = (enemy.x - this.x) / ed;
      const uy = (enemy.y - this.y) / ed;
      const radial = clamp((enemyD - 380) / 150, -1, 1);
      mx = ux * radial - uy * this.strafe;
      my = uy * radial + ux * this.strafe;
      aimX = enemy.x;
      aimY = enemy.y;
      shoot = enemyD < 750;
    } else if (prey) {
      // Фарм: едем к полигону и бьём по нему
      mx = prey.x - this.x;
      my = prey.y - this.y;
      aimX = prey.x;
      aimY = prey.y;
      shoot = preyD < 400;
    } else {
      // Блуждание к случайной точке
      if (this.wanderTimer <= 0 || dist(this.x, this.y, this.wanderX, this.wanderY) < 80) {
        this.pickWander();
      }
      mx = this.wanderX - this.x;
      my = this.wanderY - this.y;
      aimX = this.wanderX;
      aimY = this.wanderY;
    }

    // Обход стен: у края арены тянем к центру
    const edge = 260;
    if (this.x < edge) mx += ((edge - this.x) / edge) * 2;
    if (this.x > W - edge) mx -= ((this.x - (W - edge)) / edge) * 2;
    if (this.y < edge) my += ((edge - this.y) / edge) * 2;
    if (this.y > W - edge) my -= ((this.y - (W - edge)) / edge) * 2;

    // Не сталкиваться с другими танками
    for (const t of tanks) {
      if (t === this || !t.alive) continue;
      const d = dist(this.x, this.y, t.x, t.y);
      if (d > 0 && d < 90) {
        const push = ((90 - d) / 90) * 1.5;
        mx += ((this.x - t.x) / d) * push;
        my += ((this.y - t.y) / d) * push;
      }
    }

    const len = Math.hypot(mx, my);
    this.moveX = len ? mx / len : 0;
    this.moveY = len ? my / len : 0;

    // Прицеливание с небольшим разбросом
    this.noiseTimer -= dt;
    if (this.noiseTimer <= 0) {
      this.aimNoise = rand(-0.12, 0.12);
      this.noiseTimer = rand(0.5, 1.2);
    }
    this.turnAim(Math.atan2(aimY - this.y, aimX - this.x) + this.aimNoise, dt, 8);
    this.shooting = shoot;

    // Иногда меняем направление обхода цели
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafe = Math.random() < 0.5 ? -1 : 1;
      this.strafeTimer = rand(1.5, 3);
    }
  }
}
