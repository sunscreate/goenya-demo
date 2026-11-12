// マワリテ：スマホへの通知（Web Push）と、アイコン右上の数字
//   POST ?op=key                         → 通知の登録に使う公開鍵
//   POST ?op=sub   { endpoint, keys }    → この端末を通知先として登録（ログイン中の本人）
//   POST ?op=unsub { endpoint }          → 登録を外す
//   POST ?op=test                        → 自分に試しの通知
//   POST ?op=fire  { user_id, title, body, url }（DBの pg_net から。x-push-secret 必須）
// 鍵は app_secrets（vapid_jwk・push_secret）に置く。外部のライブラリは使わず Node の crypto だけで暗号化する（RFC 8291 / 8292）
const crypto = require('crypto');
const { sb, getUser, body, ADMIN } = require('./_ai');

const b64u = (b) => Buffer.from(b).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s), 'base64url');
const fail = (code, message) => Object.assign(new Error(message), { code });

let cache = null;
async function secrets() {
  if (cache) return cache;
  const rows = await sb('app_secrets?key=in.(vapid_jwk,push_secret)&select=key,value', ADMIN);
  const get = (k) => rows.find((r) => r.key === k)?.value;
  const jwk = JSON.parse(get('vapid_jwk') || 'null');
  if (!jwk) throw fail(503, '通知の鍵がまだ設定されていません');
  cache = { jwk, secret: get('push_secret') || '', pub: b64u(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)])) };
  return cache;
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/** RFC 8291（aes128gcm）で中身を暗号化する */
function encrypt(payload, p256dh, authSecret) {
  const ua = fromB64u(p256dh);
  const ecdh = crypto.createECDH('prime256v1');
  const asPub = ecdh.generateKeys();
  const shared = ecdh.computeSecret(ua);
  const ikm = hmac(hmac(fromB64u(authSecret), shared), Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub, Buffer.from([1])]));
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21);
  salt.copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = asPub.length;
  return Buffer.concat([head, asPub, ct]);
}

/** RFC 8292（VAPID）の署名 */
function vapid(endpoint, s) {
  const aud = new URL(endpoint).origin;
  const enc = (o) => b64u(JSON.stringify(o));
  const data = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:sunscreate@scky.fun' })}`;
  const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', ...s.jwk }, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${data}.${b64u(sig)}, k=${s.pub}`;
}

/** アイコンの数字：自分の担当で未着手のタスク ＋（業者なら）日程未定の依頼・再報告のお願い */
async function badgeOf(uid) {
  const count = async (path) => {
    const r = await fetch(`${process.env.SUPABASE_URL || 'https://enwpymkodwogyfegbfsq.supabase.co'}/rest/v1/${path}`, { method: 'HEAD', headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, Prefer: 'count=exact' } });
    return +(r.headers.get('content-range') || '').split('/')[1] || 0;
  };
  const tasks = await count(`tasks?assignee=eq.${uid}&status=eq.open&select=id`);
  const vends = await sb(`vendors?user_id=eq.${uid}&select=id`, ADMIN);
  let orders = 0;
  if (vends.length) {
    const ids = vends.map((v) => v.id).join(',');
    orders = await count(`orders?vendor_id=in.(${ids})&or=(status.eq.sent,report_state.eq.returned)&status=neq.cancelled&select=id`);
  }
  return tasks + orders;
}

async function pushTo(uid, msg) {
  const s = await secrets();
  const subs = await sb(`push_subs?user_id=eq.${uid}&select=id,endpoint,p256dh,auth`, ADMIN);
  const badge = await badgeOf(uid);
  const payload = JSON.stringify({ ...msg, badge });
  let sent = 0;
  for (const p of subs) {
    try {
      const r = await fetch(p.endpoint, {
        method: 'POST',
        headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal', Authorization: vapid(p.endpoint, s) },
        body: encrypt(payload, p.p256dh, p.auth),
      });
      if (r.status === 404 || r.status === 410) await sb(`push_subs?id=eq.${p.id}`, ADMIN, { method: 'DELETE' }); // もう使われていない端末
      else if (r.ok) sent++;
    } catch (_) { /* 1台送れなくても他は送る */ }
  }
  return { sent, badge };
}

async function me(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const u = token ? await getUser(token) : null;
  if (!u?.id) throw fail(401, 'ログインしてください');
  return u;
}

const ops = {
  async key(req, res) { return res.status(200).json({ key: (await secrets()).pub }); },
  async sub(req, res) {
    const u = await me(req);
    const b = body(req);
    const endpoint = String(b.endpoint || '');
    if (!/^https:\/\//.test(endpoint) || !b.keys?.p256dh || !b.keys?.auth) throw fail(400, '登録の情報が足りません');
    await sb(`push_subs?endpoint=eq.${encodeURIComponent(endpoint)}`, ADMIN, { method: 'DELETE' });
    await sb('push_subs', ADMIN, { method: 'POST', body: JSON.stringify({ user_id: u.id, endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth }) });
    return res.status(200).json({ ok: true, badge: await badgeOf(u.id) });
  },
  async unsub(req, res) {
    const u = await me(req);
    await sb(`push_subs?endpoint=eq.${encodeURIComponent(String(body(req).endpoint || ''))}&user_id=eq.${u.id}`, ADMIN, { method: 'DELETE' });
    return res.status(200).json({ ok: true });
  },
  async test(req, res) {
    const u = await me(req);
    return res.status(200).json(await pushTo(u.id, { title: 'マワリテ', body: '通知が届くようになりました', url: '/' }));
  },
  async fire(req, res) {
    const s = await secrets();
    const given = String(req.headers['x-push-secret'] || '');
    if (!s.secret || given.length !== s.secret.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(s.secret))) throw fail(403, 'forbidden');
    const b = body(req);
    if (!/^[0-9a-f-]{36}$/i.test(String(b.user_id || ''))) throw fail(400, 'bad user');
    return res.status(200).json(await pushTo(b.user_id, { title: String(b.title || 'マワリテ').slice(0, 80), body: String(b.body || '').slice(0, 200), url: String(b.url || '/').startsWith('/') ? String(b.url) : '/' }));
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
    return res.status([400, 401, 403, 503].includes(e.code) ? e.code : 500).json({ error: String(e.message || e).slice(0, 300) });
  }
};
module.exports.encrypt = encrypt;
module.exports.vapid = vapid;
