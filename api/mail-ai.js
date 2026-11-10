// マワリテ：取り込んだメールをAIが読み、仕事の依頼ならタスクを作って準備までする
// POST /api/mail-ai/  { email_id }   Authorization: Bearer <Supabaseのログイン>
const { sb, getUser, claude, propose, body, KINDS } = require('./_ai');

const CLASSIFY = {
  name: 'classify',
  description: 'メールを読み、業務上の対応が必要か、どの種類の依頼か、どの顧客・物件・業者の話かを判定する',
  input_schema: {
    type: 'object',
    properties: {
      needs_action: { type: 'boolean', description: '社員の対応が必要な業務メールなら true（広告・お知らせ・自動通知・お礼だけなどは false）' },
      kind: { type: 'string', enum: Object.keys(KINDS) },
      title: { type: 'string', description: 'タスクの件名（「物件名 作業 依頼の種類」のように短く）' },
      summary: { type: 'string', description: '何を頼まれているか（2文以内）' },
      customer_id: { type: 'string', description: '一覧にある顧客のid（わからなければ省く）' },
      property_id: { type: 'string', description: '一覧にある物件のid（わからなければ省く）' },
      vendor_id: { type: 'string', description: '差出人が協力業者なら、その業者のid' },
      due: { type: 'string', description: '期限がはっきり書かれていれば YYYY-MM-DD（推測しない）' },
      amount: { type: 'integer', description: '業者の見積金額などがはっきり書かれていれば税抜の円' },
      reason: { type: 'string', description: '判定の理由（1文）' },
    },
    required: ['needs_action', 'kind', 'title', 'summary', 'reason'],
  },
};
const SYSTEM = `あなたはビルメンテナンス会社の受信メールを仕分ける係です。メールと、会社の顧客・物件・協力業者の一覧を見て、classify の道具で答えます。
- 顧客・物件・業者は一覧にあるものだけを id で答える。メールアドレス・会社名・物件名・住所で照らし合わせる。自信がなければ省く。
- 期限や金額は、メールにはっきり書いてあるときだけ。推測で埋めない。
- 今日の日付：${new Date().toISOString().slice(0, 10)}`;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AIはまだ準備中です（APIキー未設定）' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'ログインしてください' });
  let eid = '';
  try {
    const b = body(req);
    eid = String(b.email_id || '');
    if (!/^[0-9a-f-]{36}$/.test(eid)) return res.status(400).json({ error: 'email_id が必要です' });
    const me = await getUser(token);
    if (!me?.id) return res.status(401).json({ error: 'ログインが切れました' });
    const [m] = await sb(`emails?id=eq.${eid}&select=*`, token);
    if (!m) return res.status(404).json({ error: 'メールが見つかりません' });
    if (m.task_id) return res.status(200).json({ task_id: m.task_id, already: true });
    await sb(`emails?id=eq.${eid}`, token, { method: 'PATCH', body: JSON.stringify({ status: 'processing' }) });

    const cid = m.company_id;
    const [customers, properties, vendors] = await Promise.all([
      sb(`customers?company_id=eq.${cid}&select=id,name,contact_person,email&limit=500`, token),
      sb(`properties?company_id=eq.${cid}&select=id,name,address,customer_id&limit=1000`, token),
      sb(`vendors?company_id=eq.${cid}&select=id,name,email,skills&limit=300`, token),
    ]);
    const content = [
      `# メール\n差出人：${m.from_name} <${m.from_addr}>\n宛先：${m.to_addrs}\n件名：${m.subject}\n受信：${m.received_at}\n添付：${(m.attachments || []).map((a) => a.name).join('、') || 'なし'}\n本文：\n${String(m.body).slice(0, 8000)}`,
      `# 顧客\n${customers.map((c) => `- id:${c.id} ${c.name}（担当：${c.contact_person || '-'}、メール：${c.email || '-'}）`).join('\n') || '（なし）'}`,
      `# 物件\n${properties.map((p) => `- id:${p.id} ${p.name}（${p.address || '-'}、顧客id:${p.customer_id || '-'}）`).join('\n') || '（なし）'}`,
      `# 協力業者\n${vendors.map((v) => `- id:${v.id} ${v.name}（メール：${v.email || '-'}）`).join('\n') || '（なし）'}`,
    ].join('\n\n');
    const { out, usage } = await claude(SYSTEM, CLASSIFY, content, 1500);
    out.usage = usage; // 運営画面の利用量（AIの費用）に使う

    // 一覧にないIDは捨てる。差出人のメールアドレスが登録と一致すれば、それを優先
    const from = String(m.from_addr || '').toLowerCase();
    const byMail = customers.find((c) => c.email && c.email.toLowerCase() === from);
    if (byMail) out.customer_id = byMail.id;
    if (!customers.some((c) => c.id === out.customer_id)) delete out.customer_id;
    if (!properties.some((p) => p.id === out.property_id)) delete out.property_id;
    const vByMail = vendors.find((v) => v.email && v.email.toLowerCase() === from);
    if (vByMail) out.vendor_id = vByMail.id;
    if (!vendors.some((v) => v.id === out.vendor_id)) delete out.vendor_id;
    if (out.property_id && !out.customer_id) out.customer_id = properties.find((p) => p.id === out.property_id)?.customer_id || undefined;
    if (out.due && !/^\d{4}-\d{2}-\d{2}$/.test(out.due)) delete out.due;
    if (!KINDS[out.kind]) out.kind = 'other';

    if (b.force) out.needs_action = true; // 社員が「タスクにする」を押したとき
    if (!out.needs_action) {
      await sb(`emails?id=eq.${eid}`, token, { method: 'PATCH', body: JSON.stringify({ status: 'ignored', ai: out }) });
      return res.status(200).json({ ignored: true, ai: out });
    }
    const [t] = await sb('tasks', token, {
      method: 'POST',
      body: JSON.stringify({
        company_id: cid, title: out.title || m.subject || '（件名なし）', body: out.summary || '', source: 'mail', kind: out.kind,
        assignee: m.owner_user || me.id, created_by: me.id, customer_id: out.customer_id || null, property_id: out.property_id || null,
        due: out.due || null, amount: out.amount ?? null, email_id: eid,
      }),
    });
    await sb(`emails?id=eq.${eid}`, token, { method: 'PATCH', body: JSON.stringify({ status: 'task', ai: out, task_id: t.id }) });
    let prep = null;
    try {
      prep = await propose(token, t.id, '', me);
    } catch (_) { /* 準備に失敗してもタスクは残す。画面から作り直せる */ }
    return res.status(200).json({ task_id: t.id, ai: out, prepared: !!prep });
  } catch (e) {
    if (eid) try { await sb(`emails?id=eq.${eid}`, token, { method: 'PATCH', body: JSON.stringify({ status: 'error' }) }); } catch (_) {}
    return res.status([401, 404, 502].includes(e.code) ? e.code : 500).json({ error: String(e.message || e).slice(0, 300) });
  }
};
