/**
 * Sun'sCreate 設備点検報告システム（増圧ポンプ点検／貯水槽清掃・給水設備点検）
 * Google Apps Script（Webアプリ）。データ・写真・報告書はすべて、このスクリプトを作ったGoogleアカウントのドライブに保存します。
 *
 * 最初に1回だけ：関数「setup」を実行 → 権限を許可 → 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *   実行ユーザー：自分 ／ アクセスできるユーザー：自分のみ
 */

const APP_NAME = '設備点検報告システム';
const PROPS = PropertiesService.getScriptProperties();

/* ================= 点検項目（増圧ポンプ 28項目） =================
 * type: ok=良否のみ / num=測定値 / kpa=差圧(良否＋kPa)
 * itc: 伊藤忠書式の欄の種類（nashi=「異常の有無」なので良→無、ari=良→有、ryo=良・否）
 */
const PUMP_ITEMS = [
  {no:1,  sec:'ポンプ', text:'ﾎﾟﾝﾌﾟ、ﾓｰﾀｰ・軸受け部に異常はないか', crit:'発熱・振動・水漏れがない', type:'ok', itc:'nashi'},
  {no:2,  sec:'ポンプ', text:'ﾍﾞｰｽ、ｸﾞﾗﾝﾄﾞ部に異常はないか', crit:'発錆・腐食・損傷がない', type:'ok', itc:'nashi'},
  {no:3,  sec:'ポンプ', text:'シール・ﾊﾟｯｷﾝ類は正常か', crit:'水漏れ・損傷がない', type:'ok', itc:'ryo'},
  {no:4,  sec:'ポンプ', text:'ウォターハンマーはないか', crit:'起動・停止時に衝撃がない', type:'ok', itc:'nashi'},
  {no:5,  sec:'ポンプ', text:'ベースのボルト・ナットに増し締めが必要か', crit:'緩んでいない', type:'ok', itc:'nashi'},
  {no:6,  sec:'ポンプ', text:'(運転)吐出圧力', unit:'MPa', crit:'定格±10%以内', type:'num', rule:'pct10', ref:'ratedPressure'},
  {no:7,  sec:'ポンプ', text:'(運転)電流', unit:'A', crit:'定格以下', type:'num', rule:'max', ref:'ratedCurrent'},
  {no:8,  sec:'ポンプ', text:'主電源・電圧', unit:'V', crit:'定格±10%以内', type:'num', rule:'pct10', ref:'ratedVoltage'},
  {no:9,  sec:'ポンプ', text:'絶縁抵抗値', unit:'MΩ', crit:'1(MΩ)以上', type:'num', rule:'min1'},
  {no:10, sec:'ポンプ', text:'圧力タンク封入圧', unit:'MPa', crit:'定格±0.01以内', type:'num', rule:'abs001', ref:'ratedTank', single:true},
  {no:11, sec:'ポンプ', text:'*1)逆流防止機能に異常はないか', crit:'外観', type:'ok', itc:'nashi', single:true},
  {no:12, sec:'ポンプ', text:'*1)逆流防止機能（第2逆止弁）', crit:'差圧が減少しないこと', type:'kpa', single:true},
  {no:13, sec:'ポンプ', text:'*1)逆流防止機能（第2閉止弁）', crit:'差圧が減少しないこと', type:'kpa', single:true},
  {no:14, sec:'ポンプ', text:'*1)逆流防止機能（第1逆止弁）', crit:'差圧が減少しないこと', type:'kpa', single:true},
  {no:15, sec:'ポンプ', text:'*1)逆流防止機能（逃がし弁）', crit:'14kPa以上で排水し始めること', type:'kpa', single:true, kpaMin:14},
  {no:16, sec:'ポンプ', text:'*1)運転制御機能に異常はないか', crit:'発信器・流量センサーの作動確認', type:'ok', itc:'nashi'},
  {no:17, sec:'ポンプ', text:'逃がし弁・ストレーナーに異常はないか', crit:'目詰まりがない', type:'ok', itc:'nashi', single:true},
  {no:18, sec:'ポンプ', text:'圧力タンク(アキュームレーター)に異常はないか', crit:'発錆・腐食・損傷がない', type:'ok', itc:'nashi', single:true},
  {no:19, sec:'ポンプ', text:'圧力計(ゲージ)に異常がないか', crit:'指針の作動確認', type:'ok', itc:'nashi', single:true},
  {no:20, sec:'ポンプ', text:'外観(ケーシングに異常はないか)', crit:'扉の開閉・鍵・損傷がない', type:'ok', itc:'nashi'},
  {no:21, sec:'制御盤', text:'リレー・開閉器・インバーターに異常はないか', crit:'作動確認', type:'ok', itc:'nashi'},
  {no:22, sec:'制御盤', text:'配線系統に腐食はないか', crit:'発錆・ゆるみ・損傷がない', type:'ok', itc:'nashi'},
  {no:23, sec:'制御盤', text:'各部に異常な発熱・発錆はないか', crit:'発錆・腐食・損傷がない', type:'ok', itc:'nashi'},
  {no:24, sec:'制御盤', text:'表示灯・スイッチに異常はないか', crit:'目視確認', type:'ok', itc:'nashi'},
  {no:25, sec:'制御盤', text:'異常警報・外部発信機能に異常はないか', crit:'接点接続確認', type:'ok', itc:'nashi'},
  {no:26, sec:'配管他', text:'配管系統に漏水・腐食はないか', crit:'水漏れ・損傷がない', type:'ok', itc:'nashi'},
  {no:27, sec:'配管他', text:'吐水口空間は確保されているか', crit:'目視確認', type:'ok', itc:'ari', single:true},
  {no:28, sec:'配管他', text:'ドレン管に異常はないか', crit:'目視確認', type:'ok', itc:'nashi', single:true}
];
const UNITS = ['NO1','NO2','NO3'];
/* 書式の初期値（かずさんのドライブにある報告書）。設定画面で変更できます */
const DEFAULT_TPL = {
  sc_pump: 'https://drive.google.com/file/d/1J0enpQGEj8-qwE_N883J_eQHYbroXmix/view',
  itc_pump: 'https://drive.google.com/file/d/1yNP-Kmv3JuspQ4WuA7QqSm1U08TPXD9N/view',
  sc_tank: 'https://drive.google.com/file/d/1IIxalZSV25npRAEIl6T9o2ix_iIeCjP7/view',
  itc_tank: 'https://drive.google.com/file/d/1ghmaUao3JNFS9njVywBySIVitxGSmTrh/view',
  sc_drain: 'https://docs.google.com/spreadsheets/d/1SfInmHJNfgYKq4GFaloZ5SVEkn754rixb-dNwWodVko/edit'
};

/* ================= 書式（テンプレート）の対応表 =================
 * 書式はGoogleスプレッドシート。設定画面でURLを登録します。
 * 他社の書式は、このシステムの中だけで使います。
 */
const TEMPLATES = {
  sc_pump: {
    kind: 'pump',
    name: '自社書式：増圧ポンプ点検報告書',
    clearImagesOn: ['03_作業記録写真_A4縦6枚', '03_作業記録写真_A4縦6枚 のコピー'],
    defaultOrder: 'row',
    fill: function (sp, d) {
      const c = sp.getSheetByName('01_表紙_総合所見');
      put(c, 'A4', (d.mgmtCompany || '') + (d.mgmtCompany ? '　御中' : ''));
      put(c, 'B7', d.building); put(c, 'F7', d.reportNo); put(c, 'B8', d.address); put(c, 'F8', d.mgmtCompany);
      put(c, 'B9', dateIn_(sp, d.date)); put(c, 'F9', d.time);
      put(c, 'B10', d.model); put(c, 'F10', d.location); put(c, 'B11', d.supplyType);
      put(c, 'F11', UNITS.slice(0, d.units).join(' / ')); put(c, 'F12', d.inspector);
      [['B16', 'C16', d.sumAbnormal], ['B17', 'C17', d.sumImprove], ['B18', 'C18', d.sumWatch], ['B19', 'C19', d.sumPrev]].forEach(function (r) {
        put(c, r[0], r[2] && r[2].v); put(c, r[1], r[2] && r[2].note); });
      put(c, 'B20', d.overall);
      put(c, 'B35', d.proposals && d.proposals.length ? '有' : '無');
      const t = sp.getSheetByName('02_点検表_入力しやすい版');
      const row = function (no) { return no <= 20 ? 10 + no : no <= 25 ? 11 + no : 12 + no; };
      PUMP_ITEMS.forEach(function (it) {
        const r = row(it.no), res = d.items[it.no] || {};
        ['D', 'E', 'F'].forEach(function (col, i) {
          let v;
          if (i >= d.units || (it.single && i > 0)) v = 'ー';
          else if (it.type === 'num') v = numOrBlank(res.vals && res.vals[i]);
          else v = (res.j && res.j[i]) || '';
          put(t, col + r, v);
        });
        put(t, 'I' + r, res.action || '');
      });
      put(t, 'A43', d.notesPublic);
      const pages = ['03_作業記録写真_A4縦6枚', '03_作業記録写真_A4縦6枚 のコピー'];
      const slots = [];
      pages.forEach(function (p, pi) {
        [['A7:D17', 'A18'], ['E7:H17', 'E18'], ['A21:D31', 'A32'], ['E21:H31', 'E32'], ['A35:D45', 'A46'], ['E35:H45', 'E46']].forEach(function (s, k) {
          slots.push({ sheet: p, box: s[0], label: s[1], page: pi, r: Math.floor(k / 2), c: k % 2 }); });
      });
      placePhotos(sp, orderSlots_(slots, d._order), d.photos, function (sh, s, ph) {
        put(sh, s.label, ph ? '撮影箇所・内容：' + [ph.place, ph.step, ph.comment].filter(String).join('　') : '撮影箇所・内容：');
      });
      const s99 = sp.getSheetByName('99_所見_改善提案');
      put(s99, 'B4', d.overall); put(s99, 'F4', d.proposals && d.proposals.length ? '有' : '無');
      put(s99, 'H4', maxUrgency(d.proposals)); put(s99, 'H3', d.inspector);
      put(s99, 'A9', d.overallNote || '特にありません'); put(s99, 'A20', d.notesPublic);
      for (let i = 0; i < 7; i++) {
        const p = (d.proposals || [])[i] || {}, r = 31 + i;
        put(s99, 'B' + r, p.target || ''); put(s99, 'C' + r, p.content || ''); put(s99, 'F' + r, p.urgency || '');
        put(s99, 'G' + r, p.photoNo || ''); put(s99, 'H' + r, p.due || '');
      }
    }
  },
  itc_pump: {
    kind: 'pump',
    name: '伊藤忠アーバンコミュニティ書式：直結増圧給水ポンプ点検報告書',
    clearImagesOn: ['写真'],
    defaultOrder: 'col',
    fill: function (sp, d) {
      const s = sp.getSheetByName('点検報告書');
      put(s, 'D6', d.building); put(s, 'D8', dateIn_(sp, d.date)); put(s, 'K8', d.inspector);
      const yn = function (o) { return o && o.v ? o.v : '無'; };
      put(s, 'D13', yn(d.sumAbnormal)); put(s, 'E13', (d.sumAbnormal && d.sumAbnormal.note) || '');
      put(s, 'D14', yn(d.sumImprove)); put(s, 'E14', (d.sumImprove && d.sumImprove.note) || '');
      put(s, 'D15', yn(d.sumWatch)); put(s, 'D16', yn(d.sumPrev));
      put(s, 'D19', d.repairDone || '済');
      put(s, 'D22', '有');
      put(s, 'J43', d.maker); put(s, 'J44', d.model);
      PUMP_ITEMS.forEach(function (it) {
        const r = 45 + it.no, res = d.items[it.no] || {};
        ['J', 'K', 'L', 'M', 'N'].forEach(function (col, i) {
          let v = '';
          const active = i < d.units && !(it.single && i > 0);
          if (i >= 3 || !active) v = 'ー';
          else if (it.type === 'num') v = numOrBlank(res.vals && res.vals[i]);
          else if (it.type === 'kpa') v = res.vals && res.vals[0] !== '' && res.vals[0] != null ? res.vals[0] + 'ｋPa' : '';
          else v = itcWord(it.itc, res.j && res.j[i]);
          put(s, col + r, v);
        });
        put(s, 'O' + r, res.action || '');
      });
      put(s, 'A75', '特記事項' + (d.notesPublic ? '\n' + d.notesPublic : ''));
      const slots = [];
      [[2, 28, 7, 10], [31, 57, 36, 39], [60, 86, 65, 68]].forEach(function (band, bi) {
        for (let i = 0; i < 8; i++) {
          const c0 = 2 + 33 * i, c1 = c0 + 21, lc = 24 + 33 * i;
          slots.push({ sheet: '写真', box: colL(c0) + band[0] + ':' + colL(c1) + band[1], label: colL(lc) + band[2], label2: colL(lc) + band[3], clear: colL(lc) + band[2] + ':' + colL(c0 + 32) + band[1], page: Math.floor(i / 3), r: bi, c: i % 3 });
        }
      });
      const ord = orderSlots_(slots, d._order);
      placePhotos(sp, ord, d.photos, function (sh, sl, ph) {
        const cr = sh.getRange(sl.clear); cr.getMergedRanges().forEach(function (m) { m.clearContent(); }); cr.clearContent();/* 書式に残っている見本の文字（「外観」など）を消す */
        put(sh, sl.label, ph ? ph.place : ''); put(sh, sl.label2, ph ? [ph.step, ph.comment].filter(String).join(' ') : '');
      });
      /* 写真が入ったページ数（1ページ＝横3列×縦3段、A4横） */
      d._pages = 1 + ord.slice(0, Math.min((d.photos || []).length, ord.length)).reduce(function (m, s) { return Math.max(m, s.page); }, 0);
    },
    /* PDF：点検報告書はA4縦、写真はA4横（書式の改ページ位置：99列ごと・88行） */
    pdfParts: function (sp, d) {
      const parts = [{ sheet: '点検報告書', portrait: true }];
      for (let k = 0; k < (d._pages || 1); k++) parts.push({ sheet: '写真', portrait: false, fit: 'page', r1: 0, r2: 88, c1: 99 * k, c2: Math.min(99 * (k + 1), 265) });
      return parts;
    }
  }
};
/* ================= 貯水槽清掃・給水設備点検（第2段階） =================
 * 判定：貯水槽点検表は ○△×－、給水装置は 良・要注意・否・該当無し（自社書式の選択肢と同じ）
 */
const TANK_CHK = [
  {id:'t1', sec:'構造', text:'昇降梯子', crit:'設置状況・腐食・安全性'},
  {id:'t2', sec:'構造', text:'点検口', crit:'密閉・施錠・防水・清掃容易性'},
  {id:'t3', sec:'構造', text:'通気管', crit:'防虫網・雨水侵入・詰まり'},
  {id:'t4', sec:'構造', text:'排水管', crit:'排水口との離隔・逆流防止'},
  {id:'t5', sec:'構造', text:'マンホール', crit:'数・位置・大きさ・パッキン'},
  {id:'t6', sec:'衛生', text:'槽内状態', crit:'沈殿物・浮遊物・異物・臭気'},
  {id:'t7', sec:'衛生', text:'周辺環境', crit:'害虫・異物・立入管理'},
  {id:'t8', sec:'維持', text:'漏水', crit:'槽内外の漏水状況'},
  {id:'t9', sec:'維持', text:'電極棒', crit:'作動・汚れ・腐食'},
  {id:'t10', sec:'維持', text:'満減水警報', crit:'警報装置の作動'},
  {id:'t11', sec:'維持', text:'給水ポンプ', crit:'外観・異音・振動・性能'},
  {id:'t12', sec:'維持', text:'定水位弁', crit:'止水・作動・水位'},
  {id:'t13', sec:'維持', text:'配管・弁', crit:'漏水・腐食・支持状態'},
  {id:'t14', sec:'安全', text:'作業環境', crit:'足場・照明・換気・転落リスク'},
  {id:'t15', sec:'書類', text:'記録', crit:'清掃記録・点検記録・連絡先'}
];
const SUP1 = [
  {id:'s1', sec:'貯水槽', text:'外観', crit:'水漏れ・破損・腐食'},
  {id:'s2', sec:'貯水槽', text:'蓋・施錠', crit:'密閉・施錠・ヒンジ'},
  {id:'s3', sec:'貯水槽', text:'給水管', crit:'漏水・支持状態・腐食'},
  {id:'s4', sec:'貯水槽', text:'定水位弁', crit:'完全に止水するか'},
  {id:'s5', sec:'貯水槽', text:'ボールタップ', crit:'発錆・変形・水漏れ'},
  {id:'s6', sec:'ポンプ', text:'外観', crit:'腐食・損傷・水漏れ'},
  {id:'s7', sec:'ポンプ', text:'軸受部', crit:'異臭・異音・振動・熱'},
  {id:'s8', sec:'ポンプ', text:'軸封部', crit:'漏水量が許容範囲内か'},
  {id:'s9', sec:'ポンプ', text:'運転電流', crit:'定格電流以下か'},
  {id:'s10', sec:'ポンプ', text:'吐出圧力', crit:'圧力値を測定'},
  {id:'s11', sec:'電動機', text:'外観', crit:'腐食・損傷・水漏れ'},
  {id:'s12', sec:'電動機', text:'回転状態', crit:'方向・円滑性'},
  {id:'s13', sec:'電動機', text:'絶縁抵抗', crit:'1.0MΩ以上'},
  {id:'s14', sec:'制御盤', text:'マグネット', crit:'異臭・異音・熱・接点劣化'},
  {id:'s15', sec:'制御盤', text:'CPU・リレー', crit:'水滴付着・異常振動'},
  {id:'s16', sec:'制御盤', text:'表示灯', crit:'球切れ・表示不良'}
];
const SUP2 = [
  {id:'u1', sec:'ユニット', text:'圧力スイッチ', crit:'始動・停止圧力を確認'},
  {id:'u2', sec:'ユニット', text:'圧力発信器', crit:'測定値・作動を確認'},
  {id:'u3', sec:'ユニット', text:'追従運転', crit:'正常に作動するか'},
  {id:'u4', sec:'ユニット', text:'フローセンサー', crit:'正常に作動するか'},
  {id:'u5', sec:'ユニット', text:'圧力タンク', crit:'規定圧以内か'},
  {id:'u6', sec:'弁類', text:'フート弁', crit:'正常に開閉するか'},
  {id:'u7', sec:'弁類', text:'逆止弁', crit:'逆流がないか'},
  {id:'u8', sec:'弁類', text:'減圧弁', crit:'一定圧で作動するか'},
  {id:'u9', sec:'弁類', text:'スリース弁', crit:'腐食・損傷・開閉状態'},
  {id:'u10', sec:'配管', text:'配管', crit:'水漏れ・結露・腐食'},
  {id:'u11', sec:'配管', text:'保温材', crit:'剥離・損傷の有無'},
  {id:'u12', sec:'配管', text:'接続部', crit:'異音・異常振動'},
  {id:'u13', sec:'配管', text:'支持金物', crit:'腐食・緩み・変形'},
  {id:'u14', sec:'安全', text:'防振架台', crit:'位置・劣化状態'},
  {id:'u15', sec:'安全', text:'作業環境', crit:'足場・照明・換気'}
];
const CHK_GROUPS = [
  {key:'tank', title:'貯水槽清掃点検表', opts:['○','△','×','－'], ok:'○', multi:false, items:TANK_CHK},
  {key:'sup1', title:'給水装置 保守点検（1/2）貯水槽・ポンプ・電動機・制御盤', opts:['良','要注意','否','該当無し'], ok:'良', multi:true, items:SUP1},
  {key:'sup2', title:'給水装置 保守点検（2/2）ユニット・弁類・配管', opts:['良','要注意','否','該当無し'], ok:'良', multi:false, items:SUP2}
];
function cj_(d, g, id) { return ((d.chk || {})[g] || {})[id] || {}; }
function sev_(v) { return (v === '否' || v === '×' || v === '要是正') ? 2 : (v === '要注意' || v === '△') ? 1 : (v === '良' || v === '○') ? 0 : -1; }
/* いくつかの判定のうち一番悪いもの（良・要注意・否）。判定が1つも無ければ空 */
function worst_(vals) { const m = vals.reduce(function (a, v) { return Math.max(a, sev_(v)); }, -1); return m < 0 ? '' : ['良', '要注意', '否'][m]; }
function chkVals_(d, g, ids) { let out = []; ids.forEach(function (id) { out = out.concat(cj_(d, g, id).j || []); }); return out; }
function ids_(list, from, to) { return list.slice(from, to).map(function (x) { return x.id; }); }

TEMPLATES.sc_tank = {
  kind: 'tank',
  name: '自社書式：貯水槽清掃・給水設備点検報告書',
  defaultOrder: 'row',
  fill: function (sp, d) {
    const T = d.tanks || [];
    const first = function (k) { return T.filter(function (t) { return t.kind === k; })[0] || {}; };
    /* 表紙 */
    const c = sp.getSheetByName('表紙_A4縦');
    put(c, 'C10', d.building); put(c, 'C11', d.workContent || '給水設備点検・貯水槽清掃・水質検査');
    put(c, 'C12', dateIn_(sp, d.date)); put(c, 'C13', d.address);
    put(c, 'C14', (d.submitMode === 'mgmt' ? '' : d.submitTo) || (d.mgmtCompany ? d.mgmtCompany + '　御中' : ''));
    /* 清掃作業報告書 */
    const w = sp.getSheetByName('清掃作業報告書_A4縦');
    put(w, 'H3', d.weather); put(w, 'H4', d.reportNo); put(w, 'B5', d.time); put(w, 'F5', d.cutoffTime);
    put(w, 'B6', d.inspector); put(w, 'F6', d.workers || d.inspector);
    const t0 = T[0] || {}; put(w, 'B7', t0.kind || ''); put(w, 'F7', t0.cap || ''); put(w, 'H7', t0.material || '');
    put(w, 'B9', d.remarks || '');
    const rowsOf = { '受水槽': [0, 1], '高置水槽': [2, 3], 'その他': [4, 5] }, used = {};
    const grid = [0, 1, 2, 3, 4, 5].map(function () { return ['', '', '', '', '', '', '']; });
    T.forEach(function (t) {
      const kk = rowsOf[t.kind] ? t.kind : 'その他', n = used[kk] || 0;
      if (n >= 2) return; used[kk] = n + 1;
      grid[rowsOf[kk][n]] = [t.no || '', t.start || '', t.drain || '', t.clean || '', t.disinfect || '', t.fill || '', t.end || ''];
    });
    w.getRange('B13:H18').setValues(grid);
    put(w, 'B21', d.chemName); put(w, 'F21', d.dilution);
    [['受水槽', 22], ['高置水槽', 23]].forEach(function (x) {
      const t = first(x[0]);
      w.getRange('C' + x[1]).setValue(t.dis1 || ''); w.getRange('E' + x[1]).setValue(t.dis2 || ''); put(w, 'G' + x[1], t.contact || '');
    });
    put(w, 'B24', d.rust || '無'); put(w, 'E24', d.rust === '有' ? (d.rustName || '') : '');
    put(w, 'B25', d.paint || '無'); put(w, 'E25', d.paint === '有' ? (d.paintPlace || '') : '');
    put(w, 'A28', d.overallNote || '特にありません'); put(w, 'F38', d.inspector);
    /* 貯水槽点検表 */
    const k = sp.getSheetByName('貯水槽点検表_A4縦');
    k.getRange('B4:H5').setValues(['受水槽', '高置水槽'].map(function (kind) {
      const t = first(kind); return [t.no || '', t.cap || '', t.material || '', t.structure || '', t.place || '', t.judge || '', t.photo || ''];
    }));
    k.getRange('D9:G23').setValues(TANK_CHK.map(function (it) { const r = cj_(d, 'tank', it.id); return [(r.j || [])[0] || '', r.note || '', '', r.photo || '']; }));
    ['受水槽', '高置水槽'].forEach(function (kind, i) {
      const t = first(kind);
      k.getRange(i ? 'E29:E34' : 'B29:B34').setValues([[t.maker || ''], [t.model || ''], [t.cap || ''], [t.drainPos || ''], [t.pit || ''], [t.frame || '']]);
    });
    /* 給水装置 保守点検（1/2） */
    const units = Number(d.units) || 1;
    const s4 = sp.getSheetByName('給水設備点検1_A4縦');
    put(s4, 'H3', d.inspector);
    const tankJ = chkVals_(d, 'tank', ids_(TANK_CHK, 0, 15)).concat(T.map(function (t) { return t.judge; }));
    s4.getRange('B6:E6').setValues([[
      worst_(chkVals_(d, 'sup1', ids_(SUP1, 5, 13))),
      worst_(chkVals_(d, 'sup1', ids_(SUP1, 0, 5)).concat(tankJ)),
      worst_(chkVals_(d, 'sup1', ids_(SUP1, 13, 16))),
      worst_(chkVals_(d, 'sup2', ids_(SUP2, 0, 15)))]]);
    s4.getRange('D10:H25').setValues(SUP1.map(function (it) {
      const r = cj_(d, 'sup1', it.id), j = r.j || [];
      return [j[0] || '', units > 1 ? (j[1] || '') : '', r.note || '', r.remark || '', r.photo || ''];
    }));
    s4.getRange('B26:H26').setValues([['', '', '', '', '', '', '']]);
    put(s4, 'A29', d.notesPublic || '');
    /* 給水装置 保守点検（2/2） */
    const s5 = sp.getSheetByName('給水設備点検2_A4縦');
    s5.getRange('D5:H19').setValues(SUP2.map(function (it) { const r = cj_(d, 'sup2', it.id); return [(r.j || [])[0] || '', r.note || '', '', r.remark || '', r.photo || '']; }));
    s5.getRange('B20:H24').setValues([0, 1, 2, 3, 4].map(function () { return ['', '', '', '', '', '', '']; }));
    put(s5, 'A27', d.supplyNote2 || '');
    /* 改善提案書 */
    const s9 = sp.getSheetByName('改善提案書_A4縦'), P = d.proposals || [];
    put(s9, 'B6', d.inspector);
    put(s9, 'B7', P.length ? P.map(function (p) { return p.target; }).filter(String).join('、') : '特にありません');
    put(s9, 'B8', P.length ? (P[0].content || P[0].target || '') : '');
    put(s9, 'B9', maxUrgency(P) || '低'); put(s9, 'F9', P.length ? '要' : '不要');
    put(s9, 'A12', P.length ? P.map(function (p) { return '・' + [p.target, p.content].filter(String).join('：') + (p.due ? '（対応目安：' + p.due + '）' : '') + (p.photoNo ? '［写真No.' + p.photoNo + '］' : ''); }).join('\n') : '特にありません');
    put(s9, 'A23', ''); put(s9, 'F35', d.inspector);
    /* 写真：表紙に建物全景、作業記録写真に6枚ずつ */
    const pages = sp.getSheets().filter(function (s) { return s.getName().indexOf('作業記録写真') === 0; });
    pages.concat([c]).forEach(function (s) { s.getImages().forEach(function (im) { im.remove(); }); });
    const photos = d.photos || [];
    const cover = photos.filter(function (p) { return p.place === '建物全景'; })[0] || photos[0];
    c.getRange('B20:G29').clearContent();
    if (cover) placePhotos(sp, [{ sheet: c.getName(), box: 'B20:G29' }], [cover], function () {});
    const slots = [];
    pages.forEach(function (p, pi) {
      put(p, 'F4', d.inspector);
      [['A8:D14', 'B15', 'D15', 'B17'], ['E8:H14', 'F15', 'H15', 'F17'], ['A19:D25', 'B26', 'D26', 'B28'], ['E19:H25', 'F26', 'H26', 'F28'], ['A30:D36', 'B37', 'D37', 'B39'], ['E30:H36', 'F37', 'H37', 'F39']].forEach(function (s, q) {
        slots.push({ sheet: p.getName(), box: s[0], place: s[1], step: s[2], comment: s[3], page: pi, r: Math.floor(q / 2), c: q % 2 }); });
    });
    placePhotos(sp, orderSlots_(slots, d._order), photos, function (sh, sl, ph) {
      put(sh, sl.place, ph ? ph.place : ''); put(sh, sl.step, ph ? ph.step || '' : ''); put(sh, sl.comment, ph ? ph.comment || '' : '');
    });
    /* 使わない写真ページと空のシートはPDFに出さない */
    const need = Math.max(1, Math.ceil(photos.length / 6));
    pages.forEach(function (p, i) { if (i >= need) p.hideSheet(); });
    sp.getSheets().forEach(function (s) { if (/^(シート|Sheet)\d+$/.test(s.getName())) s.hideSheet(); });
  }
};
/* 自社書式（貯水槽）の空欄の原本を作る：見本の報告書をコピーして中身を消し、設定に登録する（1回だけ実行） */
function makeBlankTankTemplate() {
  const src = idFromUrl(DEFAULT_TPL.sc_tank);
  const sp = SpreadsheetApp.openById(copyAsSheet_(src, '【書式】自社_貯水槽清掃・給水設備点検報告書（空欄）', PROPS.getProperty('rootId')));
  TEMPLATES.sc_tank.fill(sp, { tanks: [], chk: {}, photos: [], proposals: [], units: 2, overallNote: ' ' });
  const g = function (n) { return sp.getSheetByName(n); };
  [['表紙_A4縦', ['C11']], ['清掃作業報告書_A4縦', ['A28', 'B24', 'B25', 'F38']], ['改善提案書_A4縦', ['B7', 'B9', 'F9', 'A12', 'F35']]].forEach(function (x) {
    x[1].forEach(function (a) { put(g(x[0]), a, ''); }); });
  sp.getSheets().forEach(function (s) { if (!/^(シート|Sheet)\d+$/.test(s.getName())) s.showSheet(); });
  SpreadsheetApp.flush();
  const st = getSettings_(); st.tpl_sc_tank = sp.getUrl(); api_saveSettings(st);
  return sp.getUrl();
}
/* 伊藤忠書式の貯水槽清掃報告書【総括表】：自社の点検結果からまとめて書き込む */
const ITC_TANK_ROWS = [
  ['tank', ['t6']], ['tank', ['t8']], ['tank', ['t2', 't5']], ['tank', ['t3', 't4']], ['tank', ['t9', 't10', 't12']], ['tank', ['t11']], ['seven', []], ['water', []], ['tank', ['t1', 't7', 't14']]
];
TEMPLATES.itc_tank = {
  kind: 'tank',
  name: '伊藤忠アーバンコミュニティ書式：貯水槽清掃報告書【総括表】',
  noPhotos: true,
  fill: function (sp, d) {
    const s = sp.getSheetByName('報告書+概略図');
    put(s, 'D5', d.building); put(s, 'K5', d.companyName || 'SunsCreate');
    put(s, 'D7', dateIn_(sp, d.date)); put(s, 'K7', d.inspector);
    s.getRange('D7').setNumberFormat('yyyy"年"m"月"d"日"');
    put(s, 'C21', '貯水槽等の清掃・点検\n【受水槽・高置水槽等】'); s.getRange('C21').setWrap(true).setHorizontalAlignment('center');
    const ng = d.overall && d.overall !== '良';
    put(s, 'D10', ng ? '' : '異常なし'); put(s, 'G10', ng ? '異常あり' : '');
    const lines = String(d.overallNote || '特にありません').split(/\n/);
    for (let i = 0; i < 5; i++) put(s, 'D' + (11 + i), i < 4 ? (lines[i] || '') : lines.slice(4).join('　'));
    put(s, 'D16', '添付資料　有');
    s.getRange('L21:O29').setValues(ITC_TANK_ROWS.map(function (row) {
      let w;
      if (row[0] === 'water') w = d.waterTest || '';
      else if (row[0] === 'seven') w = worst_(chkVals_(d, 'tank', ['t13']).concat(chkVals_(d, 'sup1', ids_(SUP1, 13, 16)), chkVals_(d, 'sup2', ids_(SUP2, 5, 13))));
      else w = worst_(chkVals_(d, 'tank', row[1]));
      const v = sev_(w);
      if (v < 0) return ['', '', '', ''];
      return [v < 2 ? '○' : '', v === 2 ? '○' : '', v === 0 ? '○' : '', v > 0 ? '○' : ''];
    })).setFontFamily('Noto Sans JP').setFontSize(11).setHorizontalAlignment('center').setVerticalAlignment('middle');
    put(s, 'B31', d.notesPublic || '');
    sp.getSheets().forEach(function (x) { if (x.getName() !== '報告書+概略図') x.hideSheet(); });
  },
  /* 1枚目：総括表（A〜O列）、2枚目：概略図（P〜Z列）。どちらもA4縦 */
  pdfParts: function () {
    return [{ sheet: '報告書+概略図', portrait: true, fit: 'page', r1: 0, r2: 36, c1: 0, c2: 15 },
            { sheet: '報告書+概略図', portrait: true, fit: 'page', r1: 0, r2: 36, c1: 15, c2: 26 }];
  }
};
/* 伊藤忠書式の「有・無」「良・否」欄：選んだほうだけを残す（もう一方は消す） */
function itcWord(kind, j) {
  if (!j || j === 'ー') return j || '';
  const ok = j === '良';
  if (kind === 'ryo') return ok ? '良' : '否';
  if (kind === 'ari') return ok ? '有' : '無';
  return ok ? '無' : '有';
}

/* ================= 初期設定 ================= */
function setup() {
  let root = PROPS.getProperty('rootId') && safeFolder(PROPS.getProperty('rootId'));
  if (!root) { root = DriveApp.createFolder(APP_NAME); PROPS.setProperty('rootId', root.getId()); }
  ['報告書', '写真'].forEach(function (n) {
    const key = n === '報告書' ? 'reportsId' : 'photosId';
    if (!PROPS.getProperty(key) || !safeFolder(PROPS.getProperty(key))) PROPS.setProperty(key, root.createFolder(n).getId());
  });
  let db = PROPS.getProperty('dbId') && safeFile(PROPS.getProperty('dbId'));
  if (!db) {
    const sp = SpreadsheetApp.create(APP_NAME + '_台帳');
    DriveApp.getFileById(sp.getId()).moveTo(root);
    PROPS.setProperty('dbId', sp.getId());
    const first = sp.getSheets()[0]; first.setName('物件');
    sheetHead(first, ['id', 'json', 'updatedAt']);
    sheetHead(sp.insertSheet('点検'), ['id', 'json', 'updatedAt']);
    sheetHead(sp.insertSheet('設定'), ['key', 'value']);
  }
  return 'OK：ドライブに「' + APP_NAME + '」フォルダを作りました';
}
function sheetHead(sh, cols) { sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold'); sh.setFrozenRows(1); }
function safeFolder(id) { try { return DriveApp.getFolderById(id); } catch (e) { return null; } }
function safeFile(id) { try { return DriveApp.getFileById(id); } catch (e) { return null; } }
function db_() { if (!PROPS.getProperty('dbId')) setup(); return SpreadsheetApp.openById(PROPS.getProperty('dbId')); }

/* ================= Webアプリ ================= */
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('設備点検報告').addMetaTag('viewport', 'width=device-width,initial-scale=1');
}

/* ---- 汎用の保存（1行＝1件をJSONで保存） ---- */
function listRows_(name) {
  const sh = db_().getSheetByName(name), n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, 3).getValues().filter(function (r) { return r[0]; })
    .map(function (r) { const o = JSON.parse(r[1] || '{}'); o.id = r[0]; o.updatedAt = r[2]; return o; });
}
function saveRow_(name, obj) {
  const sh = db_().getSheetByName(name);
  if (!obj.id) obj.id = Utilities.getUuid().slice(0, 8);
  const now = new Date().toISOString(), json = JSON.stringify(obj);
  if (json.length > 49000) throw new Error('データが大きすぎます（写真は別に保存してください）');
  const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
  const i = ids.indexOf(obj.id);
  if (i >= 0) sh.getRange(i + 2, 1, 1, 3).setValues([[obj.id, json, now]]);
  else sh.appendRow([obj.id, json, now]);
  obj.updatedAt = now; return obj;
}
function deleteRow_(name, id) {
  const sh = db_().getSheetByName(name);
  const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
  const i = ids.indexOf(id); if (i >= 0) sh.deleteRow(i + 2);
}

/* ---- 画面から呼ぶ関数 ---- */
function api_init() {
  const ctypes = loadCustom_();
  return { ctypes: ctypes, items: PUMP_ITEMS, chkGroups: CHK_GROUPS, templates: Object.keys(TEMPLATES).map(function (k) { return { key: k, kind: TEMPLATES[k].kind || 'pump', name: TEMPLATES[k].name, defaultOrder: TEMPLATES[k].defaultOrder || 'row', noPhotos: !!TEMPLATES[k].noPhotos }; }),
    props: listRows_('物件'), insps: listRows_('点検').map(function (x) { return { id: x.id, kind: x.kind || 'pump', building: x.building, date: x.date, status: x.status, reports: x.reports || [], updatedAt: x.updatedAt }; }),
    settings: getSettings_(), due: dueList_() };
}
function api_saveProp(p) { return saveRow_('物件', p); }

/* ================= 次回の点検予定と通知 =================
 * 次回予定日 ＝ その物件の前回の点検日 ＋ 物件ごとの周期（月。初期値12か月、0は対象外）
 * 通知：毎朝7時に確認し、30日前（設定で変更可）・7日前・期限切れの3回、メールで知らせる（同じ段階は1回だけ）
 */
const KIND_NAME = { pump: '増圧ポンプ点検', tank: '貯水槽清掃・給水設備点検', drain: '排水管洗浄' };
function ymd_(d) { return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd'); }
function addMonths_(s, n) {
  const p = String(s).split('-').map(Number), y = p[0], m = p[1] - 1 + n, last = new Date(y, m + 1, 0).getDate();
  return ymd_(new Date(y, m, Math.min(p[2], last), 12));
}
function daysBetween_(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
function dueList_() {
  const props = listRows_('物件'), insps = listRows_('点検'), today = ymd_(new Date()), out = [];
  props.forEach(function (p) {
    ['pump', 'tank', 'drain'].forEach(function (k) {
      const cyc = p['cycle_' + k] === '' || p['cycle_' + k] == null ? 12 : Number(p['cycle_' + k]);
      if (!cyc) return;
      const last = insps.filter(function (x) { return x.propId === p.id && (x.kind || 'pump') === k && x.date; })
        .sort(function (a, b) { return b.date.localeCompare(a.date); })[0];
      if (!last) return;
      const next = addMonths_(last.date, cyc);
      out.push({ propId: p.id, building: p.building, kind: k, kindName: KIND_NAME[k], last: last.date, next: next, cycle: cyc, days: daysBetween_(today, next) });
    });
  });
  return out.sort(function (a, b) { return a.next.localeCompare(b.next); });
}
function api_dueList() { return dueList_(); }
function notifyDue() {
  const st = getSettings_(), lead = Number(st.notifyDays || 30);
  const sent = JSON.parse(PROPS.getProperty('notified') || '{}'), hits = [];
  dueList_().forEach(function (x) {
    const stage = x.days < 0 ? 3 : x.days <= 7 ? 2 : x.days <= lead ? 1 : 0, key = x.propId + '|' + x.kind + '|' + x.next;
    if (stage && (sent[key] || 0) < stage) { hits.push(x); sent[key] = stage; }
  });
  if (!hits.length) return 'なし';
  const to = st.notifyEmail || Session.getEffectiveUser().getEmail(), url = ScriptApp.getService().getUrl();
  const lines = hits.map(function (x) {
    return '・' + x.building + '／' + x.kindName + '：次回 ' + x.next + '（' + (x.days < 0 ? '期限を' + (-x.days) + '日過ぎています' : 'あと' + x.days + '日') + '）　前回 ' + x.last;
  });
  MailApp.sendEmail(to, '【点検予定】' + hits.length + '件の点検が近づいています', '次の点検の予定が近づいています。\n\n' + lines.join('\n') + '\n\n設備点検報告システム：' + url + '\n（このメールは自動で送っています）');
  PROPS.setProperty('notified', JSON.stringify(sent));
  return hits.length + '件を通知';
}
/* ================= 予定（Googleカレンダーと双方向） =================
 * 専用カレンダー「設備点検の予定（Sun'sCreate）」をこのアカウントに作り、画面からも Googleカレンダーからも同じ予定を扱う。
 * タイトル＝【種類】物件名、場所＝住所、説明＝物件名・住所・時間・種類・詳細。アプリ用の情報はタグに入れる。
 */
const EV_KIND = { pump: '増圧ポンプ点検', tank: '貯水槽清掃', drain: '排水管洗浄', other: 'その他' };
function cal_() {
  const id = PROPS.getProperty('calId');
  let c = id ? CalendarApp.getCalendarById(id) : null;
  if (!c) {
    c = CalendarApp.createCalendar("設備点検の予定（Sun'sCreate）", { timeZone: 'Asia/Tokyo', color: CalendarApp.Color.TEAL });
    PROPS.setProperty('calId', c.getId());
  }
  return c;
}
function hm_(d) { return Utilities.formatDate(d, 'Asia/Tokyo', 'H:mm'); }
function evOut_(e) {
  const s = e.getStartTime(), en = e.getEndTime(), all = e.isAllDayEvent();
  const title = e.getTitle(), m = title.match(/^【(.+?)】\s*(.*)$/), desc = e.getDescription() || '';
  const dm = desc.match(/詳細：\n?([\s\S]*)$/);
  return { id: e.getId(), title: title, date: ymd_(s), start: all ? '' : hm_(s), end: all ? '' : hm_(en), allDay: all,
    building: e.getTag('building') || (m ? m[2] : title), address: e.getLocation() || '',
    kind: e.getTag('kind') || (m ? (Object.keys(EV_KIND).filter(function (k) { return EV_KIND[k] === m[1]; })[0] || 'other') : 'other'),
    propId: e.getTag('propId') || '', detail: dm ? dm[1].trim() : (e.getTag('kind') ? '' : desc) };
}
function api_events(from, to) {
  const a = new Date(from + 'T00:00:00+09:00'), b = new Date(to + 'T23:59:59+09:00'), own = cal_(), oid = own.getId();
  let out = own.getEvents(a, b).map(evOut_);
  /* 自分のGoogleカレンダー（このシステム専用以外）の予定も表示する。ここでは見るだけ（変更はGoogleカレンダーで） */
  CalendarApp.getAllOwnedCalendars().forEach(function (c) {
    if (c.getId() === oid) return;
    try {
      c.getEvents(a, b).forEach(function (e) {
        const o = evOut_(e), t = o.title;
        if (o.kind === 'other') o.kind = /貯水槽|受水槽/.test(t) ? 'tank' : /ポンプ/.test(t) ? 'pump' : /排水/.test(t) ? 'drain' : 'other';
        o.ro = true; o.calName = c.getName(); out.push(o);
      });
    } catch (x) {}
  });
  /* 日本の祝日（Googleの祝日カレンダー。未登録なら自動で追加） */
  try {
    const HID = 'ja.japanese#holiday@group.v.calendar.google.com';
    const h = CalendarApp.getCalendarById(HID) || CalendarApp.subscribeToCalendar(HID, { hidden: false, selected: true });
    h.getEvents(a, b).forEach(function (e) { const o = evOut_(e); o.kind = 'other'; o.ro = true; o.holiday = true; o.calName = '日本の祝日'; out.push(o); });
  } catch (x) {}
  return out.sort(function (x, y) { return (x.date + (x.start || '').padStart(5, '0')).localeCompare(y.date + (y.start || '').padStart(5, '0')); });
}
function api_saveEvent(o) {
  const c = cal_(), d = o.date;
  if (!d) throw new Error('日付を入れてください');
  const title = '【' + (EV_KIND[o.kind] || 'その他') + '】' + (o.building || '');
  const desc = ['物件名：' + (o.building || ''), '住所：' + (o.address || ''), '時間：' + (o.start ? o.start + (o.end ? '〜' + o.end : '') : '終日'),
    '種類：' + (EV_KIND[o.kind] || 'その他'), '', '詳細：', o.detail || ''].join('\n');
  const t = function (hm) { return new Date(d + 'T' + ('0' + hm).slice(-5) + ':00+09:00'); };
  let e = o.id ? c.getEventById(o.id) : null;
  if (o.start) {
    const st = t(o.start), en = o.end ? t(o.end) : new Date(st.getTime() + 3600000);
    if (en <= st) throw new Error('終了時刻は開始より後にしてください');
    if (e) e.setTime(st, en); else e = c.createEvent(title, st, en);
  } else {
    const day = new Date(d + 'T00:00:00+09:00');
    if (e) e.setAllDayDate(day); else e = c.createAllDayEvent(title, day);
  }
  e.setTitle(title).setLocation(o.address || '').setDescription(desc);
  e.setTag('building', o.building || ''); e.setTag('kind', o.kind || 'other'); e.setTag('propId', o.propId || '');
  return evOut_(e);
}
function api_deleteEvent(id) { const e = cal_().getEventById(id); if (e) e.deleteEvent(); return true; }
function api_calUrl() { return 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(cal_().getId()); }
/* 同期ボタン：専用カレンダーを自分のGoogleカレンダーの一覧に表示・選択状態にして、今日から60日分の件数を返す */
function api_calSync() {
  const c = cal_();
  try { c.setHidden(false); c.setSelected(true); } catch (e) {}
  const now = new Date(), end = new Date(now.getTime() + 60 * 86400000);
  PROPS.setProperty('calSyncedAt', new Date().toISOString());
  return { name: c.getName(), count: api_events(ymd_(now), ymd_(end)).length, at: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d H:mm') };
}

/* ================= freee：見積書の下書き =================
 * freeeの開発者アプリ（Client ID／Secret）でこのシステムとfreeeをつなぐ。シークレットとトークンはスクリプトの中だけに保存し、画面には出さない。
 * 外注の明細は、外注費に20％を上乗せした金額を単価にする。
 */
const FREEE_ACC = 'https://accounts.secure.freee.co.jp/public_api', FREEE_OOB = 'urn:ietf:wg:oauth:2.0:oob', MARKUP = 1.2;
function api_freeeStatus() {
  const t = JSON.parse(PROPS.getProperty('freeeTok') || 'null');
  return { clientId: PROPS.getProperty('freeeClientId') || '', hasSecret: !!PROPS.getProperty('freeeSecret'), connected: !!t, company: t ? t.company : null };
}
function api_freeeAuthUrl(clientId, secret) {
  if (!clientId) throw new Error('Client ID を入れてください');
  PROPS.setProperty('freeeClientId', clientId.trim());
  if (secret) PROPS.setProperty('freeeSecret', secret.trim());
  if (!PROPS.getProperty('freeeSecret')) throw new Error('Client Secret を入れてください');
  return FREEE_ACC + '/authorize?client_id=' + encodeURIComponent(clientId.trim()) + '&redirect_uri=' + encodeURIComponent(FREEE_OOB) + '&response_type=code&prompt=select_company';
}
function api_freeeConnect(code) {
  if (!code) throw new Error('認可コードを貼り付けてください');
  freeeToken_({ grant_type: 'authorization_code', code: String(code).trim(), redirect_uri: FREEE_OOB });
  freeeAccess_();
  return api_freeeStatus();
}
function api_freeeDisconnect() { PROPS.deleteProperty('freeeTok'); return api_freeeStatus(); }
function freeeToken_(p) {
  const r = UrlFetchApp.fetch(FREEE_ACC + '/token', { method: 'post', muteHttpExceptions: true,
    payload: Object.assign({ client_id: PROPS.getProperty('freeeClientId'), client_secret: PROPS.getProperty('freeeSecret') || '' }, p) });
  let j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) {}
  if (!j.access_token) throw new Error('freeeとの接続に失敗しました（' + (j.error_description || j.error || r.getResponseCode()) + '）');
  const old = JSON.parse(PROPS.getProperty('freeeTok') || '{}');
  PROPS.setProperty('freeeTok', JSON.stringify({ a: j.access_token, r: j.refresh_token || old.r, exp: Date.now() + (Number(j.expires_in || 21600) - 300) * 1000, company: j.company_id || old.company || null }));
}
function freeeAccess_() {
  let t = JSON.parse(PROPS.getProperty('freeeTok') || 'null');
  if (!t) throw new Error('設定画面で freee とつないでください');
  if (Date.now() >= t.exp) { freeeToken_({ grant_type: 'refresh_token', refresh_token: t.r }); t = JSON.parse(PROPS.getProperty('freeeTok')); }
  if (!t.company) {
    const r = JSON.parse(UrlFetchApp.fetch('https://api.freee.co.jp/api/1/companies', { headers: { Authorization: 'Bearer ' + t.a } }).getContentText());
    t.company = (r.companies || [])[0] && r.companies[0].id; PROPS.setProperty('freeeTok', JSON.stringify(t));
  }
  return t;
}
function freee_(method, url, body) {
  const t = freeeAccess_(), o = { method: method, headers: { Authorization: 'Bearer ' + t.a }, muteHttpExceptions: true };
  if (body) { body.company_id = t.company; o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
  const r = UrlFetchApp.fetch(url.replace('{c}', t.company), o), txt = r.getContentText();
  if (r.getResponseCode() >= 300) {
    let m = txt; try { const j = JSON.parse(txt); m = (j.errors || []).map(function (e) { return (e.messages || []).join(' '); }).join(' ') || j.message || txt; } catch (e) {}
    throw new Error('freee：' + String(m).slice(0, 300));
  }
  return JSON.parse(txt);
}
function api_freeePartners() {
  const r = freee_('get', 'https://api.freee.co.jp/api/1/partners?company_id={c}&limit=3000');
  return (r.partners || []).map(function (p) { return { id: p.id, name: p.name }; });
}
function api_freeeTemplates() {
  const r = freee_('get', 'https://api.freee.co.jp/iv/quotations/templates?company_id={c}');
  return (r.templates || []).map(function (t) { return { id: t.id, name: t.name }; });
}
/* 見積書の下書きを作る（freeeでは「未送付」の見積書として入る。送付はfreeeで確認してから） */
function api_makeQuote(inspId, q) {
  const d = api_getInsp(inspId); if (!d) throw new Error('点検データが見つかりません');
  if (!q.partnerId) throw new Error('取引先を選んでください');
  const lines = (q.lines || []).filter(function (l) { return l.desc; });
  if (!lines.length) throw new Error('明細を1行以上入れてください');
  let tpl = Number(getSettings_().freeeTemplateId) || 0;
  if (!tpl) { const ts = api_freeeTemplates(); if (!ts.length) throw new Error('freeeに見積書のテンプレートがありません'); tpl = ts[0].id; }
  const item = function (l) {
    const price = l.out ? Math.round(Number(l.cost || 0) * MARKUP) : Number(l.price || 0);
    return { type: 'item', description: l.desc, quantity: Number(l.qty || 1), unit: l.unit || '式', unit_price: String(price), tax_rate: 10 };
  };
  const body = {
    quotation_date: q.date || ymd_(new Date()), partner_id: Number(q.partnerId), partner_title: q.title || '御中', subject: q.subject || (d.building + '　改善工事'),
    template_id: tpl, tax_entry_method: 'out', tax_fraction: 'omit', line_amount_fraction: 'omit', withholding_tax_entry_method: 'out',
    quotation_note: q.note || '', memo: '設備点検報告システムから作成（' + (d.building || '') + ' ' + (d.date || '') + ' の点検）',
    lines: [{ type: 'text', description: q.subject || (d.building + '　改善工事') }, { type: 'text', description: '施工費' }].concat(lines.filter(function (l) { return !l.misc; }).map(item))
      .concat(lines.some(function (l) { return l.misc; }) ? [{ type: 'text', description: '　' }, { type: 'text', description: '諸経費' }].concat(lines.filter(function (l) { return l.misc; }).map(item)) : [])
  };
  const r = freee_('post', 'https://api.freee.co.jp/iv/quotations', body).quotation;
  d.quoteDraft = q;
  d.quote = { id: r.id, number: r.quotation_number, total: r.total_amount, url: 'https://invoice.secure.freee.co.jp/quotations/' + r.id, report: r.report_url || '', at: new Date().toISOString() };
  saveRow_('点検', d);
  return d.quote;
}

/* 通知のテスト送信（届くかの確認用） */
function sendTestNotify() {
  const st = getSettings_(), to = st.notifyEmail || Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(to, '【点検予定】テスト送信', '設備点検報告システムからの通知テストです。\n実際の通知は、次回の予定日が近づいたときに毎朝7時に届きます。\n\n' + ScriptApp.getService().getUrl());
  return to + ' に送信しました（自動実行：' + ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'notifyDue'; }).length + '件）';
}
/* 通知をオンにする（毎朝7時）。2回実行しても1つだけ */
function setupNotify() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'notifyDue') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('notifyDue').timeBased().everyDays(1).atHour(7).inTimezone('Asia/Tokyo').create();
  return notifyDue();
}
function api_deleteProp(id) { deleteRow_('物件', id); return true; }
function api_getInsp(id) { return listRows_('点検').filter(function (x) { return x.id === id; })[0] || null; }
function api_saveInsp(d) { return saveRow_('点検', d); }
function api_deleteInsp(id) { deleteRow_('点検', id); return true; }
function api_lastInspFor(propId, kind) {
  const list = listRows_('点検').filter(function (x) { return x.propId === propId && (x.kind || 'pump') === (kind || 'pump'); }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
  return list[0] || null;
}
function getSettings_() {
  const sh = db_().getSheetByName('設定'), n = sh.getLastRow(), o = {};
  if (n > 1) sh.getRange(2, 1, n - 1, 2).getValues().forEach(function (r) { if (r[0]) o[r[0]] = r[1]; });
  Object.keys(DEFAULT_TPL).forEach(function (k) { if (!o['tpl_' + k]) o['tpl_' + k] = DEFAULT_TPL[k]; });
  return o;
}
function api_saveSettings(o) {
  const sh = db_().getSheetByName('設定');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  const rows = Object.keys(o).map(function (k) { return [k, o[k]]; });
  if (rows.length) sh.getRange(2, 1, rows.length, 2).setValues(rows);
  return getSettings_();
}
/* 写真：画面で縮小したJPEGを受け取り、ドライブに保存 */
function api_uploadPhoto(dataUrl, name) {
  const m = String(dataUrl).match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) throw new Error('写真の形式が読み取れません');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name || 'photo.jpg');
  const f = DriveApp.getFolderById(PROPS.getProperty('photosId')).createFile(blob);
  return { fileId: f.getId() };
}
function api_photoThumb(fileId) {
  const b = DriveApp.getFileById(fileId).getBlob();
  return 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes());
}

/* ================= 報告書を作る ================= */
/* 進み具合（％）：作成中に画面から問い合わせる */
let JOB_ = null;
function prog_(p, m) { if (JOB_) CacheService.getUserCache().put('job_' + JOB_, JSON.stringify({ p: Math.round(p), m: m || '' }), 600); }
function api_progress(jobId) { const v = CacheService.getUserCache().get('job_' + jobId); return v ? JSON.parse(v) : { p: 0, m: '' }; }
async function api_makeReport(inspId, tplKey, jobId) {
  JOB_ = jobId || null; prog_(3, '準備');
  loadCustom_();
  const d = api_getInsp(inspId); if (!d) throw new Error('点検データが見つかりません');
  const tpl = TEMPLATES[tplKey]; if (!tpl) throw new Error('書式が見つかりません');
  const st = getSettings_(), url = st['tpl_' + tplKey];
  if (!url) throw new Error('設定画面で「' + tpl.name + '」のURLを登録してください');
  const srcId = idFromUrl(url);
  const title = (d.date || '').replace(/-/g, '') + '_' + (d.building || '') + '_' + tpl.name.replace(/^.*：/, '');
  d._order = st['order_' + tplKey] || tpl.defaultOrder || 'row';
  const old = (d.reports || []).filter(function (r) { return r.tpl === tplKey; })[0];
  let cur = null;
  if (old && old.snapId && old.sheetUrl) { try { cur = SpreadsheetApp.openByUrl(old.sheetUrl); if (DriveApp.getFileById(cur.getId()).isTrashed()) cur = null; /* ゴミ箱の報告書は直さず、新しく作る */ } catch (e) { cur = null; } }
  let sp, snap, changed = 0;
  if (cur) {
    /* 作成済みの報告書を、変わった所だけ直す（作業用の写しは作らない。手直しした箇所は、入力が変わっていなければ残す） */
    prog_(10, '変わった所を確認');
    const prev = readSnap_(old.snapId);
    const vb = diffBook_(cur, prev);
    try {
      PHOTO_REC_ = [];
      prog_(30, '変わった所を直しています');
      tpl.fill(vb.sp, d);
      changed = vb.count();
      const sig = photoSig_(d);
      if (sig !== old.photoSig) {
        prog_(55, '写真を貼り直し');
        const rec = PHOTO_REC_; PHOTO_REC_ = null;
        rec.forEach(function (x) {
          x.slots.forEach(function (sl) { const sh = cur.getSheetByName(sl.sheet); if (sh) removeImagesIn_(sh, sl.box); });
          placePhotos(cur, x.slots, x.photos, function () {});
        });
      }
      if (tplKey === 'sc_tank') applyLicense_(cur, st);
    } finally { PHOTO_REC_ = null; }
    SpreadsheetApp.flush();
    snap = vb.snap();
    sp = cur;
  } else {
    sp = SpreadsheetApp.openById(copyAsSheet_(srcId, title, PROPS.getProperty('reportsId')));
    prog_(15, '書式を準備');
    (tpl.clearImagesOn || []).forEach(function (n) { const sh = sp.getSheetByName(n); if (sh) sh.getImages().forEach(function (im) { im.remove(); }); });
    prog_(20, '点検結果を記入');
    tpl.fill(sp, d);
    if (tplKey === 'sc_tank') applyLicense_(sp, st);
    SpreadsheetApp.flush();
    snap = snapValues_(sp);
  }
  delete d._order;
  SpreadsheetApp.flush();
  prog_(85, 'PDFを作成');
  const pdf = tpl.pdfParts ? await exportPdfParts_(sp, tpl.pdfParts(sp, d), title) : exportPdf_(sp.getId(), title);
  const pages_ = d._pages || 1;
  delete d._pages;
  prog_(97, '保存');
  if (old && cur) { try { const o = safeFile(idFromUrl(old.pdfUrl)); if (o) o.setTrashed(true); } catch (e) {} try { const s0 = safeFile(old.snapId); if (s0) s0.setTrashed(true); } catch (e) {} }
  const snapFile = DriveApp.getFolderById(PROPS.getProperty('reportsId')).createFile('.snap_' + sp.getId() + '.json', JSON.stringify(snap), 'application/json');
  const rep = { tpl: tplKey, name: tpl.name, sheetUrl: sp.getUrl(), pdfUrl: pdf.getUrl(), at: new Date().toISOString(), pages: pages_,
    snapId: snapFile.getId(), photoSig: photoSig_(d), updated: !!cur, changed: changed };
  d.reports = (d.reports || []).filter(function (r) { return r.tpl !== tplKey; }).concat([rep]);
  d.status = '報告書作成済';
  saveRow_('点検', d);
  prog_(100, '完了');
  return rep;
}
/* ================= 書類の種類を増やす（手持ちの書式から作る） =================
 * 設定の ctypes（JSON）に保存。報告書は TEMPLATES['ct_<id>'] として、ほかの書式と同じ流れ（差分更新・PDF）で作る。 */
const CT_STD = [['building', /建物|物件名|マンション名|現場名|ビル名|施設名|件名/], ['address', /所在地|住所/], ['date', /(作業|点検|実施|清掃|検査)日|年月日|日付/], ['time', /時間|時刻/],
  ['inspector', /責任者|点検者|作業者|担当者|技術者|監督者/], ['mgmtCompany', /管理会社|御中|提出先|宛先|お客様|依頼者/], ['weather', /天候|天気/]];
function ctGuessType_(label, rows) {
  if (/日$|日付|年月日/.test(label)) return 'date';
  if (/時間|時刻/.test(label)) return 'time';
  if (/判定|良否|結果|適否/.test(label)) return 'select';
  if (/備考|所見|特記|内容|コメント|改善|指摘/.test(label) || rows >= 2) return 'textarea';
  return 'text';
}
function api_analyzeTemplate(src) {
  let srcId;
  if (src && src.dataUrl) {
    const m = String(src.dataUrl).match(/^data:([^;]*);base64,(.+)$/); if (!m) throw new Error('ファイルを読み取れませんでした');
    const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1] || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', src.name || '書式.xlsx');
    srcId = DriveApp.getFolderById(PROPS.getProperty('rootId')).createFile(blob).getId();
  } else srcId = idFromUrl(src && src.url);
  const f = DriveApp.getFileById(srcId);
  const tplId = f.getMimeType() === MimeType.GOOGLE_SHEETS ? srcId : copyAsSheet_(srcId, '【書式】' + f.getName().replace(/\.xlsx?$/i, ''), PROPS.getProperty('rootId'));
  const sp = SpreadsheetApp.openById(tplId), fields = [], boxes = [], seen = {};
  sp.getSheets().forEach(function (sh) {
    if (sh.isSheetHidden()) return;
    const R = Math.min(sh.getMaxRows(), 150), C = Math.min(sh.getMaxColumns(), 40), name = sh.getName();
    const rg = sh.getRange(1, 1, R, C), vals = rg.getDisplayValues(), mAt = {};
    rg.getMergedRanges().forEach(function (m) { const g = { r0: m.getRow(), c0: m.getColumn(), r1: m.getLastRow(), c1: m.getLastColumn() };
      for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) mAt[r + ',' + c] = g;
      const v = (vals[g.r0 - 1] || [])[g.c0 - 1] || '';
      if (!String(v).trim() && g.r1 - g.r0 >= 3 && g.c1 - g.c0 >= 1 && (g.r1 - g.r0 + 1) * (g.c1 - g.c0 + 1) >= 12)
        boxes.push({ sheet: name, box: sh.getRange(g.r0, g.c0, g.r1 - g.r0 + 1, g.c1 - g.c0 + 1).getA1Notation() });
    });
    const at = function (r, c) { return mAt[r + ',' + c] || { r0: r, c0: c, r1: r, c1: c }; };
    const val = function (r, c) { return String((vals[r - 1] || [])[c - 1] || '').trim(); };
    const big = function (g) { return g.r1 - g.r0 >= 3 && g.c1 - g.c0 >= 1; };
    for (let r = 1; r <= R; r++) for (let c = 1; c <= C; c++) {
      const v = val(r, c); if (!v) continue;
      const g = at(r, c); if (g.r0 !== r || g.c0 !== c) continue;
      if (v.length > 24 || !/[ぁ-んァ-ヶ一-龠A-Za-z]/.test(v) || /^[\d\s.,:\/年月日時分~〜-]+$/.test(v)) continue;
      let t = g.c1 + 1 <= C ? at(r, g.c1 + 1) : null;
      if (!t || val(t.r0, t.c0) || big(t)) { t = g.r1 + 1 <= R ? at(g.r1 + 1, c) : null; if (!t || val(t.r0, t.c0) || big(t) || t.c0 !== c) continue; }
      const a1 = sh.getRange(t.r0, t.c0).getA1Notation(), key = name + '!' + a1; if (seen[key]) continue; seen[key] = 1;
      const label = v.replace(/[：:]\s*$/, ''), std = (CT_STD.filter(function (s) { return s[1].test(label); })[0] || [''])[0];
      const title = (/\s/.test(v) && v.replace(/\s/g, '').length <= 6) || /報告書|記録|一覧|お知らせ|表$/.test(label);
      fields.push({ title: title, label: label, sheet: name, cell: a1, type: std === 'date' ? 'date' : std === 'time' ? 'time' : ctGuessType_(label, t.r1 - t.r0 + 1), std: std });
      if (fields.length >= 200) break;
    }
  });
  let ai; try { ai = aiRefine_(sp, fields, boxes); } catch (e) { ai = { ok: false, why: 'AIで判定できなかったため、ルールだけで判定しました（' + e.message + '）' }; }
  return { tplUrl: sp.getUrl(), name: f.getName().replace(/\.xlsx?$/i, '').replace(/^【書式】/, ''), fields: fields, boxes: boxes, ai: ai };
}
/* ---- Claude（AI）で記入欄を判定する。APIキーはスクリプト プロパティ ANTHROPIC_API_KEY（無ければルールだけで判定） ---- */
const AI_MODEL = 'claude-sonnet-5-5';
const CT_STD_KEYS = ['building', 'address', 'date', 'time', 'mgmtCompany', 'inspector', 'weather'];
const AI_SYS = 'あなたは建物設備管理・点検業者の報告書の書式を解析する専門家です。Excel／スプレッドシートの書式から、作業者が毎回記入する欄だけを正確に選び、わかりやすい名前を付けます。出力はJSONだけにしてください。';
function aiRefine_(sp, fields, boxes) {
  const key = PROPS.getProperty('ANTHROPIC_API_KEY');
  if (!key) return { ok: false, why: 'APIキーが未登録のため、ルールだけで判定しました' };
  const by = {};
  fields.forEach(function (f, i) { (by[f.sheet] = by[f.sheet] || { f: [], b: [] }).f.push(i); });
  boxes.forEach(function (b, i) { (by[b.sheet] = by[b.sheet] || { f: [], b: [] }).b.push(i); });
  const names = Object.keys(by), auth = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  const reqs = names.map(function (n) {
    const sh = sp.getSheetByName(n), R = Math.min(sh.getMaxRows(), 150), C = Math.min(sh.getMaxColumns(), 40), texts = [];
    sh.getRange(1, 1, R, C).getDisplayValues().forEach(function (row, r) { row.forEach(function (v, c) { v = String(v).trim(); if (v) texts.push(colL(c + 1) + (r + 1) + '=' + v.slice(0, 40)); }); });
    const cand = by[n].f.map(function (i) { return 'f' + i + ' ' + fields[i].cell + ' 近くの文字「' + fields[i].label + '」'; })
      .concat(by[n].b.map(function (i) { return 'b' + i + ' ' + boxes[i].box + '（結合された大きな空欄）'; }));
    const content = [];
    try {
      const r = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + sp.getId() + '/export?format=pdf&size=A4&fitw=true&gridlines=true&printtitle=false&sheetnames=false&pagenum=UNDEFINED&gid=' + sh.getSheetId(), { headers: auth, muteHttpExceptions: true });
      if (r.getResponseCode() === 200 && r.getBlob().getBytes().length < 4000000) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Utilities.base64Encode(r.getBlob().getBytes()) } });
    } catch (e) {}
    content.push({ type: 'text', text: 'シート名：' + n + '\n添付PDFはこのシートの見た目です。\n\n【書式に書かれている文字（セル=文字）】\n' + texts.slice(0, 600).join('\n') +
      '\n\n【記入欄の候補】（id セル 説明）\n' + cand.join('\n') +
      '\n\n判断のルール：\n- 見出し・表題・注意書き・会社名など固定の文言の欄は使わない（0）。作業のたびに値が変わる空欄だけ使う（1）。\n' +
      '- label は作業者が見てすぐわかる短い名前（例：建物名、作業日、残留塩素(mg/L)）。表の中の欄は「行の見出し＋列の見出し」で具体的に。\n' +
      '- type：text／textarea（複数行の文章）／date／time／select（良・否などの判定）\n' +
      '- std：building（建物・物件・施設名）address（所在地）date（作業日・点検日）time（作業時間）mgmtCompany（管理会社・宛先・提出先）inspector（担当者・責任者）weather（天候）のどれかに当たれば入れる。なければ ""\n' +
      '- 写真を貼る枠（b〜）は p にidを入れる。写真用でない大きな空欄は入れない。\n' +
      '- 候補に無いが明らかな記入欄（空欄のセル）があれば x に [セル, label, type, std] で追加。\n' +
      '出力形式：{"f":[["f12",1,"建物名","text","building"]],"p":["b3"],"x":[["D15","備考","textarea",""]]}\nf の候補はすべて1行ずつ返すこと。JSON以外は書かないこと。' });
    return { url: 'https://api.anthropic.com/v1/messages', method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({ model: AI_MODEL, max_tokens: 8000, system: AI_SYS, messages: [{ role: 'user', content: content }] }) };
  });
  let ok = 0, err = '';
  UrlFetchApp.fetchAll(reqs).forEach(function (r, k) {
    if (r.getResponseCode() !== 200) { err = 'AIの応答エラー（' + r.getResponseCode() + '）'; return; }
    const txt = (JSON.parse(r.getContentText()).content || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join('');
    const m = txt.match(/\{[\s\S]*\}/); if (!m) return;
    let o; try { o = JSON.parse(m[0]); } catch (e) { return; }
    ok++;
    (o.f || []).forEach(function (a) {
      const f = fields[+String(a[0]).replace(/^f/, '')]; if (!f) return;
      f.use = !!Number(a[1]); if (a[2]) f.label = String(a[2]).slice(0, 30);
      if (['text', 'textarea', 'date', 'time', 'select'].indexOf(a[3]) >= 0) f.type = a[3];
      f.std = CT_STD_KEYS.indexOf(a[4]) >= 0 ? a[4] : ''; f.ai = true;
    });
    const n = names[k], pb = {}; (o.p || []).forEach(function (id) { pb[+String(id).replace(/^b/, '')] = 1; });
    by[n].b.forEach(function (i) { boxes[i].use = !!pb[i]; });
    const sh = sp.getSheetByName(n);
    (o.x || []).forEach(function (a) {
      try {
        const cell = sh.getRange(String(a[0])); if (String(cell.getDisplayValue()).trim()) return;
        const a1 = cell.getA1Notation(); if (fields.some(function (f) { return f.sheet === n && f.cell === a1; })) return;
        fields.push({ sheet: n, cell: a1, label: String(a[1] || '記入欄').slice(0, 30), type: ['text', 'textarea', 'date', 'time', 'select'].indexOf(a[2]) >= 0 ? a[2] : 'text', std: CT_STD_KEYS.indexOf(a[3]) >= 0 ? a[3] : '', use: true, ai: true });
      } catch (e) {}
    });
  });
  return ok ? { ok: true, n: ok, of: names.length } : { ok: false, why: err || 'AIの結果を読み取れなかったため、ルールだけで判定しました' };
}
function ctTemplate_(ct) {
  return { kind: 'c:' + ct.id, name: ct.name, defaultOrder: 'row', custom: true,
    fill: function (sp, d) {
      (ct.fields || []).forEach(function (f) {
        const sh = sp.getSheetByName(f.sheet); if (!sh) return;
        let v = f.std ? d[f.std] : (d.cf || {})[f.key];
        if (f.std === 'mgmtCompany' && v && /御中/.test(f.label)) v = v + '　御中';
        if (f.type === 'date' && v && /^\d{4}-\d{2}-\d{2}$/.test(v)) v = dateIn_(sp, v);
        put(sh, f.cell, v == null ? '' : v);
      });
      const slots = (ct.boxes || []).map(function (b) { return { sheet: b.sheet, box: b.box }; });
      if (slots.length) {
        slots.forEach(function (s) { const sh = sp.getSheetByName(s.sheet); if (sh) removeImagesIn_(sh, s.box); });
        placePhotos(sp, slots, d.photos || [], function () {});
      }
    } };
}
function loadCustom_(st) {
  st = st || getSettings_(); let list = [];
  try { list = JSON.parse(st.ctypes || '[]'); } catch (e) { list = []; }
  Object.keys(TEMPLATES).forEach(function (k) { if (k.indexOf('ct_') === 0) delete TEMPLATES[k]; });
  list.forEach(function (ct) { TEMPLATES['ct_' + ct.id] = ctTemplate_(ct); });
  return list;
}
function api_saveCtype(ct) {
  const st = getSettings_(), list = loadCustom_(st);
  if (!ct.id) ct.id = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  ct.fields = (ct.fields || []).map(function (f, i) { f.key = f.key || ('f' + (i + 1) + '_' + Math.random().toString(36).slice(2, 5)); return f; });
  const i = list.map(function (x) { return x.id; }).indexOf(ct.id);
  if (i >= 0) list[i] = ct; else list.push(ct);
  st.ctypes = JSON.stringify(list); st['tpl_ct_' + ct.id] = ct.tplUrl;
  api_saveSettings(st);
  return api_init();
}
function api_deleteCtype(id) {
  const st = getSettings_(), list = loadCustom_(st).filter(function (x) { return x.id !== id; });
  st.ctypes = JSON.stringify(list); delete st['tpl_ct_' + id];
  api_saveSettings(st);
  return api_init();
}
/* ---- 作り直しのときに「変わった所だけ」直すための道具 ---- */
let PHOTO_REC_ = null;/* 作業用コピーでは写真を貼らず、貼る場所だけ記録する */
const nv_ = function (v) { return v instanceof Date ? 'D' + v.getTime() : String(v); };
/* ================= 変わった所だけ直す（作業用の写しを作らない） =================
 * 書式に書き込む処理（fill）の書き込みを横取りして、前回書いた値と違うマスだけを本物の報告書に書く。
 * 前回と同じ値のマスは触らないので、スプレッドシートで手直しした箇所は残る。式の入ったマスは触らない。
 * 写真は別に記録し（PHOTO_REC_）、並びや枚数が変わったときだけ貼り直す。 */
function diffBook_(cur, prev) {
  prev = prev || {};
  const nsnap = JSON.parse(JSON.stringify(prev));
  let n = 0;
  const pass = function (real, self) {
    return function (t, p) {
      if (p in t) return t[p];
      const f = real[p];
      return typeof f === 'function' ? function () { const x = f.apply(real, arguments); return x === real ? self() : x; } : f;
    };
  };
  const cellW = function (name, sh, r, c, val) {
    const k = r + ',' + c, nvv = (val === '' || val == null) ? '' : nv_(val);
    const old = ((prev[name] || {}).v || {})[k] || '';
    const o = nsnap[name] = nsnap[name] || { v: {} }; if (!o.v) o.v = {};
    if (nvv === '') delete o.v[k]; else o.v[k] = nvv;
    if (nvv === old) return;
    const cell = sh.getRange(r, c); if (cell.getFormula()) return;
    cell.setValue(val == null ? '' : val); n++;
  };
  const wrapRange = function (name, sh, rg) {
    let P;
    const o = {
      setValue: function (v) { cellW(name, sh, rg.getRow(), rg.getColumn(), v); return P; },
      setValues: function (g) { const r0 = rg.getRow(), c0 = rg.getColumn(); g.forEach(function (row, i) { row.forEach(function (v, j) { cellW(name, sh, r0 + i, c0 + j, v); }); }); return P; },
      clearContent: function () { const r0 = rg.getRow(), c0 = rg.getColumn(), nr = rg.getNumRows(), nc = rg.getNumColumns(); for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) cellW(name, sh, r0 + i, c0 + j, ''); return P; },
      getMergedRanges: function () { return rg.getMergedRanges().map(function (m) { return wrapRange(name, sh, m); }); },
      getCell: function (r, c) { return wrapRange(name, sh, rg.getCell(r, c)); }
    };
    P = new Proxy(o, { get: pass(rg, function () { return P; }) });
    return P;
  };
  const wrapSheet = function (sh) {
    if (!sh) return sh;
    let P;
    const o = {
      _real: sh,
      getRange: function () { return wrapRange(sh.getName(), sh, sh.getRange.apply(sh, arguments)); },
      getImages: function () { return []; },/* 写真は最後にまとめて貼り直す */
      copyTo: function () {/* 同じ名前のシートがもうあれば、写しは消してそちらを使う */
        const c = sh.copyTo(cur); let Q;
        Q = new Proxy({ _real: c, setName: function (nm) { const ex = cur.getSheetByName(nm); if (ex && ex.getSheetId() !== c.getSheetId()) { cur.deleteSheet(c); return wrapSheet(ex); } c.setName(nm); return wrapSheet(c); } }, { get: pass(c, function () { return Q; }) });
        return Q;
      }
    };
    P = new Proxy(o, { get: pass(sh, function () { return P; }) });
    return P;
  };
  let S;
  S = new Proxy({
    getSheetByName: function (nm) { return wrapSheet(cur.getSheetByName(nm)); },
    getSheets: function () { return cur.getSheets().map(wrapSheet); },
    setActiveSheet: function (s) { return cur.setActiveSheet(s && s._real ? s._real : s); },
    insertSheet: function () { return wrapSheet(cur.insertSheet.apply(cur, arguments)); }
  }, { get: pass(cur, function () { return S; }) });
  return {
    sp: S,
    count: function () { return n; },
    snap: function () { cur.getSheets().forEach(function (s) { const o = nsnap[s.getName()] = nsnap[s.getName()] || { v: {} }; o.h = s.isSheetHidden(); }); return nsnap; }
  };
}
function snapValues_(sp) {
  const o = {};
  sp.getSheets().forEach(function (sh) {
    const m = {}, v = sh.getDataRange().getValues();
    v.forEach(function (row, r) { row.forEach(function (x, c) { if (x !== '' && x != null) m[(r + 1) + ',' + (c + 1)] = nv_(x); }); });
    o[sh.getName()] = { v: m, h: sh.isSheetHidden() };
  });
  return o;
}
function readSnap_(id) { try { return JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString()); } catch (e) { return {}; } }
/* 新しく作った内容（tmp）と前回作った内容（prev）を比べ、違うマスだけ cur に書く。式の入ったマスは触らない */
function applyDiff_(cur, tmp, snap, prev) {
  let n = 0;
  tmp.getSheets().forEach(function (ts) {
    const name = ts.getName(), cs = cur.getSheetByName(name); if (!cs) return;
    const nv = (snap[name] || {}).v || {}, pv = (prev[name] || {}).v || {};
    const keys = {}; Object.keys(nv).forEach(function (k) { keys[k] = 1; }); Object.keys(pv).forEach(function (k) { keys[k] = 1; });
    const diff = Object.keys(keys).filter(function (k) { return (nv[k] || '') !== (pv[k] || ''); });
    if (diff.length) {
      const tv = ts.getDataRange().getValues();
      diff.forEach(function (k) {
        const p = k.split(','), r = +p[0], c = +p[1];
        const cell = cs.getRange(r, c); if (cell.getFormula()) return;
        const val = (tv[r - 1] || [])[c - 1];
        cell.setValue(val == null ? '' : val); n++;
      });
    }
    const hid = (snap[name] || {}).h;
    if (hid && !cs.isSheetHidden()) cs.hideSheet(); else if (!hid && cs.isSheetHidden()) cs.showSheet();
  });
  return n;
}
function photoSig_(d) { return JSON.stringify([(d.photos || []).map(function (p) { return p.fileId; }), getSettings_()['lic_on'] || '', getSettings_()['lic_file'] || '']); }
function removeImagesIn_(sh, a1) {
  const rg = sh.getRange(a1), r0 = rg.getRow(), r1 = rg.getLastRow(), c0 = rg.getColumn(), c1 = rg.getLastColumn();
  sh.getImages().forEach(function (im) { const a = im.getAnchorCell(); if (a.getRow() >= r0 && a.getRow() <= r1 && a.getColumn() >= c0 && a.getColumn() <= c1) im.remove(); });
}
/* 貯水槽清掃の報告書の最後に「貯水槽清掃作業監督者」の許可証を載せる（設定で切り替え） */
function applyLicense_(sp, st) {
  let sh = sp.getSheetByName('許可証');
  const on = String(st.lic_on) === '1' && st.lic_file;
  if (!on) { if (sh) sh.hideSheet(); return; }
  if (!sh) {
    sh = sp.insertSheet('許可証', sp.getSheets().length);
    if (sh.getMaxColumns() > 8) sh.deleteColumns(9, sh.getMaxColumns() - 8);
    for (let c = 1; c <= 8; c++) sh.setColumnWidth(c, 90);
    sh.setHiddenGridlines(true);
  }
  sh.showSheet();
  sh.getImages().forEach(function (im) { im.remove(); });
  sh.getRange('A1').setValue('貯水槽清掃作業監督者 資格証').setFontWeight('bold').setFontSize(12);
  let blob;
  try { blob = photoBlob_(st.lic_file); } catch (e) { return; }
  const img = sh.insertImage(blob, 1, 3);
  const k = Math.min(1, 700 / img.getWidth()), w = Math.round(img.getWidth() * k), h = Math.round(img.getHeight() * k);
  img.setWidth(w).setHeight(h).setAnchorCellXOffset(10);
  const rows = 3 + Math.ceil(h / 21) + 1;
  if (sh.getMaxRows() > rows) sh.deleteRows(rows + 1, sh.getMaxRows() - rows);
}
/* 最初の1回だけ：渡された見本（xlsx）の最後のシートにある許可証の画像を取り出して、設定に登録する */
function importLicenseFromSample() {
  const files = {}; Utilities.unzip(DriveApp.getFileById(idFromUrl(DEFAULT_TPL.sc_tank)).getBlob().setContentType('application/zip')).forEach(function (b) { files[b.getName()] = b; });
  const txt = function (n) { return files[n] ? files[n].getDataAsString() : ''; };
  const tgt = function (rels, id) { const m = rels.match(new RegExp('<Relationship [^>]*Id="' + id + '"[^>]*>')); return m ? (m[0].match(/Target="([^"]+)"/) || [])[1] : null; };
  const res = function (base, t) { if (t.charAt(0) === '/') return t.slice(1); const p = base.split('/'); p.pop(); t.split('/').forEach(function (s) { if (s === '..') p.pop(); else if (s !== '.') p.push(s); }); return p.join('/'); };
  const ids = []; txt('xl/workbook.xml').replace(/<sheet [^>]*r:id="([^"]+)"/g, function (m, id) { ids.push(id); });
  const sheet = res('xl/workbook.xml', tgt(txt('xl/_rels/workbook.xml.rels'), ids[ids.length - 1]));
  const sRels = txt(sheet.replace(/([^/]+)$/, '_rels/$1.rels'));
  const media = [];
  (sRels.match(/Target="[^"]*drawings\/[^"]+"/g) || []).forEach(function (t) {
    const dp = res(sheet, t.slice(8, -1));
    (txt(dp.replace(/([^/]+)$/, '_rels/$1.rels')).match(/Target="[^"]*media\/[^"]+"/g) || []).forEach(function (m) { media.push(res(dp, m.slice(8, -1))); });
  });
  if (!media.length) throw new Error('見本の最後のシートに画像が見つかりません（' + sheet + '）');
  const best = media.map(function (p) { return files[p]; }).filter(Boolean).sort(function (a, b) { return b.getBytes().length - a.getBytes().length; })[0];
  const f = DriveApp.getFolderById(PROPS.getProperty('photosId')).createFile(best.setName('貯水槽清掃作業監督者_許可証.' + (best.getName().split('.').pop())));
  const st = getSettings_(); st.lic_file = f.getId(); st.lic_on = '1'; api_saveSettings(st);
  return '登録しました：' + f.getName() + '（' + sheet + '）';
}
/* 報告書のスプレッドシートを手で直したあと、その内容でPDFだけ作り直す（古いPDFはゴミ箱へ） */
async function api_rePdf(inspId, tplKey) {
  loadCustom_();
  const d = api_getInsp(inspId); if (!d) throw new Error('点検データが見つかりません');
  const rep = (d.reports || []).filter(function (r) { return r.tpl === tplKey; })[0];
  if (!rep) throw new Error('報告書が見つかりません');
  const tpl = TEMPLATES[tplKey];
  const sp = SpreadsheetApp.openByUrl(rep.sheetUrl);
  const title = sp.getName();
  d._pages = rep.pages || Math.max(1, Math.ceil((d.photos || []).length / 9));
  const pdf = tpl && tpl.pdfParts ? await exportPdfParts_(sp, tpl.pdfParts(sp, d), title) : exportPdf_(sp.getId(), title);
  delete d._pages;
  try { const old = safeFile(idFromUrl(rep.pdfUrl)); if (old) old.setTrashed(true); } catch (e) {}
  rep.pdfUrl = pdf.getUrl(); rep.at = new Date().toISOString(); rep.edited = true;
  saveRow_('点検', d);
  return rep;
}
/* 書式のコピー：Excel（.xlsx）の書式はGoogleスプレッドシートに変換してコピーする */
function copyAsSheet_(srcId, title, parentId) {
  const f = DriveApp.getFileById(srcId);
  if (f.getMimeType() === MimeType.GOOGLE_SHEETS) return f.makeCopy(title, DriveApp.getFolderById(parentId)).getId();
  const res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + srcId + '/copy?supportsAllDrives=true', { method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ name: title, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [parentId] }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('書式を変換できませんでした（' + res.getResponseCode() + '）');
  return JSON.parse(res.getContentText()).id;
}
function exportPdf_(id, title, fitPage) {
  const u = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=pdf&size=A4&portrait=true&' + (fitPage ? 'scale=4&horizontal_alignment=CENTER' : 'fitw=true') + '&gridlines=false&printtitle=false&sheetnames=false&pagenum=UNDEFINED&fzr=false';
  const res = UrlFetchApp.fetch(u, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('PDFを作れませんでした（' + res.getResponseCode() + '）');
  return DriveApp.getFolderById(PROPS.getProperty('reportsId')).createFile(res.getBlob().setName(title + '.pdf'));
}
/* シートごとに向きを変えてPDFにし、1つにまとめる */
async function exportPdfParts_(sp, parts, title) {
  const auth = { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  const blobs = parts.map(function (p) {
    const sh = sp.getSheetByName(p.sheet); if (!sh) return null;
    let u = 'https://docs.google.com/spreadsheets/d/' + sp.getId() + '/export?format=pdf&size=A4&gridlines=false&printtitle=false&sheetnames=false&pagenum=UNDEFINED&fzr=false&horizontal_alignment=CENTER'
      + '&gid=' + sh.getSheetId() + '&portrait=' + p.portrait + '&scale=' + (p.fit === 'page' ? 4 : 2);
    if (p.r2) u += '&r1=' + p.r1 + '&r2=' + p.r2 + '&c1=' + p.c1 + '&c2=' + p.c2;
    for (let k = 0; k < 3; k++) {
      const res = UrlFetchApp.fetch(u, auth);
      if (res.getResponseCode() === 200) return res.getBlob();
      Utilities.sleep(2000 * (k + 1));
    }
    throw new Error('PDFを作れませんでした（' + p.sheet + '）');
  }).filter(Boolean);
  if (typeof PDFLib === 'undefined') {
    globalThis.setTimeout = globalThis.setTimeout || function (f) { f(); return 0; };
    eval(UrlFetchApp.fetch('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js').getContentText());
  }
  const out = await PDFLib.PDFDocument.create();
  for (let i = 0; i < blobs.length; i++) {
    const src = await PDFLib.PDFDocument.load(new Uint8Array(blobs[i].getBytes()));
    (await out.copyPages(src, src.getPageIndices())).forEach(function (pg) { out.addPage(pg); });
  }
  const bytes = await out.save();
  const blob = Utilities.newBlob(Array.from(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length)), 'application/pdf', title + '.pdf');
  return DriveApp.getFolderById(PROPS.getProperty('reportsId')).createFile(blob);
}

/* ---- 書式に書き込む道具 ---- */
function put(sh, a1, v) {
  if (!sh) return;
  let r = sh.getRange(a1);
  if (r.isPartOfMerge()) r = r.getMergedRanges()[0].getCell(1, 1);
  r.setValue(v == null ? '' : v);
}
/* 写真：スプレッドシートに貼れる大きさ（100万画素以下）にして取り出す */
function photoBlob_(id) {
  const auth = { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  for (let k = 0; k < 3; k++) {
    try {
      const r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '?fields=thumbnailLink', auth);
      const link = JSON.parse(r.getContentText()).thumbnailLink;
      if (link) { const t = UrlFetchApp.fetch(link.replace(/=s\d+$/, '') + '=s1000', auth); if (t.getResponseCode() === 200) return t.getBlob().setName('photo.jpg'); }
    } catch (e) {}
    Utilities.sleep(1500);
  }
  return DriveApp.getFileById(id).getBlob();
}
/* 日付は報告書の時間帯（日本時間）で入れる */
function dateIn_(sp, s) { return s ? Utilities.parseDate(s, sp.getSpreadsheetTimeZone() || 'Asia/Tokyo', 'yyyy-MM-dd') : ''; }
function numOrBlank(v) { return v === '' || v == null || isNaN(Number(v)) ? (v || '') : Number(v); }
function maxUrgency(list) { const o = { '高': 3, '中': 2, '低': 1 }; let m = ''; (list || []).forEach(function (p) { if ((o[p.urgency] || 0) > (o[m] || 0)) m = p.urgency; }); return m; }
function colL(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function idFromUrl(u) { const m = String(u).match(/[-\w]{25,}/); if (!m) throw new Error('書式のURLが正しくありません'); return m[0]; }
/* 写真を枠に合わせて貼る（縦横比を保って中央に） */
/* 写真の並び順：row=横に進む（Z字）／col=縦に進む（左の列が埋まったら右の列の上へ）／pair=2列ずつ横に進む */
function orderSlots_(slots, mode) {
  const key = function (s) {
    if (mode === 'col') return [s.page, s.c, s.r];
    if (mode === 'pair') return [s.page, Math.floor(s.c / 2), s.r, s.c % 2];
    return [s.page, s.r, s.c];
  };
  return slots.slice().sort(function (a, b) { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
}
function placePhotos(sp, slots, photos, labelFn) {
  if (PHOTO_REC_) {/* 作業用コピー：文字だけ書いて、写真を貼る場所は記録する */
    PHOTO_REC_.push({ slots: slots, photos: photos });
    slots.forEach(function (s, i) { const sh = sp.getSheetByName(s.sheet); if (!sh) return; sh.getRange(s.box).clearContent(); labelFn(sh, s, (photos || [])[i]); });
    return;
  }
  slots.forEach(function (s, i) {
    const sh = sp.getSheetByName(s.sheet); if (!sh) return;
    const ph = (photos || [])[i];
    sh.getRange(s.box).clearContent();/* 書式に残っている前回の写真（セル内の画像）を消す */
    labelFn(sh, s, ph);
    if (!ph || !ph.fileId) return;
    const rg = sh.getRange(s.box);
    let w = 0, h = 0;
    for (let c = rg.getColumn(); c <= rg.getLastColumn(); c++) w += sh.getColumnWidth(c);
    for (let r = rg.getRow(); r <= rg.getLastRow(); r++) h += sh.getRowHeight(r);
    const blob = photoBlob_(ph.fileId);
    prog_(40 + 42 * (i + 1) / Math.max(1, Math.min(photos.length, slots.length)), '写真を貼付 ' + (i + 1) + '/' + Math.min(photos.length, slots.length));
    const img = sh.insertImage(blob, rg.getColumn(), rg.getRow());
    const iw = img.getWidth(), ih = img.getHeight(), k = Math.min((w - 6) / iw, (h - 6) / ih);
    const nw = Math.round(iw * k), nh = Math.round(ih * k);
    img.setWidth(nw).setHeight(nh);
    /* 中央に寄せる：ずらす量が1マスより大きいときは、貼り始めのマスを移す */
    let ox = Math.max(0, Math.round((w - nw) / 2)), oy = Math.max(0, Math.round((h - nh) / 2));
    let col = rg.getColumn(), row = rg.getRow();
    while (ox > sh.getColumnWidth(col) && col < rg.getLastColumn()) { ox -= sh.getColumnWidth(col); col++; }
    while (oy > sh.getRowHeight(row) && row < rg.getLastRow()) { oy -= sh.getRowHeight(row); row++; }
    img.setAnchorCell(sh.getRange(row, col)).setAnchorCellXOffset(ox).setAnchorCellYOffset(oy);
  });
}
function include(n) { return HtmlService.createHtmlOutputFromFile(n).getContent(); }

/* ================= 排水管洗浄報告書（自社書式） ================= */
/* 戸数：部屋ごとの結果が入っていれば数える。なければ手入力の数を使う。未実施＝総戸数－実施－キャンセル・空室（一部未実施は未実施の内数） */
function drainCount_(d) {
  const R = d.rooms || [], c = function (v) { return R.filter(function (r) { return r.r === v; }).length; };
  if (R.length) { const dn = c('実施'), ca = c('キャンセル') + c('空室'); return { total: R.length, done: dn, cancel: ca, notDone: R.length - dn - ca, partial: c('一部未実施') }; }
  const n = function (k) { return d[k] === '' || d[k] == null ? '' : Number(d[k]); };
  const t = n('total'), dn = n('done'), ca = n('cancel') === '' && t !== '' ? 0 : n('cancel'), nd = n('notDone');
  return { total: t, done: dn, cancel: ca, notDone: nd !== '' ? nd : (t !== '' && dn !== '' ? t - dn - (ca || 0) : ''), partial: n('partial') };
}
TEMPLATES.sc_drain = {
  kind: 'drain',
  name: '自社書式：排水管洗浄報告書',
  defaultOrder: 'row',
  /* PDF：見えているシートを1枚ずつA4縦に収める（書式の下の余白・使い方の行は出さない） */
  pdfParts: function (sp) {
    return sp.getSheets().filter(function (s) { return !s.isSheetHidden(); }).map(function (s) {
      const n = s.getName(), room = n.indexOf('居室確認') === 0;
      return { sheet: n, portrait: true, fit: 'page', r1: 0, r2: room ? 51 : n === '表紙' ? 41 : n === '作業報告書' ? 41 : 44, c1: 0, c2: room ? 7 : 12 };
    });
  },
  fill: function (sp, d) {
    const g = function (n) { return sp.getSheetByName(n); }, day = dateIn_(sp, d.date), sub = (d.submitMode === 'mgmt' ? '' : d.submitTo) || d.mgmtCompany || '';
    const all = d.photos || [];
    const photos = all.filter(function (p) { return p.place !== '作業確認表'; }), rooms = all.filter(function (p) { return p.place === '作業確認表'; });
    /* 表紙 */
    const c = g('表紙');
    put(c, 'D11', d.building); put(c, 'D12', d.workContent == null ? '雑排水管清掃' : d.workContent); put(c, 'D13', day); put(c, 'D14', d.address); put(c, 'D15', sub);
    c.getRange('B20:K31').clearContent(); c.getImages().forEach(function (im) { im.remove(); });
    const cover = photos.filter(function (p) { return p.place === '建物全景' || p.place === '建物名称'; })[0] || photos[0];
    if (cover) placePhotos(sp, [{ sheet: '表紙', box: 'B20:K31' }], [cover], function () {});
    /* 作業報告書 */
    const w = g('作業報告書'), n = drainCount_(d);
    put(w, 'C5', d.building); put(w, 'C6', d.address); put(w, 'C7', day); put(w, 'C8', d.time); put(w, 'C9', d.inspector);
    put(w, 'C11', sub); put(w, 'C12', d.cycle || '');
    w.getRange('E15:E19').setValues([[n.total], [n.done], [n.cancel], [n.notDone], [n.partial]]);
    put(w, 'G15', d.resultNote || ''); put(w, 'A30', d.notesPublic || ''); put(w, 'I41', day); put(w, 'A43', '');
    /* 作業記録写真：1ページ6枚。足りなければページを増やす */
    const pages = sp.getSheets().filter(function (s) { return s.getName().indexOf('作業記録写真') === 0; });
    const need = Math.max(1, Math.ceil(photos.length / 6));
    while (pages.length < need) {
      const last = pages[pages.length - 1], cp = last.copyTo(sp).setName('作業記録写真 ' + (pages.length + 1));
      sp.setActiveSheet(cp); sp.moveActiveSheet(last.getIndex() + 1); pages.push(cp);
    }
    const slots = [];
    pages.forEach(function (p, pi) {
      put(p, 'C5', d.building); put(p, 'C6', day); put(p, 'C7', d.inspector); put(p, 'C8', d.area || '共用部・専有部・外部排水桝・その他');
      [[10, 'A'], [10, 'G'], [22, 'A'], [22, 'G'], [34, 'A'], [34, 'G']].forEach(function (s, q) {
        slots.push({ sheet: p.getName(), box: s[1] + s[0] + ':' + (s[1] === 'A' ? 'F' : 'L') + (s[0] + 7), col: s[1], row: s[0] + 8, page: pi, r: Math.floor(q / 2), c: q % 2 }); });
    });
    placePhotos(sp, orderSlots_(slots, d._order), photos, function (sh, sl, ph) {
      put(sh, sl.col + sl.row, '場所：' + (ph ? ph.place || '' : '')); put(sh, sl.col + (sl.row + 1), ph && ph.step ? ph.step : 'ー');
      put(sh, sl.col + (sl.row + 2), 'コメント：' + (ph ? ph.comment || '' : ''));
    });
    pages.forEach(function (p, i) { if (i >= need) p.hideSheet(); else p.showSheet(); });
    /* 居室確認：写真の場所を「作業確認表」にしたものを1枚ずつ貼る */
    const rs = g('居室確認');
    if (rs) {
      rs.getRange('A1:G51').clearContent();
      if (rooms.length) {
        rs.showSheet();
        rooms.forEach(function (p, i) {
          const sh = i ? rs.copyTo(sp).setName('居室確認 ' + (i + 1)) : rs;
          placePhotos(sp, [{ sheet: sh.getName(), box: 'A1:G51' }], [p], function () {});
        });
      } else rs.hideSheet();
    }
    /* 不具合箇所改善提案書 */
    const s9 = g('改善提案書'), P = d.proposals || [];
    put(s9, 'C5', d.building); put(s9, 'C6', day); put(s9, 'C7', d.inspector);
    put(s9, 'C8', P.length ? P.map(function (p) { return p.target; }).filter(String).join('、') : '特にありません');
    put(s9, 'C9', P.length ? maxUrgency(P) : ''); put(s9, 'C10', P.length ? (d.estimate || '要') : '不要');
    put(s9, 'A13', P.length ? P.map(function (p) { return '・' + [p.target, p.content].filter(String).join('：') + (p.photoNo ? '［写真No.' + p.photoNo + '］' : ''); }).join('\n') : '特にありません');
    put(s9, 'A19', d.causeNote || '');
    put(s9, 'A27', d.recommendNote || P.filter(function (p) { return p.due; }).map(function (p) { return '・' + p.target + '：' + p.due + 'を目安に対応をおすすめします'; }).join('\n'));
    put(s9, 'I38', day); put(s9, 'A41', d.proposalNote || '');
    sp.getSheets().forEach(function (s) { if (/^(シート|Sheet)\d+$/.test(s.getName())) s.hideSheet(); });
  }
};
/* 書式の置き場所（貯水槽の空欄書式と同じフォルダ） */
function tplFolderId_() {
  try { return DriveApp.getFileById(idFromUrl(getSettings_().tpl_sc_tank)).getParents().next().getId(); } catch (e) { return PROPS.getProperty('rootId'); }
}
/* 自社書式（排水管洗浄）の空欄の原本を作って設定に登録する（1回だけ実行） */
function makeBlankDrainTemplate() {
  const sp = SpreadsheetApp.openById(copyAsSheet_(idFromUrl(DEFAULT_TPL.sc_drain), '【書式】自社_排水管洗浄報告書（空欄）', tplFolderId_()));
  TEMPLATES.sc_drain.fill(sp, { photos: [], proposals: [], workContent: '' });
  const g = function (n) { return sp.getSheetByName(n); };
  [['作業報告書', ['I41']], ['改善提案書', ['C8', 'C10', 'A13', 'I38']]].forEach(function (x) { x[1].forEach(function (a) { put(g(x[0]), a, ''); }); });
  sp.getSheets().forEach(function (s) { if (!/^(シート|Sheet)\d+$/.test(s.getName())) s.showSheet(); });
  SpreadsheetApp.flush();
  const st = getSettings_(); st.tpl_sc_drain = sp.getUrl(); api_saveSettings(st);
  return sp.getUrl();
}

/* ================= お知らせ（掲示用・A4縦） ================= */
const NOTICE_MSG = '平素より建物の維持管理にご理解とご協力を賜り、誠にありがとうございます。\n';
const NOTICE = {
  drain: { title: '排水管洗浄作業のお知らせ', l12: '施工日', l13: '施工時間', l14: '作業内容', content: '排水管洗浄', range: '各戸内排水管・共用部排水管', en: 'Drain Pipe Cleaning / Maintenance',
    msg: '下記日程にて排水管洗浄作業を実施いたします。作業中は対象の排水設備を一時的にご使用いただけない場合がありますので、ご協力をお願いいたします。',
    asks: ['作業時間中は、台所・浴室・洗面台・洗濯機等の排水設備の使用をお控えください。', '排水口周辺の荷物を事前に移動し、作業スペースの確保をお願いいたします。', '洗浄作業後、一時的に臭気や音が発生する場合があります。', '天候・設備状況により、作業時間が前後する場合があります。'],
    close: 'ご不便をおかけいたしますが、排水管の詰まり・臭気・漏水等を予防し、衛生的な住環境を維持するため、何卒ご理解とご協力をお願い申し上げます。' },
  pump: { title: '増圧ポンプ点検のお知らせ', l12: '点検日', l13: '断水時間', l14: '作業内容', content: '増圧ポンプ点検', range: '増圧ポンプ', en: 'Booster Pump Inspection / Maintenance',
    msg: '下記日程にて増圧ポンプの点検作業を実施いたします。点検作業中は断水となりますので、あらかじめ水の汲み置き等のご準備をお願いいたします。',
    asks: ['断水時間中は、水道・給湯設備をご使用いただけません。', '断水前に、飲用水・生活用水など必要な水の汲み置きをお願いいたします。', '断水終了後は、空気混入・濁り等が出る場合がありますので、しばらく水を流してからご使用ください。', '設備状況により、断水時間が前後する場合があります。'],
    close: 'ご不便をおかけいたしますが、安定した給水環境を維持するため、何卒ご理解とご協力をお願い申し上げます。' },
  tank: { title: '貯水槽清掃作業に伴う断水のお知らせ', l12: '施工日', l13: '断水時間', l14: '施工時間', content: '', range: '全館', en: 'Water Tank Cleaning / Inspection',
    msg: '下記日程にて貯水槽清掃作業を実施いたします。作業中は断水となりますので、あらかじめ水の汲み置き等のご準備をお願いいたします。',
    asks: ['作業時間中は、水道・給湯設備をご使用いただけない場合があります。', '断水前に必要な水の汲み置きをお願いいたします。', '作業後、はじめに水を使用する際は、しばらく水を流してからご使用ください。', '天候・設備状況により、作業時間が前後する場合があります。'],
    close: 'ご不便をおかけいたしますが、安全で衛生的な給水環境を維持するため、何卒ご理解とご協力をお願い申し上げます。' }
};
/* 書式を描く（もとのExcel書式と同じ配置・色） */
function buildNotice_(sh, N) {
  sh.clear(); sh.setHiddenGridlines(true);
  if (sh.getMaxColumns() > 8) sh.deleteColumns(9, sh.getMaxColumns() - 8);
  if (sh.getMaxRows() > 42) sh.deleteRows(43, sh.getMaxRows() - 42);
  [68, 89, 103, 64, 64, 64, 96, 68].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  const H = { 2: 24, 4: 36, 7: 24, 8: 24, 10: 22.5, 11: 30, 12: 39.75, 13: 39.75, 14: 25.5, 15: 25.5, 18: 22.5, 19: 27.75, 20: 27.75, 21: 27.75, 22: 27.75, 24: 24, 25: 24, 26: 24, 30: 22.5, 31: 27.75, 32: 27.75, 33: 27.75 };
  for (let r = 1; r <= 42; r++) sh.setRowHeight(r, Math.round((H[r] || 15.75) * 4 / 3));
  sh.getRange('A1:H42').setFontFamily('Noto Sans JP').setFontSize(10).setFontColor('#111111').setVerticalAlignment('middle').setWrap(true);
  const BS = SpreadsheetApp.BorderStyle;
  const S = function (a, o, v) {
    const r = sh.getRange(a); if (r.getNumRows() > 1 || r.getNumColumns() > 1) r.merge();
    if (v != null) r.getCell(1, 1).setValue(v);
    if (o.sz) r.setFontSize(o.sz); if (o.b) r.setFontWeight('bold'); if (o.c) r.setFontColor(o.c); if (o.bg) r.setBackground(o.bg); if (o.h) r.setHorizontalAlignment(o.h);
    if (o.bd) r.setBorder(true, true, true, true, null, null, o.bd[1], o.bd[0] === 'm' ? BS.SOLID_MEDIUM : BS.SOLID);
    if (o.bb) r.setBorder(null, null, true, null, null, null, o.bb, BS.SOLID_MEDIUM);
    if (o.f) r.setNumberFormat(o.f);
  };
  const head = { sz: 11, b: 1, c: '#FFFFFF', bg: '#17324D', bd: ['m', '#17324D'] }, lab = { sz: 10, b: 1, c: '#17324D', bg: '#E4EBF1', bd: ['t', '#5E6B78'], h: 'center' },
    val = { sz: 11, bg: '#F9FBFC', bd: ['t', '#B7C1CC'] }, big = { sz: 12, b: 1, c: '#FFFFFF', bg: '#17324D', bd: ['m', '#17324D'], h: 'center' };
  S('A2:H2', { sz: 14, b: 1, c: '#0F766E', h: 'center' }, '重要なお知らせ');
  S('A4:H4', { sz: 22, b: 1, c: '#17324D', h: 'center', bb: '#0F766E' }, N.title);
  S('A7:H8', { sz: 11, h: 'left' }, NOTICE_MSG + N.msg);
  S('A10:H10', head, '作業予定');
  S('A11', lab, '建物名'); S('B11:H11', val);
  S('A12:B12', big, N.l12); S('C12:H12', { sz: 16, b: 1, bg: '#FFF7E6', bd: ['m', '#D97706'], h: 'center', f: 'yyyy"年"m"月"d"日"（ddd）' });
  S('A13:B13', big, N.l13); S('C13:H13', { sz: 19, b: 1, bg: '#FFF7E6', bd: ['m', '#D97706'], h: 'center' });
  S('A14', lab, N.l14); S('B14:H14', val);
  S('A15', lab, '対象範囲'); S('B15:H15', val);
  S('A18:H18', head, 'お願い');
  N.asks.forEach(function (t, i) { S('A' + (19 + i) + ':H' + (19 + i), { sz: 11, bg: i % 2 ? '#F4F7FA' : '#FFFFFF', bd: ['t', '#B7C1CC'] }, '・' + t); });
  S('A24:H26', { sz: 12, b: 1, bg: '#FFF3CD', bd: ['m', '#D39E00'], h: 'center' }, N.close);
  S('A30:H30', head, '管理会社・施工事業者');
  S('A31', lab, '管理会社'); S('B31:H31', val);
  S('A32', lab, '施工事業者'); S('B32:D32', val); S('E32', lab, '担当者'); S('F32:H32', val);
  S('A33', lab, '電話番号'); S('B33:D33', val); S('E33', lab, '備考'); S('F33:H33', val);
  S('A36:H36', { sz: 16, b: 1, c: '#17324D', h: 'center' }, 'SunsCreate');
  S('A37:H37', { sz: 9, c: '#0F766E', h: 'center' }, N.en);
}
/* 3種類のお知らせの書式（空欄）を作って設定に登録する（1回だけ実行） */
function makeNoticeTemplates() {
  const st = getSettings_(), folder = DriveApp.getFolderById(tplFolderId_()), out = [];
  Object.keys(NOTICE).forEach(function (k) {
    if (st['tpl_nt_' + k]) return;
    const sp = SpreadsheetApp.create('【書式】自社_' + NOTICE[k].title + '（空欄）');
    DriveApp.getFileById(sp.getId()).moveTo(folder);
    sp.setSpreadsheetLocale('ja_JP'); sp.setSpreadsheetTimeZone('Asia/Tokyo');
    buildNotice_(sp.getSheets()[0].setName('お知らせ_A4縦'), NOTICE[k]);
    st['tpl_nt_' + k] = sp.getUrl(); out.push(sp.getUrl());
  });
  api_saveSettings(st);
  return out;
}
function ntDb_() { const db = db_(); if (!db.getSheetByName('お知らせ')) sheetHead(db.insertSheet('お知らせ'), ['id', 'json', 'updatedAt']); }
function api_notices() { ntDb_(); return listRows_('お知らせ').sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); }).slice(0, 50); }
function api_deleteNotice(id) { ntDb_(); deleteRow_('お知らせ', id); return true; }
function api_makeNotice(o) {
  ntDb_();
  const N = NOTICE[o.kind]; if (!N) throw new Error('お知らせの種類が正しくありません');
  const url = getSettings_()['tpl_nt_' + o.kind]; if (!url) throw new Error('お知らせの書式がまだありません（設定画面を確認してください）');
  const title = (o.date || '').replace(/-/g, '') + '_' + (o.building || '') + '_' + N.title;
  const sp = SpreadsheetApp.openById(copyAsSheet_(idFromUrl(url), title, PROPS.getProperty('reportsId')));
  const sh = sp.getSheets()[0];
  put(sh, 'B11', o.building); put(sh, 'C12', dateIn_(sp, o.date)); put(sh, 'C13', o.time || '');
  put(sh, 'B14', o.kind === 'tank' ? (o.workTime || '') : (o.content || N.content)); put(sh, 'B15', o.range || N.range);
  put(sh, 'B31', o.mgmtCompany || ''); put(sh, 'B32', o.company || 'SunsCreate'); put(sh, 'F32', o.person || ''); put(sh, 'B33', o.tel || ''); put(sh, 'F33', o.note || '');
  SpreadsheetApp.flush();
  const pdf = exportPdf_(sp.getId(), title, true);
  const rec = Object.assign({}, o, { title: N.title, sheetUrl: sp.getUrl(), pdfUrl: pdf.getUrl() });
  delete rec.id; delete rec.updatedAt;
  return saveRow_('お知らせ', rec);
}
