// ============================================================
//  camera.js — плавная камера, следующая за танком
// ============================================================

class Camera {
  constructor() {
    this.x = CONFIG.WORLD_SIZE / 2;
    this.y = CONFIG.WORLD_SIZE / 2;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.scale = 1;
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
  }

  // Базовый масштаб: на любом экране видна примерно одинаковая часть мира
  baseScale() {
    return Math.max(this.h / 900, this.w / 1600);
  }

  // Мгновенно переместить камеру (при появлении)
  snapTo(x, y, fov) {
    this.x = x;
    this.y = y;
    this.scale = this.baseScale() / fov;
  }

  // Плавное слежение: экспоненциальное сглаживание не зависит от FPS
  update(dt, x, y, fov) {
    const k = 1 - Math.exp(-dt * 9);
    this.x += (x - this.x) * k;
    this.y += (y - this.y) * k;
    const target = this.baseScale() / fov;
    this.scale += (target - this.scale) * (1 - Math.exp(-dt * 2.5));
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.w / 2) / this.scale + this.x,
      y: (sy - this.h / 2) / this.scale + this.y,
    };
  }

  // Попадает ли круг (x, y, r) в поле зрения
  isVisible(x, y, r) {
    const hw = this.w / 2 / this.scale + r;
    const hh = this.h / 2 / this.scale + r;
    return Math.abs(x - this.x) < hw && Math.abs(y - this.y) < hh;
  }

  // Установить матрицу холста: дальше всё рисуется в мировых координатах
  apply(ctx, dpr) {
    const s = this.scale * dpr;
    ctx.setTransform(s, 0, 0, s, (this.w / 2 - this.x * this.scale) * dpr, (this.h / 2 - this.y * this.scale) * dpr);
  }
}
