"""
Procesar logos para el home de Grito de Selva.

USO:
1. Coloca los logos originales en esta carpeta (logos/):
     tactil-lab-original.png   (o .jpg / .webp)
     sigit-original.png        (o .jpg / .webp)

2. Ejecuta:  python logos/procesar_logos.py

3. El script genera versiones optimizadas sin fondo:
     tactil-lab.webp  → fondo oscuro removido (queda logo claro con alpha)
     sigit.webp       → fondo blanco removido (queda logo dorado con alpha)

Requiere: pip install Pillow
"""

from pathlib import Path
from PIL import Image, ImageFilter
import struct, zlib, sys

BASE = Path(__file__).parent


def remove_dark_background(img_path: Path, out_path: Path, threshold: int = 40):
    """Táctil Lab: fondo negro/oscuro → transparente."""
    img = Image.open(img_path).convert("RGBA")
    data = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = data[x, y]
            brightness = (r + g + b) / 3
            if brightness < threshold:
                data[x, y] = (r, g, b, 0)
    # recortar márgenes transparentes
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    img.save(out_path, "WEBP", quality=90)
    print(f"  OK → {out_path.name}  ({img.size[0]}×{img.size[1]})")


def remove_light_background(img_path: Path, out_path: Path, threshold: int = 220):
    """SIGIT: fondo blanco/claro → transparente."""
    img = Image.open(img_path).convert("RGBA")
    data = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = data[x, y]
            brightness = (r + g + b) / 3
            if brightness > threshold and abs(r - g) < 20 and abs(g - b) < 20:
                data[x, y] = (r, g, b, 0)
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    img.save(out_path, "WEBP", quality=90)
    print(f"  OK → {out_path.name}  ({img.size[0]}×{img.size[1]})")


if __name__ == "__main__":
    print("=== Procesando logos Grito de Selva ===\n")
    errors = 0

    # Táctil Lab — fondo oscuro
    originals_dark = list(BASE.glob("tactil-lab-original.*"))
    if originals_dark:
        src = originals_dark[0]
        print(f"Táctil Lab: {src.name}")
        try:
            remove_dark_background(src, BASE / "tactil-lab.webp")
        except Exception as e:
            print(f"  ERROR: {e}"); errors += 1
    else:
        print("Táctil Lab: falta 'tactil-lab-original.png' en logos/"); errors += 1

    # SIGIT — fondo claro
    originals_light = list(BASE.glob("sigit-original.*"))
    if originals_light:
        src = originals_light[0]
        print(f"SIGIT: {src.name}")
        try:
            remove_light_background(src, BASE / "sigit.webp")
        except Exception as e:
            print(f"  ERROR: {e}"); errors += 1
    else:
        print("SIGIT: falta 'sigit-original.png' en logos/"); errors += 1

    print()
    if errors == 0:
        print("Listos. Descomenta los <img> en prototipo/index.html para activarlos.")
    else:
        print(f"Hay {errors} archivo(s) pendientes.")
