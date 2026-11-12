// マワリテ：協力業者の招待と登録
//   POST ?op=invite { vendor_id, email }      → 社内の人が招待リンクを作る（メールは画面から本人の Outlook で送る）
//   POST ?op=peek   { token }                 → リンクを開いた業者に、どの会社からの招待かを見せる（ログイン不要）
//   POST ?op=accept { token, email, password } → 業者がメールアドレスとパスワードを決めて登録し、業者として会社に加わる（ログイン不要）
//   POST ?op=notify_order { order_id }        → 正式発注のお知らせメール（本人の Outlook から自動送信。つながっていなければ文面だけ返す）
// 環境変数：SUPABASE_SERVICE_KEY
const crypto = require('crypto');
const { sb, getUser, body, ADMIN } = require('./_ai');
const ms = require('./_ms');

const SB_URL = process.env.SUPABASE_URL || 'https://enwpymkodwogyfegbfsq.supabase.co';
const BASE = process.env.APP_URL || 'https://mawarite.vercel.app';
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const okMail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const fail = (code, message) => Object.assign(new Error(message), { code });

/** 使える招待（期限内・未使用）を、会社名・業者名つきで取り出す */
async function findInvite(token) {
  if (!token || String(token).length < 20) throw fail(404, 'リンクが正しくありません。届いたメールのリンクをもう一度開いてください');
  const [inv] = await sb(`vendor_invites?token_hash=eq.${hash(token)}&select=*,vendors(name),companies(name)`, ADMIN);
  if (!inv) throw fail(404, 'リンクが正しくありません。届いたメールのリンクをもう一度開いてください');
  if (inv.used_at) throw fail(409, 'このリンクはすでに使われています。登録したメールアドレスとパスワードでログインしてください');
  if (new Date(inv.expires_at).getTime() < Date.now()) throw fail(410, 'リンクの期限が切れています。依頼元の会社に、もう一度送ってもらってください');
  return inv;
}

/** その人を、業者として会社に加え、業者台帳に結びつける */
async function linkVendor(inv, uid) {
  const [m] = await sb(`memberships?company_id=eq.${inv.company_id}&user_id=eq.${uid}&select=role`, ADMIN);
  if (m && m.role !== 'vendor') throw fail(409, 'このメールアドレスは依頼元の会社の社員として使われています。別のメールアドレスで登録してください');
  if (!m) {
    await sb('memberships', ADMIN, { method: 'POST', body: JSON.stringify({ company_id: inv.company_id, user_id: uid, role: 'vendor', display_name: inv.vendors?.name || '', email: inv.email }) });
  }
  await sb(`vendors?id=eq.${inv.vendor_id}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ user_id: uid, updated_at: new Date().toISOString() }) });
  await sb(`vendor_invites?id=eq.${inv.id}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ used_at: new Date().toISOString() }) });
}

/** 招待リンクを作る（前の未使用の招待は消す） */
async function makeInvite(v, email, uid) {
  const raw = crypto.randomBytes(32).toString('base64url');
  await sb(`vendor_invites?vendor_id=eq.${v.id}&used_at=is.null`, ADMIN, { method: 'DELETE' });
  await sb('vendor_invites', ADMIN, { method: 'POST', body: JSON.stringify({ company_id: v.company_id, vendor_id: v.id, email, token_hash: hash(raw), created_by: uid }) });
  return `${BASE}/vendor/join/?t=${raw}`;
}

const jst = (t) => (t ? new Date(t).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '');

/** 正式発注のお知らせメールの文面 */
function orderMail(o, v, company, joinUrl) {
  const link = `${BASE}/vendor/order/?id=${o.company_id}&o=${o.id}`;
  const lines = [
    `${v.name} 御中`, '', `いつもお世話になっております。${company}です。`, '新しいお仕事のご依頼がありました。内容をマワリテでご確認ください。', '',
    `■ 物件：${o.property_name || '（マワリテでご確認ください）'}`, `■ 作業：${o.work}`,
  ];
  if (o.start_at) lines.push(`■ 日程（予定）：${jst(o.start_at)}`);
  lines.push('', joinUrl
    ? `▼ はじめての方は、下のリンクからメールアドレスとパスワードを決めてご登録ください（期限14日）\n${joinUrl}\n\n登録後、ご依頼の内容・日程のご連絡・完了報告がマワリテでできます。`
    : `▼ ご依頼の内容を見る・日程を連絡する\n${link}`);
  lines.push('', 'ご不明な点がございましたら、このメールにご返信ください。', 'どうぞよろしくお願いいたします。');
  return { to: v.email, subject: `【マワリテ】${company}から仕事のご依頼がありました（${o.property_name || o.work}）`, body: lines.join('\n') };
}

const ops = {
  async notify_order(req, res) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const u = token ? await getUser(token) : null;
    if (!u?.id) throw fail(401, 'ログインしてください');
    const oid = encodeURIComponent(String(body(req).order_id || ''));
    // 本人の権限で見える発注か（＝その会社の社員か）
    const [o] = await sb(`orders?id=eq.${oid}&select=id,company_id,vendor_id,task_id,status,work,property_name,start_at,companies(name)`, token);
    if (!o) throw fail(404, '発注が見つかりません');
    const [me] = await sb(`memberships?company_id=eq.${o.company_id}&user_id=eq.${u.id}&select=role`, token);
    if (!me || me.role === 'vendor') throw fail(403, '社内の人だけが送れます');
    if (['draft', 'cancelled'].includes(o.status)) throw fail(409, 'まだ正式に発注していません');
    const [v] = await sb(`vendors?id=eq.${o.vendor_id}&select=id,company_id,name,email,user_id`, ADMIN);
    if (!v?.email || !okMail(v.email)) return res.status(200).json({ sent: false, reason: 'no_email' });
    const joinUrl = v.user_id ? '' : await makeInvite(v, v.email.toLowerCase(), u.id);
    const mail = orderMail(o, v, o.companies?.name || '', joinUrl);
    const [acc] = await sb(`ms_accounts?user_id=eq.${u.id}&select=id,active,ms_email`, ADMIN);
    let sent = false;
    let from = '';
    if (acc?.active) {
      try {
        const at = await ms.accessToken(acc.id);
        await ms.graph(at, '/me/sendMail', { method: 'POST', body: JSON.stringify({ message: { subject: mail.subject, body: { contentType: 'Text', content: mail.body }, toRecipients: [{ emailAddress: { address: mail.to } }] }, saveToSentItems: true }) });
        sent = true; from = acc.ms_email || '';
      } catch (_) { /* 送れなければ画面から送ってもらう */ }
    }
    if (sent && o.task_id) {
      await sb('task_events', ADMIN, { method: 'POST', body: JSON.stringify({ company_id: o.company_id, task_id: o.task_id, actor: u.id, type: 'mail_sent', body: mail.subject, data: { to: mail.to, subject: mail.subject, order_id: o.id } }) });
    }
    return res.status(200).json({ sent, from, mail, invited: !!joinUrl });
  },

  async invite(req, res) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const u = token ? await getUser(token) : null;
    if (!u?.id) throw fail(401, 'ログインしてください');
    const b = body(req);
    const email = String(b.email || '').trim().toLowerCase();
    if (!okMail(email)) throw fail(400, 'メールアドレスの形を確かめてください');
    // 本人の権限で業者が見えるか（＝その会社の社員か）、役割も確かめる
    const [v] = await sb(`vendors?id=eq.${encodeURIComponent(String(b.vendor_id || ''))}&select=id,company_id,name,email,companies(name)`, token);
    if (!v) throw fail(404, '業者が見つかりません');
    const [me] = await sb(`memberships?company_id=eq.${v.company_id}&user_id=eq.${u.id}&select=role`, token);
    if (!me || !['admin', 'approver', 'staff'].includes(me.role)) throw fail(403, '招待できるのは社内の人だけです');
    // 前に送った、まだ使われていない招待は無効にする（リンクは常に最新の1つだけ）
    const url = await makeInvite(v, email, u.id);
    if (!v.email) await sb(`vendors?id=eq.${v.id}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ email }) });
    return res.status(200).json({ url, email, vendor: v.name, company: v.companies?.name || '' });
  },

  async peek(req, res) {
    const inv = await findInvite(body(req).token);
    const [name, dom] = inv.email.split('@');
    return res.status(200).json({ company: inv.companies?.name || '', vendor: inv.vendors?.name || '', hint: `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}@${dom}` });
  },

  async accept(req, res) {
    const b = body(req);
    const inv = await findInvite(b.token);
    const email = String(b.email || '').trim().toLowerCase();
    const pw = String(b.password || '');
    if (email !== inv.email.toLowerCase()) throw fail(400, '招待されたメールアドレスと違います。このリンクが届いたメールアドレスを入れてください');
    if (pw.length < 8) throw fail(400, 'パスワードは8文字以上にしてください');
    // ログインを作る（メールの確認は、招待リンクが届いたことで済んでいる）
    const r = await fetch(`${SB_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw, email_confirm: true }),
    });
    const j = await r.json().catch(() => ({}));
    let uid = j?.id;
    let existed = false;
    if (!r.ok) {
      const msg = String(j?.msg || j?.message || j?.error_description || '');
      if (!/already|registered|exists/i.test(msg) && r.status !== 422) throw fail(502, 'アカウントを作れませんでした。少し時間をおいてもう一度お試しください');
      uid = await sb('rpc/svc_user_id_by_email', ADMIN, { method: 'POST', body: JSON.stringify({ e: email }) });
      if (!uid) throw fail(502, 'アカウントを作れませんでした。少し時間をおいてもう一度お試しください');
      existed = true;
    }
    await linkVendor(inv, uid);
    return res.status(200).json({ ok: true, company_id: inv.company_id, existed });
  },
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const op = String(req.query?.op || '');
  if (!ops[op]) return res.status(404).json({ error: 'unknown op' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: '設定がまだです' });
  try {
    return await ops[op](req, res);
  } catch (e) {
    return res.status([400, 401, 403, 404, 409, 410, 502].includes(e.code) ? e.code : 500).json({ error: String(e.message || e).slice(0, 300) });
  }
};
module.exports.hash = hash;
module.exports.orderMail = orderMail;
