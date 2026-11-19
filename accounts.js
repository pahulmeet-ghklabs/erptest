/* School ERP – front end. Talks to the Apps Script API (Code.gs). No data is stored in the browser except the tab session token. */
(function () {
'use strict';
const CFG = window.ERP_CONFIG || {};
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const e = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { token: null, user: null, boot: null, lang: 'en', route: 'dashboard' };
const store = {
  get(k, session) { try { return (session ? sessionStorage : localStorage).getItem(k); } catch (x) { return null; } },
  set(k, v, session) { try { (session ? sessionStorage : localStorage).setItem(k, v); } catch (x) { /* ignore */ } },
  del(k, session) { try { (session ? sessionStorage : localStorage).removeItem(k); } catch (x) { /* ignore */ } }
};

/* ---------------- i18n ---------------- */
const T = {
  en: { dashboard: 'Dashboard', students: 'Students', fees: 'Fee Collection', receipts: 'Receipts', adjust: 'Fee Adjustments', reports: 'Reports', yearend: 'Year-end & Promotion', setup: 'Setup', users: 'Users', settings: 'Settings', audit: 'Audit Log',
    save: 'Save', cancel: 'Cancel', search: 'Search', signin: 'Sign in', signout: 'Sign out', username: 'Username', password: 'Password', name: 'Name', class: 'Class', amount: 'Amount', date: 'Date', total: 'Total', balance: 'Balance', father: 'Father', mobile: 'Mobile', admno: 'Adm. No', mode: 'Mode', close: 'Close', edit: 'Edit', delete: 'Delete', add: 'Add', view: 'View', print: 'Print', status: 'Status', main: 'Main', tools: 'Tools', admin: 'Administration' },
  pa: { dashboard: 'ਡੈਸ਼ਬੋਰਡ', students: 'ਵਿਦਿਆਰਥੀ', fees: 'ਫੀਸ ਜਮ੍ਹਾਂ', receipts: 'ਰਸੀਦਾਂ', adjust: 'ਫੀਸ ਅਡਜਸਟਮੈਂਟ', reports: 'ਰਿਪੋਰਟਾਂ', yearend: 'ਸਾਲ-ਅੰਤ ਤੇ ਤਰੱਕੀ', setup: 'ਸੈੱਟਅੱਪ', users: 'ਯੂਜ਼ਰ', settings: 'ਸੈਟਿੰਗਾਂ', audit: 'ਆਡਿਟ ਲੌਗ',
    save: 'ਸੇਵ ਕਰੋ', cancel: 'ਰੱਦ ਕਰੋ', search: 'ਖੋਜ', signin: 'ਸਾਈਨ ਇਨ', signout: 'ਸਾਈਨ ਆਊਟ', username: 'ਯੂਜ਼ਰਨਾਮ', password: 'ਪਾਸਵਰਡ', name: 'ਨਾਮ', class: 'ਜਮਾਤ', amount: 'ਰਕਮ', date: 'ਮਿਤੀ', total: 'ਕੁੱਲ', balance: 'ਬਕਾਇਆ', father: 'ਪਿਤਾ', mobile: 'ਮੋਬਾਈਲ', admno: 'ਦਾਖਲਾ ਨੰ', mode: 'ਢੰਗ', close: 'ਬੰਦ ਕਰੋ', edit: 'ਸੋਧ', delete: 'ਹਟਾਓ', add: 'ਜੋੜੋ', view: 'ਵੇਖੋ', print: 'ਪ੍ਰਿੰਟ', status: 'ਸਥਿਤੀ', main: 'ਮੁੱਖ', tools: 'ਸੰਦ', admin: 'ਪ੍ਰਬੰਧ' }
};
const t = k => (T[S.lang] && T[S.lang][k]) || T.en[k] || k;

/* ---------------- helpers ---------------- */
const cur = () => (S.boot && S.boot.settings.currency) || '₹';
const nf = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = n => nf.format(+n || 0);
const cm = n => cur() + ' ' + money(n);
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const can = p => !!(S.user && S.user.perms.indexOf(p) >= 0);
const canNav = p => Array.isArray(p) ? p.some(can) : can(p);
const byId = (list, id) => (list || []).find(x => String(x.id) === String(id));
const cn = id => { const c = byId(S.boot.classes, id); return c ? c.name : ''; };
const sn = id => { const c = byId(S.boot.sections, id); return c ? c.name : ''; };
const opt = (list, v, l, sel, ph) => (ph !== undefined ? '<option value="">' + e(ph) + '</option>' : '') + list.map(x => '<option value="' + e(x[v]) + '"' + (String(x[v]) === String(sel) ? ' selected' : '') + '>' + e(typeof l === 'function' ? l(x) : x[l]) + '</option>').join('');
const fld = (label, inner, cls) => '<label class="f ' + (cls || '') + '"><span>' + e(label) + '</span>' + inner + '</label>';
const inp = (id, val, extra) => '<input id="' + id + '" value="' + e(val) + '" ' + (extra || '') + '>';
const chk = (id, label, on) => '<label class="chk"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + e(label) + '</label>';
const v = id => { const el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
const pill = (txt, cls) => '<span class="pill ' + (cls || '') + '">' + e(txt) + '</span>';
const spinner = '<div class="loading"><span class="spin"></span></div>';
const emailOk = s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s || '');

function toast(msg, kind) {
  const d = document.createElement('div'); d.className = 'toast ' + (kind || ''); d.textContent = msg; $('#toasts').appendChild(d);
  setTimeout(() => d.remove(), kind === 'bad' ? 6000 : 3500);
}
async function run(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); } catch (x) { toast(x.message || String(x), 'bad'); } finally { if (btn) btn.disabled = false; }
}
function table(cols, rows, o) {
  o = o || {};
  if (!rows.length) return '<div class="empty">' + e(o.empty || 'Nothing to show.') + '</div>';
  return '<div class="tbl-wrap"><table><thead><tr>' + cols.map(c => '<th class="' + (c.n ? 'n' : '') + '">' + e(c.l) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(r => '<tr' + (o.rowAttr ? ' ' + o.rowAttr(r) : '') + '>' + cols.map(c => '<td class="' + (c.n ? 'n' : '') + '">' + (c.h ? c.h(r) : e(c.f ? c.f(r) : r[c.k])) + '</td>').join('') + '</tr>').join('') + '</tbody>' +
    (o.foot ? '<tfoot><tr>' + o.foot + '</tr></tfoot>' : '') + '</table></div>';
}
function debounce(fn, ms) { let h; return function () { const a = arguments; clearTimeout(h); h = setTimeout(() => fn.apply(null, a), ms); }; }
function csv(rows, cols) {
  const q = s => { s = String(s == null ? '' : s); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  return [cols.map(c => q(c.l)).join(',')].concat(rows.map(r => cols.map(c => q(r[c.k])).join(','))).join('\r\n');
}
function download(name, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

/* ---------------- modal ---------------- */
function modal(o) {
  const root = $('#modalRoot'), ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = '<div class="modal ' + (o.size || '') + '" role="dialog" aria-modal="true"><header><h2>' + e(o.title) + '</h2>' + (o.locked ? '' : '<button class="btn sm" data-close aria-label="Close">✕</button>') + '</header><div class="body">' + (o.body || '') + '</div>' + (o.footer ? '<footer>' + o.footer + '</footer>' : '') + '</div>';
  root.appendChild(ov);
  const api_ = { el: ov, close() { ov.remove(); if (o.onClose) o.onClose(); } };
  ov.addEventListener('click', ev => { if ((ev.target === ov && !o.locked) || ev.target.closest('[data-close]')) api_.close(); });
  const first = $('input:not([type=hidden]),select,textarea', ov); if (first) first.focus();
  return api_;
}
function ask(msg, okLabel, danger) {
  return new Promise(res => {
    const m = modal({ title: 'Please confirm', size: 'sm', body: '<p>' + e(msg) + '</p>', footer: '<button class="btn" data-close>Cancel</button><button class="btn ' + (danger ? 'bad' : 'pri') + '" id="okAsk">' + e(okLabel || 'Confirm') + '</button>', onClose: () => res(false) });
    $('#okAsk', m.el).onclick = () => { m.el.remove(); res(true); };
  });
}
function askText(title, label, def, required) {
  return new Promise(res => {
    const m = modal({ title, size: 'sm', body: fld(label, '<input id="askT" value="' + e(def || '') + '">'), footer: '<button class="btn" data-close>Cancel</button><button class="btn pri" id="okAsk">OK</button>', onClose: () => res(null) });
    $('#okAsk', m.el).onclick = () => { const x = $('#askT', m.el).value.trim(); if (required && !x) { toast('This field is required.', 'bad'); return; } m.el.remove(); res(x); };
  });
}

/* ---------------- files, camera & attachments ---------------- */
const MAX_UPLOAD = 6 * 1024 * 1024;
function blobUrl(b64, mime) { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return URL.createObjectURL(new Blob([a], { type: mime })); }
function readAsB64(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(file); }); }
/* Shrinks a photo in the browser so uploads are fast on mobile data: longest side <= maxDim, JPEG quality q. PDFs pass through unchanged. */
async function prepFile(file, maxDim, q) {
  if (file.type === 'application/pdf') { if (file.size > MAX_UPLOAD) throw new Error('PDF is larger than 6 MB.'); return { name: file.name, mime: 'application/pdf', data: await readAsB64(file), size: file.size }; }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Only photos (JPG/PNG/WebP) or PDF files can be attached.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open this image.')); i.src = url; });
    const k = Math.min(1, (maxDim || 1600) / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
    const data = c.toDataURL('image/jpeg', q || 0.82).split(',')[1];
    return { name: (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', data, size: Math.round(data.length * 0.75) };
  } finally { URL.revokeObjectURL(url); }
}
/* Opens a Drive file (bill, receipt PDF, photo) inside the app. Staff never need Drive access: the server checks their permission and streams the file. */
async function openFile(fileId, title) {
  let url = '';
  const m = modal({ title: title || 'File', size: 'wide', body: spinner, footer: '<button class="btn" data-close>Close</button><button class="btn" id="fvDl">Download</button><button class="btn pri" id="fvPr">Print</button>', onClose: () => { if (url) URL.revokeObjectURL(url); } });
  try {
    const f = await api('fileData', { fileId }); url = blobUrl(f.data, f.mime);
    $('.body', m.el).innerHTML = f.mime === 'application/pdf' ? '<iframe title="File" id="fvf" src="' + url + '" style="width:100%;height:70vh;border:1px solid var(--line);border-radius:8px;background:#fff"></iframe>' : '<div class="c"><img id="fvi" alt="' + e(f.name) + '" src="' + url + '" style="max-width:100%;max-height:70vh;border-radius:8px"></div>';
    $('#fvDl', m.el).onclick = () => { const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); };
    $('#fvPr', m.el).onclick = () => { const fr = $('#fvf', m.el); if (fr) fr.contentWindow.print(); else { const w = window.open(url); if (w) w.onload = () => w.print(); } };
  } catch (x) { $('.body', m.el).innerHTML = '<div class="alert bad">' + e(x.message) + '</div>'; }
}
async function loadImg(img, fileId) { try { const f = await api('fileData', { fileId }); img.src = 'data:' + f.mime + ';base64,' + f.data; img.classList.remove('hide'); } catch (x) { /* thumbnail only */ } }
/* Live camera capture with a file/gallery fallback (used when the camera is blocked or the browser has none). Resolves {name,mime,data,size,preview} or null. */
function capturePhoto(o) {
  o = o || {};
  return new Promise(res => {
    let stream = null, facing = o.facing || 'environment', done = false;
    const stop = () => { if (stream) { stream.getTracks().forEach(t_ => t_.stop()); stream = null; } };
    const finish = v_ => { if (done) return; done = true; stop(); m.el.remove(); res(v_); };
    const m = modal({ title: o.title || 'Take a photo', size: 'wide', locked: true, body: '<div class="cam"><video id="camV" autoplay playsinline muted></video><div id="camMsg" class="muted sm c"></div></div><input type="file" id="camF" accept="image/*" capture="' + (facing === 'user' ? 'user' : 'environment') + '" class="hide">',
      footer: '<button class="btn" id="camX">Cancel</button><button class="btn" id="camFile">Choose / take with phone camera…</button><button class="btn" id="camFlip">Switch camera</button><button class="btn pri" id="camSnap">📷 Capture</button>' });
    const vid = $('#camV', m.el), msg = $('#camMsg', m.el);
    const fromFile = async f => { try { const p = await prepFile(f, o.maxDim || 1600, o.quality || 0.82); p.preview = 'data:' + p.mime + ';base64,' + p.data; finish(p); } catch (x) { toast(x.message, 'bad'); } };
    const start = async () => {
      stop();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = 'Live camera is not available in this browser. Use “Choose / take with phone camera”.'; $('#camSnap', m.el).disabled = true; $('#camFlip', m.el).disabled = true; return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); vid.srcObject = stream; msg.textContent = ''; $('#camSnap', m.el).disabled = false; }
      catch (x) { msg.textContent = 'Camera could not be opened (' + (x.name || 'error') + '). Allow camera access for this site, or use “Choose / take with phone camera”.'; $('#camSnap', m.el).disabled = true; }
    };
    $('#camX', m.el).onclick = () => finish(null);
    $('#camFlip', m.el).onclick = () => { facing = facing === 'environment' ? 'user' : 'environment'; start(); };
    $('#camFile', m.el).onclick = () => $('#camF', m.el).click();
    $('#camF', m.el).onchange = ev => { if (ev.target.files[0]) fromFile(ev.target.files[0]); };
    $('#camSnap', m.el).onclick = () => {
      if (!vid.videoWidth) { toast('Camera is still starting – try again.', 'bad'); return; }
      const c = document.createElement('canvas'); c.width = vid.videoWidth; c.height = vid.videoHeight; c.getContext('2d').drawImage(vid, 0, 0);
      c.toBlob(b => { if (!b) { toast('Capture failed.', 'bad'); return; } fromFile(new File([b], (o.name || 'photo') + '.jpg', { type: 'image/jpeg' })); }, 'image/jpeg', 0.95);
    };
    start();
  });
}
/* Attachment picker (bill / invoice photos): shows thumbnails, lets the user take photos, choose files, and remove them. Existing server-side files are listed with View / remove. */
function attachBox(host, o) {
  o = o || {}; const st = { files: [], keep: (o.existing || []).slice(), removed: [] };
  const draw = () => {
    host.innerHTML = '<div class="att">' + st.keep.map(f => '<div class="att-i"><div class="att-t" data-view="' + e(f.fileId) + '">' + (/pdf/.test(f.mime) ? '<span>PDF</span>' : '<span>🖼</span>') + '</div><div class="sm">' + e(f.name.replace(/^VOUCHER_ATT_[^_]*_?/, '').slice(0, 22)) + '</div><div class="row" style="gap:4px"><button type="button" class="btn sm" data-view="' + e(f.fileId) + '">View</button>' + (o.canRemove ? '<button type="button" class="btn sm bad" data-drop="' + e(f.fileId) + '">✕</button>' : '') + '</div></div>').join('') +
      st.files.map((f, i) => '<div class="att-i"><div class="att-t">' + (f.mime === 'application/pdf' ? '<span>PDF</span>' : '<img alt="" src="data:' + f.mime + ';base64,' + f.data + '">') + '</div><div class="sm">' + e(f.name.slice(0, 22)) + ' · ' + Math.round(f.size / 1024) + ' KB</div><button type="button" class="btn sm bad" data-rmnew="' + i + '">Remove</button></div>').join('') + '</div>' +
      '<div class="row mt"><button type="button" class="btn sm" data-cam>📷 Take photo</button><button type="button" class="btn sm" data-pick>＋ Choose file / photo</button><input type="file" class="hide" data-fi accept="image/*,application/pdf" multiple></div>';
  };
  host.addEventListener('click', async ev => {
    const b = ev.target.closest('button,[data-view]'); if (!b) return;
    if (b.dataset.view) { openFile(b.dataset.view, 'Attachment'); return; }
    if (b.dataset.drop) { st.removed.push(b.dataset.drop); st.keep = st.keep.filter(f => f.fileId !== b.dataset.drop); draw(); return; }
    if (b.dataset.rmnew !== undefined) { st.files.splice(+b.dataset.rmnew, 1); draw(); return; }
    if (b.hasAttribute('data-cam')) { const p = await capturePhoto({ title: 'Photograph the bill / invoice', name: 'bill' }); if (p) { st.files.push(p); draw(); } return; }
    if (b.hasAttribute('data-pick')) $('[data-fi]', host).click();
  });
  host.addEventListener('change', async ev => {
    if (!ev.target.matches('[data-fi]')) return;
    for (const f of Array.from(ev.target.files)) { try { st.files.push(await prepFile(f, 1600, 0.82)); } catch (x) { toast(f.name + ': ' + x.message, 'bad'); } }
    draw();
  });
  draw();
  return { newFiles: () => st.files.map(f => ({ name: f.name, mime: f.mime, data: f.data })), removed: () => st.removed.slice(), count: () => st.files.length + st.keep.length };
}

/* ---------------- api & session ---------------- */
async function api(action, payload) {
  if (!CFG.API_URL) throw new Error('API_URL is not set in config.js');
  let res;
  try { res = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: S.token, payload: payload || {} }), redirect: 'follow', credentials: 'omit', referrerPolicy: 'no-referrer' }); }
  catch (x) { throw new Error('Cannot reach the server. Check your internet connection.'); }
  let j; try { j = await res.json(); } catch (x) { throw new Error('Unexpected reply from the server. Check the API URL and deployment access.'); }
  if (!j.ok) {
    if (j.code === 'AUTH' && S.token) { logout(true); }
    if (j.code === 'MUSTCHANGE') { forcePasswordChange(); }
    throw new Error(j.error || 'Request failed');
  }
  return j.data;
}
let idleTimer;
function resetIdle() {
  clearTimeout(idleTimer); if (!S.token) return;
  idleTimer = setTimeout(() => { toast('Signed out due to inactivity.'); logout(true); }, (CFG.IDLE_MINUTES || 20) * 60000);
}
['click', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, debounce(resetIdle, 500), { passive: true }));

function showLogin(msg) {
  $('#app').classList.add('hide'); $('#login').classList.remove('hide');
  const er = $('#loginErr'); if (msg) { er.textContent = msg; er.classList.remove('hide'); } else er.classList.add('hide');
  if (!CFG.API_URL) { er.textContent = 'Setup needed: set API_URL in config.js (see README).'; er.classList.remove('hide'); }
}
function logout(silent) {
  if (S.token && !silent) api('logout').catch(() => {});
  S.token = null; S.user = null; S.boot = null; store.del('tok', true); clearTimeout(idleTimer);
  $('#modalRoot').innerHTML = ''; $('#view').innerHTML = ''; $('#lp').value = '';
  showLogin(silent ? 'Please sign in again.' : '');
}
async function enter() {
  S.boot = await api('bootstrap'); S.user = S.boot.user;
  $('#login').classList.add('hide'); $('#app').classList.remove('hide');
  $('#loginTitle').textContent = S.boot.settings.schoolName || 'School ERP';
  document.title = (S.boot.settings.schoolName || 'School ERP');
  $('#uname').textContent = S.user.name; $('#urole').textContent = S.user.role; $('#avatar').textContent = (S.user.name || '?').charAt(0).toUpperCase();
  buildNav(); resetIdle();
  const h = (location.hash || '').replace('#', '') || 'dashboard'; go(NAV.some(n => n.id === h && canNav(n.perm)) ? h : firstAllowed());
}
function forcePasswordChange() {
  if ($('#pwModal')) return;
  const m = modal({ title: 'Change your password', size: 'sm', locked: true, body: '<div id="pwModal" class="grid" style="gap:12px"><p class="muted">For security you must set a new password before continuing. Use at least 10 characters with letters and numbers.</p>' +
    fld('Current password', '<input type="password" id="pw0" autocomplete="current-password">') + fld('New password', '<input type="password" id="pw1" autocomplete="new-password">') + fld('Repeat new password', '<input type="password" id="pw2" autocomplete="new-password">') + '</div>',
    footer: '<button class="btn" id="pwOut">Sign out</button><button class="btn pri" id="pwOk">Change password</button>' });
  $('#pwOut', m.el).onclick = () => { m.el.remove(); logout(); };
  $('#pwOk', m.el).onclick = ev => run(ev.target, async () => {
    if (v('pw1') !== v('pw2')) throw new Error('New passwords do not match.');
    await api('changePassword', { oldPassword: $('#pw0').value, newPassword: $('#pw1').value });
    m.el.remove(); toast('Password changed.', 'ok'); await enter();
  });
}

/* ---------------- navigation ---------------- */
const NAV = [
  { id: 'dashboard', ic: '▦', perm: ['fees.receive', 'reports.view'], sec: 'main' }, { id: 'students', ic: '☺', perm: 'students.view' }, { id: 'fees', ic: '₹', perm: 'fees.receive' }, { id: 'receipts', ic: '▤', perm: 'fees.receive' },
  { id: 'adjust', ic: '±', perm: 'fees.adjust', sec: 'tools' }, { id: 'reports', ic: '▥', perm: 'reports.view' }, { id: 'yearend', ic: '⇪', perm: 'students.edit' },
  { id: 'setup', ic: '⚙', perm: 'masters.edit', sec: 'admin' }, { id: 'users', ic: '⚿', perm: 'users.manage' }, { id: 'settings', ic: '✎', perm: 'settings.edit' }, { id: 'audit', ic: '☰', perm: 'audit.view' }
];
const firstAllowed = () => (NAV.find(n => n.id === 'dashboard' && canNav(n.perm)) || NAV.find(n => n.id === 'gate' && canNav(n.perm)) || NAV.find(n => canNav(n.perm)) || NAV[0]).id;
function buildNav() {
  let h = '<div class="brand"><div class="logo">' + e((S.boot.settings.schoolName || 'S').charAt(0)) + '</div><div><b>' + e(S.boot.settings.schoolName) + '</b><span>School management</span></div></div><nav class="nav">';
  NAV.filter(n => canNav(n.perm)).forEach(n => { if (n.sec) h += '<div class="sec">' + e(t(n.sec)) + '</div>'; h += '<a data-go="' + n.id + '" tabindex="0"><span class="ic">' + n.ic + '</span>' + e(t(n.id)) + '</a>'; });
  h += '</nav><div class="grow"></div><a class="btn sm" id="chLang" style="justify-content:center;margin-bottom:6px">ਪੰਜਾਬੀ / English</a><a class="btn sm" id="chPw" style="justify-content:center">Change password</a>';
  $('#side').innerHTML = h;
}
const VIEWS = {};
async function go(id, arg) {
  if (!S.user) return;
  const n = NAV.find(x => x.id === id); if (!n || !canNav(n.perm)) { toast('You do not have access to that page.', 'bad'); return; }
  S.route = id; if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
  $$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.go === id));
  $('#pageTitle').textContent = t(id); $('#side').classList.remove('open');
  const view = $('#view'); view.innerHTML = spinner;
  try { await VIEWS[id](arg); } catch (x) { view.innerHTML = '<div class="alert bad">' + e(x.message) + '</div>'; }
  window.scrollTo(0, 0);
}

/* ================= DASHBOARD ================= */
VIEWS.dashboard = async () => {
  const d = await api('dashboard'), max = Math.max.apply(null, d.series.map(x => x.total).concat([1]));
  const modes = Object.keys(d.modes), mt = modes.reduce((a, k) => a + d.modes[k], 0) || 1;
  $('#view').innerHTML =
    '<div class="grid g4 kpis mb">' + [['Collected today', cm(d.today), d.todayCount + ' receipts'], ['Collected this month', cm(d.month), ''], ['Total outstanding', cm(d.dues), 'across all students'], ['Active students', d.students, '']]
      .map(k => '<div class="card kpi"><div class="l">' + e(k[0]) + '</div><div class="n">' + e(k[1]) + '</div><div class="muted sm">' + e(k[2]) + '</div></div>').join('') + '</div>' +
    '<div class="grid g2 mb"><div class="card"><div class="row between"><h2>Last 14 days</h2><span class="muted sm">fee collection</span></div><div class="bars">' +
    d.series.map(x => '<div style="height:' + Math.max(1, Math.round(x.total / max * 100)) + '%" title="' + e(x.date + ': ' + cm(x.total)) + '">' + (x.total ? '<span>' + Math.round(x.total) + '</span>' : '') + '</div>').join('') +
    '</div><div class="bar-l">' + d.series.map(x => '<span>' + e(x.date.slice(8)) + '</span>').join('') + '</div></div>' +
    '<div class="card"><h2>This month by payment mode</h2><div class="grid mt" style="gap:12px">' + (modes.length ? modes.map(k => '<div><div class="row between"><span>' + e(k) + '</span><b>' + cm(d.modes[k]) + '</b></div><div class="hbar"><i style="width:' + Math.round(d.modes[k] / mt * 100) + '%"></i></div></div>').join('') : '<div class="empty">No collections yet this month.</div>') + '</div></div></div>' +
    '<div class="card"><div class="row between mb"><h2>Recent receipts</h2>' + (can('fees.receive') ? '<button class="btn pri" data-go="fees">+ Collect fee</button>' : '') + '</div>' +
    table([{ l: 'Receipt', k: 'receiptNo' }, { l: 'Date', k: 'date' }, { l: 'Student', h: r => e(r.studentName) + ' <span class="muted">#' + e(r.admNo) + '</span>' }, { l: 'Mode', k: 'mode' }, { l: 'Amount', n: 1, f: r => money(r.total) }], d.recent, { empty: 'No receipts yet.' }) + '</div>';
};

/* ================= STUDENTS ================= */
const ST = { q: '', classId: '', sectionId: '', status: 'active' };
VIEWS.students = async () => {
  const B = S.boot;
  $('#view').innerHTML = '<div class="card"><div class="row mb"><div class="grow" style="min-width:220px"><input id="sq" placeholder="Search by name, adm. no, father, mobile…" value="' + e(ST.q) + '"></div>' +
    '<select id="sc" style="width:auto">' + opt(B.classes, 'id', 'name', ST.classId, 'All classes') + '</select><select id="ss" style="width:auto">' + opt(B.sections, 'id', 'name', ST.sectionId, 'All sections') + '</select>' +
    '<select id="sst" style="width:auto"><option value="active">Active</option><option value="left"' + (ST.status === 'left' ? ' selected' : '') + '>Left school</option><option value="all"' + (ST.status === 'all' ? ' selected' : '') + '>All</option></select>' +
    (can('students.edit') ? '<button class="btn pri" id="addSt">+ New admission</button>' : '') + '</div><div id="stList">' + spinner + '</div></div>';
  const load = async () => {
    ST.q = v('sq'); ST.classId = v('sc'); ST.sectionId = v('ss'); ST.status = v('sst');
    const r = await api('studentSearch', { q: ST.q, classId: ST.classId, sectionId: ST.sectionId, status: ST.status, limit: 300 });
    $('#stList').innerHTML = '<div class="muted sm mb">' + r.total + ' student' + (r.total === 1 ? '' : 's') + (r.total > r.rows.length ? ' (showing first ' + r.rows.length + ' – refine your search)' : '') + '</div>' +
      table([{ l: 'Adm. No', k: 'admNo' }, { l: 'Student', h: s => '<b>' + e(s.name) + '</b>' + (s.left ? ' ' + pill('Left', 'bad') : '') }, { l: 'Class', f: s => cn(s.classId) + (s.sectionId ? '-' + sn(s.sectionId) : '') }, { l: 'Roll', k: 'rollNo' }, { l: 'Father', k: 'fatherName' }, { l: 'Mobile', k: 'mobile' },
        { l: '', h: s => '<div class="row" style="flex-wrap:nowrap">' + (can('fees.receive') && !s.left ? '<button class="btn sm" data-act="collect" data-id="' + e(s.admNo) + '">Collect</button>' : '') + (can('fees.receive') || can('reports.view') ? '<button class="btn sm" data-act="ledger" data-id="' + e(s.admNo) + '">Ledger</button>' : '') + (can('students.edit') ? '<button class="btn sm" data-act="editst" data-id="' + e(s.admNo) + '">Edit</button>' : '') + '</div>' }], r.rows, { empty: 'No students match.' });
  };
  const dl = debounce(() => run(null, load), 300);
  $('#sq').oninput = dl; ['sc', 'ss', 'sst'].forEach(i => $('#' + i).onchange = () => run(null, load));
  const ab = $('#addSt'); if (ab) ab.onclick = () => studentForm();
  await load();
};
async function studentForm(admNo) {
  const B = S.boot; let s = { gender: '', studentType: 'New', otherFees: '[]', specialConcession: '[]', admDate: today(), state: '', city: '' };
  if (admNo) s = await api('studentGet', { admNo });
  const parse = x => { try { return typeof x === 'string' ? JSON.parse(x || '[]') : (x || []); } catch (z) { return []; } };
  const nonRes = B.feeTypes.filter(f => f.id !== 'ft_opening' && f.id !== 'ft_transport');
  const rowsHtml = (list, cls) => list.map(o => feeRow(cls, o)).join('');
  function feeRow(cls, o) { return '<div class="row ' + cls + '" style="flex-wrap:nowrap"><select style="flex:2">' + opt(nonRes, 'id', 'name', o.feeTypeId, 'Select fee') + '</select>' + (cls === 'con' ? '<select class="cm" style="flex:0 0 84px" title="Fixed amount or percentage"><option value="FIXED"' + (o.mode !== 'PCT' ? ' selected' : '') + '>₹ off</option><option value="PCT"' + (o.mode === 'PCT' ? ' selected' : '') + '>% off</option></select>' : '') + '<input type="number" min="0" step="0.01" style="flex:1" placeholder="' + (cls === 'con' ? 'Amount or %' : 'Amount') + '" value="' + e(o.amount || '') + '"><button type="button" class="btn sm" data-rm>✕</button></div>'; }
  const tabs = ['Basic', 'Parents & contact', 'Fee setup', 'Other'];
  const body = '<div class="tabs">' + tabs.map((x, i) => '<button type="button" data-tab="' + i + '" class="' + (i ? '' : 'on') + '">' + x + '</button>').join('') + '</div>' +
    '<div data-pane="0" class="form">' + fld('Admission no. ' + (admNo ? '' : '(auto if blank)'), inp('f_admNo', s.admNo || '', admNo ? 'readonly' : 'inputmode="numeric"')) + fld('Admission date', inp('f_admDate', s.admDate, 'type="date"')) +
    fld('Student name *', inp('f_name', s.name || '', 'maxlength="80"'), 'full') +
    fld('Gender *', '<select id="f_gender">' + opt([{ id: 'Male' }, { id: 'Female' }, { id: 'Other' }], 'id', 'id', s.gender, 'Select') + '</select>') + fld('Date of birth', inp('f_dob', s.dob || '', 'type="date"')) +
    fld('Class *', '<select id="f_classId">' + opt(B.classes, 'id', 'name', s.classId, 'Select') + '</select>') + fld('Section', '<select id="f_sectionId">' + opt(B.sections, 'id', 'name', s.sectionId, '—') + '</select>') +
    (admNo && can('gate.issue') ? '<div class="full row" style="align-items:center"><img id="stPh" class="ph-sm hide" alt="Student photo"><button type="button" class="btn sm" id="stPhBtn">📷 ' + (s.photoFileId ? 'Retake student photo' : 'Add student photo') + '</button><span class="muted sm">Used on gate passes.</span></div>' : '') + fld('Roll no.', inp('f_rollNo', s.rollNo || '')) + fld('Category', '<select id="f_categoryId">' + opt(B.categories, 'id', 'name', s.categoryId, '—') + '</select>') + fld('Religion', inp('f_religion', s.religion || '')) + fld('Registration no.', inp('f_regNo', s.regNo || '')) + '</div>' +
    '<div data-pane="1" class="form hide">' + fld('Father name *', inp('f_fatherName', s.fatherName || ''), 'full') + fld('Mother name', inp('f_motherName', s.motherName || ''), 'full') + fld('Mobile', inp('f_mobile', s.mobile || '', 'inputmode="tel"')) + fld('Alternate mobile', inp('f_altMobile', s.altMobile || '', 'inputmode="tel"')) +
    fld('Parent email (for receipts)', inp('f_email', s.email || '', 'type="email"'), 'full') + fld('Address', '<textarea id="f_address">' + e(s.address || '') + '</textarea>', 'full') + fld('City', inp('f_city', s.city || '')) + fld('State', inp('f_state', s.state || '')) + fld('PIN code', inp('f_pincode', s.pincode || '')) + fld('Guardian name', inp('f_guardianName', s.guardianName || '')) + fld('Siblings (adm. nos, comma separated)', inp('f_siblings', s.siblings || ''), 'full') + '</div>' +
    '<div data-pane="2" class="hide"><div class="form">' + fld('Student type', '<select id="f_studentType"><option value="New"' + (s.studentType === 'New' ? ' selected' : '') + '>New admission</option><option value="Existing"' + (s.studentType === 'Existing' ? ' selected' : '') + '>Existing student</option></select>') +
    fld('Fee category', '<select id="f_feeCategoryId">' + opt(B.feeCategories, 'id', 'name', s.feeCategoryId, 'Select') + '</select>') +
    fld('Transport stop', '<select id="f_routeId">' + opt(B.routes, 'id', r => (r.mainRoute ? r.mainRoute + ' → ' : '') + r.stopName + ' (' + money(r.amount) + ')', s.routeId, 'No transport') + '</select>') +
    fld('Opening balance (previous dues)', inp('f_openingBalance', s.openingBalance || 0, 'type="number" step="0.01"')) + '</div>' +
    '<h3 class="mt">Other applicable fees <span class="muted sm">(fee types marked “not planned”)</span></h3><div id="othBox" class="grid" style="gap:8px;margin:8px 0">' + rowsHtml(parse(s.otherFees), 'oth') + '</div><button type="button" class="btn sm" id="addOth">+ Add fee</button>' +
    '<h3 class="mt">Subsidy / special concession <span class="muted sm">(not everyone pays the same – a fixed ₹ amount or a % is taken off each period for periodic fees, once for annual fees)</span></h3><div id="conBox" class="grid" style="gap:8px;margin:8px 0">' + rowsHtml(parse(s.specialConcession), 'con') + '</div><button type="button" class="btn sm" id="addCon">+ Add subsidy</button><div class="form mt">' + fld('Reason for subsidy (shown in concession register)', inp('f_subsidyReason', s.subsidyReason || '', 'maxlength="150" placeholder="e.g. Single parent, staff child, scholarship"'), 'full') + '</div>' +
    '<hr>' + chk('f_impose', admNo ? 'Re-apply fee structure to this student’s ledger now (replaces structure-generated dues; receipts are kept)' : 'Apply fee structure to ledger on save', !admNo) + '<div class="row mt"><button type="button" class="btn sm" id="prevFee">Preview fee structure</button></div><div id="feePrev"></div></div>' +
    '<div data-pane="3" class="form hide">' + (admNo ? chk('f_left', 'Student has left the school', s.left === true || String(s.left).toLowerCase() === 'true') + fld('Left on', inp('f_leftDate', s.leftDate || '', 'type="date"')) : '') + fld('Remarks', '<textarea id="f_remarks">' + e(s.remarks || '') + '</textarea>', 'full') + '</div>';
  const m = modal({ title: admNo ? 'Edit student #' + admNo : 'New admission', size: 'wide', body, footer: '<button class="btn" data-close>Cancel</button><button class="btn pri" id="saveSt">Save student</button>' });
  m.el.addEventListener('click', ev => {
    const tb = ev.target.closest('[data-tab]'); if (tb) { $$('[data-tab]', m.el).forEach(b => b.classList.toggle('on', b === tb)); $$('[data-pane]', m.el).forEach(p => p.classList.toggle('hide', p.dataset.pane !== tb.dataset.tab)); }
    if (ev.target.closest('[data-rm]')) ev.target.closest('.row').remove();
    if (ev.target.id === 'addOth') $('#othBox', m.el).insertAdjacentHTML('beforeend', feeRow('oth', {}));
    if (ev.target.id === 'addCon') $('#conBox', m.el).insertAdjacentHTML('beforeend', feeRow('con', {}));
  });
  const collect = () => {
    const o = {}; ['admNo', 'admDate', 'name', 'gender', 'dob', 'classId', 'sectionId', 'rollNo', 'categoryId', 'religion', 'regNo', 'fatherName', 'motherName', 'mobile', 'altMobile', 'email', 'address', 'city', 'state', 'pincode', 'guardianName', 'siblings', 'studentType', 'feeCategoryId', 'routeId', 'openingBalance', 'remarks', 'subsidyReason'].forEach(k => { o[k] = v('f_' + k); });
    if (admNo) { o.left = v('f_left'); o.leftDate = v('f_leftDate'); }
    const rows = cls => $$('.' + cls, m.el).map(r => { const o2 = { feeTypeId: $('select', r).value, amount: parseFloat($('input', r).value) || 0 }; if (cls === 'con') { o2.mode = $('.cm', r).value; if (o2.mode === 'PCT' && o2.amount > 100) o2.amount = 100; } return o2; }).filter(x => x.feeTypeId && x.amount > 0);
    o.otherFees = rows('oth'); o.specialConcession = rows('con'); return o;
  };
  if (admNo && s.photoFileId && $('#stPh', m.el)) loadImg($('#stPh', m.el), s.photoFileId);
  const pb = $('#stPhBtn', m.el); if (pb) pb.onclick = () => run(pb, async () => { const p = await capturePhoto({ title: 'Photo of ' + s.name, facing: 'user', maxDim: 720, quality: 0.85, name: 'student' }); if (!p) return; const r = await api('studentPhotoSave', { admNo, photo: { name: p.name, mime: p.mime, data: p.data } }); s.photoFileId = r.fileId; $('#stPh', m.el).src = p.preview; $('#stPh', m.el).classList.remove('hide'); toast('Photo saved.', 'ok'); });
  $('#prevFee', m.el).onclick = ev => run(ev.target, async () => {
    const o = collect(); if (!o.classId || !o.feeCategoryId) throw new Error('Choose class and fee category first.');
    const list = await api('feePreview', { student: o });
    $('#feePrev', m.el).innerHTML = table([{ l: 'Fee', k: 'name' }, { l: 'Type', k: 'group' }, { l: 'Amount', n: 1, f: r => money(r.amount) }], list, { empty: 'No fees defined in Master Fee Structure for this class/category.' });
  });
  $('#saveSt', m.el).onclick = ev => run(ev.target, async () => {
    const o = collect(); if (!o.name) throw new Error('Student name is required.'); if (!o.gender) throw new Error('Gender is required.'); if (!o.classId) throw new Error('Class is required.'); if (!o.fatherName) throw new Error('Father name is required.'); if (o.email && !emailOk(o.email)) throw new Error('Parent email looks invalid.');
    const r = await api('studentSave', { student: o, impose: v('f_impose') });
    m.close(); toast('Student saved (Adm. No ' + r.admNo + ')' + (r.feeChanged ? ' – fee setup changed; re-apply fee structure to update dues.' : ''), 'ok'); if (S.route === 'students') VIEWS.students();
  });
}
async function ledgerModal(admNo) {
  const m = modal({ title: 'Student ledger #' + admNo, size: 'wide', body: spinner });
  try {
    const [l, st] = await Promise.all([api('studentLedger', { admNo }), api('studentGet', { admNo })]);
    $('.body', m.el).innerHTML = '<div class="row between mb"><div><h2>' + e(st.name) + '</h2><div class="muted">' + e(cn(st.classId)) + ' · ' + e(st.fatherName) + ' · ' + e(st.mobile) + '</div></div><div class="r"><div class="muted sm">Balance</div><div class="tot-big">' + cm(l.balance) + '</div></div></div>' +
      '<div class="tabs"><button class="on" data-tab="0">Ledger</button><button data-tab="1">Receipts (' + l.receipts.length + ')</button></div>' +
      '<div data-pane="0">' + table([{ l: 'Period', k: 'period' }, { l: 'Date', k: 'date' }, { l: 'Fee', k: 'feeName' }, { l: 'Type', h: r => pill(r.type, r.type === 'RECEIPT' ? 'ok' : r.type === 'CONCESSION' || r.type === 'CEASE' ? 'warn' : '') }, { l: 'Ref', k: 'refNo' }, { l: 'Debit', n: 1, f: r => r.debit ? money(r.debit) : '' }, { l: 'Credit', n: 1, f: r => r.credit ? money(r.credit) : '' }, { l: 'Balance', n: 1, f: r => money(r.balance) }], l.ledger, { empty: 'No entries. Apply the fee structure from the student form.' }) + '</div>' +
      '<div data-pane="1" class="hide">' + table([{ l: 'Receipt', k: 'receiptNo' }, { l: 'Date', k: 'date' }, { l: 'Mode', k: 'mode' }, { l: 'Amount', n: 1, f: r => money(r.total) }, { l: 'Status', h: r => pill(r.status, r.status === 'ACTIVE' ? 'ok' : 'bad') }, { l: '', h: r => '<button class="btn sm" data-act="viewrc" data-id="' + e(r.receiptNo) + '">View</button>' }], l.receipts, { empty: 'No receipts.' }) + '</div>';
    m.el.addEventListener('click', ev => { const tb = ev.target.closest('[data-tab]'); if (tb) { $$('[data-tab]', m.el).forEach(b => b.classList.toggle('on', b === tb)); $$('[data-pane]', m.el).forEach(p => p.classList.toggle('hide', p.dataset.pane !== tb.dataset.tab)); } });
  } catch (x) { $('.body', m.el).innerHTML = '<div class="alert bad">' + e(x.message) + '</div>'; }
}

/* ================= FEE COLLECTION ================= */
let FE = null;
function autocomplete(box, onPick) {
  const input = $('input', box), list = $('.list', box); let items = [], idx = -1;
  const draw = () => { list.classList.toggle('hide', !items.length); list.innerHTML = items.map((s, i) => '<div class="item' + (i === idx ? ' on' : '') + '" data-i="' + i + '"><span><b>' + e(s.name) + '</b> <span class="muted">' + e(s.fatherName) + '</span></span><span class="muted">#' + e(s.admNo) + ' · ' + e(cn(s.classId)) + '</span></div>').join(''); };
  const q = debounce(() => run(null, async () => { const x = input.value.trim(); if (x.length < 1) { items = []; draw(); return; } items = (await api('studentSearch', { q: x, status: 'active', limit: 8 })).rows; idx = -1; draw(); }), 250);
  input.oninput = q;
  input.onkeydown = ev => { if (ev.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); draw(); ev.preventDefault(); } else if (ev.key === 'ArrowUp') { idx = Math.max(0, idx - 1); draw(); ev.preventDefault(); } else if (ev.key === 'Enter') { if (items[Math.max(idx, 0)]) onPick(items[Math.max(idx, 0)]); ev.preventDefault(); } else if (ev.key === 'Escape') { items = []; draw(); } };
  list.onclick = ev => { const it = ev.target.closest('.item'); if (it) onPick(items[+it.dataset.i]); };
}
VIEWS.fees = async arg => {
  FE = { student: null, detail: null, amt: {}, wv: {}, acct: '', date: today(), mode: 'Cash', bankRef: '', remarks: '', emailTo: '', edit: null, waive: 0, waiveReason: '', sendEmail: null };
  if (arg && arg.edit) {
    const r = await api('receiptGet', { receiptNo: arg.edit }); const rc = r.receipt;
    Object.assign(FE, { edit: rc.receiptNo, date: rc.date, mode: rc.mode, bankRef: rc.bankRef, remarks: rc.remarks, emailTo: rc.emailTo, preLines: r.lines.filter(l => l.feeTypeId !== 'LATE'), waive: +rc.lateWaived || 0, acct: rc.accountId || '', waiveReason: rc.waiveReason || '' });
    await loadFeeStudent(rc.admNo);
  } else if (arg && arg.admNo) await loadFeeStudent(arg.admNo);
  drawFees();
};
async function loadFeeStudent(admNo) {
  const d = await api('feeDetail', { admNo, date: FE.date, excludeReceipt: FE.edit || '' });
  FE.detail = d; FE.student = d.student; if (!FE.emailTo) FE.emailTo = d.student.email || '';
  if (FE.sendEmail === null) FE.sendEmail = S.boot.settings.emailAuto === 'true' && emailOk(FE.emailTo);
  if (FE.preLines) { FE.amt = {}; FE.wv = {}; FE.preLines.forEach(l => { const k = l.periodId + '|' + l.feeTypeId; FE.amt[k] = (FE.amt[k] || 0) + (+l.amount); if (+l.waived) FE.wv[k] = (FE.wv[k] || 0) + (+l.waived); }); FE.preLines = null; }
  else { FE.amt = {}; FE.wv = {}; d.periods.forEach(p => { if (p.periodId === 'OPEN' || (p.lastDate && p.lastDate <= FE.date)) p.lines.forEach(l => { FE.amt[p.periodId + '|' + l.feeTypeId] = l.due; }); }); }
}
function feeTotals() {
  let fee = 0, late = 0;
  FE.detail.periods.forEach(p => { let any = false; p.lines.forEach(l => { const a = +FE.amt[p.periodId + '|' + l.feeTypeId] || 0; fee += a; if (a > 0) any = true; }); if (any) late += p.late || 0; });
  const w = Math.min(+FE.waive || 0, late); let lw = 0; Object.keys(FE.wv).forEach(k => { lw += +FE.wv[k] || 0; }); return { fee, late, w, lw, total: Math.round((fee + late - w) * 100) / 100 };
}
function updateFeeTotals() {
  const x = feeTotals(); $('#tFee').textContent = cm(x.fee); $('#tLate').textContent = cm(x.late - x.w); $('#tTot').textContent = cm(x.total); const tw = $('#tWv'); if (tw) { tw.textContent = cm(x.lw + x.w); tw.parentElement.classList.toggle('hide', !(x.lw + x.w)); }
  FE.detail.periods.forEach(p => { const el = document.getElementById('ps_' + p.periodId); if (!el) return; let s = 0, all = true; p.lines.forEach(l => { const k = p.periodId + '|' + l.feeTypeId, a = +FE.amt[k] || 0; s += a; if (Math.abs(a - l.due) > 0.004) all = false; }); el.textContent = cm(s); const cb = document.getElementById('pc_' + p.periodId); if (cb) cb.checked = all; });
}
function acctOpts() {
  const want = FE.mode === 'Cash' ? 'Cash' : 'Bank', list = (S.boot.cashBank || []).filter(a => a.kind === want);
  if (!list.some(a => a.id === FE.acct)) FE.acct = (list.find(a => a.id === S.boot.settings.defaultBankId) || list[0] || {}).id || '';
  if (FE.mode === 'Cash') FE.acct = (list[0] || {}).id || FE.acct;
  return opt(list, 'id', a => a.name + (a.bankName ? ' – ' + a.bankName : ''), FE.acct);
}
function drawFees() {
  const view = $('#view');
  if (!FE.student) {
    view.innerHTML = '<div class="card" style="max-width:640px;margin:40px auto"><h2>Collect fee</h2><p class="muted">Search by student name, admission no., father’s name or mobile.</p><div class="ac mt"><input id="feeSearch" placeholder="Start typing…" autocomplete="off"><div class="list hide"></div></div></div>';
    autocomplete($('.ac'), s => run(null, async () => { await loadFeeStudent(s.admNo); drawFees(); })); $('#feeSearch').focus(); return;
  }
  const d = FE.detail, st = FE.student, B = S.boot, canWaive = can('fees.waive');
  view.innerHTML =
    (FE.edit ? '<div class="alert mb">Editing receipt <b>' + e(FE.edit) + '</b>. Saving will update the ledger, regenerate the PDF in Drive and (optionally) email the revised receipt. Every change is recorded in the audit log.</div>' : '') +
    '<div class="grid" style="grid-template-columns:minmax(0,1fr) 320px;align-items:start;gap:16px" id="feeGrid"><div class="card">' +
    '<div class="row between mb"><div><h2>' + e(st.name) + ' <span class="muted">#' + e(st.admNo) + '</span></h2><div class="muted">' + e(st.className) + (st.sectionName ? '-' + e(st.sectionName) : '') + ' · Father: ' + e(st.fatherName) + ' · ' + e(st.mobile) + '</div></div>' +
    (FE.edit ? '' : '<button class="btn sm" id="chgSt">Change student</button>') + '</div>' +
    '<div class="form mb">' + fld('Receipt date', inp('fdate', FE.date, 'type="date"')) + fld('Payment mode', '<select id="fmode">' + ['Cash', 'UPI', 'Bank', 'Cheque', 'Card'].map(m => '<option' + (FE.mode === m ? ' selected' : '') + '>' + m + '</option>').join('') + '</select>') +
    fld('Reference / cheque / UTR no.', inp('fref', FE.bankRef, 'maxlength="60"'), FE.mode === 'Cash' ? 'hide' : '') + fld('Deposit to', '<select id="facct">' + acctOpts() + '</select>') + '</div>' +
    (d.periods.length ? '<div class="row between mb"><h3>Select periods & fee heads</h3><span class="muted sm">Tick a period to pay it in full, or type any part-payment amount.</span></div>' +
      d.periods.map(p => '<div class="period"><div class="ph"><input type="checkbox" id="pc_' + e(p.periodId) + '" data-pc="' + e(p.periodId) + '"> <b class="grow">' + e(p.name) + '</b>' + (p.lastDate && p.lastDate < FE.date ? pill('Overdue', 'bad') : '') + (p.lastDate ? '<span class="muted sm">due ' + e(p.lastDate) + '</span>' : '') + '<b id="ps_' + e(p.periodId) + '"></b></div>' +
        p.lines.map(l => '<div class="ln' + (canWaive ? ' w' : '') + '"><span>' + e(l.name) + '</span><span class="muted r">due ' + money(l.due) + '</span><input type="number" step="0.01" min="0" max="' + l.due + '" data-amt="' + e(p.periodId + '|' + l.feeTypeId) + '" data-due="' + l.due + '" value="' + (FE.amt[p.periodId + '|' + l.feeTypeId] || '') + '" placeholder="Pay" aria-label="' + e(l.name) + ' – amount to pay">' + (canWaive ? '<input type="number" step="0.01" min="0" max="' + l.due + '" data-wv="' + e(p.periodId + '|' + l.feeTypeId) + '" data-due="' + l.due + '" value="' + (FE.wv[p.periodId + '|' + l.feeTypeId] || '') + '" placeholder="Waive" title="Waive / subsidise part of this fee" class="wvin" aria-label="' + e(l.name) + ' – amount to waive">' : '') + '</div>').join('') +
        (p.late ? '<div class="ln"><span>Late fee (if this period is paid)</span><span></span><span class="r warn">' + money(p.late) + '</span></div>' : '') + '</div>').join('')
      : '<div class="empty">No pending dues for this student.</div>') +
    '<div class="form mt">' + fld('Remarks', inp('frem', FE.remarks, 'maxlength="200"'), 'full') + '</div>' +
    '<div class="sticky-total"><div><div class="muted sm">Fee</div><b id="tFee"></b></div><div><div class="muted sm">Late fee</div><b id="tLate"></b></div><div class="hide"><div class="muted sm">Waived</div><b id="tWv" class="warn"></b></div><div><div class="muted sm">Total to receive</div><div class="tot-big" id="tTot"></div></div><div class="grow"></div>' +
    '<button class="btn" id="fClear">Reset</button><button class="btn pri" id="fSave" style="padding:11px 22px">' + (FE.edit ? 'Update receipt' : 'Save & issue receipt') + '</button></div></div>' +
    '<div class="grid" style="gap:16px"><div class="card"><div class="muted sm">Outstanding balance</div><div class="tot-big">' + cm(d.balance) + '</div><button class="btn sm mt" data-act="ledger" data-id="' + e(st.admNo) + '">View ledger</button></div>' +
    (canWaive ? '<div class="card"><h3>Waiver / subsidy</h3><p class="muted sm">Type an amount in the <b>Waive</b> box of any fee line to forgive part or all of it (not everyone pays the same). ' + (d.periods.some(p => p.late) ? 'You can also waive part of the late fee below. ' : '') + 'A reason is mandatory; it is printed on the receipt, kept in the concession register and the audit log.</p>' + (d.periods.some(p => p.late) ? fld('Late fee to waive', inp('fwaive', FE.waive || '', 'type="number" min="0" step="0.01"')) + '<div style="height:8px"></div>' : '') + fld('Reason for waiver *', inp('fwr', FE.waiveReason, 'maxlength="150" placeholder="e.g. Approved by principal – sibling discount"')) + (st.subsidyReason ? '<p class="muted sm mt">Student’s standing subsidy: ' + e(st.subsidyReason) + '</p>' : '') + '</div>' : '') +
    '<div class="card"><h3>Email receipt</h3><div class="grid mt" style="gap:10px">' + chk('fsend', 'Email PDF receipt to parent', FE.sendEmail) + fld('Send to', inp('fmail', FE.emailTo, 'type="email" placeholder="parent@example.com"')) + '<p class="muted sm">A PDF copy is always saved to your Drive folder.</p></div></div></div></div>';
  if (window.innerWidth < 1000) $('#feeGrid').style.gridTemplateColumns = '1fr';
  updateFeeTotals();
  const chg = $('#chgSt'); if (chg) chg.onclick = () => { FE.student = null; drawFees(); };
  $('#fdate').onchange = ev => run(null, async () => { FE.date = ev.target.value || today(); const keep = Object.assign({}, FE.amt); await loadFeeStudent(FE.student.admNo); FE.amt = keep; drawFees(); });
  $('#fmode').onchange = ev => { FE.mode = ev.target.value; $('#fref').closest('label').classList.toggle('hide', FE.mode === 'Cash'); $('#facct').innerHTML = acctOpts(); };
  $('#fClear').onclick = () => { FE.amt = {}; FE.wv = {}; FE.waive = 0; drawFees(); };
  $('#fSave').onclick = ev => run(ev.target, async () => {
    FE.bankRef = v('fref'); FE.remarks = v('frem'); FE.emailTo = v('fmail'); FE.sendEmail = v('fsend'); FE.waive = parseFloat(v('fwaive')) || 0; FE.waiveReason = v('fwr');
    FE.acct = v('facct'); const lines = [], keys = {}; Object.keys(FE.amt).concat(Object.keys(FE.wv)).forEach(k => { keys[k] = 1; });
    Object.keys(keys).forEach(k => { const a = +FE.amt[k] || 0, w = +FE.wv[k] || 0; if (a > 0 || w > 0) { const p = k.split('|'); lines.push({ periodId: p[0], feeTypeId: p[1], amount: a, waive: w }); } });
    if (!lines.length) throw new Error('Enter an amount to receive.');
    const x0 = feeTotals(); if (!(x0.total > 0)) throw new Error('The amount actually received must be more than zero. To write off dues completely use Fee Adjustments → Concession.');
    if ((x0.lw + x0.w) > 0 && FE.waiveReason.trim().length < 3) throw new Error('Enter the reason for the waiver / subsidy.');
    if (FE.sendEmail && !emailOk(FE.emailTo)) throw new Error('Enter a valid email address or untick “Email PDF receipt”.');
    const x = feeTotals(); if (!(await ask((FE.edit ? 'Update receipt ' + FE.edit + ' to ' : 'Issue receipt for ') + cm(x.total) + ' (' + FE.mode + ')' + (x.lw + x.w ? ', with ' + cm(x.lw + x.w) + ' waived,' : '') + ' for ' + FE.student.name + '?', FE.edit ? 'Update' : 'Issue receipt'))) return;
    const r = await api('receiptSave', { receiptNo: FE.edit || '', admNo: FE.student.admNo, date: FE.date, mode: FE.mode, bankRef: FE.bankRef, remarks: FE.remarks, lines, accountId: FE.acct, lateWaive: FE.waive, waiveReason: FE.waiveReason, sendEmail: FE.sendEmail, emailTo: FE.emailTo });
    receiptDone(r);
  });
}
function receiptDone(r) {
  const em = r.emailStatus || '';
  const m = modal({ title: 'Receipt saved', size: 'sm', locked: true, body: '<div class="c"><div style="font-size:42px;color:var(--ok)">✓</div><h2>' + e(r.receiptNo) + '</h2><div class="tot-big">' + cm(r.total) + '</div></div><div class="grid mt" style="gap:8px">' +
    '<div class="alert ok">PDF saved to Drive.</div>' + (em === 'SENT' ? '<div class="alert ok">Emailed to parent.</div>' : em.indexOf('FAILED') === 0 ? '<div class="alert bad">Email not sent – ' + e(em.replace('FAILED: ', '')) + '. You can resend from Receipts.</div>' : '') + '</div>',
    footer: '<button class="btn" id="dPrint">Print</button>' + (r.pdfFileId ? '<button class="btn" id="dPdf">Open PDF</button>' : '') + '<button class="btn pri" id="dNew">Collect another</button>' });
  $('#dPrint', m.el).onclick = () => viewReceipt(r.receiptNo, true);
  const dp = $('#dPdf', m.el); if (dp) dp.onclick = () => openFile(r.pdfFileId, 'Receipt ' + r.receiptNo);
  $('#dNew', m.el).onclick = () => { m.el.remove(); go('fees'); };
}
async function viewReceipt(no, autoPrint) {
  const m = modal({ title: 'Receipt ' + no, size: 'wide', body: spinner, footer: '<button class="btn" data-close>Close</button><button class="btn pri" id="rvPrint">Print</button>' });
  try {
    const html = await api('receiptHtml', { receiptNo: no });
    $('.body', m.el).innerHTML = '<iframe id="rvf" title="Receipt" style="width:100%;height:65vh;border:1px solid var(--line);border-radius:8px;background:#fff"></iframe>';
    const f = $('#rvf', m.el); f.srcdoc = html; f.onload = () => { if (autoPrint) { autoPrint = false; f.contentWindow.print(); } };
    $('#rvPrint', m.el).onclick = () => f.contentWindow.print();
  } catch (x) { $('.body', m.el).innerHTML = '<div class="alert bad">' + e(x.message) + '</div>'; }
}

/* ================= RECEIPTS ================= */
const RC = { q: '', from: '', to: '', status: 'all' };
VIEWS.receipts = async () => {
  $('#view').innerHTML = '<div class="card"><div class="row mb"><div class="grow" style="min-width:220px"><input id="rq" placeholder="Search receipt no., student, adm. no…" value="' + e(RC.q) + '"></div>' +
    '<input type="date" id="rf" style="width:auto" value="' + e(RC.from) + '" title="From"><input type="date" id="rt" style="width:auto" value="' + e(RC.to) + '" title="To">' +
    '<select id="rs" style="width:auto"><option value="all">All</option><option value="ACTIVE"' + (RC.status === 'ACTIVE' ? ' selected' : '') + '>Active</option><option value="CANCELLED"' + (RC.status === 'CANCELLED' ? ' selected' : '') + '>Cancelled</option></select></div><div id="rcList">' + spinner + '</div></div>';
  const load = async () => {
    RC.q = v('rq'); RC.from = v('rf'); RC.to = v('rt'); RC.status = v('rs');
    const r = await api('receiptList', { q: RC.q, from: RC.from, to: RC.to, status: RC.status, limit: 300 });
    $('#rcList').innerHTML = '<div class="muted sm mb">' + r.total + ' receipt(s)</div>' + table([
      { l: 'Receipt', h: x => '<b>' + e(x.receiptNo) + '</b>' + (+x.rev > 1 ? ' <span class="muted sm">rev ' + e(x.rev) + '</span>' : '') }, { l: 'Date', k: 'date' }, { l: 'Student', h: x => e(x.studentName) + ' <span class="muted">#' + e(x.admNo) + '</span>' }, { l: 'Class', k: 'className' }, { l: 'Mode', k: 'mode' }, { l: 'Total', n: 1, h: x => money(x.total) + (+x.waivedTotal ? '<div class="muted sm" title="' + e(x.waiveReason) + '">waived ' + money(x.waivedTotal) + '</div>' : '') },
      { l: 'Status', h: x => pill(x.status, x.status === 'ACTIVE' ? 'ok' : 'bad') }, { l: 'Email', h: x => x.emailStatus === 'SENT' ? pill('Sent', 'ok') : x.emailStatus ? '<span title="' + e(x.emailStatus) + '">' + pill('Failed', 'bad') + '</span>' : pill('—') },
      { l: '', h: x => '<div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="viewrc" data-id="' + e(x.receiptNo) + '">View</button>' + (x.pdfFileId ? '<button class="btn sm" data-act="pdfrc" data-id="' + e(x.receiptNo) + '" data-f="' + e(x.pdfFileId) + '">PDF</button>' : '') +
        (x.status === 'ACTIVE' ? '<button class="btn sm" data-act="mailrc" data-id="' + e(x.receiptNo) + '" data-to="' + e(x.emailTo) + '">Email</button>' + (can('fees.edit') ? '<button class="btn sm" data-act="editrc" data-id="' + e(x.receiptNo) + '">Edit</button>' : '') + (can('fees.cancel') ? '<button class="btn sm bad" data-act="cancelrc" data-id="' + e(x.receiptNo) + '">Cancel</button>' : '') : '') + '</div>' }], r.rows, { empty: 'No receipts found.' });
  };
  const dl = debounce(() => run(null, load), 300); $('#rq').oninput = dl; ['rf', 'rt', 'rs'].forEach(i => $('#' + i).onchange = () => run(null, load)); await load();
};

/* ================= ADJUSTMENTS ================= */
const ADJ = { tab: 'extra' };
const ADJINFO = {
  extra: ['Extra charge', 'EXTRA', 'Add a one-time charge to selected students (e.g. fine, trip, uniform).'],
  concession: ['Concession', 'CONCESSION', 'Reduce dues of selected students. Cannot exceed the amount currently due.'],
  cease: ['Ceasing / reduction', 'CEASE', 'Cease or reduce a fee in bulk (e.g. summer vacation). Choose “full outstanding” to clear it completely.'],
  refund: ['Refund', 'REFUND', 'Refund fee already received. Cannot exceed the amount paid for that period and fee.'],
  increment: ['Fee increment', 'EXTRA', 'Increase a fee for many students at once. Select all students you want to include.']
};
VIEWS.adjust = async () => {
  const B = S.boot, A = ADJ.tab, info = ADJINFO[A];
  const periods = [{ id: 'OPEN', name: 'Opening balance' }].concat(B.periods);
  $('#view').innerHTML = '<div class="tabs">' + Object.keys(ADJINFO).map(k => '<button data-at="' + k + '" class="' + (k === A ? 'on' : '') + '">' + ADJINFO[k][0] + '</button>').join('') + '</div>' +
    '<div class="grid" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);align-items:start" id="adjGrid"><div class="card"><h2>1. Choose students</h2><p class="muted sm">' + e(info[2]) + '</p>' +
    '<div class="row mb"><select id="ac" style="width:auto">' + opt(B.classes, 'id', 'name', '', 'All classes') + '</select><div class="grow"><input id="aq" placeholder="Filter by name / adm. no"></div>' + chk('aall', 'Select all', A === 'increment') + '</div><div id="aList">' + spinner + '</div></div>' +
    '<div class="card"><h2>2. Details</h2><div class="grid mt" style="gap:12px">' +
    fld('Fee type', '<select id="aft">' + opt(B.feeTypes.filter(f => f.id !== 'ft_opening' || A !== 'extra'), 'id', 'name', '', 'Select') + '</select>') +
    '<div><div class="muted sm mb b">Periods</div><div class="grid" style="gap:6px;max-height:200px;overflow:auto">' + periods.map(p => '<label class="chk"><input type="checkbox" class="ap" value="' + e(p.id) + '"> ' + e(p.name) + '</label>').join('') + '</div></div>' +
    fld(A === 'concession' ? 'Amount (or percentage)' : 'Amount', inp('aamt', '', 'type="number" min="0" step="0.01"')) + (A === 'concession' ? chk('apct', 'Treat the amount as a percentage of each student’s due (e.g. 25 = 25% off)', false) : '') + (A === 'cease' ? chk('afull', 'Full outstanding amount (ignore amount above)', false) : '') +
    fld('Date', inp('adate', today(), 'type="date"')) + fld('Remarks', inp('arem', '', 'maxlength="200"')) + '<button class="btn pri" id="aApply" style="justify-content:center;padding:11px">Apply to selected students</button></div></div></div>';
  if (window.innerWidth < 1000) $('#adjGrid').style.gridTemplateColumns = '1fr';
  let rows = [];
  const load = async () => {
    const r = await api('studentSearch', { q: v('aq'), classId: v('ac'), status: 'active', limit: 2000 }); rows = r.rows;
    $('#aList').innerHTML = '<div class="muted sm mb"><span id="aCnt">0</span> selected · ' + r.total + ' shown</div><div class="tbl-wrap" style="max-height:420px">' + '<table><tbody>' + rows.map(s => '<tr><td><input type="checkbox" class="as" value="' + e(s.admNo) + '"' + (v('aall') ? ' checked' : '') + '></td><td>#' + e(s.admNo) + '</td><td>' + e(s.name) + '</td><td class="muted">' + e(cn(s.classId)) + '</td></tr>').join('') + '</tbody></table></div>';
    cnt();
  };
  const cnt = () => { const el = $('#aCnt'); if (el) el.textContent = $$('.as:checked').length; };
  $('#view').onchange = ev => { if (ev.target.classList.contains('as')) cnt(); };
  $('#aall').onchange = ev => { $$('.as').forEach(c => c.checked = ev.target.checked); cnt(); };
  $('#ac').onchange = () => run(null, load); $('#aq').oninput = debounce(() => run(null, load), 300);
  $('#aApply').onclick = ev => run(ev.target, async () => {
    const adm = $$('.as:checked').map(c => c.value), pids = $$('.ap:checked').map(c => c.value), full = A === 'cease' && v('afull');
    if (!adm.length) throw new Error('Select at least one student.'); if (!v('aft')) throw new Error('Select a fee type.'); if (!pids.length) throw new Error('Select at least one period.'); if (!full && !(parseFloat(v('aamt')) > 0)) throw new Error('Enter an amount.');
    if (!(await ask(info[0] + ': apply to ' + adm.length + ' student(s) for ' + pids.length + ' period(s)?', 'Apply', A === 'refund'))) return;
    const r = await api('adjust', { kind: info[1], admNos: adm, periodIds: pids, feeTypeId: v('aft'), amount: parseFloat(v('aamt')) || 0, pct: A === 'concession' && v('apct'), fullAmount: full, date: v('adate'), remarks: v('arem') });
    toast(r.applied + ' entries posted' + (r.skipped.length ? '; skipped ' + r.skipped.length + ' student(s) (amount exceeds due/paid)' : '') + '.', 'ok');
  });
  await load();
};

/* ================= REPORTS ================= */
const REP = {
  dues: ['Due list', ['classId', 'upto', 'feeTypeId', 'minDue']], defaulters: ['Defaulters (never paid)', ['upto']], classSummary: ['Class due / receipt summary', ['upto']],
  daily: ['Daily collection (receipt-wise)', ['range', 'mode', 'user']], headwise: ['Fee head-wise collection', ['range']], modewise: ['Payment mode-wise collection', ['range']],
  advances: ['List of advances', []], concessions: ['Concession register', ['range']], studentList: ['Student list', ['classId', 'sectionId', 'status']], strength: ['Class strength', []], routewise: ['Route-wise student count', []]
};
let REPOUT = null;
VIEWS.reports = async () => {
  const B = S.boot; const first = today().slice(0, 8) + '01';
  $('#view').innerHTML = '<div class="card no-print"><div class="row"><select id="rn" style="width:auto;min-width:240px">' + Object.keys(REP).map(k => '<option value="' + k + '">' + REP[k][0] + '</option>').join('') + '</select><div id="rp" class="row grow"></div><button class="btn pri" id="rRun">Run report</button></div></div><div id="rOut" class="mt"></div>';
  const params = () => {
    const ps = REP[v('rn')][1], h = [];
    ps.forEach(p => {
      if (p === 'classId') h.push('<select id="p_classId" style="width:auto">' + opt(B.classes, 'id', 'name', '', 'All classes') + '</select>');
      if (p === 'sectionId') h.push('<select id="p_sectionId" style="width:auto">' + opt(B.sections, 'id', 'name', '', 'All sections') + '</select>');
      if (p === 'upto') h.push('<select id="p_uptoPeriodId" style="width:auto">' + opt(B.periods, 'id', 'name', '', 'Up to: all periods') + '</select>');
      if (p === 'feeTypeId') h.push('<select id="p_feeTypeId" style="width:auto">' + opt(B.feeTypes, 'id', 'name', '', 'All fee heads') + '</select>');
      if (p === 'minDue') h.push('<input id="p_minDue" type="number" min="0" placeholder="Min due" style="width:110px">');
      if (p === 'range') h.push('<input id="p_from" type="date" value="' + first + '" style="width:auto"><input id="p_to" type="date" value="' + today() + '" style="width:auto">');
      if (p === 'mode') h.push('<select id="p_mode" style="width:auto"><option value="">All modes</option>' + ['Cash', 'UPI', 'Bank', 'Cheque', 'Card'].map(m => '<option>' + m + '</option>').join('') + '</select>');
      if (p === 'user') h.push('<input id="p_user" placeholder="Collected by (username)" style="width:190px">');
      if (p === 'status') h.push('<select id="p_status" style="width:auto"><option value="active">Active</option><option value="left">Left</option><option value="all">All</option></select>');
    });
    $('#rp').innerHTML = h.join('');
  };
  params(); $('#rn').onchange = params;
  $('#rRun').onclick = ev => run(ev.target, async () => {
    const name = v('rn'), pr = {}; $$('#rp [id^=p_]').forEach(el => { pr[el.id.slice(2)] = el.value.trim(); });
    $('#rOut').innerHTML = spinner; const r = await api('report', { name, params: pr }); REPOUT = { name, r };
    const tf = r.totals && Object.keys(r.totals).length ? r.columns.map((c, i) => '<td class="' + (c.t === 'money' || c.n ? 'n' : '') + '">' + (r.totals[c.k] !== undefined ? (c.t === 'money' ? money(r.totals[c.k]) : e(r.totals[c.k])) : (i === 0 ? 'Total' : '')) + '</td>').join('') : '';
    $('#rOut').innerHTML = '<div class="card"><div class="row between mb"><h2>' + e(REP[name][0]) + '</h2><div class="row no-print"><span class="muted sm">' + r.rows.length + ' rows</span><button class="btn sm" id="rCsv">Export CSV</button><button class="btn sm" id="rPrint">Print</button></div></div>' +
      table(r.columns.map(c => ({ l: c.l, n: c.t === 'money', f: x => c.t === 'money' ? money(x[c.k]) : x[c.k] })), r.rows, { foot: tf, empty: 'No data for these filters.' }) + '</div>';
    const c = $('#rCsv'); if (c) c.onclick = () => download(name + '-' + today() + '.csv', csv(r.rows, r.columns)); const p = $('#rPrint'); if (p) p.onclick = () => window.print();
  });
};

/* ================= SETUP (masters) ================= */
const SETUP = { tab: 'Classes' };
const MASTERS = {
  Classes: { title: 'Classes', cols: [{ l: 'Order', k: 'order' }, { l: 'Class', k: 'name' }, { l: 'In-charge', k: 'incharge' }, { l: 'Remarks', k: 'remarks' }], fields: [['name', 'Class name *'], ['order', 'Sort order', 'number'], ['incharge', 'Class in-charge'], ['remarks', 'Remarks']] },
  Sections: { title: 'Sections', cols: [{ l: 'Section', k: 'name' }], fields: [['name', 'Section name *']] },
  Categories: { title: 'Student categories', cols: [{ l: 'Category', k: 'name' }], fields: [['name', 'Category name *']] },
  FeeCategories: { title: 'Fee categories', cols: [{ l: 'Fee category', k: 'name' }, { l: 'Remarks', k: 'remarks' }], fields: [['name', 'Fee category name *'], ['remarks', 'Remarks']] },
  FeeTypes: { title: 'Fee types', cols: [{ l: 'Adjust order', k: 'adjustOrder' }, { l: 'Fee type', h: r => e(r.name) + (r.reserved === true || r.reserved === 'true' ? ' ' + pill('Reserved') : '') }, { l: 'Print name', k: 'printName' }, { l: 'Group', k: 'group' }, { l: 'Planned', f: r => (r.planned === true || r.planned === 'true') ? 'Yes' : 'No' }, { l: 'Late fee', f: r => (r.lateApplicable === true || r.lateApplicable === 'true') ? 'Yes' : 'No' }],
    fields: [['name', 'Fee type name *'], ['printName', 'Name on receipt (optional)'], ['group', 'Group', 'select', ['Annual', 'Periodic']], ['planned', 'Planned fee (appears in Master Fee Structure)', 'check'], ['lateApplicable', 'Late fee applicable', 'check'], ['adjustOrder', 'Adjustment order (lower = adjusted first)', 'number'], ['remarks', 'Remarks']] },
  Routes: { title: 'Transport stops', cols: [{ l: 'Main route', k: 'mainRoute' }, { l: 'Stop', k: 'stopName' }, { l: 'Distance', k: 'distance' }, { l: 'Charge / period', n: 1, f: r => money(r.amount) }, { l: 'Vehicle', k: 'vehicleNo' }], fields: [['mainRoute', 'Main route'], ['stopName', 'Stop name *'], ['distance', 'Distance (km)', 'number'], ['amount', 'Charge per period', 'number'], ['vehicleNo', 'Vehicle no.'], ['remarks', 'Remarks']] }
};
VIEWS.setup = async () => {
  const tabs = Object.keys(MASTERS).concat(['Periods', 'MasterFee']), lab = k => MASTERS[k] ? MASTERS[k].title : k === 'Periods' ? 'Fee periods' : 'Master fee structure';
  $('#view').innerHTML = '<div class="tabs">' + tabs.map(k => '<button data-st="' + k + '" class="' + (k === SETUP.tab ? 'on' : '') + '">' + lab(k) + '</button>').join('') + '</div><div id="setupBody">' + spinner + '</div>';
  const k = SETUP.tab; if (MASTERS[k]) await masterTab(k); else if (k === 'Periods') await periodsTab(); else await masterFeeTab();
};
async function refreshBoot() { const b = await api('bootstrap'); S.boot = b; S.user = b.user; }
async function masterTab(k) {
  const M = MASTERS[k], rows = await api('masterList', { table: k });
  $('#setupBody').innerHTML = '<div class="card"><div class="row between mb"><h2>' + e(M.title) + '</h2><button class="btn pri" data-act="madd" data-t="' + k + '">+ Add</button></div>' +
    table(M.cols.concat([{ l: '', h: r => '<div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="medit" data-t="' + k + '" data-id="' + e(r.id) + '">Edit</button><button class="btn sm bad" data-act="mdel" data-t="' + k + '" data-id="' + e(r.id) + '">Delete</button></div>' }]), rows, { empty: 'Nothing added yet.' }) + '</div>';
  window.__mrows = rows;
}
function masterForm(k, id) {
  const M = MASTERS[k], r = id ? (window.__mrows || []).find(x => String(x.id) === String(id)) : {}, reserved = r && (r.reserved === true || r.reserved === 'true');
  const body = '<div class="form">' + M.fields.map(f => {
    const val = r[f[0]] === undefined ? (f[2] === 'select' ? f[3][0] : '') : r[f[0]], dis = reserved && (f[0] === 'group' || f[0] === 'planned') ? ' disabled' : '';
    if (f[2] === 'check') return '<div class="full">' + chk('m_' + f[0], f[1], val === true || val === 'true') .replace('<input', '<input' + dis) + '</div>';
    if (f[2] === 'select') return fld(f[1], '<select id="m_' + f[0] + '"' + dis + '>' + f[3].map(o => '<option' + (o === val ? ' selected' : '') + '>' + o + '</option>').join('') + '</select>');
    return fld(f[1], inp('m_' + f[0], val, f[2] === 'number' ? 'type="number" step="any"' : 'maxlength="100"'), f[0] === 'name' || f[0] === 'remarks' ? 'full' : '');
  }).join('') + '</div>' + (reserved ? '<p class="muted sm mt">Reserved fee types keep their group and planned setting.</p>' : '');
  const m = modal({ title: (id ? 'Edit ' : 'Add ') + M.title.toLowerCase(), body, footer: '<button class="btn" data-close>Cancel</button><button class="btn pri" id="mSave">Save</button>' });
  $('#mSave', m.el).onclick = ev => run(ev.target, async () => {
    const row = id ? { id } : {}; M.fields.forEach(f => { row[f[0]] = v('m_' + f[0]); });
    await api('masterSave', { table: k, row }); m.close(); toast('Saved.', 'ok'); await refreshBoot(); VIEWS.setup();
  });
}
async function periodsTab() {
  const list = S.boot.periods;
  $('#setupBody').innerHTML = '<div class="card"><div class="row between mb"><div><h2>Fee periods</h2><p class="muted sm">The installments in which fee is received (e.g. 12 months, 4 quarters, 3 terms). Late fee is calculated from each period’s last date.</p></div><div class="row"><button class="btn" id="pGen">Generate periods</button><button class="btn pri" id="pAdd">+ Add period</button></div></div>' +
    table([{ l: '#', k: 'order' }, { l: 'Name', k: 'name' }, { l: 'Start', k: 'start' }, { l: 'End', k: 'end' }, { l: 'Last date (no late fee)', k: 'lastDate' }, { l: '', h: r => '<div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="pedit" data-id="' + e(r.id) + '">Edit</button><button class="btn sm bad" data-act="pdel" data-id="' + e(r.id) + '">Delete</button></div>' }], list, { empty: 'No periods yet – use “Generate periods”.' }) + '</div>';
  $('#pAdd').onclick = () => periodForm(); $('#pGen').onclick = periodGen;
}
function periodForm(id) {
  const r = id ? byId(S.boot.periods, id) : { order: S.boot.periods.length + 1 };
  const m = modal({ title: id ? 'Edit period' : 'Add period', size: 'sm', body: '<div class="grid" style="gap:12px">' + fld('Name *', inp('pd_name', r.name || '')) + fld('Start date *', inp('pd_start', r.start || '', 'type="date"')) + fld('End date *', inp('pd_end', r.end || '', 'type="date"')) + fld('Last date without late fee', inp('pd_last', r.lastDate || '', 'type="date"')) + fld('Order', inp('pd_ord', r.order || '', 'type="number"')) + '</div>', footer: '<button class="btn" data-close>Cancel</button><button class="btn pri" id="pdSave">Save</button>' });
  $('#pdSave', m.el).onclick = ev => run(ev.target, async () => { await api('periodsSave', { periods: [{ id: id || '', name: v('pd_name'), start: v('pd_start'), end: v('pd_end'), lastDate: v('pd_last'), order: parseInt(v('pd_ord')) || 0 }] }); m.close(); await refreshBoot(); VIEWS.setup(); });
}
function periodGen() {
  const y = new Date().getFullYear(); const m = modal({ title: 'Generate fee periods', size: 'sm', body: '<div class="grid" style="gap:12px">' + fld('Session start', inp('g_start', y + '-04-01', 'type="date"')) + fld('Frequency', '<select id="g_freq"><option value="1">Monthly (12)</option><option value="3">Quarterly (4)</option><option value="4">Every 4 months (3 terms)</option><option value="6">Half-yearly (2)</option><option value="12">Yearly (1)</option></select>') + fld('Last date (day of the period’s first month)', inp('g_due', '10', 'type="number" min="1" max="28"')) + '<p class="muted sm">Existing periods are kept. New periods are added after them.</p></div>', footer: '<button class="btn" data-close>Cancel</button><button class="btn pri" id="gGo">Generate</button>' });
  $('#gGo', m.el).onclick = ev => run(ev.target, async () => {
    const f = parseInt(v('g_freq')), n = 12 / f, s = v('g_start'); if (!s) throw new Error('Choose the session start date.');
    const base = new Date(s + 'T00:00:00'), mn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), out = [], off = S.boot.periods.length;
    for (let i = 0; i < n; i++) { const a = new Date(base.getFullYear(), base.getMonth() + i * f, 1), b = new Date(base.getFullYear(), base.getMonth() + (i + 1) * f, 0), l = new Date(a.getFullYear(), a.getMonth(), Math.min(28, parseInt(v('g_due')) || 10)); out.push({ name: f === 1 ? mn[a.getMonth()] + ' ' + a.getFullYear() : (f === 12 ? 'Annual ' : 'Period ' + (i + 1) + ' ') + '(' + mn[a.getMonth()] + '–' + mn[b.getMonth()] + ' ' + b.getFullYear() + ')', start: iso(a), end: iso(b), lastDate: iso(l), order: off + i + 1 }); }
    await api('periodsSave', { periods: out }); m.close(); toast(out.length + ' periods created.', 'ok'); await refreshBoot(); VIEWS.setup();
  });
}
async function masterFeeTab() {
  const B = S.boot, planned = B.feeTypes.filter(f => (f.planned === true || f.planned === 'true') && f.id !== 'ft_transport');
  $('#setupBody').innerHTML = '<div class="card"><h2>Master fee structure</h2><p class="muted sm">Fee amounts per class and fee category. New = new admission, Existing = continuing student. Periodic fees are charged in every period; annual fees once in the first period.</p><div class="row mb"><select id="mfc" style="width:auto">' + opt(B.classes, 'id', 'name', '', 'Select class') + '</select><select id="mff" style="width:auto">' + opt(B.feeCategories, 'id', 'name', '', 'Select fee category') + '</select></div><div id="mfBody"></div></div>';
  const load = async () => {
    if (!v('mfc') || !v('mff')) { $('#mfBody').innerHTML = '<div class="empty">Choose a class and a fee category.</div>'; return; }
    const ex = await api('masterFeeGet', { classId: v('mfc'), feeCategoryId: v('mff') }), map = {}; ex.forEach(x => { map[x.feeTypeId] = x; });
    $('#mfBody').innerHTML = '<div class="tbl-wrap"><table><thead><tr><th>Fee type</th><th>Group</th><th class="n">New student</th><th class="n">Existing student</th></tr></thead><tbody>' +
      planned.map(f => '<tr><td>' + e(f.name) + '</td><td>' + e(f.group) + '</td><td class="n"><input type="number" min="0" step="0.01" class="mfn" data-f="' + e(f.id) + '" value="' + e((map[f.id] || {}).newAmt || '') + '" style="width:130px;text-align:right"></td><td class="n"><input type="number" min="0" step="0.01" class="mfe" data-f="' + e(f.id) + '" value="' + e((map[f.id] || {}).existingAmt || '') + '" style="width:130px;text-align:right"></td></tr>').join('') + '</tbody></table></div>' +
      '<details class="mt"><summary class="b">Also copy these amounts to other classes</summary><div class="row mt">' + B.classes.filter(c => String(c.id) !== v('mfc')).map(c => '<label class="chk"><input type="checkbox" class="mfcopy" value="' + e(c.id) + '"> ' + e(c.name) + '</label>').join('') + '</div></details>' +
      '<div class="row mt"><button class="btn pri" id="mfSave">Save fee structure</button></div>';
    $('#mfSave').onclick = ev => run(ev.target, async () => {
      const rows = planned.map(f => ({ feeTypeId: f.id, newAmt: parseFloat($('.mfn[data-f="' + f.id + '"]').value) || 0, existingAmt: parseFloat($('.mfe[data-f="' + f.id + '"]').value) || 0 }));
      await api('masterFeeSave', { classId: v('mfc'), feeCategoryId: v('mff'), rows, copyToClasses: $$('.mfcopy:checked').map(c => c.value) }); toast('Fee structure saved. Existing students are unchanged until you re-apply fee structure.', 'ok');
    });
  };
  $('#mfc').onchange = () => run(null, load); $('#mff').onchange = () => run(null, load); load();
}

/* ================= YEAR-END ================= */
const YE = { tab: 'promote' };
VIEWS.yearend = async () => {
  const B = S.boot, tab = YE.tab, tabs = { promote: 'Promote / demote', left: 'Left school', roll: 'Rearrange roll no.', impose: 'Impose fee structure' };
  const cls = (id, ph) => '<select id="' + id + '" style="width:auto">' + opt(B.classes, 'id', 'name', '', ph) + '</select>', sec = id => '<select id="' + id + '" style="width:auto">' + opt(B.sections, 'id', 'name', '', 'All sections') + '</select>';
  let body = '';
  if (tab === 'promote') body = '<h2>Promote / demote a class</h2><div class="alert mb">Before promoting: set up next session’s fee periods and Master Fee Structure. Take a copy of your Google Sheet (File → Make a copy) as a backup.</div><div class="grid g2"><div class="card flat"><h3>From</h3><div class="row mt">' + cls('pfc', 'Current class') + sec('pfs') + '</div></div><div class="card flat"><h3>To</h3><div class="row mt">' + cls('ptc', 'Next class') + '<select id="pts">' + opt(B.sections, 'id', 'name', '', 'Keep section') + '</select></div></div></div>' +
    '<div class="form mt">' + fld('Do not promote (adm. nos or roll nos, comma separated)', inp('pex', ''), 'full') + '</div><div class="mt">' + chk('pimp', 'Impose next fee structure (rebuild fee dues for promoted students)', true) + '</div><p class="muted sm">Structure-generated dues are rebuilt from the new class’s Master Fee Structure (as “Existing student”). Old receipts and manual adjustments are kept.</p><button class="btn pri mt" id="pGo">Promote class</button>';
  else if (tab === 'left') body = '<h2>Mark students as left</h2><div class="row mb">' + cls('lfc', 'Select class') + sec('lfs') + '<select id="lmode" style="width:auto"><option value="left">Mark as left</option><option value="rejoin">Re-admit (undo left)</option></select><input type="date" id="ldate" value="' + today() + '" style="width:auto"><button class="btn" id="lLoad">Load list</button></div><div id="lList"></div>';
  else if (tab === 'roll') body = '<h2>Rearrange roll numbers</h2><div class="row mb">' + cls('rfc', 'Select class') + sec('rfs') + '<input id="rst" type="number" min="1" value="1" style="width:110px" title="Start from"><select id="rord" style="width:auto"><option value="name">Alphabetical by name</option><option value="admNo">By admission no.</option></select><button class="btn pri" id="rGo">Renumber</button></div><p class="muted sm">All active students of the selected class (and section) are renumbered.</p>';
  else body = '<h2>Impose new fee structure</h2><p class="muted">Rebuilds the structure-generated dues from the Master Fee Structure. Use after promotion or if a wrong structure was applied. Receipts and manual adjustments are kept.</p><div class="grid mt" style="gap:6px">' + B.classes.map(c => '<label class="chk"><input type="checkbox" class="ic" value="' + e(c.id) + '"> ' + e(c.name) + '</label>').join('') + '</div><div class="mt">' + chk('irc', 'Remove special concessions given at admission', false) + '</div><button class="btn pri mt" id="iGo">Impose fee structure</button>';
  $('#view').innerHTML = '<div class="tabs">' + Object.keys(tabs).map(k => '<button data-yt="' + k + '" class="' + (k === tab ? 'on' : '') + '">' + tabs[k] + '</button>').join('') + '</div><div class="card">' + body + '</div>';
  const g = id => document.getElementById(id);
  if (tab === 'promote') g('pGo').onclick = ev => run(ev.target, async () => {
    if (!v('pfc') || !v('ptc')) throw new Error('Choose current and next class.');
    const n = (await api('studentSearch', { classId: v('pfc'), sectionId: v('pfs'), status: 'active', limit: 1 })).total;
    if (!(await ask('Promote ' + n + ' student(s) from ' + cn(v('pfc')) + ' to ' + cn(v('ptc')) + '? This cannot be automatically undone.', 'Promote', true))) return;
    const r = await api('promote', { fromClassId: v('pfc'), fromSectionId: v('pfs'), toClassId: v('ptc'), toSectionId: v('pts'), exclude: v('pex'), impose: v('pimp') }); toast(r.promoted + ' students promoted.', 'ok');
  });
  if (tab === 'left') g('lLoad').onclick = ev => run(ev.target, async () => {
    if (!v('lfc')) throw new Error('Select a class.');
    const rejoin = v('lmode') === 'rejoin', r = await api('studentSearch', { classId: v('lfc'), sectionId: v('lfs'), status: rejoin ? 'left' : 'active', limit: 2000 });
    g('lList').innerHTML = table([{ l: '', h: s => '<input type="checkbox" class="lc" value="' + e(s.admNo) + '">' }, { l: 'Adm. No', k: 'admNo' }, { l: 'Name', k: 'name' }, { l: 'Roll', k: 'rollNo' }, { l: 'Father', k: 'fatherName' }], r.rows, { empty: 'No students.' }) + (r.rows.length ? '<button class="btn pri mt" id="lGo">' + (rejoin ? 'Re-admit selected' : 'Mark selected as left') + '</button>' : '');
    const b = g('lGo'); if (b) b.onclick = e2 => run(e2.target, async () => { const adm = $$('.lc:checked').map(c => c.value); if (!adm.length) throw new Error('Select students.'); const x = await api('bulkLeft', { admNos: adm, date: v('ldate'), left: !rejoin }); toast(x.updated + ' students updated.', 'ok'); g('lLoad').click(); });
  });
  if (tab === 'roll') g('rGo').onclick = ev => run(ev.target, async () => { if (!v('rfc')) throw new Error('Select a class.'); if (!(await ask('Renumber roll numbers for ' + cn(v('rfc')) + '?', 'Renumber'))) return; const r = await api('rollRenumber', { classId: v('rfc'), sectionId: v('rfs'), start: v('rst'), order: v('rord') }); toast(r.updated + ' roll numbers updated.', 'ok'); });
  if (tab === 'impose') g('iGo').onclick = ev => run(ev.target, async () => { const ids = $$('.ic:checked').map(c => c.value); if (!ids.length) throw new Error('Select at least one class.'); if (!(await ask('Rebuild fee dues for ' + ids.length + ' class(es)?', 'Impose', true))) return; const r = await api('imposeClasses', { classIds: ids, removeConcessions: v('irc') }); toast('Fee structure applied to ' + r.students + ' students.', 'ok'); });
};

/* ================= USERS ================= */
const ROLES = { admin: 'Administrator – everything', accountant: 'Accountant – fees, adjustments, reports, setup', reception: 'Reception – admissions & fee receipts', teacher: 'Teacher – view students & reports', auditor: 'Auditor – read-only view of books, reports and audit log', gatekeeper: 'Gatekeeper – gate pass verification only' };
const PERMS = { 'students.view': 'View students', 'students.edit': 'Add/edit students', 'fees.receive': 'Issue receipts', 'fees.edit': 'Edit receipts', 'fees.cancel': 'Cancel receipts', 'fees.adjust': 'Fee adjustments', 'fees.waive': 'Waive / subsidise fees at receipt', 'accounts.view': 'View accounts & vouchers', 'accounts.post': 'Post vouchers (receipts/payments)', 'accounts.edit': 'Edit vouchers', 'accounts.cancel': 'Cancel vouchers', 'accounts.manage': 'Manage accounts, lock date, reconciliation', 'gate.issue': 'Issue gate passes', 'gate.verify': 'Verify / exit gate passes', 'reports.view': 'View reports', 'masters.edit': 'Edit setup/masters', 'audit.view': 'View audit log', 'users.manage': 'Manage users', 'settings.edit': 'Edit settings' };
VIEWS.users = async () => {
  const rows = await api('usersList');
  $('#view').innerHTML = '<div class="card"><div class="row between mb"><h2>Users</h2><button class="btn pri" id="uAdd">+ Add user</button></div>' + table([{ l: 'Username', k: 'username' }, { l: 'Name', k: 'name' }, { l: 'Role', h: u => pill(u.role, 'pri') }, { l: 'Email', k: 'email' }, { l: 'Status', h: u => u.active ? pill('Active', 'ok') : pill('Disabled', 'bad') }, { l: '', h: u => '<button class="btn sm" data-act="uedit" data-id="' + e(u.id) + '">Edit</button>' }], rows) + '</div>';
  window.__users = rows; $('#uAdd').onclick = () => userForm();
};
function userForm(id) {
  const u = id ? window.__users.find(x => x.id === id) : { role: 'reception', active: true, extraPerms: [] };
  const m = modal({ title: id ? 'Edit user' : 'Add user', body: '<div class="form">' + fld('Username *', inp('u_un', u.username || '', 'maxlength="30" autocapitalize="off"')) + fld('Full name *', inp('u_nm', u.name || '')) + fld('Role', '<select id="u_role">' + Object.keys(ROLES).map(r => '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + e(ROLES[r]) + '</option>').join('') + '</select>', 'full') + fld('Email', inp('u_em', u.email || '', 'type="email"')) + fld('Mobile', inp('u_mo', u.mobile || '')) +
    fld(id ? 'Reset password (leave blank to keep)' : 'Initial password *', '<input id="u_pw" type="text" autocomplete="off" placeholder="min 10 chars, letters + numbers">', 'full') + '<div class="full"><div class="muted sm mb b">Extra permissions (on top of role)</div><div class="grid g2" style="gap:6px">' + Object.keys(PERMS).map(p => '<label class="chk"><input type="checkbox" class="up" value="' + p + '"' + ((u.extraPerms || []).indexOf(p) >= 0 ? ' checked' : '') + '> ' + PERMS[p] + '</label>').join('') + '</div></div><div class="full">' + chk('u_act', 'Account active', u.active) + '</div></div><p class="muted sm mt">New and reset passwords must be changed by the user at next sign-in.</p>',
    footer: '<button class="btn" data-close>Cancel</button><button class="btn pri" id="uSave">Save</button>' });
  $('#uSave', m.el).onclick = ev => run(ev.target, async () => { await api('userSave', { user: { id: id || '', username: v('u_un'), name: v('u_nm'), role: v('u_role'), email: v('u_em'), mobile: v('u_mo'), password: $('#u_pw').value, active: v('u_act'), extraPerms: $$('.up:checked').map(c => c.value) } }); m.close(); toast('User saved.', 'ok'); VIEWS.users(); });
}

/* ================= SETTINGS ================= */
const SET = { tab: 'school' };
VIEWS.settings = async () => {
  const s = S.boot.settings, tab = SET.tab, tabs = { school: 'School & receipt', email: 'Email', late: 'Late fee' };
  const F = (k, l, x, cls) => fld(l, inp('s_' + k, s[k] || '', x || ''), cls);
  let body = '';
  if (tab === 'school') body = '<div class="form">' + F('schoolName', 'School name (English)', '', 'full') + F('schoolNameLocal', 'School name (Punjabi – shown on receipt)', '', 'full') + F('address', 'Address', '', 'full') + F('phone', 'Phone') + F('email', 'School email (reply-to)', 'type="email"') + F('affiliation', 'Affiliation no.') + F('currency', 'Currency symbol') + F('receiptPrefix', 'Receipt number prefix') + F('nextReceiptNo', 'Next receipt number', 'type="number" min="1"') + F('signatory', 'Signatory label') + F('receiptFooter', 'Receipt footer text', '', 'full') + '</div>';
  else if (tab === 'email') body = '<div class="form">' + '<div class="full">' + chk('s_emailAuto', 'Tick “Email receipt” by default when a parent email exists', s.emailAuto === 'true') + '</div>' + F('emailSubject', 'Email subject', '', 'full') + fld('Email body', '<textarea id="s_emailBody" rows="8">' + e(s.emailBody || '') + '</textarea>', 'full') + '</div><p class="muted sm mt">Placeholders: {{school}} {{student}} {{admNo}} {{receiptNo}} {{amount}} {{date}} {{father}}. Emails are sent from the Google account that deployed the script (daily Gmail sending limits apply: about 100/day for free Gmail, 1,500/day for Workspace).</p>';
  else { let slabs = []; try { slabs = JSON.parse(s.lateSlabs || '[]'); } catch (x) { /* */ }
    body = '<div class="form">' + fld('Late fee method', '<select id="s_lateMode">' + [['none', 'No late fee'], ['flat', 'Flat amount per day'], ['slab', 'Slab – per day, rate by slab'], ['lump', 'Lump sum by delay slab']].map(o => '<option value="' + o[0] + '"' + (s.lateMode === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>') + F('lateFlat', 'Flat amount / day', 'type="number" min="0" step="0.01"') + F('lateMax', 'Maximum late fee per period (0 = no cap)', 'type="number" min="0"') + '</div>' +
      '<h3 class="mt">Slabs</h3><p class="muted sm">Slab: “first N days at ₹X/day, next N days at ₹Y/day…” · Lump: “up to N days → ₹X, next N days → ₹Y…”. The last slab repeats.</p><div id="slabBox" class="grid" style="gap:8px;margin:8px 0">' + slabs.map(sl => slabRow(sl)).join('') + '</div><button class="btn sm" id="slAdd">+ Add slab</button>'; }
  $('#view').innerHTML = '<div class="tabs">' + Object.keys(tabs).map(k => '<button data-sett="' + k + '" class="' + (k === tab ? 'on' : '') + '">' + tabs[k] + '</button>').join('') + '</div><div class="card" style="max-width:820px">' + body + '<div class="row mt"><button class="btn pri" id="sSave">Save settings</button></div></div>';
  function slabRow(x) { return '<div class="row sl" style="flex-wrap:nowrap"><input type="number" min="1" placeholder="Days" value="' + e(x.days || '') + '"><input type="number" min="0" step="0.01" placeholder="Amount" value="' + e(x.amount || '') + '"><button class="btn sm" data-rm type="button">✕</button></div>'; }
  const sa = $('#slAdd'); if (sa) sa.onclick = () => $('#slabBox').insertAdjacentHTML('beforeend', slabRow({}));
  $('#view').onclick = ev => { if (ev.target.closest('[data-rm]')) ev.target.closest('.row').remove(); };
  $('#sSave').onclick = ev => run(ev.target, async () => {
    const vals = {};
    $$('[id^=s_]').forEach(el => { vals[el.id.slice(2)] = el.type === 'checkbox' ? String(el.checked) : el.value.trim(); });
    if (tab === 'late') vals.lateSlabs = JSON.stringify($$('.sl').map(r => { const i = $$('input', r); return { days: parseInt(i[0].value) || 0, amount: parseFloat(i[1].value) || 0 }; }).filter(x => x.days > 0));
    S.boot.settings = await api('settingsSave', { values: vals }); toast('Settings saved.', 'ok');
  });
};

/* ================= AUDIT ================= */
VIEWS.audit = async () => {
  $('#view').innerHTML = '<div class="card"><div class="row mb"><div class="grow"><input id="auq" placeholder="Filter by user, action, receipt no., student…"></div></div><div id="auList">' + spinner + '</div></div>';
  const load = async () => {
    const rows = await api('auditList', { q: v('auq') }); window.__aud = rows;
    $('#auList').innerHTML = table([{ l: 'When', f: r => String(r.at).replace('T', ' ') }, { l: 'User', k: 'user' }, { l: 'Action', h: r => pill(r.action, /CANCEL|DELETE/.test(r.action) ? 'bad' : /EDIT|UPDATE/.test(r.action) ? 'warn' : '') }, { l: 'Item', f: r => r.entity + ' ' + r.entityId }, { l: '', h: (r) => '<button class="btn sm" data-act="audit" data-i="' + window.__aud.indexOf(r) + '">Details</button>' }], rows, { empty: 'No activity recorded.' });
  };
  $('#auq').oninput = debounce(() => run(null, load), 300); await load();
};

/* ---- shared toolkit for accounts.js (loaded after this file) ---- */
const ERP = window.ERP = { S, T, t, $, $$, e, v, fld, inp, chk, opt, pill, spinner, table, modal, ask, askText, toast, run, api, money, cm, today, can, csv, download, debounce, emailOk, byId, VIEWS, NAV, buildNav, go, openFile, capturePhoto, attachBox, loadImg, prepFile, autocomplete, viewReceipt, refreshBoot, acts: {}, cn, sn };

/* ================= global event wiring ================= */
document.addEventListener('click', ev => {
  const a = ev.target.closest('[data-act]');
  if (a) {
    const id = a.dataset.id, act = a.dataset.act;
    if (ERP.acts[act]) { ERP.acts[act](a, id); return; }
    if (act === 'collect') go('fees', { admNo: id });
    else if (act === 'ledger') ledgerModal(id);
    else if (act === 'editst') run(null, () => studentForm(id));
    else if (act === 'viewrc') viewReceipt(id);
    else if (act === 'pdfrc') openFile(a.dataset.f, 'Receipt ' + id);
    else if (act === 'editrc') go('fees', { edit: id });
    else if (act === 'mailrc') askText('Email receipt ' + id, 'Send to', a.dataset.to, true).then(to => { if (to) run(a, async () => { const r = await api('receiptResend', { receiptNo: id, emailTo: to }); toast(r.emailStatus === 'SENT' ? 'Email sent.' : r.emailStatus, r.emailStatus === 'SENT' ? 'ok' : 'bad'); VIEWS.receipts(); }); });
    else if (act === 'cancelrc') askText('Cancel receipt ' + id, 'Reason for cancellation (required)', '', true).then(rs => { if (rs) run(a, async () => { await api('receiptCancel', { receiptNo: id, reason: rs }); toast('Receipt cancelled.', 'ok'); VIEWS.receipts(); }); });
    else if (act === 'madd') masterForm(a.dataset.t);
    else if (act === 'medit') masterForm(a.dataset.t, id);
    else if (act === 'mdel') ask('Delete this item? This cannot be undone.', 'Delete', true).then(ok => { if (ok) run(a, async () => { await api('masterDelete', { table: a.dataset.t, id }); toast('Deleted.', 'ok'); await refreshBoot(); VIEWS.setup(); }); });
    else if (act === 'pedit') periodForm(id);
    else if (act === 'pdel') ask('Delete this period?', 'Delete', true).then(ok => { if (ok) run(a, async () => { await api('periodDelete', { id }); await refreshBoot(); VIEWS.setup(); }); });
    else if (act === 'uedit') userForm(id);
    else if (act === 'audit') { const r = window.__aud[+a.dataset.i]; modal({ title: r.action + ' · ' + r.entity + ' ' + r.entityId, size: 'wide', body: '<div class="muted sm mb">' + e(String(r.at).replace('T', ' ')) + ' · ' + e(r.user) + '</div><pre style="white-space:pre-wrap;word-break:break-word;background:var(--surface2);padding:12px;border-radius:8px;font-size:12px">' + e((() => { try { return JSON.stringify(JSON.parse(r.detail), null, 2); } catch (x) { return r.detail; } })()) + '</pre>' }); }
    return;
  }
  const g = ev.target.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
  const at = ev.target.closest('[data-at]'); if (at) { ADJ.tab = at.dataset.at; go('adjust'); return; }
  const st = ev.target.closest('[data-st]'); if (st) { SETUP.tab = st.dataset.st; go('setup'); return; }
  const yt = ev.target.closest('[data-yt]'); if (yt) { YE.tab = yt.dataset.yt; go('yearend'); return; }
  const sb = ev.target.closest('[data-sett]'); if (sb) { SET.tab = sb.dataset.sett; go('settings'); return; }
  if (ev.target.id === 'chLang') { toggleLang(); return; }
  if (ev.target.id === 'chPw') { const m = modal({ title: 'Change password', size: 'sm', body: '<div class="grid" style="gap:12px">' + fld('Current password', '<input type="password" id="cp0" autocomplete="current-password">') + fld('New password', '<input type="password" id="cp1" autocomplete="new-password">') + fld('Repeat new password', '<input type="password" id="cp2" autocomplete="new-password">') + '</div>', footer: '<button class="btn" data-close>Cancel</button><button class="btn pri" id="cpOk">Change</button>' }); $('#cpOk', m.el).onclick = e2 => run(e2.target, async () => { if ($('#cp1').value !== $('#cp2').value) throw new Error('New passwords do not match.'); await api('changePassword', { oldPassword: $('#cp0').value, newPassword: $('#cp1').value }); m.close(); toast('Password changed.', 'ok'); }); }
});
document.addEventListener('input', ev => {
  const el = ev.target;
  if (el.dataset && el.dataset.amt !== undefined && FE && FE.detail) { let x = parseFloat(el.value) || 0; const due = parseFloat(el.dataset.due), w = +FE.wv[el.dataset.amt] || 0; if (x + w > due + 0.004) { x = Math.max(0, Math.round((due - w) * 100) / 100); el.value = x || ''; } FE.amt[el.dataset.amt] = x; updateFeeTotals(); }
  if (el.dataset && el.dataset.wv !== undefined && FE && FE.detail) { let x = parseFloat(el.value) || 0; const due = parseFloat(el.dataset.due), paid = +FE.amt[el.dataset.wv] || 0; if (x + paid > due + 0.004) { x = Math.max(0, Math.round((due - paid) * 100) / 100); el.value = x || ''; } FE.wv[el.dataset.wv] = x; updateFeeTotals(); }
  if (el.id === 'fwaive' && FE) { FE.waive = parseFloat(el.value) || 0; updateFeeTotals(); }
});
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.dataset && el.dataset.pc !== undefined && FE && FE.detail) { const p = FE.detail.periods.find(x => x.periodId === el.dataset.pc); p.lines.forEach(l => { const k = p.periodId + '|' + l.feeTypeId; FE.amt[k] = el.checked ? l.due : 0; FE.wv[k] = 0; const inpEl = $('[data-amt="' + k + '"]'); if (inpEl) inpEl.value = el.checked ? l.due : ''; const wEl = $('[data-wv="' + k + '"]'); if (wEl) wEl.value = ''; }); updateFeeTotals(); }
});

/* ---------------- boot ---------------- */
function applyLang() {
  document.documentElement.lang = S.lang === 'pa' ? 'pa' : 'en';
  $$('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  if (S.user) { buildNav(); $$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.go === S.route)); $('#pageTitle').textContent = t(S.route); }
}
function toggleLang() { S.lang = S.lang === 'en' ? 'pa' : 'en'; store.set('lang', S.lang); applyLang(); }
$('#langBtn').onclick = toggleLang; $('#langL').onclick = toggleLang;
$('#themeBtn').onclick = () => { const cur_ = document.documentElement.getAttribute('data-theme'); const next = cur_ === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', next); store.set('theme', next); };
$('#logoutBtn').onclick = () => logout();
$('#menuBtn').onclick = () => $('#side').classList.toggle('open');
$('#loginForm').onsubmit = async ev => {
  ev.preventDefault(); const b = $('#loginBtn'); b.disabled = true; $('#loginErr').classList.add('hide');
  try {
    const r = await api('login', { username: $('#lu').value, password: $('#lp').value }); S.token = r.token; store.set('tok', r.token, true); S.user = r.user; $('#lp').value = '';
    if (r.user.mustChange) { $('#login').classList.add('hide'); forcePasswordChange(); } else await enter();
  } catch (x) { $('#loginErr').textContent = x.message; $('#loginErr').classList.remove('hide'); } finally { b.disabled = false; }
};
window.addEventListener('hashchange', () => { const h = location.hash.replace('#', ''); if (S.user && h && h !== S.route && NAV.some(n => n.id === h)) go(h); });
(async function init() {
  S.lang = store.get('lang') === 'pa' ? 'pa' : 'en'; const th = store.get('theme'); if (th) document.documentElement.setAttribute('data-theme', th); applyLang();
  const tok = store.get('tok', true);
  if (tok && CFG.API_URL) { S.token = tok; try { const u = await api('me'); S.user = u; if (u.mustChange) { $('#login').classList.add('hide'); forcePasswordChange(); } else await enter(); return; } catch (x) { S.token = null; store.del('tok', true); } }
  showLogin();
})();
})();
