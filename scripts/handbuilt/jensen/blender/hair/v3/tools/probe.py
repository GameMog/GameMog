import numpy as np, sys; sys.path.insert(0,'tools'); from head import load
P,IX,E=load(); S=P[np.unique(IX)]
HC=np.array([0,1.645,0.039])
# radial width per height at x extremes
for y in np.arange(1.50,1.73,0.01):
    s=S[np.abs(S[:,1]-y)<0.004]
    s=s[(s[:,2]>-0.1)&(s[:,2]<0.2)]
    if len(s)==0: continue
    print('y %.3f xmax %.4f zmin %.4f zmax %.4f  (xmax at z %.3f)'%(y,s[:,0].max(),s[:,2].min(),s[:,2].max(), s[np.argmax(s[:,0]),2]))
