// ============================================================
//  shapes.js — полигоны на карте (квадраты, треугольники, пятиугольники)
// ============================================================

class Shape {
  constructor(game, type, x, y) {
    this.game = game;
    this.id = nextId();
    this.kind = 'shape';
    this.type = type;
    this.def = SHAPE_TYPES[type];
    this.name = this.def.name;
    this.x = x;
    this.y = y;
    this.r = this.def.hitR;
    this.hp = this.maxHp = this.def.hp;
    this.dead = false;
    this.hitFlash = 0;
    this.lastHitTime = -999;
    this.appear = 0; // анимация появления 0..1

    // Медленный дрейф и вращение
    const speed = type === 'alpha' ? rand(4, 8) : rand(6, 18);
    const dir = rand(0, TAU);
    this.dvx = Math.cos(dir) * speed;
    this.dvy = Math.sin(dir) * speed;
    this.kvx = 0; // скорость от толчков (затухает)
    this.kvy = 0;
    this.angle = rand(0, TAU);
    this.spin = (Math.random() < 0.5 ? -1 : 1) * rand(0.2, 0.7) * (type === 'alpha' ? 0.4 : 1);
  }

  // Толчок (от пули или столкновения с танком)
  knock(ax, ay) {
    this.kvx += ax;
    this.kvy += ay;
  }

  damage(amount, owner) {
    if (this.dead) return;
    this.hp -= amount;
    this.hitFlash = 1;
    this.lastHitTime = this.game.time;
    if (this.hp <= 0) {
      this.dead = true;
      this.game.onShapeKilled(this, owner);
    }
  }

  update(dt) {
    this.appear = Math.min(1, this.appear + dt * 2.5);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    const damp = Math.exp(-dt * 2.5);
    this.kvx *= damp;
    this.kvy *= damp;
    this.x += (this.dvx + this.kvx) * dt;
    this.y += (this.dvy + this.kvy) * dt;
    this.angle += this.spin * dt;

    // Отскок от границ арены
    const W = CONFIG.WORLD_SIZE, r = this.r;
    if (this.x < r) { this.x = r; this.dvx = Math.abs(this.dvx); this.kvx = Math.abs(this.kvx); }
    else if (this.x > W - r) { this.x = W - r; this.dvx = -Math.abs(this.dvx); this.kvx = -Math.abs(this.kvx); }
    if (this.y < r) { this.y = r; this.dvy = Math.abs(this.dvy); this.kvy = Math.abs(this.kvy); }
    else if (this.y > W - r) { this.y = W - r; this.dvy = -Math.abs(this.dvy); this.kvy = -Math.abs(this.kvy); }

    // Медленная регенерация, если давно не били
    if (this.hp < this.maxHp && this.game.time - this.lastHitTime > 6) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.02 * dt);
    }
  }

  // Путь многоугольника
  path(ctx, radius) {
    const n = this.def.sides;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = this.angle + (i / n) * TAU;
      const px = this.x + Math.cos(a) * radius, py = this.y + Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  draw(ctx) {
    const R = this.def.drawR * (0.3 + 0.7 * this.appear);
    ctx.lineJoin = 'round';

    // Мягкая тень
    ctx.save();
    ctx.translate(R * 0.1, R * 0.16);
    this.path(ctx, R);
    ctx.fillStyle = 'rgba(0,0,0,0.11)';
    ctx.fill();
    ctx.restore();

    // Тело
    this.path(ctx, R);
    ctx.fillStyle = this.def.fill;
    ctx.fill();
    ctx.lineWidth = Math.max(3, R * 0.1);
    ctx.strokeStyle = this.def.stroke;
    ctx.stroke();

    // Вспышка при попадании
    if (this.hitFlash > 0) {
      this.path(ctx, R);
      ctx.fillStyle = `rgba(255,255,255,${this.hitFlash * 0.45})`;
      ctx.fill();
    }

    // Полоска здоровья (только у повреждённых)
    if (this.hp < this.maxHp) {
      const w = R * 1.5, h = Math.max(5, R * 0.12);
      const bx = this.x - w / 2, by = this.y + R + 10;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(bx - 2, by - 2, w + 4, h + 4);
      ctx.fillStyle = '#85e37d';
      ctx.fillRect(bx, by, w * Math.max(0, this.hp / this.maxHp), h);
    }
  }
}

class ShapeManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.spawnTimer = 0;
    this.alphaTimer = 0; // пауза до следующего Alpha-пятиугольника (они очень «жирные» по опыту)
  }

  // Позиция спавна: пятиугольники тяготеют к центру («гнездо»)
  randomPos(type) {
    const W = CONFIG.WORLD_SIZE, m = 150;
    const nest = type === 'alpha' || (type === 'pentagon' && Math.random() < 0.7);
    if (nest) {
      const a = rand(0, TAU), d = Math.sqrt(Math.random()) * (CONFIG.NEST_RADIUS - 150);
      return { x: W / 2 + Math.cos(a) * d, y: W / 2 + Math.sin(a) * d };
    }
    return { x: rand(m, W - m), y: rand(m, W - m) };
  }

  spawn(type, hidden) {
    const game = this.game;
    for (let tries = 0; tries < 10; tries++) {
      const p = this.randomPos(type);
      const r = SHAPE_TYPES[type].hitR;
      // Не спавним на глазах у игрока
      if (hidden && game.camera.isVisible(p.x, p.y, r + 150)) continue;
      // Не накладываем на другие полигоны
      let free = true;
      for (const s of this.list) {
        const dx = s.x - p.x, dy = s.y - p.y, rr = s.r + r + 12;
        if (dx * dx + dy * dy < rr * rr) { free = false; break; }
      }
      if (!free) continue;
      const s = new Shape(game, type, p.x, p.y);
      s.appear = hidden ? 0 : 1; // новые полигоны плавно «вырастают», стартовые уже на месте
      this.list.push(s);
      return s;
    }
    return null;
  }

  // Начальное заполнение арены
  populate() {
    for (const type in CONFIG.SHAPE_COUNTS) {
      for (let i = 0; i < CONFIG.SHAPE_COUNTS[type]; i++) this.spawn(type, false);
    }
  }

  update(dt) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (!s.dead) s.update(dt);
      if (s.dead) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }

    // Периодически восполняем уничтоженные полигоны за кадром
    this.alphaTimer -= dt;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.35;
      const counts = { square: 0, triangle: 0, pentagon: 0, alpha: 0 };
      for (const s of list) counts[s.type]++;
      for (const type in CONFIG.SHAPE_COUNTS) {
        if (counts[type] >= CONFIG.SHAPE_COUNTS[type]) continue;
        if (type === 'alpha') {
          if (this.alphaTimer > 0) continue;
          this.alphaTimer = CONFIG.ALPHA_RESPAWN;
        }
        this.spawn(type, this.game.state !== 'menu');
      }
    }
  }

  draw(ctx, cam) {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!cam.isVisible(s.x, s.y, s.def.drawR + 30)) continue;
      s.draw(ctx);
    }
  }
}
