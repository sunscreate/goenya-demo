// マワリテ：Microsoft のログインから戻ってくるところ（GET）
//   ?code&state   社員が「Microsoft でつなぐ」でログインした → 受信箱とつなぐ
//   ?admin_consent=True&tenant=…   会社の管理者が「組織として許可」した
const { sb, ADMIN } = require('./_ai');
const ms = require('./_ms');

const back = (res, q) => { res.setHeader('Location', `/company/?${new URLSearchParams(q)}`); return res.status(302).end(); };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  if (q.admin_consent) return back(res, { ms: String(q.admin_consent).toLowerCase() === 'true' ? 'consented' : 'error', m: q.error_description || '' });
  if (q.error) return back(res, { ms: 'error', m: String(q.error_description || q.error).slice(0, 300) });
  try {
    const [st] = await sb(`ms_oauth_states?state=eq.${encodeURIComponent(String(q.state || ''))}&select=*`, ADMIN);
    if (!st) return back(res, { ms: 'error', m: 'もう一度「Microsoft でつなぐ」から始めてください' });
    await sb(`ms_oauth_states?state=eq.${encodeURIComponent(st.state)}`, ADMIN, { method: 'DELETE' });
    if (Date.now() - new Date(st.created_at).getTime() > 15 * 60 * 1000) return back(res, { ms: 'error', m: '時間が経ちすぎました。もう一度つないでください' });
    const t = await ms.tokenRequest({ grant_type: 'authorization_code', code: String(q.code || ''), redirect_uri: ms.REDIRECT, code_verifier: st.verifier });
    const meInfo = await ms.graph(t.access_token, '/me?$select=displayName,mail,userPrincipalName');
    const email = (meInfo.mail || meInfo.userPrincipalName || '').toLowerCase();
    // 1人1つ：つなぎ直しなら入れ替える
    await sb(`ms_accounts?user_id=eq.${st.user_id}`, ADMIN, { method: 'DELETE' });
    const [acc] = await sb('ms_accounts', ADMIN, {
      method: 'POST', body: JSON.stringify({ company_id: st.company_id, user_id: st.user_id, ms_email: email, ms_name: meInfo.displayName || '', last_sync: new Date().toISOString() }),
    });
    await sb('ms_secrets', ADMIN, { method: 'POST', body: JSON.stringify({ account_id: acc.id, refresh_token: t.refresh_token }) });
    try { await ms.ensureSubscription(acc, t.access_token); } catch (e) {
      await sb(`ms_accounts?id=eq.${acc.id}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ last_error: `受信の通知を作れませんでした：${e.message}`.slice(0, 200) }) });
    }
    return back(res, { ms: 'ok' });
  } catch (e) {
    return back(res, { ms: 'error', m: String(e.message || e).slice(0, 300) });
  }
};
