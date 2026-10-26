// ============================================================
//  input.js — клавиатура и мышь
// ============================================================

const Input = {
  keys: {},                          // зажатые клавиши по e.code
  mouse: { x: 0, y: 0, down: false }, // позиция в пикселях экрана
  presses: [],                       // очередь разовых нажатий (E, C, 1–8)

  init(canvas) {
    window.addEventListener('keydown', (e) => {
      // Не мешаем вводу ника
      if (e.target && e.target.tagName === 'INPUT') return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) this.presses.push(e.code); // без автоповтора
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    // Потеря фокуса — сбрасываем всё, чтобы танк не «залипал»
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.down = false; });
    window.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouse.down = true; });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  isDown(code) { return !!this.keys[code]; },

  // Забрать накопленные нажатия (очередь очищается)
  takePresses() {
    if (this.presses.length === 0) return this.presses;
    const p = this.presses;
    this.presses = [];
    return p;
  },
};
