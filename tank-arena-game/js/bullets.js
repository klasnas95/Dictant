'use strict';
// ============================================================
//  bullets.js — пули: летят прямо, имеют урон и «пробивание»
//  (запас прочности), исчезают по таймеру или при попадании
// ============================================================

class Bullet {
  constructor(owner, x, y, angle, speed, radius, damage, pen, life) {
    this.id = nextEntityId++;
    this.kind = 'bullet';
    this.owner = owner;
    this.color = owner.color;
    this.stroke = shadeColor(owner.color, -0.25);

    this.x = x; this.y = y;
    this.px = x; this.py = y;
    this.rx = x; this.ry = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;

    this.r = radius;
    this.damage = damage;   // урон за одно попадание
    this.hp = pen;          // «пробивание»: уменьшается при каждом попадании
    this.life = life;       // оставшееся время жизни
    this.mass = 0.3;

    this.hits = new Set();  // id объектов, по которым уже попали (чтобы не бить дважды)
    this.dead = false;
    this.deathT = 0;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    const W = CONFIG.WORLD_SIZE;
    if (this.life <= 0 || this.x < -150 || this.y < -150 || this.x > W + 150 || this.y > W + 150) {
      this.dead = true;
    }
  }

  draw(ctx) {
    let r = this.r, alpha = 1;
    if (this.dead) {
      const k = Math.min(1, this.deathT / CONFIG.DEATH_ANIM);
      r *= 1 + 0.6 * k;
      alpha = 1 - k;
    }
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(this.rx, this.ry, r, 0, TAU);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.lineWidth = clamp(this.r * 0.3, 1.5, 4);
    ctx.strokeStyle = this.stroke;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
