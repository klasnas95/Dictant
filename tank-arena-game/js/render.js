// Отрисовка: камера, арена с сеткой, полигоны, танки, пули, частицы и миникарта.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const minimap = document.getElementById('minimap');
const mapCtx = minimap.getContext('2d');
const TAU = Math.PI * 2;

// Камера: позиция в мире и масштаб (zoom уменьшается с ростом уровня)
const camera = { x: CONFIG.WORLD_SIZE / 2, y: CONFIG.WORLD_SIZE / 2, zoom: 1 };

// Подгоняем размер холста под окно с учётом плотности пикселей
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
}
window.addEventListener('resize', resizeCanvas);

// Экранные координаты (px окна) → мировые
function screenToWorld(sx, sy) {
  return {
    x: camera.x + (sx - innerWidth / 2) / camera.zoom,
    y: camera.y + (sy - innerHeight / 2) / camera.zoom,
  };
}

// Камера плавно следит за целью; чем выше уровень, тем шире обзор
function updateCamera(dt, target) {
  camera.x = expLerp(camera.x, target.x, 8, dt);
  camera.y = expLerp(camera.y, target.y, 8, dt);
  const zoomTarget = 1 - (0.3 * (target.level - 1)) / (CONFIG.MAX_LEVEL - 1);
  camera.zoom = expLerp(camera.zoom, zoomTarget, 2, dt);
}

// Попадает ли объект в видимую область (с запасом r)
function inView(x, y, r) {
  const hw = innerWidth / (2 * camera.zoom) + r;
  const hh = innerHeight / (2 * camera.zoom) + r;
  return Math.abs(x - camera.x) < hw && Math.abs(y - camera.y) < hh;
}

// Контур правильного многоугольника
function polygonPath(x, y, r, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i * TAU) / sides;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// Полоска (здоровье и т. п.)
function drawBar(x, y, w, h, ratio, color) {
  ctx.fillStyle = 'rgba(40, 50, 70, 0.25)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(ratio, 0, 1), h);
}

// Арена и сетка. Фон за пределами арены другой: граница видна, но стены нет
function drawArena() {
  const W = CONFIG.WORLD_SIZE;
  ctx.fillStyle = CONFIG.ARENA_COLOR;
  ctx.fillRect(0, 0, W, W);

  const hw = innerWidth / (2 * camera.zoom);
  const hh = innerHeight / (2 * camera.zoom);
  const x0 = Math.max(0, camera.x - hw);
  const x1 = Math.min(W, camera.x + hw);
  const y0 = Math.max(0, camera.y - hh);
  const y1 = Math.min(W, camera.y + hh);
  const step = CONFIG.GRID_STEP;

  ctx.beginPath();
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
  }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ctx.strokeStyle = CONFIG.GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Полигоны: мягкая тень, заливка, обводка, вспышка при попадании
function drawShapes() {
  for (const s of shapes) {
    if (!inView(s.x, s.y, s.radius + 6)) continue;
    const def = s.def;

    polygonPath(s.x + 4, s.y + 6, s.radius, def.sides, s.rot);
    ctx.fillStyle = 'rgba(40, 55, 80, 0.14)';
    ctx.fill();

    polygonPath(s.x, s.y, s.radius, def.sides, s.rot);
    if (s.type === 'alpha') {
      // Свечение альфа-пятиугольника: широкий полупрозрачный контур (дешевле shadowBlur)
      ctx.lineWidth = 14;
      ctx.strokeStyle = 'rgba(167, 123, 240, 0.25)';
      ctx.stroke();
    }
    ctx.fillStyle = def.color;
    ctx.fill();
    if (s.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${s.flash * 0.6})`;
      ctx.fill();
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = def.stroke;
    ctx.stroke();

    if (s.hp < s.maxHp) {
      drawBar(s.x - s.radius, s.y - s.radius - 12, s.radius * 2, 5, s.hp / s.maxHp, '#7ccf6a');
    }
  }
}

// Корпус танка со стволами: стволы рисуются под корпусом, с откатом и лёгкой тряской
function drawTank(t) {
  const R = t.radius;

  for (const b of t.cls.barrels) {
    const kick = t.recoilAnim * 5;             // откат ствола после выстрела
    const shake = t.recoilAnim * rand(-1, 1);  // дрожь ствола
    const x = R - 6 - kick;
    const y = b.offset - b.width / 2 + shake;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.aim + b.angle);
    ctx.fillStyle = '#8a93a6';
    ctx.strokeStyle = '#5b6375';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, b.len, b.width);
    ctx.strokeRect(x, y, b.len, b.width);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(t.x + 3, t.y + 5, R, 0, TAU);
  ctx.fillStyle = 'rgba(40, 55, 80, 0.16)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(t.x, t.y, R, 0, TAU);
  ctx.fillStyle = t.color;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(t.x - R * 0.3, t.y - R * 0.3, R * 0.3, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fill();
}

// Ник, уровень и полоска здоровья над танком
function drawTankInfo(t, isPlayer) {
  const R = t.radius;
  ctx.textAlign = 'center';
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillStyle = '#2b3445';
  ctx.fillText(`${t.name} · ${t.level}`, t.x, t.y - R - 18);
  if (!isPlayer || t.hp < t.maxHp) {
    drawBar(t.x - 26, t.y - R - 12, 52, 6, t.hp / t.maxHp, '#5ccf7a');
  }
}

function drawTanks(tanks, player) {
  for (const t of tanks) {
    if (t.alive && inView(t.x, t.y, t.radius + 60)) drawTank(t);
  }
  // Подписи рисуем поверх всех корпусов
  for (const t of tanks) {
    if (t.alive && inView(t.x, t.y, t.radius + 60)) drawTankInfo(t, t === player);
  }
}

function drawBullets() {
  for (const b of bullets) {
    if (!inView(b.x, b.y, b.radius)) continue;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, TAU);
    ctx.fillStyle = b.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.stroke();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = 1 - p.life / p.maxLife;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, TAU);
    ctx.fillStyle = p.color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Миникарта: вся арена, боты, игрок и альфа-полигоны
function drawMinimap(tanks, player) {
  const S = minimap.width;
  const k = S / CONFIG.WORLD_SIZE;
  mapCtx.clearRect(0, 0, S, S);
  mapCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  mapCtx.fillRect(0, 0, S, S);

  mapCtx.fillStyle = SHAPE_TYPES.alpha.color;
  for (const s of shapes) {
    if (s.type === 'alpha') mapCtx.fillRect(s.x * k - 2, s.y * k - 2, 4, 4);
  }

  for (const t of tanks) {
    if (!t.alive || t === player) continue;
    mapCtx.beginPath();
    mapCtx.arc(t.x * k, t.y * k, 3, 0, TAU);
    mapCtx.fillStyle = t.color;
    mapCtx.fill();
  }

  if (player && player.alive) {
    mapCtx.beginPath();
    mapCtx.arc(player.x * k, player.y * k, 4.5, 0, TAU);
    mapCtx.fillStyle = '#1e88e5';
    mapCtx.fill();
    mapCtx.lineWidth = 2;
    mapCtx.strokeStyle = '#ffffff';
    mapCtx.stroke();
  }
}

// Отрисовка одного кадра
function render(tanks, player) {
  const dpr = window.devicePixelRatio || 1;
  const z = camera.zoom;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = CONFIG.BG_COLOR;
  ctx.fillRect(0, 0, innerWidth, innerHeight);

  // Мировые координаты → экранные: камера находится в центре экрана
  ctx.setTransform(
    dpr * z, 0, 0, dpr * z,
    dpr * (innerWidth / 2 - camera.x * z),
    dpr * (innerHeight / 2 - camera.y * z),
  );
  drawArena();
  drawShapes();
  drawTanks(tanks, player);
  drawBullets();
  drawParticles();

  drawMinimap(tanks, player);
}
