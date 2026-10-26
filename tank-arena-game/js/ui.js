// ============================================================
// Интерфейс: HUD (таблица лидеров, миникарта, панель улучшений, полоса опыта),
// экраны старта, выбора эволюции и смерти
// ============================================================

// Короткий помощник для создания DOM-элементов
function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// Время в формате м:сс
function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const ui = {
  leaderboard: document.getElementById('lb-list'),
  minimap: document.getElementById('minimap').getContext('2d'),
  points: document.getElementById('points'),
  statsList: document.getElementById('stats-list'),
  xpFill: document.getElementById('xp-fill'),
  xpText: document.getElementById('xp-text'),
  toggleFire: document.getElementById('tg-fire'),
  toggleRotate: document.getElementById('tg-rotate'),
  evoOverlay: document.getElementById('evo-overlay'),
  evoTitle: document.getElementById('evo-title'),
  evoOptions: document.getElementById('evo-options'),
  startOverlay: document.getElementById('start-overlay'),
  nickInput: document.getElementById('nick'),
  startBtn: document.getElementById('start-btn'),
  deathOverlay: document.getElementById('death-overlay'),
  deathStats: document.getElementById('death-stats'),
  restartBtn: document.getElementById('restart-btn'),

  // Обработчики, которые задаёт main.js
  onStart: null,
  onRestart: null,
  onInvest: null,
  onEvolve: null,

  // Последнее отрисованное состояние, чтобы не перерисовывать DOM без нужды
  statsKey: '',
  evoKey: '',

  // Подписки на кнопки и создание строк панели улучшений
  init() {
    const submit = () => ui.onStart && ui.onStart(ui.nickInput.value.trim() || 'Игрок');
    ui.startBtn.addEventListener('click', submit);
    ui.nickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    ui.restartBtn.addEventListener('click', () => ui.onRestart && ui.onRestart());

    STATS.forEach((stat, i) => {
      const pips = makeEl('div', 'pips');
      for (let p = 0; p < CONFIG.MAX_STAT_POINTS; p++) pips.append(makeEl('span', 'pip'));
      const row = makeEl('div', 'stat-row');
      row.append(
        makeEl('span', 'stat-key', String(i + 1)),
        makeEl('span', 'stat-name', stat.name),
        pips,
        makeEl('span', 'stat-plus', '+'),
      );
      row.addEventListener('click', () => ui.onInvest && ui.onInvest(i));
      ui.statsList.append(row);
    });
  },

  // Панель улучшений: уровни статов и количество очков
  updateStats(player) {
    const key = `${player.points}|${player.stats.join(',')}`;
    if (key === ui.statsKey) return;
    ui.statsKey = key;
    ui.points.textContent = player.points;
    [...ui.statsList.children].forEach((row, i) => {
      const level = player.stats[i];
      [...row.querySelector('.pips').children].forEach((pip, p) => {
        pip.classList.toggle('on', p < level);
      });
      row.classList.toggle('can', player.points > 0 && level < CONFIG.MAX_STAT_POINTS);
    });
  },

  // Полоса опыта внизу экрана
  updateXp(player) {
    const max = player.level >= CONFIG.MAX_LEVEL;
    const need = xpForLevel(player.level);
    const pct = max ? 100 : Math.min(100, (player.xp / need) * 100);
    ui.xpFill.style.width = `${pct}%`;
    ui.xpText.textContent = max
      ? `Уровень ${player.level} (максимум)`
      : `Уровень ${player.level}  ·  ${Math.floor(player.xp)} / ${need} опыта`;
  },

  // Подсветка включённых режимов E и C
  updateToggles(inputState) {
    ui.toggleFire.classList.toggle('on', inputState.autoFire);
    ui.toggleRotate.classList.toggle('on', inputState.autoRotate);
  },

  // Таблица лидеров: топ-10 по очкам, игрок выделен
  updateLeaderboard(tanks, me) {
    const top = [...tanks].sort((a, b) => b.score - a.score).slice(0, 10);
    ui.leaderboard.replaceChildren(...top.map((t, i) => {
      const row = makeEl('div', t === me ? 'lb-row me' : 'lb-row');
      row.append(
        makeEl('span', 'lb-name', `${i + 1}. ${t.name}`),
        makeEl('span', '', String(Math.floor(t.score))),
      );
      return row;
    }));
  },

  // Миникарта: точки танков на всей арене
  drawMinimap(tanks, me) {
    const c = ui.minimap;
    const S = 160;
    const k = S / CONFIG.WORLD_SIZE;
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#f8fafd';
    c.fillRect(0, 0, S, S);
    for (const t of tanks) {
      if (!t.alive) continue;
      const isMe = t === me;
      c.beginPath();
      c.arc(t.x * k, t.y * k, isMe ? 4.5 : 3, 0, Math.PI * 2);
      c.fillStyle = t.color;
      c.fill();
      if (isMe) {
        c.lineWidth = 2;
        c.strokeStyle = '#2b2d42';
        c.stroke();
      }
    }
  },

  // Панель выбора эволюции (появляется на 15, 30 и 45 уровнях)
  updateEvolution(player) {
    const options = player ? player.evolutionOptions() : [];
    const key = player && options.length ? `${player.cls}|${player.pendingEvolutions}` : '';
    if (key !== ui.evoKey) {
      ui.evoKey = key;
      ui.evoOptions.replaceChildren(...options.map((id) => {
        const cls = CLASSES[id];
        const btn = makeEl('button', 'evo-card');
        btn.append(makeEl('b', '', cls.name), makeEl('small', '', cls.desc));
        btn.addEventListener('click', () => ui.onEvolve && ui.onEvolve(id));
        return btn;
      }));
      if (player) ui.evoTitle.textContent = `Уровень ${player.level}: выберите класс`;
    }
    ui.evoOverlay.classList.toggle('hidden', options.length === 0);
  },

  showStart() {
    ui.startOverlay.classList.remove('hidden');
    ui.nickInput.focus();
  },

  hideStart() {
    ui.startOverlay.classList.add('hidden');
  },

  // Экран смерти: счёт, уровень, время жизни и число уничтоженных танков
  showDeath(player) {
    const rows = [
      ['Счёт', Math.floor(player.score)],
      ['Уровень', player.level],
      ['Время жизни', formatTime(player.age)],
      ['Уничтожено танков', player.kills],
    ];
    ui.deathStats.replaceChildren(...rows.map(([label, value]) => {
      const row = makeEl('div', 'death-row');
      row.append(makeEl('span', '', label), makeEl('b', '', String(value)));
      return row;
    }));
    ui.deathOverlay.classList.remove('hidden');
  },

  hideDeath() {
    ui.deathOverlay.classList.add('hidden');
  },

  // Показывает или скрывает весь HUD
  setHudVisible(visible) {
    document.getElementById('hud').classList.toggle('hidden', !visible);
  },
};
