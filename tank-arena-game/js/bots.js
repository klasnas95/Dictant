'use strict';
// ============================================================
//  bots.js — боты с простым ИИ: блуждание, фарм полигонов,
//  бой с ближайшими танками, бегство при низком здоровье,
//  уклонение от препятствий, стен и пуль
// ============================================================

const BOT_NAMES = [
  'Пельмень', 'ShadowFox', 'Котлета', 'xX_Pro_Xx', 'Мурзик', 'Tornado', 'ГусьГусь', 'NyanTank',
  'Борщ', 'IronMike', 'Ракета', 'Zed', 'Lucky', 'Ваня228', 'PentaHunter', 'Doge', 'Сырник', 'Ninja',
];

// Желаемое распределение очков по характеристикам:
// [регенерация, макс. HP, урон тела, скорость пули, пробивание, урон пули, перезарядка, скорость]
const BOT_BUILDS = {
  gunner:   [2, 3, 0, 5, 7, 7, 7, 5],
  sniper:   [1, 2, 0, 7, 6, 7, 7, 4],
  balanced: [4, 4, 2, 4, 5, 5, 6, 5],
  tanky:    [5, 7, 4, 3, 5, 5, 5, 3],
  rammer:   [7, 7, 7, 1, 2, 2, 2, 7],
};

// Предпочтительные ветки классов для некоторых билдов
const BOT_CLASS_PREF = {
  sniper: ['sniper', 'assassin', 'hunter', 'ranger', 'stalker', 'predator'],
  rammer: ['flank', 'triangle', 'booster', 'fighter'],
};

class Bot extends Tank {
  constructor(name, color, x, y, level) {
    super({ name, color, x, y });
    this.isBot = true;

    // «Характер» бота
    this.skill = rand(0.35, 1);        // точность, реакция, уклонение
    this.aggression = rand(0.3, 1);    // насколько охотно вступает в бой
    this.buildId = pick(Object.keys(BOT_BUILDS));
    this.build = BOT_BUILDS[this.buildId];
    this.isRammer = this.buildId === 'rammer';

    // Состояние ИИ
    this.mode = 'wander';              // wander | farm | fight | flee
    this.target = null;
    this.thinkT = 0;
    this.wx = x; this.wy = y; this.wanderT = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = rand(1, 3);
    this.aimNoise = 0;

    // Стартовый уровень: начисляем очки и сразу распределяем прокачку
    if (level > 1) {
      const next = level < CONFIG.MAX_LEVEL ? LEVEL_XP[level + 1] - LEVEL_XP[level] : 0;
      this.addScore(LEVEL_XP[level] + Math.floor(Math.random() * next * 0.8));
    }
    this.autoUpgrade();
    this.recompute(true);
    this.invulnT = 2;
  }

  // Случайный уровень, чаще низкий
  static randomLevel() {
    return 1 + Math.floor(Math.pow(Math.random(), 1.5) * (CONFIG.MAX_LEVEL - 1));
  }

  // ---------- Прокачка ----------
  autoUpgrade() {
    while (this.statPoints > 0) {
      const i = this.chooseStat();
      if (i < 0 || !this.upgradeStat(i)) break;
    }
    while (this.canEvolve()) {
      this.evolve(this.chooseClass(this.evolveOptions()));
    }
  }

  chooseStat() {
    let total = 0;
    const cand = [];
    for (let i = 0; i < STATS.length; i++) {
      const need = this.build[i] - this.stats[i];
      if (need > 0) { cand.push(i, need); total += need; }
    }
    if (total > 0) {
      let roll = Math.random() * total;
      for (let k = 0; k < cand.length; k += 2) {
        roll -= cand[k + 1];
        if (roll <= 0) return cand[k];
      }
      return cand[cand.length - 2];
    }
    const rest = [];
    for (let i = 0; i < STATS.length; i++) if (this.stats[i] < CONFIG.STAT_MAX) rest.push(i);
    return rest.length ? pick(rest) : -1;
  }

  chooseClass(options) {
    const pref = BOT_CLASS_PREF[this.buildId];
    if (pref) {
      const filtered = options.filter((o) => pref.includes(o));
      if (filtered.length) return pick(filtered);
    }
    return pick(options);
  }

  // ---------- Полезные величины ----------
  get range() {
    const g = this.cls.mainGun;
    return this.bulletSpeed * g.speed * CONFIG.BULLET_LIFE * g.life * 0.85;
  }
  get prefDist() {
    const base = 330 * (this.cls.fov || 1) + (this.buildId === 'sniper' ? 120 : 0);
    return Math.min(base, this.range * 0.8);
  }

  // Можно ли таранить полигон без риска погибнуть
  canRam(shape) {
    if (!this.isRammer || shape.type === 'alpha') return false;
    return shape.type !== 'pentagon' || this.level >= 20;
  }

  // Угол с упреждением по скорости цели
  leadAngle(t) {
    const g = this.cls.mainGun;
    const bs = this.bulletSpeed * g.speed;
    let px = t.x, py = t.y;
    for (let k = 0; k < 2; k++) {
      const time = Math.hypot(px - this.x, py - this.y) / bs;
      px = t.x + t.vx * time * this.skill;
      py = t.y + t.vy * time * this.skill;
    }
    return Math.atan2(py - this.y, px - this.x);
  }

  pickWanderPoint() {
    const W = CONFIG.WORLD_SIZE, c = W / 2;
    if (this.level >= 25 && Math.random() < 0.4) {
      // Сильные боты охотно идут к гнезду пятиугольников
      const a = Math.random() * TAU, d = Math.random() * CONFIG.NEST_RADIUS * 1.1;
      this.wx = c + Math.cos(a) * d;
      this.wy = c + Math.sin(a) * d;
    } else {
      this.wx = rand(300, W - 300);
      this.wy = rand(300, W - 300);
    }
    this.wanderT = rand(6, 14);
  }

  // ---------- Принятие решений (несколько раз в секунду) ----------
  think(game) {
    const sight = 900 * this.viewFov;
    const hpRatio = this.hp / this.maxHp;

    // Ближайший противник с учётом «интереса» (слабые цели менее интересны)
    let enemy = null, bestCost = Infinity, enemyDist = 0;
    for (const t of game.tanks) {
      if (t === this || t.dead || t.opacity < 0.35 || t.invulnT > 0) continue;
      const d = Math.hypot(t.x - this.x, t.y - this.y);
      if (d > sight) continue;
      // Намного более слабые танки интересны только самым агрессивным ботам (или если совсем рядом)
      const diff = this.level - t.level;
      if (diff > 12 && d > 260 && this.aggression < 0.85) continue;
      const cost = d * (1 + Math.max(0, diff) * 0.02);
      if (cost < bestCost) { bestCost = cost; enemy = t; enemyDist = d; }
    }

    if (enemy) {
      const danger = enemy.level - this.level;
      if ((hpRatio < 0.3 && enemyDist < 650) || (danger > 14 && enemyDist < 520 && this.aggression < 0.7)) {
        this.mode = 'flee';
        this.target = enemy;
        return;
      }
      const engage = sight * (0.4 + 0.6 * this.aggression);
      if (enemyDist < engage) {
        this.mode = 'fight';
        this.target = enemy;
        return;
      }
    }

    // Продолжаем фармить текущий полигон (чтобы не метаться между целями)
    const cur = this.target;
    if (this.mode === 'farm' && cur && !cur.dead && cur.kind === 'shape' && Math.random() < 0.8) return;

    // Ищем самый «выгодный» полигон поблизости
    let best = null, bestScore = 0;
    const self = this;
    game.grid.query(this.x, this.y, 700, (e) => {
      if (e.kind !== 'shape' || e.dead) return;
      if (e.type === 'alpha' && self.level < 28) return;
      const d = Math.hypot(e.x - self.x, e.y - self.y);
      if (d > 700) return;
      const sc = Math.sqrt(e.def.xp) / (d + 150);
      if (sc > bestScore) { bestScore = sc; best = e; }
    });
    if (best) {
      this.mode = 'farm';
      this.target = best;
    } else {
      this.mode = 'wander';
      this.target = null;
    }
  }

  // ---------- Управление (каждый шаг физики) ----------
  steer(game, dt) {
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = rand(0.15, 0.3) + (1 - this.skill) * 0.25;
      this.aimNoise = (Math.random() - 0.5) * (1 - this.skill) * 0.35;
      this.autoUpgrade();
      this.think(game);
    }

    const tg0 = this.target;
    if (tg0 && (tg0.dead || (tg0.kind === 'tank' && tg0.opacity < 0.35))) {
      this.target = null;
      this.mode = 'wander';
    }

    let mx = 0, my = 0;
    let aim = null;
    let wantFire = false;
    const tg = this.target;

    if (tg) {
      const dx = tg.x - this.x, dy = tg.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;
      if (this.mode === 'fight') {
        // Держим комфортную дистанцию и кружим вокруг цели (таран — прямо в цель)
        const pref = this.isRammer ? 0 : this.prefDist;
        if (d > pref + 70) { mx += nx; my += ny; }
        else if (d < pref - 70) { mx -= nx; my -= ny; }
        if (!this.isRammer) { mx += -ny * this.strafeDir * 0.8; my += nx * this.strafeDir * 0.8; }
        aim = this.leadAngle(tg);
        wantFire = d < this.range;
      } else if (this.mode === 'flee') {
        mx -= nx; my -= ny;
        mx += -ny * this.strafeDir * 0.4; my += nx * this.strafeDir * 0.4;
        aim = this.leadAngle(tg);
        wantFire = d < this.range;
      } else if (this.mode === 'farm') {
        const ram = this.canRam(tg);
        const stop = ram ? 0 : 200 + tg.r;
        if (d > stop + 40) { mx += nx; my += ny; }
        else if (d < stop - 60) { mx -= nx * 0.6; my -= ny * 0.6; }
        aim = Math.atan2(dy, dx);
        wantFire = d < this.range * 0.9;
      }
    } else {
      // Блуждание по карте
      this.wanderT -= dt;
      const dx = this.wx - this.x, dy = this.wy - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 120 || this.wanderT <= 0) this.pickWanderPoint();
      else { mx += dx / d; my += dy / d; }
    }

    // Уклонение от препятствий, танков, пуль и стен
    const av = this.avoidance(game);
    mx += av.x;
    my += av.y;

    const len = Math.hypot(mx, my);
    if (len > 0.2) { this.moveX = mx / len; this.moveY = my / len; }
    else { this.moveX = 0; this.moveY = 0; }

    // Периодически меняем направление кружения
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = rand(0.8, 2.8);
      if (Math.random() < 0.6) this.strafeDir *= -1;
    }

    // Плавный поворот пушки к цели
    const turn = (4 + 8 * this.skill) * dt;
    if (aim !== null) {
      this.angle = rotateTowards(this.angle, aim + this.aimNoise, turn);
      this.firing = wantFire && Math.abs(angleDiff(this.angle, aim)) < 0.3;
    } else {
      if (len > 0.2) this.angle = rotateTowards(this.angle, Math.atan2(this.moveY, this.moveX), turn * 0.4);
      this.firing = false;
    }
  }

  avoidance(game) {
    let ax = 0, ay = 0;
    const self = this, tg = this.target;
    const ramming = this.isRammer;
    game.grid.query(this.x, this.y, 280, (e) => {
      if (e === self || e.dead) return;

      if (e.kind === 'bullet') {
        // Уклонение от летящих в нас пуль (только у «умелых» ботов)
        if (e.owner === self || self.skill < 0.45) return;
        const rx = self.x - e.x, ry = self.y - e.y;
        const sp = Math.hypot(e.vx, e.vy) || 1;
        const ux = e.vx / sp, uy = e.vy / sp;
        const along = rx * ux + ry * uy;
        if (along <= 0 || along > 320) return;
        const cross = rx * uy - ry * ux;            // смещение бота от линии полёта пули
        const danger = self.r + e.r + 18;
        if (Math.abs(cross) > danger) return;
        const side = cross > 0 ? -1 : 1;            // уходим в ту сторону, где уже находимся
        const w = (danger - Math.abs(cross)) / danger * 2 * self.skill;
        ax += -uy * side * w;
        ay += ux * side * w;
        return;
      }

      // Цель тарана не обходим
      if (ramming && e === tg && (e.kind === 'tank' || self.canRam(e))) return;
      const dx = self.x - e.x, dy = self.y - e.y;
      const range = e.r + self.r + (e.kind === 'tank' ? 70 : 40) + (e.type === 'alpha' ? 80 : 0);
      const d2 = dx * dx + dy * dy;
      if (d2 > range * range) return;
      const d = Math.sqrt(d2) || 1;
      const w = (range - d) / range * 2.5;
      ax += dx / d * w;
      ay += dy / d * w;
    });

    // Стены
    const W = CONFIG.WORLD_SIZE, m = 220;
    if (this.x < m) ax += (m - this.x) / m * 2;
    if (this.x > W - m) ax -= (this.x - (W - m)) / m * 2;
    if (this.y < m) ay += (m - this.y) / m * 2;
    if (this.y > W - m) ay -= (this.y - (W - m)) / m * 2;
    return { x: ax, y: ay };
  }
}
