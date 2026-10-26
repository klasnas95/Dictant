// ============================================================
//  config.js — все настройки и константы игры в одном месте
// ============================================================

const CONFIG = {
  WORLD_SIZE: 5000,        // размер квадратной арены (пиксели мира)
  GRID_STEP: 40,           // шаг сетки на фоне
  MAX_LEVEL: 45,           // максимальный уровень
  MAX_STAT_POINTS: 7,      // максимум вложений в один стат
  BASE_RADIUS: 26,         // радиус корпуса танка 1 уровня
  BULLET_LIFE: 1.5,        // время жизни пули, сек
  INVULN_TIME: 2.5,        // неуязвимость после появления, сек
  AUTOSPIN_SPEED: 2.4,     // скорость автоповорота, рад/сек
  BOT_COUNT: 12,           // сколько ботов одновременно на арене (10–15)
  BOT_RESPAWN_MIN: 3,      // респавн бота: от ... сек
  BOT_RESPAWN_MAX: 7,      // ... до ... сек
  NEST_RADIUS: 1000,       // «гнездо» пятиугольников в центре карты
  ALPHA_RESPAWN: 60,       // пауза между появлениями Alpha-пятиугольников, сек
  KILL_REWARD_SHARE: 0.6,  // доля очков жертвы, достающаяся убийце
  KILL_REWARD_MAX: 4000,   // потолок награды за убийство (чтобы не было «снежного кома»)
  PARTICLE_LIMIT: 700,     // максимум частиц одновременно
  EVOLVE_LEVELS: [15, 30, 45], // уровни, на которых открывается эволюция
  // Целевое количество полигонов каждого типа
  SHAPE_COUNTS: { square: 220, triangle: 90, pentagon: 40, alpha: 3 },
};

// ------------------------------------------------------------
//  Опыт: LEVEL_SCORES[L] — сколько очков нужно для уровня L
// ------------------------------------------------------------
const LEVEL_SCORES = [0, 0];
for (let L = 2; L <= CONFIG.MAX_LEVEL; L++) {
  LEVEL_SCORES[L] = Math.round(4 * Math.pow(L - 1, 2.2));
}

// ------------------------------------------------------------
//  Характеристики (клавиши 1–8). Порядок важен: индекс = номер стата.
// ------------------------------------------------------------
const STATS = [
  { id: 'regen',       name: 'Health Regen',      color: '#f7a76c' },
  { id: 'maxHealth',   name: 'Max Health',        color: '#e66b8a' },
  { id: 'bodyDamage',  name: 'Body Damage',       color: '#b07cf0' },
  { id: 'bulletSpeed', name: 'Bullet Speed',      color: '#5aa9f0' },
  { id: 'bulletPen',   name: 'Bullet Penetration', color: '#e8cc3c' },
  { id: 'bulletDmg',   name: 'Bullet Damage',     color: '#ef6a5b' },
  { id: 'reload',      name: 'Reload',            color: '#7dd66b' },
  { id: 'moveSpeed',   name: 'Movement Speed',    color: '#4fd3c9' },
];

// ------------------------------------------------------------
//  Полигоны на карте.
//  drawR — радиус описанной окружности (для рисования),
//  hitR  — радиус круглого хитбокса, hp — здоровье,
//  xp    — опыт за уничтожение, bodyDps — урон танку при касании (в сек).
// ------------------------------------------------------------
const SHAPE_TYPES = {
  square:   { name: 'Square',          sides: 4, drawR: 24,  hitR: 20, hp: 16,  xp: 10,   bodyDps: 5,  fill: '#ffe869', stroke: '#bfae4e' },
  triangle: { name: 'Triangle',        sides: 3, drawR: 28,  hitR: 20, hp: 30,  xp: 25,   bodyDps: 12, fill: '#fc7677', stroke: '#bd5859' },
  pentagon: { name: 'Pentagon',        sides: 5, drawR: 44,  hitR: 38, hp: 90,  xp: 130,  bodyDps: 15, fill: '#768dfc', stroke: '#5869bd' },
  alpha:    { name: 'Alpha Pentagon',  sides: 5, drawR: 115, hitR: 100, hp: 1000, xp: 2500, bodyDps: 40, fill: '#7f8cff', stroke: '#4f5cc4' },
};

// ------------------------------------------------------------
//  Цвета танков
// ------------------------------------------------------------
const TANK_COLORS = {
  player: { fill: '#00b2e1', stroke: '#0085a8' },
  bots: [
    { fill: '#f14e54', stroke: '#b43539' },
    { fill: '#2fd17a', stroke: '#1d9a58' },
    { fill: '#bf7ff5', stroke: '#8d52c2' },
    { fill: '#ff9f43', stroke: '#c9742a' },
    { fill: '#ff6fae', stroke: '#c94a85' },
    { fill: '#36c9c0', stroke: '#1f948d' },
  ],
};
const BARREL_FILL = '#999999';
const BARREL_STROKE = '#6e6e6e';

// Ники ботов
const BOT_NAMES = [
  'Viper', 'Nova', 'Blitz', 'Ghost', 'Titan', 'Rogue', 'Comet', 'Echo',
  'Pixel', 'Orion', 'Maverick', 'Kodiak', 'Raptor', 'Zephyr', 'Sniper42',
  'Волк', 'Бублик', 'Сталкер', 'Танкист', 'Шторм', 'Ураган', 'Кактус',
  'xX_Boom_Xx', 'Mr. Bullet', 'Noob', 'Tanky', 'Falcon', 'Cobra', 'Jet', 'Bolt',
];
