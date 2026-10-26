'use strict';
// ============================================================
//  tank.js — базовый класс танка, общий для игрока и ботов:
//  характеристики, уровни, прокачка, эволюция классов,
//  движение с инерцией, стрельба с отдачей и отрисовка
// ============================================================

class Tank {
  constructor(opts) {
    this.id = nextEntityId++;
    this.kind = 'tank';
    this.name = opts.name;
    this.color = opts.color;
    this.isPlayer = !!opts.isPlayer;
    this.isBot = false;

    this.x = opts.x; this.y = opts.y;
    this.px = this.x; this.py = this.y;   // позиция на прошлом шаге физики
    this.rx = this.x; this.ry = this.y;   // интерполированная позиция для отрисовки
    this.vx = 0; this.vy = 0;
    this.angle = Math.random() * TAU;     // направление прицела
    this.moveX = 0; this.moveY = 0;       // желаемое направление движения (единичный вектор)
    this.firing = false;

    this.level = 1;
    this.score = 0;
    this.stats = new Array(STATS.length).fill(0);
    this.statPoints = 0;

    this.hp = 0;
    this.maxHp = 0;
    this.r = CONFIG.TANK_BASE_RADIUS;
    this.mass = 2;

    this.dead = false;
    this.deathT = 0;
    this.flash = 0;
    this.sinceDamage = 0;
    this.invulnT = CONFIG.SPAWN_PROTECTION;
    this.opacity = 1;        // < 1 у невидимого Stalker
    this.kills = 0;
    this.lastHitBy = null;
    this.spawnTime = 0;

    this.setClass('basic');
    this.recompute(true);
  }

  // Описание текущего класса из TANK_CLASSES
  get cls() { return TANK_CLASSES[this.classId]; }

  // ---------- Характеристики, зависящие от прокачки ----------
  get reloadTime()  { return CONFIG.BASE_RELOAD * Math.pow(0.915, this.stats[6]); }
  get moveSpeed()   { return (205 + 16 * this.stats[7]) * (this.cls.speed || 1) * (1 - (this.level - 1) * 0.0035); }
  get bodyDps()     { return (40 + 20 * this.stats[2]) * (this.cls.body || 1); }
  get contactDps()  { return this.bodyDps; }
  get pierceCost()  { return 12 + 6 * this.stats[2]; }
  get bulletSpeed() { return 480 + 45 * this.stats[3]; }
  get bulletDamage(){ return 7 + 3 * this.stats[5]; }
  get bulletPen()   { return 8 + 5.5 * this.stats[4]; }
  get regenRate()   { return this.maxHp * (0.003 + 0.011 * this.stats[0]); }
  get viewFov()     { return (this.cls.fov || 1) * (1 + (this.level - 1) * 0.005); }

  // Пересчёт размера, здоровья и массы (с сохранением доли HP)
  recompute(fullHeal) {
    const ratio = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    this.r = CONFIG.TANK_BASE_RADIUS * Math.pow(1.01, this.level - 1);
    this.maxHp = 50 + 2 * (this.level - 1) + 20 * this.stats[1];
    this.hp = fullHeal ? this.maxHp : this.maxHp * ratio;
    this.mass = 2 * Math.pow(this.r / CONFIG.TANK_BASE_RADIUS, 2);
  }

  setClass(id) {
    this.classId = id;
    const cls = TANK_CLASSES[id];
    this.classTier = cls.tier;
    this.gunState = cls.guns.map(() => ({ cool: 0, kick: 0 }));
  }

  // ---------- Уровни, очки и эволюция ----------

  // Максимальный ярус класса, доступный на текущем уровне
  availableTier() {
    let tier = 0;
    for (let i = 1; i < TIER_LEVELS.length; i++) if (this.level >= TIER_LEVELS[i]) tier = i;
    return tier;
  }
  canEvolve() { return this.classTier < this.availableTier() && this.cls.children.length > 0; }
  evolveOptions() { return this.canEvolve() ? this.cls.children : []; }
  evolve(id) {
    if (!this.evolveOptions().includes(id)) return false;
    this.setClass(id);
    return true;
  }

  upgradeStat(i) {
    if (this.statPoints <= 0 || this.stats[i] >= CONFIG.STAT_MAX) return false;
    this.stats[i]++;
    this.statPoints--;
    if (i === 1) this.recompute(false);
    return true;
  }

  // Начисление очков; возвращает количество полученных уровней
  addScore(amount) {
    if (amount <= 0) return 0;
    this.score += amount;
    const old = this.level;
    while (this.level < CONFIG.MAX_LEVEL && this.score >= LEVEL_XP[this.level + 1]) {
      this.level++;
      this.statPoints++;   // одно очко улучшения за каждый уровень
    }
    if (this.level !== old) {
      this.recompute(false);
      this.onLevelUp(old);
    }
    return this.level - old;
  }

  onLevelUp(oldLevel) {}   // переопределяется у игрока

  takeDamage(amount, source) {
    if (this.dead || amount <= 0 || this.invulnT > 0) return;
    this.hp -= amount;
    this.flash = 1;
    this.sinceDamage = 0;
    if (source && source !== this) this.lastHitBy = source;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }

  // ---------- Обновление ----------
  update(dt, game) {
    if (this.invulnT > 0) this.invulnT -= dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 6);
    this.sinceDamage += dt;

    // Движение: ускорение по направлению ввода + трение (даёт инерцию и плавную отдачу)
    const F = CONFIG.TANK_FRICTION;
    const acc = this.moveSpeed * F;
    this.vx += this.moveX * acc * dt;
    this.vy += this.moveY * acc * dt;
    const damp = Math.exp(-F * dt);
    this.vx *= damp;
    this.vy *= damp;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Невидимые стены по краям арены
    const W = CONFIG.WORLD_SIZE, r = this.r;
    if (this.x < r) { this.x = r; if (this.vx < 0) this.vx = 0; }
    else if (this.x > W - r) { this.x = W - r; if (this.vx > 0) this.vx = 0; }
    if (this.y < r) { this.y = r; if (this.vy < 0) this.vy = 0; }
    else if (this.y > W - r) { this.y = W - r; if (this.vy > 0) this.vy = 0; }

    // Регенерация; после 12 секунд без урона — ускоренное восстановление
    let regen = this.regenRate;
    if (this.sinceDamage > 12) regen += this.maxHp * 0.08;
    this.hp = Math.min(this.maxHp, this.hp + regen * dt);

    this.updateGuns(dt, game);

    // Невидимость Stalker: исчезает, когда стоит и не стреляет
    if (this.cls.invis) {
      const moving = this.moveX !== 0 || this.moveY !== 0;
      if (moving || this.firing) this.opacity = Math.min(1, this.opacity + dt * 4);
      else this.opacity = Math.max(0, this.opacity - dt * 0.8);
    } else {
      this.opacity = 1;
    }
  }

  // Перезарядка каждой пушки с учётом сдвига фазы (delay)
  updateGuns(dt, game) {
    const guns = this.cls.guns, T = this.reloadTime;
    for (let i = 0; i < guns.length; i++) {
      const g = guns[i], st = this.gunState[i];
      const period = T * g.reload;
      if (this.firing) {
        st.cool -= dt;
        if (st.cool <= 0) {
          this.fireGun(game, g, st);
          st.cool = Math.max(0, st.cool + period);
        }
      } else {
        // В простое пушка «досиживает» до своей фазы, чтобы залпы шли по очереди
        st.cool = Math.max(st.cool - dt, g.delay * period);
      }
      if (st.kick > 0) st.kick = Math.max(0, st.kick - dt * 7);
    }
  }

  fireGun(game, g, st) {
    const a = this.angle + g.angle;
    const cos = Math.cos(a), sin = Math.sin(a);
    const r = this.r;
    const br = g.width * 0.5 * r * g.size;     // радиус пули — по ширине ствола
    const along = g.length * r - br;           // пуля появляется у дула
    const off = g.offset * r;
    const bx = this.x + cos * along - sin * off;
    const by = this.y + sin * along + cos * off;
    // Разброс: сумма двух случайных даёт больше выстрелов ближе к центру
    const dir = a + (g.spread ? (Math.random() + Math.random() - 1) * g.spread : 0);
    const speed = this.bulletSpeed * g.speed * (g.spread ? rand(0.92, 1.05) : 1);
    game.addBullet(new Bullet(this, bx, by, dir, speed, br,
      this.bulletDamage * g.damage, this.bulletPen * g.pen, CONFIG.BULLET_LIFE * g.life));

    // Отдача слегка отталкивает танк назад
    const rec = CONFIG.BASE_RECOIL * g.recoil;
    this.vx -= cos * rec;
    this.vy -= sin * rec;
    st.kick = 1;           // «дёргание» ствола
    this.invulnT = 0;      // выстрел снимает защиту появления
    if (this.cls.invis) this.opacity = 1;
  }

  // ---------- Отрисовка ----------

  // Тень корпуса (добавляется в общий путь)
  shadowPath(ctx) {
    const x = this.rx, y = this.ry + 3 + this.r * 0.12;
    ctx.moveTo(x + this.r, y);
    ctx.arc(x, y, this.r, 0, TAU);
  }

  draw(ctx, time) {
    let scale = 1;
    let alpha = this.isPlayer ? Math.max(0.3, this.opacity) : this.opacity;
    if (this.dead) {
      const k = Math.min(1, this.deathT / CONFIG.DEATH_ANIM);
      scale = 1 + 0.5 * k;
      alpha *= 1 - k;
    }
    if (alpha <= 0.01) return;
    let flash = this.flash;
    // Мигание во время защиты появления
    if (this.invulnT > 0 && !this.dead) flash = Math.max(flash, 0.3 + 0.3 * Math.sin(time * 14));
    ctx.globalAlpha = alpha;
    Tank.drawModel(ctx, this.cls, this.rx, this.ry, this.r * scale, this.angle, this.color, this.gunState, flash);
    ctx.globalAlpha = 1;
  }

  // Отрисовка модели танка: пушки под корпусом, затем круглый корпус.
  // Используется и в игре, и для превью в панели эволюции.
  static drawModel(ctx, cls, x, y, r, angle, color, gunState, flash) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineJoin = 'round';
    ctx.lineWidth = clamp(r * 0.14, 2, 4.5);
    ctx.fillStyle = COLORS.barrel;
    ctx.strokeStyle = COLORS.barrelStroke;
    const guns = cls.guns;
    for (let i = 0; i < guns.length; i++) {
      const g = guns[i];
      const kick = gunState ? gunState[i].kick : 0;
      const len = g.length * r * (1 - 0.13 * kick);   // ствол слегка «проседает» при выстреле
      const hw = g.width * r * 0.5;
      const tw = (g.tip || g.width) * r * 0.5;
      const oy = g.offset * r;
      if (g.angle) ctx.rotate(g.angle);
      ctx.beginPath();
      ctx.moveTo(0, oy - hw);
      ctx.lineTo(len, oy - tw);
      ctx.lineTo(len, oy + tw);
      ctx.lineTo(0, oy + hw);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (g.angle) ctx.rotate(-g.angle);
    }
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = shadeColor(color, -0.25);
    ctx.stroke();
    if (flash > 0.01) {
      ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.5).toFixed(3) + ')';
      ctx.fill();
    }
    ctx.restore();
  }

  // Габариты модели при r = 1 (для центрирования превью)
  static modelBounds(cls, angle) {
    let minX = -1, maxX = 1, minY = -1, maxY = 1;
    for (const g of cls.guns) {
      const a = angle + g.angle, c = Math.cos(a), s = Math.sin(a);
      const hw = g.width / 2, tw = (g.tip || g.width) / 2;
      const pts = [[0, g.offset - hw], [g.length, g.offset - tw], [g.length, g.offset + tw], [0, g.offset + hw]];
      for (const [px, py] of pts) {
        const x = px * c - py * s, y = px * s + py * c;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return { minX, maxX, minY, maxY };
  }
}
