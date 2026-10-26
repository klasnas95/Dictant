// ============================================================
//  player.js — танк игрока: управление с клавиатуры и мыши
// ============================================================

class Player extends Tank {
  constructor(game, name, x, y) {
    super(game, { name, color: TANK_COLORS.player.fill, stroke: TANK_COLORS.player.stroke, x, y });
    this.isPlayer = true;
    this.autoFire = false; // E
    this.autoSpin = false; // C
  }

  // Считываем ввод и превращаем его в намерения танка
  control(dt, input, camera) {
    // Движение: WASD / стрелки
    let mx = 0, my = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) my -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) my += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) mx -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) mx += 1;
    this.moveX = mx;
    this.moveY = my;

    // Прицеливание: пушка плавно поворачивается за курсором
    if (this.autoSpin) {
      this.angle += CONFIG.AUTOSPIN_SPEED * dt;
    } else {
      const m = camera.screenToWorld(input.mouse.x, input.mouse.y);
      const target = Math.atan2(m.y - this.y, m.x - this.x);
      this.angle = lerpAngle(this.angle, target, 1 - Math.exp(-dt * 40));
    }

    // Стрельба: ЛКМ, пробел или автострельба
    this.shooting = input.mouse.down || input.isDown('Space') || this.autoFire;
  }
}
