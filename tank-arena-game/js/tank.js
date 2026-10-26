// ============================================================
// Базовый танк: инерция движения, стрельба, статы, опыт и уровни.
// Управление задаётся извне: игроком (player.js) или ИИ (bots.js).
// ============================================================

class Tank {
  constructor(name, color) {
    this.name = name;
    this.color = color;
    this.isPlayer = false;
    this.resetProgress();
    this.spawn();
  }

  // Сброс прогресса: уровень, опыт, статы, класс
  resetProgress() {
    this.stats = STATS.map(() => 0);
    this.level = 1;
    this.xp = 0;              // опыт внутри текущего уровня
    this.score = 0;           // весь заработанный опыт (очки для таблицы лидеров)
    this.points = 0;          // непотраченные очки улучшений
    this.pendingEvolutions = 0;
    this.cls = 'basic';
    this.kills = 0;
  }

  // Появление на случайной точке арены с полным здоровьем
  spawn() {
    const m = CONFIG.TANK_RADIUS * 4;
    this.x = rand(m, CONFIG.WORLD_SIZE - m);
    this.y = rand(m, CONFIG.WORLD_SIZE - m);
    this.vx = 0;
    this.vy = 0;
    this.aim = rand(0, Math.PI * 2);
    this.hp = this.maxHp;
    this.alive = true;
    this.age = 0;             // сколько танк прожил с момента появления, с
    this.reloadT = 0;         // время до следующего выстрела, с
    this.kick = 0;            // отдача ствола для анимации
    this.flash = 0;           // вспышка при получении урона
    this.lastHitBy = null;
    this.lastHitAt = -Infinity;
    this.moveX = 0;
    this.moveY = 0;
    this.shooting = false;
  }

  get classDef() {
    return CLASSES[this.cls];
  }

  // Характеристики, которые зависят от статов
  get maxHp() { return CONFIG.BASE_HEALTH * (1 + 0.2 * this.stats[STAT.MAX_HP]); }
  get regen() { return this.maxHp * (0.005 + 0.004 * this.stats[STAT.REGEN]); } // ед. здоровья в секунду
  get bodyMul() { return 1 + 0.25 * this.stats[STAT.BODY]; }
  get bulletSpeedMul() { return 1 + 0.1 * this.stats[STAT.BULLET_SPEED]; }
  get pierce() { return 1 + this.stats[STAT.PEN]; }
  get bulletDmgMul() { return 1 + 0.2 * this.stats[STAT.BULLET_DMG]; }
  get reloadMul() { return 1 + 0.15 * this.stats[STAT.RELOAD]; }
  get moveMul() { return 1 + 0.08 * this.stats[STAT.MOVE]; }

  // Вкладывает очко улучшения в стат
  invest(index) {
    if (this.points <= 0 || this.stats[index] >= CONFIG.MAX_STAT_POINTS) return false;
    this.stats[index]++;
    this.points--;
    return true;
  }

  // Начисляет опыт и повышает уровень (очко улучшения за каждый уровень)
  addXp(amount) {
    this.score += amount;
    this.xp += amount;
    while (this.level < CONFIG.MAX_LEVEL && this.xp >= xpForLevel(this.level)) {
      this.xp -= xpForLevel(this.level);
      this.level++;
      this.points++;
      if (CONFIG.EVOLUTION_LEVELS.includes(this.level)) this.pendingEvolutions++;
    }
  }

  // Варианты эволюции, доступные прямо сейчас
  evolutionOptions() {
    return this.pendingEvolutions > 0 ? this.classDef.children : [];
  }

  // Эволюция в выбранный класс
  evolve(id) {
    if (!this.evolutionOptions().includes(id)) return false;
    this.cls = id;
    this.pendingEvolutions--;
    return true;
  }

  // Поднимает танк до уровня (используется ботами при появлении)
  setLevel(level) {
    this.resetProgress();
    for (let l = 1; l < level; l++) this.addXp(xpForLevel(l));
  }

  // Шаг симуляции: инерция, регенерация, перезарядка и стрельба
  update(dt, bullets) {
    const c = this.classDef;
    this.age += dt;
    this.flash = Math.max(0, this.flash - dt);

    // Скорость догоняет желаемую с инерцией; отдача от выстрелов гаснет так же
    const maxSpeed = CONFIG.BASE_SPEED * this.moveMul * c.move;
    const k = Math.min(1, dt * 8);
    this.vx += (this.moveX * maxSpeed - this.vx) * k;
    this.vy += (this.moveY * maxSpeed - this.vy) * k;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Невидимые стены арены
    const R = CONFIG.TANK_RADIUS;
    const W = CONFIG.WORLD_SIZE;
    if (this.x < R) { this.x = R; this.vx = 0; }
    if (this.x > W - R) { this.x = W - R; this.vx = 0; }
    if (this.y < R) { this.y = R; this.vy = 0; }
    if (this.y > W - R) { this.y = W - R; this.vy = 0; }

    this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);

    // Перезарядка и стрельба
    this.reloadT = Math.max(0, this.reloadT - dt);
    this.kick = Math.max(0, this.kick - dt * 8);
    if (this.shooting && this.reloadT === 0) {
      this.fire(c, bullets);
      this.reloadT = c.reload / this.reloadMul;
    }
  }

  // Выстрел: каждый ствол выпускает пулю, танк получает отдачу
  fire(c, bullets) {
    const R = CONFIG.TANK_RADIUS;
    const speed = CONFIG.BASE_BULLET_SPEED * c.speed * this.bulletSpeedMul;
    const dmg = CONFIG.BASE_BULLET_DAMAGE * c.dmg * this.bulletDmgMul;
    const radius = CONFIG.BASE_BULLET_RADIUS * c.size;
    for (const b of c.barrels) {
      const dir = this.aim + b.a;
      const cos = Math.cos(dir);
      const sin = Math.sin(dir);
      // Конец ствола с учётом бокового смещения ствола
      const bx = this.x + cos * (R + c.barrelLen) - sin * b.x;
      const by = this.y + sin * (R + c.barrelLen) + cos * b.x;
      const spread = (Math.random() - 0.5) * 2 * c.spread;
      bullets.push(new Bullet(this, bx, by, dir + spread, speed, dmg, radius, c.life, this.pierce));
      // Отдача толкает танк против направления каждого ствола
      this.vx -= (cos * c.recoil) / c.barrels.length;
      this.vy -= (sin * c.recoil) / c.barrels.length;
    }
    this.kick = 1;
  }

  // Получение урона. Опыт получит только танк-источник
  damage(amount, source) {
    if (!this.alive) return;
    this.hp -= amount;
    this.flash = 0.08;
    if (source instanceof Tank) {
      this.lastHitBy = source;
      this.lastHitAt = performance.now();
    }
  }

  die() {
    this.alive = false;
    this.hp = 0;
    this.shooting = false;
  }

  // Плавно поворачивает прицел к цели
  turnAim(target, dt, speed) {
    let diff = target - this.aim;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.aim += diff * Math.min(1, dt * speed);
  }

  // Отрисовка танка: стволы под корпусом, затем корпус с тенью
  draw(ctx) {
    if (!this.alive) return;
    const c = this.classDef;
    const R = CONFIG.TANK_RADIUS;
    const kick = this.kick * 5;   // ствол отъезжает назад при выстреле

    for (const b of c.barrels) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.aim + b.a);
      ctx.beginPath();
      ctx.rect(R * 0.4 - kick, b.x - c.barrelW / 2, c.barrelLen + R * 0.6, c.barrelW);
      ctx.fillStyle = '#8b93a7';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(40, 45, 60, 0.5)';
      ctx.stroke();
      ctx.restore();
    }

    // Тень корпуса
    ctx.beginPath();
    ctx.arc(this.x + 3, this.y + 4, R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40, 50, 80, 0.15)';
    ctx.fill();
    // Корпус
    ctx.beginPath();
    ctx.arc(this.x, this.y, R, 0, Math.PI * 2);
    ctx.fillStyle = this.flash > 0 ? '#ffffff' : this.color;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(30, 40, 60, 0.35)';
    ctx.stroke();
  }

  // Ник, уровень и полоска здоровья над танком
  drawLabel(ctx) {
    if (!this.alive) return;
    const y = this.y - CONFIG.TANK_RADIUS - 24;
    const text = `${this.name} · ${this.level}`;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeText(text, this.x, y);
    ctx.fillStyle = '#2b2d42';
    ctx.fillText(text, this.x, y);

    const bw = 50;
    const bh = 6;
    const ratio = clamp(this.hp / this.maxHp, 0, 1);
    const color = ratio > 0.5 ? '#58c77d' : ratio > 0.25 ? '#f5b841' : '#ef5350';
    ctx.fillStyle = 'rgba(43, 45, 66, 0.15)';
    ctx.fillRect(this.x - bw / 2, y + 4, bw, bh);
    ctx.fillStyle = color;
    ctx.fillRect(this.x - bw / 2, y + 4, bw * ratio, bh);
  }
}
