'use strict';
// ============================================================
//  particles.js — визуальные эффекты: осколки, кольца,
//  всплывающие надписи с опытом
// ============================================================

const Particles = {
  list: [],     // осколки
  rings: [],    // расходящиеся кольца
  texts: [],    // всплывающие надписи (+опыт)
  MAX: 700,

  // Разлёт осколков из точки
  burst(x, y, color, count, o = {}) {
    const speed = o.speed || 180, size = o.size || 5, life = o.life || 0.7, sides = o.sides || 0;
    const stroke = shadeColor(color.startsWith('#') ? color : '#888888', -0.25);
    for (let i = 0; i < count; i++) {
      if (this.list.length >= this.MAX) break;
      const a = Math.random() * TAU, s = speed * (0.35 + Math.random() * 0.85);
      const l = life * (0.6 + Math.random() * 0.6);
      this.list.push({
        x, y, px: x, py: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: l, max: l,
        size: size * (0.5 + Math.random() * 0.8),
        color, stroke,
        rot: Math.random() * TAU, vr: rand(-8, 8),
        sides,
      });
    }
  },

  ring(x, y, color, radius) {
    this.rings.push({ x, y, color, radius, t: 0, max: 0.5 });
  },

  text(x, y, str, color) {
    this.texts.push({ x, y, str, color, t: 0, max: 1.1 });
  },

  update(dt) {
    const fr = Math.exp(-3.2 * dt);
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.px = p.x; p.py = p.y;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= fr; p.vy *= fr;
      p.rot += p.vr * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.max) this.rings.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      if (t.t >= t.max) this.texts.splice(i, 1);
    }
  },

  // Отрисовка в мировых координатах (с интерполяцией)
  draw(ctx, view, alpha) {
    ctx.lineJoin = 'round';
    for (const p of this.list) {
      const x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha;
      if (x < view.l - 20 || x > view.r + 20 || y < view.t - 20 || y > view.b + 20) continue;
      const k = p.life / p.max;
      const s = p.size * (0.35 + 0.65 * k);
      ctx.globalAlpha = Math.min(1, k * 1.4);
      ctx.beginPath();
      if (p.sides >= 3) polygonPath(ctx, x, y, s, p.sides, p.rot);
      else ctx.arc(x, y, s, 0, TAU);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.lineWidth = Math.max(1, s * 0.25);
      ctx.strokeStyle = p.stroke;
      ctx.stroke();
    }
    for (const r of this.rings) {
      const k = r.t / r.max;
      ctx.globalAlpha = (1 - k) * 0.6;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * (0.3 + 0.7 * k), 0, TAU);
      ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.strokeStyle = r.color;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  // Надписи рисуются в экранных координатах (toScreen — функция преобразования)
  drawTexts(ctx, toScreen) {
    if (!this.texts.length) return;
    ctx.font = '800 18px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of this.texts) {
      const k = t.t / t.max;
      const p = toScreen(t.x, t.y);
      const y = p.y - 20 - k * 45;
      ctx.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(30, 40, 50, 0.8)';
      ctx.strokeText(t.str, p.x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, p.x, y);
    }
    ctx.globalAlpha = 1;
  },
};
