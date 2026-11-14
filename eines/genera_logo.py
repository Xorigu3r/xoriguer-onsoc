"""Genera el logo i les icones de Xoriguer On Sóc (falcó de la casa + agulla de localització).

Ús:  python -I eines/genera_logo.py   (des de l'arrel del projecte)
Llenç de 512 com Aparcament/Notificacions: falcó a (36, 66) amb 440 d'ample, motiu del projecte a sota.
Rètol (logo complet): marca.py de LOGOS-XORIGUER (X original + Montserrat ExtraBold + Segoe UI).
Fons de les icones: «Blau nit» (icones_blau_nit.icona), com totes les apps de la casa.
"""
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ARREL = Path(__file__).resolve().parent.parent
WWW = ARREL / 'www'
ICONS = WWW / 'icons'
ASSETS = ARREL / 'assets'
sys.path.insert(0, str(Path('C:/Users/Xorigu3r/Documents/LOGOS-XORIGUER/_eines')))
import marca  # noqa: E402
import icones_blau_nit as BN  # noqa: E402

FONS = (30, 42, 59, 255)  # Blau pissarra (mai negre)
CREMA = (246, 239, 226, 255)
TARONJA = (255, 168, 46, 255)
TARONJA_FOSC = (242, 101, 15, 255)
S = 4

# agulla: cercle de centre (256, 282) i radi 72, punta a (256, 432)
CX, CY, R, PUNTA = 256, 282, 72, 432


def agulla(cx=CX, cy=CY, r=R, py=PUNTA, n=90):
    d = py - cy
    a = math.degrees(math.acos(r / d))          # angle dels punts de tangència respecte de la vertical
    ini, fi = 90 + a, 90 - a + 360              # arc de dalt (coordenades de PIL: y avall)
    pts = [(cx + r * math.cos(math.radians(ini + (fi - ini) * i / n)),
            cy + r * math.sin(math.radians(ini + (fi - ini) * i / n))) for i in range(n + 1)]
    return pts + [(cx, py)]


def degradat_vertical(N, c1, c2, y0, y1):
    g = Image.new('RGBA', (1, N))
    for y in range(N):
        t = min(1, max(0, (y - y0) / max(1, y1 - y0)))
        g.putpixel((0, y), tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(4)))
    return g.resize((N, N))


def simbol(mida=512, amb_falco=True):
    """Falcó + agulla sobre transparent."""
    N = 512 * S
    k = S
    P = lambda pts: [(x * k, y * k) for x, y in pts]
    capa = Image.new('RGBA', (N, N), (0, 0, 0, 0))

    # resplendor taronja darrere l'agulla
    g = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse([160 * k, 220 * k, 352 * k, 440 * k], fill=TARONJA[:3] + (80,))
    capa.alpha_composite(g.filter(ImageFilter.GaussianBlur(40 * k)))

    if amb_falco:
        falco = Image.open(ICONS / 'falco.png').convert('RGBA')
        fw = 440 * k
        falco = falco.resize((fw, round(fw * falco.height / falco.width)), Image.LANCZOS)
        capa.alpha_composite(falco, (36 * k, 52 * k))

    d = ImageDraw.Draw(capa)
    # anells a terra al voltant de la punta (crema a dins, taronja a fora): "som aquí"
    for rx, ry, col, w in ((84, 20, CREMA, 8), (140, 36, TARONJA, 7)):
        d.ellipse([(CX - rx) * k, (PUNTA - ry) * k, (CX + rx) * k, (PUNTA + ry) * k], outline=col, width=w * k)

    # cos de l'agulla amb degradat
    cos = agulla()
    m = Image.new('L', (N, N), 0)
    ImageDraw.Draw(m).polygon(P(cos), fill=255)
    # ombra suau a terra sota la punta
    capa.paste(degradat_vertical(N, TARONJA, TARONJA_FOSC, (CY - R) * k, PUNTA * k), (0, 0), m)
    d = ImageDraw.Draw(capa)
    d.line(P(cos + cos[:2]), fill=CREMA, width=6 * k, joint='curve')
    # reflex
    d.arc([(CX - R + 16) * k, (CY - R + 16) * k, (CX + R - 16) * k, (CY + R - 16) * k], 200, 250,
          fill=(255, 236, 205, 210), width=7 * k)
    # forat del mig: fons fosc amb anella crema i punt taronja
    ri = 30
    d.ellipse([(CX - ri) * k, (CY - ri) * k, (CX + ri) * k, (CY + ri) * k], fill=FONS, outline=CREMA, width=6 * k)
    rp = 11
    d.ellipse([(CX - rp) * k, (CY - rp) * k, (CX + rp) * k, (CY + rp) * k], fill=TARONJA)

    return capa.resize((mida, mida), Image.LANCZOS)


def icona(mida, tipus):
    """Icona amb fons Blau nit, amb la mateixa proporció que les altres apps."""
    s = simbol(1024)
    s = s.crop(s.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox())
    return BN.icona(s, mida, tipus)


def logo_complet(mida=1024):
    im = Image.new('RGBA', (mida, mida), FONS)
    sb = simbol(720)
    im.alpha_composite(sb, ((mida - 720) // 2, 0))
    marca.enganxa(im, marca.rotul('XORIGUER', 'ON SÓC', amplada=int(mida * 0.74)), mida / 2, mida * 0.755)
    return im


if __name__ == '__main__':
    ASSETS.mkdir(exist_ok=True)
    icona(512, 'any').save(ICONS / 'icon-512.png')
    icona(192, 'any').save(ICONS / 'icon-192.png')
    icona(512, 'maskable').save(ICONS / 'maskable-512.png')
    icona(180, 'apple').convert('RGB').save(ICONS / 'apple-touch-icon.png')
    icona(64, 'favicon').save(ICONS / 'favicon.png')
    simbol(512).save(ICONS / 'simbol.png')
    logo_complet().convert('RGB').save(ICONS / 'logo-complet.png')
    # Android i iOS (@capacitor/assets)
    icona(1024, 'apple').convert('RGB').save(ASSETS / 'icon-only.png')
    icona(1024, 'fg').save(ASSETS / 'icon-foreground.png')
    icona(1024, 'bg').convert('RGB').save(ASSETS / 'icon-background.png')
    sp = Image.new('RGBA', (2732, 2732), FONS)
    sp.alpha_composite(logo_complet(1000), (866, 866))
    sp.convert('RGB').save(ASSETS / 'splash.png')
    sp.convert('RGB').save(ASSETS / 'splash-dark.png')
    print('Icones generades a', ICONS)
