// ============================================================
//  particles.js — частицы: осколки, взрывы, всплывающий текст
// ============================================================

class ParticleSystem {
  constructor() {
    this.list = [];
  }

  add(p) {
    if (this.list.length < CONFIG.PARTICLE_LIMIT) this.list.push(p);
  }

  // Осколки полигона при разрушении
  burstShape(x, y, fill, stroke, size, count) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU), sp = rand(60, 220);
      this.add({
        kind: 'poly', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.4, 0.8), max: 0.8, size: rand(0.12, 0.28) * size, sides: randInt(3, 5),
        rot: rand(0, TAU), vr: rand(-6, 6), fill, stroke,
      });
    }
  }

  // Взрыв танка
  burstTank(x, y, fill, stroke, r) {
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU), sp = rand(80, 380);
      this.add({
        kind: i % 3 === 0 ? 'poly' : 'circle', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.5, 1.0), max: 1.0, size: rand(0.12, 0.34) * r, sides: randInt(3, 5),
        rot: rand(0, TAU), vr: rand(-8, 8), fill: i % 4 === 0 ? BARREL_FILL : fill, stroke,
      });
    }
    // Кольцо-вспышка
    this.add({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, size: r * 2.4, fill, stroke });
  }

  // Мелкие искры при попадании пули
  spark(x, y, fill) {
    for (let i = 0; i < 3; i++) {
      const a = rand(0, TAU), sp = rand(40, 120);
      this.add({
        kind: 'circle', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.25, max: 0.25, size: rand(2, 3.5), fill, stroke: null,
      });
    }
  }

  // Всплывающий текст (+опыт)
  floatText(x, y, text, color) {
    this.add({ kind: 'text', x, y, vx: 0, vy: -50, life: 1.0, max: 1.0, text, fill: color });
  }

  update(dt) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      const drag = Math.exp(-dt * 3);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.rot !== undefined) p.rot += p.vr * dt;
    }
  }

  draw(ctx, camScale) {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const t = p.life / p.max;
      ctx.globalAlpha = Math.min(1, t * 1.6);
      if (p.kind === 'circle') {
        ctx.fillStyle = p.fill;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + t * 0.5), 0, TAU);
        ctx.fill();
      } else if (p.kind === 'poly') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        for (let k = 0; k < p.sides; k++) {
          const a = (k / p.sides) * TAU;
          ctx.lineTo(Math.cos(a) * p.size, Math.sin(a) * p.size);
        }
        ctx.closePath();
        ctx.fillStyle = p.fill;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.stroke;
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.fill;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - t * 0.7), 0, TAU);
        ctx.stroke();
      } else if (p.kind === 'text') {
        const px = 20 / camScale; // постоянный размер на экране
        ctx.font = `bold ${px}px Ubuntu, "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = px * 0.18;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.fill;
        ctx.fillText(p.text, p.x, p.y);
      }
    }
    ctx.globalAlpha = 1;
  }
}
