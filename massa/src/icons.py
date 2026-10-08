# -*- coding: utf-8 -*-
"""Иконка приложения: гантель + надпись МАССА на тёмном фоне."""
import io
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SRC = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(SRC, 'assets')
OUT = ASSETS
VOLT = (211, 255, 79)


def oswald():
    """Oswald (кириллица) из woff2 → TTF в памяти; нужен fontTools + brotli."""
    from fontTools.ttLib import TTFont
    f = TTFont(os.path.join(ASSETS, 'fonts', 'oswald-cyr.woff2'))
    f.flavor = None
    buf = io.BytesIO()
    f.save(buf)
    buf.seek(0)
    return buf


def make(size):
    S = size * 4  # суперсэмплинг
    im = Image.new('RGB', (S, S), (8, 10, 13))
    # мягкое свечение сверху
    glow = Image.new('L', (S, S), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-S * 0.25, -S * 0.55, S * 1.25, S * 0.75), fill=120)
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.12))
    tint = Image.new('RGB', (S, S), (30, 40, 52))
    im = Image.composite(tint, im, glow)
    d = ImageDraw.Draw(im)
    cy = S * 0.40
    # гриф
    bw, bh = S * 0.60, S * 0.052
    d.rounded_rectangle((S / 2 - bw / 2, cy - bh / 2, S / 2 + bw / 2, cy + bh / 2), radius=bh / 2, fill=VOLT)
    # блины
    for side in (-1, 1):
        for (off, w, h) in ((0.205, 0.085, 0.36), (0.30, 0.07, 0.26)):
            x = S / 2 + side * S * off
            d.rounded_rectangle((x - S * w / 2, cy - S * h / 2, x + S * w / 2, cy + S * h / 2), radius=S * 0.022, fill=VOLT)
    # надпись
    font = ImageFont.truetype(oswald(), int(S * 0.19))
    try:
        font.set_variation_by_axes([600])
    except Exception:
        pass
    txt = 'МАССА'
    tw = d.textlength(txt, font=font)
    d.text(((S - tw) / 2, S * 0.635), txt, font=font, fill=(238, 242, 246))
    return im.resize((size, size), Image.LANCZOS)


def main():
    for s in (180, 192, 512):
        make(s).save(os.path.join(OUT, 'icon-%d.png' % s), optimize=True)
    print('icons ok')


if __name__ == '__main__':
    main()
