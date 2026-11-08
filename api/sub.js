// その場レポ 月額プラン（Stripe）
// POST /api/sub  { action: "status" | "checkout" | "portal" }
// Authorization: Bearer <Googleのアクセストークン>（アプリがGoogleとつないだときのもの）
//
// 必要な環境変数（Vercelの設定に入れる。ここには書かない）
//   STRIPE_SECRET_KEY : Stripeのシークレットキー（sk_test_… / sk_live_…）
//   OWNER_EMAILS      : 支払い不要にするメール（カンマ区切り。省略時は持ち主のみ）
//   APP_URL           : 戻り先（省略時 https://sonoba-repo.vercel.app）
// STRIPE_SECRET_KEY が無いあいだは、だれも止めない（準備中の扱い）

const PRICE_KEY = 'sonoba_monthly_300'; // Stripeの価格を探す名前
const PRICE_YEN = 300;
const TRIAL_DAYS = 14;
const ACTIVE = new Set(['trialing', 'active', 'past_due']); // past_due は引き落としの再試行中なので、しばらく使える

const owners = () =>
  (process.env.OWNER_EMAILS || 'sunscreate528@gmail.com').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const appUrl = () => (process.env.APP_URL || 'https://sonoba-repo.vercel.app').replace(/\/$/, '');

// Stripe API（フォーム形式）
function form(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join('&');
}
async function stripe(method, path, params) {
  const q = params ? form(params) : '';
  const url = `https://api.stripe.com/v1/${path}${method === 'GET' && q ? `?${q}` : ''}`;
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
    body: method === 'GET' ? undefined : q,
  });
  const j = await r.json();
  if (!r.ok) {
    const e = new Error(j.error?.message || `Stripe ${r.status}`);
    e.stripe = j.error;
    throw e;
  }
  return j;
}

// Googleのトークンから、だれかを確かめる（drive.file の権限でも読める Drive の about を使う）
async function whoIs(req) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!t) return null;
  const r = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) return null;
  const j = await r.json();
  return (j.user?.emailAddress || '').toLowerCase() || null;
}

async function customersOf(email) {
  const r = await stripe('GET', 'customers', { email, limit: 10 });
  return r.data;
}

async function subsOf(customers) {
  const all = [];
  for (const c of customers) {
    const r = await stripe('GET', 'subscriptions', { customer: c.id, status: 'all', limit: 20 });
    all.push(...r.data);
  }
  return all;
}

async function priceId() {
  const found = await stripe('GET', 'prices', { 'lookup_keys[]': PRICE_KEY, active: 'true', limit: 1 });
  if (found.data.length) return found.data[0].id;
  const product = await stripe('POST', 'products', { name: 'その場レポ 月額プラン', description: '報告書・PDF・お知らせの作成（14日間無料）' });
  const price = await stripe('POST', 'prices', {
    product: product.id, currency: 'jpy', unit_amount: PRICE_YEN, recurring: { interval: 'month' }, lookup_key: PRICE_KEY, nickname: '月額300円',
  });
  return price.id;
}

async function status(email) {
  if (owners().includes(email)) return { active: true, owner: true, ready: true };
  if (!process.env.STRIPE_SECRET_KEY) return { active: true, ready: false };
  const subs = await subsOf(await customersOf(email));
  const live = subs.filter((s) => ACTIVE.has(s.status)).sort((a, b) => b.created - a.created)[0];
  const latest = live || subs.sort((a, b) => b.created - a.created)[0];
  return {
    ready: true,
    active: Boolean(live),
    status: latest?.status || 'none',
    trialEnd: live?.trial_end || null,
    periodEnd: live?.current_period_end || null,
    cancelAtEnd: Boolean(live?.cancel_at_period_end),
    everSubscribed: subs.length > 0,
    hasCustomer: subs.length > 0,
  };
}

async function checkout(email) {
  if (!process.env.STRIPE_SECRET_KEY) return { error: 'まだ準備中です' };
  const customers = await customersOf(email);
  const subs = await subsOf(customers);
  if (subs.some((s) => ACTIVE.has(s.status))) return { error: 'すでにお申し込み済みです' };
  const customer = customers[0] || (await stripe('POST', 'customers', { email, metadata: { app: 'sonoba_repo' } }));
  const s = await stripe('POST', 'checkout/sessions', {
    mode: 'subscription',
    customer: customer.id,
    line_items: { 0: { price: await priceId(), quantity: 1 } },
    subscription_data: subs.length ? undefined : { trial_period_days: TRIAL_DAYS },
    payment_method_collection: 'always',
    locale: 'ja',
    success_url: `${appUrl()}/?sub=ok`,
    cancel_url: `${appUrl()}/?sub=cancel`,
  });
  return { url: s.url };
}

async function portal(email) {
  if (!process.env.STRIPE_SECRET_KEY) return { error: 'まだ準備中です' };
  const customers = await customersOf(email);
  if (!customers.length) return { error: 'まだお申し込みがありません' };
  const make = () => stripe('POST', 'billing_portal/sessions', { customer: customers[0].id, return_url: `${appUrl()}/`, locale: 'ja' });
  try {
    return { url: (await make()).url };
  } catch (e) {
    // お客さま用の画面の設定がまだ無いときは、ここで作る（解約・カード変更・請求書）
    if (!/configuration/i.test(e.message)) throw e;
    await stripe('POST', 'billing_portal/configurations', {
      business_profile: { headline: 'その場レポ 月額プラン' },
      features: {
        subscription_cancel: { enabled: 'true', mode: 'at_period_end' },
        payment_method_update: { enabled: 'true' },
        invoice_history: { enabled: 'true' },
      },
    });
    return { url: (await make()).url };
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const email = await whoIs(req);
    if (!email) return res.status(401).json({ error: 'Googleにつないでから、もう一度お試しください' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const fn = { status, checkout, portal }[body.action];
    if (!fn) return res.status(400).json({ error: 'unknown action' });
    return res.status(200).json(await fn(email));
  } catch (e) {
    console.error('sub error', e.message, e.stripe?.code);
    return res.status(500).json({ error: '手続きでエラーが起きました。少し待ってからお試しください' });
  }
};

module.exports._test = { form, status, owners };
