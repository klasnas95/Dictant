// Интерфейс: стартовый и финальный экраны, панель статов, полоса уровня,
// таблица лидеров и выбор эволюции. Весь текст вставляется через textContent.

const el = (id) => document.getElementById(id);

const statRows = [];     // строки панели статов с сегментами
let lbTimer = 0;         // таймер обновления таблицы лидеров (не каждый кадр)
let evoOpen = false;     // открыта ли панель выбора эволюции
let lastName = 'Player'; // последний введённый ник (для кнопки «Играть снова»)

function showEl(id) {
  el(id).classList.remove('hidden');
}

function hideEl(id) {
  el(id).classList.add('hidden');
}

// Создать панель статов; onStat(i) вызывается при клике по строке
function buildStatPanel(onStat) {
  const list = el('stat-list');
  STATS.forEach((name, i) => {
    const row = document.createElement('div');
    row.className = 'stat-row';

    const key = document.createElement('span');
    key.className = 'stat-key';
    key.textContent = i + 1;

    const label = document.createElement('span');
    label.className = 'stat-name';
    label.textContent = name;

    const bar = document.createElement('span');
    bar.className = 'stat-bar';
    const segs = [];
    for (let j = 0; j < STAT_MAX; j++) {
      const seg = document.createElement('span');
      seg.className = 'seg';
      bar.appendChild(seg);
      segs.push(seg);
    }

    row.append(key, label, bar);
    row.addEventListener('click', () => onStat(i));
    list.appendChild(row);
    statRows.push({ row, segs });
  });
}

// Записать текст, только если он изменился: лишние перерисовки DOM не нужны
function setText(id, value) {
  const node = el(id);
  const text = String(value);
  if (node.textContent !== text) node.textContent = text;
}

let lastStatKey = '';

// Панель статов: заполненные сегменты и доступные очки (обновляется только при изменении)
function updateStatPanel(player) {
  const key = `${player.unspent}|${player.points.join(',')}`;
  if (key === lastStatKey) return;
  lastStatKey = key;

  setText('points-left', player.unspent > 0 ? `+${player.unspent}` : '');
  statRows.forEach(({ row, segs }, i) => {
    const pts = player.points[i];
    segs.forEach((seg, j) => seg.classList.toggle('on', j < pts));
    row.classList.toggle('can', player.unspent > 0 && pts < STAT_MAX);
  });
}

// Полоса опыта и уровень внизу экрана
function updateLevelBar(player) {
  const maxed = player.level >= CONFIG.MAX_LEVEL;
  setText('level-text', `Уровень ${player.level} / ${CONFIG.MAX_LEVEL}`);
  const ratio = maxed ? 1 : player.xp / xpToNext(player.level);
  el('xp-fill').style.width = `${clamp(ratio, 0, 1) * 100}%`;
}

// Таблица лидеров: топ-10 по очкам, игрок выделен. Обновляется четыре раза в секунду
function updateLeaderboard(entries, player, dt) {
  lbTimer -= dt;
  if (lbTimer > 0) return;
  lbTimer = 0.25;

  const list = el('lb-list');
  list.textContent = '';
  for (const t of entries.slice(0, 10)) {
    const li = document.createElement('li');
    if (t === player) li.className = 'me';
    const name = document.createElement('span');
    name.textContent = t.name;
    const score = document.createElement('span');
    score.textContent = Math.floor(t.score);
    li.append(name, score);
    list.appendChild(li);
  }
}

// Показ панели эволюции, когда игрок достиг уровня выбора класса
function updateEvolutionPanel(player) {
  const needed = player.pendingEvolution && player.alive;
  if (needed && !evoOpen) showEvolution(player);
  else if (!needed && evoOpen) hideEvolution();
}

function showEvolution(player) {
  const options = player.evolutionOptions();
  if (!options.length) {
    player.pendingEvolution = false;
    return;
  }
  const box = el('evo-options');
  box.textContent = '';
  for (const cls of options) {
    const btn = document.createElement('button');
    btn.className = 'evo-option';

    const title = document.createElement('strong');
    title.textContent = cls.name;
    const desc = document.createElement('span');
    desc.textContent = cls.desc;

    btn.append(title, desc);
    btn.addEventListener('click', () => {
      player.setClass(cls.id);
      hideEvolution();
    });
    box.appendChild(btn);
  }
  showEl('evo-panel');
  evoOpen = true;
}

function hideEvolution() {
  hideEl('evo-panel');
  evoOpen = false;
}

// Индикаторы переключателей E и C
function updateToggles() {
  setText(
    'toggles',
    `[E] Автострельба: ${input.autoFire ? 'вкл' : 'выкл'}   ` +
    `[C] Автоповорот: ${input.autoSpin ? 'вкл' : 'выкл'}`,
  );
}

// Обновление игрового интерфейса (вызывается каждый кадр во время игры)
function updateHud(player, entries, dt, fps) {
  setText('fps', `FPS: ${fps}`);
  updateToggles();
  updateLevelBar(player);
  updateStatPanel(player);
  updateLeaderboard(entries, player, dt);
  updateEvolutionPanel(player);
}

function setHudVisible(visible) {
  el('hud').classList.toggle('hidden', !visible);
}

function showStartScreen() {
  showEl('start-screen');
  setHudVisible(false);
}

function hideStartScreen() {
  hideEl('start-screen');
}

function showDeathScreen(score, level, seconds) {
  hideEvolution();
  setHudVisible(false);
  el('final-score').textContent = Math.floor(score);
  el('final-level').textContent = level;
  el('final-time').textContent = formatTime(seconds);
  showEl('death-screen');
}

function hideDeathScreen() {
  hideEl('death-screen');
}

// Время жизни в формате м:сс
function formatTime(sec) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Кнопки «Играть» и «Играть снова». onPlay(name) запускает новую игру
function bindMenus(onPlay) {
  const nameInput = el('name-input');
  const play = () => {
    lastName = nameInput.value.trim() || lastName;
    onPlay(lastName);
  };
  el('play-btn').addEventListener('click', play);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') play();
  });
  el('restart-btn').addEventListener('click', () => onPlay(lastName));
}
