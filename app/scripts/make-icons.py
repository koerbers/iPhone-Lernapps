# Zeichnet das App-Symbol in Store-Qualität (1024 px) und die Startbilder für Android/iOS.
# Gleiches Motiv wie web/icons/icon-512.png. Aufruf: python3 app/scripts/make-icons.py  (braucht Pillow)
import math
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'assets'
S = 2048  # doppelt zeichnen, dann verkleinern (glatte Kanten)
k = S / 512  # Koordinaten unten sind in 512er-Maßstab angegeben


def background(size):
    top, bottom = (42, 120, 214), (24, 78, 166)
    img = Image.new('RGB', (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        d.line([(0, y), (size, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
    return img


def motif(scale=1.0):
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = 256

    def p(x, y):
        return (c + (x - c) * scale) * k, (c + (y - c) * scale) * k

    d.polygon([p(102, 155), p(255, 175), p(255, 368), p(102, 350)], fill=(255, 255, 255))
    d.polygon([p(258, 175), p(410, 155), p(410, 350), p(258, 368)], fill=(238, 243, 253))
    d.line([p(256, 175), p(256, 368)], fill=(169, 192, 230), width=round(5 * k * scale))
    for i in range(4):
        y = 195 + i * 37
        d.line([p(133, y), p(232, y + 6)], fill=(159, 183, 226), width=round(6 * k * scale))
        d.line([p(280, y + 6), p(379, y)], fill=(159, 183, 226), width=round(6 * k * scale))
    cx, cy, ro, ri = 379, 120, 46, 19
    star = [p(cx + (ro if j % 2 == 0 else ri) * math.sin(j * math.pi / 5), cy - (ro if j % 2 == 0 else ri) * math.cos(j * math.pi / 5)) for j in range(10)]
    d.polygon(star, fill=(255, 210, 63))
    return img


def save(img, name, size):
    img.resize((size, size), Image.LANCZOS).save(OUT / name)


full = background(S).convert('RGBA')
full.alpha_composite(motif())
save(full.convert('RGB'), 'icon-only.png', 1024)
# Android „adaptive icon“: Motiv kleiner, damit es in jeder Maske (Kreis, Tropfen …) ganz sichtbar bleibt
save(motif(0.8), 'icon-foreground.png', 1024)
save(background(S), 'icon-background.png', 1024)
for name, bg in (('splash.png', (244, 244, 241)), ('splash-dark.png', (17, 17, 17))):
    splash = Image.new('RGB', (2732, 2732), bg)
    logo = full.resize((560, 560), Image.LANCZOS)
    mask = Image.new('L', (560, 560), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, 559, 559], radius=124, fill=255)
    splash.paste(logo.convert('RGB'), ((2732 - 560) // 2, (2732 - 560) // 2), mask)
    splash.save(OUT / name)
print('Symbole gespeichert in', OUT)
