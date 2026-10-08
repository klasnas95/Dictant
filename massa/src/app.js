(function () {
'use strict';
var D = document, H = D.documentElement;
try { main(); } catch (err) {
  H.classList.remove('js'); H.classList.add('nojs');
  try { console.error('МАССА: ошибка запуска', err); } catch (e) {}
}
function main() {
H.classList.remove('nojs'); H.classList.add('js');
function $(s, r) { return (r || D).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || D).querySelectorAll(s)); }

var APP = JSON.parse($('#app-data').textContent);
var EXD = APP.ex, DAYS = APP.days, GYM = ['d1', 'd2', 'd3'];

/* ═════════ утилиты ═════════ */
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function dkey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function pkey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
var MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
var MONF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
var WDS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
var WDF = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
function fdate(ts) { var d = new Date(ts); return d.getDate() + ' ' + MON[d.getMonth()]; }
function fnum(x) { if (x == null || isNaN(x)) return ''; return String(Math.round(x * 100) / 100).replace('.', ','); }
function pnum(s) { if (s == null) return NaN; s = String(s).replace(',', '.').replace(/[^\d.]/g, ''); return s === '' ? NaN : parseFloat(s); }
function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return b; return c; }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function dayDiff(a, b) { return Math.round((pkey(dkey(new Date(b))) - pkey(dkey(new Date(a)))) / 864e5); }
function fdur(ms) { var m = Math.max(1, Math.round(ms / 60000)); if (m < 60) return m + ' мин'; return Math.floor(m / 60) + ' ч ' + pad2(m % 60) + ' мин'; }
function fclock(sec) { sec = Math.max(0, Math.round(sec)); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ':' + pad2(m) : m) + ':' + pad2(s); }
function roundTo(x, st) { return Math.round(x / st) * st; }
function e1rm(w, r) { return w && r ? w * (1 + r / 30) : 0; }
function fbig(n) { n = Math.round(n); return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'); }
function mondayOf(d) { d = new Date(d.getFullYear(), d.getMonth(), d.getDate()); var wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return d; }

/* ═════════ хранилище ═════════ */
var KEY = 'massa188.v2', LS = null;
try { localStorage.setItem('__m', '1'); localStorage.removeItem('__m'); LS = localStorage; } catch (e) { LS = null; }
function blank() {
  return { v: 2, created: Date.now(), profile: { age: 20, h: 188, w: 80, act: 1.55, pace: 0.12 },
    set: { sound: true, autoRest: true, wake: true, haptic: true }, start: null,
    sessions: [], cur: {}, swap: {}, bw: [], meas: [], food: {}, ui: {} };
}
function merge(a, b) {
  for (var k in b) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) continue;
    var bv = b[k], av = a[k];
    if (bv && typeof bv === 'object' && !Array.isArray(bv) && av && typeof av === 'object' && !Array.isArray(av)) a[k] = merge(av, bv);
    else a[k] = bv;
  }
  return a;
}
var db = blank();
if (LS) { try { var raw = LS.getItem(KEY); if (raw) db = merge(blank(), JSON.parse(raw)); } catch (e) {} }
var saveT = null, saveFail = false;
function save(now) {
  if (!LS) return;
  clearTimeout(saveT);
  var f = function () {
    try { LS.setItem(KEY, JSON.stringify(db)); saveFail = false; }
    catch (e) { if (!saveFail) toast('⚠️ Не удалось сохранить данные'); saveFail = true; }
  };
  if (now) f(); else saveT = setTimeout(f, 180);
}
window.addEventListener('pagehide', function () { save(true); });
try { if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(function (p) { if (!p && navigator.storage.persist) navigator.storage.persist(); }); } catch (e) {}

/* ═════════ отклик: тост, звук, хаптика ═════════ */
var toastEl = $('#toast'), toastT = null;
function toast(msg, ms) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 2600);
}
function haptic() {
  if (!db.set.haptic) return;
  try {
    if (navigator.vibrate) { navigator.vibrate(12); return; }
    var l = D.createElement('label'), i = D.createElement('input');
    l.setAttribute('aria-hidden', 'true'); l.style.display = 'none';
    i.type = 'checkbox'; i.setAttribute('switch', ''); l.appendChild(i);
    D.head.appendChild(l); l.click(); D.head.removeChild(l);
  } catch (e) {}
}
var AC = null;
function audioInit() {
  try { if (navigator.audioSession && navigator.audioSession.type !== 'ambient') navigator.audioSession.type = 'ambient'; } catch (e) {}
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) {}
}
function beep(n) {
  if (!db.set.sound) return;
  try {
    audioInit(); n = n || 3;
    var t0 = AC.currentTime + 0.03;
    for (var k = 0; k < n; k++) {
      var o = AC.createOscillator(), g = AC.createGain(), t = t0 + k * 0.24;
      o.type = 'sine'; o.frequency.setValueAtTime(k === n - 1 ? 1175 : 880, t);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.38, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + 0.22);
    }
  } catch (e) {}
}

/* ═════════ экран не гаснет ═════════ */
var WL = null;
function wakeOn() {
  if (!db.set.wake || WL || !('wakeLock' in navigator)) return;
  navigator.wakeLock.request('screen').then(function (l) {
    WL = l; l.addEventListener('release', function () { WL = null; updWake(); }); updWake();
  }).catch(function () {});
}
function wakeOff() { if (WL) { try { WL.release(); } catch (e) {} } WL = null; updWake(); }
function updWake() {
  $$('[data-s-wake]').forEach(function (el) {
    el.textContent = WL ? '🔆 Экран не погаснет, пока идёт тренировка' : '';
    el.classList.toggle('on', !!WL);
  });
}

/* ═════════ навигация ═════════ */
function curScr() { var r = $('input[name=scr]:checked'); return r ? r.id.slice(2) : 'today'; }
function go(s, top) {
  var r = $('#s-' + s); if (!r) return;
  r.checked = true; onScreen(s);
  if (top) { var sc = $('.scr-' + s); if (sc) sc.scrollTop = 0; }
}
var rendered = {};
function onScreen(s) {
  db.ui.scr = s; db.ui.scrAt = Date.now();
  if (DAYS[s]) { db.ui.lastDay = s; $('.t-train').setAttribute('for', 's-' + s); }
  save();
  if (s === 'today') renderToday();
  if (s === 'prog') renderProgress();
  if (s === 'food') renderFood();
  if (DAYS[s]) refreshDay(s);
  if (s === 'lib') markLib();
}
D.addEventListener('change', function (e) {
  var t = e.target;
  if (t.name === 'scr') { onScreen(t.id.slice(2)); return; }
  if (t.classList.contains('sck')) { onSetCheck(t); return; }
  if (t.name === 'lg') { var sc = $('.scr-lib'), anchor = $('#libTop'); if (sc && anchor) sc.scrollTop = Math.max(0, anchor.offsetTop - 8); return; }
  if (t.hasAttribute('data-set')) { db.set[t.getAttribute('data-set')] = t.checked; save(); if (t.getAttribute('data-set') === 'wake') { if (t.checked && anyLive()) wakeOn(); else if (!t.checked) wakeOff(); } return; }
  if (t.hasAttribute('data-food')) { var fk = dkey(); db.food[fk] = db.food[fk] || {}; db.food[fk][t.getAttribute('data-food')] = t.checked ? 1 : 0; save(); renderFoodDots(); if (t.checked) haptic(); return; }
  if (t.hasAttribute('data-prof')) { onProfile(); return; }
  if (t.id === 'strSel') { db.ui.strEx = t.value; save(); renderStrength(); return; }
  if (t.id === 'impFile') { readImport(t); return; }
});
D.addEventListener('input', function (e) {
  var t = e.target;
  if (t.classList.contains('w') || t.classList.contains('r')) t.setAttribute('data-typed', '1');
  if (t.hasAttribute('data-prof')) onProfile();
});
D.addEventListener('submit', function (e) { e.preventDefault(); });
// повторный тап по активной вкладке — наверх
$$('.tabbar label').forEach(function (l) {
  l.addEventListener('click', function () {
    var target = l.getAttribute('for').slice(2);
    if (target === curScr()) { var sc = $('.scr-' + target); if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
});

/* ═════════ программа и сессии ═════════ */
function slotEx(day, i) { return db.swap[day + '-' + i] || DAYS[day].ex[i].id; }
function cfgFor(day, i) {
  var p = DAYS[day].ex[i], id = slotEx(day, i), e = EXD[id], sw = id !== p.id;
  var bw = e.kind === 'bw' || e.kind === 'time';
  var lo = p.lo, hi = p.hi, unit = p.unit;
  if (sw && e.lo != null) { lo = e.lo; hi = e.hi; unit = e.unit; }
  if (sw && e.kind === 'time' && e.lo == null) { lo = 30; hi = 60; unit = 'sec'; }
  return { day: day, i: i, id: id, e: e, s: p.s, lo: lo, hi: hi, unit: unit, side: !!e.side,
    bw: bw, w0: sw ? null : p.w0, pair: !!e.pair,
    rest: p.rest, inc: e.inc || 2.5, kind: e.kind, swapped: sw };
}
function hasSets(c) {
  if (!c || !c.ex) return false;
  for (var k in c.ex) { var s = c.ex[k] && c.ex[k].sets; if (s && s.some(Boolean)) return true; }
  return false;
}
function anyLive() { return Object.keys(db.cur).some(function (k) { return hasSets(db.cur[k]); }); }
function ensureSess(day) {
  var c = db.cur[day], now = Date.now();
  if (c && now - (c.last || c.start) > 6 * 3600e3) { finalize(day, true); c = null; }
  if (!c) { c = db.cur[day] = { id: 's' + now, day: day, start: now, last: now, ex: {} }; if (!db.start) db.start = dkey(); }
  return c;
}
function finalize(day, auto) {
  var c = db.cur[day]; if (!c) return null;
  var exs = [];
  Object.keys(c.ex).sort(function (a, b) { return a - b; }).forEach(function (i) {
    var e = c.ex[i]; if (!e || !e.sets) return;
    var sets = e.sets.filter(function (s) { return s && s.r > 0; });
    if (sets.length) exs.push({ id: e.id, slot: +i, sets: sets.map(function (s) { var o = { w: s.w, r: s.r }; if (s.pr) o.pr = 1; return o; }) });
  });
  delete db.cur[day];
  if (!exs.length) { save(); return null; }
  var s = { id: c.id, day: day, start: c.start, end: auto ? (c.last || c.start) + 120000 : Date.now(), ex: exs };
  db.sessions.push(s);
  db.sessions.sort(function (a, b) { return a.start - b.start; });
  save(true);
  return s;
}
// незавершённые тренировки старше 6 часов закрываем сами
Object.keys(db.cur).forEach(function (d) {
  var c = db.cur[d];
  if (!c || !DAYS[d]) { delete db.cur[d]; return; }
  if (Date.now() - (c.last || c.start) > 6 * 3600e3) finalize(d, true);
});
function histFor(id, skipId) {
  var out = [];
  for (var k = db.sessions.length - 1; k >= 0; k--) {
    var s = db.sessions[k]; if (s.id === skipId) continue;
    for (var j = 0; j < s.ex.length; j++) if (s.ex[j].id === id) { out.push({ ts: s.start, sets: s.ex[j].sets, day: s.day }); break; }
  }
  return out;
}
function bestOf(id) {
  var b = 0;
  db.sessions.forEach(function (s) { s.ex.forEach(function (e) { if (e.id === id) e.sets.forEach(function (st) { var v = st.w ? e1rm(st.w, st.r) : st.r; if (v > b) b = v; }); }); });
  return b;
}
function volOf(id, w, r) { var e = EXD[id]; if (!w || !e) return 0; return w * r * (e.pair ? 2 : 1) * (e.side ? 2 : 1); }
function sessVolume(s) { var v = 0; s.ex.forEach(function (e) { e.sets.forEach(function (st) { v += volOf(e.id, st.w, st.r); }); }); return v; }
function sessSets(s) { var n = 0; s.ex.forEach(function (e) { n += e.sets.length; }); return n; }

/* ═════════ подсказка веса (двойная прогрессия) ═════════ */
function suggest(c) {
  var h = histFor(c.id), res = { w: null, reps: [], msg: '', cls: '', last: null }, j;
  if (!h.length) {
    res.w = c.bw ? null : c.w0;
    for (j = 0; j < c.s; j++) res.reps.push(c.hi || '');
    if (c.unit === 'sec') res.msg = 'Первый раз: держи <b>' + c.lo + ' сек</b> с идеальной техникой. Легко — добавь время в следующем подходе.';
    else if (c.bw) res.msg = c.lo ? 'Первый раз: цель — <b>' + c.lo + '–' + c.hi + '</b> повторов с чистой техникой.' : 'Первый раз: сделай максимум с чистой техникой и оставь 1–2 повтора в запасе.';
    else if (c.w0 != null) res.msg = 'Первая тренировка: начни с <b>' + fnum(c.w0) + ' кг</b>' + (c.pair ? ' (каждая гантель)' : '') + ' и проверь технику. Легко — добавь вес в следующем подходе.';
    else res.msg = 'Подбери вес, с которым последние 2 повтора даются тяжело, но техника не ломается.';
    return res;
  }
  var last = h[0], sets = last.sets; res.last = last;
  for (j = 0; j < c.s; j++) res.reps.push(sets[j] ? sets[j].r : (c.hi || ''));
  var topW = 0; sets.forEach(function (s) { if ((s.w || 0) > topW) topW = s.w || 0; });
  var top = sets.filter(function (s) { return (s.w || 0) === topW; });
  var allHit = c.hi != null && top.length >= c.s && top.slice(0, c.s).every(function (s) { return s.r >= c.hi; });
  if (c.unit === 'sec') {
    var best = Math.max.apply(null, sets.map(function (s) { return s.r; }));
    if (allHit) { res.msg = '🔥 Все подходы по ' + c.hi + '+ сек. Держи на 10 сек дольше или переходи на вариант сложнее.'; res.cls = 'up'; res.reps = res.reps.map(function () { return best + 10; }); }
    else res.msg = 'Цель — <b>' + c.hi + ' сек</b> во всех подходах. Твой лучший результат: <b>' + best + ' сек</b>.';
    return res;
  }
  if (c.bw) {
    if (allHit) {
      var hx = c.e.harder && EXD[c.e.harder];
      res.msg = '🔥 В прошлый раз все подходы на ' + c.hi + '+. ' + (hx ? 'Пора усложнять: попробуй <b>' + esc(hx.n) + '</b>.' : 'Добавь 2–3 повтора или опускайся медленнее — за 3 секунды.');
      res.cls = 'up';
    } else if (c.hi) res.msg = 'Цель — <b>' + c.hi + '</b> повторов во всех подходах. Добьёшь — пора усложнять.';
    else {
      var tot = sets.reduce(function (a, s) { return a + s.r; }, 0);
      res.msg = 'В прошлый раз: <b>' + tot + '</b> ' + plural(tot, 'повтор', 'повтора', 'повторов') + ' за ' + sets.length + ' ' + plural(sets.length, 'подход', 'подхода', 'подходов') + '. Побей это число хотя бы на один.';
    }
    return res;
  }
  var stall = false;
  if (h.length >= 3 && !allHit) {
    var tw = function (x) { return Math.max.apply(null, x.sets.map(function (s) { return s.w || 0; })); };
    var tr = function (x) { return x.sets.reduce(function (a, s) { return a + s.r; }, 0); };
    if (tw(h[0]) === tw(h[1]) && tw(h[1]) === tw(h[2]) && tr(h[0]) <= tr(h[2])) stall = true;
  }
  if (allHit) {
    res.w = Math.round((topW + c.inc) * 100) / 100;
    res.msg = '🔥 В прошлый раз все подходы на ' + c.hi + '+. Сегодня <b>+' + fnum(c.inc) + ' кг → ' + fnum(res.w) + ' кг</b>' + (c.pair ? ' (каждая гантель)' : '') + '. Повторов станет меньше — это нормально.';
    res.cls = 'up'; res.reps = res.reps.map(function () { return c.lo || ''; });
  } else if (stall) {
    res.w = Math.max(c.inc, roundTo(topW * 0.9, c.inc >= 2.5 ? 2.5 : 1));
    res.msg = 'Три тренировки без роста — так бывает у всех. Сбрось до <b>' + fnum(res.w) + ' кг</b> и набери снова: через 2–3 недели пройдёшь застой.';
    res.cls = 'warn';
  } else {
    res.w = topW;
    res.msg = 'Держи <b>' + fnum(topW) + ' кг</b>' + (c.pair ? ' (каждая гантель)' : '') + ' и добавляй повторы: цель — <b>' + c.hi + '</b> во всех ' + c.s + ' подходах.';
  }
  return res;
}
function lastLine(c, last) {
  return '<span class="last">Прошлый раз · ' + fdate(last.ts) + ': ' + last.sets.map(function (x) {
    return (x.w ? fnum(x.w) + '×' : '') + x.r + (c.unit === 'sec' ? 'с' : '');
  }).join(' · ') + '</span>';
}
function warmupFor(W) {
  var out = [{ w: 20, r: '10–15' }];
  [[0.5, 8], [0.7, 5], [0.85, 2]].forEach(function (p) {
    var w = roundTo(W * p[0], 2.5);
    if (w > out[out.length - 1].w && w < W) out.push({ w: w, r: p[1] });
  });
  return out;
}

/* ═════════ карточка упражнения ═════════ */
function rowHTML(day, i, j, c) {
  var id = 'ck-' + day + '-' + i + '-' + j, n = j + 1;
  var rl = c.unit === 'sec' ? 'сек' : 'раз';
  var h = '<div class="set' + (c.bw ? ' bw' : '') + '" data-j="' + j + '"><span class="sn">' + n + '</span>';
  if (!c.bw) h += '<label class="fld"><input class="w" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="next" aria-label="Вес, подход ' + n + '"><em>кг</em></label><span class="x">×</span>';
  h += '<label class="fld"><input class="r" type="text" inputmode="numeric" autocomplete="off" enterkeyhint="done" aria-label="Повторы, подход ' + n + '"><em>' + rl + '</em></label>';
  h += '<input type="checkbox" class="sck" id="' + id + '" switch><label for="' + id + '" class="sbtn" aria-label="Подход ' + n + ' выполнен"></label></div>';
  return h;
}
function framesHTML(id) {
  var e = EXD[id]; return e.img.map(function (cls, k) { return '<div class="fr f' + k + ' ' + cls + '"></div>'; }).join('');
}
function applyContent(card, c) {
  if (card.getAttribute('data-ex') === c.id && card._rendered) return;
  card._rendered = true;
  var e = c.e, p = DAYS[c.day].ex[c.i];
  card.setAttribute('data-ex', c.id);
  var m = $('[data-media]', card); $$('.fr', m).forEach(function (f) { f.remove(); }); m.insertAdjacentHTML('afterbegin', framesHTML(c.id));
  $('[data-name]', card).textContent = e.n;
  $('[data-en]', card).textContent = e.en + ' · ' + e.t;
  $('[data-tgt]', card).textContent = e.t;
  $('[data-yt]', card).href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(e.v);
  $('[data-tip]', card).innerHTML = esc(e.tip);
  var err = $('[data-err]', card); err.style.display = e.err ? '' : 'none'; if (e.err) err.innerHTML = '<b>Ошибка новичка:</b> ' + esc(e.err);
  var st = $('[data-steps]', card), stw = st && st.closest('details');
  if (st) { st.innerHTML = e.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join(''); stw.style.display = e.steps.length ? '' : 'none'; }
  var swb = $('[data-swapped]', card);
  if (c.swapped) { swb.innerHTML = '<span>🔁 Замена для: <b>' + esc(EXD[p.id].n) + '</b></span><button type="button" data-act="unswap">Вернуть</button>'; swb.classList.add('show'); }
  else { swb.innerHTML = ''; swb.classList.remove('show'); }
  // подписи в сетке
  var cells = $$('.cell b', card);
  if (cells[1]) cells[1].textContent = c.swapped && e.lo != null ? (c.unit === 'sec' ? c.lo + '–' + c.hi + ' сек' : c.lo + '–' + c.hi) : p.r;
  if (cells[2]) cells[2].textContent = c.swapped ? (c.bw ? 'свой вес' : 'подбери') : p.w;
  $$('.alt', card).forEach(function (a) { a.style.display = a.getAttribute('data-alt') === c.id ? 'none' : ''; });
  var wu = $('[data-warmwrap]', card); if (wu) wu.style.display = c.swapped ? 'none' : '';
}
function refreshCard(day, i) {
  var card = $('#x-' + day + '-' + i); if (!card) return;
  var c = cfgFor(day, i), sug = suggest(c), sess = db.cur[day], ce = sess && sess.ex[i];
  if (ce && ce.id !== c.id) ce = null;
  applyContent(card, c);
  var hint = $('[data-hint]', card);
  hint.innerHTML = (sug.last ? lastLine(c, sug.last) : '') + sug.msg;
  hint.className = 'hint show ' + (sug.cls || '');
  // строки подходов
  var box = $('[data-rows]', card);
  var logged = ce && ce.sets ? ce.sets.length : 0;
  var need = Math.max(c.s + (card._extra || 0), logged);
  var rows = $$('.set', box);
  var typeOK = rows.length && rows.every(function (r) { return r.classList.contains('bw') === c.bw; }) &&
    rows.every(function (r) { var em = $$('.fld em', r); return em[em.length - 1].textContent === (c.unit === 'sec' ? 'сек' : 'раз'); });
  if (!typeOK || rows.length !== need) {
    var html = ''; for (var j = 0; j < need; j++) html += rowHTML(day, i, j, c);
    box.innerHTML = html; rows = $$('.set', box);
  }
  var hd = $('.sets-h', card);
  if (hd) { hd.classList.toggle('bw', c.bw); hd.innerHTML = c.bw ? '<span>#</span><span>' + (c.unit === 'sec' ? 'Время' : 'Повторы') + '</span><span>✓</span>' : '<span>#</span><span>Вес</span><span></span><span>' + (c.unit === 'sec' ? 'Время' : 'Повторы') + '</span><span>✓</span>'; }
  rows.forEach(function (row, j) {
    var st = ce && ce.sets && ce.sets[j], wi = $('.w', row), ri = $('.r', row), ck = $('.sck', row);
    if (wi) {
      var pw = sug.w != null ? sug.w : c.w0;
      wi.placeholder = pw != null ? fnum(pw) : '—';
      if (st) { wi.value = st.w != null ? fnum(st.w) : ''; wi.removeAttribute('data-typed'); }
      else if (!wi.hasAttribute('data-typed')) wi.value = '';
    }
    var pr = sug.reps[j] != null && sug.reps[j] !== '' ? sug.reps[j] : (c.hi || '');
    ri.placeholder = pr !== '' ? pr : '—';
    if (st) { ri.value = st.r; ri.removeAttribute('data-typed'); }
    else if (!ri.hasAttribute('data-typed')) ri.value = '';
    ck.checked = !!st;
    row.classList.toggle('pr', !!(st && st.pr));
  });
  var doneN = ce && ce.sets ? ce.sets.filter(Boolean).length : 0;
  card.classList.toggle('done', doneN >= c.s);
  // разминка
  var wu = $('[data-warm]', card);
  if (wu && !c.swapped) {
    var W = sug.w != null ? sug.w : c.w0;
    if (W) wu.innerHTML = 'Перед рабочими подходами: ' + warmupFor(W).map(function (x) { return '<b>' + fnum(x.w) + ' кг × ' + x.r + '</b>'; }).join(' → ') + ', отдых между ними 1 мин. Затем рабочий вес <b>' + fnum(W) + ' кг</b>.';
  }
  var minus = $('[data-act=delset]', card); if (minus) minus.style.display = (card._extra || 0) > 0 ? '' : 'none';
}
function nextName(day, i) {
  var n = DAYS[day].ex.length;
  for (var k = i + 1; k < n; k++) { var c = cfgFor(day, k), ce = db.cur[day] && db.cur[day].ex[k]; if (!ce || !ce.sets || ce.sets.filter(Boolean).length < c.s) return c.e.n; }
  return 'финиш!';
}
function onSetCheck(ck) {
  var row = ck.closest('.set'), card = ck.closest('.ex');
  if (!row || !card) return;
  var day = card.getAttribute('data-day'), i = +card.getAttribute('data-i'), j = +row.getAttribute('data-j');
  var c = cfgFor(day, i);
  if (ck.checked) {
    var wi = $('.w', row), ri = $('.r', row);
    var w = c.bw ? null : pnum(wi.value !== '' ? wi.value : wi.placeholder);
    var r = pnum(ri.value !== '' ? ri.value : ri.placeholder);
    if (!c.bw && (isNaN(w) || w < 0)) { ck.checked = false; toast('Впиши вес для этого подхода'); wi.focus(); return; }
    if (isNaN(r) || r <= 0) { ck.checked = false; toast(c.unit === 'sec' ? 'Впиши, сколько секунд продержался' : 'Впиши, сколько повторов сделал'); ri.focus(); return; }
    r = Math.round(r);
    var s = ensureSess(day), ce = s.ex[i];
    if (!ce || ce.id !== c.id) ce = s.ex[i] = { id: c.id, sets: [] };
    var prev = bestOf(c.id), val = c.bw ? r : e1rm(w, r);
    var already = ce.sets.some(function (x) { return x && x.pr; });
    var isPR = prev > 0 && val > prev + 1e-9 && !already;
    ce.sets[j] = { w: c.bw ? null : w, r: r, t: Date.now() };
    if (isPR) ce.sets[j].pr = 1;
    s.last = Date.now();
    if (isPR) toast('🏆 Новый рекорд: ' + (c.bw ? r + (c.unit === 'sec' ? ' сек' : ' повт.') : fnum(w) + ' кг × ' + r));
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
    wakeOn();
    if (db.set.autoRest) {
      var doneN = ce.sets.filter(Boolean).length;
      startRest(c.rest, doneN >= c.s ? 'далее: ' + nextName(day, i) : 'подход ' + (doneN + 1) + ' из ' + c.s);
    }
  } else {
    var s2 = db.cur[day];
    if (s2 && s2.ex[i] && s2.ex[i].sets) s2.ex[i].sets[j] = null;
    if (s2 && !hasSets(s2)) delete db.cur[day];
  }
  save(); refreshCard(day, i); refreshSess(day);
}

/* ═════════ день тренировки ═════════ */
function refreshDay(day) {
  DAYS[day].ex.forEach(function (_, i) { refreshCard(day, i); });
  refreshSess(day); refreshSeg();
}
function refreshSess(day) {
  var scr = $('.scr-' + day); if (!scr) return;
  var c = db.cur[day], live = hasSets(c), tot = 0, done = 0;
  DAYS[day].ex.forEach(function (_, i) {
    var cfg = cfgFor(day, i), ce = c && c.ex[i]; tot += cfg.s;
    if (ce && ce.id === cfg.id && ce.sets) done += Math.min(cfg.s, ce.sets.filter(Boolean).length);
  });
  var box = $('[data-sess]', scr); box.classList.toggle('live', live);
  $('[data-s-bar]', scr).style.width = (tot ? done / tot * 100 : 0) + '%';
  var last = null; for (var k = db.sessions.length - 1; k >= 0; k--) if (db.sessions[k].day === day) { last = db.sessions[k]; break; }
  var title = $('[data-s-title]', scr), sub = $('[data-s-sub]', scr);
  if (live) { title.textContent = 'Идёт тренировка · ' + fclock((Date.now() - c.start) / 1000); sub.textContent = 'Подходов: ' + done + ' из ' + tot; }
  else {
    title.textContent = done ? 'Подходов: ' + done + ' из ' + tot : 'Готов? Поехали';
    sub.textContent = last ? 'Последний раз: ' + fdate(last.start) + ' (' + agoText(last.start) + ')' : 'Отметь первый подход — секундомер тренировки запустится сам';
  }
  var fin = $('[data-act=finish]', scr); if (fin) fin.disabled = !live;
  var fc = $('[data-fin-cnt]', scr); if (fc) fc.innerHTML = 'Сделано подходов: <b>' + done + '</b> из ' + tot;
  updWake();
}
function agoText(ts) {
  var d = dayDiff(ts, Date.now());
  if (d <= 0) return 'сегодня'; if (d === 1) return 'вчера';
  return d + ' ' + plural(d, 'день', 'дня', 'дней') + ' назад';
}
function refreshSeg() {
  $$('.seg label').forEach(function (l) {
    var d = l.getAttribute('for').slice(2);
    l.classList.toggle('done', db.sessions.some(function (s) { return s.day === d && dayDiff(s.start, Date.now()) < 7 && mondayOf(new Date(s.start)).getTime() === mondayOf(new Date()).getTime(); }));
  });
}
function finishDay(day) {
  var c = db.cur[day];
  if (!hasSets(c)) { toast('Сначала отметь хотя бы один подход'); return; }
  var s = finalize(day, false);
  $$('.scr-' + day + ' input[data-typed]').forEach(function (x) { x.removeAttribute('data-typed'); x.value = ''; });
  $$('.scr-' + day + ' .ex').forEach(function (card) { card._extra = 0; });
  stopRest(); if (!anyLive()) wakeOff();
  refreshDay(day);
  if (s) showSummary(s);
  haptic();
}
function resetDay(day) {
  if (!confirm('Сбросить все отметки этой тренировки? Сохранённые тренировки в истории не пострадают.')) return;
  delete db.cur[day]; save();
  $$('.scr-' + day + ' input[data-typed]').forEach(function (x) { x.removeAttribute('data-typed'); x.value = ''; });
  $$('.scr-' + day + ' .ex').forEach(function (card) { card._extra = 0; });
  if (!anyLive()) wakeOff();
  refreshDay(day);
}
function showSummary(s) {
  var dur = s.end - s.start, vol = sessVolume(s), n = sessSets(s), prs = [];
  s.ex.forEach(function (e) { e.sets.forEach(function (st) { if (st.pr) prs.push(EXD[e.id].n + ': ' + (st.w ? fnum(st.w) + ' кг × ' + st.r : st.r)); }); });
  var nx = s.day === 'home' ? null : GYM[(GYM.indexOf(s.day) + 1) % 3];
  var h = '<h3>Тренировка сохранена 💪</h3><p class="sub">' + esc(DAYS[s.day].title) + ' · ' + fdate(s.start) + '</p>';
  h += '<div class="sum"><div><span>Время</span><b>' + fdur(dur) + '</b></div><div><span>Подходов</span><b>' + n + '</b></div>';
  h += '<div><span>Тоннаж</span><b>' + (vol ? fbig(vol) + ' кг' : '—') + '</b></div><div><span>Рекорды</span><b>' + prs.length + '</b></div></div>';
  if (prs.length) h += '<div class="infobox" style="margin-bottom:12px"><b>🏆 Новые рекорды</b><br>' + prs.map(esc).join('<br>') + '</div>';
  h += '<p class="small muted" style="margin-bottom:14px">' + (nx ? 'Следующая в зале: <b style="color:#fff">' + esc(DAYS[nx].title) + '</b>. Отдых минимум день — мышцы растут именно сейчас. ' : 'Отлично! Завтра — отдых или зал по расписанию. ') + 'Поешь белка в ближайшие пару часов.</p>';
  h += '<button class="btn wide" data-act="close">Готово</button>';
  openSheet(h);
}

/* ═════════ таймер отдыха ═════════ */
var dock = $('#dock'), tDisp = $('#tDisp'), tLbl = $('#tLbl'), tBar = $('#tBar');
var T = { end: 0, total: 0, label: '', iv: null, goT: null };
function startRest(sec, label) {
  audioInit(); clearTimeout(T.goT); dock.classList.remove('go');
  T.total = sec; T.end = Date.now() + sec * 1000; T.label = label || 'отдых';
  db.ui.rest = { end: T.end, total: sec, label: T.label }; save();
  dock.classList.add('run'); H.classList.add('trun'); tick();
  clearInterval(T.iv); T.iv = setInterval(tick, 250);
}
function tick() {
  if (!T.end) return;
  var left = (T.end - Date.now()) / 1000;
  if (left <= 0) { restDone(); return; }
  tDisp.textContent = fclock(Math.ceil(left));
  tLbl.textContent = T.label;
  tBar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, left / T.total)) + ')';
}
function restDone() {
  clearInterval(T.iv); T.iv = null;
  var late = Date.now() - T.end > 5000;
  T.end = 0; db.ui.rest = null; save();
  tDisp.textContent = 'ГО!'; tLbl.textContent = late ? 'отдых закончился' : 'следующий подход';
  tBar.style.transform = 'scaleX(0)';
  dock.classList.remove('run'); dock.classList.add('go');
  if (!late) { beep(3); try { if (navigator.vibrate) navigator.vibrate([90, 60, 90, 60, 160]); } catch (e) {} }
  T.goT = setTimeout(restIdle, 7000);
}
function restIdle() { dock.classList.remove('go'); if (!T.end) H.classList.remove('trun'); if (!T.end) { tDisp.textContent = '0:00'; tLbl.textContent = 'отдых'; tBar.style.transform = 'scaleX(0)'; } }
function stopRest() {
  clearInterval(T.iv); T.iv = null; T.end = 0; db.ui.rest = null; save();
  clearTimeout(T.goT); dock.classList.remove('run', 'go'); restIdle();
}
function adjRest(d) { if (!T.end) return; T.end += d * 1000; T.total = Math.max(1, T.total + d); if (T.end <= Date.now()) T.end = Date.now() + 1000; db.ui.rest = { end: T.end, total: T.total, label: T.label }; save(); tick(); }
$$('.dock .tb').forEach(function (b) {
  b.addEventListener('click', function (e) {
    e.preventDefault();
    if (b.hasAttribute('data-s')) { startRest(+b.getAttribute('data-s'), 'отдых'); haptic(); }
    else if (b.hasAttribute('data-adj')) { adjRest(+b.getAttribute('data-adj')); haptic(); }
    else stopRest();
  });
});
D.addEventListener('visibilitychange', function () {
  if (D.hidden) { save(true); return; }
  tick();
  if (anyLive()) wakeOn();
  var s = curScr(); if (DAYS[s]) refreshSess(s);
});
setInterval(function () { var s = curScr(); if (DAYS[s] && hasSets(db.cur[s])) refreshSess(s); }, 1000);
if (db.ui.rest && db.ui.rest.end > Date.now()) { T.end = db.ui.rest.end; T.total = db.ui.rest.total; T.label = db.ui.rest.label; dock.classList.add('run'); H.classList.add('trun'); tick(); T.iv = setInterval(tick, 250); }
else db.ui.rest = null;

/* ═════════ клики по действиям ═════════ */
D.addEventListener('click', function (e) {
  var a = e.target.closest('[data-act]'); if (!a) return;
  var act = a.getAttribute('data-act'), card = a.closest('.ex'), day, i;
  if (card) { day = card.getAttribute('data-day'); i = +card.getAttribute('data-i'); }
  switch (act) {
    case 'go': e.preventDefault(); go(a.getAttribute('data-to'), true); break;
    case 'finish': e.preventDefault(); finishDay(a.getAttribute('data-day')); break;
    case 'reset': e.preventDefault(); resetDay(a.getAttribute('data-day')); break;
    case 'addset': card._extra = (card._extra || 0) + 1; refreshCard(day, i); break;
    case 'delset': if (card._extra > 0) { var ce = db.cur[day] && db.cur[day].ex[i]; var need = cfgFor(day, i).s + card._extra - 1; if (ce && ce.sets && ce.sets.length > need) { toast('Сначала сними отметку с последнего подхода'); break; } card._extra--; refreshCard(day, i); } break;
    case 'swap': doSwap(day, i, a.getAttribute('data-alt')); break;
    case 'unswap': doSwap(day, i, null); break;
    case 'plates': openPlates(card ? currentW(card) : 60); break;
    case 'close': closeSheet(); break;
    case 'bwsave': saveBW(a.getAttribute('data-src')); break;
    case 'bwdel': delBW(a.getAttribute('data-d')); break;
    case 'mssave': saveMeas(); break;
    case 'msdel': db.meas.splice(+a.getAttribute('data-k'), 1); save(); renderMeas(); break;
    case 'sessdel': delSession(a.getAttribute('data-id')); break;
    case 'more': db.ui.histN = (db.ui.histN || 10) + 20; renderHistory(); break;
    case 'export': exportData(); break;
    case 'copy': copyData(); break;
    case 'import': $('#impFile').click(); break;
    case 'paste': openPaste(); break;
    case 'doimport': importText($('#pasteBox').value); break;
    case 'wipe': wipeAll(); break;
    case 'setstart': setStart(); break;
    case 'pause': a.closest('.media').classList.toggle('paused'); break;
  }
});
function doSwap(day, i, alt) {
  var c = db.cur[day], ce = c && c.ex[i];
  if (ce && ce.sets && ce.sets.some(Boolean)) { if (!confirm('В этом упражнении уже есть отмеченные подходы. Заменить и сбросить их?')) return; delete c.ex[i]; if (!hasSets(c)) delete db.cur[day]; }
  if (alt) db.swap[day + '-' + i] = alt; else delete db.swap[day + '-' + i];
  save();
  var card = $('#x-' + day + '-' + i); card._rendered = false; card._extra = 0;
  $$('input[data-typed]', card).forEach(function (x) { x.removeAttribute('data-typed'); x.value = ''; });
  refreshCard(day, i); refreshSess(day);
  var d = $('details[data-alts]', card); if (d) d.open = false;
  toast(alt ? '🔁 Заменено на «' + EXD[alt].n + '»' : 'Вернули исходное упражнение');
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function currentW(card) {
  var rows = $$('.set', card);
  for (var k = 0; k < rows.length; k++) { var ck = $('.sck', rows[k]), wi = $('.w', rows[k]); if (wi && !ck.checked) { var v = pnum(wi.value || wi.placeholder); if (!isNaN(v)) return v; } }
  var wi2 = $('.w', card); return wi2 ? pnum(wi2.value || wi2.placeholder) || 20 : 20;
}

/* ═════════ шторка ═════════ */
var sheet = $('#sheet'), sheetIn = $('#sheetIn');
function openSheet(html) { sheetIn.innerHTML = html; sheet.classList.add('show'); sheetIn.scrollTop = 0; }
function closeSheet() { sheet.classList.remove('show'); sheetIn.innerHTML = ''; }
$('#sheetBg').addEventListener('click', closeSheet);
function platesFor(total, bar) {
  var per = (total - bar) / 2, out = [], P = [25, 20, 15, 10, 5, 2.5, 1.25];
  if (per < 0) return null;
  P.forEach(function (p) { while (per >= p - 1e-9) { out.push(p); per = Math.round((per - p) * 100) / 100; } });
  return { plates: out, rest: per };
}
function openPlates(w) {
  var h = '<h3>🧮 Какие блины вешать</h3><p class="sub">Вес штанги целиком (гриф + блины). Блины — на <b>каждую</b> сторону.</p>';
  h += '<div class="form"><label class="fl"><span>Вес штанги, кг</span><input class="inp" id="plW" type="text" inputmode="decimal" value="' + fnum(w) + '"></label>';
  h += '<label class="fl"><span>Гриф</span><select class="inp" id="plB"><option value="20">Олимпийский 20 кг</option><option value="15">Женский 15 кг</option><option value="10">Лёгкий 10 кг</option><option value="7">EZ-гриф ~7 кг</option></select></label></div>';
  h += '<div id="plOut" style="margin:14px 0 16px"></div><button class="btn wide ghost" data-act="close">Закрыть</button>';
  openSheet(h);
  var upd = function () {
    var W = pnum($('#plW').value), B = +$('#plB').value, out = $('#plOut');
    if (isNaN(W)) { out.innerHTML = ''; return; }
    var r = platesFor(W, B);
    if (!r) { out.innerHTML = '<p class="empty">Это легче пустого грифа (' + B + ' кг).</p>'; return; }
    out.innerHTML = '<div class="eyebrow" style="margin-bottom:8px">На каждую сторону</div>' + (r.plates.length ? '<div class="plates">' + r.plates.map(function (p) { return '<span class="plate">' + fnum(p) + '</span>'; }).join('') + '</div>' : '<p class="small muted">Ничего — только гриф.</p>') + (r.rest > 0.01 ? '<p class="small muted" style="margin-top:8px">Без остатка не собрать: не хватает ' + fnum(r.rest * 2) + ' кг. Возьми ближайший вес.</p>' : '');
  };
  $('#plW').addEventListener('input', upd); $('#plB').addEventListener('change', upd); upd();
}

/* ═════════ сегодня ═════════ */
function weekNo() { if (!db.start) return 0; return Math.floor(dayDiff(pkey(db.start).getTime(), Date.now()) / 7) + 1; }
function nextGym() {
  for (var k = db.sessions.length - 1; k >= 0; k--) { var d = db.sessions[k].day; if (d !== 'home') return GYM[(GYM.indexOf(d) + 1) % 3]; }
  return 'd1';
}
function sessionsThisWeek() { var m = mondayOf(new Date()).getTime(); return db.sessions.filter(function (s) { return s.start >= m; }); }
function renderToday() {
  var box = $('#todayBox'); if (!box) return;
  var now = new Date(), wd = now.getDay(), planned = APP.sched[wd];
  var live = Object.keys(db.cur).filter(function (k) { return hasSets(db.cur[k]); })[0];
  var doneToday = db.sessions.filter(function (s) { return dkey(new Date(s.start)) === dkey(); });
  var wn = weekNo(), date = WDF[wd] + ', ' + now.getDate() + ' ' + MONF[now.getMonth()] + (wn ? ' · неделя ' + wn : '');
  var h = '';
  if (live) {
    var c = db.cur[live];
    h = '<div class="today' + (live === 'home' ? ' home' : '') + '"><div class="eyebrow">' + date + '</div><h2>' + esc(DAYS[live].title) + '</h2><p>Тренировка идёт уже ' + fdur(Date.now() - c.start) + '. Продолжим?</p><div class="cta"><button class="btn wide' + (live === 'home' ? ' o' : '') + '" data-act="go" data-to="' + live + '">Продолжить тренировку</button></div></div>';
  } else if (doneToday.length) {
    var ds = doneToday[doneToday.length - 1], nx = nextGym();
    h = '<div class="today rest"><div class="eyebrow">' + date + '</div><h2>Сегодня сделано ✅</h2><p>' + esc(DAYS[ds.day].title) + ' · ' + fdur(ds.end - ds.start) + ' · ' + sessSets(ds) + ' ' + plural(sessSets(ds), 'подход', 'подхода', 'подходов') + '. Теперь еда и сон — рост идёт именно сейчас.</p><div class="today-alt">Следующая в зале: <button data-act="go" data-to="' + nx + '">' + esc(DAYS[nx].title) + '</button></div></div>';
  } else if (planned === 'home') {
    h = '<div class="today home"><div class="eyebrow">' + date + '</div><h2>Домашняя тренировка</h2><p>20–30 минут, 6 упражнений кругом. Лёгкий день между залами.</p><div class="cta"><button class="btn wide o" data-act="go" data-to="home">Начать дома</button></div><div class="today-alt">Пропустил зал на неделе? Можно сделать <button data-act="go" data-to="' + nextGym() + '">' + esc(DAYS[nextGym()].title) + '</button></div></div>';
  } else if (planned) {
    var g = nextGym(), d = DAYS[g];
    h = '<div class="today"><div class="eyebrow">' + date + '</div><h2>' + esc(d.dayLabel) + ' · ' + esc(d.short) + '</h2><p>' + esc(d.title) + ' · ' + d.ex.length + ' упражнений · ~55 мин</p><div class="cta"><button class="btn wide" data-act="go" data-to="' + g + '">Начать тренировку</button></div>' + (g !== planned ? '<div class="today-alt">Идём по очереди: в прошлый раз была другая тренировка, поэтому сегодня — эта.</div>' : '') + '</div>';
  } else {
    var g2 = nextGym();
    h = '<div class="today rest"><div class="eyebrow">' + date + '</div><h2>Сегодня отдых 😴</h2><p>Мышцы растут не в зале, а во время отдыха. Погуляй, поешь как следует и ляг спать вовремя.</p><div class="today-alt">Пропустил тренировку на неделе? Можно сделать сегодня: <button data-act="go" data-to="' + g2 + '">' + esc(DAYS[g2].title) + '</button></div></div>';
  }
  if (!LS) h = '<div class="warnbox">⚠️ Браузер не даёт сохранять данные (приватный режим или встроенный просмотр). Всё работает, но после закрытия отметки пропадут. Открой файл в обычном Safari или регулярно делай «Экспорт» во вкладке «Прогресс».</div>' + h;
  box.innerHTML = h;
  // неделя
  var wk = sessionsThisWeek(), m = mondayOf(now);
  $$('#week .wd').forEach(function (el) {
    var w = +el.getAttribute('data-wd'), dd = new Date(m); dd.setDate(m.getDate() + ((w + 6) % 7));
    el.classList.toggle('now', w === wd);
    el.classList.toggle('did', wk.some(function (s) { return dkey(new Date(s.start)) === dkey(dd); }));
  });
  $('#weekInfo').textContent = 'на этой неделе: ' + wk.length + ' из 5';
  // плитки
  var tiles = $('#tTiles'), bwl = db.bw.slice().sort(function (a, b) { return a.d < b.d ? -1 : 1; });
  var lastBW = bwl.length ? bwl[bwl.length - 1] : null, firstBW = bwl.length ? bwl[0] : null;
  var prs = 0; db.sessions.forEach(function (s) { s.ex.forEach(function (e) { e.sets.forEach(function (st) { if (st.pr) prs++; }); }); });
  var th = '<div class="tile"><span>Тренировок</span><b>' + db.sessions.length + '</b><small>' + (db.start ? 'с ' + fdate(pkey(db.start)) : 'начни сегодня') + '</small></div>';
  th += '<div class="tile"><span>Эта неделя</span><b>' + wk.length + ' / 5</b><small>3 зала + 2 дома</small></div>';
  var delta = lastBW && firstBW && lastBW !== firstBW ? lastBW.w - firstBW.w : null;
  th += '<div class="tile"><span>Вес тела</span><b>' + (lastBW ? fnum(lastBW.w) + ' кг' : '—') + '</b><small class="' + (delta > 0 ? 'up' : delta < 0 ? 'down' : '') + '">' + (delta != null ? (delta > 0 ? '+' : '') + fnum(delta) + ' кг от старта' : 'запиши ниже') + '</small></div>';
  th += '<div class="tile"><span>Рекорды</span><b>' + prs + '</b><small>личных максимумов</small></div>';
  tiles.innerHTML = th;
  var bi = $('#bwToday'); if (bi && !bi.value) bi.placeholder = lastBW ? fnum(lastBW.w) : '80';
  // дорожная карта
  $$('#road .rd').forEach(function (el) {
    var a = +el.getAttribute('data-a'), b = +el.getAttribute('data-b');
    el.classList.toggle('now', wn >= a && wn <= b);
    el.classList.toggle('past', wn > b);
  });
  // ссылка «Тренировки» в таббаре
  if (!db.ui.lastDay || Date.now() - (db.ui.scrAt || 0) > 3 * 3600e3) $('.t-train').setAttribute('for', 's-' + (live || (planned === 'home' ? 'home' : nextGym())));
}

/* ═════════ вес тела и замеры ═════════ */
function saveBW(src) {
  var inp = src === 'prog' ? $('#bwProg') : $('#bwToday'), v = pnum(inp.value || '');
  if (isNaN(v) || v < 30 || v > 250) { toast('Впиши вес в килограммах, например 80,4'); inp.focus(); return; }
  var k = dkey(); db.bw = db.bw.filter(function (x) { return x.d !== k; }); db.bw.push({ d: k, w: Math.round(v * 10) / 10 });
  db.bw.sort(function (a, b) { return a.d < b.d ? -1 : 1; });
  db.profile.w = Math.round(v * 10) / 10;
  save(); inp.value = ''; inp.blur(); toast('⚖️ Записано: ' + fnum(v) + ' кг'); haptic();
  renderToday(); if (curScr() === 'prog') renderProgress();
}
function delBW(d) { db.bw = db.bw.filter(function (x) { return x.d !== d; }); save(); renderProgress(); }
function saveMeas() {
  var o = { d: dkey() }, any = false;
  ['chest', 'waist', 'arm', 'thigh'].forEach(function (k) { var v = pnum($('#ms-' + k).value); if (!isNaN(v)) { o[k] = v; any = true; } });
  if (!any) { toast('Заполни хотя бы один замер'); return; }
  db.meas = db.meas.filter(function (x) { return x.d !== o.d; }); db.meas.push(o); db.meas.sort(function (a, b) { return a.d < b.d ? -1 : 1; });
  save(); ['chest', 'waist', 'arm', 'thigh'].forEach(function (k) { $('#ms-' + k).value = ''; }); toast('📏 Замеры сохранены'); renderMeas();
}

/* ═════════ графики ═════════ */
function niceTicks(min, max, n) {
  if (min === max) { min -= 1; max += 1; }
  var span = max - min, step = Math.pow(10, Math.floor(Math.log10(span / n))), err = span / n / step;
  if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
  var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, t = [];
  for (var v = lo; v <= hi + step / 2; v += step) t.push(Math.round(v * 1000) / 1000);
  return t;
}
function lineChart(el, pts, opt) {
  opt = opt || {};
  if (!pts.length) { el.innerHTML = '<p class="empty">' + (opt.empty || 'Пока нет данных') + '</p>'; return; }
  var W = Math.max(280, el.clientWidth || 340), Hh = 190, L = 38, R = 46, Tp = 14, B = 26;
  var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
  if (opt.y2) ys = ys.concat(opt.y2.map(function (p) { return p.y; }));
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  if (x0 === x1) { x0 -= 864e5 * 3; x1 += 864e5 * 3; }
  var ticks = niceTicks(Math.min.apply(null, ys), Math.max.apply(null, ys), 3), y0 = ticks[0], y1 = ticks[ticks.length - 1];
  var X = function (v) { return L + (v - x0) / (x1 - x0) * (W - L - R); };
  var Y = function (v) { return Tp + (1 - (v - y0) / (y1 - y0)) * (Hh - Tp - B); };
  var s = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="' + esc(opt.label || 'график') + '"><g class="grid">';
  ticks.forEach(function (t) { s += '<line x1="' + L + '" x2="' + (W - R + 8) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/>'; });
  s += '</g><g class="axis">';
  ticks.forEach(function (t) { s += '<text x="' + (L - 7) + '" y="' + (Y(t) + 3.5) + '" text-anchor="end">' + fnum(t) + '</text>'; });
  s += '<text x="' + L + '" y="' + (Hh - 7) + '" text-anchor="start">' + fdate(x0 + (pts.length === 1 ? 864e5 * 3 : 0)) + '</text>';
  if (pts.length > 1) s += '<text x="' + (W - R) + '" y="' + (Hh - 7) + '" text-anchor="end">' + fdate(x1) + '</text>';
  s += '</g>';
  var line = function (arr) { return arr.map(function (p, k) { return (k ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' '); };
  var main = opt.y2 || pts;
  if (main.length > 1) s += '<path class="area" d="' + line(main) + ' L' + X(main[main.length - 1].x).toFixed(1) + ' ' + (Hh - B) + ' L' + X(main[0].x).toFixed(1) + ' ' + (Hh - B) + 'Z"/>';
  if (main.length > 1) s += '<path class="ln" d="' + line(main) + '"/>';
  if (opt.y2) pts.forEach(function (p) { s += '<circle class="dot raw" cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="3"/>'; });
  else pts.forEach(function (p, k) { if (pts.length <= 24 || k === pts.length - 1) s += '<circle class="dot" cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="4"/>'; });
  var lp = main[main.length - 1];
  s += '<text class="endlbl" x="' + (X(lp.x) + 8) + '" y="' + (Y(lp.y) + 4.5) + '">' + fnum(Math.round(lp.y * 10) / 10) + '</text>';
  s += '<line class="xh" x1="0" x2="0" y1="' + Tp + '" y2="' + (Hh - B) + '" style="display:none"/></svg><div class="tip"></div>';
  el.innerHTML = s;
  var svg = $('svg', el), xh = $('.xh', el), tip = $('.tip', el);
  var show = function (ev) {
    var r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W, best = null, bd = 1e9;
    pts.forEach(function (p) { var dd = Math.abs(X(p.x) - px); if (dd < bd) { bd = dd; best = p; } });
    if (!best) return;
    var cx = X(best.x); xh.setAttribute('x1', cx); xh.setAttribute('x2', cx); xh.style.display = '';
    tip.innerHTML = '<b>' + esc(best.label || fnum(best.y)) + '</b>' + fdate(best.x) + (best.sub ? ' · ' + esc(best.sub) : '');
    tip.style.display = 'block'; tip.style.left = Math.max(60, Math.min(r.width - 60, cx / W * r.width)) + 'px';
  };
  var hide = function () { xh.style.display = 'none'; tip.style.display = 'none'; };
  svg.addEventListener('pointerdown', show); svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerleave', hide); svg.addEventListener('pointercancel', hide);
}

/* ═════════ прогресс ═════════ */
function renderProgress() {
  var tl = $('#pTiles'); if (!tl) return;
  var dur = 0, vol = 0, sets = 0, prs = 0;
  db.sessions.forEach(function (s) { dur += s.end - s.start; vol += sessVolume(s); sets += sessSets(s); s.ex.forEach(function (e) { e.sets.forEach(function (st) { if (st.pr) prs++; }); }); });
  tl.innerHTML = '<div class="tile"><span>Тренировок</span><b>' + db.sessions.length + '</b><small>' + sets + ' ' + plural(sets, 'подход', 'подхода', 'подходов') + '</small></div>' +
    '<div class="tile"><span>Время</span><b>' + (dur >= 36e5 ? fnum(Math.round(dur / 36e5 * 10) / 10) + ' ч' : Math.round(dur / 6e4) + ' мин') + '</b><small>в зале и дома</small></div>' +
    '<div class="tile"><span>Тоннаж</span><b>' + (vol >= 10000 ? fnum(Math.round(vol / 100) / 10) + ' т' : fbig(vol) + ' кг') + '</b><small>поднято всего</small></div>' +
    '<div class="tile"><span>Рекорды</span><b>' + prs + '</b><small>личных максимумов</small></div>';
  renderBW(); renderStrength(); renderHistory(); renderMeas(); renderSettings();
}
function renderBW() {
  var el = $('#bwChart'); if (!el) return;
  var bw = db.bw.slice().sort(function (a, b) { return a.d < b.d ? -1 : 1; });
  var pts = bw.map(function (x) { return { x: pkey(x.d).getTime(), y: x.w, label: fnum(x.w) + ' кг' }; });
  var avg = pts.map(function (p, k) { var from = p.x - 6 * 864e5, win = pts.filter(function (q, j) { return j <= k && q.x >= from; }); return { x: p.x, y: win.reduce(function (a, q) { return a + q.y; }, 0) / win.length }; });
  lineChart(el, pts, { y2: pts.length > 3 ? avg : null, label: 'Вес тела', empty: 'Записывай вес раз в несколько дней — здесь появится график.' });
  $('#bwLegend').style.display = pts.length > 3 ? '' : 'none';
  var msg = $('#bwMsg'), txt = '';
  if (pts.length >= 4) {
    var lastT = pts[pts.length - 1].x, recent = pts.filter(function (p) { return p.x > lastT - 7 * 864e5; }), prev = pts.filter(function (p) { return p.x <= lastT - 7 * 864e5 && p.x > lastT - 21 * 864e5; });
    if (recent.length && prev.length) {
      var a1 = recent.reduce(function (a, p) { return a + p.y; }, 0) / recent.length, a0 = prev.reduce(function (a, p) { return a + p.y; }, 0) / prev.length;
      var dt = ((recent[recent.length - 1].x + recent[0].x) / 2 - (prev[prev.length - 1].x + prev[0].x) / 2) / (7 * 864e5), rate = dt > 0 ? (a1 - a0) / dt : 0;
      if (rate < 0.1) txt = '📉 Темп: ' + (rate >= 0 ? '+' : '') + fnum(Math.round(rate * 100) / 100) + ' кг/нед — мало для набора. Добавь 200–300 ккал в день (стакан молока + банан).';
      else if (rate > 0.7) txt = '📈 Темп: +' + fnum(Math.round(rate * 100) / 100) + ' кг/нед — быстровато, часть уйдёт в жир. Убавь 200 ккал.';
      else txt = '✅ Темп: +' + fnum(Math.round(rate * 100) / 100) + ' кг/нед — отлично, так и держи (цель 0,25–0,5).';
    }
  }
  msg.textContent = txt; msg.style.display = txt ? '' : 'none';
  var list = $('#bwList');
  list.innerHTML = bw.length ? bw.slice(-8).reverse().map(function (x) { return '<div class="li"><div class="grow"><b>' + fdate(pkey(x.d)) + '</b><small>' + WDF[pkey(x.d).getDay()] + '</small></div><span class="v">' + fnum(x.w) + ' кг</span><button class="del" data-act="bwdel" data-d="' + x.d + '" aria-label="Удалить">✕</button></div>'; }).join('') : '';
  list.style.display = bw.length ? '' : 'none';
}
function renderStrength() {
  var sel = $('#strSel'); if (!sel) return;
  var ids = [], seen = {};
  db.sessions.forEach(function (s) { s.ex.forEach(function (e) { if (!seen[e.id]) { seen[e.id] = 1; ids.push(e.id); } }); });
  var el = $('#strChart'), tb = $('#strTable');
  if (!ids.length) { sel.style.display = 'none'; el.innerHTML = '<p class="empty">Здесь появится график силы по каждому упражнению после первой тренировки.</p>'; tb.innerHTML = ''; return; }
  sel.style.display = '';
  var cur = db.ui.strEx && seen[db.ui.strEx] ? db.ui.strEx : (seen.bench ? 'bench' : ids[0]);
  sel.innerHTML = ids.map(function (id) { return '<option value="' + id + '"' + (id === cur ? ' selected' : '') + '>' + esc(EXD[id].n) + '</option>'; }).join('');
  var e = EXD[cur], bw = e.kind === 'bw' || e.kind === 'time', h = histFor(cur).reverse();
  var pts = h.map(function (x) {
    var best = null, bv = -1;
    x.sets.forEach(function (st) { var v = bw ? st.r : e1rm(st.w, st.r); if (v > bv) { bv = v; best = st; } });
    return { x: x.ts, y: Math.round(bv * 10) / 10, label: bw ? best.r + (e.kind === 'time' ? ' сек' : ' повт.') : fnum(best.w) + ' кг × ' + best.r, sub: bw ? '' : '1ПМ ≈ ' + fnum(Math.round(bv * 10) / 10) };
  });
  lineChart(el, pts, { label: e.n });
  $('#strNote').textContent = bw ? 'Лучший подход каждой тренировки' : 'Расчётный максимум на 1 раз (1ПМ) по лучшему подходу — растёт, значит, ты сильнее.';
  tb.innerHTML = h.slice().reverse().slice(0, 8).map(function (x) {
    return '<div class="li"><div class="grow"><b>' + fdate(x.ts) + '</b><small>' + x.sets.map(function (st) { return (st.w ? fnum(st.w) + '×' : '') + st.r; }).join(' · ') + '</small></div></div>';
  }).join('');
}
function renderHistory() {
  var el = $('#histList'); if (!el) return;
  var n = db.ui.histN || 10, arr = db.sessions.slice().reverse();
  if (!arr.length) { el.innerHTML = '<p class="empty">Пока пусто. Заверши первую тренировку — она появится здесь.</p>'; return; }
  el.innerHTML = arr.slice(0, n).map(function (s) {
    var d = new Date(s.start), vol = sessVolume(s);
    return '<details class="hist"><summary><div class="dt"><b>' + d.getDate() + '</b><small>' + MON[d.getMonth()] + '</small><small>' + WDS[d.getDay()] + '</small></div><div class="hb"><b>' + esc(DAYS[s.day] ? DAYS[s.day].title : s.day) + '</b><small>' + fdur(s.end - s.start) + ' · ' + sessSets(s) + ' ' + plural(sessSets(s), 'подход', 'подхода', 'подходов') + (vol ? ' · ' + fbig(vol) + ' кг' : '') + '</small></div></summary><div class="hx">' +
      s.ex.map(function (e) { return '<p><b>' + esc(EXD[e.id] ? EXD[e.id].n : e.id) + ':</b> ' + e.sets.map(function (st) { return (st.w ? fnum(st.w) + '×' : '') + st.r + (st.pr ? '🏆' : ''); }).join(' · ') + '</p>'; }).join('') +
      '<button class="del2" data-act="sessdel" data-id="' + s.id + '">Удалить эту тренировку</button></div></details>';
  }).join('') + (arr.length > n ? '<button class="btn wide ghost sm" style="margin-top:10px" data-act="more">Показать ещё</button>' : '');
}
function delSession(id) {
  if (!confirm('Удалить тренировку из истории? Это нельзя отменить.')) return;
  db.sessions = db.sessions.filter(function (s) { return s.id !== id; }); save(true); renderProgress(); toast('Удалено');
}
function renderMeas() {
  var el = $('#msList'); if (!el) return;
  if (!db.meas.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  var first = db.meas[0], names = { chest: 'грудь', waist: 'талия', arm: 'бицепс', thigh: 'бедро' };
  el.innerHTML = db.meas.map(function (m, k) { return { m: m, k: k }; }).reverse().slice(0, 10).map(function (o) {
    var m = o.m, parts = [];
    ['chest', 'waist', 'arm', 'thigh'].forEach(function (k) { if (m[k] != null) { var d = first[k] != null && m !== first ? m[k] - first[k] : null; parts.push(names[k] + ' ' + fnum(m[k]) + (d ? ' (' + (d > 0 ? '+' : '') + fnum(Math.round(d * 10) / 10) + ')' : '')); } });
    return '<div class="li"><div class="grow"><b>' + fdate(pkey(m.d)) + '</b><small>' + parts.join(' · ') + ' см</small></div><button class="del" data-act="msdel" data-k="' + o.k + '" aria-label="Удалить">✕</button></div>';
  }).join('');
}
function renderSettings() {
  $$('[data-set]').forEach(function (i) { i.checked = !!db.set[i.getAttribute('data-set')]; });
  var st = $('#storeState');
  if (st) st.textContent = LS ? 'Данные хранятся в этом браузере на телефоне. Тренировок: ' + db.sessions.length + ', записей веса: ' + db.bw.length + '. Делай экспорт раз в пару недель — на всякий случай.' : 'Браузер запрещает сохранять данные. Делай экспорт после каждой тренировки!';
  var sd = $('#startDate'); if (sd) sd.textContent = db.start ? fdate(pkey(db.start)) + ' ' + pkey(db.start).getFullYear() : 'ещё не начал';
}
function setStart() {
  var v = prompt('Дата начала программы (ДД.ММ.ГГГГ). От неё считаются недели плана:', db.start ? db.start.split('-').reverse().join('.') : dkey().split('-').reverse().join('.'));
  if (!v) return; var m = v.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) { toast('Формат: 01.09.2026'); return; }
  db.start = m[3] + '-' + pad2(+m[2]) + '-' + pad2(+m[1]); save(); renderSettings(); renderToday(); toast('Дата старта сохранена');
}

/* ═════════ бэкап ═════════ */
function exportData() {
  var json = JSON.stringify(db), name = 'massa-backup-' + dkey() + '.json';
  try {
    var f = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: 'МАССА — резервная копия' }).catch(function () {}); return; }
  } catch (e) {}
  try {
    var a = D.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = name;
    D.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('Файл копии сохранён');
  } catch (e2) { copyData(); }
}
function copyData() {
  var json = JSON.stringify(db);
  var fallback = function () { openSheet('<h3>Код резервной копии</h3><p class="sub">Выдели всё и скопируй в «Заметки». Восстановить: «Вставить код».</p><textarea class="inp" readonly>' + esc(json) + '</textarea><button class="btn wide ghost" style="margin-top:12px" data-act="close">Закрыть</button>'); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json).then(function () { toast('📋 Скопировано — вставь в «Заметки»'); }, fallback);
  else fallback();
}
function openPaste() { openSheet('<h3>Восстановить из кода</h3><p class="sub">Вставь сюда скопированный код резервной копии.</p><textarea class="inp" id="pasteBox" placeholder="{&quot;v&quot;:2, ...}"></textarea><div class="btnrow" style="margin-top:12px"><button class="btn ghost" data-act="close">Отмена</button><button class="btn" data-act="doimport">Восстановить</button></div>'); }
function readImport(inp) {
  var f = inp.files && inp.files[0]; if (!f) return;
  var r = new FileReader(); r.onload = function () { importText(String(r.result)); inp.value = ''; }; r.readAsText(f);
}
function importText(text) {
  var o; try { o = JSON.parse(text); } catch (e) { toast('Это не похоже на копию МАССЫ'); return; }
  if (!o || !Array.isArray(o.sessions)) { toast('В копии нет данных тренировок'); return; }
  if (!confirm('Заменить текущие данные копией? В ней тренировок: ' + o.sessions.length + '.')) return;
  db = merge(blank(), o); save(true); closeSheet(); toast('✅ Данные восстановлены'); renderAll();
}
function wipeAll() {
  if (!confirm('Удалить ВСЕ данные: тренировки, вес, замеры, настройки?')) return;
  if (!confirm('Точно? Сначала лучше сделать экспорт.')) return;
  db = blank(); save(true); renderAll(); toast('Данные удалены');
}

/* ═════════ питание ═════════ */
function onProfile() {
  var g = function (id) { return pnum($('#' + id).value); };
  var age = g('pfAge'), h = g('pfH'), w = g('pfW');
  if (!isNaN(age) && age >= 12 && age <= 80) db.profile.age = age;
  if (!isNaN(h) && h >= 140 && h <= 220) db.profile.h = h;
  if (!isNaN(w) && w >= 40 && w <= 200) db.profile.w = w;
  db.profile.act = +$('#pfAct').value; db.profile.pace = +$('#pfPace').value;
  save(); renderNorm();
}
function renderNorm() {
  var p = db.profile, bmr = 10 * p.w + 6.25 * p.h - 5 * p.age + 5, tdee = bmr * p.act, kcal = Math.round(tdee * (1 + p.pace) / 50) * 50;
  var prot = Math.round(p.w * 2), fat = Math.round(p.w * 1), carb = Math.max(0, Math.round((kcal - prot * 4 - fat * 9) / 4));
  $('#fKcal').textContent = fbig(kcal);
  $('#fP').textContent = prot + ' г'; $('#fF').textContent = fat + ' г'; $('#fC').textContent = carb + ' г';
  $('#fPk').textContent = Math.round(prot * 4 / kcal * 100) + '% ккал'; $('#fFk').textContent = Math.round(fat * 9 / kcal * 100) + '% ккал'; $('#fCk').textContent = Math.round(carb * 4 / kcal * 100) + '% ккал';
  $('#fTdee').textContent = fbig(Math.round(tdee / 10) * 10);
  $('#fWater').textContent = fnum(Math.round(p.w * 0.037 * 10) / 10);
  $('#fBasis').textContent = 'Рост ' + p.h + ' см · вес ' + fnum(p.w) + ' кг · возраст ' + p.age + ' · расход ≈ ' + fbig(Math.round(tdee / 10) * 10) + ' ккал + ' + Math.round(p.pace * 100) + '% на рост';
  var foodProt = $('#ckProtLbl'); if (foodProt) foodProt.textContent = 'Белок ≥ ' + prot + ' г';
  var foodK = $('#ckKcalLbl'); if (foodK) foodK.textContent = 'Калории ≈ ' + fbig(kcal);
}
function renderFood() {
  var p = db.profile;
  if (!rendered.food) {
    rendered.food = true;
    $('#pfAge').value = p.age; $('#pfH').value = p.h; $('#pfW').value = fnum(p.w);
    $('#pfAct').value = String(p.act); $('#pfPace').value = String(p.pace);
  }
  renderNorm();
  var today = db.food[dkey()] || {};
  $$('[data-food]').forEach(function (i) { i.checked = !!today[i.getAttribute('data-food')]; });
  renderFoodDots();
}
function renderFoodDots() {
  var el = $('#foodDots'); if (!el) return;
  var keys = $$('[data-food]').map(function (i) { return i.getAttribute('data-food'); }), h = '';
  for (var k = 6; k >= 0; k--) {
    var d = new Date(); d.setDate(d.getDate() - k);
    var f = db.food[dkey(d)] || {}, n = keys.filter(function (x) { return f[x]; }).length, lvl = n === 0 ? '' : n >= keys.length ? 'l3' : n >= keys.length / 2 ? 'l2' : 'l1';
    h += '<span><i class="' + lvl + '"></i>' + WDS[d.getDay()] + '</span>';
  }
  el.innerHTML = h;
}

/* ═════════ библиотека ═════════ */
function markLib() {
  var used = {};
  Object.keys(DAYS).forEach(function (d) { DAYS[d].ex.forEach(function (_, i) { used[slotEx(d, i)] = 1; }); });
  $$('.xc').forEach(function (x) { var b = $('.inprog', x); if (b) b.style.display = used[x.getAttribute('data-id')] ? '' : 'none'; });
}

/* ═════════ запуск ═════════ */
function renderAll() {
  Object.keys(DAYS).forEach(function (d) { $$('.scr-' + d + ' .ex').forEach(function (c) { c._rendered = false; }); refreshDay(d); });
  renderToday(); rendered.food = false;
  var s = curScr(); if (s === 'prog') renderProgress(); if (s === 'food') renderFood();
}
// медиа: тап по картинке — пауза анимации
$$('.media').forEach(function (m) { m.setAttribute('data-act', 'pause'); });
$$('.ex .yt, .xc .yt').forEach(function (a) { a.addEventListener('click', function (e) { e.stopPropagation(); }); });
// ссылки «Начать» из карточек дня на главной (нужен скролл наверх)
$$('[data-go]').forEach(function (l) { l.addEventListener('click', function () { var t = l.getAttribute('for').slice(2); setTimeout(function () { var sc = $('.scr-' + t); if (sc) sc.scrollTop = 0; }, 0); }); });

Object.keys(DAYS).forEach(refreshDay);
var startScr = db.ui.scr && Date.now() - (db.ui.scrAt || 0) < 3 * 3600e3 ? db.ui.scr : 'today';
if (startScr !== 'today' && $('#s-' + startScr)) go(startScr); else { renderToday(); }
if (db.ui.lastDay && Date.now() - (db.ui.scrAt || 0) < 3 * 3600e3) $('.t-train').setAttribute('for', 's-' + db.ui.lastDay);
if (anyLive()) { /* запросим вейклок при первом касании */ D.addEventListener('touchend', function once() { wakeOn(); D.removeEventListener('touchend', once); }); }

// установка как приложение (только когда страница открыта с сайта)
var standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
var a2 = $('#a2hs'); if (a2 && /^https?:/.test(location.protocol) && !standalone) a2.style.display = '';
var modeTxt = standalone ? 'Режим: приложение на экране «Домой» ✅' : (/^https?:/.test(location.protocol) ? 'Режим: сайт в браузере' : 'Режим: файл в браузере');
$$('.modeState').forEach(function (el) { el.textContent = modeTxt + ' · версия ' + APP.v; });
// совет дня меняется каждый день
var doy = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 864e5);
var tipEl = $('#tipDay'); if (tipEl && APP.tips.length) tipEl.textContent = APP.tips[doy % APP.tips.length];
if ($('meta[name=massa-pwa]') && 'serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
  try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {}
}
}
})();
