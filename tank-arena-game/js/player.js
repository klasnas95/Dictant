// Управление игроком: клавиатура, мышь, автострельба (E) и автоповорот пушки (C).

const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  shooting: false,                 // зажата ЛКМ или пробел
  autoFire: false,                 // переключатель E
  autoSpin: false,                 // переключатель C
  mouseX: innerWidth / 2,          // курсор в пикселях окна
  mouseY: innerHeight / 2,
};

const MOVE_KEYS = {
  w: 'up', arrowup: 'up',
  s: 'down', arrowdown: 'down',
  a: 'left', arrowleft: 'left',
  d: 'right', arrowright: 'right',
};

// Подписка на ввод. handlers.onStat(index) — вложить очко в стат с индексом index
function initInput(canvas, handlers) {
  window.addEventListener('keydown', (e) => {
    // Пока печатается ник, клавиши не управляют танком
    if (e.target.tagName === 'INPUT') return;
    const key = e.key.toLowerCase();
    if (MOVE_KEYS[key]) {
      input[MOVE_KEYS[key]] = true;
      e.preventDefault();
    } else if (key === ' ') {
      input.shooting = true;
      e.preventDefault();
    } else if (key === 'e' && !e.repeat) {
      input.autoFire = !input.autoFire;
    } else if (key === 'c' && !e.repeat) {
      input.autoSpin = !input.autoSpin;
    } else if (/^[1-8]$/.test(key) && !e.repeat) {
      handlers.onStat(Number(key) - 1);
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (MOVE_KEYS[key]) input[MOVE_KEYS[key]] = false;
    if (key === ' ') input.shooting = false;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.shooting = true;
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.shooting = false;
  });

  window.addEventListener('mousemove', (e) => {
    input.mouseX = e.clientX;
    input.mouseY = e.clientY;
  });

  // Если окно потеряло фокус, сбрасываем зажатые клавиши, чтобы танк не уехал сам
  window.addEventListener('blur', () => {
    input.up = false;
    input.down = false;
    input.left = false;
    input.right = false;
    input.shooting = false;
  });
}

// Управление танком игрока на один кадр: движение, прицел и стрельба
function updatePlayer(player, dt) {
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(dx, dy) || 1;
  player.move(dt, dx / len, dy / len);

  if (input.autoSpin) {
    // Автоповорот: пушка крутится сама, курсор не используется
    player.aim += CONFIG.AUTO_SPIN_SPEED * dt;
  } else {
    // Прицел — на курсор; экранные координаты переводим в мировые с учётом камеры
    const w = screenToWorld(input.mouseX, input.mouseY);
    player.aim = Math.atan2(w.y - player.y, w.x - player.x);
  }

  if (input.shooting || input.autoFire) player.fire();
}
