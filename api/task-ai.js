// マワリテ：タスクに対してAIが「できる準備」をする（下書き・次にやること）。送信や発注はしない。
// POST /api/task-ai  { task_id, instruction? }   Authorization: Bearer <Supabaseのログイン>
// 環境変数：ANTHROPIC_API_KEY（必須）、AI_MODEL（省略時 claude-sonnet-5-5）
// データはログインした人の権限（RLS）で読むので、見られないタスクにはAIも触れない。

const SB_URL = process.env.SUPABASE_URL || 'https://enwpymkodwogyfegbfsq.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'sb_publishable_W75onFPkz8MyA4kT1ehrgg_-IG2guYN';
const MODEL = () => process.env.AI_MODEL || 'claude-sonnet-5-5';

const TOOL = {
  name: 'propose',
  description: 'タスクについて、担当社員が決めるだけで済むように準備した内容を返す',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: '状況の要約（2〜3文）' },
      next_steps: { type: 'array', items: { type: 'string' }, description: '担当社員が次に決めること・やること（短く、順番に、最大5つ）' },
      drafts: {
        type: 'array',
        description: '作っておいた下書き（メール・電話で話すこと・メモ）。送信はしない',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['email', 'call', 'memo'] },
            to: { type: 'string', description: '宛先（会社名・担当者名。わかる範囲で）' },
            subject: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['kind', 'body'],
        },
      },
      vendor_ids: { type: 'array', items: { type: 'string' }, description: '依頼先の候補にした協力業者のID（一覧にある業者だけ）' },
      delegate_to: { type: 'string', description: '任せるとよい社員のuser_id（一覧にある人だけ。不要なら空）' },
      approval_amount: { type: 'integer', description: '承認が必要な金額がわかる場合の金額（税抜・円）。わからなければ省く' },
      questions: { type: 'array', items: { type: 'string' }, description: '情報が足りず、社員に確認したいこと（勝手に埋めない）' },
    },
    required: ['summary', 'next_steps', 'drafts'],
  },
};

const SYSTEM = `あなたはビルメンテナンス会社の社員につく「AI秘書」です。社員が決めるだけで済むように、できる準備をすべてしておきます。
守ること：
- 送信・発注・約束は絶対にしない。作るのは下書きだけ。最後は社員が決める。
- 渡された情報（タスク・顧客・物件・業者・記録）だけを使う。金額・日付・名前を作らない。足りないことは questions に書く。
- 業者に依頼するときは、対応できる作業（skills）が合う業者を一覧から選び、vendor_ids に入れる。
- メールは日本のビジネスメールの書き方で、簡潔に。宛名・署名の名前がわからなければ「〇〇様」「（自社名）」のように空けておく。
- 社員から指示があれば、それを最優先で反映する。それまでの記録（すでにやったこと・承認の結果）を踏まえて、次に必要なことだけを出す。
- 必ず propose の道具で答える。`;

async function sb(path, token, init = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw Object.assign(new Error(t || `supabase ${r.status}`), { code: r.status });
  return t ? JSON.parse(t) : null;
}

function describe(t, events, members, vendors, instruction) {
  const who = (id) => members.find((m) => m.user_id === id)?.display_name || '（社員）';
  return [
    `# タスク\n件名：${t.title}\n内容：${t.body || '（なし）'}\n発生元：${t.source}\n状態：${t.status}\n担当：${who(t.assignee)}\n期限：${t.due || '（なし）'}${t.amount ? `\n金額：${t.amount}円（税抜）` : ''}`,
    t.customers ? `# 顧客\n${t.customers.name}（担当者：${t.customers.contact_person || '不明'}、電話：${t.customers.phone || '不明'}、メール：${t.customers.email || '不明'}）` : '# 顧客\n（未設定）',
    t.properties ? `# 物件\n${t.properties.name}（住所：${t.properties.address || '不明'}、オートロック：${t.properties.autolock ? 'あり' : 'なし'}）\n建物の情報：${t.properties.building_info || 'なし'}` : '# 物件\n（未設定）',
    `# これまでの記録（古い順）\n${events.map((e) => `- ${e.at.slice(0, 16).replace('T', ' ')} ${e.actor_kind === 'ai' ? 'AI' : who(e.actor)}：${e.type}${e.body ? '「' + e.body.slice(0, 300) + '」' : ''}`).join('\n')}`,
    `# 社内の人\n${members.map((m) => `- ${m.display_name || m.email}（user_id: ${m.user_id}、${m.role}）`).join('\n')}`,
    `# 協力業者\n${vendors.length ? vendors.map((v) => `- ${v.name}（id: ${v.id}、対応：${(v.skills || []).join('・') || '未登録'}、メール：${v.email || 'なし'}）`).join('\n') : '（登録なし）'}`,
    instruction ? `# 社員からの指示（最優先）\n${instruction}` : '# 社員からの指示\n（なし。今の状況で準備できることをしてください）',
  ].join('\n\n');
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AIはまだ準備中です（APIキー未設定）', ready: false });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'ログインしてください' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const tid = String(body.task_id || '');
    const instruction = String(body.instruction || '').slice(0, 2000);
    if (!/^[0-9a-f-]{36}$/.test(tid)) return res.status(400).json({ error: 'task_id が必要です' });

    const me = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null));
    if (!me?.id) return res.status(401).json({ error: 'ログインが切れました' });

    const [t] = await sb(`tasks?id=eq.${tid}&select=*,customers(name,contact_person,phone,email),properties(name,address,autolock,building_info)`, token);
    if (!t) return res.status(404).json({ error: 'タスクが見つかりません' });
    const [events, members, vendors] = await Promise.all([
      sb(`task_events?task_id=eq.${tid}&order=id&limit=60&select=at,actor,actor_kind,type,body`, token),
      sb(`memberships?company_id=eq.${t.company_id}&role=neq.vendor&select=user_id,display_name,email,role`, token),
      sb(`vendors?company_id=eq.${t.company_id}&select=id,name,skills,email&limit=200`, token),
    ]);

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL(), max_tokens: 4000, system: SYSTEM, tools: [TOOL], tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: describe(t, events, members, vendors, instruction) }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'AIがうまく動きませんでした：' + (j.error?.message || r.status) });
    let out = (j.content || []).find((c) => c.type === 'tool_use' && c.name === 'propose')?.input;
    if (!out) {
      const m = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').match(/\{[\s\S]*\}/);
      if (m) try { out = JSON.parse(m[0]); } catch (_) {}
    }
    if (!out) return res.status(502).json({ error: 'AIの答えが読めませんでした' });
    // 一覧にない業者・社員は消す（AIの作り話を通さない）
    out.vendor_ids = (out.vendor_ids || []).filter((id) => vendors.some((v) => v.id === id));
    if (out.delegate_to && !members.some((m) => m.user_id === out.delegate_to)) delete out.delegate_to;
    out.at = new Date().toISOString();
    out.instruction = instruction || undefined;

    await sb(`tasks?id=eq.${tid}`, token, { method: 'PATCH', body: JSON.stringify({ ai: out, updated_at: out.at }) });
    await sb('task_events', token, {
      method: 'POST',
      body: JSON.stringify({ company_id: t.company_id, task_id: tid, actor: me.id, actor_kind: 'ai', type: 'ai', body: out.summary, data: { usage: j.usage, model: MODEL() } }),
    });
    return res.status(200).json({ ai: out });
  } catch (e) {
    return res.status(e.code === 401 ? 401 : 500).json({ error: String(e.message || e).slice(0, 300) });
  }
};
