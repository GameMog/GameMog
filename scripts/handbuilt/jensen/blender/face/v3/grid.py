# grid.py OUT rowsep:  grid.py out.jpg "a.jpg b.jpg c.jpg" "d.jpg e.jpg f.jpg" [--h 600]
import sys; from PIL import Image
out = sys.argv[1]; rows = [r.split() for r in sys.argv[2:] if not r.startswith('--')]; h = 600
ims = [[Image.open(p).convert('RGB') for p in r] for r in rows]; ims = [[im.resize((int(im.width * h / im.height), h)) for im in r] for r in ims]
W = max(sum(im.width for im in r) for r in ims); S = Image.new('RGB', (W, h * len(ims)), (30, 30, 32))
for j, r in enumerate(ims):
    x = 0
    for im in r: S.paste(im, (x, j * h)); x += im.width
S.save(out, quality=90); print(out)
