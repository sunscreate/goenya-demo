// マワリテ：タスクに対してAIが「できる準備」をする（下書き・次にやること）。送信や発注はしない。
// POST /api/task-ai/  { task_id, instruction? }   Authorization: Bearer <Supabaseのログイン>
// 環境変数：ANTHROPIC_API_KEY（必須）、AI_MODEL（省略時 claude-sonnet-5-5）
const { getUser, propose, body } = require('./_ai');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AIはまだ準備中です（APIキー未設定）', ready: false });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'ログインしてください' });
  try {
    const b = body(req);
    const tid = String(b.task_id || '');
    if (!/^[0-9a-f-]{36}$/.test(tid)) return res.status(400).json({ error: 'task_id が必要です' });
    const me = await getUser(token);
    if (!me?.id) return res.status(401).json({ error: 'ログインが切れました' });
    const ai = await propose(token, tid, String(b.instruction || '').slice(0, 2000), me);
    return res.status(200).json({ ai });
  } catch (e) {
    return res.status([401, 404, 502].includes(e.code) ? e.code : 500).json({ error: String(e.message || e).slice(0, 300) });
  }
};
