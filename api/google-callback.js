// マワリテ：Google のログインから戻ってくるところ（GET ?code&state）→ 業者のカレンダーとつなぐ
const { sb, ADMIN } = require('./_ai');
const g = require('./_g');

// 戻り先は、ログインしている画面（mawarite.vercel.app）。Google の戻り先（独自ドメイン）とは別
const back = (res, path, q) => { res.setHeader('Location', `${g.BASE}${path}${path.includes('?') ? '&' : '?'}${new URLSearchParams(q)}`); return res.status(302).end(); };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  let path = '/vendor/';
  try {
    const [st] = await sb(`g_oauth_states?state=eq.${encodeURIComponent(String(q.state || ''))}&select=*`, ADMIN);
    if (!st) return back(res, path, { g: 'error', m: 'もう一度「Googleカレンダーとつなぐ」から始めてください' });
    path = st.back || path;
    await sb(`g_oauth_states?state=eq.${encodeURIComponent(st.state)}`, ADMIN, { method: 'DELETE' });
    if (q.error) return back(res, path, { g: 'error', m: q.error === 'access_denied' ? 'Google で許可されませんでした' : String(q.error).slice(0, 200) });
    if (Date.now() - new Date(st.created_at).getTime() > 15 * 60 * 1000) return back(res, path, { g: 'error', m: '時間が経ちすぎました。もう一度つないでください' });
    const t = await g.tokenRequest({ grant_type: 'authorization_code', code: String(q.code || ''), redirect_uri: g.REDIRECT, code_verifier: st.verifier });
    if (!t.refresh_token) return back(res, path, { g: 'error', m: 'Google から鍵が届きませんでした。もう一度つないでください' });
    if (!String(t.scope || '').includes('calendar.events')) return back(res, path, { g: 'error', m: 'カレンダーへの書き込みが許可されませんでした。チェックを入れてもう一度つないでください' });
    let email = '';
    try { email = JSON.parse(Buffer.from(String(t.id_token || '').split('.')[1] || '', 'base64url').toString()).email || ''; } catch (_) {}
    const up = { Prefer: 'resolution=merge-duplicates,return=representation' };
    await sb('g_accounts', ADMIN, { method: 'POST', headers: up, body: JSON.stringify({ user_id: st.user_id, g_email: email, active: true, last_error: '' }) });
    await sb('g_secrets', ADMIN, { method: 'POST', headers: up, body: JSON.stringify({ user_id: st.user_id, refresh_token: t.refresh_token }) });
    // すでに日程が決まっている発注を、まとめてカレンダーに入れる
    const orders = await sb(`orders?select=id,vendors!inner(user_id)&vendors.user_id=eq.${st.user_id}&status=eq.scheduled&start_at=gte.${new Date(Date.now() - 86400000).toISOString()}`, ADMIN);
    for (const o of orders || []) { try { await g.syncOrder(o.id); } catch (_) { /* 1件の失敗で止めない */ } }
    return back(res, path, { g: 'ok' });
  } catch (e) {
    return back(res, path, { g: 'error', m: String(e.message || e).slice(0, 200) });
  }
};
