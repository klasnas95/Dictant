// ============================================================
//  bots.js — боты с простым ИИ
//  Режимы: wander (блуждание), farm (добыча полигонов),
//          attack (атака слабого танка), flee (бегство от сильного).
// ============================================================

class Bot extends Tank {
  constructor(game, level) {
    const palette = pick(TANK_COLORS.bots);
    const pos = game.findSpawnPoint(900);
    super(game, { name: game.pickBotName(), color: palette.fill, stroke: palette.stroke, x: pos.x, y: pos.y });
    this.isBot = true;

    // «Характер» бота
    this.aggr = rand(0.15, 0.75);          // склонность нападать на танки
    this.skill = rand(0.4, 0.9);         // меткость
    this.turnSpeed = rand(6, 10);         // скорость поворота пушки, рад/сек
    this.weights = STATS.map(() => rand(0.2, 1)); // предпочтения при прокачке

    this.mode = 'wander';
    this.target = null;
    this.thinkTimer = rand(0, 0.3);
    this.wp = { x: this.x, y: this.y, timer: 0 }; // точка блуждания
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = rand(1, 3);
    this.aimJitter = 0;

    // Стартовый уровень: очки сразу прокачиваются и класс выбирается автоматически
    if (level > 1) this.addScore(LEVEL_SCORES[level] + randInt(0, 20));
  }

  // Автоматическая прокачка и выбор эволюции
  onLevelUp() {
    while (this.points > 0) {
      let total = 0;
      for (let i = 0; i < STATS.length; i++) if (this.stats[i] < CONFIG.MAX_STAT_POINTS) total += this.weights[i];
      if (total <= 0) break;
      let roll = Math.random() * total, chosen = -1;
      for (let i = 0; i < STATS.length; i++) {
        if (this.stats[i] >= CONFIG.MAX_STAT_POINTS) continue;
        roll -= this.weights[i];
        if (roll <= 0) { chosen = i; break; }
      }
      if (chosen < 0 || !this.invest(chosen)) break;
    }
    while (this.canEvolve()) this.evolve(pick(this.cls.children));
  }

  update(dt) {
    if (this.dead) return;
    this.think(dt);
    super.update(dt);
  }

  // ---------------- Выбор цели (раз в 0.2–0.4 сек) ----------------
  think(dt) {
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = rand(0.2, 0.4);
      this.chooseTarget();
      this.aimJitter = rand(-1, 1) * (1 - this.skill) * 0.3;
    }
    this.steer(dt);
  }

  chooseTarget() {
    const g = this.game;
    let threat = null, threatD = 1e9, prey = null, preyD = 1e9;
    const lowHp = this.hp < this.maxHp * 0.35;

    for (const t of g.tanks) {
      if (t === this || t.dead) continue;
      const d = Math.hypot(t.x - this.x, t.y - this.y);
      if (d > 900) continue;
      const stronger = lowHp || t.level > this.level * 1.35 + 4;
      if (stronger) {
        if (d < 650 && d < threatD) { threat = t; threatD = d; }
      } else if (t.invuln <= 0 && d < preyD) {
        // Слабых новичков не преследуем издалека — за них почти нет награды
        const trivial = t.level < this.level * 0.5 - 3;
        if (!trivial || d < 350) { prey = t; preyD = d; }
      }
    }

    if (threat) {
      this.mode = 'flee';
      this.target = threat;
      return;
    }
    if (prey && ((this.mode === 'attack' && this.target === prey) || Math.random() < this.aggr * 0.35)) {
      this.mode = 'attack';
      this.target = prey;
      return;
    }

    // Иначе — лучший полигон поблизости (больше опыта и ближе = лучше)
    let best = null, bestScore = 0;
    for (const s of g.shapes.list) {
      if (s.dead) continue;
      if (s.type === 'alpha' && this.level < 18) continue;
      const d = Math.hypot(s.x - this.x, s.y - this.y);
      if (d > 900) continue;
      const sc = s.def.xp / (d + 150);
      if (sc > bestScore) { bestScore = sc; best = s; }
    }
    if (best) {
      this.mode = 'farm';
      this.target = best;
    } else {
      this.mode = 'wander';
      this.target = null;
    }
  }

  // ---------------- Движение и прицеливание (каждый кадр) ----------------
  steer(dt) {
    const W = CONFIG.WORLD_SIZE;
    let tgt = this.target;
    if (tgt && tgt.dead) { tgt = this.target = null; this.mode = 'wander'; }

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) { this.strafe = -this.strafe; this.strafeTimer = rand(1.5, 4); }

    let mx = 0, my = 0;
    let aimX = null, aimY = null, canShoot = false;

    if (tgt) {
      const dx = tgt.x - this.x, dy = tgt.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;

      // Упреждение: целимся туда, где окажется цель
      aimX = tgt.x;
      aimY = tgt.y;
      if (tgt.kind === 'tank') {
        const t = d / (this.bulletSpeed * this.cls.maxSpd);
        aimX += tgt.vx * t * 0.8;
        aimY += tgt.vy * t * 0.8;
      }
      canShoot = d < this.range;

      if (this.mode === 'flee') {
        // Убегаем, слегка виляя в стороны
        mx = -nx - ny * this.strafe * 0.6;
        my = -ny + nx * this.strafe * 0.6;
      } else {
        // Держим дистанцию: подходим, если далеко, отходим, если слишком близко
        const want = this.mode === 'attack'
          ? clamp(this.range * 0.5, 220, 520)
          : clamp(this.range * 0.4, 150, 380) + tgt.r;
        if (d > want + 50) { mx += nx; my += ny; }
        else if (d < want - 50) { mx -= nx; my -= ny; }
        mx += -ny * this.strafe * 0.7;
        my += nx * this.strafe * 0.7;
      }
    } else {
      // Блуждание между случайными точками
      this.wp.timer -= dt;
      const wd = Math.hypot(this.wp.x - this.x, this.wp.y - this.y);
      if (wd < 150 || this.wp.timer <= 0) {
        this.wp.x = rand(300, W - 300);
        this.wp.y = rand(300, W - 300);
        this.wp.timer = rand(6, 12);
      }
      mx = (this.wp.x - this.x) / (wd || 1);
      my = (this.wp.y - this.y) / (wd || 1);
    }

    // Избегаем столкновений с другими танками
    for (const t of this.game.tanks) {
      if (t === this || t.dead) continue;
      const dx = this.x - t.x, dy = this.y - t.y;
      const d = Math.hypot(dx, dy) || 1;
      const safe = this.r + t.r + 140;
      if (d < safe) {
        const k = (1 - d / safe) * 2.5;
        mx += (dx / d) * k;
        my += (dy / d) * k;
      }
    }
    // Держимся подальше от стен
    const m = 260;
    if (this.x < m) mx += (m - this.x) / m * 2;
    if (this.x > W - m) mx -= (this.x - (W - m)) / m * 2;
    if (this.y < m) my += (m - this.y) / m * 2;
    if (this.y > W - m) my -= (this.y - (W - m)) / m * 2;

    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    this.moveX = mx;
    this.moveY = my;

    // Поворот пушки с ограниченной скоростью
    let desired;
    if (aimX !== null) desired = Math.atan2(aimY - this.y, aimX - this.x) + this.aimJitter;
    else if (ml > 0.05) desired = Math.atan2(my, mx);
    else desired = this.angle;
    const diff = angleDiff(this.angle, desired);
    const step = this.turnSpeed * dt;
    this.angle += clamp(diff, -step, step);

    this.shooting = canShoot && Math.abs(diff) < 0.2;
  }
}

// ------------------------------------------------------------
//  Менеджер ботов: поддерживает нужное количество и респавн
// ------------------------------------------------------------
class BotManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.respawnTimers = [];
  }

  // Случайный стартовый уровень: чаще низкие, реже высокие
  randomLevel() {
    return Math.min(38, 1 + Math.floor(Math.pow(Math.random(), 1.8) * 34));
  }

  add(level) {
    const bot = new Bot(this.game, level);
    this.list.push(bot);
    this.game.rebuildTanks();
    return bot;
  }

  populate() {
    for (let i = 0; i < CONFIG.BOT_COUNT; i++) this.add(this.randomLevel());
  }

  // Вызывается, когда бот погиб: ставим респавн в очередь
  onBotDied() {
    this.respawnTimers.push(rand(CONFIG.BOT_RESPAWN_MIN, CONFIG.BOT_RESPAWN_MAX));
  }

  update(dt) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (b.dead) {
        list[i] = list[list.length - 1];
        list.pop();
      } else {
        b.update(dt);
      }
    }

    // Респавн убитых ботов (с небольшим стартовым уровнем)
    for (let i = this.respawnTimers.length - 1; i >= 0; i--) {
      this.respawnTimers[i] -= dt;
      if (this.respawnTimers[i] <= 0) {
        this.respawnTimers.splice(i, 1);
        this.add(randInt(1, 12));
      }
    }
  }
}
