# views.py TAG : front / 34 / profile renders of work/TAG.glb (bind pose), plus a strip
from common import *
import subprocess; from PIL import Image
tag = sys.argv[1]; H = model.Head(WK + f'/{tag}.glb')
c = view_cams(H.P0, H, (('front', 0), ('34', 35), ('profile', 90)), f=4200, W=800, Hh=900, dy=-0.02)
json.dump(c, open(WK + f'/cam-{tag}-views.json', 'w'))
o = subprocess.run([os.environ['BL'], '-b', '--factory-startup', '--python', V + '/scripts/render.py', '--', WK + f'/{tag}.glb', WK + f'/cam-{tag}-views.json', WK + f'/v-{tag}-'] + sys.argv[2:], capture_output=True, text=True)
ims = [Image.open(WK + f'/v-{tag}-{n}.jpg') for n in ('front', '34', 'profile')]
S = Image.new('RGB', (2400, 900)); [S.paste(im, (i * 800, 0)) for i, im in enumerate(ims)]; S.save(WK + f'/v-{tag}.jpg', quality=90); print('ok')
