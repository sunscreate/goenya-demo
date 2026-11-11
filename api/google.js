// マワリテ：協力業者の Google カレンダー連携
//   POST ?op=status                 → { configured, account }（ボタンを出すかどうか）
//   POST ?op=start  { back? }       → Google のログイン画面のURL（業者がログイン中であること）
//   POST ?op=push   { order_id }    → その発注を業者のカレンダーにそろえる（業者本人か、発注した会社の社員）
//   POST ?op=disconnect             → つながりを切る（Google 側の許可も取り消す）
// 環境変数：GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET、SUPABASE_SERVICE_KEY
const crypto = require('crypto');
const { sb, getUser, body, ADMIN } = require('./_ai');
const g = require('./_g');

const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function me(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('ログインしてください'), { code: 401 });
  const u = await getUser(token);
  if (!u?.id) throw Object.assign(new Error('ログインが切れました'), { code: 401 });
  return { token, user: u };
}

const ops = {
  async status(req, res) {
    const { user } = await me(req);
    if (!g.configured()) return res.status(200).json({ configured: false });
    const [a] = await sb(`g_accounts?user_id=eq.${user.id}&select=g_email,active,last_error`, ADMIN);
    return res.status(200).json({ configured: true, account: a || null });
  },

  async start(req, res) {
    const { user } = await me(req);
    const back = String(body(req).back || '/vendor/').slice(0, 300);
    const state = b64url(crypto.randomBytes(24));
    const verifier = b64url(crypto.randomBytes(32));
    await sb('g_oauth_states', ADMIN, { method: 'POST', body: JSON.stringify({ state, user_id: user.id, verifier, back: back.startsWith('/') ? back : '/vendor/' }) });
    const q = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: g.REDIRECT, response_type: 'code', scope: g.SCOPES,
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
      code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
      login_hint: user.email || '',
    });
    return res.status(200).json({ url: `${g.AUTH}?${q}` });
  },

  async push(req, res) {
    const { token, user } = await me(req);
    const oid = String(body(req).order_id || '');
    // 本人の権限で発注が見えるか（業者本人か、その会社の社員）。見えなければ何もしない
    const [o] = await sb(`orders?id=eq.${encodeURIComponent(oid)}&select=id`, token);
    if (!o) return res.status(404).json({ error: '発注が見つかりません' });
    const r = await g.syncOrder(oid);
    return res.status(200).json(r);
  },

  async disconnect(req, res) {
    const { user } = await me(req);
    const [s] = await sb(`g_secrets?user_id=eq.${user.id}&select=refresh_token`, ADMIN);
    if (s) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(s.refresh_token)}`, { method: 'POST' }).catch(() => {});
    await sb(`order_gcal?user_id=eq.${user.id}`, ADMIN, { method: 'DELETE' });
    await sb(`g_accounts?user_id=eq.${user.id}`, ADMIN, { method: 'DELETE' });
    return res.status(200).json({ ok: true });
  },
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const op = String(req.query?.op || '');
  if (!ops[op]) return res.status(404).json({ error: 'unknown op' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: '設定がまだです' });
  if (op !== 'status' && !g.configured()) return res.status(503).json({ error: 'Google カレンダーとの連携は準備中です' });
  try {
    return await ops[op](req, res);
  } catch (e) {
    return res.status([401, 403, 404, 409, 502].includes(e.code) ? e.code : 500).json({ error: String(e.message || e).slice(0, 300) });
  }
};
