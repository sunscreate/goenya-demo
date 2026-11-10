// マワリテ：AIの共通部分（_ で始まるファイルは Vercel の窓口にならない）
const SB_URL = process.env.SUPABASE_URL || 'https://enwpymkodwogyfegbfsq.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'sb_publishable_W75onFPkz8MyA4kT1ehrgg_-IG2guYN';
const MODEL = () => process.env.AI_MODEL || 'claude-sonnet-5-5';

async function sb(path, token, init = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw Object.assign(new Error(t || `supabase ${r.status}`), { code: r.status });
  return t ? JSON.parse(t) : null;
}

async function getUser(token) {
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } });
  return r.ok ? r.json() : null;
}

/** Claude に道具（決まった形）で答えさせる */
async function claude(system, tool, content, maxTokens = 4000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL(), max_tokens: maxTokens, system, tools: [tool], tool_choice: { type: 'auto' }, messages: [{ role: 'user', content }] }),
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error('AIがうまく動きませんでした：' + (j.error?.message || r.status)), { code: 502 });
  let out = (j.content || []).find((c) => c.type === 'tool_use' && c.name === tool.name)?.input;
  if (!out) {
    const m = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').match(/\{[\s\S]*\}/);
    if (m) try { out = JSON.parse(m[0]); } catch (_) {}
  }
  if (!out) throw Object.assign(new Error('AIの答えが読めませんでした'), { code: 502 });
  return { out, usage: j.usage, model: MODEL() };
}

// 依頼の種類ごとに、AIが先にやること（設計書 5-2）
const KINDS = {
  quote_request: '見積依頼',
  vendor_quote: '業者からの見積回答',
  order: '顧客からの発注',
  schedule: '日程の相談',
  report_billing: '完了報告・請求',
  inquiry: '問い合わせ・その他の依頼',
  other: 'その他',
  contract_work: '定期契約の作業',
};
const PLAYBOOK = {
  quote_request: '顧客・物件を特定し、対応できる業者（skills）を候補にして、業者への見積依頼の下書きと、顧客への「承りました」の返信の下書きを作る。',
  vendor_quote: '業者の見積金額（税抜）を読み取り、会社のマージン率を上乗せした顧客向け金額を計算して示す（計算式も書く）。顧客向け見積の文面の下書きを作り、承認が必要なら approval_amount に顧客向け金額を入れる。',
  order: '発注が確定したことを整理し、業者への正式な発注連絡の下書きと、顧客への受注のお礼の下書きを作る。',
  schedule: '顧客・業者の希望と物件の条件を整理し、候補日をまとめ、返信の下書きを作る。',
  report_billing: '報告書・請求の内容を要約し、確認すべき点（金額・作業内容の食い違い）を挙げ、受領の返信の下書きを作る。',
  inquiry: '要点をまとめ、返信の下書きを作る。必要なら社内のだれに任せるかを提案する。',
  other: '要点をまとめ、必要なら返信の下書きを作る。',
  contract_work: '定期契約の作業月になった。「この物件の過去の発注」を見て、特に理由がなければ前回と同じ業者を候補にし、業者への作業依頼（日程の候補を聞く）の下書きと、顧客への作業日のご案内の下書きを作る。金額は契約の金額・前回の発注の金額を示す（新しく作らない）。',
};

const PROPOSE = {
  name: 'propose',
  description: 'タスクについて、担当社員が決めるだけで済むように準備した内容を返す',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: '状況の要約（2〜3文）' },
      next_steps: { type: 'array', items: { type: 'string' }, description: '担当社員が次に決めること・やること（短く、順番に、最大5つ）' },
      drafts: {
        type: 'array', description: '作っておいた下書き（メール・電話で話すこと・メモ）。送信はしない',
        items: {
          type: 'object',
          properties: { kind: { type: 'string', enum: ['email', 'call', 'memo'] }, to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } },
          required: ['kind', 'body'],
        },
      },
      vendor_ids: { type: 'array', items: { type: 'string' }, description: '依頼先の候補にした協力業者のID（一覧にある業者だけ）' },
      delegate_to: { type: 'string', description: '今の担当者以外で任せるとよい社員のuser_id（一覧にある人だけ。不要なら空）' },
      approval_amount: { type: 'integer', description: '承認が必要な金額がわかる場合の金額（税抜・円）。わからなければ省く' },
      questions: { type: 'array', items: { type: 'string' }, description: '情報が足りず、社員に確認したいこと（勝手に埋めない）' },
    },
    required: ['summary', 'next_steps', 'drafts'],
  },
};

const SYSTEM = `あなたはビルメンテナンス会社の社員につく「AI秘書」です。社員が決めるだけで済むように、できる準備をすべてしておきます。
守ること：
- 送信・発注・約束は絶対にしない。作るのは下書きだけ。最後は社員が決める。
- 渡された情報（タスク・元のメール・顧客・物件・業者・記録・会社の設定）だけを使う。金額・日付・名前を作らない。足りないことは questions に書く。
- 業者に依頼するときは、対応できる作業（skills）が合う業者を一覧から選び、vendor_ids に入れる。
- メールは日本のビジネスメールの書き方で、簡潔に。冒頭の名乗りは「# 送る人」の会社名と氏名を使う。宛名がわからなければ「〇〇様」と空けておく。
- メールの最後の署名（会社名・住所・電話などの線で囲んだ部分）は書かない。システムが会社の署名を自動で付ける。本文は「よろしくお願いいたします。」までにする。
- 社員から指示があれば、それを最優先で反映する。それまでの記録（すでにやったこと・承認の結果）を踏まえて、次に必要なことだけを出す。
- 必ず propose の道具で答える。`;

/** タスクの準備（task-ai と mail-ai の両方から使う） */
async function propose(token, tid, instruction, me) {
  const [t] = await sb(`tasks?id=eq.${tid}&select=*,customers(name,contact_person,phone,email),properties(name,address,autolock,building_info),emails!tasks_email_id_fkey(from_name,from_addr,subject,received_at,body,attachments)`, token);
  if (!t) throw Object.assign(new Error('タスクが見つかりません'), { code: 404 });
  const [events, members, vendors, [co], past] = await Promise.all([
    sb(`task_events?task_id=eq.${tid}&order=id&limit=60&select=at,actor,actor_kind,type,body`, token),
    sb(`memberships?company_id=eq.${t.company_id}&role=neq.vendor&select=user_id,display_name,email,role`, token),
    sb(`vendors?company_id=eq.${t.company_id}&select=id,name,skills,email,phone&limit=200`, token),
    sb(`companies?id=eq.${t.company_id}&select=name,settings`, token),
    t.property_id ? sb(`orders?property_id=eq.${t.property_id}&status=neq.draft&order=created_at.desc&limit=5&select=work,amount,start_at,status,vendor_id`, token) : Promise.resolve([]),
  ]);
  // 社内データの目録から、物件名・顧客名で関係しそうなファイル（名前・場所・日付だけ）と、社員が読ませた過去のファイルの中身
  const kws = [t.properties?.name, t.customers?.name].flatMap((x) => String(x || '').replace(/（.*?）|\(.*?\)/g, ' ').split(/[\s　・、,]+/)).map((w) => w.replace(/[%*,()."]/g, '')).filter((w) => w.length >= 2).slice(0, 6);
  const [files, read] = await Promise.all([
    kws.length ? sb(`file_index?company_id=eq.${t.company_id}&or=(${encodeURIComponent(kws.flatMap((w) => [`name.ilike.*${w}*`, `path.ilike.*${w}*`]).join(','))})&order=modified_at.desc.nullslast&limit=15&select=source,path,modified_at`, token).catch(() => []) : Promise.resolve([]),
    sb(`task_events?task_id=eq.${tid}&type=eq.past_file&order=id.desc&limit=5&select=body,data`, token),
  ]);
  let budget = 16000;
  const readText = read.filter((r) => r.data?.text).map((r) => { const x = String(r.data.text).slice(0, Math.max(0, budget)); budget -= x.length; return `## ${r.body}（更新 ${String(r.data.modified_at || '').slice(0, 10)}）\n${x}`; }).filter((x) => budget > -1000);
  const who = (id) => members.find((m) => m.user_id === id)?.display_name || '（社員）';
  const margin = Number(co?.settings?.margin_rate ?? 20);
  const e = t.emails;
  const content = [
    `# 会社\n${co?.name}（顧客向け見積のマージン率：${margin}%、承認の境目：${co?.settings?.approval?.approver_from ?? 100000}円以上は承認者、${co?.settings?.approval?.admin_from ?? 500000}円以上は管理者）`,
    `# 送る人（メールの名乗り）\n会社名：${co?.settings?.profile?.name || co?.name}、氏名：${members.find((m) => m.user_id === me.id)?.display_name || '（担当者）'}`,
    co?.settings?.ai_notes ? `# この会社の決まり（必ず守る）\n${co.settings.ai_notes}` : '',
    `# タスク\n件名：${t.title}\n依頼の種類：${KINDS[t.kind] || '（未分類）'}\n内容：${t.body || '（なし）'}\n発生元：${t.source}\n状態：${t.status}\n担当：${who(t.assignee)}\n期限：${t.due || '（なし）'}${t.amount ? `\n金額：${t.amount}円（税抜）` : ''}`,
    t.kind && PLAYBOOK[t.kind] ? `# この種類で先にやること\n${PLAYBOOK[t.kind]}` : '',
    e ? `# 元のメール\n差出人：${e.from_name} <${e.from_addr}>\n件名：${e.subject}\n受信：${e.received_at}\n添付：${(e.attachments || []).map((a) => a.name).join('、') || 'なし'}\n本文：\n${String(e.body || '').slice(0, 8000)}` : '',
    t.customers ? `# 顧客\n${t.customers.name}（担当者：${t.customers.contact_person || '不明'}、電話：${t.customers.phone || '不明'}、メール：${t.customers.email || '不明'}）` : '# 顧客\n（未設定）',
    t.properties ? `# 物件\n${t.properties.name}（住所：${t.properties.address || '不明'}、オートロック：${t.properties.autolock ? 'あり' : 'なし'}）\n建物の情報：${t.properties.building_info || 'なし'}` : '# 物件\n（未設定）',
    files.length ? `# 社内データの目録にある、関係しそうな過去のファイル（名前・場所だけ。中身はまだ読んでいない）\n${files.map((f) => `- ${String(f.modified_at || '').slice(0, 10)} ${f.source}/${f.path}`).join('\n')}\n（前回の見積書・報告書・請求書が必要なら、どのファイルを読めばよいかを next_steps に書く）` : '',
    readText.length ? `# 社員が読ませた過去のファイルの中身（前回の金額・作業内容の参考にする。今回の金額として勝手に確定しない）\n${readText.join('\n\n')}` : '',
    past.length ? `# この物件の過去の発注（新しい順）\n${past.map((o) => `- ${o.start_at ? o.start_at.slice(0, 10) : '日程未定'} ${o.work}：${vendors.find((v) => v.id === o.vendor_id)?.name || '業者不明'}（業者id: ${o.vendor_id}）${o.amount}円（税抜）`).join('\n')}` : '',
    `# これまでの記録（古い順）\n${events.map((x) => `- ${x.at.slice(0, 16).replace('T', ' ')} ${x.actor_kind === 'ai' ? 'AI' : who(x.actor)}：${x.type}${x.body ? '「' + x.body.slice(0, 300) + '」' : ''}`).join('\n')}`,
    `# 社内の人\n${members.map((m) => `- ${m.display_name || m.email}（user_id: ${m.user_id}、${m.role}${m.user_id === t.assignee ? '、今の担当' : ''}）`).join('\n')}`,
    `# 協力業者\n${vendors.length ? vendors.map((v) => `- ${v.name}（id: ${v.id}、対応：${(v.skills || []).join('・') || '未登録'}、メール：${v.email || 'なし'}、電話：${v.phone || 'なし'}）`).join('\n') : '（登録なし）'}`,
    instruction ? `# 社員からの指示（最優先）\n${instruction}` : '# 社員からの指示\n（なし。今の状況で準備できることをしてください）',
  ].filter(Boolean).join('\n\n');

  const { out, usage, model } = await claude(SYSTEM, PROPOSE, content);
  // 一覧にない業者・社員、今の担当者本人は消す（AIの作り話や意味のない提案を通さない）
  out.vendor_ids = (out.vendor_ids || []).filter((id) => vendors.some((v) => v.id === id));
  if (out.delegate_to && (out.delegate_to === t.assignee || !members.some((m) => m.user_id === out.delegate_to))) delete out.delegate_to;
  out.at = new Date().toISOString();
  if (instruction) out.instruction = instruction;
  await sb(`tasks?id=eq.${tid}`, token, { method: 'PATCH', body: JSON.stringify({ ai: out, updated_at: out.at }) });
  await sb('task_events', token, {
    method: 'POST',
    body: JSON.stringify({ company_id: t.company_id, task_id: tid, actor: me.id, actor_kind: 'ai', type: 'ai', body: out.summary, data: { usage, model } }),
  });
  return out;
}

function body(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
}

module.exports = { sb, getUser, claude, propose, body, KINDS };
