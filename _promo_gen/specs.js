// 10本の新しい動画（既存の phrases/yen/stamps/table/memories/order/pharmacy/currency/foods/lost と画面・操作が被らないもの）
const yday=()=>new Date(Date.now()+9*36e5-864e5).toISOString().slice(0,10);
const P='/app/phrases.html',ST='/app/stamps.html',Y='/app/yen.html';
const close={at:0.15,run:"document.querySelector('#show').classList.remove('open')"};
const stampSeed=(extra={})=>({'tabi-stamps-v1':Object.assign({st:{
 b0:{d:'2026-04-02',w:'Ichiran, Shibuya',r:5,n:''},b1:{d:'2026-04-03',w:'Tsukiji',r:5,n:''},b3:{d:'2026-04-08',w:'Dotonbori',r:4,n:''},
 b5:{d:'2026-04-06',w:'Kobe',r:5,n:''},b7:{d:'2026-04-05',w:'Uji',r:4,n:''},b18:{d:'2026-04-05',w:'Kyoto',r:5,n:''},b19:{d:'2026-04-02',w:'Shibuya',r:4,n:''},
 b20:{d:'2026-04-04',w:'Kawaguchiko',r:5,n:''},b21:{d:'2026-04-01',w:'Asakusa',r:4,n:''},b22:{d:'2026-04-07',w:'Nara',r:5,n:''},b23:{d:'2026-04-05',w:'Arashiyama',r:4,n:''},
 b31:{d:'2026-04-04',w:'Tokyo → Kyoto',r:5,n:''},b33:{d:'2026-04-05',w:'Gion',r:4,n:''},b36:{d:'2026-04-02',w:'Shinjuku',r:3,n:''},b40:{d:'2026-04-01',w:'Ueno',r:5,n:''},b42:{d:'2026-04-03',w:'Akihabara',r:4,n:''}},
 own:[],want:[],pref:[12,25,26,27,28,18],next:''},extra)});
module.exports=[
{v:'diet',seed:1,url:P,ls:{'tabi-phrase-v1':{fav:[],al:[],day:{last:'',n:0}}},beats:[
 {h:'Vegetarian in Japan?',s:'fish broth hides in almost everything',say:'Vegetarian in Japan? Fish broth hides in almost everything.',acts:[{at:1.2,scroll:250,dur:0.9}]},
 {h:'Ask about dashi',s:'big, clear Japanese',say:'Tap Diet, and ask about dashi in clear Japanese.',acts:[{at:0.7,tap:'.cat[data-c=diet]'},{at:1.3,scroll:520,dur:0.7},{at:2.6,tap:['.ph','dashi']},{at:3.0,badge:'Dashi? Asked ✓',dur:1.4}]},
 {h:'Meat? Pork? Alcohol?',s:'tap a phrase → show it',say:'No meat, no pork, no alcohol. Just show the screen.',acts:[close,{at:0.9,tap:['.ph','vegetarian']},{at:1.3,badge:'Shown to staff ✓',dur:1.2},{at:2.6,run:"document.querySelector('#show').classList.remove('open')"},{at:3.3,tap:['.ph','pork']}]}
]},
{v:'shopping',seed:2,url:P,ls:{'tabi-phrase-v1':{fav:[],al:[],day:{last:'',n:0}}},beats:[
 {h:'Shopping in Japan?',s:'tax-free · sizes · no bag',say:'Shopping in Japan, with zero Japanese?',acts:[{at:1.0,scroll:250,dur:0.9}]},
 {h:'“Tax-free, please.”',s:'show it at the register',say:'Show Tax-free, please, right at the register.',acts:[{at:0.6,tap:'.cat[data-c=shop]'},{at:1.2,scroll:330,dur:0.6},{at:2.2,tap:['.ph','Tax-free']},{at:2.6,badge:'Tax-free ✓',dur:1.4}]},
 {h:'Bigger size? No bag?',s:'tap a phrase → show it',say:'Bigger size? No bag? Tap it, and show it.',acts:[close,{at:0.8,tap:['.ph','bigger size']},{at:1.2,badge:'Size found ✓',dur:1.2},{at:2.4,run:"document.querySelector('#show').classList.remove('open')"},{at:3.0,tap:['.ph','need a bag']},{at:3.4,badge:'No bag, thanks ✓',dur:1.2}]}
]},
{v:'hotel',seed:3,url:P,ls:{'tabi-phrase-v1':{fav:[],al:[],day:{last:'',n:0}}},beats:[
 {h:'Too early to check in?',s:'drop your bags, go explore',say:'Landed too early to check in?',acts:[{at:0.9,scroll:250,dur:0.9}]},
 {h:'“Can you keep my luggage?”',s:'the front desk understands',say:'Show this, and the hotel keeps your bags.',acts:[{at:0.6,tap:'.cat[data-c=hotel]'},{at:1.2,scroll:330,dur:0.6},{at:2.2,tap:['.ph','luggage']},{at:2.6,badge:'Bags dropped ✓',dur:1.4}]},
 {h:'Wi-Fi. Check-out. Taxi.',s:'every hotel question, in Japanese',say:'Wi-Fi password, check-out time, a taxi. All in clear Japanese.',acts:[close,{at:0.8,tap:['.ph','Wi-Fi']},{at:1.2,badge:'Wi-Fi sorted ✓',dur:1.2},{at:2.4,run:"document.querySelector('#show').classList.remove('open')"},{at:3.0,tap:['.ph','check-out']}]}
]},
{v:'saved',seed:4,url:P,ls:{'tabi-phrase-v1':{fav:[],al:[],day:{last:'',n:0}}},beats:[
 {h:'Your own Japan cheat sheet',s:'only the phrases you need',say:'Build your own Japan cheat sheet.',acts:[{at:0.9,scroll:250,dur:0.9}]},
 {h:'Tap ★ to save',s:'from any situation',say:'Tap the star on any phrase. Water. The restroom. How much is this?',acts:[
  {at:0.5,tap:'.cat[data-c=food]'},{at:1.3,tap:'.fav[data-f="お水をください。"]',dy:-0},
  {at:2.3,tap:'.cat[data-c=move]'},{at:3.1,tap:'.fav[data-f="トイレはどこですか？"]'},
  {at:4.1,tap:'.cat[data-c=shop]'},{at:4.9,tap:'.fav[data-f="これはいくらですか？"]'},{at:5.2,badge:'Saved ★',dur:0.9}]},
 {h:'All in one place',s:'Saved · works offline',say:'They all wait in Saved, even with no signal.',acts:[{at:0.5,tap:'.cat[data-c=fav]'},{at:1.0,badge:'3 phrases saved ★',dur:1.4},{at:2.4,tap:['.ph','restroom']}]}
]},
{v:'daily',seed:5,url:P,ls:()=>({'tabi-phrase-v1':{fav:[],al:[],day:{last:yday(),n:6}}}),beats:[
 {h:'One Japanese phrase a day',s:'ready before you land',say:'Learn one Japanese phrase a day, before your trip.',acts:[]},
 {h:'Listen. Say it.',s:'10 seconds a day',say:'Tap listen, then say it out loud.',acts:[{at:0.6,tap:'#podPlay'},{at:0.9,badge:'🔊 Listening…',dur:1.4,y:1080}]},
 {h:'Keep your streak 🔥',s:'day after day',say:'Keep your streak going, every single day.',acts:[{at:0.5,tap:'#podOk'},{at:0.6,confetti:1},{at:0.7,badge:'🔥 7-day streak!',dur:1.8,y:1080}]}
]},
{v:'trips',seed:6,red:1,url:Y,ls:{'tabi-yen-v1':{people:['Alex','Sam','Mia'],cur:'USD',rate:150,items:[
  {id:1,title:'Sushi in Kanazawa',amt:14400,payer:'Alex',split:['Alex','Sam','Mia'],cat:'food'},{id:2,title:'Shinkansen',amt:41700,payer:'Sam',split:['Alex','Sam','Mia'],cat:'move'},
  {id:3,title:'Ryokan in Hakone',amt:96000,payer:'Mia',split:['Alex','Sam','Mia'],cat:'stay'},{id:4,title:'Kit Kat souvenirs',amt:5400,payer:'Alex',split:['Alex','Mia'],cat:'shop'}],
  past:[{name:'Japan Spring 2026',end:'2026-04-09',tot:286300,people:['Alex','Sam','Mia'],cur:'USD',rate:150,n:24,cats:[['🍜',82000],['🚃',61300],['🏨',118000],['🛍️',25000],['🎟️',0]]},
        {name:'Tokyo & Osaka 2025',end:'2025-10-18',tot:174900,people:['Alex','Sam'],cur:'USD',rate:150,n:15,cats:[['🍜',51000],['🚃',28900],['🏨',80000],['🛍️',15000],['🎟️',0]]}]}},
 init:"window.PROMPT='Japan Autumn 2026'",beats:[
 {h:'How much has Japan cost you?',s:'every trip, added up',say:'How much have all your Japan trips cost?',acts:[]},
 {h:'Finish the trip',s:'it’s saved to your history',say:'Finish a trip, and it’s saved to your history.',acts:[{at:0.5,tap:'#setBtn'},{at:1.6,tap:'#sReset'},{at:1.9,badge:'Trip saved ✓',dur:1.2}]},
 {h:'Every trip, one total',s:'in yen and in your money',say:'Every trip and its total, in yen and in your own money.',acts:[{at:0.3,scrollEl:'#pastW',off:-20,dur:1.0},{at:1.6,badge:'3 trips to Japan 🗾',dur:1.6}]}
]},
{v:'tripcard',seed:7,url:ST,ls:stampSeed(),beats:[
 {h:'Show off your Japan trip',s:'one card, every stamp',say:'Want to show off your Japan trip?',acts:[{at:1.0,scroll:300,dur:1.0}]},
 {h:'Make your trip card',s:'Memories → Share my trip card',say:'Open Memories, and make your trip card.',acts:[{at:0.2,scroll:0,dur:0.5},{at:0.9,run:"document.querySelector('#tabs').scrollLeft=240"},{at:1.2,tap:['.chip','Memories']},{at:2.3,tap:'#shareCard'}]},
 {h:'Share it anywhere',s:'stamps · prefectures · your score',say:'Every stamp on one card, ready to share.',acts:[{at:0.6,badge:'Card ready 判',dur:1.6,y:1500}]}
]},
{v:'ownstamp',seed:8,red:1,url:ST,ls:stampSeed(),beats:[
 {h:'Not on the list?',s:'add your own stamp',say:'Your favorite spot isn’t on the list?',acts:[{at:0.9,tap:['.chip','Mine']}]},
 {h:'Add your own',s:'any place, any emoji',say:'Add it in seconds, with your own emoji.',acts:[{at:0.4,tap:'#addOwn'},{at:1.0,type:{sel:'#aT',text:'Ghibli Museum',cps:0.07}},{at:2.1,type:{sel:'#aE',text:'🎬',cps:0.1}},{at:2.7,tap:'#aSave'},{at:3.0,badge:'Ghibli Museum added ★',dur:1.3}]},
 {h:'Your trip, your list',s:'sumo · a hidden café · that ramen shop',say:'Sumo, a hidden café, that tiny ramen shop. Your trip, your list.',acts:[{at:0.5,tap:'#addOwn'},{at:1.0,type:{sel:'#aT',text:'Sumo match',cps:0.07}},{at:1.9,type:{sel:'#aE',text:'🤼',cps:0.1}},{at:2.5,tap:'#aSave'},{at:2.8,confetti:1},{at:2.8,badge:'2 of your own ★',dur:1.4}]}
]},
{v:'nexttime',seed:9,url:ST,ls:stampSeed(),beats:[
 {h:'Ran out of days in Japan?',s:'save it for next time',say:'Ran out of days in Japan?',acts:[{at:0.9,tap:['.chip','Do']}]},
 {h:'♡ Want to try next time',s:'tap anything you missed',say:'Tap the heart on anything you missed.',acts:[{at:0.4,tap:['.it','Onsen']},{at:1.4,tap:'#dWant'},{at:1.6,badge:'Added ♡',dur:0.8},{at:2.4,tap:['.it','Tea ceremony']},{at:3.4,tap:'#dWant'},{at:3.6,badge:'Added ♡',dur:0.8}]},
 {h:'Your next trip, already planned',s:'♡ Next time',say:'Your next trip is already planned.',acts:[{at:0.3,run:"document.querySelector('#tabs').scrollLeft=200"},{at:0.7,tap:['.chip','Next time']},{at:1.1,badge:'2 for next time ♡',dur:1.6}]}
]},
{v:'bundle',seed:10,red:1,url:'/site/index.html',cta:'Get all 3 · link in bio',endSay:'Try them free. Link in bio.',beats:[
 {h:'3 tiny apps for Japan',s:'split · show · stamp',say:'Three tiny apps that make Japan easier.',acts:[]},
 {h:'Try them all free',s:'right in your browser',say:'Try every one free, right in your browser.',acts:[{at:0.3,scrollEl:['h2,h3','Pick what you need'],off:-20,dur:1.4},{at:2.0,scrollEl:['.app','Yen Split'],off:-20,dur:1.2}]},
 {h:'All 3 for $9.99',s:'less than a bowl of ramen',say:'Or get all three for nine ninety-nine. Less than a bowl of ramen.',acts:[{at:0.3,scrollEl:['h2,h3','The whole pocket'],off:-30,dur:1.4},{at:2.0,badge:'$9.99 · pay once',dur:1.8,y:1500}]}
]}
];
