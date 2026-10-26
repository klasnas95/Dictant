'use strict';
// ============================================================
//  shapes.js — полигоны: квадраты, треугольники, пятиугольники
//  и альфа-пятиугольники. Дрейфуют, вращаются, дают опыт.
// ============================================================

class Shape {
  constructor(type, x, y) {
    const def = SHAPE_TYPES[type];
    this.id = nextEntityId++;
    this.kind = 'shape';
    this.type = type;
    this.def = def;

    this.x = x; this.y = y;
    this.px = x; this.py = y;     // позиция на прошлом шаге (для интерполяции)
    this.rx = x; this.ry = y;     // позиция отрисовки
    this.vx = 0; this.vy = 0;

    this.r = def.radius * 0.88;   // круговой хитбокс чуть меньше описанной окружности
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.mass = def.mass;

    this.angle = Math.random() * TAU;
    this.spin = rand(0.15, 0.5) * (Math.random() < 0.5 ? -1 : 1) * (type === 'alpha' ? 0.25 : 1);
    this.driftA = Math.random() * TAU;          // направление медленного дрейфа
    this.driftS = type === 'alpha' ? 3 : rand(3, 9);

    this.dead = false;
    this.deathT = 0;
    this.flash = 0;        // вспышка при попадании
    this.spawnT = 0;       // анимация появления 0..1
    this.hpShowT = 0;      // сколько ещё показывать полоску здоровья
    this.lastHitBy = null; // кто нанёс последний урон (для начисления опыта)
  }

  get contactDps() { return this.def.contact; }
  get pierceCost() { return this.def.pierce; }

  takeDamage(amount, source) {
    if (this.dead || amount <= 0) return;
    this.hp -= amount;
    this.flash = 1;
    this.hpShowT = 3;
    if (source && source.kind === 'tank') this.lastHitBy = source;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }

  update(dt) {
    // Медленный случайный дрейф: скорость плавно стремится к «дрейфовой»
    this.driftA += (Math.random() - 0.5) * dt;
    const tx = Math.cos(this.driftA) * this.driftS, ty = Math.sin(this.driftA) * this.driftS;
    const k = smoothFactor(1.2, dt);
    this.vx += (tx - this.vx) * k;
    this.vy += (ty - this.vy) * k;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.spin * dt;

    // Невидимые стены арены
    const W = CONFIG.WORLD_SIZE, r = this.r;
    if (this.x < r) { this.x = r; this.vx = Math.abs(this.vx); this.driftA = PI - this.driftA; }
    else if (this.x > W - r) { this.x = W - r; this.vx = -Math.abs(this.vx); this.driftA = PI - this.driftA; }
    if (this.y < r) { this.y = r; this.vy = Math.abs(this.vy); this.driftA = -this.driftA; }
    else if (this.y > W - r) { this.y = W - r; this.vy = -Math.abs(this.vy); this.driftA = -this.driftA; }

    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 6);
    if (this.spawnT < 1) this.spawnT = Math.min(1, this.spawnT + dt * 3);
    if (this.hpShowT > 0) this.hpShowT -= dt;
  }

  // Масштаб и прозрачность для анимаций появления/исчезновения
  animState() {
    if (this.dead) {
      const k = Math.min(1, this.deathT / CONFIG.DEATH_ANIM);
      return { scale: 1 + 0.5 * k, alpha: 1 - k };
    }
    if (this.spawnT < 1) return { scale: 0.4 + 0.6 * this.spawnT, alpha: this.spawnT };
    return { scale: 1, alpha: 1 };
  }

  // Мягкая тень — добавляется в общий путь, заливается один раз для всех фигур
  shadowPath(ctx) {
    const R = this.def.radius * (this.spawnT < 1 ? 0.4 + 0.6 * this.spawnT : 1);
    polygonPath(ctx, this.rx, this.ry + 3 + R * 0.1, R, this.def.sides, this.angle);
  }

  draw(ctx) {
    const d = this.def;
    const st = this.animState();
    const R = d.radius * st.scale;
    ctx.globalAlpha = st.alpha;
    ctx.beginPath();
    polygonPath(ctx, this.rx, this.ry, R, d.sides, this.angle);
    ctx.fillStyle = d.color;
    ctx.fill();
    ctx.lineWidth = this.type === 'alpha' ? 5 : 3.5;
    ctx.strokeStyle = d.stroke;
    ctx.stroke();
    if (this.flash > 0.01) {
      ctx.fillStyle = 'rgba(255,255,255,' + (this.flash * 0.5).toFixed(3) + ')';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
