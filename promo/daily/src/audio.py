# python3 audio.py  -> writes voice_NN.wav and bgm_NN.wav for all themes
import json, numpy as np, soundfile as sf, sys
from scipy.signal import butter, lfilter, resample_poly
from kokoro import KPipeline
th=json.load(open('themes.json'))
Y={'家計簿':'かけいぼ','サークル出欠':'サークルしゅっけつ','推し活':'おしかつ','釣り日記':'つりにっき','家庭菜園':'かていさいえん','成長記録':'せいちょうきろく','筋トレ':'きんトレ','読書記録':'どくしょきろく','家事分担':'かじぶんたん','旅行の計画':'りょこうのけいかく','町内会':'ちょうないかい','お小遣い帳':'おこづかいちょう','ランニング記録':'ランニングきろく','レシピ帳':'レシピちょう','献立':'こんだて','サブスク管理':'サブスクかんり','植物の育成':'しょくぶつのいくせい','ポイント管理':'ポイントかんり','ワイン記録':'ワインきろく','勉強記録':'べんきょうきろく','カメラ散歩':'カメラさんぽ','手帳・日記':'てちょうと、にっき','水分・睡眠':'すいぶんと、すいみん','お店の常連さん':'おみせの、じょうれんさん','ペットのお世話':'ペットのおせわ','習いごと':'ならいごと'}
R=[('三日坊主','みっかぼうず'),('三日','みっか'),('釣果','ちょうか'),('家計簿','かけいぼ'),('身長','しんちょう'),('戦績','せんせき'),('観葉植物','かんようしょくぶつ'),('月謝','げっしゃ'),('お小遣い','おこづかい')]
def yomi(s):
    for a,b in R: s=s.replace(a,b)
    return s
sr=48000; D=10.0; N=int(D*sr)
p=KPipeline(lang_code='j'); g=p.g2p; p.g2p=lambda t: g(t)[0]
def tts(s,sp):
    a=np.concatenate([r.audio.numpy() for r in p(s,voice='jf_alpha',speed=sp)]); 
    # trim trailing/leading silence
    nz=np.where(np.abs(a)>0.01)[0]; a=a[max(0,nz[0]-1200):nz[-1]+2400]
    return resample_poly(a,2,1)
def place(V,t0,s,limit):
    sp=1.05
    while True:
        a=tts(s,sp)
        if t0+len(a)/sr<=limit or sp>1.5: break
        sp+=0.08
    i=int(t0*sr); V[i:i+len(a)]+=a[:N-i]; return round(t0+len(a)/sr,2),round(sp,2)
rng=np.random.default_rng(7)
def mtof(m): return 440*2**((m-69)/12)
def pluck(f,dur,amp):
    n=int(dur*sr); P=max(2,int(sr/f)); buf=rng.uniform(-1,1,P); out=np.zeros(n); j=0
    for k in range(n):
        out[k]=buf[j]; nj=(j+1)%P; buf[j]=0.995*0.5*(buf[j]+buf[nj]); j=nj
    return out*amp
cache={}
def pl(m,dur,amp):
    k=(m,dur)
    if k not in cache: cache[k]=pluck(mtof(m),dur,1.0)
    return cache[k]*amp
def bgm(idx):
    key=[0,2,-3,5,-1,3][idx%6]; bpm=118; beat=60/bpm; mix=np.zeros(N)
    prog=[[60,64,67],[67,71,74],[69,72,76],[65,69,72]]  # I V vi IV
    bar=beat*4
    def add(x,t):
        s=int(t*sr)
        if s<N: mix[s:s+len(x)]+=x[:N-s]
    t=0;ci=0
    while t<D:
        ch=[m+key for m in prog[ci%4]]
        add(pl(ch[0]-24,bar,0.5),t)                 # bass on 1
        add(pl(ch[0]-17,beat,0.3),t+2*beat)         # bass on 3 (fifth)
        pat=[0,1,2,1,2,1,0,2]                       # ukulele strum-ish 8ths
        for k in range(8):
            for j,m in enumerate(ch):
                add(pl(m+ (12 if k%4==0 else 0), beat*1.2, 0.12 if k%2 else 0.18),t+k*beat/2+j*0.012)
        # light clap on 2 and 4
        for k in (1,3):
            n=int(0.06*sr); add(rng.uniform(-1,1,n)*np.exp(-np.arange(n)/600)*0.12,t+k*beat)
        t+=bar; ci+=1
    # chime when app appears (~3.2s) and logo (~7.5s)
    tt=np.arange(int(1.2*sr))/sr
    for t0 in (3.2,7.5):
        for m,a in [(84,.10),(88,.07),(91,.05)]: add(np.sin(2*np.pi*mtof(m+key)*tt)*np.exp(-tt*3.5)*a,t0)
    b,a=butter(2,6500/(sr/2)); mix=lfilter(b,a,mix)
    tt=np.arange(N)/sr; mix*=np.minimum(1,tt/0.15)*np.minimum(1,(D-tt)/0.8)
    return mix/np.abs(mix).max()*0.8
rng_only=[int(x) for x in sys.argv[1:]] or range(len(th))
for i in rng_only:
    T=th[i]; ep=f"{i+1:02d}"; V=np.zeros(N)
    r1=place(V,0.25,yomi(T['say']),3.0); r2=place(V,3.15,f"だから、{Y.get(T['name'],T['name'])}アプリを、仕立てました。",6.95); r3=place(V,7.3,"アプリのしたてや。試作は、無料。",9.95)
    sf.write(f"voice_{ep}.wav",V/np.abs(V).max()*.9,sr); sf.write(f"bgm_{ep}.wav",bgm(i),sr)
    print(ep,r1,r2,r3,flush=True)
