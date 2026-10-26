// ============================================================
//  collisions.js — столкновения (круговые хитбоксы + пространственная сетка)
//
//  Пары обрабатываются один раз: каждая сущность проверяет только
//  соседей с БОЛЬШИМ id, а stamp защищает от повторов, когда пара
//  делит сразу несколько ячеек сетки.
// ============================================================

class CollisionSystem {
  constructor() {
    this.grid = new SpatialGrid(CONFIG.WORLD_SIZE, 220);
    this.all = [];
  }

  update(dt, game) {
    const grid = this.grid, all = this.all;
    grid.clear();
    all.length = 0;

    for (const s of game.shapes.list) if (!s.dead) all.push(s);
    for (const t of game.tanks) if (!t.dead) all.push(t);
    for (const b of game.bullets.list) if (!b.dead) all.push(b);
    for (let i = 0; i < all.length; i++) grid.insert(all[i]);

    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      if (a.dead) continue;
      const c0 = grid.index(a.x - a.r), c1 = grid.index(a.x + a.r);
      const r0 = grid.index(a.y - a.r), r1 = grid.index(a.y + a.r);
      for (let cy = r0; cy <= r1; cy++) {
        for (let cx = c0; cx <= c1; cx++) {
          const cell = grid.cells[cy * grid.cols + cx];
          for (let k = 0; k < cell.length; k++) {
            const b = cell[k];
            if (b.id <= a.id || b.dead || b._stamp === a.id) continue;
            b._stamp = a.id;
            this.resolve(a, b, dt, game);
          }
        }
      }
    }
  }

  resolve(a, b, dt, game) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const rr = a.r + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return;

    if (a.kind === 'bullet' || b.kind === 'bullet') {
      const bullet = a.kind === 'bullet' ? a : b;
      const other = bullet === a ? b : a;
      this.bulletHit(bullet, other, game);
      return;
    }

    const d = Math.sqrt(d2) || 0.0001;
    const nx = dx / d, ny = dy / d; // нормаль от a к b
    const overlap = rr - d;

    if (a.kind === 'shape' && b.kind === 'shape') {
      // Полигоны мягко расталкиваются
      const push = overlap * 0.15;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      return;
    }

    // Масса ~ площади; полигоны чуть «тяжелее» танков того же размера
    const ma = a.r * a.r * (a.kind === 'shape' ? 1.5 : 1);
    const mb = b.r * b.r * (b.kind === 'shape' ? 1.5 : 1);
    const tot = ma + mb;
    a.x -= nx * overlap * (mb / tot); a.y -= ny * overlap * (mb / tot);
    b.x += nx * overlap * (ma / tot); b.y += ny * overlap * (ma / tot);
    const kick = 60 + Math.min(overlap, 40) * 10;
    a.knock(-nx * kick * (mb / tot), -ny * kick * (mb / tot));
    b.knock(nx * kick * (ma / tot), ny * kick * (ma / tot));

    // Урон при касании (в секунду * dt), пока кто-то из танков неуязвим — урона нет
    if (a.kind === 'tank' && b.kind === 'tank') {
      if (a.invuln <= 0 && b.invuln <= 0) {
        b.takeDamage(a.bodyDps * dt, a);
        a.takeDamage(b.bodyDps * dt, b);
      }
    } else {
      const tank = a.kind === 'tank' ? a : b;
      const shape = tank === a ? b : a;
      if (tank.invuln <= 0) {
        shape.damage(tank.bodyDps * dt, tank);
        tank.takeDamage(shape.def.bodyDps * dt, shape);
      }
    }
  }

  bulletHit(bullet, other, game) {
    if (bullet.dead) return;

    // Пуля против пули: пули разных владельцев гасят друг друга
    if (other.kind === 'bullet') {
      if (other.owner === bullet.owner) return;
      bullet.pen -= 1;
      other.pen -= 1;
      if (bullet.pen <= 0) bullet.dead = true;
      if (other.pen <= 0) other.dead = true;
      return;
    }

    if (other.kind === 'tank') {
      if (other === bullet.owner || other.invuln > 0) return;
    }
    if (bullet.hitIds.includes(other.id)) return;
    bullet.hitIds.push(other.id);

    const ux = bullet.vx / bullet.speed, uy = bullet.vy / bullet.speed;
    const power = Math.sqrt(bullet.dmg);
    if (other.kind === 'shape') {
      other.knock(ux * 18 * power * (22 / other.r), uy * 18 * power * (22 / other.r));
      other.damage(bullet.dmg, bullet.owner);
    } else {
      other.knock(ux * 10 * power, uy * 10 * power);
      other.takeDamage(bullet.dmg, bullet.owner);
    }
    game.particles.spark(bullet.x, bullet.y, bullet.color);

    bullet.pen -= 1;
    if (bullet.pen <= 0) bullet.dead = true;
  }
}
