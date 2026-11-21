// 畝ごよみ：ホーム画面に置けるようにするだけ（データは毎回サーバーから）
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(fetch(e.request).catch(()=>caches.match('/hatake/')))});
