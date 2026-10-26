// ============================================================
//  tank.js — базовый танк: статы, уровни, движение, стрельба, урон
//  От него наследуются Player (игрок) и Bot (бот).
// ============================================================

class Tank {
  constructor(game, opts) {
    this.game = game;
    this.id = nextId();
    this.kind = 'tank';
    this.name = opts.name || 'Tank';
    this.color = opts.color;
    this.stroke = opts.stroke;

    this.x = opts.x;
    this.y = opts.y;
    this.vx = 0;
    this.vy = 0;
    this.angle = rand(0, TAU);

    this.score = 0;
    this.level = 1;
    this.points = 0; // свободные очки улучшения
    this.stats = new Array(STATS.length).fill(0);
    this.classId = 'basic';
    this.cls = CLASSES.basic;

    this.maxHp = 0;
    this.hp = 0;
    this.shownHp = 1; // для плавной полоски здоровья
    this.dead = false;
    this.killer = null;
    this.kills = 0;
    this.bornAt = game.time;

    // Намерения (заполняются игроком или ИИ)
    this.moveX = 0;
    this.moveY = 0;
    this.shooting = false;
    this.wasShooting = false;

    this.barrelStates = [];
    this.invuln = CONFIG.INVULN_TIME;
    this.hitFlash = 0;
    this.lastHitTime = -999;

    this.recomputeStats();
    this.hp = this.maxHp;
    this.resetBarrels();
  }

  // ---------------- Характеристики ----------------

  // Пересчёт всех производных величин из уровня, вложенных очков и класса
  recomputeStats() {
    const S = this.stats, lv = this.level;
    this.r = CONFIG.BASE_RADIUS * Math.pow(1.011, lv - 1);

    const oldMax = this.maxHp;
    this.maxHp = 50 + 2 * (lv - 1) + 20 * S[1];
    this.hp = oldMax > 0 ? (this.hp / oldMax) * this.maxHp : this.maxHp;

    this.regenPct = 0.012 + 0.018 * S[0];                      // доля здоровья в секунду
    this.bodyDps = 25 * (1 + 0.35 * S[2]);                     // урон корпусом, в секунду
    this.bulletSpeed = 520 * (1 + 0.13 * S[3]);                // px/сек
    this.bulletPen = 1 + 0.55 * S[4];                          // сколько целей пробьёт
    this.bulletDmg = 8 * (1 + 0.22 * S[5]);
    this.reload = 0.5 * Math.pow(0.9, S[6]);                   // сек между выстрелами
    this.maxSpeed = 250 * (1 + 0.07 * S[7]) * Math.pow(0.996, lv - 1) * this.cls.speed;
    this.fov = this.cls.fov * (1 + 0.004 * (lv - 1));
    this.range = this.bulletSpeed * this.cls.maxSpd * CONFIG.BULLET_LIFE * 0.85; // дальность для ИИ
  }

  levelProgress() {
    if (this.level >= CONFIG.MAX_LEVEL) return 1;
    const a = LEVEL_SCORES[this.level], b = LEVEL_SCORES[this.level + 1];
    return clamp((this.score - a) / (b - a), 0, 1);
  }

  addScore(n) {
    this.score += n;
    let leveled = false;
    while (this.level < CONFIG.MAX_LEVEL && this.score >= LEVEL_SCORES[this.level + 1]) {
      this.level++;
      this.points++;
      leveled = true;
    }
    if (leveled) {
      this.recomputeStats();
      this.onLevelUp();
    }
  }

  // Хук: переопределяется в Player / Bot
  onLevelUp() {}

  invest(i) {
    if (this.points <= 0 || this.stats[i] >= CONFIG.MAX_STAT_POINTS) return false;
    this.stats[i]++;
    this.points--;
    this.recomputeStats();
    return true;
  }

  // ---------------- Классы ----------------

  canEvolve() {
    const need = CONFIG.EVOLVE_LEVELS[this.cls.tier - 1];
    return need !== undefined && this.cls.children.length > 0 && this.level >= need;
  }

  evolve(id) {
    if (!this.canEvolve() || !this.cls.children.includes(id)) return false;
    this.classId = id;
    this.cls = CLASSES[id];
    this.resetBarrels();
    this.recomputeStats();
    return true;
  }

  resetBarrels() {
    this.barrelStates = this.cls.barrels.map((b) => ({ cd: b.d * this.reload * b.rel, kick: 0, shake: 0 }));
  }

  // ---------------- Обновление ----------------

  update(dt) {
    if (this.dead) return;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    this.updateMovement(dt);
    this.updateWeapons(dt);

    // Регенерация, если давно не получали урон
    if (this.hp < this.maxHp && this.game.time - this.lastHitTime > 3) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * this.regenPct * dt);
    }
    this.shownHp += (this.hp / this.maxHp - this.shownHp) * Math.min(1, dt * 12);
  }

  updateMovement(dt) {
    let mx = this.moveX, my = this.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    // Плавный разгон/торможение к целевой скорости; толчки и отдача затухают сами
    const k = 1 - Math.exp(-dt * 5);
    this.vx += (mx * this.maxSpeed - this.vx) * k;
    this.vy += (my * this.maxSpeed - this.vy) * k;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Невидимые стены арены
    const W = CONFIG.WORLD_SIZE, r = this.r;
    if (this.x < r) { this.x = r; if (this.vx < 0) this.vx = 0; }
    else if (this.x > W - r) { this.x = W - r; if (this.vx > 0) this.vx = 0; }
    if (this.y < r) { this.y = r; if (this.vy < 0) this.vy = 0; }
    else if (this.y > W - r) { this.y = W - r; if (this.vy > 0) this.vy = 0; }
  }

  updateWeapons(dt) {
    const barrels = this.cls.barrels, states = this.barrelStates;
    // При начале стрельбы разводим пушки по задержкам (чередование у Twin и т.п.)
    if (this.shooting && !this.wasShooting) {
      for (let i = 0; i < barrels.length; i++) {
        states[i].cd = Math.max(states[i].cd, barrels[i].d * this.reload * barrels[i].rel);
      }
    }
    this.wasShooting = this.shooting;

    for (let i = 0; i < barrels.length; i++) {
      const st = states[i], b = barrels[i];
      if (st.cd > 0) st.cd -= dt;
      else if (!this.shooting) st.cd = 0;
      if (this.shooting && st.cd <= 0) {
        this.fire(b, st);
        st.cd += this.reload * b.rel;
        if (st.cd < 0) st.cd = 0;
      }
      st.kick *= Math.exp(-dt * 14);
    }
  }

  fire(b, st) {
    const R = this.r;
    const ang = this.angle + b.a;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const bulletR = b.w * R * 0.5;
    const lx = b.len * R - bulletR * 0.3, ly = b.x * R;
    const mx = this.x + cos * lx - sin * ly;
    const my = this.y + sin * lx + cos * ly;
    const dir = ang + (Math.random() * 2 - 1) * b.spr;

    this.game.bullets.spawn({
      owner: this, x: mx, y: my, dir,
      speed: this.bulletSpeed * b.spd * rand(0.95, 1.05),
      r: bulletR,
      dmg: this.bulletDmg * b.dmg,
      pen: this.bulletPen * b.pen,
      life: CONFIG.BULLET_LIFE,
      color: this.color, stroke: this.stroke,
    });

    // Отдача слегка отталкивает танк назад
    const rec = 38 * b.rec;
    this.vx -= Math.cos(dir) * rec;
    this.vy -= Math.sin(dir) * rec;

    // Анимация: пушка отъезжает и слегка дрожит
    st.kick = 1;
    st.shake = (Math.random() - 0.5) * 0.08;

    // Стрельба снимает неуязвимость после появления
    this.invuln = 0;
  }

  // Толчок от столкновений (используется системой коллизий)
  knock(ax, ay) {
    this.vx += ax;
    this.vy += ay;
  }

  takeDamage(amount, attacker) {
    if (this.dead || this.invuln > 0 || amount <= 0) return;
    this.hp -= amount;
    this.lastHitTime = this.game.time;
    this.hitFlash = 1;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.killer = attacker;
      this.game.onTankKilled(this, attacker);
    }
  }

  // ---------------- Отрисовка ----------------

  draw(ctx, time) {
    const r = this.r;
    ctx.save();
    ctx.translate(this.x, this.y);
    const baseAlpha = this.invuln > 0 ? 0.55 + 0.25 * Math.sin(time * 18) : 1;
    ctx.globalAlpha = baseAlpha;

    // Мягкая тень
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.arc(r * 0.12, r * 0.22, r * 1.03, 0, TAU);
    ctx.fill();

    renderTank(ctx, this.cls, r, this.angle, this.color, this.stroke, this.barrelStates);

    if (this.hitFlash > 0) {
      ctx.globalAlpha = baseAlpha * this.hitFlash * 0.4;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.restore();
  }

  // Ник над танком и полоска здоровья под ним
  drawLabel(ctx) {
    const r = this.r;
    const fs = Math.max(13, r * 0.62);
    ctx.font = `bold ${fs}px Ubuntu, "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = fs * 0.22;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(this.name, this.x, this.y - r - fs * 0.55);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.name, this.x, this.y - r - fs * 0.55);

    if (this.shownHp < 0.995) {
      const w = r * 1.9, h = Math.max(6, r * 0.2);
      const bx = this.x - w / 2, by = this.y + r + 10;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(bx - 2, by - 2, w + 4, h + 4);
      ctx.fillStyle = '#85e37d';
      ctx.fillRect(bx, by, w * clamp(this.shownHp, 0, 1), h);
    }
  }
}
