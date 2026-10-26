// Танк: характеристики, прокачка, классы, стрельба, физика и столкновения танков.

class Tank {
  constructor(name, color, isBot) {
    this.name = name;
    this.color = color;
    this.isBot = isBot;
    this.radius = CONFIG.TANK_RADIUS;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.aim = 0;                  // направление пушки, рад
    this.level = 1;
    this.xp = 0;                   // опыт внутри текущего уровня
    this.score = 0;                // всего накоплено опыта (очки для таблицы лидеров)
    this.unspent = 0;              // неиспользованные очки улучшений
    this.points = STATS.map(() => 0);
    this.classId = 'basic';
    this.pendingEvolution = false; // ждёт выбора класса
    this.reloadTimer = 0;
    this.recoilAnim = 0;           // анимация отката стволов (1 → 0)
    this.alive = true;
    this.lastDamager = null;       // кто нанёс последний урон — за него достаётся награда
    this.respawnTimer = 0;
    this.spawnedAt = performance.now();
    this.recalc();
    this.hp = this.maxHp;
  }

  get cls() {
    return CLASSES[this.classId];
  }

  // Пересчитать характеристики по вложенным очкам и текущему классу
  recalc() {
    const p = this.points;
    const c = this.cls;
    this.maxHp = CONFIG.BASE_MAX_HP * (1 + 0.2 * p[1]);
    this.regen = CONFIG.BASE_REGEN + 1.2 * p[0];
    this.ramDps = CONFIG.BASE_RAM_DPS * (1 + 0.25 * p[2]);
    this.bulletSpeed = CONFIG.BASE_BULLET_SPEED * (1 + 0.12 * p[3]) * c.speedMul;
    this.pierce = p[4] + c.pierceAdd;
    this.damage = CONFIG.BASE_BULLET_DAMAGE * (1 + 0.3 * p[5]) * c.damageMul;
    this.reloadTime = CONFIG.BASE_RELOAD * c.reloadMul / (1 + 0.15 * p[6]);
    this.moveSpeed = CONFIG.BASE_TANK_SPEED * (1 + 0.08 * p[7]) * c.moveMul;
  }

  // Появиться в точке (x, y): полное здоровье, сброс скорости и перезарядки
  spawn(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.hp = this.maxHp;
    this.alive = true;
    this.reloadTimer = 0;
    this.recoilAnim = 0;
    this.lastDamager = null;
    this.spawnedAt = performance.now();
  }

  // Вложить очко в стат с индексом index. Возвращает true, если получилось
  spendPoint(index) {
    if (this.unspent <= 0 || this.points[index] >= STAT_MAX) return false;
    const oldMax = this.maxHp;
    this.points[index]++;
    this.unspent--;
    this.recalc();
    // Прибавка к максимальному здоровью сразу добавляет столько же текущего
    this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - oldMax));
    return true;
  }

  // Получить опыт; при нехватке опыта поднимает уровень (до MAX_LEVEL)
  addXp(amount) {
    this.xp += amount;
    this.score += amount;
    while (this.level < CONFIG.MAX_LEVEL && this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      this.unspent++;
      if (CONFIG.EVOLUTION_LEVELS.includes(this.level)) this.pendingEvolution = true;
    }
  }

  // Варианты эволюции: классы, которые можно получить из текущего
  evolutionOptions() {
    return Object.values(CLASSES).filter((c) => c.parent === this.classId);
  }

  // Сменить класс; эволюция считается выполненной
  setClass(id) {
    this.classId = id;
    this.pendingEvolution = false;
    this.recalc();
    this.hp = Math.min(this.hp, this.maxHp);
  }

  // Автоматическое развитие (для ботов): вкладывает очки и выбирает эволюцию
  autoUpgrade() {
    while (this.unspent > 0) {
      const free = STATS.map((_, i) => i).filter((i) => this.points[i] < STAT_MAX);
      if (!free.length) break;
      this.spendPoint(free[randInt(0, free.length - 1)]);
    }
    if (this.pendingEvolution) {
      const options = this.evolutionOptions();
      if (options.length) this.setClass(options[randInt(0, options.length - 1)].id);
      else this.pendingEvolution = false;
    }
  }

  // Выстрел из всех стволов класса. Возвращает true, если выстрел состоялся
  fire() {
    if (!this.alive || this.reloadTimer > 0) return false;
    this.reloadTimer = this.reloadTime;
    this.recoilAnim = 1;
    const c = this.cls;
    for (const b of c.barrels) {
      const dir = this.aim + b.angle;                       // направление ствола
      const spread = (Math.random() * 2 - 1) * c.spread;    // случайный разброс
      // Точка вылета — кончик ствола с учётом смещения вбок (перпендикуляр к стволу)
      const tip = this.radius - 6 + b.len;
      const ox = this.x + Math.cos(dir) * tip - Math.sin(dir) * b.offset;
      const oy = this.y + Math.sin(dir) * tip + Math.cos(dir) * b.offset;
      bullets.push(new Bullet(
        this, ox, oy, dir + spread,
        this.bulletSpeed, this.damage, this.pierce,
        CONFIG.BULLET_RADIUS * c.sizeMul,
      ));
      // Отдача толкает танк в сторону, противоположную стволу
      this.vx -= Math.cos(dir) * CONFIG.RECOIL * c.recoilMul;
      this.vy -= Math.sin(dir) * CONFIG.RECOIL * c.recoilMul;
    }
    return true;
  }

  // Таймеры: перезарядка, отдача стволов и регенерация здоровья
  tick(dt) {
    if (!this.alive) return;
    this.reloadTimer = Math.max(0, this.reloadTimer - dt);
    this.recoilAnim = Math.max(0, this.recoilAnim - dt * 6);
    this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);
  }

  // Движение: dirX, dirY — желаемое направление (единичный вектор или ноль).
  // Скорость плавно подтягивается к желаемой, поэтому отдача гаснет мягко.
  move(dt, dirX, dirY) {
    const tx = dirX * this.moveSpeed;
    const ty = dirY * this.moveSpeed;
    const k = 1 - Math.exp(-CONFIG.ACCEL * dt);
    this.vx += (tx - this.vx) * k;
    this.vy += (ty - this.vy) * k;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.clampToArena();
  }

  // Невидимые стены по краям арены: танк останавливается у границы
  clampToArena() {
    const r = this.radius;
    const max = CONFIG.WORLD_SIZE - r;
    if (this.x < r || this.x > max) {
      this.x = clamp(this.x, r, max);
      this.vx = 0;
    }
    if (this.y < r || this.y > max) {
      this.y = clamp(this.y, r, max);
      this.vy = 0;
    }
  }

  // Получить урон. source — танк-источник (для награды за убийство) или null
  takeDamage(amount, source) {
    if (!this.alive) return;
    this.hp -= amount;
    if (source && source !== this) this.lastDamager = source;
  }
}

// Столкновение двух танков: они выталкивают друг друга и наносят таранный урон
function collideTanks(a, b, dt) {
  if (!a.alive || !b.alive) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const minD = a.radius + b.radius;
  if (d >= minD || d === 0) return;

  const nx = dx / d;
  const ny = dy / d;
  const push = (minD - d) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  a.takeDamage(b.ramDps * dt, b);
  b.takeDamage(a.ramDps * dt, a);
}
