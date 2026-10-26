// Полигоны на карте: квадраты, треугольники, пятиугольники и альфа-пятиугольники.

const shapes = [];            // все полигоны на арене
const shapeSpawnTimers = {};  // таймеры появления новых полигонов для каждого типа

class Shape {
  constructor(type, x, y) {
    this.type = type;
    this.def = SHAPE_TYPES[type];
    this.x = x;
    this.y = y;
    this.vx = rand(-15, 15);        // медленный дрейф по арене
    this.vy = rand(-15, 15);
    this.rot = rand(0, Math.PI * 2);
    this.spin = rand(-0.3, 0.3);
    this.radius = this.def.radius;
    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    this.flash = 0;                 // белая вспышка при попадании (1 → 0)
    this.dead = false;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const damp = Math.exp(-2.5 * dt);
    this.vx *= damp;
    this.vy *= damp;
    this.rot += this.spin * dt;
    this.x = clamp(this.x, this.radius, CONFIG.WORLD_SIZE - this.radius);
    this.y = clamp(this.y, this.radius, CONFIG.WORLD_SIZE - this.radius);
    this.flash = Math.max(0, this.flash - dt * 6);
  }

  // Получить урон. owner — танк, которому засчитывается опыт за разрушение
  hit(damage, owner) {
    if (this.dead) return;
    this.hp -= damage;
    this.flash = 1;
    if (this.hp <= 0) {
      this.dead = true;
      if (owner) owner.addXp(this.def.xp);
      spawnParticles(this.x, this.y, this.def.color, 14, 220);
    }
  }
}

// Создать полигон нужного типа в случайной точке арены
function spawnShape(type) {
  const m = 120;
  shapes.push(new Shape(type, rand(m, CONFIG.WORLD_SIZE - m), rand(m, CONFIG.WORLD_SIZE - m)));
}

// Заполнить арену полигонами в начале игры
function fillShapes() {
  shapes.length = 0;
  for (const type in SHAPE_TYPES) {
    for (let i = 0; i < SHAPE_TYPES[type].maxCount; i++) spawnShape(type);
  }
}

// Поддерживать количество полигонов: новые появляются вместо уничтоженных
function updateShapeSpawns(dt) {
  const counts = {};
  for (const s of shapes) counts[s.type] = (counts[s.type] || 0) + 1;
  for (const type in SHAPE_TYPES) {
    shapeSpawnTimers[type] = (shapeSpawnTimers[type] || 0) - dt;
    if (shapeSpawnTimers[type] <= 0 && (counts[type] || 0) < SHAPE_TYPES[type].maxCount) {
      spawnShape(type);
      shapeSpawnTimers[type] = CONFIG.SHAPE_SPAWN_INTERVAL;
    }
  }
}

// Удалить уничтоженные полигоны из мира
function cleanupShapes() {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (shapes[i].dead) shapes.splice(i, 1);
  }
}

// Столкновение танка с полигонами (круговые хитбоксы): выталкивание,
// урон полигона танку и таранный урон танка полигону
function collideTankWithShapes(tank, dt) {
  for (const s of shapes) {
    if (s.dead) continue;
    const dx = tank.x - s.x;
    const dy = tank.y - s.y;
    const d = Math.hypot(dx, dy);
    const minD = tank.radius + s.radius;
    if (d >= minD || d === 0) continue;

    const nx = dx / d;
    const ny = dy / d;
    const overlap = minD - d;
    // Танк «тяжелее» полигона, поэтому полигон смещается сильнее
    tank.x += nx * overlap * 0.7;
    tank.y += ny * overlap * 0.7;
    s.x -= nx * overlap * 0.3;
    s.y -= ny * overlap * 0.3;

    tank.takeDamage(s.def.contactDps * dt, null);
    s.hit(tank.ramDps * dt, tank);
  }
}
