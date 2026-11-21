// 畝ごよみ（畑の計画アプリ）のサーバー側
// POST /api/hatake  ヘッダー x-farm-key: 畑の合言葉
//   {action:"ask",  prompt, image?: dataURL(jpeg)}  写真の相談（Claude）
//   {action:"plan", prompt}                          計画の見直し（Claude, JSONで返す）
//   {action:"place", address}                        住所 → 緯度経度・標高・気候（年平均気温・霜の時期）
//   {action:"weather", lat, lon}                     7日間の天気
// 環境変数：ANTHROPIC_API_KEY（その場レポと共用）、AI_MODEL（省略時 claude-sonnet-5-5）
// データの保存は、ブラウザから Supabase の関数（hatake_pull / hatake_push）を直接呼ぶ。

const SB = 'https://pkgqeircrgzsqtmiyywv.supabase.co/rest/v1/rpc/';
const SB_KEY = 'sb_publishable_No3R3AVVRPybIdQL6TtQpw_OdCEJLLw'; // 公開してよいキー（中身は合言葉で守る）
const MODEL = () => process.env.AI_MODEL || 'claude-sonnet-5-5';

async function keyOK(k) {
  if (!k || k.length < 16) return false;
  try {
    const r = await fetch(SB + 'hatake_check', { method: 'POST', headers: { apikey: SB_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ k }) });
    return r.ok && (await r.json()) === true;
  } catch (e) { return false; }
}

async function claude(content, { max = 2000, system } = {}) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL(), max_tokens: max, system, messages: [{ role: 'user', content }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j?.error?.message || 'claude ' + r.status); e.status = r.status; throw e; }
  return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
}

const SYS = 'あなたは家庭菜園、とくに菌ちゃん農法（吉田俊道さんの方法：高畝に草・落ち葉・枝などの有機物を入れ、黒マルチで覆って糸状菌に分解させる。基本は肥料を入れない）に詳しい相談相手です。日本語で、やさしく具体的に答えます。';

async function place(address) {
  const g = await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(address)).then(r => r.json());
  if (!Array.isArray(g) || !g.length) return { error: 'not_found' };
  const [lon, lat] = g[0].geometry.coordinates;
  const label = g[0].properties?.title || address;
  const y = new Date().getUTCFullYear() - 1;
  const a = await fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${y - 2}-01-01&end_date=${y}-12-31&daily=temperature_2m_mean,temperature_2m_min&timezone=Asia%2FTokyo`).then(r => r.json());
  const d = a.daily || {};
  const mean = d.temperature_2m_mean || [], mins = d.temperature_2m_min || [], days = d.time || [];
  const valid = mean.filter(v => v != null);
  const annual = valid.reduce((s, v) => s + v, 0) / (valid.length || 1);
  // 霜の目安：最低気温2℃以下（地面は霜が降りやすい）の、春の最後の日・秋の最初の日（3年の平均）
  const last = [], first = [];
  for (let yy = y - 2; yy <= y; yy++) {
    let l = null, f = null;
    days.forEach((t, i) => {
      if (!t.startsWith(String(yy)) || mins[i] == null) return;
      const m = t.slice(5);
      if (mins[i] <= 2 && m < '07-01') l = m;
      if (mins[i] <= 2 && m >= '08-01' && !f) f = m;
    });
    if (l) last.push(l); if (f) first.push(f);
  }
  const avgMD = arr => { if (!arr.length) return null; const n = arr.map(m => { const [mm, dd] = m.split('-').map(Number); return Date.UTC(2001, mm - 1, dd); }); const v = new Date(n.reduce((s, x) => s + x, 0) / n.length); return `${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`; };
  const el = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`).then(r => r.json()).catch(() => ({}));
  return { label, lat, lon, elev: el.elevation ? Math.round(el.elevation[0]) : null, annual: Math.round(annual * 10) / 10, lastFrost: avgMD(last), firstFrost: avgMD(first) };
}

async function weather(lat, lon) {
  const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=Asia%2FTokyo&forecast_days=7`).then(r => r.json());
  const d = w.daily || {};
  return { days: (d.time || []).map((t, i) => ({ d: t, code: d.weather_code[i], hi: d.temperature_2m_max[i], lo: d.temperature_2m_min[i], rain: d.precipitation_sum[i], wind: d.wind_speed_10m_max[i] })) };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (!(await keyOK(req.headers['x-farm-key']))) return res.status(401).json({ error: 'bad_key' });
  try {
    if (b.action === 'place') return res.json(await place(String(b.address || '').slice(0, 100)));
    if (b.action === 'weather') return res.json(await weather(+b.lat, +b.lon));
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'no_api_key' });
    const prompt = String(b.prompt || '').slice(0, 60000);
    if (b.action === 'ask') {
      const content = [];
      const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(b.image || '');
      if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
      content.push({ type: 'text', text: prompt });
      return res.json({ text: await claude(content, { max: 1500, system: SYS }) });
    }
    if (b.action === 'plan') {
      const t = await claude([{ type: 'text', text: prompt }], { max: 12000, system: SYS + ' 返事は指定されたJSONだけを返し、前後に文章やコードブロックを付けません。' });
      const s = t.indexOf('{'), e = t.lastIndexOf('}');
      try { return res.json(JSON.parse(t.slice(s, e + 1))); } catch (er) { return res.status(502).json({ error: 'bad_json' }); }
    }
    return res.status(400).json({ error: 'action' });
  } catch (e) {
    return res.status(e.status === 429 ? 429 : 500).json({ error: e.status === 429 ? 'rate_limited' : 'failed', message: String(e.message || e).slice(0, 200) });
  }
};
