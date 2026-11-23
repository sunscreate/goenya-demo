/* Tabi Pocket：来訪者を数える（Cookieなし・個人情報なし。ランダムな端末IDだけ） */
(()=>{try{if(window.top!==window.self)return;
const U='https://pkgqeircrgzsqtmiyywv.supabase.co/rest/v1/rpc/tabi_event',K='sb_publishable_No3R3AVVRPybIdQL6TtQpw_OdCEJLLw';
const q=new URLSearchParams(location.search),ua=navigator.userAgent;let sid='x';
try{sid=localStorage.getItem('tp_sid');if(!sid){sid=Math.random().toString(36).slice(2,12);localStorage.setItem('tp_sid',sid)}}catch(e){}
let src=q.get('utm_source')||q.get('from')||'';
const sameRef=()=>{try{return document.referrer&&new URL(document.referrer).hostname===location.hostname}catch(e){return false}};
if(!src){if(/musical_ly|Bytedance|TikTok/i.test(ua))src='tiktok';else if(/Instagram/i.test(ua))src='instagram';else if(/FBAN|FBAV/.test(ua))src='facebook';
 else if(document.referrer&&!sameRef()){try{src=new URL(document.referrer).hostname.replace(/^www\./,'')}catch(e){src='other'}}else src='direct'}
try{const s0=sessionStorage.getItem('tp_src');if(s0&&(src==='direct')&&sameRef())src=s0;else sessionStorage.setItem('tp_src',src)}catch(e){}
const dev=/Mobi|Android|iPhone|iPad/i.test(ua)?'mobile':'pc';
const send=(ev,x)=>{try{fetch(U,{method:'POST',keepalive:true,headers:{apikey:K,'content-type':'application/json'},body:JSON.stringify({ev,path:location.pathname+(x?'#'+x:''),ref:(document.referrer||'').slice(0,200),src,dev,sid})})}catch(e){}};
send('view');
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href]');if(!a)return;const h=a.href;
 if(h.includes('buy.stripe.com'))send('buy',h.split('/').pop().split('?')[0]);else if(h.includes('/try/'))send('try',h.split('/try/')[1].split(/[?#]/)[0]);},true);
}catch(e){}})();
