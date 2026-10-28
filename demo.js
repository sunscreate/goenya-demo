/* ご縁屋 デモ版：本番のデータベース・カレンダーの代わりに、ブラウザ内の架空データで動かす */
(function(){
const KEY="goenya-demo-v1";
const ser=o=>o===undefined?undefined:JSON.parse(JSON.stringify(o));
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return ymd(d)};
const iso=(dd,t)=>new Date(dd+"T"+t+":00").toISOString();
const ROLE=new URLSearchParams(location.search).get("as")==="staff"?"staff":"admin";
const UID=ROLE==="staff"?"s_sato":"owner";

/* ---------- 架空データ ---------- */
function seed(){
  const S={};const put=(p,d)=>S[p]=d;
  const wk={1:{s:"09:00",e:"17:00"},2:{s:"09:00",e:"17:00"},3:{s:"09:00",e:"17:00"},4:{s:"09:00",e:"17:00"},5:{s:"09:00",e:"17:00"},6:{s:"09:00",e:"15:00"}};
  put("staffdata/owner",{name:"代表（自分）",owner:true,createdAt:iso(day(-40),"09:00")});
  put("staffdata/s_sato",{name:"佐藤 美咲",tel:"090-0000-1001",google:"",avail:{wk,off:[]},pw:{salt:"demo-staff",hash:"a671114026bb8b3fdbff17438a589e33d189c6648bf8bdba8cd4f895def911fa"},createdAt:iso(day(-30),"09:00"),lastMsgAt:iso(day(0),"08:10"),lastFrom:"staff"});
  put("staffdata/s_suzuki",{name:"鈴木 健一",tel:"090-0000-1002",google:"",avail:{wk:{1:{s:"10:00",e:"16:00"},3:{s:"10:00",e:"16:00"},5:{s:"10:00",e:"16:00"},6:{s:"09:00",e:"13:00"}},off:[]},pw:{salt:"demo-staff",hash:"a671114026bb8b3fdbff17438a589e33d189c6648bf8bdba8cd4f895def911fa"},createdAt:iso(day(-25),"09:00")});
  put("staff/s_sato",{name:"佐藤 美咲",tel:"090-0000-1001",address:"宮前区宮崎2丁目",rate:2500,active:true,contract:true,invoice:false,bank:"〇〇銀行 宮前支店 普通 0000000 サトウ ミサキ（架空）"});
  put("staff/s_suzuki",{name:"鈴木 健一",tel:"090-0000-1002",address:"宮前区野川",rate:2500,active:true,contract:true,invoice:true,bank:"〇〇信用金庫 野川支店 普通 0000000 スズキ ケンイチ（架空）"});
  ["owner","s_sato","s_suzuki"].forEach(id=>put("approvals/"+id,{approved:true,at:iso(day(-30),"09:00")}));
  const C=[
    ["c1","山田 花子","宮前区宮崎2-3-4","宮前区宮崎","ご縁 週1","山田 太郎","長男","090-0000-0001"],
    ["c2","田中 ハル","宮前区鷺沼1-5-8","宮前区鷺沼","ご縁 月2","田中 健","長男","090-0000-0002"],
    ["c3","佐々木 正雄","宮前区野川3-12-1","宮前区野川","ご縁 週2","佐々木 由美","長女","090-0000-0003"],
    ["c4","高橋 キヨ","宮前区馬絹2-8-15","宮前区馬絹","単発","高橋 誠","次男","090-0000-0004"],
    ["c5","伊藤 和子","宮前区犬蔵1-20-3","宮前区犬蔵","ご縁 月1","伊藤 美穂","長女","090-0000-0005"],
    ["c6","渡辺 茂","宮前区有馬4-2-9","宮前区有馬","ご縁 週1","渡辺 聡","長男","090-0000-0006"]];
  C.forEach(([id,name,address,area,plan,fn,fr,ft])=>put("customers/"+id,{name,tel:"044-000-00"+id.slice(1).padStart(2,"0"),address,area,plan,status:"利用中",payMethod:plan==="単発"?"現金（単発・当日）":"銀行振込（事前）",
    familyName:fn,familyRel:fr,familyTel:ft,applicantRel:"息子・娘",earlyOk:"OK",prefDays:[2,4],prefBand:"午前（9〜12時）",
    entry:"玄関のチャイムは壊れているので、ドアを軽くノック",parking:"近くのコインパーキング",home:"スマホ：らくらくホン／ゴミの日：月・木",prefs:"野球の話が好き。「花子さん」と呼ばれると喜ばれる",
    personMemo:"話し好きで明るい方",cautions:"玄関に段差あり",everyReq:"郵便物の確認",createdAt:iso(day(-35),"10:00")}));
  const V=[];let n=0;
  const add=(sid,cid,dd,t,st,extra)=>{const c=S["customers/"+cid];const id="v"+(++n);
    const doc=Object.assign({customerId:cid,customerName:c.name,address:c.address,area:c.area,date:dd,time:t,status:st,kind:c.plan==="単発"?"単発":"月額プラン",
      payTiming:c.plan==="単発"?"当日払い":"事前振込",ext:0,pay:sid==="owner"?0:2500,extPay:sid==="owner"?0:1000,familyName:c.familyName,familyTel:c.familyTel,familyRel:c.familyRel,
      entry:c.entry,parking:c.parking,cautions:c.cautions,everyReq:c.everyReq,earlyOk:"OK",tasks:"【毎回の要望】郵便物の確認",createdAt:iso(day(-20),"09:00"),updatedAt:iso(day(-1),"09:00")},extra||{});
    if(st==="完了")Object.assign(doc,{arrivedAt:iso(dd,t),finishedAt:iso(dd,(+t.slice(0,2)+1)+":00"),startCheck:{grooming:true,camOn:true},endCheck:{safety:true,camOff:true,settled:doc.payTiming==="当日払い"?true:null},
      report:{done:"郵便物を仕分けし、市役所からの書類をご説明。台所の電球をLEDに交換。",condition:"お元気で、よく話されました。食欲もあるとのことです。",next:"次回は網戸の掃除をご希望"},
      collected:doc.payTiming==="当日払い"?{method:"現金",amount:6600}:null});
    put("staffdata/"+sid+"/visits/"+id,doc)};
  /* 過去（完了） */
  [[-18,"s_sato","c1","10:00"],[-15,"s_suzuki","c3","10:00"],[-13,"s_sato","c3","13:00"],[-11,"s_sato","c1","10:00"],[-9,"owner","c2","14:00"],[-8,"s_suzuki","c3","10:00"],
   [-6,"s_sato","c3","13:00"],[-5,"s_sato","c6","10:00"],[-4,"s_sato","c1","10:00"],[-3,"s_suzuki","c4","11:00"],[-2,"owner","c5","10:00"],[-1,"s_sato","c6","10:00"]]
   .forEach(([o,s,c,t])=>add(s,c,day(o),t,"完了",o===-3?{ext:1}:null));
  /* 今日・これから */
  add("s_sato","c1",day(0),"10:00","予定",{needCall:true,callAt:iso(day(-1),"18:00")});
  add("s_suzuki","c3",day(0),"13:00","予定");
  add("owner","c6",day(0),"15:00","予定");
  [[1,"s_sato","c3","10:00"],[2,"s_suzuki","c2","11:00"],[3,"s_sato","c1","10:00"],[3,"owner","c6","14:00"],[4,"s_sato","c3","13:00"],[6,"s_suzuki","c5","10:00"],[7,"s_sato","c6","10:00"],[8,"s_sato","c1","10:00"]]
   .forEach(([o,s,c,t])=>add(s,c,day(o),t,"予定"));
  /* 受付 */
  put("inquiries/q1",{kind:"booking",name:"中村 由紀",rel:"息子・娘",tel:"090-0000-0011",email:"",area:"宮前区宮前平1-7-2",honName:"中村 トメ",honTel:"",plan:"単発（6,600円）",pay:"現金（単発・当日）",early:"OK",
    date1:day(3)+"T11:00",body:"母のスマホでビデオ通話ができるようにしてほしい。あと電球が切れています。",prefDays:[],prefBand:"午前（9〜12時）",status:"未対応",createdAt:iso(day(0),"07:45"),assign:{status:"offered",staffId:"s_sato",date:day(3),time:"11:00",tried:[],at:iso(day(0),"07:46")}});
  put("staffdata/s_sato/offers/q1",{inqId:"q1",date:day(3),time:"11:00",area:"宮前区宮前平1-7-2",customerName:"中村 トメ",requesterName:"中村 由紀",rel:"息子・娘",tel:"",requesterTel:"090-0000-0011",plan:"単発（6,600円）",pay:"現金（単発・当日）",early:"OK",tasks:"【お申込み内容】母のスマホでビデオ通話ができるようにしてほしい。あと電球が切れています。",cautions:"",entry:"",parking:"",status:"pending",offeredAt:iso(day(0),"07:46"),travel:25,travelRaw:15,travelMode:"徒歩",travelFrom:"自宅"});
  put("inquiries/q2",{kind:"inquiry",name:"小林 正",rel:"",tel:"044-000-0012",area:"宮前区土橋",body:"庭の草むしりも頼めますか？月に1回くらいで考えています。",status:"未対応",createdAt:iso(day(-1),"16:20")});
  put("inquiries/q3",{kind:"booking",repeat:true,name:"山田 太郎",tel:"090-0000-0001",plan:"月額プランの訪問",pay:"",early:"OK",date1:day(3)+"T10:00",body:"いつも通りでお願いします",status:"対応済",customerId:"c1",createdAt:iso(day(-6),"20:00")});
  put("inquiries/q4",{kind:"cancel",name:"伊藤 美穂",tel:"090-0000-0005",cancelDate:day(6),cancelTime:"10:00",feeRate:0,body:"体調不良のため",status:"未対応",createdAt:iso(day(0),"06:30")});
  /* 請求 */
  const mon=ymd(new Date()).slice(0,7);
  ["c1","c3","c5"].forEach(c=>put("billing/"+c+"_"+mon,{customerId:c,month:mon,amount:{c1:22000,c3:44000,c5:5500}[c],paid:true,paidAt:iso(day(-20),"10:00")}));
  /* チャット */
  put("staffdata/s_sato/chat/m1",{from:"admin",text:"佐藤さん、明日の山田様は郵便物の確認もお願いします。",files:[],at:iso(day(-1),"17:30")});
  put("staffdata/s_sato/chat/m2",{from:"staff",text:"承知しました。山田様、来週は通院があるそうです。報告に書いておきます。",files:[],at:iso(day(0),"08:10")});
  put("settings/admin",{salt:"demo-admin",hash:"dd4fca781b8c64594f949a85ce20d8baa73bf7acfd8fb140dd7372b1b6aed16b"});
  return S;
}

/* ---------- ブラウザ内データベース ---------- */
let store;try{store=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){}
if(!store){store=seed();store.__seeded=Date.now()}
let saveT=null;const save=()=>{clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(store))}catch(e){}},300)};
save();
const subs=new Set();
function changed(path){setTimeout(()=>subs.forEach(s=>{try{s.match(path)&&s.fire()}catch(e){console.warn(e)}}),0)}
let auto=0;const newId=()=>Date.now().toString(36)+(++auto).toString(36)+Math.random().toString(36).slice(2,6);
const parentOf=p=>p.slice(0,p.lastIndexOf("/"));
function docRef(path){const id=path.split("/").pop();
  const snap=()=>({exists:path in store,id,data:()=>ser(store[path])});
  return {id,path,
    get:async()=>snap(),
    set:async d=>{const v=ser(d);if(JSON.stringify(store[path])===JSON.stringify(v))return;store[path]=v;save();changed(path)},
    update:async d=>{if(!(path in store))throw {code:"not_found"};const n=Object.assign({},store[path],ser(d));if(JSON.stringify(n)===JSON.stringify(store[path]))return;store[path]=n;save();changed(path)},
    delete:async()=>{if(!(path in store))return;delete store[path];save();changed(path)},
    onSnapshot:(cb,err)=>{let last;const s={match:p=>p===path,fire:()=>{const j=JSON.stringify(store[path]);if(j===last)return;last=j;cb(snap())}};subs.add(s);s.fire();return()=>subs.delete(s)}}}
function coll(path,opt){opt=opt||{};
  const q={
    doc:id=>docRef(path+"/"+(id||newId())),
    orderBy:(f,dir)=>coll(path,Object.assign({},opt,{ob:[f,dir||"asc"]})),
    limit:n=>coll(path,Object.assign({},opt,{lim:n})),
    where:(f,op,v)=>coll(path,Object.assign({},opt,{wh:(opt.wh||[]).concat([[f,op,v]])})),
    add:async d=>{const r=docRef(path+"/"+newId());await r.set(d);return r},
    get:async()=>snapAll(),
    onSnapshot:(cb,err)=>{let last;const s={match:p=>parentOf(p)===path,fire:()=>{const sn=snapAll(),j=JSON.stringify(sn.docs.map(d=>[d.id,store[path+"/"+d.id]]));if(j===last)return;last=j;cb(sn)}};subs.add(s);s.fire();return()=>subs.delete(s)}};
  function snapAll(){const pre=path+"/";let ids=Object.keys(store).filter(k=>k.startsWith(pre)&&!k.slice(pre.length).includes("/")).map(k=>k.slice(pre.length));
    const val=(id,f)=>f.split(".").reduce((o,k)=>o==null?o:o[k],store[pre+id]);
    (opt.wh||[]).forEach(([f,op,v])=>{ids=ids.filter(id=>{const x=val(id,f);return op==="=="?x===v:op===">"?x>v:op==="<"?x<v:op===">="?x>=v:op==="<="?x<=v:op==="!="?x!==v:true})});
    if(opt.ob){const [f,dir]=opt.ob;ids.sort((a,b)=>{const x=val(a,f)||"",y=val(b,f)||"";return (x<y?-1:x>y?1:0)*(dir==="desc"?-1:1)})}
    if(opt.lim)ids=ids.slice(0,opt.lim);
    const docs=ids.map(id=>({id,exists:true,data:()=>ser(store[pre+id])}));return {docs,empty:!docs.length,size:docs.length}}
  return q}
const db={doc:docRef,collection:coll};

/* ---------- Googleカレンダーの代わり（架空の私用予定つき） ---------- */
const calEv=[{id:"g1",start:{dateTime:iso(day(1),"15:00")},end:{dateTime:iso(day(1),"16:30")},status:"confirmed"},{id:"g2",start:{dateTime:iso(day(5),"09:00")},end:{dateTime:iso(day(5),"12:00")},status:"confirmed"}];
const mcp={callTool:async(server,tool,input)=>{await new Promise(r=>setTimeout(r,150));
  if(tool==="create_event")return {payload:{id:"demo_"+newId()}};
  if(tool==="list_events")return {payload:{events:ROLE==="admin"?calEv:[{id:"g9",start:{dateTime:iso(day(2),"13:00")},end:{dateTime:iso(day(2),"15:00")},status:"confirmed"}]}};
  return {payload:{}}}};

/* ---------- 写真・PDFの添付（この端末の中だけ） ---------- */
const blobs={};
const assets={upload:async(b)=>{const id="d"+newId();blobs[id]=URL.createObjectURL(b);return {id}}};
const fix=el=>{["src","href"].forEach(a=>{const v=el.getAttribute&&el.getAttribute(a);if(v&&v.startsWith("/_blob/")){const id=v.slice(7);if(blobs[id])el.setAttribute(a,blobs[id])}})};
new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType!==1)return;fix(n);n.querySelectorAll&&n.querySelectorAll("img,a").forEach(fix)}))).observe(document.documentElement,{childList:true,subtree:true});

const user={id:async()=>UID,isOwner:()=>ROLE==="admin",canEdit:()=>ROLE==="admin"};
window.claude={use:async k=>({db,user,mcp,assets})[k]||Promise.reject({code:"not_granted"})};

/* パスワード入力なしで開けるようにする（デモのみ） */
try{sessionStorage.setItem("goen-admin",String(Date.now()));sessionStorage.setItem("goen-staff-s_sato",String(Date.now()))}catch(e){}

/* お客様の「ご予約の確認」用データを用意 */
window.addEventListener("load",()=>setTimeout(async()=>{const L=window.goenLookup;if(!L||store.__lk)return;
  try{await L.write(db,"山田 太郎","090-0000-0001",[{ref:"q3",kind:"booking",repeat:true,date1:day(3)+"T10:00",plan:"月額プランの訪問",pay:"",status:"対応済",createdAt:iso(day(-6),"20:00")}],
    [{date:day(0),time:"10:00",status:"予定",staffName:"佐藤 美咲",photo:"",call:"done",end:"11:00",want:"",changed:false},{date:day(3),time:"10:00",status:"予定",staffName:"佐藤 美咲",photo:"",call:"",end:"11:00",want:"",changed:false}]);
    store.__lk=1;save()}catch(e){}},800));

/* ---------- デモ案内バー ---------- */
window.addEventListener("DOMContentLoaded",()=>{
  const st=document.createElement("style");st.textContent=
  ".demobar{background:#1f2a23;color:#fff;font:14px/1.5 'Zen Kaku Gothic New',sans-serif;padding:8px max(16px,env(safe-area-inset-left));display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;position:relative;z-index:30}"+
  ".demobar b{background:#d95f28;border-radius:4px;padding:1px 8px}.demobar a,.demobar button{color:#fff;font:inherit;background:transparent;border:1px solid #fff6;border-radius:16px;padding:3px 12px;text-decoration:none;cursor:pointer}"+
  ".demobar a[aria-current=true]{background:#fff;color:#1f2a23}.demobar .note{opacity:.8;font-size:12px;flex-basis:100%}";
  document.head.append(st);
  const v=location.hash.slice(1),cur=ROLE==="staff"?"staff":v==="admin"?"admin":"site";
  const bar=document.createElement("div");bar.className="demobar";bar.setAttribute("role","region");bar.setAttribute("aria-label","デモ版の案内");
  bar.innerHTML='<b>デモ版</b><span>表示：</span>'+
    '<a href="./#top" aria-current="'+(cur==="site")+'">お客様サイト</a>'+
    '<a href="./#admin" aria-current="'+(cur==="admin")+'">管理画面（代表）</a>'+
    '<a href="./?as=staff#staff" aria-current="'+(cur==="staff")+'">スタッフ画面（佐藤）</a>'+
    '<button type="button" id="demo-reset">データを初期化</button>'+
    '<span class="note">人物・住所・電話番号はすべて架空です。操作した内容はこのブラウザの中だけに保存されます。予約の確認は「山田 太郎／090-0000-0001」で試せます。パスワードを聞かれたら demo1234 です。</span>';
  document.body.prepend(bar);
  bar.querySelectorAll("a").forEach(a=>a.addEventListener("click",e=>{const u=new URL(a.href);if(u.search!==location.search){e.preventDefault();location.href=a.href}}));
  document.getElementById("demo-reset").onclick=()=>{try{localStorage.removeItem(KEY)}catch(e){}location.reload()};
  window.addEventListener("hashchange",()=>{const h=location.hash.slice(1);bar.querySelectorAll("a").forEach(a=>{const t=a.getAttribute("href");a.setAttribute("aria-current",String(ROLE==="staff"?t.includes("staff"):h==="admin"?t==="./#admin":t==="./#top"))})});
});
})();
