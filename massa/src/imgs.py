# -*- coding: utf-8 -*-
"""Готовит кадры упражнений: обрезка 16:10, 640×400, WebP. Пишет build/img/*.webp и manifest."""
import json
import os
import sys

from PIL import Image, ImageOps

sys.path.insert(0, os.path.dirname(__file__))
from data import EX  # noqa: E402

# Исходники (нужны только для пересборки кадров): папка с загрузками задаётся MASSA_DL.
#   $MASSA_DL/fedb/img/<id>/0.jpg|1.jpg — github.com/yuhonas/free-exercise-db (Unlicense)
#   $MASSA_DL/wger/img/taps.jpg, birddog.png — wger.de (CC BY-SA 4.0)
#   $MASSA_DL/orig/ — фото из первой версии программы (отжимания щучкой, присед у стены, обложка)
SRC = os.path.dirname(os.path.abspath(__file__))
DL = os.environ.get('MASSA_DL', os.path.join(SRC, 'dl'))
FEDB = os.path.join(DL, 'fedb', 'img')
WGER = os.path.join(DL, 'wger', 'img')
ORIG = os.path.join(DL, 'orig')
ASSETS = os.path.join(SRC, 'assets')
OUT = os.path.join(ASSETS, 'img')
W, H = 640, 400
Q = 58

ORIG_FILES = {'pike': '43_c166331f.jpg', 'wall': '57_87626674.jpg', 'hero': '02_183a39d8.jpg'}


def flatten(im, bg=(255, 255, 255)):
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        base = Image.new('RGBA', im.size, bg + (255,))
        base.alpha_composite(im)
        return base.convert('RGB')
    return im.convert('RGB')


def crop_box(im, box):
    w, h = im.size
    x0, y0, x1, y1 = box
    return im.crop((round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h)))


def fit_1610(im, pad=None):
    """Центр-кроп до 16:10 (или паддинг цветом pad)."""
    w, h = im.size
    target = 16 / 10
    if pad is not None:
        if w / h > target:
            nh = round(w / target)
            canvas = Image.new('RGB', (w, nh), pad)
            canvas.paste(im, (0, (nh - h) // 2))
        else:
            nw = round(h * target)
            canvas = Image.new('RGB', (nw, h), pad)
            canvas.paste(im, ((nw - w) // 2, 0))
        im = canvas
    else:
        if w / h > target:
            nw = round(h * target)
            x = (w - nw) // 2
            im = im.crop((x, 0, x + nw, h))
        else:
            nh = round(w / target)
            y = (h - nh) // 2
            im = im.crop((0, y, w, y + nh))
    return im.resize((W, H), Image.LANCZOS)


def save(im, name, q=Q):
    path = os.path.join(OUT, name + '.webp')
    im.save(path, 'WEBP', quality=q, method=6)
    return path


def frames_for(e):
    kind, key = e['img'][0], e['img'][1]
    opt = e['img'][2] if len(e['img']) > 2 else {}
    out = []
    if kind == 'fedb':
        order = opt.get('order', (0, 1))
        frames = opt.get('frames')
        idx = list(frames) if frames else list(order)
        for i in idx:
            im = flatten(Image.open(os.path.join(FEDB, key, '%d.jpg' % i)))
            if 'crop' in opt:
                im = crop_box(im, opt['crop'])
            out.append(fit_1610(im))
    elif kind == 'wger' and key == 'taps':
        im = flatten(Image.open(os.path.join(WGER, 'taps.jpg')))
        w, h = im.size
        top = im.crop((0, 0, w, h // 2))
        bot = im.crop((0, h // 2, w, h))
        for part in (top, bot):
            out.append(fit_1610(part, pad=(255, 255, 255)))
    elif kind == 'wger' and key == 'birddog':
        im = flatten(Image.open(os.path.join(WGER, 'birddog.png')))
        # поля по краям лишние — подрежем, затем 16:10
        im = ImageOps.crop(im, border=0)
        out.append(fit_1610(im, pad=(255, 255, 255)))
    elif kind == 'orig':
        im = flatten(Image.open(os.path.join(ORIG, ORIG_FILES[key])))
        out.append(fit_1610(im))
    else:
        raise ValueError(e['img'])
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    total = 0
    for eid, e in EX.items():
        frames = frames_for(e)
        files = []
        for k, im in enumerate(frames):
            p = save(im, '%s_%d' % (eid, k))
            total += os.path.getsize(p)
            files.append(os.path.basename(p))
        manifest[eid] = files
    # hero
    hero = flatten(Image.open(os.path.join(ORIG, ORIG_FILES['hero'])))
    hero = hero.resize((960, 540), Image.LANCZOS)
    p = save(hero, 'hero', q=52)
    total += os.path.getsize(p)
    manifest['_hero'] = [os.path.basename(p)]
    with open(os.path.join(ASSETS, 'img_manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print('exercises:', len(EX), 'frames:', sum(len(v) for k, v in manifest.items() if k[0] != '_'),
          'total KB:', round(total / 1024))


if __name__ == '__main__':
    main()
