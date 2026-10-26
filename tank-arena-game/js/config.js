// Общие настройки игры: размеры арены, баланс, типы полигонов, статы и классы танков.

const CONFIG = {
  WORLD_SIZE: 4000,               // сторона квадратной арены, px
  MAX_LEVEL: 45,                  // максимальный уровень
  EVOLUTION_LEVELS: [15, 30, 45], // уровни, на которых выбирается класс
  BOT_COUNT: 12,                  // количество ботов на арене
  BOT_RESPAWN: 3.5,               // секунд до возрождения бота
  BOT_SIGHT: 800,                 // дальность, на которой бот замечает врага
  SHAPE_SPAWN_INTERVAL: 0.4,      // пауза между появлениями полигонов одного типа, с
  TANK_RADIUS: 24,                // радиус корпуса танка
  BASE_TANK_SPEED: 210,           // базовая скорость танка, px/с
  BASE_MAX_HP: 100,               // базовое максимальное здоровье
  BASE_REGEN: 1.5,                // базовое восстановление здоровья, hp/с
  BASE_RAM_DPS: 14,               // базовый урон тарана (Body Damage), hp/с
  BASE_RELOAD: 0.45,              // базовая задержка между выстрелами, с
  BASE_BULLET_SPEED: 620,         // базовая скорость пули, px/с
  BASE_BULLET_DAMAGE: 12,         // базовый урон пули
  BULLET_LIFE: 1.1,               // время жизни пули, с
  BULLET_RADIUS: 7,               // радиус пули, px
  RECOIL: 40,                     // отдача одного ствола (умножается на recoilMul класса)
  ACCEL: 9,                       // скорость разгона и торможения танка
  AUTO_SPIN_SPEED: 3.2,           // скорость автоповорота пушки, рад/с
  BG_COLOR: '#e3e8f0',            // фон за пределами арены
  ARENA_COLOR: '#f6f8fc',         // фон арены
  GRID_COLOR: '#dfe5ee',          // цвет линий сетки
  GRID_STEP: 80,                  // шаг сетки, px
};

// Характеристики, в которые вкладываются очки улучшений (максимум STAT_MAX на каждую).
// Порядок важен: клавиши 1–8 соответствуют индексам этого массива.
const STATS = [
  'Health Regen',
  'Max Health',
  'Body Damage',
  'Bullet Speed',
  'Bullet Penetration',
  'Bullet Damage',
  'Reload',
  'Movement Speed',
];
const STAT_MAX = 7;

// Типы полигонов: форма, размер, прочность, награда опытом и урон при касании танка
const SHAPE_TYPES = {
  square:   { sides: 4, radius: 16, hp: 25,   xp: 8,   contactDps: 6,  maxCount: 110, color: '#ffd84d', stroke: '#d4ad24' },
  triangle: { sides: 3, radius: 20, hp: 80,   xp: 22,  contactDps: 12, maxCount: 45,  color: '#f2655e', stroke: '#c44740' },
  pentagon: { sides: 5, radius: 28, hp: 260,  xp: 70,  contactDps: 20, maxCount: 18,  color: '#4f9cf5', stroke: '#2e70cc' },
  alpha:    { sides: 5, radius: 56, hp: 1400, xp: 420, contactDps: 40, maxCount: 4,   color: '#a77bf0', stroke: '#7649c9' },
};

// Опыт, нужный для перехода с уровня level на уровень level + 1
function xpToNext(level) {
  return Math.round(30 + 14 * Math.pow(level, 1.5));
}

// Классы танков. barrels — стволы:
//   angle  — угол относительно прицела, рад;
//   offset — смещение ствола вбок, px;
//   len, width — длина и толщина ствола, px.
// Остальные поля — множители базовых параметров:
//   reloadMul, damageMul, speedMul, sizeMul, recoilMul, moveMul;
//   spread — разброс выстрела, рад; pierceAdd — дополнительное пробивание.
// Эволюция: класс из parent превращается в себя (см. evolutionOptions в tank.js).
const CLASSES = {
  basic: {
    name: 'Basic', parent: null, desc: 'Базовый танк',
    barrels: [{ angle: 0, offset: 0, len: 28, width: 16 }],
  },

  // --- 15 уровень ---
  twin: {
    name: 'Twin', parent: 'basic', desc: 'Два параллельных ствола',
    barrels: [{ angle: 0, offset: -9, len: 28, width: 13 }, { angle: 0, offset: 9, len: 28, width: 13 }],
    damageMul: 0.6,
  },
  sniper: {
    name: 'Sniper', parent: 'basic', desc: 'Дальний прицел, сильные пули',
    barrels: [{ angle: 0, offset: 0, len: 40, width: 18 }],
    damageMul: 1.8, speedMul: 1.7, reloadMul: 1.6, sizeMul: 0.9, recoilMul: 2.2, moveMul: 0.9,
  },
  machine: {
    name: 'Machine Gun', parent: 'basic', desc: 'Очень быстрая стрельба с разбросом',
    barrels: [{ angle: 0, offset: 0, len: 30, width: 14 }],
    damageMul: 0.55, reloadMul: 0.32, spread: 0.09, sizeMul: 0.8, recoilMul: 0.35,
  },
  flank: {
    name: 'Flank Guard', parent: 'basic', desc: 'Пушки спереди и сзади',
    barrels: [{ angle: 0, offset: 0, len: 28, width: 16 }, { angle: Math.PI, offset: 0, len: 22, width: 14 }],
    recoilMul: 0.8,
  },

  // --- 30 уровень ---
  triple: {
    name: 'Triple Shot', parent: 'twin', desc: 'Три веерных ствола',
    barrels: [
      { angle: -0.26, offset: 0, len: 28, width: 13 },
      { angle: 0, offset: 0, len: 30, width: 13 },
      { angle: 0.26, offset: 0, len: 28, width: 13 },
    ],
    damageMul: 0.5,
  },
  doubleTwin: {
    name: 'Double Twin', parent: 'twin', desc: 'Четыре ствола в два ряда',
    barrels: [-16, -6, 6, 16].map((o) => ({ angle: 0, offset: o, len: 28, width: 9 })),
    damageMul: 0.4, reloadMul: 1.1,
  },
  assassin: {
    name: 'Assassin', parent: 'sniper', desc: 'Ещё дальше и мощнее, но медленнее',
    barrels: [{ angle: 0, offset: 0, len: 48, width: 20 }],
    damageMul: 2.2, speedMul: 2.0, reloadMul: 1.7, recoilMul: 2.6, moveMul: 0.85,
  },
  hunter: {
    name: 'Hunter', parent: 'sniper', desc: 'Пробивает врагов насквозь',
    barrels: [{ angle: 0, offset: 0, len: 40, width: 18 }],
    damageMul: 1.6, speedMul: 1.6, reloadMul: 1.5, sizeMul: 0.8, recoilMul: 2.0, pierceAdd: 3,
  },
  sprayer: {
    name: 'Sprayer', parent: 'machine', desc: 'Три ствола с сильным разбросом',
    barrels: [
      { angle: -0.12, offset: 0, len: 30, width: 12 },
      { angle: 0, offset: 0, len: 32, width: 14 },
      { angle: 0.12, offset: 0, len: 30, width: 12 },
    ],
    damageMul: 0.45, reloadMul: 0.25, spread: 0.18, sizeMul: 0.7, recoilMul: 0.35,
  },
  gunner: {
    name: 'Gunner', parent: 'machine', desc: 'Два пулемёта, очень частые выстрелы',
    barrels: [{ angle: 0, offset: -10, len: 28, width: 12 }, { angle: 0, offset: 10, len: 28, width: 12 }],
    damageMul: 0.5, reloadMul: 0.4, spread: 0.1, sizeMul: 0.75, recoilMul: 0.4,
  },
  triAngle: {
    name: 'Tri-Angle', parent: 'flank', desc: 'Три пушки: спереди и сзади',
    barrels: [
      { angle: 0, offset: 0, len: 28, width: 16 },
      { angle: (5 * Math.PI) / 6, offset: 0, len: 22, width: 13 },
      { angle: (-5 * Math.PI) / 6, offset: 0, len: 22, width: 13 },
    ],
    recoilMul: 0.7,
  },
  quadFlank: {
    name: 'Quad Flank', parent: 'flank', desc: 'Пушки во все четыре стороны',
    barrels: [
      { angle: 0, offset: 0, len: 28, width: 16 },
      { angle: Math.PI / 2, offset: 0, len: 22, width: 14 },
      { angle: Math.PI, offset: 0, len: 22, width: 14 },
      { angle: -Math.PI / 2, offset: 0, len: 22, width: 14 },
    ],
    damageMul: 0.7, recoilMul: 0.6,
  },

  // --- 45 уровень ---
  pentaShot: {
    name: 'Penta Shot', parent: 'triple', desc: 'Пять веерных стволов',
    barrels: [-0.52, -0.26, 0, 0.26, 0.52].map((a) => ({ angle: a, offset: 0, len: 30, width: 11 })),
    damageMul: 0.45, reloadMul: 1.1, sizeMul: 0.9,
  },
  battleship: {
    name: 'Battleship', parent: 'doubleTwin', desc: 'Шесть стволов в ряд',
    barrels: [-20, -12, -4, 4, 12, 20].map((o) => ({ angle: 0, offset: o, len: 30, width: 8 })),
    damageMul: 0.35, reloadMul: 1.3,
  },
  ranger: {
    name: 'Ranger', parent: 'assassin', desc: 'Самые дальние и сильные пули',
    barrels: [{ angle: 0, offset: 0, len: 58, width: 22 }],
    damageMul: 2.8, speedMul: 2.3, reloadMul: 1.8, sizeMul: 1.1, recoilMul: 3, moveMul: 0.8, pierceAdd: 1,
  },
  stalker: {
    name: 'Stalker', parent: 'hunter', desc: 'Пробивает до шести врагов',
    barrels: [{ angle: 0, offset: 0, len: 44, width: 18 }],
    damageMul: 1.4, speedMul: 1.8, reloadMul: 1.2, recoilMul: 1.8, pierceAdd: 5,
  },
  hailstorm: {
    name: 'Hailstorm', parent: 'sprayer', desc: 'Пять стволов, град пуль',
    barrels: [-0.3, -0.15, 0, 0.15, 0.3].map((a) => ({ angle: a, offset: 0, len: 30, width: 10 })),
    damageMul: 0.35, reloadMul: 0.2, spread: 0.22, sizeMul: 0.65, recoilMul: 0.4,
  },
  megaGunner: {
    name: 'Mega Gunner', parent: 'gunner', desc: 'Четыре пулемёта',
    barrels: [-12, -4, 4, 12].map((o) => ({ angle: 0, offset: o, len: 30, width: 10 })),
    damageMul: 0.4, reloadMul: 0.45, spread: 0.1, sizeMul: 0.7, recoilMul: 0.4,
  },
  trapper: {
    name: 'Trapper', parent: 'triAngle', desc: 'Пять пушек во все стороны',
    barrels: [
      { angle: 0, offset: 0, len: 30, width: 16 },
      { angle: (5 * Math.PI) / 6, offset: 0, len: 22, width: 13 },
      { angle: (-5 * Math.PI) / 6, offset: 0, len: 22, width: 13 },
      { angle: Math.PI / 2, offset: 0, len: 20, width: 12 },
      { angle: -Math.PI / 2, offset: 0, len: 20, width: 12 },
    ],
    damageMul: 0.7, reloadMul: 1.2, recoilMul: 0.6,
  },
  octo: {
    name: 'Octo Tank', parent: 'quadFlank', desc: 'Восемь пушек по кругу',
    barrels: [...Array(8)].map((_, k) => ({ angle: (k * Math.PI) / 4, offset: 0, len: 24, width: 13 })),
    damageMul: 0.55, reloadMul: 1.4, recoilMul: 0.3,
  },
};

// Подставляем значения по умолчанию для всех модификаторов класса
for (const id in CLASSES) {
  CLASSES[id] = Object.assign({
    id,
    reloadMul: 1,
    damageMul: 1,
    speedMul: 1,
    sizeMul: 1,
    recoilMul: 1,
    moveMul: 1,
    spread: 0,
    pierceAdd: 0,
  }, CLASSES[id]);
}
