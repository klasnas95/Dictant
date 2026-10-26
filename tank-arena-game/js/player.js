'use strict';
// ============================================================
//  player.js — танк игрока: управление с клавиатуры и мыши,
//  автострельба (E) и автоповорот (C)
// ============================================================

class Player extends Tank {
  constructor(name, x, y) {
    super({ name, color: COLORS.player, isPlayer: true, x, y });
    this.autoFire = false;
    this.autoSpin = false;
  }

  // Движение и стрельба — каждый шаг физики
  handleInput() {
    let mx = 0, my = 0;
    if (Input.down('KeyW') || Input.down('ArrowUp')) my -= 1;
    if (Input.down('KeyS') || Input.down('ArrowDown')) my += 1;
    if (Input.down('KeyA') || Input.down('ArrowLeft')) mx -= 1;
    if (Input.down('KeyD') || Input.down('ArrowRight')) mx += 1;
    const len = Math.hypot(mx, my);
    this.moveX = len ? mx / len : 0;
    this.moveY = len ? my / len : 0;
    this.firing = this.autoFire || Input.mouseDown || Input.down('Space');
  }

  // Прицеливание — каждый кадр (для максимальной отзывчивости)
  updateAim(game, frameDt) {
    if (this.autoSpin) {
      this.angle += frameDt * 1.8;
      return;
    }
    const m = game.screenToWorld(Input.mouseX, Input.mouseY);
    this.angle = Math.atan2(m.y - this.ry, m.x - this.rx);
  }

  onLevelUp(oldLevel) {
    for (let i = 1; i < TIER_LEVELS.length; i++) {
      const lv = TIER_LEVELS[i];
      if (lv > oldLevel && lv <= this.level && this.canEvolve()) {
        UI.notify('Уровень ' + lv + '! Выберите новый класс танка слева вверху', 'evolve');
      }
    }
  }
}
