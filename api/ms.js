// マワリテ：Outlook（Microsoft Graph）との連携
//   POST ?op=start   { company_id }                 → Microsoft のログイン画面のURL（社員がログイン中であること）
//   POST ?op=send    { to, cc?, subject, body, attachments?[{name,type,data(base64)}] } → 本人の Outlook から送信
//   POST ?op=sync                                   → 自分の受信箱を今すぐ確かめる
//   POST ?op=notify  （Microsoft からの「メールが届いた」通知）
//   GET  ?op=renew   （毎日の自動実行：通知の期限を延ばし、取りこぼしを確かめる）
// 環境変数：MS_CLIENT_SECRET、SUPABASE_SERVICE_KEY、ANTHROPIC_API_KEY
const crypto = require('crypto');
const { sb, getUser, body, ADMIN } = require('./_ai');
const ms = require('./_ms');

async function me(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('ログインしてください'), { code: 401 });
  const u = await getUser(token);
  if (!u?.id) throw Object.assign(new Error('ログインが切れました'), { code: 401 });
  return { token, user: u };
}
const myAccount = async (uid) => (await sb(`ms_accounts?user_id=eq.${uid}&select=*`, ADMIN))[0];

const ops = {
  async start(req, res) {
    const { token, user } = await me(req);
    const cid = String(body(req).company_id || '');
    // 自分の会社の社員か（本人の権限で確かめる）
    const [m] = await sb(`memberships?company_id=eq.${cid}&user_id=eq.${user.id}&role=neq.vendor&select=role`, token);
    if (!m) return res.status(403).json({ error: 'この会社の社員ではありません' });
    const state = ms.b64url(crypto.randomBytes(24));
    const verifier = ms.b64url(crypto.randomBytes(32));
    await sb('ms_oauth_states', ADMIN, { method: 'POST', body: JSON.stringify({ state, user_id: user.id, company_id: cid, verifier }) });
    const challenge = ms.b64url(crypto.createHash('sha256').update(verifier).digest());
    const q = new URLSearchParams({
      client_id: ms.CLIENT_ID, response_type: 'code', redirect_uri: ms.REDIRECT, response_mode: 'query', scope: ms.SCOPES,
      state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account', login_hint: user.email || '',
    });
    return res.status(200).json({ url: `${ms.AUTH}/authorize?${q}` });
  },

  async send(req, res) {
    const { user } = await me(req);
    const acc = await myAccount(user.id);
    if (!acc?.active) return res.status(409).json({ error: 'Outlook とつながっていません（会社の画面で「Microsoft でつなぐ」）' });
    const b = body(req);
    const list = (s) => String(s || '').split(/[,;\s]+/).filter((x) => /@/.test(x)).map((address) => ({ emailAddress: { address } }));
    const to = list(b.to);
    if (!to.length) return res.status(400).json({ error: '宛先がありません' });
    const atts = (b.attachments || []).slice(0, 5).map((a) => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: String(a.name || 'file'), contentType: a.type || 'application/octet-stream', contentBytes: String(a.data || '') }));
    const token = await ms.accessToken(acc.id);
    await ms.graph(token, '/me/sendMail', {
      method: 'POST',
      body: JSON.stringify({ message: { subject: String(b.subject || ''), body: { contentType: 'Text', content: String(b.body || '') }, toRecipients: to, ccRecipients: list(b.cc), attachments: atts }, saveToSentItems: true }),
    });
    return res.status(200).json({ sent: true, from: acc.ms_email });
  },

  async sync(req, res) {
    const { user } = await me(req);
    const acc = await myAccount(user.id);
    if (!acc?.active) return res.status(409).json({ error: 'Outlook とつながっていません' });
    const { imported, token } = await ms.syncInbox(acc, 5);
    try { await ms.ensureSubscription(acc, token); } catch (e) { await sb(`ms_accounts?id=eq.${acc.id}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ last_error: String(e.message).slice(0, 200) }) }); }
    return res.status(200).json({ imported });
  },

  async notify(req, res) {
    // 通知先の確認（作るときに Microsoft が送ってくる）
    if (req.query?.validationToken) { res.setHeader('Content-Type', 'text/plain'); return res.status(200).send(String(req.query.validationToken)); }
    const items = body(req).value || [];
    const work = (async () => {
      for (const n of items) {
        const [acc] = await sb(`ms_accounts?sub_id=eq.${encodeURIComponent(n.subscriptionId || '')}&active=eq.true&select=*`, ADMIN);
        if (!acc) continue;
        const [s] = await sb(`ms_secrets?account_id=eq.${acc.id}&select=client_state`, ADMIN);
        if (!s || n.clientState !== s.client_state) continue; // なりすまし防止
        const id = n.resourceData?.id;
        if (!id) continue;
        try {
          const token = await ms.accessToken(acc.id);
          await ms.importMessage(acc, token, id, true);
          await sb(`ms_accounts?id=eq.${acc.id}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ last_sync: new Date().toISOString(), last_error: '' }) });
        } catch (e) {
          await sb(`ms_accounts?id=eq.${acc.id}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ last_error: String(e.message).slice(0, 200) }) });
        }
      }
    })();
    // Microsoft には3秒以内に返す。処理は返したあとに続ける
    if (ms.later(work)) return res.status(202).end();
    await work;
    return res.status(202).end();
  },

  async renew(req, res) {
    const accs = await sb('ms_accounts?active=eq.true&select=*&order=sub_expires.asc.nullsfirst&limit=50', ADMIN);
    const out = [];
    for (const acc of accs) {
      try {
        const { imported, token, errors, folders, listed } = await ms.syncInbox(acc, 3);
        await ms.ensureSubscription(acc, token);
        out.push({ id: acc.id, imported, folders, listed, errors: errors.length ? errors : undefined });
      } catch (e) {
        await sb(`ms_accounts?id=eq.${acc.id}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ last_error: String(e.message).slice(0, 200) }) });
        out.push({ id: acc.id, error: true });
      }
    }
    return res.status(200).json({ accounts: out.length, out });
  },
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const op = String(req.query?.op || '');
  if (!ops[op]) return res.status(404).json({ error: 'unknown op' });
  if (op !== 'renew' && op !== 'notify' && req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.SUPABASE_SERVICE_KEY || !process.env.MS_CLIENT_SECRET) return res.status(503).json({ error: 'Microsoft 連携の設定がまだです' });
  try {
    return await ops[op](req, res);
  } catch (e) {
    if (op === 'notify') return res.status(202).end();
    return res.status([401, 403, 404, 409, 502].includes(e.code) ? e.code : 500).json({ error: String(e.message || e).slice(0, 300) });
  }
};
