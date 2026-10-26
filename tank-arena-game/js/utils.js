'use strict';
// ============================================================
//  utils.js — общие математические и вспомогательные функции
// ============================================================

const TAU = Math.PI * 2;

// Счётчик уникальных идентификаторов для всех игровых объектов
let nextEntityId = 1;

function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Перемешивание массива (Фишер–Йетс)
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

// Кратчайшая знаковая разница углов (to - from) в диапазоне [-PI, PI]
function angleDiff(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
}

// Поворот угла к цели с ограниченной скоростью
function rotateTowards(current, target, maxStep) {
  const d = angleDiff(current, target);
  if (Math.abs(d) <= maxStep) return current + d;
  return current + Math.sign(d) * maxStep;
}

// Коэффициент экспоненциального сглаживания, не зависящий от FPS
function smoothFactor(speed, dt) { return 1 - Math.exp(-speed * dt); }

// ---------- Цвета ----------

const shadeCache = new Map();

// Затемнение (amount < 0) или осветление (amount > 0) hex-цвета
function shadeColor(hex, amount) {
  const key = hex + '|' + amount;
  const cached = shadeCache.get(key);
  if (cached) return cached;
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amount < 0) {
    const k = 1 + amount;
    r *= k; g *= k; b *= k;
  } else {
    r += (255 - r) * amount; g += (255 - g) * amount; b += (255 - b) * amount;
  }
  const res = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  shadeCache.set(key, res);
  return res;
}

// ---------- Пути для Canvas ----------

// Правильный многоугольник (без beginPath — можно собирать несколько фигур в один путь)
function polygonPath(ctx, x, y, r, sides, angle) {
  for (let i = 0; i < sides; i++) {
    const a = angle + (i / sides) * TAU;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// Прямоугольник со скруглёнными углами (совместимо со старыми браузерами)
function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Полоска здоровья в экранных координатах (cx — центр по X, y — верх)
function drawHealthBar(ctx, cx, y, w, h, frac, color) {
  roundRectPath(ctx, cx - w / 2 - 2, y - 2, w + 4, h + 4, (h + 4) / 2);
  ctx.fillStyle = COLORS.hpBack;
  ctx.fill();
  if (frac > 0) {
    roundRectPath(ctx, cx - w / 2, y, Math.max(h, w * frac), h, h / 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

// ---------- Форматирование ----------

function formatScore(n) {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
