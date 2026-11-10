// マワリテ：メールの自動取り込み（受信サービス Resend / Postmark の Webhook から呼ばれる）
// POST /api/mail-in/?key=<MAIL_IN_SECRET>   本文：Postmark の受信JSON
// 宛先の「+」の後ろ（MailboxHash）が受信箱の合言葉。会社と受信箱の持ち主をそこから決める
// 環境変数：SUPABASE_SERVICE_KEY（必須）、MAIL_IN_SECRET（省略時は app_secrets の mail_in_secret）（サーバーとして書き込むため）、ANTHROPIC_API_KEY
const { sb, body, upload, ADMIN } = require('./_ai');
const { processMail } = require('./mail-ai');

const addr = (s) => (String(s || '').match(/<([^>]+)>/)?.[1] || String(s || '')).trim().toLowerCase();
const header = (hs, name) => (hs || []).find((h) => String(h.Name).toLowerCase() === name)?.Value || '';
const stripHtml = (h) => String(h || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Resend の受信：Webhook には中身がないので、APIで本文と添付を取りに行き、Postmark と同じ形にそろえる */
async function fromResend(d) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY が未設定です');
  const get = async (u) => { const r = await fetch(`https://api.resend.com${u}`, { headers: { Authorization: `Bearer ${key}` } }); if (!r.ok) throw new Error(`resend ${r.status}`); return r.json(); };
  const e = await get(`/emails/receiving/${encodeURIComponent(d.email_id)}`);
  const atts = [];
  if ((e.attachments || []).length) {
    const l = await get(`/emails/receiving/${encodeURIComponent(d.email_id)}/attachments?limit=20`);
    for (const a of l.data || []) {
      if (!a.download_url || (a.size || 0) > 20 * 1024 * 1024) continue;
      const r = await fetch(a.download_url);
      if (r.ok) atts.push({ Name: a.filename, ContentType: a.content_type, Content: Buffer.from(await r.arrayBuffer()).toString('base64') });
    }
  }
  const from = String(e.from || d.from || '');
  const to = [...(d.received_for || []), ...(e.to || d.to || [])];
  return {
    From: from, FromFull: { Email: addr(from), Name: (from.match(/^\s*"?([^"<]+?)"?\s*</) || [])[1] || '' },
    To: to.join(', '), ToFull: to.map((x) => ({ Email: addr(x) })), CcFull: (e.cc || d.cc || []).map((x) => ({ Email: addr(x) })),
    Subject: e.subject || d.subject || '', TextBody: e.text || '', HtmlBody: e.html || '', Date: e.created_at || d.created_at,
    Headers: [{ Name: 'Message-ID', Value: e.message_id || d.message_id || d.email_id }], Attachments: atts,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY が未設定です' });
  try {
    // 鍵：環境変数 MAIL_IN_SECRET か、データベースの app_secrets（サーバーだけが読める）
    const secret = process.env.MAIL_IN_SECRET || (await sb('app_secrets?key=eq.mail_in_secret&select=value', ADMIN))?.[0]?.value;
    const key = String(req.query?.key || '');
    if (!secret || key.length !== secret.length || !require('crypto').timingSafeEqual(Buffer.from(key), Buffer.from(secret))) return res.status(401).json({ error: 'unauthorized' });
    let p = body(req);
    if (p.type === 'email.received' && p.data?.email_id) p = await fromResend(p.data);
    // 合言葉：MailboxHash（Postmark）か、宛先の「+」の後ろ
    const rcpts = [p.OriginalRecipient, p.To, ...(p.ToFull || []).map((x) => x.Email)].filter(Boolean).join(',');
    const token = String(p.MailboxHash || rcpts.match(/(?:^|[+,\s<])([0-9a-f]{32})@/i)?.[1] || '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(token)) return res.status(200).json({ skipped: 'no token' }); // 200 で返す（送り直させない）
    const [box] = await sb(`mail_inboxes?token=eq.${token}&active=eq.true&select=id,company_id,owner_user,received_count`, ADMIN);
    if (!box) return res.status(200).json({ skipped: 'unknown inbox' });

    const cid = box.company_id;
    const messageId = header(p.Headers, 'message-id') || p.MessageID || `${Date.now()}`;
    const [dup] = await sb(`emails?company_id=eq.${cid}&message_id=eq.${encodeURIComponent(messageId)}&select=id`, ADMIN);
    if (dup) return res.status(200).json({ duplicate: true });

    const id = require('crypto').randomUUID();
    const atts = [];
    for (const a of (p.Attachments || []).slice(0, 20)) {
      const name = String(a.Name || 'file').replace(/[\\/]/g, '_');
      const buf = Buffer.from(a.Content || '', 'base64');
      if (buf.length > 20 * 1024 * 1024) continue;
      const path = `${cid}/${id}/${name}`;
      if (await upload('mail', path, buf, a.ContentType, ADMIN)) atts.push({ name, size: buf.length, type: a.ContentType || '', path });
    }
    const text = String(p.TextBody || '').trim() || stripHtml(p.HtmlBody).trim();
    await sb('emails', ADMIN, {
      method: 'POST',
      body: JSON.stringify({
        id, company_id: cid, owner_user: box.owner_user, message_id: messageId,
        from_addr: addr(p.FromFull?.Email || p.From), from_name: p.FromFull?.Name || p.FromName || '',
        to_addrs: (p.ToFull || []).map((x) => x.Email).join(', ') || String(p.To || ''), cc_addrs: (p.CcFull || []).map((x) => x.Email).join(', ') || String(p.Cc || ''),
        subject: String(p.Subject || ''), received_at: p.Date ? new Date(p.Date).toISOString() : new Date().toISOString(),
        body: text.slice(0, 200000), attachments: atts,
      }),
    });
    await sb(`mail_inboxes?id=eq.${box.id}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ last_received_at: new Date().toISOString(), received_count: (box.received_count || 0) + 1 }) });

    // AIの準備（失敗してもメールは残る。画面の「メール」から読み直せる）
    let result = null;
    if (process.env.ANTHROPIC_API_KEY) {
      try { result = await processMail(ADMIN, id, { id: box.owner_user }); } catch (e) { result = { error: String(e.message || e).slice(0, 200) }; }
    }
    return res.status(200).json({ email_id: id, ...(result || {}) });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e).slice(0, 300) });
  }
};
