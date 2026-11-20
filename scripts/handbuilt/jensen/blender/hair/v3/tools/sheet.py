import sys; from PIL import Image
out, ims = sys.argv[1], [Image.open(p) for p in sys.argv[2:]]
h = min(i.height for i in ims); ims = [i.resize((int(i.width * h / i.height), h)) for i in ims]
o = Image.new('RGB', (sum(i.width for i in ims), h)); x = 0
for i in ims: o.paste(i, (x, 0)); x += i.width
o.save(out, quality=90)
