// マワリテ：Microsoft Graph（Outlook と直接つなぐ）の共通部分
const crypto = require('crypto');
const { sb, upload, ADMIN } = require('./_ai');
const { processMail } = require('./mail-ai');

const CLIENT_ID = process.env.MS_CLIENT_ID || '15dec9fd-3b73-4a14-94f4-67f6aef526cc';
const BASE = process.env.APP_URL || 'https://mawarite.vercel.app';
const REDIRECT = `${BASE}/api/ms-callback/`;
const SCOPES = 'offline_access User.Read Mail.ReadWrite Mail.Send';
const NOTIFY_URL = `${BASE}/api/ms/?op=notify`;
const AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const G = 'https://graph.microsoft.com/v1.0';

const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function tokenRequest(params) {
  const r = await fetch(`${AUTH}/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: process.env.MS_CLIENT_SECRET || '', scope: SCOPES, ...params }),
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(`Microsoft のログインに失敗しました：${j.error_description || j.error || r.status}`.slice(0, 300)), { code: 502, ms: j.error });
  return j;
}

/** 社員のアクセストークン（リフレッシュトークンで毎回取り直し、新しいリフレッシュトークンを保存） */
async function accessToken(accountId) {
  const [s] = await sb(`ms_secrets?account_id=eq.${accountId}&select=refresh_token`, ADMIN);
  if (!s) throw Object.assign(new Error('Microsoft とつながっていません'), { code: 409 });
  try {
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refresh_token });
    if (t.refresh_token && t.refresh_token !== s.refresh_token) {
      await sb(`ms_secrets?account_id=eq.${accountId}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ refresh_token: t.refresh_token }) });
    }
    return t.access_token;
  } catch (e) {
    if (e.ms === 'invalid_grant') await sb(`ms_accounts?id=eq.${accountId}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ active: false, last_error: 'つなぎ直しが必要です（パスワード変更・期限切れなど）' }) });
    throw e;
  }
}

async function graph(token, path, init = {}) {
  const r = await fetch(path.startsWith('http') ? path : `${G}${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (r.status === 202 || r.status === 204) return null;
  const t = await r.text();
  if (!r.ok) throw Object.assign(new Error(`Outlook：${(t.match(/"message"\s*:\s*"([^"]+)/) || [])[1] || r.status}`.slice(0, 300)), { code: r.status === 404 ? 404 : 502 });
  return t ? JSON.parse(t) : null;
}

/** 受信の通知を作る・延ばす（メッセージの通知は最長およそ3日） */
async function ensureSubscription(acc, token) {
  const exp = new Date(Date.now() + 4000 * 60 * 1000).toISOString();
  if (acc.sub_id) {
    try {
      await graph(token, `/subscriptions/${acc.sub_id}`, { method: 'PATCH', body: JSON.stringify({ expirationDateTime: exp }) });
      await sb(`ms_accounts?id=eq.${acc.id}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ sub_expires: exp, last_error: '' }) });
      return;
    } catch (_) { /* なくなっていたら作り直す */ }
  }
  const [s] = await sb(`ms_secrets?account_id=eq.${acc.id}&select=client_state`, ADMIN);
  const sub = await graph(token, '/subscriptions', {
    method: 'POST',
    body: JSON.stringify({ changeType: 'created', notificationUrl: NOTIFY_URL, resource: 'me/messages', expirationDateTime: exp, clientState: s.client_state }),
  });
  await sb(`ms_accounts?id=eq.${acc.id}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ sub_id: sub.id, sub_expires: sub.expirationDateTime, last_error: '' }) });
}

const stripHtml = (h) => String(h || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** 取り込む対象のフォルダ（受信トレイと迷惑メール。初めての相手からのメールは迷惑メールに入りやすい） */
async function watchFolders(token) {
  const ids = await Promise.all(['inbox', 'junkemail'].map((f) => graph(token, `/me/mailFolders/${f}?$select=id`).then((x) => x?.id).catch(() => null)));
  return ids.filter(Boolean);
}

/** Outlook のメール1通をマワリテに取り込む（すでにあれば何もしない）。AIの準備まで */
async function importMessage(acc, token, msgId, runAi = true, folders = null) {
  const m = await graph(token, `/me/messages/${encodeURIComponent(msgId)}?$select=subject,from,toRecipients,ccRecipients,receivedDateTime,body,internetMessageId,hasAttachments,isDraft,parentFolderId`, {
    headers: { Prefer: 'outlook.body-content-type="text"' },
  });
  if (!m || m.isDraft) return null;
  const fs = folders || (await watchFolders(token));
  if (!fs.includes(m.parentFolderId)) return null; // 送信済み・下書きなどは取り込まない
  if ((m.from?.emailAddress?.address || '').toLowerCase() === String(acc.ms_email || '').toLowerCase()) return null; // 自分が送ったもの
  const messageId = m.internetMessageId || `graph:${msgId}`;
  const [dup] = await sb(`emails?company_id=eq.${acc.company_id}&message_id=eq.${encodeURIComponent(messageId)}&select=id`, ADMIN);
  if (dup) return { duplicate: true, email_id: dup.id };
  const id = crypto.randomUUID();
  const atts = [];
  if (m.hasAttachments) {
    const l = await graph(token, `/me/messages/${encodeURIComponent(msgId)}/attachments?$top=20`);
    for (const a of l?.value || []) {
      if (a['@odata.type'] !== '#microsoft.graph.fileAttachment' || !a.contentBytes || a.isInline) continue;
      const buf = Buffer.from(a.contentBytes, 'base64');
      const name = String(a.name || 'file').replace(/[\\/]/g, '_');
      const path = `${acc.company_id}/${id}/${name}`;
      if (await upload('mail', path, buf, a.contentType, ADMIN)) atts.push({ name, size: buf.length, type: a.contentType || '', path });
    }
  }
  const ad = (x) => x?.emailAddress?.address || '';
  const text = m.body?.contentType === 'html' ? stripHtml(m.body.content) : String(m.body?.content || '');
  await sb('emails', ADMIN, {
    method: 'POST',
    body: JSON.stringify({
      id, company_id: acc.company_id, owner_user: acc.user_id, message_id: messageId,
      from_addr: ad(m.from).toLowerCase(), from_name: m.from?.emailAddress?.name || '',
      to_addrs: (m.toRecipients || []).map(ad).join(', '), cc_addrs: (m.ccRecipients || []).map(ad).join(', '),
      subject: String(m.subject || ''), received_at: m.receivedDateTime || new Date().toISOString(),
      body: text.trim().slice(0, 200000), attachments: atts,
    }),
  });
  let ai = null;
  if (runAi && process.env.ANTHROPIC_API_KEY) {
    try { ai = await processMail(ADMIN, id, { id: acc.user_id }); } catch (e) { ai = { error: String(e.message || e).slice(0, 200) }; }
  }
  return { email_id: id, ...(ai || {}) };
}

/** 受信箱の最近のメールを確かめて、まだのものを取り込む（通知のとりこぼし対策） */
async function syncInbox(acc, maxAi = 5) {
  const token = await accessToken(acc.id);
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 直近2日（取り込み済みは飛ばす）
  const folders = await watchFolders(token);
  const errs = [];
  const listed = {};
  let n = 0, ai = 0;
  for (const f of ['inbox', 'junkemail']) {
    // 新しい順に25通を見て、時刻で絞る（$filter は環境によって効かないことがあるため）
    const l = await graph(token, `/me/mailFolders/${f}/messages?$select=id,receivedDateTime,internetMessageId&$top=25&$orderby=receivedDateTime%20desc`).catch((e) => { errs.push(`${f}: ${e.message}`); return null; });
    listed[f] = (l?.value || []).length;
    const recent = (l?.value || []).filter((x) => new Date(x.receivedDateTime).getTime() >= new Date(since).getTime());
    const mids = recent.map((x) => x.internetMessageId).filter(Boolean);
    const have = mids.length ? new Set((await sb(`emails?company_id=eq.${acc.company_id}&message_id=in.(${mids.map((x) => `"${String(x).replace(/"/g, '')}"`).map(encodeURIComponent).join(',')})&select=message_id`, ADMIN)).map((e) => e.message_id)) : new Set();
    const items = recent.filter((x) => !have.has(x.internetMessageId)).sort((a, b) => String(a.receivedDateTime).localeCompare(String(b.receivedDateTime)));
    for (const x of items) {
      try {
        const r = await importMessage(acc, token, x.id, ai < maxAi, folders);
        if (r && !r.duplicate) { n++; ai++; }
      } catch (e) { errs.push(`取り込み: ${e.message}`); }
    }
  }
  await sb(`ms_accounts?id=eq.${acc.id}`, ADMIN, { method: 'PATCH', body: JSON.stringify({ last_sync: new Date().toISOString(), last_error: errs.join(' / ').slice(0, 300) }) });
  return { imported: n, token, errors: errs, folders: folders.length, listed };
}

/** 返事をしたあとも処理を続ける（Vercel の waitUntil。使えなければ待ってから返す） */
function later(p) {
  const ctx = globalThis[Symbol.for('@vercel/request-context')]?.get?.();
  if (ctx?.waitUntil) { ctx.waitUntil(p.catch(() => {})); return true; }
  return false;
}

module.exports = { CLIENT_ID, REDIRECT, SCOPES, AUTH, b64url, tokenRequest, accessToken, graph, ensureSubscription, importMessage, syncInbox, later };
