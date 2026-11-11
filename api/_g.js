// マワリテ：協力業者の Google カレンダー連携の共通部分
// 環境変数 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が入るまでは使われない（画面にもボタンが出ない）
const { sb, ADMIN } = require('./_ai');

const BASE = process.env.APP_URL || 'https://mawarite.vercel.app';
const REDIRECT = `${BASE}/api/google-callback/`;
const SCOPES = 'openid email https://www.googleapis.com/auth/calendar.events';
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const configured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

async function tokenRequest(params) {
  const r = await fetch(TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', ...params }),
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(`Google のログインに失敗しました：${j.error_description || j.error || r.status}`.slice(0, 300)), { code: 502, g: j.error });
  return j;
}

/** 業者のアクセストークン（つながっていなければ null） */
async function accessToken(userId) {
  const [s] = await sb(`g_secrets?user_id=eq.${userId}&select=refresh_token`, ADMIN);
  if (!s) return null;
  try {
    return (await tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refresh_token })).access_token;
  } catch (e) {
    if (e.g === 'invalid_grant') await sb(`g_accounts?user_id=eq.${userId}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ active: false, last_error: 'つなぎ直しが必要です（Google で許可が取り消された・期限切れなど）' }) });
    throw e;
  }
}

/** 発注の内容から、カレンダーの予定を作る（時刻は日本時間） */
function eventOf(o, companyName) {
  const lines = [
    `依頼元：${companyName || ''}`,
    `作業：${o.work || ''}`,
    o.autolock ? 'オートロックあり（鍵の番号はマワリテの発注ページで、作業日の前日から見られます）' : '',
    o.building_info ? `建物：${o.building_info}` : '',
    o.note_for_vendor ? `連絡事項：${o.note_for_vendor}` : '',
    '',
    `マワリテの発注ページ：${BASE}/vendor/order/?id=${o.company_id}&o=${o.id}`,
  ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== ''));
  return {
    summary: `${o.property_name || '作業'}：${o.work || ''}`.slice(0, 200),
    location: o.property_address || '',
    description: lines.join('\n'),
    start: { dateTime: new Date(o.start_at).toISOString(), timeZone: 'Asia/Tokyo' },
    end: { dateTime: new Date(o.end_at).toISOString(), timeZone: 'Asia/Tokyo' },
    extendedProperties: { private: { mawarite_order: o.id } },
    reminders: { useDefault: true },
  };
}

async function cal(token, method, url, payload) {
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: payload ? JSON.stringify(payload) : undefined });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(`Google カレンダー：${j?.error?.message || r.status}`.slice(0, 300)), { code: r.status === 404 || r.status === 410 ? 404 : 502 });
  return j;
}

/**
 * 発注1件を、担当業者のカレンダーにそろえる。
 * 日程が決まっていれば作る／直す。日程なし・取りやめなら消す。業者がつないでいなければ何もしない
 */
async function syncOrder(orderId) {
  if (!configured()) return { skipped: 'not_configured' };
  const [o] = await sb(`orders?id=eq.${orderId}&select=*,vendors(user_id),companies(name)`, ADMIN);
  if (!o) return { skipped: 'no_order' };
  const uid = o.vendors?.user_id;
  if (!uid) return { skipped: 'vendor_not_linked' };
  const [acc] = await sb(`g_accounts?user_id=eq.${uid}&active=eq.true&select=user_id`, ADMIN);
  if (!acc) return { skipped: 'not_connected' };
  const token = await accessToken(uid);
  if (!token) return { skipped: 'not_connected' };
  const [link] = await sb(`order_gcal?order_id=eq.${o.id}&user_id=eq.${uid}&select=event_id`, ADMIN);
  const want = o.start_at && o.end_at && ['scheduled', 'done', 'billed'].includes(o.status);
  try {
    if (!want) {
      if (link) {
        await cal(token, 'DELETE', `${CAL}/${encodeURIComponent(link.event_id)}`).catch((e) => { if (e.code !== 404) throw e; });
        await sb(`order_gcal?order_id=eq.${o.id}&user_id=eq.${uid}`, ADMIN, { method: 'DELETE' });
      }
      return { removed: !!link };
    }
    const ev = eventOf(o, o.companies?.name);
    if (link) {
      try {
        await cal(token, 'PATCH', `${CAL}/${encodeURIComponent(link.event_id)}`, ev);
        await sb(`order_gcal?order_id=eq.${o.id}&user_id=eq.${uid}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ updated_at: new Date().toISOString() }) });
        return { updated: true };
      } catch (e) { if (e.code !== 404) throw e; } // 業者が手で消していたら作り直す
    }
    const made = await cal(token, 'POST', CAL, ev);
    await sb('order_gcal', ADMIN, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ order_id: o.id, user_id: uid, event_id: made.id, updated_at: new Date().toISOString() }) });
    await sb(`g_accounts?user_id=eq.${uid}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ last_error: '' }) });
    return { created: true };
  } catch (e) {
    await sb(`g_accounts?user_id=eq.${uid}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ last_error: String(e.message).slice(0, 200) }) });
    throw e;
  }
}

module.exports = { REDIRECT, SCOPES, AUTH, configured, tokenRequest, accessToken, eventOf, syncOrder };
