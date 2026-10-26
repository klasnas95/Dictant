// Вспомогательные функции и система частиц.

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// Случайное целое от min до max включительно
function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

// Плавное приближение значения к цели; не зависит от частоты кадров
function expLerp(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

// Случайная точка на арене, по возможности вдали от живых танков из others
function randomSpawnPoint(others) {
  const margin = 300;
  let best = null;
  let bestDist = -1;
  for (let i = 0; i < 12; i++) {
    const x = rand(margin, CONFIG.WORLD_SIZE - margin);
    const y = rand(margin, CONFIG.WORLD_SIZE - margin);
    let nearest = Infinity;
    for (const t of others) {
      if (t.alive) nearest = Math.min(nearest, dist(x, y, t.x, t.y));
    }
    // Достаточно далёкая точка — берём сразу
    if (nearest > 700) return { x, y };
    // Иначе запоминаем самую свободную из проверенных
    if (nearest > bestDist) {
      bestDist = nearest;
      best = { x, y };
    }
  }
  return best;
}

// ---- Частицы: осколки, искры и взрывы ----
const particles = [];

// Создать count частиц в точке (x, y), разлетающихся со скоростью до speed
function spawnParticles(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(speed * 0.3, speed);
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0,
      maxLife: rand(0.35, 0.8),
      size: rand(3, 6),
      color,
    });
  }
}

// Движение частиц, постепенное торможение и удаление по истечении времени
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.maxLife) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const damp = Math.exp(-4 * dt);
    p.vx *= damp;
    p.vy *= damp;
  }
}
