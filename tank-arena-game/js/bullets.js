// ============================================================
//  bullets.js — пули (с пулом объектов, чтобы не нагружать GC)
// ============================================================

class Bullet {
  constructor() {
    this.kind = 'bullet';
    this.dead = true;
    this.hitIds = []; // кого пуля уже задела (одну цель — один раз)
  }

  init(o) {
    this.id = nextId();
    this.owner = o.owner;
    this.x = o.x;
    this.y = o.y;
    this.vx = Math.cos(o.dir) * o.speed;
    this.vy = Math.sin(o.dir) * o.speed;
    this.speed = o.speed;
    this.r = o.r;
    this.dmg = o.dmg;
    this.pen = o.pen;       // «здоровье» пули: каждое попадание отнимает 1
    this.life = o.life;
    this.color = o.color;
    this.stroke = o.stroke;
    this.dead = false;
    this.hitIds.length = 0;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    const W = CONFIG.WORLD_SIZE;
    // Невидимые стены арены: пуля исчезает на границе
    if (this.life <= 0 || this.x < 0 || this.y < 0 || this.x > W || this.y > W) this.dead = true;
  }

  draw(ctx) {
    ctx.globalAlpha = this.life < 0.2 ? Math.max(0, this.life / 0.2) : 1;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, TAU);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.lineWidth = Math.max(2, this.r * 0.3);
    ctx.strokeStyle = this.stroke;
    ctx.stroke();
  }
}

class BulletManager {
  constructor() {
    this.list = [];
    this.pool = [];
  }

  spawn(o) {
    const b = this.pool.pop() || new Bullet();
    b.init(o);
    this.list.push(b);
    return b;
  }

  update(dt) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (!b.dead) b.update(dt);
      if (b.dead) {
        list[i] = list[list.length - 1];
        list.pop();
        this.pool.push(b);
      }
    }
  }

  draw(ctx, cam) {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!cam.isVisible(b.x, b.y, b.r + 4)) continue;
      b.draw(ctx);
    }
    ctx.globalAlpha = 1;
  }
}
