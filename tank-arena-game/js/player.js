// ============================================================
// Игрок: клавиатура, мышь, автострельба (E) и автоповорот (C)
// ============================================================

// Состояние ввода, общее для всей игры
const input = {
  keys: new Set(),        // нажатые клавиши (event.code)
  mouseX: 0,              // позиция курсора в пикселях экрана
  mouseY: 0,
  mouseDown: false,       // зажата ли левая кнопка мыши
  autoFire: false,        // E: автострельба
  autoRotate: false,      // C: автоповорот пушки
};

class Player extends Tank {
  constructor(name) {
    super(name, CONFIG.PLAYER_COLOR);
    this.isPlayer = true;
  }

  // Переносит ввод в танк: направление движения, прицел и стрельбу
  applyInput(dt, toWorld) {
    const keys = input.keys;
    let mx = 0;
    let my = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    // Нормализуем диагональ, чтобы она не была быстрее
    const len = Math.hypot(mx, my);
    this.moveX = len ? mx / len : 0;
    this.moveY = len ? my / len : 0;

    if (input.autoRotate) {
      this.aim += dt * 2.5;   // автоповорот: пушка крутится сама
    } else {
      const m = toWorld(input.mouseX, input.mouseY);
      this.aim = Math.atan2(m.y - this.y, m.x - this.x);
    }
    this.shooting = input.mouseDown || input.autoFire || keys.has('Space');
  }
}

// Подписка на клавиатуру и мышь. onInvest(i) — вложить очко в стат с индексом i
function bindInput(canvas, onInvest) {
  const arrowAndSpace = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;   // не мешаем вводу ника
    if (arrowAndSpace.includes(e.code)) e.preventDefault();
    input.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyE') input.autoFire = !input.autoFire;
    if (e.code === 'KeyC') input.autoRotate = !input.autoRotate;
    const digit = /^(?:Digit|Numpad)([1-8])$/.exec(e.code);
    if (digit) onInvest(Number(digit[1]) - 1);
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  // Если окно потеряло фокус, отпускаем все клавиши и кнопку мыши
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.mouseDown = false;
  });
  window.addEventListener('mousemove', (e) => {
    input.mouseX = e.clientX;
    input.mouseY = e.clientY;
  });
  // Стрельба начинается только при нажатии на игровое поле, а не на панели
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.mouseDown = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
