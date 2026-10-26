// ============================================================
// Пули: полёт, время жизни и пробивание целей
// ============================================================

class Bullet {
  constructor(owner, x, y, angle, speed, dmg, radius, life, pierce) {
    this.owner = owner;     // танк-владелец (в него пуля не попадает и за него дают опыт)
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.dmg = dmg;
    this.radius = radius;
    this.life = life;       // оставшееся время жизни, с
    this.pierce = pierce;   // сколько целей ещё может пробить
    this.hit = new Set();   // цели, которые уже задеты (чтобы не бить одну цель дважды)
    this.dead = false;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    // Пуля исчезает по времени или у невидимой стены арены
    const W = CONFIG.WORLD_SIZE;
    if (this.life <= 0 || this.x < 0 || this.y < 0 || this.x > W || this.y > W) {
      this.dead = true;
    }
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.owner.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(30, 40, 60, 0.3)';
    ctx.stroke();
  }
}
