// その場レポ AI（Claude）で、Excelの書式から記入欄を見分ける
// POST /api/ai  { action: "template", name, sheets:[{name, cells:[[A1, 文字]], merges:[A1:B2], rows, cols}], draft, answers }
//               { action: "notice", name, sheets:[…], draft:{sheet, cells:{欄:セル}} }  お知らせ（掲示物）の記入欄
// Authorization: Bearer <Googleのアクセストークン>
//
// 必要な環境変数（Vercelの設定に入れる）
//   ANTHROPIC_API_KEY : Claude API のキー
//   AI_MODEL          : 省略時 claude-sonnet-5-5
// 月額プランを使っている人（お試し中・持ち主を含む）だけが使える

const { whoIs, status } = require('./sub.js')._lib;

const MODEL = () => process.env.AI_MODEL || 'claude-sonnet-5-5';
const MAX_IN = 120000; // 送る書式の説明の上限（文字）

const TYPES = ['text', 'textarea', 'date', 'time', 'number', 'choice', 'select'];
const STD = ['', 'building', 'address', 'date', 'time', 'inspector', 'mgmtCompany', 'weather', 'company'];

const SYSTEM = `あなたは、建物の設備点検（給水ポンプ・貯水槽・排水管・消防・空調など）の報告書の書式を読み解く担当です。
Excelの書式の「文字の入ったマス」と「結合したマス」の一覧から、点検する人がスマホで入力する欄を見つけて、save_template で返します。

決まり：
- 欄（fields）は、値を書き込むマス（ふつうは見出しの右か下の、空いている結合マスの左上）を cell に入れる。見出しの文字が入ったマス自体には書かない。
- label は、現場の人がわかる短い日本語（例：「建物名」「点検日」「所見」）。
- std は、次のどれかに当てはまるときだけ入れる：building(建物名・物件名・マンション名), address(所在地), date(作業日・点検日), time(作業時間), inspector(点検者・担当者・責任者), mgmtCompany(宛先・管理会社・お客様), weather(天候), company(点検会社・自社名)。当てはまらなければ空。
- type：text／textarea(所見・備考など何行も書く欄。下に続く行は more に)／date／time／number／choice(「有・無」「良・否」「済・未」のように書式にある選択肢から選ぶ。opts に選択肢)／select。
- 「有・無」「良・否」などが同じ並びで何行も続く判定の表は、fields ではなく grids にまとめる：
  {title: 表の名前, sheet, cols: 判定を書く列の配列（例 ["I","J","K"]）, heads: それぞれの列の見出し（例 ["①NO1","①NO2","②NO1"]）, act: 必要処置の列（無ければ空）, rows: [[行番号, 項目名, "有・無" か 数値なら "#"]], headRows: [[行番号, 見出し, [[列, 名前]]]]（機器名・型式・設置場所など表の上の記入行。無ければ空配列）}
- 「作成例」「記入例」「見本」のシートや、宛名の「御中」などの決まり文字は、欄にしない。
- 写真を貼る枠は、ここでは扱わない（別の仕組みで見つける）。
- 自信がない点だけ、questions に最大3つまで、選択肢付きで聞く（例：「この表の②の列は使いますか？」）。わかるところは聞かない。answers が来ていたら、それに従って仕上げ、questions は空にする。
- draft は、機械的に見つけた下書き。参考にして、間違いを直し、足りない欄を足す。
- 答えは必ず save_template を1回呼んで返す。文章だけで答えない。`;

const TOOL = {
  name: 'save_template',
  description: '書式から見つけた入力欄・判定の表・確認したいことを保存する',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '書類の名前（例：一般設備点検報告書）' },
      fields: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sheet: { type: 'string' }, cell: { type: 'string' }, label: { type: 'string' },
            type: { type: 'string', enum: TYPES }, std: { type: 'string', enum: STD },
            opts: { type: 'array', items: { type: 'string' } }, group: { type: 'string' },
            more: { type: 'array', items: { type: 'string' } },
          },
          required: ['sheet', 'cell', 'label', 'type'],
        },
      },
      grids: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' }, sheet: { type: 'string' },
            cols: { type: 'array', items: { type: 'string' } }, heads: { type: 'array', items: { type: 'string' } },
            act: { type: 'string' }, rows: { type: 'array', items: { type: 'array' } }, headRows: { type: 'array', items: { type: 'array' } },
          },
          required: ['title', 'sheet', 'cols', 'heads', 'rows'],
        },
      },
      questions: {
        type: 'array', maxItems: 3,
        items: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } } }, required: ['id', 'text', 'choices'] },
      },
    },
    required: ['name', 'fields', 'grids', 'questions'],
  },
};

// ───── お知らせ（掲示物）の書式 ─────
const NOTICE_FIELDS = {
  building: '建物名・物件名', date: '作業日・施工日・日時（日付を書くマス）', time: '断水時間・点検時間（時間を書くマス）',
  workTime: '施工時間・作業時間（断水時間とは別に作業の時間を書くマスがあるとき）', content: '作業内容', range: '対象範囲・断水範囲・作業場所',
  mgmtCompany: '管理会社', company: '施工事業者・作業会社', person: '担当者', tel: '電話番号・連絡先', note: '備考',
};
const N_SYSTEM = `あなたは、建物の設備工事・点検の「お知らせ」（住民向けの掲示物）のExcel書式を読み解く担当です。
書式の「文字の入ったマス」と「結合したマス」の一覧から、次の項目を書き込むマスを見つけて、save_notice で返します。
項目：${Object.entries(NOTICE_FIELDS).map(([k, v]) => `${k}（${v}）`).join('、')}

決まり：
- cell は、値を書き込むマス（見出しの右や下の空いているマス。結合していれば結合の左上）。見出しの文字が入ったマス自体には書かない。
- 「{建物名}」「【日時】」のように記入欄そのものに書いてあれば、そのマス。
- 書式に無い項目は入れない（無理に作らない）。本文の決まり文句（「平素より…」など）のマスは使わない。
- sheet は、お知らせが書かれたシートの名前。
- draft は機械で見つけた下書き。間違いを直し、足りない項目を足す。
- 答えは必ず save_notice を1回呼んで返す。文章だけで答えない。`;
const N_TOOL = {
  name: 'save_notice',
  description: 'お知らせの書式で、各項目を書き込むマスを保存する',
  input_schema: {
    type: 'object',
    properties: {
      sheet: { type: 'string' },
      cells: { type: 'object', properties: Object.fromEntries(Object.keys(NOTICE_FIELDS).map((k) => [k, { type: 'string', description: 'A1形式のセル番地' }])) },
    },
    required: ['sheet', 'cells'],
  },
};

function describe(body) {
  const lines = [`ファイル名：${body.name || ''}`];
  for (const sh of body.sheets || []) {
    lines.push(`\n## シート「${sh.name}」（${sh.rows || '?'}行 × ${sh.cols || '?'}列）`);
    lines.push('結合：' + (sh.merges || []).join(' '));
    lines.push('文字の入ったマス：');
    for (const [a, t] of sh.cells || []) lines.push(`${a}\t${String(t).replace(/\s+/g, ' ').slice(0, 80)}`);
  }
  let s = lines.join('\n');
  if (s.length > MAX_IN) s = s.slice(0, MAX_IN) + '\n…（長いので省略）';
  if (body.draft) s += `\n\n## 下書き（機械で見つけたもの）\n${JSON.stringify(body.draft).slice(0, 30000)}`;
  if (Array.isArray(body.answers) && body.answers.length) {
    s += `\n\n## 確認への答え\n${body.answers.map((a) => `- ${a.text}：${a.answer}`).join('\n')}\nこの答えに従って仕上げ、questions は空にしてください。`;
  }
  return s;
}

async function template(body) {
  const notice = body.action === 'notice';
  const tool = notice ? N_TOOL : TOOL;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: notice ? 2000 : 16000,
      system: notice ? N_SYSTEM : SYSTEM,
      tools: [tool],
      tool_choice: { type: 'auto' }, // このモデルは「必ずこの道具」の指定ができないので、指示で必ず使わせる
      messages: [{ role: 'user', content: describe(body) }],
    }),
  });
  const j = await r.json();
  if (!r.ok) {
    const e = new Error(j.error?.message || `Claude ${r.status}`);
    e.code = r.status;
    throw e;
  }
  const t = (j.content || []).find((c) => c.type === 'tool_use' && c.name === tool.name);
  if (t) return { result: t.input, usage: j.usage };
  // 念のため：文章の中のJSONを読む
  const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return { result: JSON.parse(m[0]), usage: j.usage };
    } catch (_) {}
  }
  throw new Error('AIの答えが読めませんでした');
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AIはまだ準備中です', ready: false });
    const email = await whoIs(req);
    if (!email) return res.status(401).json({ error: 'Googleにつないでから、もう一度お試しください' });
    const st = await status(email);
    if (!st.active) return res.status(402).json({ error: '月額プランのお申し込みで使えます', needSub: true });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (body.action !== 'template' && body.action !== 'notice') return res.status(400).json({ error: 'unknown action' });
    const out = await template(body);
    console.log('ai', body.action, email.replace(/^(.).*@/, '$1***@'), MODEL(), JSON.stringify(out.usage));
    return res.status(200).json(out);
  } catch (e) {
    console.error('ai error', e.code || '', e.message);
    return res.status(500).json({ error: 'AIで読み取れませんでした。少し待ってからお試しください' });
  }
};

module.exports._test = { describe, TOOL, N_TOOL };
