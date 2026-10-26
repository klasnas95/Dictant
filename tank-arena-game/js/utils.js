// ============================================================
//  utils.js — вспомогательные функции и пространственная сетка
// ============================================================

const TAU = Math.PI * 2;

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Уникальные id для всех сущностей (нужны для дедупликации пар столкновений)
let _nextId = 1;
const nextId = () => _nextId++;

// Кратчайшая разность углов from -> to в диапазоне (-PI, PI]
function angleDiff(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
}

// Плавный поворот к целевому углу
function lerpAngle(from, to, t) {
  return from + angleDiff(from, to) * t;
}

// Затемнение цвета вида "#rrggbb" на долю k (0..1) — для обводок
function darken(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - k));
  const g = Math.round(((n >> 8) & 255) * (1 - k));
  const b = Math.round((n & 255) * (1 - k));
  return `rgb(${r},${g},${b})`;
}

// Время жизни в читаемом виде
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m} мин ${s} сек` : `${s} сек`;
}

// Счёт в компактном виде: 12345 -> "12.3k"
function formatScore(n) {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

// ------------------------------------------------------------
//  Пространственная сетка (spatial hash).
//  Каждая сущность с полями x, y, r кладётся во все ячейки,
//  которые перекрывает её ограничивающий квадрат. Благодаря этому
//  столкновения проверяются только между соседями, а не O(n^2).
// ------------------------------------------------------------
class SpatialGrid {
  constructor(worldSize, cellSize) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(worldSize / cellSize);
    this.cells = [];
    for (let i = 0; i < this.cols * this.cols; i++) this.cells.push([]);
  }

  clear() {
    const cells = this.cells;
    for (let i = 0; i < cells.length; i++) cells[i].length = 0;
  }

  // Индекс ячейки по координате (с ограничением по краям карты)
  index(v) {
    const i = Math.floor(v / this.cellSize);
    return i < 0 ? 0 : i >= this.cols ? this.cols - 1 : i;
  }

  insert(e) {
    const c0 = this.index(e.x - e.r), c1 = this.index(e.x + e.r);
    const r0 = this.index(e.y - e.r), r1 = this.index(e.y + e.r);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) this.cells[cy * this.cols + cx].push(e);
    }
  }
}
