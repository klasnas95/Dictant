// ============================================================
//  ui.js — интерфейс: HUD, лидеры, миникарта, прокачка, выбор класса,
//          стартовый экран и экран смерти
// ============================================================

const STAT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const TILE_COLORS = ['#f0b97d', '#8edf7c', '#74c3f0', '#e589a5', '#c7a2f2', '#f2d56b'];

// Иконка класса для панели выбора (рисуем танк на отдельном холсте)
function makeClassIcon(classId, size) {
  const cls = CLASSES[classId];
  const dpr = 2;
  const c = document.createElement('canvas');
  c.width = c.height = size * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.translate(size / 2, size / 2);
  let reach = 1.4;
  for (const b of cls.barrels) reach = Math.max(reach, Math.hypot(b.len, b.x * 1.0));
  const r = (size * 0.44) / reach;
  renderTank(ctx, cls, r, -Math.PI / 4, TANK_COLORS.player.fill, TANK_COLORS.player.stroke, null);
  return c.toDataURL();
}

class UI {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);

    this.hud = $('hud');
    this.chipFire = $('chip-fire');
    this.chipSpin = $('chip-spin');
    this.leaderboard = $('leaderboard');
    this.lbList = $('lb-list');
    this.evolve = $('evolve');
    this.evolveTitle = $('evolve-title');
    this.evolveTiles = $('evolve-tiles');
    this.statsPanel = $('stats');
    this.statsPoints = $('stats-points');
    this.statRows = $('stat-rows');
    this.minimap = $('minimap');
    this.bars = $('bars');
    this.scoreValue = $('score-value');
    this.levelFill = $('level-fill');
    this.levelText = $('level-text');
    this.namePill = $('name-pill');
    this.toastEl = $('toast');

    this.startScreen = $('start-screen');
    this.deathScreen = $('death-screen');
    this.nickInput = $('nick-input');

    this.iconCache = {};
    this.lbTimer = 0;
    this.statKey = '';
    this.evolveKey = '';
    this.cache = {}; // последние выведенные значения (чтобы не трогать DOM зря)
    this.toastTimer = 0;

    this.buildStatRows();
    this.buildLeaderboard();
    this.setupMinimap();
    this.bindScreens();
  }

  // ---------------- Построение DOM ----------------

  buildStatRows() {
    this.statEls = [];
    STATS.forEach((st, i) => {
      const row = document.createElement('div');
      row.className = 'stat-row';
      row.style.setProperty('--c', st.color);
      const pips = document.createElement('div');
      pips.className = 'pips';
      const pipEls = [];
      for (let k = 0; k < CONFIG.MAX_STAT_POINTS; k++) {
        const p = document.createElement('span');
        pips.appendChild(p);
        pipEls.push(p);
      }
      const name = document.createElement('span');
      name.className = 'stat-name';
      name.textContent = st.name;
      const key = document.createElement('span');
      key.className = 'stat-key';
      key.textContent = STAT_KEYS[i];
      row.append(pips, name, key);
      row.addEventListener('click', () => this.game.investStat(i));
      this.statRows.appendChild(row);
      this.statEls.push({ row, pipEls });
    });
  }

  buildLeaderboard() {
    this.lbRows = [];
    for (let i = 0; i < 11; i++) {
      const li = document.createElement('li');
      li.innerHTML = '<div class="lb-bar"></div><span class="lb-name"></span><span class="lb-score"></span>';
      this.lbList.appendChild(li);
      this.lbRows.push({
        li, bar: li.children[0], name: li.children[1], score: li.children[2],
      });
    }
  }

  setupMinimap() {
    this.mmSize = 160;
    this.mmDpr = Math.min(window.devicePixelRatio || 1, 2);
    this.minimap.width = this.mmSize * this.mmDpr;
    this.minimap.height = this.mmSize * this.mmDpr;
    this.minimap.style.width = this.mmSize + 'px';
    this.minimap.style.height = this.mmSize + 'px';
    this.mmCtx = this.minimap.getContext('2d');
  }

  bindScreens() {
    const g = this.game;
    this.nickInput.value = this.loadNick();
    document.getElementById('play-btn').addEventListener('click', () => this.startGame());
    this.nickInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.startGame(); });
    document.getElementById('again-btn').addEventListener('click', () => g.respawn());
    window.addEventListener('keydown', (e) => {
      if (g.state === 'dead' && (e.key === 'Enter')) g.respawn();
    });
    setTimeout(() => this.nickInput.focus(), 50);
  }

  loadNick() {
    try { return localStorage.getItem('tankArenaNick') || ''; } catch (e) { return ''; }
  }

  startGame() {
    const name = this.nickInput.value.trim().slice(0, 16) || 'Игрок';
    try { localStorage.setItem('tankArenaNick', name); } catch (e) { /* localStorage недоступен */ }
    this.nickInput.blur();
    this.startScreen.classList.add('hidden');
    this.game.startGame(name);
  }

  // ---------------- Экраны ----------------

  showDeath(info) {
    document.getElementById('death-killer').textContent = info.killer ? `Вас уничтожил: ${info.killer}` : '';
    document.getElementById('death-score').textContent = Math.floor(info.score).toLocaleString('ru-RU');
    document.getElementById('death-level').textContent = `${info.level} (${info.className})`;
    document.getElementById('death-time').textContent = formatTime(info.time);
    document.getElementById('death-kills').textContent = info.kills;
    this.deathScreen.classList.remove('hidden');
  }

  hideDeath() {
    this.deathScreen.classList.add('hidden');
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastTimer = 1.8;
  }

  // ---------------- Обновление каждый кадр ----------------

  update(dt) {
    const g = this.game, p = g.player;
    const alive = !!p && !p.dead;
    const inGame = g.state !== 'menu';

    this.hud.classList.toggle('hidden', !inGame);
    if (inGame) {
      this.bars.classList.toggle('hidden', !alive);
      this.statsPanel.classList.toggle('hidden', !alive);
      document.getElementById('toggles').classList.toggle('hidden', !alive);
      if (alive) {
        this.updateBars(p);
        this.updateStats(p);
        this.updateEvolve(p);
        this.chipFire.classList.toggle('on', p.autoFire);
        this.chipSpin.classList.toggle('on', p.autoSpin);
      } else {
        this.evolve.classList.add('hidden');
      }
      this.lbTimer -= dt;
      if (this.lbTimer <= 0) {
        this.lbTimer = 0.25;
        this.updateLeaderboard();
      }
      this.drawMinimap();
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
  }

  setText(el, key, text) {
    if (this.cache[key] !== text) {
      this.cache[key] = text;
      el.textContent = text;
    }
  }

  updateBars(p) {
    this.setText(this.scoreValue, 'score', Math.floor(p.score).toLocaleString('ru-RU'));
    this.setText(this.namePill, 'name', p.name);
    const lv = p.level >= CONFIG.MAX_LEVEL ? `Lv ${p.level} ${p.cls.name} (MAX)` : `Lv ${p.level} ${p.cls.name}`;
    this.setText(this.levelText, 'lv', lv);
    const w = (p.levelProgress() * 100).toFixed(1) + '%';
    if (this.cache.fill !== w) {
      this.cache.fill = w;
      this.levelFill.style.width = w;
    }
  }

  updateStats(p) {
    const key = p.points + '|' + p.stats.join(',');
    if (key === this.statKey) return;
    this.statKey = key;
    this.statsPoints.classList.toggle('hidden', p.points <= 0);
    this.statsPoints.textContent = `Очки улучшения: x${p.points}`;
    this.statEls.forEach((el, i) => {
      const n = p.stats[i];
      el.pipEls.forEach((pip, k) => pip.classList.toggle('on', k < n));
      el.row.classList.toggle('can', p.points > 0 && n < CONFIG.MAX_STAT_POINTS);
      el.row.classList.toggle('maxed', n >= CONFIG.MAX_STAT_POINTS);
    });
  }

  // Панель эволюции: показываем, когда игрок достиг 15 / 30 / 45 уровня
  updateEvolve(p) {
    const ids = p.canEvolve() ? p.cls.children : [];
    const key = ids.join(',');
    if (key === this.evolveKey) return;
    this.evolveKey = key;
    this.evolve.classList.toggle('hidden', ids.length === 0);
    this.evolveTiles.classList.toggle('cols2', ids.length === 4); // 4 варианта — сетка 2x2
    this.evolveTiles.innerHTML = '';
    ids.forEach((id, i) => {
      if (!this.iconCache[id]) this.iconCache[id] = makeClassIcon(id, 76);
      const tile = document.createElement('button');
      tile.className = 'tile';
      tile.style.setProperty('--c', TILE_COLORS[i % TILE_COLORS.length]);
      tile.innerHTML = `<img src="${this.iconCache[id]}" alt=""><span>${CLASSES[id].name}</span>`;
      tile.addEventListener('click', () => this.game.chooseClass(id));
      this.evolveTiles.appendChild(tile);
    });
  }

  updateLeaderboard() {
    const g = this.game, p = g.player;
    const sorted = g.tanks.slice().sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, 10);
    const maxScore = Math.max(1, top.length ? top[0].score : 1);

    for (let i = 0; i < 10; i++) {
      this.fillLbRow(this.lbRows[i], top[i], i + 1, maxScore, p);
    }
    // Если игрок вне десятки — показываем его место отдельной строкой
    const rank = p && !p.dead ? sorted.indexOf(p) : -1;
    if (rank >= 10) this.fillLbRow(this.lbRows[10], p, rank + 1, maxScore, p);
    else this.fillLbRow(this.lbRows[10], null, 0, maxScore, p);
  }

  fillLbRow(row, t, rank, maxScore, player) {
    if (!t) {
      row.li.style.display = 'none';
      return;
    }
    row.li.style.display = '';
    row.li.classList.toggle('me', t === player);
    // sqrt-шкала: даже если лидер сильно оторвался, у остальных видны полоски
    row.bar.style.width = Math.max(8, Math.sqrt(t.score / maxScore) * 100) + '%';
    row.bar.style.background = t.color;
    row.name.textContent = `${rank}. ${t.name}`;
    row.score.textContent = formatScore(t.score);
  }

  drawMinimap() {
    const g = this.game, ctx = this.mmCtx, s = this.mmSize;
    const k = s / CONFIG.WORLD_SIZE;
    ctx.setTransform(this.mmDpr, 0, 0, this.mmDpr, 0, 0);
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(244,246,248,0.92)';
    ctx.fillRect(0, 0, s, s);

    // «Гнездо» пятиугольников
    ctx.fillStyle = 'rgba(118,141,252,0.18)';
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, CONFIG.NEST_RADIUS * k, 0, TAU);
    ctx.fill();

    // Боты
    for (const t of g.tanks) {
      if (t.isPlayer) continue;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.arc(t.x * k, t.y * k, 3, 0, TAU);
      ctx.fill();
    }

    // Видимая область
    const cam = g.camera;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      (cam.x - cam.w / 2 / cam.scale) * k, (cam.y - cam.h / 2 / cam.scale) * k,
      (cam.w / cam.scale) * k, (cam.h / cam.scale) * k
    );

    // Игрок
    const p = g.player;
    if (p && !p.dead) {
      ctx.fillStyle = p.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x * k, p.y * k, 4.5, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, s, s);
  }
}
