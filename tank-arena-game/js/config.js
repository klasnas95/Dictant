// ============================================================
// Конфигурация игры: размеры арены, баланс, статы, классы танков и полигоны
// ============================================================

const CONFIG = {
  WORLD_SIZE: 4000,            // сторона квадратной арены (стены по краям невидимые)
  GRID_STEP: 80,               // шаг сетки на фоне
  PLAYER_COLOR: '#3ec1a1',
  BOT_MIN: 10,                 // количество ботов: от BOT_MIN до BOT_MAX
  BOT_MAX: 15,
  BOT_RESPAWN_MIN: 3,          // задержка респавна бота, с
  BOT_RESPAWN_MAX: 6,
  BOT_LEVEL_SPREAD: 5,         // боты появляются с уровнем игрока ± BOT_LEVEL_SPREAD
  MAX_LEVEL: 45,
  EVOLUTION_LEVELS: [15, 30, 45],
  MAX_STAT_POINTS: 7,          // максимум вложений в один стат
  TANK_RADIUS: 22,
  BASE_SPEED: 230,             // базовая скорость танка, px/с
  BASE_HEALTH: 100,
  BASE_BODY_DAMAGE: 14,        // урон таранного удара в секунду (до множителя стата)
  BASE_BULLET_DAMAGE: 9,
  BASE_BULLET_SPEED: 430,      // px/с
  BASE_BULLET_RADIUS: 6,
  KILL_XP_BASE: 60,            // опыт за убийство танка = база + уровень жертвы * коэффициент
  KILL_XP_PER_LEVEL: 20,
  KILL_CREDIT_TIME: 5,         // сколько секунд помнится последний обидчик, с
  SHAPE_COUNTS: { square: 130, triangle: 50, pentagon: 18, alpha: 4 },
};

// Статы. Порядок совпадает с индексами в Tank.stats
const STAT = { REGEN: 0, MAX_HP: 1, BODY: 2, BULLET_SPEED: 3, PEN: 4, BULLET_DMG: 5, RELOAD: 6, MOVE: 7 };
const STATS = [
  { name: 'Health Regen' },
  { name: 'Max Health' },
  { name: 'Body Damage' },
  { name: 'Bullet Speed' },
  { name: 'Bullet Penetration' },
  { name: 'Bullet Damage' },
  { name: 'Reload' },
  { name: 'Movement Speed' },
];

// Полигоны: форма, прочность, опыт за разрушение и урон при контакте с танком (в секунду)
const SHAPE_DEFS = {
  square:   { sides: 4, radius: 17, hp: 12,  xp: 10,  contactDps: 5,  fill: '#ffd447', stroke: '#c9a227' },
  triangle: { sides: 3, radius: 21, hp: 40,  xp: 25,  contactDps: 10, fill: '#ff6b6b', stroke: '#c0392b' },
  pentagon: { sides: 5, radius: 28, hp: 110, xp: 60,  contactDps: 18, fill: '#5b8def', stroke: '#2c5ac0' },
  alpha:    { sides: 5, radius: 62, hp: 900, xp: 260, contactDps: 35, fill: '#3553c9', stroke: '#1d2f7a' },
};

// Значения по умолчанию для классов танков (переопределяются в TANK_CLASSES)
const CLASS_DEFAULTS = {
  name: '',
  desc: '',
  barrels: [{ a: 0, x: 0 }],  // a — угол ствола относительно прицела, x — боковое смещение
  barrelLen: 26,              // длина ствола, px
  barrelW: 12,                // толщина ствола, px
  reload: 0.5,                // базовое время между выстрелами, с
  recoil: 60,                 // отдача за выстрел, px/с
  dmg: 1,                     // множитель урона пули
  speed: 1,                   // множитель скорости пули
  life: 1.5,                  // время жизни пули, с
  size: 1,                    // множитель размера пули
  spread: 0,                  // разброс направления, рад
  move: 1,                    // множитель скорости движения
  children: [],               // классы, в которые можно эволюционировать
};

// Помощники для описания стволов
const fan = (angles) => angles.map((a) => ({ a, x: 0 }));
const side = (...xs) => xs.map((x) => ({ a: 0, x }));
const ring = (n) => Array.from({ length: n }, (_, k) => ({ a: (k * Math.PI * 2) / n, x: 0 }));

// Дерево классов: 15 уровень -> 30 уровень -> 45 уровень
const TANK_CLASSES = {
  basic: {
    name: 'Basic', desc: 'Одна пушка, сбалансированный старт.',
    children: ['twin', 'sniper', 'machine', 'flank'],
  },

  // 15 уровень
  twin: {
    name: 'Twin', desc: 'Две параллельные пушки.',
    barrels: side(-8, 8), barrelW: 11, reload: 0.55, dmg: 0.85,
    children: ['triple', 'quad'],
  },
  sniper: {
    name: 'Sniper', desc: 'Дальний прицел и сильные пули.',
    barrelLen: 34, barrelW: 12, reload: 1.1, recoil: 220, dmg: 2.1, speed: 1.5, life: 2, size: 1.1, move: 0.95,
    children: ['assassin', 'overseer'],
  },
  machine: {
    name: 'Machine Gun', desc: 'Очень быстрая стрельба с разбросом.',
    barrelLen: 28, barrelW: 16, reload: 0.12, recoil: 25, dmg: 0.5, life: 1.2, size: 0.9, spread: 0.1,
    children: ['gunner', 'sprayer'],
  },
  flank: {
    name: 'Flank Guard', desc: 'Пушки спереди и сзади.',
    barrels: fan([0, Math.PI]), reload: 0.5, dmg: 0.9,
    children: ['tri_angle', 'quad_flank'],
  },

  // 30 уровень
  triple: {
    name: 'Triple Shot', desc: 'Три пули веером.',
    barrels: fan([-0.22, 0, 0.22]), reload: 0.6, dmg: 0.7,
    children: ['penta'],
  },
  quad: {
    name: 'Quad Tank', desc: 'Четыре параллельные пушки.',
    barrels: side(-12, -4, 4, 12), barrelW: 8, reload: 0.6, dmg: 0.5,
    children: ['octo'],
  },
  assassin: {
    name: 'Assassin', desc: 'Ещё дальше и быстрее снайпера.',
    barrelLen: 38, barrelW: 12, reload: 1.0, recoil: 200, dmg: 2.8, speed: 1.8, life: 2.4, size: 1.1, move: 0.95,
    children: ['ranger'],
  },
  overseer: {
    name: 'Overseer', desc: 'Две тяжёлые пушки с крупными пулями.',
    barrels: side(-9, 9), barrelW: 14, reload: 0.9, recoil: 120, dmg: 1.6, size: 1.25,
    children: ['overlord'],
  },
  gunner: {
    name: 'Gunner', desc: 'Четыре быстрые пушки.',
    barrels: side(-8, -2.5, 2.5, 8), barrelW: 7, reload: 0.2, dmg: 0.4, spread: 0.04,
    children: ['hyper_gunner'],
  },
  sprayer: {
    name: 'Sprayer', desc: 'Очень широкий веер мелких пуль.',
    barrelW: 18, reload: 0.13, dmg: 0.45, spread: 0.35,
    children: ['shotgun'],
  },
  tri_angle: {
    name: 'Tri-Angle', desc: 'Пушки вперёд и назад под углом.',
    barrels: fan([0, 0.75 * Math.PI, -0.75 * Math.PI]), reload: 0.5, dmg: 0.8, move: 1.1,
    children: ['falcon'],
  },
  quad_flank: {
    name: 'Quad Flank', desc: 'Пушки во все четыре стороны.',
    barrels: fan([0, Math.PI / 2, Math.PI, -Math.PI / 2]), reload: 0.55, dmg: 0.7,
    children: ['hexa_flank'],
  },

  // 45 уровень
  penta: {
    name: 'Penta Shot', desc: 'Пять пуль веером.',
    barrels: fan([-0.4, -0.2, 0, 0.2, 0.4]), reload: 0.6, dmg: 0.6,
  },
  octo: {
    name: 'Octo Tank', desc: 'Восемь пушек по кругу.',
    barrels: ring(8), reload: 1.0, dmg: 0.6,
  },
  ranger: {
    name: 'Ranger', desc: 'Самый дальнобойный класс с крупными пулями.',
    barrelLen: 38, barrelW: 14, reload: 1.3, recoil: 260, dmg: 3.8, speed: 2.2, life: 3, size: 1.3,
  },
  hyper_gunner: {
    name: 'Hyper Gunner', desc: 'Шесть пушек с бешеной скорострельностью.',
    barrels: side(-12, -7, -2, 2, 7, 12), barrelW: 6, reload: 0.16, dmg: 0.45,
  },
  shotgun: {
    name: 'Shotgun', desc: 'Пять коротких пуль с широким разбросом.',
    barrels: fan([-0.5, -0.25, 0, 0.25, 0.5]), reload: 0.8, dmg: 1.0, speed: 0.9, life: 0.8, size: 1.2, spread: 0.03,
  },
  overlord: {
    name: 'Overlord', desc: 'Тяжёлые пушки и большой урон.',
    barrels: side(-11, 11), barrelW: 18, reload: 0.95, recoil: 170, dmg: 2.3, size: 1.4,
  },
  falcon: {
    name: 'Falcon', desc: 'Быстрый Tri-Angle с ускорением.',
    barrels: fan([0, 0.75 * Math.PI, -0.75 * Math.PI]), reload: 0.45, dmg: 0.9, speed: 1.1, move: 1.25,
  },
  hexa_flank: {
    name: 'Hexa Flank', desc: 'Шесть пушек во все стороны.',
    barrels: ring(6), reload: 0.55, dmg: 0.6,
  },
};

// Готовые классы с подставленными значениями по умолчанию
const CLASSES = {};
for (const id of Object.keys(TANK_CLASSES)) {
  CLASSES[id] = { ...CLASS_DEFAULTS, ...TANK_CLASSES[id] };
}

const BOT_NAMES = [
  'Ржавый', 'Гром', 'Буря', 'Призрак', 'Коготь', 'Искра', 'Тень', 'Вихрь',
  'Клинок', 'Сокол', 'Медведь', 'Ярость', 'Кактус', 'Лис', 'Орбита',
];

const BOT_COLORS = [
  '#f4a261', '#e76f51', '#9b5de5', '#f15bb5', '#8ac926',
  '#ff9f1c', '#6a4c93', '#e9c46a', '#b56576', '#7d8597',
];

// ---------- Утилиты ----------

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

// Опыт, нужный, чтобы перейти с уровня level на level + 1
const xpForLevel = (level) => 40 + level * 10;
