import sys, numpy as np; from PIL import Image
z=np.load(sys.argv[1]); pos,msk,lm=z['pos'],z['msk'],z['lm']
for d_ in sys.argv[2:]:
  A=np.asarray(Image.open(d_+'/skin-albedo.png').resize((2048,2048))).astype(float); R=np.asarray(Image.open(d_+'/skin-mr.png').resize((2048,2048))).astype(float)
  out=[]
  for n,ids in (('cheeks',[117,346,205,425]),('forehead',[151,9]),('nose',[4,5]),('chin',[152,175]),('lips',[0,17])):
    d=np.min([np.linalg.norm(pos-lm[i],axis=-1) for i in ids],0); m=msk&(d<0.012)
    out.append(f'{n} {A[m].mean(0).round(0).astype(int).tolist()} r{R[m][:,1].mean():.0f}')
  print(d_.split('/')[-1], ' | '.join(out))
