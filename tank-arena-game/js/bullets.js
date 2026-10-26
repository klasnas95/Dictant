// Пули: полёт, попадания в танки и полигоны, пробивание сквозь цели.

const bullets = [];

class Bullet {
  constructor(owner, x, y, angle, speed, damage, pierce, radius) {
    this.owner = owner;
    this.color = owner.color;
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.pierce = pierce;           // сколько целей ещё можно пробить
    this.radius = radius;
    this.life = CONFIG.BULLET_LIFE;
    this.hitTargets = new Set();    // цели, которые пуля уже задела
    this.dead = false;
  }
}

// Попадание: пуля теряет силу; если пробивать больше некого — исчезает
function registerHit(bullet) {
  if (bullet.pierce > 0) bullet.pierce--;
  else bullet.dead = true;
}

// Полёт всех пуль и проверка попаданий в танки и полигоны
function updateBullets(dt, tanks) {
  const size = CONFIG.WORLD_SIZE;
  for (const b of bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > size || b.y > size) {
      b.dead = true;
      continue;
    }

    for (const t of tanks) {
      if (!t.alive || t === b.owner || b.hitTargets.has(t)) continue;
      if (dist(b.x, b.y, t.x, t.y) < b.radius + t.radius) {
        t.takeDamage(b.damage, b.owner);
        b.hitTargets.add(t);
        spawnParticles(b.x, b.y, b.color, 4, 120);
        registerHit(b);
        if (b.dead) break;
      }
    }
    if (b.dead) continue;

    for (const s of shapes) {
      if (s.dead || b.hitTargets.has(s)) continue;
      if (dist(b.x, b.y, s.x, s.y) < b.radius + s.radius) {
        s.hit(b.damage, b.owner);
        // Попадание слегка сдвигает полигон
        s.vx += b.vx * 0.03;
        s.vy += b.vy * 0.03;
        b.hitTargets.add(s);
        spawnParticles(b.x, b.y, b.color, 3, 100);
        registerHit(b);
        if (b.dead) break;
      }
    }
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    if (bullets[i].dead) bullets.splice(i, 1);
  }
}
