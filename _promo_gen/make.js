// Tabi Pocket 英語宣伝動画ジェネレーター  usage: node make.js <name|all> [--preview]
const {chromium}=require('playwright');const {execFileSync,spawn}=require('child_process');const fs=require('fs'),path=require('path');
const G=__dirname,OUT=path.join(G,'out'),TMP=path.join(G,'tmp2');fs.mkdirSync(OUT,{recursive:true});fs.mkdirSync(TMP,{recursive:true});
const SPECS=require('./specs.js');const VOICE='en-US-AriaNeural',RATE='+10%',FPS=30;
const dur=f=>+execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',f]).toString().trim();
function tts(text,f){const raw=f+'.raw.mp3';if(!fs.existsSync(f)||!fs.statSync(f).size){for(let i=0;i<3;i++){try{execFileSync('python3',['/tmp/tts.py',text,VOICE,raw,RATE],{stdio:'pipe'});if(fs.statSync(raw).size)break}catch(e){}}
 execFileSync('ffmpeg',['-v','error','-y','-i',raw,'-af','silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse','-ar','48000','-c:a','pcm_s16le',f])}return dur(f)}
const yday=()=>new Date(Date.now()+9*36e5-864e5).toISOString().slice(0,10);
async function build(sp,page,preview){
  const beats=[],events=[],clips=[];let t=0.15;
  const all=[...sp.beats,{h:'Japan, made easier.',s:'Tabi Pocket · Made in Tokyo',say:sp.endSay||'Try it free. Link in bio.',end:1,acts:sp.url.includes('phrases')?[{at:0.05,run:"document.querySelector('#show').classList.remove('open')"}]:[]}];
  all.forEach((b,i)=>{const f=path.join(TMP,`${sp.v}_${i}.wav`);const vd=tts(b.say,f);clips.push({f,t:t+0.12});
    let d=Math.max(b.min||2.4,vd+0.45);for(const a of b.acts)d=Math.max(d,a.at+(a.tail||0.7));if(b.end)d=Math.max(d,vd+1.2,2.6);
    beats.push({t0:t,h:b.h,s:b.s});if(b.end)sp._endT=t;for(const a of b.acts){const e={...a,t:t+a.at};delete e.at;events.push(e)}t+=d});
  const T=Math.ceil(t*FPS)/FPS;events.sort((a,b)=>a.t-b.t);
  const ls=typeof sp.ls==='function'?sp.ls():sp.ls;
  await page.goto('http://localhost:8099/stage.html');await page.waitForTimeout(600);
  await page.evaluate(([u,l])=>window.load(u,l),[sp.url,ls||{}]);
  if(sp.init)await page.evaluate(js=>document.querySelector('#app').contentWindow.eval(js),sp.init);
  await page.evaluate(c=>window.setup(c),{beats,events,endT:sp._endT,cta:sp.cta,red:sp.red});
  await page.evaluate(()=>document.fonts.ready);
  const vid=path.join(TMP,sp.v+'_v.mp4');
  if(preview){const n=Math.round(T*FPS);const want=preview.map(x=>Math.round(+x*FPS));for(let i=0;i<n;i++){await page.evaluate(x=>window.frame(x),i/FPS);if(want.includes(i))await page.screenshot({path:path.join(TMP,`pv_${sp.v}_${(i/FPS).toFixed(1)}.jpg`),type:'jpeg',quality:70})}console.log(sp.v,'T',T.toFixed(2),beats.map(b=>b.t0.toFixed(1)).join(' '));return}
  const ff=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-','-c:v','libx264','-pix_fmt','yuv420p','-crf','20','-preset','medium','-r',String(FPS),vid],{stdio:['pipe','inherit','inherit']});
  const n=Math.round(T*FPS);
  for(let i=0;i<n;i++){await page.evaluate(x=>window.frame(x),i/FPS);const buf=await page.screenshot({type:'jpeg',quality:92});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r))}
  ff.stdin.end();await new Promise(r=>ff.on('close',r));
  // audio: voice-only (TikTok) and voice+music (Instagram)
  const inputs=clips.flatMap(c=>['-i',c.f]);const fl=clips.map((c,i)=>`[${i}:a]aresample=48000,adelay=${Math.round(c.t*1000)}|${Math.round(c.t*1000)},volume=1.0[a${i}]`).join(';');
  const mix=clips.map((c,i)=>`[a${i}]`).join('')+`amix=inputs=${clips.length}:normalize=0,apad,atrim=0:${T.toFixed(3)},loudnorm=I=-15:TP=-1.5[v]`;
  const vo=path.join(TMP,sp.v+'_vo.wav');execFileSync('ffmpeg',['-v','error','-y',...inputs,'-filter_complex',fl+';'+mix,'-map','[v]','-ac','2','-ar','48000',vo]);
  const mu=path.join(TMP,sp.v+'_mu.wav');execFileSync('python3',[path.join(G,'music.py'),mu,String(T),String(sp.seed)]);
  const vm=path.join(TMP,sp.v+'_vm.wav');execFileSync('ffmpeg',['-v','error','-y','-i',vo,'-i',mu,'-filter_complex','[1:a]volume=0.26[m];[m][0:a]sidechaincompress=threshold=0.05:ratio=4:attack=20:release=300[md];[0:a][md]amix=inputs=2:normalize=0,alimiter=limit=0.95[o]','-map','[o]','-ar','48000',vm]);
  for(const [k,a] of [['silent',vo],['voice',vm]])execFileSync('ffmpeg',['-v','error','-y','-i',vid,'-i',a,'-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','160k','-shortest','-movflags','+faststart',path.join(OUT,`en_${sp.v}_${k}.mp4`)]);
  console.log(sp.v,'done',T.toFixed(2)+'s');
}
(async()=>{const which=process.argv[2]||'all';const pv=process.argv.indexOf('--preview');
  const b=await chromium.launch();const page=await b.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
  page.on('console',m=>{if(/MISSING|Error/.test(m.text()))console.log('PAGE:',m.text())});page.on('pageerror',e=>console.log('PAGEERR',e.message));
  for(const sp of SPECS.filter(s=>which==='all'||which.split(',').includes(s.v))){
    if(pv>0){await build(sp,page,process.argv.slice(pv+1))}
    else await build(sp,page,null)}
  await b.close()})().catch(e=>{console.error(e);process.exit(1)});
