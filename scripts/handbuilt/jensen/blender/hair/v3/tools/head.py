import numpy as np, json, os
D=os.path.join(os.path.dirname(__file__),'../work/head')
def L(k,dt): return np.fromfile(f'{D}/{k}.bin',dtype=dt)
def load():
    P=L('P','<f4').reshape(-1,3); IX=L('skinIX','<u4').reshape(-1,3); E=np.unique(L('eyesIX','<u4'))
    return P,IX,E
if __name__=='__main__':
    P,IX,E=load(); used=np.unique(IX); S=P[used]
    ep=P[E]; print('eyes centre',ep.mean(0),'x range',ep[:,0].min(),ep[:,0].max(),'front z',ep[:,2].max())
    head=S[S[:,1]>1.55]; print('head pts',len(head)); print('top y',head[:,1].max(),'x',head[:,0].min(),head[:,0].max(),'z',head[:,2].min(),head[:,2].max())
    H=L('hairP','<f4').reshape(-1,3); print('old hair bbox',H.min(0),H.max(0))
    B=L('browsP','<f4').reshape(-1,3); print('brows bbox',B.min(0),B.max(0))
    # skull profile at x=0: max y per z bin
    m=np.abs(S[:,0])<0.004
    for z in np.arange(-0.14,0.13,0.02):
        s=S[m&(np.abs(S[:,2]-z)<0.006)]
        if len(s): print('z %.2f ytop %.4f ybot %.4f'%(z,s[:,1].max(),s[:,1].min()))
