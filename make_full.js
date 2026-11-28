// Vercelのビルドで実行：公開しているお試し版から、購入者用の本体（秘密のURL）を作る。鍵は環境変数 TABI_KEY（リポジトリには置かない）
const fs=require('fs'),path=require('path');const KEY=process.env.TABI_KEY;const BASE='https://tabipocket.vercel.app';
const cp=(s,d)=>{fs.mkdirSync(path.dirname(d),{recursive:true});fs.copyFileSync(s,d)};
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(['dist','node_modules','.git','_promo_gen'].includes(e.name)?[]:walk(path.join(d,e.name))):[path.join(d,e.name)]);
fs.rmSync('dist',{recursive:true,force:true});for(const f of walk('.'))if(!/make_full\.js$|vercel\.json$|\.gitignore$/.test(f))cp(f,path.join('dist',f));
if(!/^k[0-9a-f]{16}$/.test(KEY||'')){console.log('TABI_KEY missing: only public pages built');process.exit(0)}
const APPS=[['yen','Yen Split'],['stamps','Stamp Book'],['phrases','Point & Show']];
for(const [a,n] of APPS){const d=`dist/${KEY}/${a}`;fs.mkdirSync(d,{recursive:true});
 let s=fs.readFileSync(`try/${a}.html`,'utf8');
 s=s.replace('const FULL=false;','const FULL=true;').replace(/<link rel="canonical"[^>]*>/,'<meta name="robots" content="noindex"><link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icon-180.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">')
  .replace(/<div class="demo">[\s\S]*?<\/a><\/div>/,'').replace('/*SWSLOT*/',"if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});").replace('href="../">Tabi Pocket',`href="${BASE}/">Tabi Pocket`);
 if(!s.includes('const FULL=true;'))throw new Error('flag not found '+a);
 fs.writeFileSync(d+'/index.html',s);
 for(const z of [180,192,512])fs.copyFileSync(`icons/${a}-${z}.png`,`${d}/icon-${z}.png`);
 fs.writeFileSync(d+'/manifest.webmanifest',JSON.stringify({name:n,short_name:n,start_url:'./',scope:'./',display:'standalone',background_color:'#faf6ef',theme_color:'#d9482b',icons:[{src:'icon-192.png',sizes:'192x192',type:'image/png'},{src:'icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]}));
 fs.writeFileSync(d+'/sw.js',`const C='tabi-${a}-v1';self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['./','manifest.webmanifest','icon-192.png'])));self.skipWaiting()});self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('./'))))});`)}
fs.copyFileSync('thanks.html',`dist/${KEY}/index.html`);fs.rmSync('dist/thanks.html');
console.log('built full apps');
