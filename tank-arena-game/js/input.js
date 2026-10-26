'use strict';
// ============================================================
//  input.js — клавиатура и мышь
//  Используем e.code, чтобы управление работало при любой
//  раскладке (в том числе русской)
// ============================================================

// Клавиши, для которых отключаем действие браузера по умолчанию (прокрутка и т.п.)
const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
]);

const Input = {
  keys: new Set(),     // зажатые клавиши
  pressed: [],         // очередь нажатий (для переключателей и прокачки)
  mouseX: 0,
  mouseY: 0,
  mouseDown: false,

  init(canvas) {
    this.mouseX = window.innerWidth / 2;
    this.mouseY = window.innerHeight / 2;

    window.addEventListener('keydown', (e) => {
      // Не перехватываем ввод в текстовых полях (поле ника)
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.push(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });

    // Потеря фокуса окна — «отпускаем» все клавиши
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });

    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  down(code) { return this.keys.has(code); },

  // Забрать накопленные нажатия
  consumePressed() {
    const list = this.pressed;
    this.pressed = [];
    return list;
  },
};
