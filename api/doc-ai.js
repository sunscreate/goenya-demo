// マワリテ：自社の書類の雛形（Excel）をAIが読み、どのセルに何を書くか（mapping）を返す
// POST /api/doc-ai/  { kind, name, cells }   Authorization: Bearer <Supabaseのログイン>
const { getUser, claude, body } = require('./_ai');

const KIND = { quote: '見積書', invoice: '請求書', report: '作業報告書', order: '発注書', other: '書類' };
const col = { type: 'string', description: '列の記号（例 B）。なければ空' };
const cell = (d) => ({ type: 'string', description: `${d}を書くセル番地（例 B4）。書く場所がなければ空` });

const TOOL = {
  name: 'template_map',
  description: '書類の雛形のどこに何を書くか',
  input_schema: {
    type: 'object',
    properties: {
      sheet: { type: 'string', description: '書き込むシート名' },
      fields: {
        type: 'object',
        properties: {
          to_name: cell('宛名（顧客名。「様」「御中」の前）'), subject: cell('件名・工事名'), site: cell('物件名・現場'),
          number: cell('書類番号'), issue_date: cell('発行日'), valid_until: cell('有効期限'),
          subtotal: cell('小計（税抜）'), tax: cell('消費税'), total: cell('合計（税込）'), note: cell('備考'),
        },
      },
      lines: {
        type: 'object', description: '明細の表',
        properties: {
          start_row: { type: 'integer', description: '明細の1行目の行番号（見出しの次の行）' },
          end_row: { type: 'integer', description: '明細の最後の行番号（小計の手前）' },
          cols: { type: 'object', properties: { name: col, qty: col, unit: col, unit_price: col, amount: col } },
        },
      },
      summary: { type: 'string', description: 'この雛形の特徴（1〜2文）' },
      warnings: { type: 'array', items: { type: 'string' }, description: '気をつける点（例：合計は数式なので上書きしない、など）' },
    },
    required: ['fields', 'lines', 'summary'],
  },
};

const SYSTEM = `あなたは日本の建物管理・ビルメンテナンス会社の書類に詳しい事務担当です。
渡された Excel の雛形（セル番地と中身の一覧、結合セル）をしっかり読み、データを書き込むセル番地を答えます。
守ること：
- 見出し（「御見積書」「件名」「合計金額」などのラベル）そのものではなく、その値を書く隣・下のセル（結合セルなら左上）を答える。
- 数式（= で始まる）が入っているセルは、自動で計算されるので fields に入れない。warnings に「〇〇は数式」と書く。
- 明細は、見出し行（品名・数量・単位・単価・金額など）の次の行から、小計・合計の手前まで。
- 自信がない場所は空にして warnings に書く。作らない。
- 必ず template_map の道具で答える。`;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AIはまだ準備中です（APIキー未設定）' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'ログインしてください' });
  try {
    const me = await getUser(token);
    if (!me?.id) return res.status(401).json({ error: 'ログインが切れました' });
    const b = body(req);
    const cells = String(b.cells || '').slice(0, 30000);
    if (!cells) return res.status(400).json({ error: '雛形の中身が空です' });
    const content = `# 書類の種類\n${KIND[b.kind] || '書類'}（名前：${String(b.name || '').slice(0, 100)}）\n\n# 雛形の中身\n${cells}`;
    const { out, usage, model } = await claude(SYSTEM, TOOL, content, 3000);
    return res.status(200).json({ mapping: out, usage, model });
  } catch (e) {
    return res.status([401, 502].includes(e.code) ? e.code : 500).json({ error: String(e.message || e).slice(0, 300) });
  }
};
