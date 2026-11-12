// マワリテ：完了報告のAI確認と、発注カードの項目の下書き
//   POST ?op=check { report_id }  → 報告書（写真・PDF）とひとことをAIが確かめ、問題と対処の提案・客先へのメール下書きを担当者のタスクに出す
//                                   （業者が報告した直後に業者の画面から、または社内の人が「AIでもう一度確認」から）
//   POST ?op=fill  { order_id }   → 発注カードの項目（オーナー・管理会社・作業の種別・作業担当・社名・依頼担当と連絡先）をAIが下書き（空の欄だけ）
// 環境変数：SUPABASE_SERVICE_KEY、ANTHROPIC_API_KEY
const { sb, getUser, claude, body, ADMIN } = require('./_ai');

const SB_URL = process.env.SUPABASE_URL || 'https://enwpymkodwogyfegbfsq.supabase.co';
const fail = (code, message) => Object.assign(new Error(message), { code });
const IMG = /\.(jpe?g|png|webp|gif)$/i;
const PDF = /\.pdf$/i;
const typeOf = (n) => (PDF.test(n) ? 'application/pdf' : /\.png$/i.test(n) ? 'image/png' : /\.webp$/i.test(n) ? 'image/webp' : /\.gif$/i.test(n) ? 'image/gif' : 'image/jpeg');

async function me(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const u = token ? await getUser(token) : null;
  if (!u?.id) throw fail(401, 'ログインしてください');
  return { token, user: u };
}

/** 報告のファイルを読み込む（画像は6枚・PDFは2つまで、大きすぎるものは名前だけ） */
async function loadFiles(files) {
  const blocks = [], names = [];
  let img = 0, pdf = 0;
  for (const f of files || []) {
    names.push(f.name);
    const isImg = IMG.test(f.name), isPdf = PDF.test(f.name);
    if ((!isImg && !isPdf) || (isImg && img >= 6) || (isPdf && pdf >= 2) || (f.size && f.size > (isPdf ? 8e6 : 3.5e6))) continue;
    const r = await fetch(`${SB_URL}/storage/v1/object/reports/${f.path.split('/').map(encodeURIComponent).join('/')}`, { headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` } });
    if (!r.ok) continue;
    const data = Buffer.from(await r.arrayBuffer()).toString('base64');
    blocks.push(isPdf ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data }, title: f.name } : { type: 'image', source: { type: 'base64', media_type: typeOf(f.name), data } });
    if (isPdf) pdf++; else img++;
  }
  return { blocks, names };
}

const CHECK_TOOL = {
  name: 'report_check',
  description: '協力業者の完了報告を確かめた結果',
  input_schema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['ok', 'check', 'needs_fix'], description: 'ok＝問題なし、check＝人が確かめたほうがよい点がある、needs_fix＝報告に不備があり再報告が必要' },
      summary: { type: 'string', description: '報告の要約と判断（2〜4文）' },
      problems: { type: 'array', items: { type: 'object', properties: { level: { type: 'string', enum: ['不備', '注意', '確認'] }, point: { type: 'string' }, suggestion: { type: 'string', description: 'どう対処するかの提案' } }, required: ['level', 'point', 'suggestion'] } },
      next_steps: { type: 'array', items: { type: 'string' }, description: '担当者が次にすること（順番に）' },
      return_note: { type: 'string', description: '不備がある場合、業者さんに再報告を頼む文（丁寧に、何をどう直すか）。なければ空' },
      customer_mail: { type: 'object', properties: { subject: { type: 'string' }, body: { type: 'string' } }, required: ['subject', 'body'], description: '客先へ報告書を送るメールの下書き（宛名から署名の前まで）。問題がある場合も、確認後に送れる形で' },
    },
    required: ['verdict', 'summary', 'problems', 'next_steps', 'customer_mail'],
  },
};

const ops = {
  async check(req, res) {
    const { token } = await me(req);
    const rid = Number(body(req).report_id);
    // 本人の権限で見えるか（その発注の業者か、会社の社員）
    const [vis] = await sb(`order_reports?id=eq.${rid}&select=id`, token);
    if (!vis) throw fail(404, '報告が見つかりません');
    if (!process.env.ANTHROPIC_API_KEY) throw fail(503, 'AIの設定がまだです');
    const [r] = await sb(`order_reports?id=eq.${rid}&select=*`, ADMIN);
    const [o] = await sb(`orders?id=eq.${r.order_id}&select=*,vendors(name),customers(name,contact_person,email),companies(name)`, ADMIN);
    const past = await sb(`order_reports?order_id=eq.${r.order_id}&round=lt.${r.round}&select=round,note,status,review_note&order=round`, ADMIN);
    const all = o.report_files || [];
    const { blocks, names } = await loadFiles(all);
    const text = [
      `依頼元（自社）：${o.companies?.name || ''}`,
      `客先：${o.customers?.name || ''}${o.customers?.contact_person ? `（${o.customers.contact_person} 様）` : ''}`,
      `物件：${o.property_name}（${o.property_address}）`, `オーナー：${o.owner_name || '不明'}／管理会社：${o.mgmt_company || '不明'}`,
      `作業：${o.work}${o.work_type ? `（種別：${o.work_type}）` : ''}`, `協力業者：${o.vendors?.name || ''}${o.worker_name ? `（作業担当：${o.worker_name}）` : ''}`,
      `作業日：${o.start_at ? new Date(o.start_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '不明'}`,
      `業者へのひとこと（依頼時）：${o.note_for_vendor || 'なし'}`,
      `今回は第${r.round}回の報告。業者のひとこと：${r.note || 'なし'}`,
      past.length ? `これまでの報告：${past.map((p) => `第${p.round}回（${p.status === 'returned' ? `差し戻し：${p.review_note}` : p.status}）${p.note}`).join(' / ')}` : '',
      `添付ファイル（全部）：${names.join('、') || 'なし'}（中身を見られたのは画像${blocks.filter((b) => b.type === 'image').length}枚・PDF${blocks.filter((b) => b.type === 'document').length}件）`,
    ].filter(Boolean).join('\n');
    const system = 'あなたはビルメンテナンス会社の品質担当です。協力業者から届いた完了報告（報告書・写真・ひとこと）を確かめ、客先に出してよいかを判断します。'
      + '見るべき点：依頼した作業と報告の内容が合っているか、物件名・日付・作業内容の記載漏れや食い違い、作業前後の写真がそろっているか、点検値・水質などの異常や基準外、設備の不具合や追加工事が必要そうな所見、資格者名・押印など書類としての不備。'
      + '問題があれば、担当者がどう対処すればよいか（業者への再報告依頼、客先への説明、追加の見積など）を具体的に提案してください。ファイルを読めなかった場合は推測せず「確認できなかった」と書いてください。日本語で、やさしく短く。';
    const { out, usage } = await claude(system, CHECK_TOOL, [...blocks, { type: 'text', text }], 3000);
    const ai = { ...out, at: new Date().toISOString(), round: r.round, read: { images: blocks.filter((b) => b.type === 'image').length, pdfs: blocks.filter((b) => b.type === 'document').length, files: names.length } };
    await sb(`order_reports?id=eq.${rid}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ ai }) });
    if (r.task_id) {
      const label = { ok: '問題は見つかりませんでした', check: '確かめたほうがよい点があります', needs_fix: '報告に不備がありそうです' }[out.verdict] || '';
      const qs = (out.problems || []).map((p) => `【${p.level}】${p.point} → ${p.suggestion}`);
      const drafts = [{ kind: 'email', to: o.customers?.email || '', subject: out.customer_mail.subject, body: out.customer_mail.body }];
      if (out.return_note) drafts.push({ kind: 'vendor_return', to: o.vendors?.name || '', subject: '再報告のお願い', body: out.return_note });
      await sb(`tasks?id=eq.${r.task_id}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ ai: { summary: `【AIの確認：${label}】${out.summary}`, next_steps: out.next_steps, questions: qs, drafts, at: ai.at, report_id: rid, verdict: out.verdict }, updated_at: new Date().toISOString() }) });
      await sb('task_events', ADMIN, { method: 'POST', body: JSON.stringify({ company_id: r.company_id, task_id: r.task_id, actor_kind: 'ai', type: 'ai', body: `報告書を確認しました：${label}`, data: { report_id: rid, verdict: out.verdict, usage } }) });
    }
    return res.status(200).json({ ai });
  },

  async fill(req, res) {
    const { token, user } = await me(req);
    const oid = String(body(req).order_id || '');
    const [o] = await sb(`orders?id=eq.${encodeURIComponent(oid)}&select=*`, token); // 本人の権限で見える発注か
    if (!o) throw fail(404, '発注が見つかりません');
    const [m] = await sb(`memberships?company_id=eq.${o.company_id}&user_id=eq.${user.id}&select=role`, token);
    if (!m || m.role === 'vendor') throw fail(403, '社内の人だけが使えます');
    const [v] = await sb(`vendors?id=eq.${o.vendor_id}&select=name,contact_person,phone,email`, ADMIN);
    const [c] = o.customer_id ? await sb(`customers?id=eq.${o.customer_id}&select=name,contact_person,phone,email,note`, ADMIN) : [null];
    const [p] = o.property_id ? await sb(`properties?id=eq.${o.property_id}&select=name,address,building_info,note`, ADMIN) : [null];
    const [t] = o.task_id ? await sb(`tasks?id=eq.${o.task_id}&select=title,body,email_id`, ADMIN) : [null];
    const [mail] = t?.email_id ? await sb(`emails?id=eq.${t.email_id}&select=subject,from_name,body`, ADMIN) : [null];
    const reqId = o.created_by || user.id;
    const [rq] = await sb(`memberships?company_id=eq.${o.company_id}&user_id=eq.${reqId}&select=display_name,email`, ADMIN);
    const [co] = await sb(`companies?id=eq.${o.company_id}&select=name,settings`, ADMIN);
    const coPhone = co?.settings?.profile?.tel || '';
    // 決まっているもの（AIに頼らない）
    const fixed = {
      vendor_company: v?.name || '',
      worker_name: v?.contact_person || '',
      requester_name: rq?.display_name || rq?.email || '',
      requester_contact: [coPhone, rq?.email].filter(Boolean).join(' ／ '),
    };
    let guess = { owner_name: '', mgmt_company: '', work_type: '' };
    if (process.env.ANTHROPIC_API_KEY) {
      const tool = { name: 'order_info', description: '発注カードの項目', input_schema: { type: 'object', properties: {
        owner_name: { type: 'string', description: '物件のオーナー名（わからなければ空）' },
        mgmt_company: { type: 'string', description: '物件の管理会社名（客先が管理会社ならその名前。わからなければ空）' },
        work_type: { type: 'string', description: '作業の種別（例：貯水槽清掃、排水管高圧洗浄、増圧ポンプ点検、消防設備点検、空調機清掃、その他）' },
      }, required: ['owner_name', 'mgmt_company', 'work_type'] } };
      const text = [`作業：${o.work}`, c && `客先：${c.name}（担当 ${c.contact_person}）${c.note ? ` メモ：${c.note}` : ''}`, p && `物件：${p.name}（${p.address}）${p.building_info ? ` 建物：${p.building_info}` : ''}${p.note ? ` メモ：${p.note}` : ''}`,
        t && `もとのタスク：${t.title}\n${(t.body || '').slice(0, 1500)}`, mail && `もとのメール：${mail.subject}（${mail.from_name}）\n${(mail.body || '').slice(0, 3000)}`].filter(Boolean).join('\n\n');
      try {
        const { out } = await claude('ビルメンテナンスの発注情報から、物件のオーナー名・管理会社名・作業の種別を読み取ります。書かれていないことは推測せず空にしてください。', tool, [{ type: 'text', text }], 600);
        guess = { owner_name: out.owner_name || '', mgmt_company: out.mgmt_company || '', work_type: out.work_type || '' };
      } catch (_) { /* AIが使えなくても、決まっている項目は入れる */ }
    }
    // 空の欄だけ埋める（人が直したものは上書きしない）
    const patch = {};
    for (const [k, val] of Object.entries({ ...guess, ...fixed })) if (!o[k] && val) patch[k] = val;
    patch.info_ai_at = new Date().toISOString();
    await sb(`orders?id=eq.${o.id}`, token, { method: 'PATCH', body: JSON.stringify(patch) });
    return res.status(200).json({ patch });
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
    return res.status([401, 403, 404, 409, 502, 503].includes(e.code) ? e.code : 500).json({ error: String(e.message || e).slice(0, 300) });
  }
};
