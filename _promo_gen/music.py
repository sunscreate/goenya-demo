# 明るいBGMを合成（毎回キーとテンポ、音色を変える）  usage: music.py out.wav seconds seed
import numpy as np,sys,wave
out,dur,seed=sys.argv[1],float(sys.argv[2]),int(sys.argv[3])
rng=np.random.default_rng(seed);sr=48000;N=int(sr*(dur+1))
bpm=[104,110,116,98,120,108,112,100,118,106][seed%10];beat=60/bpm
key=[0,2,5,7,-3,3,-2,4,1,-5][seed%10]
prog=[[0,4,7],[7,11,14],[9,12,16],[5,9,12]] if seed%2==0 else [[0,4,7],[9,12,16],[5,9,12],[7,11,14]]
f=lambda n:440*2**((n+key-9)/12)
L=np.zeros(N);t=np.arange(N)/sr
def note(start,length,freq,amp,kind='pluck'):
    a=int(start*sr);n=int(length*sr)
    if a>=N:return
    n=min(n,N-a);tt=np.arange(n)/sr
    if kind=='pluck':
        w=(2*np.abs(2*((tt*freq)%1)-1)-1)*0.6+np.sin(2*np.pi*freq*tt)*0.4
        env=np.exp(-tt*7)*np.minimum(1,tt*400)
    elif kind=='pad':
        w=np.sin(2*np.pi*freq*tt)+0.3*np.sin(2*np.pi*freq*2.003*tt)
        env=np.minimum(1,tt*3)*np.minimum(1,(length-tt)*3)
    elif kind=='bass':
        w=np.sin(2*np.pi*freq*tt)+0.2*np.sin(4*np.pi*freq*tt)
        env=np.exp(-tt*3)*np.minimum(1,tt*300)
    L[a:a+n]+=w*env*amp
bar=4*beat;nb=int(dur/bar)+2
pat=[[0,1,2,1,0,2,1,2],[0,2,1,2,0,1,2,1],[0,1,2,0,1,2,0,2]][seed%3]
for b in range(nb):
    ch=prog[b%4];t0=b*bar
    for c in ch: note(t0,bar,f(c+48-12),0.05,'pad')
    note(t0,beat*2,f(ch[0]+24),0.22,'bass');note(t0+beat*2,beat*2,f(ch[0]+24),0.18,'bass')
    for k in range(8):
        n=ch[pat[k]]+60-12+(12 if (k==7 and b%2) else 0)
        note(t0+k*beat/2,beat/2*1.5,f(n),0.10,'pluck')
    # kick & hat
    for k in range(4):
        a=int((t0+k*beat)*sr)
        if a<N:
            n=min(int(0.18*sr),N-a);tt=np.arange(n)/sr
            L[a:a+n]+=np.sin(2*np.pi*(55+90*np.exp(-tt*30))*tt)*np.exp(-tt*16)*0.28
        a=int((t0+k*beat+beat/2)*sr)
        if a<N:
            n=min(int(0.05*sr),N-a)
            L[a:a+n]+=rng.standard_normal(n)*np.exp(-np.arange(n)/sr*90)*0.05
L=L[:int(sr*dur)]
fade=int(sr*0.8);L[-fade:]*=np.linspace(1,0,fade);L[:int(sr*.05)]*=np.linspace(0,1,int(sr*.05))
L=L/np.max(np.abs(L))*0.8
st=np.stack([L,L],1)
w=wave.open(out,'wb');w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((st*32767).astype(np.int16).tobytes());w.close()
