// ============================================================
// Полигоны на арене: жёлтые квадраты, красные треугольники,
// синие пятиугольники и крупные альфа-пятиугольники
// ============================================================

// Путь правильного многоугольника с центром (cx, cy)
function polygonPath(ctx, cx, cy, radius, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i * Math.PI * 2) / sides;
    const px = cx + Math.cos(a) * radius;
    const py = cy + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

class Shape {
  constructor(type) {
    this.type = type;
    this.def = SHAPE_DEFS[type];
    this.reset();
  }

  // Ставит полигон в случайную точку арены (также используется при респавне)
  reset() {
    const margin = this.def.radius + 60;
    this.x = rand(margin, CONFIG.WORLD_SIZE - margin);
    this.y = rand(margin, CONFIG.WORLD_SIZE - margin);
    this.vx = 0;
    this.vy = 0;
    this.rot = rand(0, Math.PI * 2);
    this.spin = rand(-0.4, 0.4);
    this.hp = this.def.hp;
    this.alive = true;
    this.respawnTimer = 0;
    this.hitFlash = 0;
    this.lastHitBy = null;   // танк, который последним нанёс урон (получит опыт)
  }

  update(dt) {
    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.reset();
      return;
    }
    this.rot += this.spin * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // После толчка полигон постепенно останавливается
    const friction = Math.exp(-dt * 3);
    this.vx *= friction;
    this.vy *= friction;
    // Не даём полигону уйти за невидимые стены
    const r = this.def.radius;
    this.x = clamp(this.x, r, CONFIG.WORLD_SIZE - r);
    this.y = clamp(this.y, r, CONFIG.WORLD_SIZE - r);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
  }

  // Получение урона от пули или таранного удара
  damage(amount, source) {
    if (!this.alive) return;
    this.hp -= amount;
    this.hitFlash = 0.08;
    this.lastHitBy = source;
  }

  // Полигон разрушен (вызывается из main.js, когда hp <= 0)
  destroy() {
    this.alive = false;
    this.respawnTimer = rand(4, 8);
  }

  // Столкновение с танком: толкаем друг друга и наносим взаимный контактный урон
  collideWithTank(tank, dt) {
    if (!this.alive || !tank.alive) return;
    const minD = this.def.radius + CONFIG.TANK_RADIUS;
    const dx = tank.x - this.x;
    const dy = tank.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d >= minD || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    const overlap = minD - d;
    // Танк смещается сильнее полигона: полигон будто тяжелее
    tank.x += nx * overlap * 0.6;
    tank.y += ny * overlap * 0.6;
    this.x -= nx * overlap * 0.4;
    this.y -= ny * overlap * 0.4;
    // Полигон бьёт танк, а танк — полигон (с учётом Body Damage)
    tank.damage(this.def.contactDps * dt, this);
    this.damage(CONFIG.BASE_BODY_DAMAGE * tank.bodyMul * dt, tank);
  }

  draw(ctx) {
    if (!this.alive) return;
    const d = this.def;
    // Мягкая тень под полигоном
    polygonPath(ctx, this.x + 3, this.y + 5, d.radius, d.sides, this.rot);
    ctx.fillStyle = 'rgba(40, 50, 80, 0.12)';
    ctx.fill();
    // Корпус (на миг белеет при попадании)
    polygonPath(ctx, this.x, this.y, d.radius, d.sides, this.rot);
    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : d.fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = d.stroke;
    ctx.stroke();
    // У альфа-пятиугольника внутренний контур для объёма
    if (this.type === 'alpha') {
      polygonPath(ctx, this.x, this.y, d.radius * 0.55, d.sides, this.rot);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }
}
