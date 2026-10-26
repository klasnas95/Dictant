// ============================================================
//  classes.js — дерево классов танков и отрисовка корпуса с пушками
// ============================================================
//
//  Пушка (barrel) описывается полями (все длины — в радиусах корпуса R):
//    a     — угол поворота пушки относительно направления танка (рад)
//    x     — боковое смещение пушки от оси (для Twin и т.п.)
//    len   — длина пушки,  w — ширина пушки
//    d     — задержка первого выстрела (доля перезарядки, для чередования)
//    dmg, spd, pen — множители урона / скорости / пробиваемости пули
//    rel   — множитель перезарядки (больше = медленнее)
//    spr   — разброс (рад),  rec — множитель отдачи
//    taper — сужение у основания (0..1) — «воронка» пулемёта
//
//  Эволюции: Tank -> (15 ур.) -> (30 ур.) -> (45 ур.)

const DEG = Math.PI / 180;
const BARREL_DEFAULTS = {
  a: 0, x: 0, len: 1.85, w: 0.78, d: 0,
  dmg: 1, spd: 1, pen: 1, rel: 1, spr: 0, rec: 1, taper: 0,
};

const CLASSES = {};

function defClass(id, name, tier, children, barrels, opts = {}) {
  const bs = barrels.map((b) => Object.assign({}, BARREL_DEFAULTS, b));
  CLASSES[id] = {
    id, name, tier, children,
    barrels: bs,
    fov: opts.fov || 1,         // множитель поля зрения (дальний прицел)
    speed: opts.speed || 1,     // множитель скорости движения
    maxSpd: Math.max(...bs.map((b) => b.spd)), // самая быстрая пуля (для дальности)
  };
}

// Вспомогательные генераторы наборов пушек
const ringOf = (n, o, offsetDeg = 0) =>
  Array.from({ length: n }, (_, i) => Object.assign({ a: (offsetDeg + (i * 360) / n) * DEG }, o));
const twinAt = (deg, o) => [
  Object.assign({ a: deg * DEG, x: -0.45, d: 0 }, o),
  Object.assign({ a: deg * DEG, x: 0.45, d: 0.5 }, o),
];

// ---------------- Уровень 1 ----------------
defClass('basic', 'Tank', 1, ['twin', 'sniper', 'machine', 'flank'], [{}]);

// ---------------- Уровень 15 ----------------
defClass('twin', 'Twin', 2, ['triple', 'twinflank'], [
  { x: -0.5, w: 0.62, dmg: 0.75, rec: 0.6, d: 0 },
  { x: 0.5, w: 0.62, dmg: 0.75, rec: 0.6, d: 0.5 },
]);
defClass('sniper', 'Sniper', 2, ['assassin', 'hunter'], [
  { len: 2.35, spd: 1.4, dmg: 1.5, rel: 1.6, pen: 1.3 },
], { fov: 1.25 });
defClass('machine', 'Machine Gun', 2, ['destroyer', 'gunner', 'sprayer'], [
  { len: 1.7, w: 1.0, taper: 0.5, rel: 0.45, dmg: 0.6, spr: 0.22, rec: 0.5 },
]);
defClass('flank', 'Flank Guard', 2, ['tri', 'quad'], [
  { dmg: 0.9 },
  { a: Math.PI, len: 1.7, w: 0.7, dmg: 0.9 },
]);

// ---------------- Уровень 30 ----------------
defClass('triple', 'Triple Shot', 3, ['penta', 'spreadshot'], [
  { a: -25 * DEG, w: 0.62, dmg: 0.7, rec: 0.6 },
  { a: 25 * DEG, w: 0.62, dmg: 0.7, rec: 0.6 },
  { len: 2.0, w: 0.62, dmg: 0.7, rec: 0.6 },
]);
defClass('twinflank', 'Twin Flank', 3, ['tripletwin', 'twincross'], [
  ...twinAt(0, { w: 0.55, dmg: 0.7, rec: 0.5 }),
  ...twinAt(180, { w: 0.55, dmg: 0.7, rec: 0.5 }),
]);
defClass('assassin', 'Assassin', 3, ['ranger', 'stalker'], [
  { len: 2.8, w: 0.85, spd: 1.6, dmg: 2.0, rel: 1.9, pen: 1.8, rec: 1.6 },
], { fov: 1.4 });
defClass('hunter', 'Hunter', 3, ['predator', 'streamliner'], [
  { len: 2.3, w: 0.62, spd: 1.35, dmg: 1.2, rel: 1.5, pen: 1.2 },
  { len: 1.85, w: 1.0, spd: 1.2, dmg: 1.4, rel: 1.5, pen: 1.4, d: 0.45, rec: 1.4 },
], { fov: 1.2 });
defClass('destroyer', 'Destroyer', 3, ['annihilator', 'hybrid'], [
  { len: 1.8, w: 1.35, spd: 0.75, dmg: 4.0, rel: 3.2, pen: 2.5, rec: 4 },
]);
defClass('gunner', 'Gunner', 3, ['gatling', 'barrage'], [
  { x: -0.75, len: 1.6, w: 0.4, dmg: 0.3, rel: 0.55, spr: 0.08, rec: 0.3, d: 0 },
  { x: -0.25, len: 1.95, w: 0.4, dmg: 0.3, rel: 0.55, spr: 0.08, rec: 0.3, d: 0.5 },
  { x: 0.25, len: 1.95, w: 0.4, dmg: 0.3, rel: 0.55, spr: 0.08, rec: 0.3, d: 0.25 },
  { x: 0.75, len: 1.6, w: 0.4, dmg: 0.3, rel: 0.55, spr: 0.08, rec: 0.3, d: 0.75 },
]);
defClass('sprayer', 'Sprayer', 3, ['firestorm', 'blizzard'], [
  { len: 1.75, w: 1.0, taper: 0.5, rel: 0.4, dmg: 0.5, spr: 0.28, rec: 0.4 },
  { len: 2.1, w: 0.5, rel: 0.4, dmg: 0.3, spr: 0.18, rec: 0.3, d: 0.5 },
]);
defClass('tri', 'Tri-Angle', 3, ['booster', 'fighter'], [
  { a: 150 * DEG, len: 1.6, w: 0.6, dmg: 0.7, rec: 3 },
  { a: -150 * DEG, len: 1.6, w: 0.6, dmg: 0.7, rec: 3 },
  { len: 1.85 },
], { speed: 1.1 });
defClass('quad', 'Quad Tank', 3, ['octo', 'quadsniper'], ringOf(4, { dmg: 0.85, w: 0.7, len: 1.8 }));

// ---------------- Уровень 45 (финальные классы) ----------------
defClass('penta', 'Penta Shot', 4, [], [
  { a: -40 * DEG, len: 1.75, w: 0.55, dmg: 0.55, rec: 0.5 },
  { a: 40 * DEG, len: 1.75, w: 0.55, dmg: 0.55, rec: 0.5 },
  { a: -20 * DEG, len: 2.0, w: 0.55, dmg: 0.55, rec: 0.5 },
  { a: 20 * DEG, len: 2.0, w: 0.55, dmg: 0.55, rec: 0.5 },
  { len: 2.25, w: 0.55, dmg: 0.55, rec: 0.5 },
]);
defClass('spreadshot', 'Spread Shot', 4, [], [
  ...[-52, -34, -16, 16, 34, 52].map((a) => ({ a: a * DEG, len: 1.6, w: 0.38, dmg: 0.3, rec: 0.3, spr: 0.04 })),
  { len: 2.2, w: 0.8, dmg: 0.9, d: 0.5 },
]);
defClass('tripletwin', 'Triple Twin', 4, [], [
  ...twinAt(0, { w: 0.5, dmg: 0.5, rec: 0.4 }),
  ...twinAt(120, { w: 0.5, dmg: 0.5, rec: 0.4 }),
  ...twinAt(240, { w: 0.5, dmg: 0.5, rec: 0.4 }),
]);
defClass('twincross', 'Twin Cross', 4, [], [
  ...twinAt(0, { w: 0.45, dmg: 0.42, rec: 0.35 }),
  ...twinAt(90, { w: 0.45, dmg: 0.42, rec: 0.35 }),
  ...twinAt(180, { w: 0.45, dmg: 0.42, rec: 0.35 }),
  ...twinAt(270, { w: 0.45, dmg: 0.42, rec: 0.35 }),
]);
defClass('ranger', 'Ranger', 4, [], [
  { len: 3.1, w: 0.95, spd: 1.9, dmg: 2.6, rel: 2.1, pen: 2.2, rec: 2 },
], { fov: 1.7 });
defClass('stalker', 'Stalker', 4, [], [
  { len: 2.7, w: 0.75, spd: 1.7, dmg: 1.7, rel: 1.2, pen: 1.5, rec: 1.2 },
], { fov: 1.35, speed: 1.25 });
defClass('predator', 'Predator', 4, [], [
  { len: 2.4, w: 0.55, spd: 1.4, dmg: 1.0, rel: 1.5, pen: 1.2 },
  { len: 2.1, w: 0.8, spd: 1.3, dmg: 1.1, rel: 1.5, pen: 1.4, d: 0.33 },
  { len: 1.8, w: 1.05, spd: 1.2, dmg: 1.2, rel: 1.5, pen: 1.6, d: 0.66 },
], { fov: 1.35 });
defClass('streamliner', 'Streamliner', 4, [],
  [2.5, 2.3, 2.1, 1.9, 1.7].map((len, i) => ({
    len, w: 0.5, dmg: 0.38, rel: 0.75, spr: 0.05, spd: 1.2, d: i * 0.2, rec: 0.3,
  })), { fov: 1.25 });
defClass('annihilator', 'Annihilator', 4, [], [
  { len: 1.8, w: 1.75, spd: 0.75, dmg: 5.5, rel: 3.6, pen: 3.5, rec: 6 },
]);
defClass('hybrid', 'Hybrid', 4, [], [
  { len: 1.8, w: 1.3, spd: 0.75, dmg: 3.4, rel: 3.0, pen: 2.5, rec: 4 },
  { a: Math.PI, len: 1.7, w: 0.7, dmg: 0.8 },
]);
defClass('gatling', 'Gatling', 4, [],
  [0, 1, 2, 3, 4, 5].map((i) => ({
    x: -0.9 + i * 0.36, len: i % 2 ? 1.95 : 1.65, w: 0.33,
    dmg: 0.3, rel: 0.8, spr: 0.1, rec: 0.25, d: i / 6,
  })));
defClass('barrage', 'Barrage', 4, [], [
  { x: -0.75, len: 1.6, w: 0.4, dmg: 0.28, rel: 0.55, spr: 0.08, rec: 0.3, d: 0 },
  { x: -0.25, len: 1.95, w: 0.4, dmg: 0.28, rel: 0.55, spr: 0.08, rec: 0.3, d: 0.5 },
  { x: 0.25, len: 1.95, w: 0.4, dmg: 0.28, rel: 0.55, spr: 0.08, rec: 0.3, d: 0.25 },
  { x: 0.75, len: 1.6, w: 0.4, dmg: 0.28, rel: 0.55, spr: 0.08, rec: 0.3, d: 0.75 },
  { a: Math.PI, x: -0.4, len: 1.6, w: 0.4, dmg: 0.3, rel: 0.55, spr: 0.08, rec: 0.3, d: 0.25 },
  { a: Math.PI, x: 0.4, len: 1.6, w: 0.4, dmg: 0.3, rel: 0.55, spr: 0.08, rec: 0.3, d: 0.75 },
]);
defClass('firestorm', 'Fire Storm', 4, [], [
  { len: 1.8, w: 1.15, taper: 0.55, rel: 0.22, dmg: 0.35, spr: 0.4, rec: 0.3 },
  { len: 2.2, w: 0.5, rel: 0.22, dmg: 0.22, spr: 0.25, d: 0.5, rec: 0.2 },
]);
defClass('blizzard', 'Blizzard', 4, [], [
  { len: 1.75, w: 1.0, taper: 0.5, rel: 0.4, dmg: 0.5, spr: 0.28, rec: 0.4 },
  { len: 2.1, w: 0.5, rel: 0.4, dmg: 0.3, spr: 0.18, rec: 0.3, d: 0.5 },
  { a: Math.PI, len: 1.75, w: 1.0, taper: 0.5, rel: 0.4, dmg: 0.5, spr: 0.28, rec: 0.4, d: 0.25 },
  { a: Math.PI, len: 2.1, w: 0.5, rel: 0.4, dmg: 0.3, spr: 0.18, rec: 0.3, d: 0.75 },
]);
defClass('booster', 'Booster', 4, [], [
  { a: 130 * DEG, len: 1.55, w: 0.55, dmg: 0.55, rec: 3 },
  { a: -130 * DEG, len: 1.55, w: 0.55, dmg: 0.55, rec: 3 },
  { a: 165 * DEG, len: 1.7, w: 0.55, dmg: 0.55, rec: 3 },
  { a: -165 * DEG, len: 1.7, w: 0.55, dmg: 0.55, rec: 3 },
  { len: 1.85 },
], { speed: 1.25 });
defClass('fighter', 'Fighter', 4, [], [
  { a: 150 * DEG, len: 1.6, w: 0.6, dmg: 0.6, rec: 2 },
  { a: -150 * DEG, len: 1.6, w: 0.6, dmg: 0.6, rec: 2 },
  { a: 90 * DEG, len: 1.6, w: 0.62, dmg: 0.65 },
  { a: -90 * DEG, len: 1.6, w: 0.62, dmg: 0.65 },
  { len: 1.85 },
], { speed: 1.15 });
defClass('octo', 'Octo Tank', 4, [],
  ringOf(8, { dmg: 0.8, w: 0.6, len: 1.75, rec: 0.5 }).map((b, i) => Object.assign(b, { d: i % 2 ? 0.5 : 0 })));
defClass('quadsniper', 'Quad Sniper', 4, [],
  ringOf(4, { len: 2.5, w: 0.7, spd: 1.5, dmg: 1.5, rel: 1.7, pen: 1.4 }), { fov: 1.35 });

// ------------------------------------------------------------
//  Отрисовка танка в начале координат (используется и в игре,
//  и для иконок в панели выбора класса).
//  states — массив состояний пушек {kick, shake} для анимации выстрела.
// ------------------------------------------------------------
function renderTank(ctx, cls, r, angle, fill, stroke, states) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, r * 0.13);

  // Пушки рисуются под корпусом
  for (let i = 0; i < cls.barrels.length; i++) {
    const b = cls.barrels[i];
    const st = states ? states[i] : null;
    ctx.save();
    ctx.rotate(angle + b.a + (st ? st.shake * st.kick : 0));
    if (st) ctx.translate(-st.kick * r * 0.2, 0); // пушка «отъезжает» при выстреле
    const len = b.len * r, w = b.w * r, y = b.x * r;
    const baseW = w * (1 - b.taper);
    ctx.beginPath();
    ctx.moveTo(0, y - baseW / 2);
    ctx.lineTo(len, y - w / 2);
    ctx.lineTo(len, y + w / 2);
    ctx.lineTo(0, y + baseW / 2);
    ctx.closePath();
    ctx.fillStyle = BARREL_FILL;
    ctx.fill();
    ctx.strokeStyle = BARREL_STROKE;
    ctx.stroke();
    ctx.restore();
  }

  // Круглый корпус
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.stroke();
}
