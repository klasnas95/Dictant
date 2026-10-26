'use strict';
// ============================================================
//  ui.js — интерфейс поверх холста: экраны старта и смерти,
//  таблица лидеров, миникарта, полосы очков и уровня,
//  панель прокачки характеристик и панель эволюции
// ============================================================

const UI = {
  game: null,
  els: {},
  statRowEls: [],
  statSig: '',       // «подписи» состояния — чтобы не трогать DOM без изменений
  upgSig: null,
  barCache: {},
  lbTimer: 0,
  fpsTimer: 0,
  mmSize: 160,
  mmDpr: 1,
  nick: 'Игрок',

  init(game) {
    this.game = game;
    const ids = [
      'hud', 'lbRows', 'statRows', 'statPoints', 'statPanel', 'upgradePanel', 'upgradeCards',
      'playerName', 'scoreFill', 'scoreText', 'levelFill', 'levelText', 'minimap',
      'tglFire', 'tglSpin', 'fps', 'notifications', 'startScreen', 'deathScreen',
      'nickInput', 'playBtn', 'againBtn', 'killedBy', 'dScore', 'dLevel', 'dClass', 'dTime', 'dKills',
    ];
    for (const id of ids) this.els[id] = document.getElementById(id);

    // Миникарта с учётом плотности пикселей экрана
    this.mmDpr = Math.min(window.devicePixelRatio || 1, 2);
    const mm = this.els.minimap;
    mm.width = this.mmSize * this.mmDpr;
    mm.height = this.mmSize * this.mmDpr;
    mm.style.width = this.mmSize + 'px';
    mm.style.height = this.mmSize + 'px';
    this.mmCtx = mm.getContext('2d');

    this.buildStatRows();

    // Восстанавливаем ник (хранилище может быть недоступно — тогда просто пропускаем)
    try {
      const saved = localStorage.getItem('tankArenaNick');
      if (saved) this.els.nickInput.value = saved;
    } catch (e) { /* нет доступа к localStorage */ }

    this.els.playBtn.addEventListener('click', () => this.startClicked());
    this.els.nickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.startClicked();
    });
    this.els.againBtn.addEventListener('click', () => this.againClicked());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !this.els.deathScreen.classList.contains('hidden')) this.againClicked();
    });
    setTimeout(() => this.els.nickInput.focus(), 60);
  },

  // ---------- Экраны ----------
  startClicked() {
    if (this.game.state === 'playing') return;
    const nick = this.els.nickInput.value.trim().slice(0, 16) || 'Игрок';
    this.nick = nick;
    try { localStorage.setItem('tankArenaNick', nick); } catch (e) { /* игнорируем */ }
    this.beginGame();
  },

  againClicked() {
    if (this.game.state === 'playing') return;
    this.beginGame();
  },

  beginGame() {
    this.els.startScreen.classList.add('hidden');
    this.els.deathScreen.classList.add('hidden');
    this.els.hud.classList.remove('hidden');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    this.statSig = '';
    this.upgSig = null;
    this.barCache = {};
    this.lbTimer = 0;
    this.game.startGame(this.nick);
    this.els.playerName.textContent = this.nick;
  },

  showDeath(info) {
    const e = this.els;
    e.killedBy.innerHTML = info.killer;
    e.dScore.textContent = Math.floor(info.score).toLocaleString('ru-RU');
    e.dLevel.textContent = info.level;
    e.dClass.textContent = info.className;
    e.dTime.textContent = formatTime(info.time);
    e.dKills.textContent = info.kills;
    e.hud.classList.add('hidden');
    e.upgradePanel.classList.add('hidden');
    e.deathScreen.classList.remove('hidden');
  },

  // Всплывающее уведомление сверху по центру
  notify(html, type) {
    const box = this.els.notifications;
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'note' + (type ? ' ' + type : '');
    el.innerHTML = html;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.classList.add('fade'), 2600);
    setTimeout(() => el.remove(), 3200);
  },

  // ---------- Панель характеристик ----------
  buildStatRows() {
    const segs = '<i></i>'.repeat(CONFIG.STAT_MAX);
    this.els.statRows.innerHTML = STATS.map((s, i) => `
      <div class="stat-row" style="--c:${s.color}">
        <span class="stat-label">${s.name}</span>
        <div class="stat-segs">${segs}</div>
        <span class="stat-key">${i + 1}</span>
        <span class="stat-plus">+</span>
      </div>`).join('');
    this.statRowEls = Array.from(this.els.statRows.querySelectorAll('.stat-row'));
    this.statRowEls.forEach((row, i) => {
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.game.upgradeStat(i);
      });
    });
  },

  updateStats(p) {
    const sig = p.stats.join(',') + '|' + p.statPoints;
    if (sig === this.statSig) return;
    this.statSig = sig;
    this.els.statPoints.textContent = '×' + p.statPoints;
    this.els.statPanel.classList.toggle('has-points', p.statPoints > 0);
    this.statRowEls.forEach((row, i) => {
      const segs = row.children[1].children;
      for (let k = 0; k < segs.length; k++) segs[k].classList.toggle('on', k < p.stats[i]);
      row.classList.toggle('maxed', p.stats[i] >= CONFIG.STAT_MAX);
    });
  },

  // ---------- Панель эволюции ----------
  updateUpgrades(p) {
    const opts = p.evolveOptions();
    const sig = opts.join(',');
    if (sig === this.upgSig) return;
    this.upgSig = sig;
    const panel = this.els.upgradePanel;
    if (!opts.length) { panel.classList.add('hidden'); return; }

    const cards = this.els.upgradeCards;
    cards.innerHTML = '';
    opts.forEach((id) => {
      const cls = TANK_CLASSES[id];
      const card = document.createElement('div');
      card.className = 'upg-card';
      card.title = cls.desc || '';
      const cv = document.createElement('canvas');
      cv.width = 180; cv.height = 180;
      this.drawPreview(cv, cls);
      const label = document.createElement('span');
      label.textContent = cls.name;
      card.appendChild(cv);
      card.appendChild(label);
      card.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.game.evolvePlayer(id);
      });
      cards.appendChild(card);
    });
    panel.classList.remove('hidden');
  },

  // Превью класса, вписанное в квадратный холст
  drawPreview(canvas, cls) {
    const ctx = canvas.getContext('2d');
    const S = canvas.width, pad = 22, angle = -Math.PI / 4;
    const b = Tank.modelBounds(cls, angle);
    const r = (S - pad * 2) / Math.max(b.maxX - b.minX, b.maxY - b.minY);
    const cx = S / 2 - (b.minX + b.maxX) / 2 * r;
    const cy = S / 2 - (b.minY + b.maxY) / 2 * r;
    ctx.clearRect(0, 0, S, S);
    Tank.drawModel(ctx, cls, cx, cy, r, angle, COLORS.player, null, 0);
  },

  // ---------- Нижние полосы ----------
  setWidth(el, key, pct) {
    const v = pct.toFixed(1) + '%';
    if (this.barCache[key] !== v) { this.barCache[key] = v; el.style.width = v; }
  },
  setText(el, key, text) {
    if (this.barCache[key] !== text) { this.barCache[key] = text; el.textContent = text; }
  },

  updateBars(p, game) {
    let frac = 1;
    if (p.level < CONFIG.MAX_LEVEL) {
      frac = (p.score - LEVEL_XP[p.level]) / (LEVEL_XP[p.level + 1] - LEVEL_XP[p.level]);
    }
    this.setWidth(this.els.levelFill, 'lvl', clamp(frac, 0, 1) * 100);
    this.setText(this.els.levelText, 'lvlT', 'Уровень ' + p.level + ' · ' + p.cls.name);

    let top = 1;
    for (const t of game.tanks) if (!t.dead && t.score > top) top = t.score;
    this.setWidth(this.els.scoreFill, 'score', clamp(p.score / top, 0, 1) * 100);
    this.setText(this.els.scoreText, 'scoreT', 'Счёт: ' + Math.floor(p.score).toLocaleString('ru-RU'));
  },

  // ---------- Таблица лидеров ----------
  updateLeaderboard(game) {
    const list = game.tanks.filter((t) => !t.dead).sort((a, b) => b.score - a.score);
    const top = list.slice(0, 10);
    const maxScore = Math.max(1, top.length ? top[0].score : 1);
    const row = (t, rank) => {
      const pct = Math.max(6, (t.score / maxScore) * 100).toFixed(1);
      return `<div class="lb-row${t.isPlayer ? ' me' : ''}">
        <div class="lb-fill" style="width:${pct}%;background:${t.color}"></div>
        <span class="lb-rank">${rank}.</span>
        <span class="lb-name">${escapeHtml(t.name)}</span>
        <span class="lb-score">${formatScore(t.score)}</span>
      </div>`;
    };
    let html = '';
    top.forEach((t, i) => { html += row(t, i + 1); });
    const p = game.player;
    if (p && !p.dead && !top.includes(p)) {
      html += '<div class="lb-sep"></div>' + row(p, list.indexOf(p) + 1);
    }
    this.els.lbRows.innerHTML = html;
  },

  // ---------- Миникарта ----------
  drawMinimap(game) {
    const c = this.mmCtx, S = this.mmSize, W = CONFIG.WORLD_SIZE, k = S / W;
    c.setTransform(this.mmDpr, 0, 0, this.mmDpr, 0, 0);
    c.clearRect(0, 0, S, S);
    c.fillStyle = 'rgba(228, 234, 238, 0.92)';
    c.fillRect(0, 0, S, S);

    // Гнездо пятиугольников
    c.beginPath();
    c.arc(S / 2, S / 2, CONFIG.NEST_RADIUS * k, 0, TAU);
    c.fillStyle = 'rgba(127, 148, 255, 0.22)';
    c.fill();

    // Альфа-пятиугольники
    c.fillStyle = SHAPE_TYPES.alpha.color;
    for (const s of game.shapes) {
      if (s.type !== 'alpha') continue;
      c.beginPath();
      polygonPath(c, s.x * k, s.y * k, 4, 5, s.angle);
      c.fill();
    }

    // Боты
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(30, 40, 50, 0.45)';
    for (const t of game.tanks) {
      if (t.isPlayer || t.dead || t.opacity < 0.35) continue;
      c.beginPath();
      c.arc(t.x * k, t.y * k, 2.8, 0, TAU);
      c.fillStyle = t.color;
      c.fill();
      c.stroke();
    }

    // Видимая область
    const cam = game.camera;
    const vw = game.w / cam.zoom * k, vh = game.h / cam.zoom * k;
    c.strokeStyle = 'rgba(40, 60, 80, 0.35)';
    c.strokeRect(cam.x * k - vw / 2, cam.y * k - vh / 2, vw, vh);

    // Игрок — стрелка по направлению прицела
    const p = game.player;
    if (p && !p.dead) {
      c.save();
      c.translate(p.x * k, p.y * k);
      c.rotate(p.angle);
      c.beginPath();
      c.moveTo(6, 0);
      c.lineTo(-4, -4.5);
      c.lineTo(-2, 0);
      c.lineTo(-4, 4.5);
      c.closePath();
      c.fillStyle = COLORS.player;
      c.fill();
      c.strokeStyle = '#fff';
      c.lineWidth = 1.4;
      c.stroke();
      c.restore();
    }
  },

  // ---------- Обновление каждый кадр ----------
  update(dt, game) {
    this.fpsTimer -= dt;
    if (this.fpsTimer <= 0) {
      this.fpsTimer = 0.5;
      this.els.fps.textContent = game.fps + ' FPS';
    }
    const p = game.player;
    if (game.state !== 'playing' || !p) return;

    this.updateStats(p);
    this.updateUpgrades(p);
    this.updateBars(p, game);
    this.lbTimer -= dt;
    if (this.lbTimer <= 0) {
      this.lbTimer = 0.3;
      this.updateLeaderboard(game);
    }
    this.drawMinimap(game);
    this.els.tglFire.classList.toggle('on', p.autoFire);
    this.els.tglSpin.classList.toggle('on', p.autoSpin);
  },
};
