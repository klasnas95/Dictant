'use strict';
// ============================================================
//  config.js — игровые константы, цвета, характеристики,
//  таблица опыта, полигоны и дерево классов танков
// ============================================================

const CONFIG = {
  WORLD_SIZE: 5000,          // размер квадратной арены (мировые единицы)
  NEST_RADIUS: 700,          // радиус «гнезда» пятиугольников в центре карты
  FIXED_DT: 1 / 60,          // шаг физики (секунды)
  MAX_STEPS_PER_FRAME: 5,    // защита от «спирали смерти» при лагах
  MAX_LEVEL: 45,
  STAT_MAX: 7,               // максимум вложений в одну характеристику
  BOT_COUNT: 12,
  BOT_RESPAWN_MIN: 3,        // секунды до возрождения бота
  BOT_RESPAWN_MAX: 6,
  SHAPE_LIMITS: { square: 360, triangle: 120, pentagon: 55, alpha: 2 },
  SHAPE_SPAWN_PER_SEC: 25,   // скорость досоздания полигонов
  ALPHA_COOLDOWN: 45,        // пауза перед появлением нового альфа-пятиугольника
  GRID_CELL: 160,            // размер ячейки пространственной сетки
  BASE_VIEW: 1500,           // сколько мировых единиц видно по ширине (16:9) экрана
  TANK_BASE_RADIUS: 24,
  TANK_FRICTION: 6,          // трение (чем больше — тем быстрее гаснет инерция)
  BASE_RELOAD: 0.6,          // базовое время перезарядки (сек)
  BASE_RECOIL: 18,           // базовая сила отдачи
  BULLET_LIFE: 1.6,          // базовое время жизни пули (сек)
  SPAWN_PROTECTION: 3,       // неуязвимость после появления (сек)
  DEATH_ANIM: 0.22,          // длительность анимации исчезновения
  KILL_XP_SHARE: 0.5,        // доля очков убитого танка, которую получает убийца
};

// Уровни, на которых открывается выбор нового класса
const TIER_LEVELS = [0, 15, 30, 45];

// LEVEL_XP[L] — суммарные очки, необходимые для достижения уровня L
const LEVEL_XP = (() => {
  const table = [0, 0];
  for (let lv = 1; lv < CONFIG.MAX_LEVEL; lv++) {
    table[lv + 1] = table[lv] + Math.floor(8 + 2.2 * Math.pow(lv, 1.7));
  }
  return table;
})();

// ---------- Палитра (собственное оформление) ----------
const COLORS = {
  outside: '#c7d1d8',
  arena: '#e4eaee',
  grid: 'rgba(70, 95, 115, 0.10)',
  arenaBorder: 'rgba(60, 80, 100, 0.22)',
  nest: 'rgba(127, 148, 255, 0.07)',
  nestBorder: 'rgba(110, 130, 230, 0.25)',
  shadow: 'rgba(25, 40, 55, 0.13)',
  barrel: '#a7b0b8',
  barrelStroke: '#7d868f',
  player: '#38a8e8',
  hpBack: 'rgba(35, 45, 55, 0.6)',
  hpFill: '#82d66a',
  hpLow: '#f0a04b',
  botPalette: ['#a57ee8', '#58c98c', '#f2a35c', '#ea7fc0', '#48c2b4', '#8e9ab5', '#c6cf45', '#d99a6c'],
};

// ---------- Прокачиваемые характеристики (кнопки 1–8) ----------
const STATS = [
  { key: 'regen',  name: 'Health Regen',       color: '#f4b183' },
  { key: 'maxHp',  name: 'Max Health',         color: '#f283ad' },
  { key: 'body',   name: 'Body Damage',        color: '#b28cf2' },
  { key: 'bSpeed', name: 'Bullet Speed',       color: '#6fa8f2' },
  { key: 'bPen',   name: 'Bullet Penetration', color: '#f5d66c' },
  { key: 'bDmg',   name: 'Bullet Damage',      color: '#f27f70' },
  { key: 'reload', name: 'Reload',             color: '#8fe07b' },
  { key: 'move',   name: 'Movement Speed',     color: '#6fe0dc' },
];

// ---------- Полигоны ----------
// contact — урон в секунду при касании, pierce — сколько «пробивания» теряет пуля при попадании
const SHAPE_TYPES = {
  square:   { name: 'Квадрат',            sides: 4, radius: 19,  hp: 10,   contact: 30,  pierce: 8,  xp: 10,   mass: 1,   color: '#ffd45c' },
  triangle: { name: 'Треугольник',        sides: 3, radius: 22,  hp: 30,   contact: 45,  pierce: 8,  xp: 25,   mass: 1.2, color: '#ff7b73' },
  pentagon: { name: 'Пятиугольник',       sides: 5, radius: 33,  hp: 100,  contact: 60,  pierce: 12, xp: 130,  mass: 3,   color: '#7f94ff' },
  alpha:    { name: 'Альфа-пятиугольник', sides: 5, radius: 100, hp: 3000, contact: 110, pierce: 25, xp: 3000, mass: 40,  color: '#7f94ff' },
};
for (const key in SHAPE_TYPES) SHAPE_TYPES[key].stroke = shadeColor(SHAPE_TYPES[key].color, -0.22);

// ---------- Пушки и классы танков ----------
// Размеры пушек заданы в долях радиуса корпуса:
//  angle  — поворот относительно направления прицела
//  offset — боковое смещение, length/width — длина и ширина ствола, tip — ширина на конце (трапеция)
//  delay  — сдвиг фазы стрельбы (доля перезарядки), остальное — множители к характеристикам пули
function gun(o) {
  return Object.assign({
    angle: 0, offset: 0, length: 1.9, width: 0.84, tip: 0,
    delay: 0, reload: 1, damage: 1, pen: 1, speed: 1, size: 1,
    spread: 0, recoil: 1, life: 1,
  }, o);
}

// Группа пушек с общими параметрами
function guns(list, common) {
  return list.map((o) => gun(Object.assign({}, common, o)));
}

const PI = Math.PI;
// «Двигатели» сзади у Tri-Angle и его наследников: слабые пули, сильная отдача
const THRUSTER = { length: 1.6, damage: 0.25, pen: 0.5, reload: 0.5, recoil: 5, life: 0.6 };

const TANK_CLASSES = {
  // ---------- Стартовый ----------
  basic: {
    name: 'Tank', tier: 0, desc: 'Базовый танк с одной пушкой',
    children: ['twin', 'sniper', 'machinegun', 'flank'],
    guns: [gun({})],
  },

  // ---------- Уровень 15 ----------
  twin: {
    name: 'Twin', tier: 1, desc: 'Две параллельные пушки стреляют по очереди',
    children: ['triple', 'quad', 'twinflank'],
    guns: guns([{ offset: -0.5 }, { offset: 0.5, delay: 0.5 }], { width: 0.76, damage: 0.65, pen: 0.9, recoil: 0.7 }),
  },
  sniper: {
    name: 'Sniper', tier: 1, fov: 1.18, desc: 'Дальний обзор, быстрые и сильные пули',
    children: ['assassin', 'hunter'],
    guns: [gun({ length: 2.35, reload: 1.5, speed: 1.45, damage: 1.15, pen: 1.1, life: 1.35, recoil: 1.3 })],
  },
  machinegun: {
    name: 'Machine Gun', tier: 1, desc: 'Очень быстрая стрельба с разбросом',
    children: ['destroyer', 'gunner'],
    guns: [gun({ length: 1.85, tip: 1.45, reload: 0.5, damage: 0.7, spread: 0.28, speed: 0.95, recoil: 0.6 })],
  },
  flank: {
    name: 'Flank Guard', tier: 1, desc: 'Пушки спереди и сзади',
    children: ['triangle', 'quad', 'twinflank'],
    guns: [gun({}), gun({ angle: PI, length: 1.6 })],
  },

  // ---------- Уровень 30 ----------
  triple: {
    name: 'Triple Shot', tier: 2, desc: 'Три пушки веером',
    children: ['triplet', 'penta', 'spread'],
    guns: guns([{ angle: -PI / 4 }, { angle: PI / 4 }, {}], { damage: 0.7, recoil: 0.6 }),
  },
  quad: {
    name: 'Quad Tank', tier: 2, desc: 'Четыре пушки во все стороны',
    children: ['octo'],
    guns: guns([{ angle: 0 }, { angle: PI / 2, delay: 0.5 }, { angle: PI }, { angle: -PI / 2, delay: 0.5 }], { damage: 0.75 }),
  },
  twinflank: {
    name: 'Twin Flank', tier: 2, desc: 'Двойные пушки спереди и сзади',
    children: ['tripletwin'],
    guns: guns([
      { offset: -0.5 }, { offset: 0.5, delay: 0.5 },
      { angle: PI, offset: -0.5 }, { angle: PI, offset: 0.5, delay: 0.5 },
    ], { width: 0.76, damage: 0.6, pen: 0.9, recoil: 0.7 }),
  },
  assassin: {
    name: 'Assassin', tier: 2, fov: 1.38, speed: 0.95, desc: 'Сверхдальний снайпер',
    children: ['ranger', 'stalker'],
    guns: [gun({ length: 2.7, reload: 2, speed: 1.7, damage: 1.45, pen: 1.25, life: 1.55, recoil: 1.6 })],
  },
  hunter: {
    name: 'Hunter', tier: 2, fov: 1.28, desc: 'Двойной залп из совмещённых стволов',
    children: ['predator', 'streamliner'],
    guns: guns([{ length: 2.4, size: 0.85 }, { length: 2.05, width: 1.16, size: 0.8, delay: 0.2 }],
      { reload: 1.4, speed: 1.3, damage: 0.8, life: 1.3, recoil: 0.8 }),
  },
  destroyer: {
    name: 'Destroyer', tier: 2, desc: 'Огромные медленные снаряды с мощной отдачей',
    children: ['annihilator'],
    guns: [gun({ length: 1.95, width: 1.5, reload: 3.4, damage: 3.2, pen: 2.2, speed: 0.7, recoil: 12, life: 1.1 })],
  },
  gunner: {
    name: 'Gunner', tier: 2, desc: 'Четыре мелких ствола — шквал пуль',
    children: ['sprayer', 'streamliner'],
    guns: guns([
      { offset: -0.58, length: 1.5 }, { offset: 0.58, length: 1.5, delay: 0.5 },
      { offset: -0.28, length: 1.85, delay: 0.25 }, { offset: 0.28, length: 1.85, delay: 0.75 },
    ], { width: 0.4, damage: 0.42, pen: 0.6, reload: 0.55, speed: 1.1, recoil: 0.25, spread: 0.04 }),
  },
  triangle: {
    name: 'Tri-Angle', tier: 2, speed: 1.05, body: 1.1, desc: 'Задние пушки разгоняют танк вперёд',
    children: ['booster', 'fighter'],
    guns: [gun({}), ...guns([{ angle: PI - 0.52 }, { angle: PI + 0.52, delay: 0.5 }], THRUSTER)],
  },

  // ---------- Уровень 45 (финальные) ----------
  triplet: {
    name: 'Triplet', tier: 3, desc: 'Три параллельных ствола',
    children: [],
    guns: guns([
      { offset: -0.5, length: 1.7, delay: 0.5 }, { offset: 0.5, length: 1.7, delay: 0.5 }, { length: 2.0 },
    ], { width: 0.72, damage: 0.6, pen: 0.75, recoil: 0.5 }),
  },
  penta: {
    name: 'Penta Shot', tier: 3, desc: 'Пять пушек веером',
    children: [],
    guns: guns([
      { angle: -PI / 4, length: 1.55, delay: 0.66 }, { angle: PI / 4, length: 1.55, delay: 0.66 },
      { angle: -PI / 8, length: 1.75, delay: 0.33 }, { angle: PI / 8, length: 1.75, delay: 0.33 },
      { length: 2.0 },
    ], { damage: 0.55, recoil: 0.45 }),
  },
  spread: {
    name: 'Spread Shot', tier: 3, desc: 'Широкий веер из одиннадцати стволов',
    children: [],
    guns: (() => {
      const list = [];
      for (let i = 5; i >= 1; i--) {
        for (const side of [-1, 1]) {
          list.push(gun({
            angle: side * i * PI / 12, length: 1.75 - i * 0.08, width: 0.46,
            damage: 0.45, pen: 0.6, delay: i / 6, recoil: 0.2, speed: 0.9,
          }));
        }
      }
      list.push(gun({ length: 1.95, damage: 0.8, recoil: 0.5 }));
      return list;
    })(),
  },
  octo: {
    name: 'Octo Tank', tier: 3, desc: 'Восемь пушек по кругу',
    children: [],
    guns: Array.from({ length: 8 }, (_, i) => gun({ angle: i * PI / 4, delay: (i % 2) * 0.5, damage: 0.65, recoil: 0.6 })),
  },
  tripletwin: {
    name: 'Triple Twin', tier: 3, desc: 'Три пары пушек',
    children: [],
    guns: [0, 1, 2].flatMap((k) => guns([
      { angle: k * 2 * PI / 3, offset: -0.5 }, { angle: k * 2 * PI / 3, offset: 0.5, delay: 0.5 },
    ], { width: 0.76, damage: 0.55, pen: 0.9, recoil: 0.6 })),
  },
  ranger: {
    name: 'Ranger', tier: 3, fov: 1.62, speed: 0.92, desc: 'Максимальная дальность обзора и выстрела',
    children: [],
    guns: [gun({ length: 3.0, reload: 2.2, speed: 1.9, damage: 1.65, pen: 1.35, life: 1.75, recoil: 1.8 })],
  },
  stalker: {
    name: 'Stalker', tier: 3, fov: 1.4, invis: true, desc: 'Становится невидимым, когда стоит на месте',
    children: [],
    guns: [gun({ length: 2.65, tip: 1.2, reload: 2.0, speed: 1.75, damage: 1.5, pen: 1.3, life: 1.55, recoil: 1.5 })],
  },
  predator: {
    name: 'Predator', tier: 3, fov: 1.48, desc: 'Тройной залп из совмещённых стволов',
    children: [],
    guns: guns([
      { length: 2.4, size: 0.85 },
      { length: 2.12, width: 1.14, size: 0.8, delay: 0.15 },
      { length: 1.84, width: 1.44, size: 0.72, delay: 0.3 },
    ], { reload: 1.5, speed: 1.4, damage: 0.85, life: 1.4, recoil: 0.8 }),
  },
  streamliner: {
    name: 'Streamliner', tier: 3, fov: 1.2, desc: 'Непрерывный поток пуль',
    children: [],
    guns: guns([2.6, 2.35, 2.1, 1.85, 1.6].map((len, i) => ({ length: len, delay: i * 0.2 })),
      { damage: 0.38, pen: 0.6, reload: 0.6, speed: 1.15, recoil: 0.25, life: 1.1 }),
  },
  annihilator: {
    name: 'Annihilator', tier: 3, desc: 'Гигантские снаряды разрушения',
    children: [],
    guns: [gun({ length: 1.95, width: 2.0, reload: 3.6, damage: 4.4, pen: 3, speed: 0.65, recoil: 18, life: 1.1 })],
  },
  sprayer: {
    name: 'Sprayer', tier: 3, desc: 'Пулемёт с дополнительным длинным стволом',
    children: [],
    guns: [
      gun({ length: 2.25, width: 0.5, reload: 0.3, damage: 0.35, pen: 0.6, spread: 0.18, delay: 0.5, recoil: 0.2 }),
      gun({ length: 1.85, tip: 1.45, reload: 0.5, damage: 0.7, spread: 0.28, speed: 0.95, recoil: 0.6 }),
    ],
  },
  booster: {
    name: 'Booster', tier: 3, speed: 1.08, body: 1.15, desc: 'Четыре двигателя — максимальная скорость',
    children: [],
    guns: [gun({}), ...guns([
      { angle: PI - 0.8, length: 1.4, delay: 0.25 }, { angle: PI + 0.8, length: 1.4, delay: 0.75 },
      { angle: PI - 0.52 }, { angle: PI + 0.52, delay: 0.5 },
    ], THRUSTER)],
  },
  fighter: {
    name: 'Fighter', tier: 3, speed: 1.05, body: 1.1, desc: 'Боковые пушки и двигатели',
    children: [],
    guns: [
      gun({}),
      gun({ angle: -PI / 2, damage: 0.8 }), gun({ angle: PI / 2, damage: 0.8, delay: 0.5 }),
      ...guns([{ angle: PI - 0.52 }, { angle: PI + 0.52, delay: 0.5 }], THRUSTER),
    ],
  },
};

// Главная (передняя) пушка каждого класса — по ней боты рассчитывают упреждение
for (const id in TANK_CLASSES) {
  const cls = TANK_CLASSES[id];
  cls.id = id;
  cls.mainGun = cls.guns.find((g) => Math.abs(g.angle) < 0.01) || cls.guns[0];
  for (const child of cls.children) {
    if (!TANK_CLASSES[child]) console.warn('Неизвестный класс в дереве:', child);
  }
}
