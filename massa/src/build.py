# -*- coding: utf-8 -*-
"""Собирает МАССА в один самодостаточный HTML-файл."""
import base64
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from data import (EX, GROUPS, LVL, PROGRAM, SCHEDULE, WEEK, ROADMAP, FOOD, MENU, GAINER, CHEAP,  # noqa: E402
                  TIP_OF_DAY)

SRC = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(SRC, 'assets')          # готовые кадры, шрифты, иконки
OUT = os.path.abspath(os.path.join(SRC, '..'))  # папка massa/ — сюда кладётся результат
FONTS = os.path.join(ASSETS, 'fonts')
MANIFEST = json.load(open(os.path.join(ASSETS, 'img_manifest.json'), encoding='utf-8'))
VERSION = '2.0'


def E(s):
    return html.escape(str(s), quote=True)


NB_UNITS = r'(кг|см|мин|сек|г|ккал|мл|л|раз|ч|шт|ст\.|ч\.|недел\w*|подход\w*|повтор\w*|упражнени\w*|дн\w*|минут\w*|секунд\w*|%)'


def nb(s):
    """Неразрывный пробел между числом и единицей."""
    s = re.sub(r'(\d) ' + NB_UNITS, '\\1\u00a0\\2', s)
    s = re.sub(r'(\d) ([–×−-]) (\d)', '\\1\u00a0\\2\u00a0\\3', s)
    return s


def T(s):
    return E(nb(s))


def b64(path):
    with open(path, 'rb') as f:
        return base64.b64encode(f.read()).decode('ascii')


def fnum(x):
    if x is None:
        return ''
    r = round(x, 2)
    s = ('%g' % r).replace('.', ',')
    return s


# ───────────── разбор назначений ─────────────
def parse_reps(r):
    m = re.match(r'(\d+)\s*[–-]\s*(\d+)\s*(сек)?', r)
    side = ('на руку' in r) or ('на ногу' in r) or ('на сторону' in r)
    if m:
        return dict(lo=int(m.group(1)), hi=int(m.group(2)), unit='sec' if m.group(3) else 'reps', side=side)
    m = re.match(r'(\d+)\s*(сек)?', r)
    if m and not r.startswith('макс'):
        v = int(m.group(1))
        return dict(lo=v, hi=v, unit='sec' if m.group(2) else 'reps', side=side)
    return dict(lo=None, hi=None, unit='reps', side=side)


def parse_w(w):
    if 'свой вес' in w:
        return dict(bw=True, w0=None, pair=False)
    m = re.match(r'(\d+(?:[.,]\d+)?)', w)
    return dict(bw=False, w0=float(m.group(1).replace(',', '.')), pair=('× 2' in w))


def rest_txt(sec):
    if sec >= 120 and sec % 60 == 0:
        return '%d мин' % (sec // 60)
    return '%d сек' % sec


PAIR_IDS = {'incline_db', 'db_press', 'lat_raise', 'hammer', 'db_bench', 'db_fly', 'db_curl', 'db_lunge'}
SIDE_IDS = {'db_row', 'bulgarian', 'lunge', 'step_up', 'side_plank', 'bird_dog', 'dead_bug'}
PROG_IDS = {e['id'] for d in PROGRAM for e in d['ex']}
PROG_ORDER = {}
for _d in PROGRAM:
    for _e in _d['ex']:
        PROG_ORDER.setdefault(_e['id'], len(PROG_ORDER))
PROG_PRESC = {}
for d in PROGRAM:
    for p in d['ex']:
        PROG_PRESC.setdefault(p['id'], '%d × %s' % (p['s'], p['r']))


def lib_sets(e):
    if e['s']:
        return e['s']
    if e['id'] in PROG_PRESC:
        return PROG_PRESC[e['id']]
    return '3 × 8–12' if e['kind'] in ('bb', 'db') else '3 × 10–15'


# ───────────── иконки ─────────────
ICON = {
    'today': '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
    'train': '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
    'lib': '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
    'prog': '<path d="M4 20h16"/><path d="M5.5 15.5 10 11l3.5 3 6-6.5"/><path d="M15 7.5h4.5V12"/>',
    'food': '<path d="M7 3v7.5a2 2 0 0 0 2 2V21M5 3v5.5M9 3v5.5"/><path d="M17.5 21V3c-2.2 1.4-3.5 4-3.5 7.5V13h3.5"/>',
}


def svg(name):
    return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">%s</svg>' % ICON[name]


def frames(eid, cls=''):
    return ''.join('<div class="fr f%d im-%s-%d%s"></div>' % (k, eid, k, cls) for k in range(len(MANIFEST[eid])))


def yt(q):
    from urllib.parse import quote
    return 'https://www.youtube.com/results?search_query=' + quote(q)


# ───────────── экраны ─────────────
def screen_today():
    days = {d['key']: d for d in PROGRAM}
    h = ['<section class="scr scr-today" aria-label="Сегодня">']
    h.append('<header class="hero"><div class="hero-img"></div><div class="hero-grad"></div><div class="hero-in">'
             '<div class="kicker">◆ Программа набора массы</div>'
             '<h1>Три дня<br>в зале.<br><em>Одна цель.</em></h1>'
             '<p>Персональная программа под твои параметры. Новичок, база, никакой ерунды — только то, что реально растит мышцы.</p>'
             '<div class="stats"><div class="stat">Рост <b>188&nbsp;см</b></div><div class="stat">Вес <b>80&nbsp;кг</b></div>'
             '<div class="stat">Цель <b>масса</b></div><div class="stat">Зал <b>3×</b> + дом <b>2×</b></div></div>'
             '</div></header>')
    h.append('<div class="wrap">')
    # режим без JS
    h.append('<div class="sec nojs-only"><div class="infobox"><h4>📱 Режим просмотра</h4>'
             'Файл открыт во встроенном просмотре iPhone: вкладки, анимации упражнений, галочки подходов и таймер работают, '
             'но <b>после закрытия отметки не сохранятся</b>, а дневник, графики и калькулятор питания здесь выключены. '
             'Как включить всё — во вкладке <label for="s-tips"><b><u>Советы → Как пользоваться</u></b></label>.</div></div>')
    h.append('<div class="sec js-only" id="todayBox"></div>')
    h.append('<div class="sec js-only infobox" id="a2hs" style="display:none"><b>📲 Сделай из сайта приложение:</b> в Safari нажми «Поделиться» → «На экран „Домой“». '
             'Будет открываться на весь экран, работать без интернета и надёжно хранить твой дневник.</div>')
    # неделя
    h.append('<div class="sec"><div class="sec-h"><h2>Неделя</h2><span class="lnk js-only" id="weekInfo"></span></div><div class="week" id="week">')
    wdmap = {'Пн': 1, 'Вт': 2, 'Ср': 3, 'Чт': 4, 'Пт': 5, 'Сб': 6, 'Вс': 0}
    for name, key, icon in WEEK:
        cls = 'wd' + (' on' if key in ('d1', 'd2', 'd3') else ' hm' if key == 'home' else '')
        sub = days[key]['short'] if key in ('d1', 'd2', 'd3') else ('дом' if key == 'home' else 'отдых')
        inner = '<span>%s</span><i>%s</i><small>%s</small><b class="ok">✓</b>' % (name, icon, E(sub))
        if key:
            h.append('<label class="%s" for="s-%s" data-wd="%d">%s</label>' % (cls, key, wdmap[name], inner))
        else:
            h.append('<div class="%s" data-wd="%d">%s</div>' % (cls, wdmap[name], inner))
    h.append('</div><p class="week-note">Дни можно сдвигать — важно только, чтобы между залами был день отдыха.</p></div>')
    # плитки + вес
    h.append('<div class="sec js-only"><div class="sec-h"><h2>Мой прогресс</h2><label class="lnk" for="s-prog">подробнее →</label></div>'
             '<div class="tiles" id="tTiles"></div>'
             '<div class="tcard" style="margin-top:9px;margin-bottom:0"><h3><i>⚖️</i> Вес тела сегодня</h3>'
             '<div class="qw"><input class="inp" id="bwToday" type="text" inputmode="decimal" autocomplete="off" placeholder="80" aria-label="Вес тела, кг">'
             '<button class="btn sm" data-act="bwsave" data-src="today">Записать</button></div>'
             '<p class="small muted" style="margin-top:8px">Утром, после туалета, до еды. 2–3 раза в неделю достаточно.</p></div></div>')
    # тренировки
    h.append('<div class="sec"><div class="sec-h"><h2>Тренировки</h2></div><div class="daycards">')
    for d in PROGRAM:
        first = d['ex'][0]['id']
        hm = d['key'] == 'home'
        k = d['day'].split('·')[0].strip() if not hm else 'Вт и Чт'
        h.append('<label class="dc%s" for="s-%s" data-go><div class="bgimg im-%s-0"></div><div><div class="k">%s</div><h3>%s</h3></div><small>%d упражнений · %s</small></label>'
                 % (' hm' if hm else '', d['key'], first, E(k), E(d['title']), len(d['ex']), E(d['meta'][0])))
    h.append('</div></div>')
    # дорожная карта
    h.append('<div class="sec"><div class="sec-h"><h2>План на 12 недель</h2></div><div class="road" id="road">')
    for r in ROADMAP:
        a, b = r['w']
        lab = ('Нед. %d' % a) if a == b else ('Нед. %d+' % a if b > 50 else 'Нед. %d–%d' % (a, b))
        h.append('<div class="rd" data-a="%d" data-b="%d"><b>%s</b><div><h4>%s</h4><p>%s</p></div></div>' % (a, b, E(lab), E(r['t']), T(r['d'])))
    h.append('</div></div>')
    # ссылки
    h.append('<div class="sec"><div class="linkcards">'
             '<label class="lc b" for="s-tips"><i>💡</i><h4>Советы</h4><p>Прогрессия, техника, сон, ошибки новичка</p></label>'
             '<label class="lc o" for="s-food"><i>🍗</i><h4>Питание</h4><p>Сколько есть, меню на день, дешёвый белок</p></label>'
             '</div></div>')
    # совет дня
    h.append('<div class="sec"><div class="tcard"><h3><i>💬</i> Совет</h3><p id="tipDay">%s</p></div></div>' % T(TIP_OF_DAY[0]))
    h.append(footer())
    h.append('</div></section>')
    return ''.join(h)


def footer():
    return ('<footer class="foot"><p><b>МАССА 2.0</b> — персональная программа 188/80<br>Веса и подходы — ориентир, слушай своё тело.<br>'
            'При острой боли в суставе или спине остановись и покажись врачу.</p><p class="small js-only modeState" style="margin-top:8px;opacity:.7"></p></footer>')


def ex_card(day, i, p):
    e = EX[p['id']]
    eid = e['id']
    rp = parse_reps(p['r'])
    wp = parse_w(p['w'])
    bw = wp['bw'] or e['kind'] in ('bw', 'time')
    unit_lbl = 'сек' if rp['unit'] == 'sec' else 'раз'
    total_sets = p['s']
    h = ['<article class="ex" id="x-%s-%d" data-day="%s" data-i="%d" data-ex="%s">' % (day, i, day, i, eid)]
    h.append('<div class="media" data-media>%s<span class="num">%d</span><span class="tgt" data-tgt>%s</span>'
             '<span class="badge-done">✓ готово</span>'
             '<a class="yt" data-yt href="%s" target="_blank" rel="noopener noreferrer">▶ Видео</a></div>'
             % (frames(eid), i + 1, E(e['target']), E(yt(e['v']))))
    h.append('<div class="ex-body"><div class="ex-name" data-name>%s</div><div class="ex-alt" data-en>%s · %s</div>'
             % (E(e['name']), E(e['en']), E(e['target'])))
    h.append('<div class="swapped" data-swapped></div>')
    h.append('<div class="grid3"><div class="cell"><span>Подходы</span><b>%d</b></div><div class="cell"><span>Повторы</span><b>%s</b></div>'
             '<div class="cell w"><span>Вес</span><b>%s</b><small>отдых %s</small></div></div>'
             % (total_sets, T(p['r']), T(p['w']), T(rest_txt(p['rest']))))
    h.append('<div class="hint" data-hint></div>')
    # подходы
    h.append('<div class="sets">')
    if bw:
        h.append('<div class="sets-h bw"><span>#</span><span>%s</span><span>✓</span></div>' % ('Время' if rp['unit'] == 'sec' else 'Повторы'))
    else:
        h.append('<div class="sets-h"><span>#</span><span>Вес</span><span></span><span>Повторы</span><span>✓</span></div>')
    h.append('<div data-rows>')
    for j in range(total_sets):
        cid = 'ck-%s-%d-%d' % (day, i, j)
        row = ['<div class="set%s" data-j="%d"><span class="sn">%d</span>' % (' bw' if bw else '', j, j + 1)]
        if not bw:
            row.append('<label class="fld"><input class="w" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="next" placeholder="%s" aria-label="Вес, подход %d"><em>кг</em></label><span class="x">×</span>'
                       % (fnum(wp['w0']), j + 1))
        ph = str(rp['hi']) if rp['hi'] else '—'
        row.append('<label class="fld"><input class="r" type="text" inputmode="numeric" autocomplete="off" enterkeyhint="done" placeholder="%s" aria-label="Повторы, подход %d"><em>%s</em></label>'
                   % (ph, j + 1, unit_lbl))
        row.append('<input type="checkbox" class="sck" id="%s" switch><label for="%s" class="sbtn" aria-label="Подход %d выполнен"></label></div>' % (cid, cid, j + 1))
        h.append(''.join(row))
    h.append('</div>')
    tools = ''
    if e['kind'] == 'bb':
        tools = '<button type="button" data-act="plates">🧮 Блины</button>'
    h.append('<div class="sets-foot js-only"><span class="tools"><button type="button" data-act="addset">+ подход</button>'
             '<button type="button" data-act="delset" style="display:none">− подход</button></span><span class="tools">%s</span></div>' % tools)
    h.append('</div>')
    # заметки
    h.append('<div class="notes"><div class="note tip" data-tip>%s</div>' % T(e['tip']))
    h.append('<div class="note err" data-err%s>%s</div></div>' % ('' if e['err'] else ' style="display:none"',
                                                                  ('<b>Ошибка новичка:</b> ' + T(e['err'])) if e['err'] else ''))
    # шаги
    h.append('<details class="more"%s><summary>Техника по шагам</summary><ol class="steps" data-steps>%s</ol></details>'
             % ('' if e['steps'] else ' style="display:none"', ''.join('<li>%s</li>' % T(s) for s in e['steps'])))
    # разминочные подходы
    if eid in ('bench', 'squat'):
        h.append('<details class="more" data-warmwrap><summary>Разминочные подходы</summary><div class="warmsets" data-warm>'
                 'Перед рабочими подходами: <b>пустой гриф 20&nbsp;кг × 10–15</b> → затем 1–2 подхода по 3–5 повторов, постепенно приближаясь к рабочему весу. '
                 'Отдых между ними — около минуты.</div></details>')
    # замены
    if p['alts']:
        alts = []
        for a in p['alts']:
            ae = EX[a]
            short = re.split(r'(?<=[.!])\s', ae['tip'])[0]
            alts.append('<div class="alt" data-alt="%s"><div class="th">%s</div><div><h5>%s</h5><p>%s</p>'
                        '<button type="button" class="swap js-only" data-act="swap" data-alt="%s">🔁 Делать это вместо</button></div></div>'
                        % (a, frames(a), E(ae['name']), T(short), a))
        h.append('<details class="more" data-alts><summary>Если занято — замены <span class="cnt">%d</span></summary><div class="alts">%s</div></details>'
                 % (len(alts), ''.join(alts)))
    h.append('</div></article>')
    return ''.join(h)


def screen_day(d):
    key = d['key']
    hm = key == 'home'
    tot = sum(p['s'] for p in d['ex'])
    h = ['<section class="scr scr-day scr-%s%s" aria-label="%s">' % (key, ' panel-home' if hm else '', E(d['title']))]
    h.append('<div class="wrap"><form class="dayform" autocomplete="off" onsubmit="return false">')
    h.append('<div class="ph%s"><div class="ph-day">%s</div><h2>%s</h2><p>%s</p><div class="meta">%s</div></div>'
             % (' o' if hm else '', T(d['day']), E(d['title']), T(d['desc']),
                ''.join('<div class="chip">%s</div>' % T(m) for m in d['meta'])))
    h.append('<div class="sess js-only" data-sess><div class="sess-top"><div class="ttl"><b data-s-title>Готов? Поехали</b><span data-s-sub></span></div></div>'
             '<div class="pbar"><i data-s-bar></i></div><div class="wake" data-s-wake></div></div>')
    h.append('<div class="warm"><h3>🔥 Разминка — 5–8 минут, обязательно</h3><ul>%s</ul></div>'
             % ''.join('<li>%s</li>' % T(w) for w in d['warm']))
    h.append('<p class="small muted nojs-only" style="margin:-4px 0 14px">Сделал подход — нажми ✓ справа от него. Внизу — таймер отдыха.</p>')
    for i, p in enumerate(d['ex']):
        h.append(ex_card(key, i, p))
    nxt = {'d1': 'd2', 'd2': 'd3', 'd3': 'd1'}.get(key)
    h.append('<div class="finish"><div class="cnt nojs-only">Сделано подходов: <b class="cnt-n"></b> из %d</div>'
             '<div class="cnt js-only" data-fin-cnt>Сделано подходов: <b>0</b> из %d</div>'
             '<p class="nojs-only">В режиме просмотра отметки не сохраняются — это нормально. Следующая тренировка: %s.</p>'
             '<p class="js-only">Сохрани тренировку — в следующий раз приложение подскажет, какой вес ставить.</p>'
             '<button type="button" class="btn wide js-only%s" data-act="finish" data-day="%s" disabled>Завершить тренировку</button>'
             '<button type="reset" class="reset nojs-only">Сбросить отметки</button>'
             '<button type="button" class="reset js-only" data-act="reset" data-day="%s">Сбросить отметки</button></div>'
             % (tot, tot, E(next(x['title'] for x in PROGRAM if x['key'] == nxt)) if nxt else 'зал по расписанию',
                ' o' if hm else '', key, key))
    h.append('</form></div></section>')
    return ''.join(h)


def lib_card(e, g, dup):
    eid = e['id']
    pl = {'gym': ' pl-gym', 'home': ' pl-home', 'both': ' pl-gym pl-home'}[e['place']]
    plc = {'gym': '🏋️ зал', 'home': '🏠 дом', 'both': '🏋️ зал · 🏠 дом'}[e['place']]
    h = ['<article class="xc g-%s%s%s" data-id="%s">' % (g, pl, ' dup' if dup else '', eid)]
    h.append('<div class="media">%s<span class="plc">%s</span><span class="lvl l%d">%s</span>'
             '<a class="yt" href="%s" target="_blank" rel="noopener noreferrer">▶ Видео</a></div>'
             % (frames(eid), plc, e['lvl'], LVL[e['lvl']], E(yt(e['v']))))
    h.append('<div class="xb"><h4>%s</h4><div class="alt-n">%s · %s</div>' % (E(e['name']), E(e['en']), E(e['target'])))
    h.append('<div class="xmeta"><div class="sets1"><span>Подходы</span><b>%s</b></div><span class="gear">🎒 %s</span>'
             '<span class="inprog js-only" style="display:none">в программе</span></div>'
             % (T(lib_sets(e)), E(e['gear'])))
    h.append('<div class="notes"><div class="note tip">%s</div></div>' % T(e['tip']))
    if e['steps'] or e['err']:
        inner = ''
        if e['steps']:
            inner += '<ol class="steps">%s</ol>' % ''.join('<li>%s</li>' % T(s) for s in e['steps'])
        if e['err']:
            inner += '<div class="note err" style="margin-bottom:8px"><b>Ошибка новичка:</b> %s</div>' % T(e['err'])
        h.append('<details class="more"><summary>Техника по шагам</summary>%s</details>' % inner)
    h.append('</div></article>')
    return ''.join(h)


def screen_lib():
    h = ['<section class="scr scr-lib" aria-label="Упражнения"><div class="wrap">']
    h.append('<div class="ph v"><div class="ph-day">База упражнений</div><h2>Все упражнения</h2>'
             '<p>%d упражнений для зала и дома. Нажми на группу мышц — увидишь всё, что на неё работает. Анимация показывает обе фазы движения.</p></div>' % len(EX))
    h.append('<input type="radio" name="lp" id="lp-all" class="lib-rad" checked><input type="radio" name="lp" id="lp-gym" class="lib-rad"><input type="radio" name="lp" id="lp-home" class="lib-rad">')
    for g in [dict(id='all')] + GROUPS:
        h.append('<input type="radio" name="lg" id="lg-%s" class="lib-rad"%s>' % (g['id'], ' checked' if g['id'] == 'all' else ''))
    h.append('<div class="chips" id="libTop"><label class="c-all" for="lp-all">Все</label><label class="c-gym" for="lp-gym">🏋️ Зал</label><label class="c-home" for="lp-home">🏠 Дом</label></div>')
    h.append('<div class="grps">')
    css = []
    for g in GROUPS:
        cnt = sum(1 for e in EX.values() if g['id'] in e['grps'])
        h.append('<label class="grp" for="lg-%s" style="--gc:%s"><div class="grp-glow"></div><div class="grp-c">%d</div><div class="grp-ic">%s</div>'
                 '<div><div class="grp-n">%s</div><div class="grp-s">%s</div></div></label>'
                 % (g['id'], g['color'], cnt, g['icon'], E(g['name']), E(g['sub'])))
        css.append('#lg-%s:checked~.grps{display:none}#lg-%s:checked~.lg-head{display:block}'
                   '#lg-%s:checked~.xlist>:not(.g-%s){display:none}' % ((g['id'],) * 4))
    h.append('</div>')
    h.append('<div class="lg-head"><label class="lg-back" for="lg-all">← Все группы</label></div>')
    h.append('<div class="xlist">')
    for g in GROUPS:
        members = [e for e in EX.values() if g['id'] in e['grps']]
        h.append('<h3 class="gh g-%s"><i>%s</i>%s<span>%d</span></h3>' % (g['id'], g['icon'], E(g['name']), len(members)))
        members.sort(key=lambda e: (0 if e['grps'][0] == g['id'] else 1, PROG_ORDER.get(e['id'], 99), {'gym': 0, 'both': 1, 'home': 2}[e['place']], e['lvl']))
        for e in members:
            h.append(lib_card(e, g['id'], e['grps'][0] != g['id']))
    h.append('</div>')
    h.append('<p class="lib-note">Как собрать свою домашнюю тренировку: возьми 2–3 упражнения из группы, сделай по 3 подхода каждое, отдых 45–60 секунд. '
             'Для набора массы работай в 8–15 повторах — если делаешь больше 20 легко, усложняй вариант, а не добавляй повторы.</p>')
    h.append('</div></section>')
    lib_css = ''.join(css) + '#lg-all:checked~.xlist .dup{display:none}'
    return ''.join(h), lib_css


def screen_prog():
    h = ['<section class="scr scr-prog" aria-label="Прогресс"><div class="wrap">']
    h.append('<div class="ph g"><div class="ph-day">Дневник</div><h2>Прогресс</h2><p>Всё, что ты отмечаешь в тренировках, попадает сюда: история, рекорды, графики силы и веса тела.</p></div>')
    h.append('<div class="nojs-only infobox"><h4>Дневник выключен в режиме просмотра</h4>'
             'Встроенный просмотр iPhone не запускает программы внутри файла, поэтому сохранять историю здесь нельзя. '
             'Открой файл в браузере — инструкция во вкладке <label for="s-tips"><b><u>Советы</u></b></label>. Программа, упражнения, таймер и советы работают и так.</div>')
    h.append('<div class="js-only">')
    h.append('<div class="tiles" id="pTiles"></div>')
    h.append('<div class="tcard sec"><h3><i>⚖️</i> Вес тела</h3>'
             '<div class="qw"><input class="inp" id="bwProg" type="text" inputmode="decimal" autocomplete="off" placeholder="Вес сегодня, кг" aria-label="Вес тела, кг">'
             '<button class="btn sm" data-act="bwsave" data-src="prog">Записать</button></div>'
             '<div class="chart" id="bwChart"></div><div class="legend" id="bwLegend" style="display:none"><span><i class="lk-dot"></i>замеры</span><span><i class="lk-line"></i>среднее за 7 дней</span></div>'
             '<p class="small" id="bwMsg" style="margin-top:8px;color:var(--txt2);display:none"></p>'
             '<div class="list" id="bwList"></div></div>')
    h.append('<div class="tcard"><h3><i>🏋️</i> Сила по упражнениям</h3>'
             '<select class="inp" id="strSel" aria-label="Упражнение"></select>'
             '<div class="chart" id="strChart"></div><p class="small muted" id="strNote" style="margin-top:6px"></p>'
             '<div class="list" id="strTable"></div></div>')
    h.append('<div class="tcard"><h3><i>📅</i> История тренировок</h3><div id="histList"></div></div>')
    h.append('<div class="tcard"><h3><i>📏</i> Замеры тела</h3><p class="small muted" style="margin-bottom:10px">Раз в 2–4 недели, утром, сантиметровой лентой. Растут грудь и руки при той же талии — значит, растут мышцы.</p>'
             '<div class="form">'
             '<label class="fl"><span>Грудь, см</span><input class="inp" id="ms-chest" type="text" inputmode="decimal" autocomplete="off"></label>'
             '<label class="fl"><span>Талия, см</span><input class="inp" id="ms-waist" type="text" inputmode="decimal" autocomplete="off"></label>'
             '<label class="fl"><span>Бицепс, см</span><input class="inp" id="ms-arm" type="text" inputmode="decimal" autocomplete="off"></label>'
             '<label class="fl"><span>Бедро, см</span><input class="inp" id="ms-thigh" type="text" inputmode="decimal" autocomplete="off"></label>'
             '<button class="btn sm full" data-act="mssave">Сохранить замеры</button></div><div class="list" id="msList"></div></div>')
    h.append('<div class="tcard"><h3><i>⚙️</i> Настройки</h3>'
             '<label class="sw"><span>Таймер отдыха сам после подхода<small>Время отдыха берётся из программы</small></span><input type="checkbox" switch data-set="autoRest"></label>'
             '<label class="sw"><span>Звук в конце отдыха<small>Тихий сигнал поверх твоей музыки</small></span><input type="checkbox" switch data-set="sound"></label>'
             '<label class="sw"><span>Экран не гаснет во время тренировки</span><input type="checkbox" switch data-set="wake"></label>'
             '<label class="sw"><span>Вибро-отклик</span><input type="checkbox" switch data-set="haptic"></label>'
             '<div class="sw"><span>Старт программы<small id="startDate"></small></span><button class="btn sm ghost" data-act="setstart">Изменить</button></div></div>')
    h.append('<div class="tcard"><h3><i>💾</i> Данные</h3><p id="storeState" class="small" style="color:var(--txt2);margin-bottom:12px"></p>'
             '<div class="btnrow"><button class="btn sm ghost" data-act="export">⬆️ Экспорт</button><button class="btn sm ghost" data-act="import">⬇️ Импорт</button></div>'
             '<div class="btnrow" style="margin-top:8px"><button class="btn sm ghost" data-act="copy">📋 Копировать код</button><button class="btn sm ghost" data-act="paste">📥 Вставить код</button></div>'
             '<input type="file" id="impFile" accept=".json,application/json,text/plain" hidden>'
             '<button class="btn sm red wide" style="margin-top:14px" data-act="wipe">Удалить все данные</button></div>')
    h.append('</div>')
    h.append(footer())
    h.append('</div></section>')
    return ''.join(h)


def macro(code, grams):
    name, kcal, p, f, c = FOOD[code]
    k = grams / 100.0
    return kcal * k, p * k, f * k, c * k


def screen_food():
    # статичный расчёт для 188/80/20 лет
    age, hgt, wgt, act, pace = 20, 188, 80, 1.55, 0.12
    bmr = 10 * wgt + 6.25 * hgt - 5 * age + 5
    tdee = bmr * act
    kcal = int(round(tdee * (1 + pace) / 50.0) * 50)
    prot, fat = wgt * 2, wgt * 1
    carb = int(round((kcal - prot * 4 - fat * 9) / 4.0))
    h = ['<section class="scr scr-food" aria-label="Питание"><div class="wrap">']
    h.append('<div class="ph o"><div class="ph-day">Питание на массу</div><h2>Ешь, чтобы расти</h2>'
             '<p>Тренировка даёт сигнал «расти», а строить мышцы организм может только из еды. Без лишних калорий массы не будет — при росте 188&nbsp;см это главная причина «не растёт».</p></div>')
    h.append('<div class="big o"><h3>Твоя норма в день</h3><div class="kcal"><b id="fKcal">%s</b><span>ккал</span></div>'
             '<div class="macros">'
             '<div class="mac"><span>Белки</span><b id="fP">%d г</b><small id="fPk">%d%% ккал</small><i><u style="width:%d%%;background:#4fb8ff"></u></i></div>'
             '<div class="mac"><span>Жиры</span><b id="fF">%d г</b><small id="fFk">%d%% ккал</small><i><u style="width:%d%%;background:#ffd15c"></u></i></div>'
             '<div class="mac"><span>Углеводы</span><b id="fC">%d г</b><small id="fCk">%d%% ккал</small><i><u style="width:%d%%;background:#9dff6b"></u></i></div>'
             '</div><p class="small" style="margin-top:12px;color:var(--txt2)" id="fBasis">Рост 188&nbsp;см · вес 80&nbsp;кг · возраст 20 · расход ≈&nbsp;%s&nbsp;ккал + 12%% на рост</p>'
             '<p class="small" style="margin-top:6px;color:var(--txt2)">Вода: ~<b id="fWater">%s</b>&nbsp;л в день. Белок — около 2&nbsp;г на кг веса.</p></div>'
             % (fbig(kcal), prot, round(prot * 4 / kcal * 100), round(prot * 4 / kcal * 100) * 2, fat, round(fat * 9 / kcal * 100), round(fat * 9 / kcal * 100) * 2,
                carb, round(carb * 4 / kcal * 100), round(carb * 4 / kcal * 100), fbig(round(tdee / 10) * 10), fnum(round(wgt * 0.037, 1))))
    h.append('<div class="tcard js-only"><h3><i>🧮</i> Пересчитать под себя</h3><div class="form">'
             '<label class="fl"><span>Возраст</span><input class="inp" id="pfAge" type="text" inputmode="numeric" data-prof autocomplete="off"></label>'
             '<label class="fl"><span>Рост, см</span><input class="inp" id="pfH" type="text" inputmode="numeric" data-prof autocomplete="off"></label>'
             '<label class="fl"><span>Вес, кг</span><input class="inp" id="pfW" type="text" inputmode="decimal" data-prof autocomplete="off"></label>'
             '<label class="fl"><span>Активность</span><select class="inp" id="pfAct" data-prof><option value="1.45">Учёба/офис + 3 зала</option><option value="1.55">3 зала + 2 дома</option><option value="1.7">Много хожу/работа на ногах</option></select></label>'
             '<label class="fl full"><span>Темп набора</span><select class="inp" id="pfPace" data-prof><option value="0.08">Плавный: +0,2 кг/нед (меньше жира)</option><option value="0.12">Обычный: +0,3–0,4 кг/нед</option><option value="0.17">Быстрый: +0,5 кг/нед (если вес стоит)</option></select></label>'
             '</div><p class="small muted" style="margin-top:10px">Формула Миффлина—Сан Жеора × активность + запас на рост мышц. Расход — <b id="fTdee" style="color:#fff">—</b> ккал.</p></div>')
    h.append('<div class="tcard o"><h3><i>📐</i> 5 правил набора</h3><ul>'
             '<li><b>Ешь 4–5 раз в день.</b> Съесть 3000+&nbsp;ккал за три приёма тяжело — дели на завтрак, обед, ужин и 2 перекуса.</li>'
             '<li><b>Белок в каждом приёме:</b> яйца, творог, мясо, рыба, молоко.</li>'
             '<li><b>Взвешивайся 2–3 раза в неделю</b> утром натощак и смотри на среднее. Цель — +0,25–0,5&nbsp;кг в неделю.</li>'
             '<li><b>Вес стоит 2 недели</b> — добавь 200–300&nbsp;ккал (стакан молока + банан). Растёт быстрее 0,7&nbsp;кг/нед — убавь 200.</li>'
             '<li><b>Жидкие калории спасают</b>, если наелся: молоко, кефир, домашний гейнер.</li></ul></div>')
    # меню
    h.append('<div class="sec-h sec"><h2>Пример дня</h2><span class="lnk">≈ норма</span></div>')
    tot = [0, 0, 0, 0]
    for m in MENU:
        mk = [0, 0, 0, 0]
        lis = []
        for code, g, label in m['items']:
            vals = macro(code, g)
            for k in range(4):
                mk[k] += vals[k]
            lis.append('<li><span>%s</span><span>%s</span></li>' % (E(FOOD[code][0]), T(label)))
        for k in range(4):
            tot[k] += mk[k]
        h.append('<div class="meal"><div class="meal-h"><small>%s</small><h4>%s</h4><b>%d&nbsp;ккал</b></div><ul>%s</ul>'
                 '<p class="small muted" style="margin-top:6px">белок %d&nbsp;г · жиры %d&nbsp;г · углеводы %d&nbsp;г</p></div>'
                 % (m['time'], E(m['t']), round(mk[0] / 10) * 10, ''.join(lis), round(mk[1]), round(mk[2]), round(mk[3])))
    h.append('<div class="tbl o" style="margin:4px 0 14px"><div class="tr tot"><span>Итого за день</span><b>%s&nbsp;ккал</b></div>'
             '<div class="tr"><span>Белки · жиры · углеводы</span><b>%d · %d · %d&nbsp;г</b></div></div>'
             % (fbig(round(tot[0] / 10) * 10), round(tot[1]), round(tot[2]), round(tot[3])))
    MENU_TOTALS.update(kcal=tot[0], p=tot[1], f=tot[2], c=tot[3])
    # гейнер
    gk = [0, 0, 0, 0]
    for code, g, label in GAINER:
        v = macro(code, g)
        for k in range(4):
            gk[k] += v[k]
    h.append('<div class="tcard o"><h3><i>🥤</i> Домашний гейнер за 2 минуты</h3><p>Блендер: %s. '
             'Получается ≈ <b>%d&nbsp;ккал и %d&nbsp;г белка</b> — дешевле и полезнее магазинного. Пей между приёмами пищи или после тренировки, если не добираешь калории.</p></div>'
             % (E(', '.join(x[2] for x in GAINER)), round(gk[0] / 10) * 10, round(gk[1])))
    # дешёвый белок
    h.append('<div class="tcard"><h3><i>🛒</i> Дешёвые продукты для массы</h3><div class="tbl o"><div class="tr h"><span>Продукт</span><b>Белок на 100&nbsp;г</b></div>')
    for name, p, note in CHEAP:
        h.append('<div class="tr"><span><b style="color:#fff;font:600 13px Inter,sans-serif">%s</b><br><small>%s</small></span><b>%s</b></div>' % (E(name), E(note), T(p)))
    h.append('</div></div>')
    # добавки
    h.append('<div class="tcard"><h3><i>💊</i> Добавки: что реально работает</h3><ul>'
             '<li><b>Креатин моногидрат</b> — 3–5&nbsp;г в день, каждый день, в любое время. Самая изученная добавка: +сила и +масса. Без «загрузки», запивай водой.</li>'
             '<li><b>Протеин</b> — это просто белок в порошке. Нужен, только если не добираешь норму едой.</li>'
             '<li><b>Витамин D</b> — зимой в России его не хватает почти всем; дозу лучше подобрать по анализу.</li>'
             '<li><b>Не нужно:</b> жиросжигатели, «бустеры тестостерона», BCAA при нормальном белке. И никаких гормонов.</li></ul>'
             '<p class="small muted" style="margin-top:10px">Если тебе нет 18 или есть проблемы со здоровьем — любые добавки сначала обсуди с врачом.</p></div>')
    # чек-лист дня
    h.append('<div class="tcard"><h3><i>✅</i> Чек-лист дня</h3><p class="small muted" style="margin-bottom:4px">Отмечай каждый день — 7 дней внизу покажут, насколько ты стабилен.</p>')
    items = [('kcal', '<span id="ckKcalLbl">Калории ≈ %s</span>' % fbig(kcal), 'по меню или чуть больше'),
             ('prot', '<span id="ckProtLbl">Белок ≥ %d г</span>' % prot, 'в каждом приёме пищи'),
             ('meals', '4–5 приёмов пищи', 'включая перекусы'),
             ('water', 'Вода 2,5–3 л', 'чай и вода считаются'),
             ('creat', 'Креатин 5 г', 'если принимаешь'),
             ('sleep', 'Сон 8 часов', 'лёг до полуночи')]
    for k, t, sub in items:
        h.append('<label class="ck"><input type="checkbox" switch data-food="%s"><span class="bx"></span><span>%s<small>%s</small></span></label>' % (k, t, E(sub)))
    h.append('<div class="dots7 js-only" id="foodDots"></div></div>')
    h.append(footer())
    h.append('</div></section>')
    return ''.join(h)


MENU_TOTALS = {}


def fbig(n):
    n = int(round(n))
    return '{:,}'.format(n).replace(',', '\u202f')


def screen_tips():
    h = ['<section class="scr scr-tips" aria-label="Советы"><div class="wrap">']
    h.append('<div class="ph b"><div class="ph-day">Механика роста</div><h2>Советы, без которых<br>ничего не вырастет</h2>'
             '<p>Прочитай один раз перед первой тренировкой и возвращайся через месяц.</p></div>')
    h.append('<div class="big"><h3>🔑 Главное правило — прогрессия</h3>'
             '<p>Мышцы растут не от «походить в зал», а от того, что нагрузка <b>постоянно растёт</b>. Правило простое:</p>'
             '<p>Сделал <code>все подходы</code> на <code>верхнее число повторов</code> с чистой техникой → на следующей тренировке добавь <code>+2,5&nbsp;кг</code> (на гантелях — следующая пара).</p>'
             '<p>Не сделал — оставляешь вес и добиваешь. Это единственный «секрет» на первый год. <span class="js-only">Приложение считает это само и пишет подсказку в каждом упражнении.</span></p></div>')
    h.append('<div class="tcard"><h3><i>📈</i> Как это выглядит на деле</h3><p>Жим лёжа, схема 4 × 8–10:</p><div class="tbl">'
             '<div class="tr h"><span>Тренировка</span><b>Подходы</b></div>'
             '<div class="tr"><span>1-я, 30 кг</span><b>10 · 9 · 8 · 8</b></div>'
             '<div class="tr"><span>2-я, 30 кг</span><b>10 · 10 · 9 · 8</b></div>'
             '<div class="tr"><span>3-я, 30 кг</span><b>10 · 10 · 10 · 10 ✅</b></div>'
             '<div class="tr"><span>4-я, 32,5 кг</span><b>9 · 8 · 8 · 8</b></div></div>'
             '<p style="margin-top:11px">На новом весе повторов снова меньше — и цикл повторяется. Это называется <b>двойная прогрессия</b>: сначала растут повторы, потом вес.</p></div>')
    h.append('<div class="tcard"><h3><i>📓</i> Записывай каждую тренировку</h3><p>Отмечай подходы прямо здесь — вес и повторы. Важно, что ты приходишь и знаешь: в прошлый раз было 35&nbsp;кг × 9. Без записей прогрессии не будет, память врёт.</p></div>')
    h.append('<div class="tcard"><h3><i>⏱️</i> Сколько отдыхать между подходами</h3><div class="tbl">'
             '<div class="tr h"><span>Упражнение</span><b>Отдых</b></div>'
             '<div class="tr"><span>База: жим, приседания, тяги</span><b>2–3 мин</b></div>'
             '<div class="tr"><span>Тренажёры, средние мышцы</span><b>90 сек</b></div>'
             '<div class="tr"><span>Руки, плечи, пресс</span><b>60 сек</b></div></div>'
             '<p style="margin-top:11px">Внизу экрана тренировки — таймер. <span class="js-only">После отметки подхода он запускается сам с нужным временем.</span> Не сокращай отдых, чтобы «быстрее закончить»: недовосстановился → меньше вес → меньше роста.</p></div>')
    h.append('<div class="tcard"><h3><i>🎯</i> Как подобрать рабочий вес</h3><ul>'
             '<li>Первые <b>2 недели</b> — вес заведомо лёгкий. Задача не устать, а выучить движение. Серьёзно.</li>'
             '<li>Правильный вес — тот, с которым <b>последние 2 повтора даются тяжело</b>, но техника не ломается.</li>'
             '<li>Если сделал больше верхней границы повторов — вес мал, добавляй.</li>'
             '<li>Если не добиваешь нижнюю границу — вес велик, снимай.</li>'
             '<li>Веса в программе — <b>ориентир для новичка 80&nbsp;кг</b>. Твои могут быть выше или ниже, это нормально.</li></ul></div>')
    h.append('<div class="tcard"><h3><i>🔥</i> Разминочные подходы</h3><p>Перед жимом и приседаниями — <b>не сразу рабочий вес</b>. Пустой гриф × 10–15, потом 1–2 подхода по 3–5 повторов с промежуточным весом. Это не утомляет, а наоборот — рабочие подходы пойдут легче, а суставы скажут спасибо.</p></div>')
    h.append('<div class="tcard"><h3><i>📏</i> Техника: 3 вещи, которые важнее веса</h3><ul>'
             '<li><b>Опускай медленно</b> (2–3 секунды), поднимай мощно. Мышца растёт в основном на опускании.</li>'
             '<li><b>Полная амплитуда.</b> Половинчатые повторы с большим весом — минус результат и плюс травма.</li>'
             '<li><b>Не задерживай дыхание.</b> Выдох на усилии, вдох на опускании.</li></ul></div>')
    h.append('<div class="tcard"><h3><i>💯</i> Запас повторов</h3><p>Каждый подход заканчивай, когда в запасе остаётся <b>1–2 повтора</b>: «ещё пару смог бы, но с трудом». '
             'До полного отказа — только в последнем подходе упражнений на тренажёрах, и то не каждый раз. Отказ в базовых упражнениях = риск травмы и долгое восстановление.</p></div>')
    h.append('<div class="tcard"><h3><i>😴</i> Растёшь во сне, а не в зале</h3><ul>'
             '<li><b>7–9 часов сна.</b> Это не совет для галочки: недосып напрямую рубит рост мышц и силу.</li>'
             '<li><b>Минимум один полный день отдыха</b> между тренировками зала. Мышца растёт 24–72 часа после нагрузки.</li>'
             '<li>Болит 1–2 дня — норма. Болит 4+ дня или болит сустав — ты перегнул, снижай вес.</li></ul></div>')
    h.append('<div class="tcard no"><h3><i>🚫</i> Чего НЕ делать в первые 3 месяца</h3><ul>'
             '<li><b>Не гонись за весом</b> перед друзьями. Ты играешь в долгую — рекорды через год.</li>'
             '<li><b>Не меняй программу каждую неделю.</b> Одна программа минимум 8–10 недель, иначе не увидишь прогресса.</li>'
             '<li><b>Не добавляй 5 упражнений «на бицепс»</b> — руки растут от тяг и жимов больше, чем от сгибаний.</li>'
             '<li><b>Не тренируйся до отказа каждый подход.</b> Оставляй 1–2 повтора в запасе.</li>'
             '<li><b>Не пропускай ноги.</b> Знаю, что хочется. Ноги — самая большая мышечная группа и главный драйвер общего роста.</li>'
             '<li><b>Не жди результата в зеркале за 2 недели.</b> Первые видимые изменения — 6–8 недель. Сила придёт раньше.</li></ul></div>')
    h.append('<div class="tcard"><h3><i>🧱</i> Застой: вес не растёт</h3><ul>'
             '<li>Сначала проверь <b>сон и еду</b> — в 9 случаях из 10 дело в них.</li>'
             '<li>Нет роста <b>3 тренировки подряд</b> — сбрось вес на 10% и набери заново. Это не шаг назад, это разбег.</li>'
             '<li>Устал от всего, всё тяжело — нужна <b>лёгкая неделя</b>: те же упражнения, но −40% веса. Через неделю силы вернутся с запасом.</li></ul></div>')
    h.append('<div class="tcard no"><h3><i>🩹</i> Боль: где норма, а где стоп</h3><ul>'
             '<li><b>Норма:</b> тянущая боль в мышцах через 1–2 дня после тренировки (крепатура).</li>'
             '<li><b>Стоп:</b> резкая или простреливающая боль во время движения, боль в суставе, онемение, щелчок с болью. Прекрати упражнение.</li>'
             '<li>Если боль в суставе или спине держится дольше недели — покажись врачу. Тренироваться «через боль» нельзя.</li></ul></div>')
    h.append('<div class="tcard"><h3><i>🔄</i> Пропустил тренировку</h3><p>Ничего страшного. Не нужно делать две за день и не нужно «начинать сначала». Просто сделай <b>следующую по очереди</b>: была Грудь — дальше Ноги. <span class="js-only">На главной экране приложение само покажет, какая следующая.</span></p></div>')
    h.append('<div class="tcard"><h3><i>📈</i> Чего ожидать по срокам</h3><div class="tbl">'
             '<div class="tr h"><span>Период</span><b>Что будет</b></div>'
             '<div class="tr"><span>Недели 1–2</span><b>Учишь технику</b></div>'
             '<div class="tr"><span>Недели 3–6</span><b>Резкий рост силы</b></div>'
             '<div class="tr"><span>Недели 6–12</span><b>Видно в зеркале</b></div>'
             '<div class="tr"><span>3–6 месяцев</span><b>Видно в одежде</b></div></div>'
             '<p style="margin-top:11px">При росте 188&nbsp;см ты «раскидываешь» массу по длинному телу — визуально набор идёт медленнее, чем у невысоких. Это не ты плохо тренируешься, это геометрия. Просто не сдавайся раньше 6 месяцев.</p></div>')
    h.append('<div class="tcard"><h3><i>🤝</i> Первый день в зале</h3><ul>'
             '<li>Подойди к тренеру на смене и попроси показать <b>жим лёжа, приседания и тягу верхнего блока</b>. Это бесплатно почти везде и экономит месяцы.</li>'
             '<li>В жиме лёжа с большим весом — <b>всегда проси подстраховать</b>.</li>'
             '<li>Незнакомый тренажёр: посмотри картинку на его корпусе, поставь маленький вес, сделай 1 пробный подход.</li>'
             '<li>Не стесняйся. Всем в зале абсолютно всё равно, кто сколько жмёт.</li></ul></div>')
    h.append('<div class="tcard"><h3><i>❓</i> Частые вопросы</h3><ul>'
             '<li><b>Можно тренироваться чаще?</b> Первые 3 месяца — нет смысла. 3 зала + 2 лёгких дома — уже много для новичка.</li>'
             '<li><b>Нужно ли кардио?</b> 1–2 раза в неделю по 20 минут быстрой ходьбы или велосипеда полезно для сердца. Только не перед тренировкой ног.</li>'
             '<li><b>Футбол, бег, бокс?</b> Можно, но всё это тратит калории — ешь больше.</li>'
             '<li><b>Что после 12 недель?</b> Если веса растут — продолжай. Если застрял надолго — переходи на сплит «верх/низ» 4 раза в неделю.</li></ul></div>')
    h.append('<div class="tcard" id="howto"><h3><i>📲</i> Как пользоваться на iPhone</h3>'
             '<p><b>1. Просто открыть файл</b> (из «Файлов», почты или Google Диска). iPhone покажет его во встроенном просмотре: вкладки, анимации упражнений, '
             'галочки подходов и таймер работают, но отметки не сохраняются после закрытия, а дневник и графики выключены.</p>'
             '<p><b>2. Полная версия с дневником.</b> Нужен браузер, который запускает программы внутри файла. Самый надёжный путь — открыть ту же программу '
             '<b>как сайт в Safari</b> и добавить на экран «Домой» («Поделиться» → «На экран „Домой“»): появится иконка, всё работает без интернета, данные хранятся на телефоне.</p>'
             '<p><b>3. Резервная копия.</b> В полной версии во вкладке «Прогресс» есть «Экспорт» — раз в пару недель сохраняй файл копии в «Файлы» или на Диск.</p>'
             '<p class="small muted js-only" style="margin-top:8px">Сейчас программа работает в полном режиме ✅</p></div>')
    h.append('<div class="tcard"><h3><i>ℹ️</i> Источники</h3><p class="small">Фото упражнений — открытая база '
             '<b>free-exercise-db</b> (общественное достояние, Unlicense). Иллюстрации «Птица-собака» и «Планка с касанием плеч» — '
             '<b>wger.de</b> (CC BY-SA 4.0, авторы utkb и clafal). Расчёт калорий — формула Миффлина—Сан Жеора. '
             'Видео-кнопки ведут на поиск YouTube и требуют интернет.</p></div>')
    h.append(footer())
    h.append('</div></section>')
    return ''.join(h)


def daybar():
    h = ['<header class="daybar"><nav class="seg" aria-label="Тренировки">']
    for d in PROGRAM:
        top = {'d1': 'Пн', 'd2': 'Ср', 'd3': 'Пт', 'home': 'Вт·Чт'}[d['key']]
        h.append('<label class="sg-%s" for="s-%s"><small>%s<span class="dn"> ✓</span></small>%s</label>' % (d['key'], d['key'], top, E(d['short'])))
    h.append('</nav></header>')
    return ''.join(h)


def dock():
    pre = ''.join('<label class="tb pre t%d" for="r-%d" data-s="%d">%s</label>' % (s, s, s, lbl)
                  for s, lbl in ((60, '60'), (90, '90'), (120, '2:00'), (180, '3:00')))
    adj = ('<button type="button" class="tb adj" data-adj="-15">−15</button>'
           '<button type="button" class="tb adj" data-adj="15">+15</button>'
           '<button type="button" class="tb adj" data-adj="30">+30</button>')
    cds = ''.join('<span class="cd cd%d"></span><span class="go go%d">ГО!</span>' % (s, s) for s in (60, 90, 120, 180))
    return ('<div class="dock" id="dock" role="timer" aria-live="polite"><div class="dock-in"><div class="tcol">'
            '<div class="tdisp" id="tDisp"><span class="cd-idle">0:00</span>%s</div>'
            '<div class="tlbl" id="tLbl">отдых</div><div class="dsets nojs-only" style="display:none"></div></div>'
            '<div class="tbtns">%s%s<label class="tb st" for="r-off" aria-label="Остановить таймер">✕</label></div></div>'
            '<div class="tbar"><i id="tBar"></i></div></div>' % (cds, pre, adj))


def tabbar():
    items = [('today', 's-today', 'Сегодня'), ('train', 's-d1', 'Тренировки'), ('lib', 's-lib', 'Упражнения'),
             ('prog', 's-prog', 'Прогресс'), ('food', 's-food', 'Питание')]
    return ('<nav class="tabbar" aria-label="Разделы"><div class="tabbar-in">%s</div></nav>'
            % ''.join('<label class="t-%s" for="%s">%s<span>%s</span></label>' % (k, f, svg(k), E(t)) for k, f, t in items))


def app_data():
    ex = {}
    for eid, e in EX.items():
        rp = parse_reps(e['s'].split('×', 1)[1].strip()) if e['s'] and '×' in e['s'] else dict(lo=None, hi=None, unit='reps', side=False)
        ex[eid] = dict(n=e['name'], en=e['en'], t=e['target'], tip=nb(e['tip']), err=nb(e['err']) if e['err'] else None,
                       steps=[nb(s) for s in e['steps']], v=e['v'], kind=e['kind'], inc=e['inc'] or None, harder=e['harder'],
                       img=['im-%s-%d' % (eid, k) for k in range(len(MANIFEST[eid]))],
                       lo=rp['lo'], hi=rp['hi'], unit=('sec' if e['kind'] == 'time' else rp['unit']),
                       side=eid in SIDE_IDS, pair=eid in PAIR_IDS)
    days = {}
    for d in PROGRAM:
        exs = []
        for p in d['ex']:
            rp = parse_reps(p['r'])
            wp = parse_w(p['w'])
            exs.append(dict(id=p['id'], s=p['s'], r=nb(p['r']), w=nb(p['w']), lo=rp['lo'], hi=rp['hi'], unit=rp['unit'], side=rp['side'],
                            w0=wp['w0'], pair=wp['pair'], bw=wp['bw'], rest=p['rest']))
        days[d['key']] = dict(title=d['title'], short=d['short'], day=d['day'],
                              dayLabel={'d1': 'День 1', 'd2': 'День 2', 'd3': 'День 3', 'home': 'Дом'}[d['key']], ex=exs)
    return dict(v=VERSION, ex=ex, days=days, sched={str(k): v for k, v in SCHEDULE.items()}, tips=[nb(t) for t in TIP_OF_DAY])


def font_css():
    cyr = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116'
    lat = ('U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, '
           'U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD')
    out = []
    for fam, wr, fn, ur in (('Inter', '100 900', 'inter-cyr.woff2', cyr), ('Inter', '100 900', 'inter-lat.woff2', lat),
                            ('Oswald', '400 700', 'oswald-cyr.woff2', cyr), ('Oswald', '400 700', 'oswald-lat.woff2', lat)):
        out.append("@font-face{font-family:'%s';font-style:normal;font-weight:%s;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2');unicode-range:%s}"
                   % (fam, wr, b64(os.path.join(FONTS, fn)), ur))
    return ''.join(out)


def img_css():
    out = []
    for eid, files in MANIFEST.items():
        if eid.startswith('_'):
            continue
        for k, fn in enumerate(files):
            out.append('.im-%s-%d{background-image:url(data:image/webp;base64,%s)}' % (eid, k, b64(os.path.join(ASSETS, 'img', fn))))
    out.append('.hero-img{background-image:url(data:image/webp;base64,%s)}' % b64(os.path.join(ASSETS, 'img', MANIFEST['_hero'][0])))
    return '\n'.join(out)


def build(variant):
    icon = b64(os.path.join(ASSETS, 'icon-180.png'))
    css = open(os.path.join(SRC, 'style.css'), encoding='utf-8').read()
    js = open(os.path.join(SRC, 'app.js'), encoding='utf-8').read()
    lib_html, lib_css = screen_lib()
    radios = ''.join('<input class="rad" type="radio" name="scr" id="s-%s"%s>' % (s, ' checked' if s == 'today' else '')
                     for s in ('today', 'd1', 'd2', 'd3', 'home', 'lib', 'prog', 'food', 'tips'))
    radios += ''.join('<input class="rad" type="radio" name="rest" id="r-%s"%s>' % (s, ' checked' if s == 'off' else '')
                      for s in ('off', '60', '90', '120', '180'))
    body = [radios, '<div class="sbar"></div>', screen_today()]
    for d in PROGRAM:
        body.append(screen_day(d))
    body += [lib_html, screen_prog(), screen_food(), screen_tips(), daybar(), dock(), tabbar(),
             '<div class="sheet" id="sheet" role="dialog" aria-modal="true"><div class="sheet-bg" id="sheetBg"></div><div class="sheet-in" id="sheetIn"></div></div>',
             '<div class="toast" id="toast" role="status" aria-live="polite"></div>']
    data = json.dumps(app_data(), ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    head = ('<!DOCTYPE html>\n<html lang="ru" class="nojs">\n<head>\n<meta charset="UTF-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<meta name="theme-color" content="#0a0c0f">\n<meta name="color-scheme" content="dark">\n'
            '<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n'
            '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
            '<meta name="apple-mobile-web-app-title" content="МАССА">\n<meta name="format-detection" content="telephone=no">\n'
            '<meta name="description" content="МАССА — программа тренировок на массу 188/80: зал 3 раза + дом 2 раза, дневник, таймер, питание.">\n'
            + ('<meta name="massa-pwa" content="1">\n<link rel="manifest" href="manifest.webmanifest">\n' if variant == 'site' else '') +
            '<link rel="apple-touch-icon" href="data:image/png;base64,%s">\n<link rel="icon" type="image/png" href="data:image/png;base64,%s">\n'
            '<title>МАССА — программа тренировок 188/80</title>\n'
            '<script>document.documentElement.className="js"</script>\n'
            '<style>%s</style>\n<style>%s\n%s</style>\n<style>%s</style>\n</head>\n'
            % (icon, icon, font_css(), css, lib_css, img_css()))
    html_out = head + '<body>\n' + '\n'.join(body) + '\n<script type="application/json" id="app-data">' + data + '</script>\n<script>\n' + js + '\n</script>\n</body>\n</html>\n'
    return html_out


if __name__ == '__main__':
    import shutil
    out_dir = sys.argv[1] if len(sys.argv) > 1 else OUT
    os.makedirs(out_dir, exist_ok=True)
    # file — один самодостаточный файл для iPhone; site — то же для GitHub Pages (+ офлайн-кэш)
    for variant, name in (('file', 'MASSA_188x80.html'), ('site', 'index.html')):
        s = build(variant)
        with open(os.path.join(out_dir, name), 'w', encoding='utf-8') as f:
            f.write(s)
        print(name, round(len(s.encode('utf-8')) / 1024), 'KB')
    for fn in ('sw.js', 'manifest.webmanifest'):
        shutil.copy(os.path.join(SRC, fn), os.path.join(out_dir, fn))
    for fn in ('icon-180.png', 'icon-192.png', 'icon-512.png'):
        shutil.copy(os.path.join(ASSETS, fn), os.path.join(out_dir, fn))
    print('menu totals', {k: round(v) for k, v in MENU_TOTALS.items()})
