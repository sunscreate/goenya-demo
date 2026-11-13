// usage: node render.js <idx0> <out.mp4> [checkTimes...]
const {chromium}=require('playwright');const {spawn}=require('child_process');const fs=require('fs');const path=require('path');
const th=JSON.parse(fs.readFileSync(path.join(__dirname,'themes.json')));
const i=+process.argv[2],out=process.argv[3],checks=process.argv.slice(4);
const ep=String(i+1).padStart(2,'0');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
await p.goto('file://'+path.join(__dirname,'anim.html')+'?ep='+ep+'&t='+encodeURIComponent(JSON.stringify(th[i])));await p.waitForTimeout(300);
if(checks.length){for(const t of checks){await p.evaluate(t=>render(+t),t);await p.screenshot({path:`chk_${ep}_${t}.jpg`,type:'jpeg',quality:80});}await b.close();return;}
const tmp=out.replace(/\.mp4$/,'.tmp.mp4');
const ff=spawn('ffmpeg',['-loglevel','error','-y','-f','image2pipe','-framerate','30','-c:v','mjpeg','-i','-','-c:v','libx264','-crf','20','-preset','veryfast','-pix_fmt','yuv420p','-r','30',tmp]);
for(let f=0;f<300;f++){await p.evaluate(t=>render(t),f/30);const buf=await p.screenshot({type:'jpeg',quality:92});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));}
ff.stdin.end();const code=await new Promise(r=>ff.on('close',r));await b.close();if(code!==0)process.exit(1);fs.renameSync(tmp,out);})();
