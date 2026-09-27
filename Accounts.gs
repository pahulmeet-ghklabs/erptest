/**
 * Accounts.gs — double-entry books (vouchers, chart of accounts, funds, bank reconciliation, files).
 * Integrity rules enforced on the server for EVERY write:
 *  - every voucher balances (total debits = total credits)
 *  - cash accounts can never go negative (checked day by day)
 *  - liability/advance accounts that track parties can never be over-returned
 *  - nothing can be posted, edited or cancelled on/before the books lock date
 *  - reconciled bank lines cannot be changed until un-reconciled
 *  - vouchers are never deleted: cancelled vouchers stay in the books, marked CANCELLED
 * Fee receipts post automatically (type FEE) so there is ONE set of books.
 */
const VTYPE = { RECEIPT: 'RV', PAYMENT: 'PV', CONTRA: 'CV', JOURNAL: 'JV' };
const NATURES = {
  RECEIPT: ['Donation', 'Grant', 'Liability', 'Other income'],
  PAYMENT: ['Expense', 'Reimbursement', 'Liability return', 'Asset purchase', 'Other payment'],
  CONTRA: ['Transfer'], JOURNAL: ['Adjustment']
};
const BILL_NATURES = ['Expense', 'Reimbursement', 'Asset purchase', 'Other payment'];
const ATT_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const ACC_ACTIONS = {
  accountsDashboard: { perm: 'accounts.view', fn: function (p, u) { return accountsDashboard_(p, u); } },
  accountList: { perm: 'accounts.view', fn: function (p, u) { return accountList_(p, u); } },
  accountSave: { perm: 'accounts.manage', fn: function (p, u) { return accountSave_(p, u); } },
  accountDelete: { perm: 'accounts.manage', fn: function (p, u) { return accountDelete_(p, u); } },
  partyList: { perm: 'accounts.view', fn: function () { return readAll_('Parties').map(strip_); } },
  partySave: { perm: 'accounts.post', fn: function (p, u) { return partySave_(p, u); } },
  fundList: { perm: 'accounts.view', fn: function () { return readAll_('Funds').map(strip_); } },
  fundSave: { perm: 'accounts.manage', fn: function (p, u) { return fundSave_(p, u); } },
  voucherList: { perm: 'accounts.view', fn: function (p) { return voucherList_(p); } },
  voucherGet: { perm: 'accounts.view', fn: function (p) { return voucherGet_(p); } },
  voucherSave: { perm: 'accounts.post', fn: function (p, u) { return voucherSave_(p, u); } },
  voucherCancel: { perm: 'accounts.cancel', fn: function (p, u) { return voucherCancel_(p, u); } },
  voucherResend: { perm: 'accounts.post', fn: function (p, u) { return voucherResend_(p, u); } },
  voucherAttach: { perm: 'accounts.post', fn: function (p, u) { return voucherAttach_(p, u); } },
  voucherHtml: { perm: 'accounts.view', fn: function (p) { return voucherHtml_(voucherData_(p.vNo)); } },
  fileData: { fn: function (p, u) { return fileData_(p, u); } },
  accReport: { perm: 'accounts.view', fn: function (p, u) { return accReport_(p, u); } },
  reconList: { perm: 'accounts.view', fn: function (p) { return reconList_(p); } },
  reconMark: { perm: 'accounts.post', fn: function (p, u) { return reconMark_(p, u, true); } },
  reconUnmark: { perm: 'accounts.edit', fn: function (p, u) { return reconMark_(p, u, false); } },
  reconSave: { perm: 'accounts.post', fn: function (p, u) { return reconSave_(p, u); } },
  reconHistory: { perm: 'accounts.view', fn: function (p) { return readAll_('Recons').filter(function (r) { return r.accountId === p.accountId; }).reverse().slice(0, 30).map(strip_); } },
  dayCloseSave: { perm: 'accounts.post', fn: function (p, u) { return dayCloseSave_(p, u); } },
  dayCloseList: { perm: 'accounts.view', fn: function (p) { return readAll_('DayClose').filter(function (r) { return !p.accountId || r.accountId === p.accountId; }).reverse().slice(0, 60).map(strip_); } },
  accSettingsSave: { perm: 'accounts.manage', fn: function (p, u) { return accSettingsSave_(p, u); } }
};

function publicSettings_() { return settings_(); }

/* ------------------------------------------------------------------ */
/* Chart of accounts seed                                              */
/* ------------------------------------------------------------------ */
function seedChart_() {
  if (!readAll_('Accounts').length) {
    const rows = [];
    const A = function (id, name, group, type, kind, o) {
      o = o || {};
      rows.push({ id: id, code: '', name: name, group: group, type: type, kind: kind || 'Other', partyLedger: !!o.party, bankName: '', accountNo: '', ifsc: '', openingBal: 0, openingSide: (type === 'Asset' || type === 'Expense') ? 'Dr' : 'Cr', active: true, system: !!o.sys, remarks: o.remarks || '' });
    };
    A('ac_cash', 'Cash in Hand', 'Cash & Bank', 'Asset', 'Cash', { sys: true });
    A('ac_bank1', 'Bank Account 1', 'Cash & Bank', 'Asset', 'Bank', { sys: true, remarks: 'Rename this and add the bank details' });
    A('ac_advstaff', 'Staff Advances', 'Advances & Receivables', 'Asset', 'Other', { party: true });
    A('ac_recv', 'Other Receivables', 'Advances & Receivables', 'Asset', 'Other', { party: true });
    A('ac_secdep', 'Security Deposits Paid', 'Advances & Receivables', 'Asset', 'Other');
    A('ac_fa', 'Fixed Assets', 'Fixed Assets', 'Asset', 'Other');
    A('ac_refdep', 'Refundable Deposits Received', 'Refundable Liabilities', 'Liability', 'Other', { party: true, sys: true });
    A('ac_loans', 'Loans Received', 'Refundable Liabilities', 'Liability', 'Other', { party: true, sys: true });
    A('ac_grantadv', 'Grants Received in Advance (refundable)', 'Refundable Liabilities', 'Liability', 'Other', { party: true });
    A('ac_payables', 'Sundry Creditors / Payables', 'Current Liabilities', 'Liability', 'Other', { party: true });
    A('ac_staffpay', 'Staff Dues / Reimbursements Payable', 'Current Liabilities', 'Liability', 'Other', { party: true });
    A('ac_inc_don', 'Donations', 'Donations & Grants', 'Income', 'Other', { sys: true });
    A('ac_inc_grant', 'Grants', 'Donations & Grants', 'Income', 'Other', { sys: true });
    A('ac_inc_late', 'Late Fee Income', 'Fee Income', 'Income', 'Other', { sys: true });
    A('ac_inc_int', 'Interest Income', 'Other Income', 'Income', 'Other');
    A('ac_inc_other', 'Other Income', 'Other Income', 'Income', 'Other');
    A('ac_exp_sal', 'Salaries & Wages', 'Staff Costs', 'Expense', 'Other');
    A('ac_exp_rent', 'Rent', 'Premises', 'Expense', 'Other');
    A('ac_exp_util', 'Electricity, Water & Internet', 'Premises', 'Expense', 'Other');
    A('ac_exp_maint', 'Repairs & Maintenance', 'Premises', 'Expense', 'Other');
    A('ac_exp_teach', 'Teaching Materials & Books', 'Academic', 'Expense', 'Other');
    A('ac_exp_events', 'Events & Activities', 'Academic', 'Expense', 'Other');
    A('ac_exp_stat', 'Stationery & Printing', 'Administration', 'Expense', 'Other');
    A('ac_exp_trans', 'Transport & Fuel', 'Administration', 'Expense', 'Other');
    A('ac_exp_bank', 'Bank Charges', 'Administration', 'Expense', 'Other');
    A('ac_exp_misc', 'Miscellaneous Expenses', 'Administration', 'Expense', 'Other');
    A('ac_fund_gen', 'General Fund / Corpus', 'Funds & Reserves', 'Fund', 'Other', { sys: true });
    appendRows_('Accounts', rows);
  }
  if (!readAll_('Funds').length) appendRows_('Funds', [{ id: 'fund_general', name: 'General Fund (Unrestricted)', kind: 'Unrestricted', partyId: '', purpose: '', startDate: '', endDate: '', active: true }]);
}

/* ------------------------------------------------------------------ */
/* Core helpers                                                        */
/* ------------------------------------------------------------------ */
function accMap_() { return idMap_(cached_('Accounts')); }
function isCashBank_(a) { return !!a && (a.kind === 'Cash' || a.kind === 'Bank'); }
function openSigned_(a) { return num_(a.openingBal) * (a.openingSide === 'Cr' ? -1 : 1); }
function dirtyBooks_() { dirty_('Vouchers'); dirty_('VoucherLines'); dirty_('Files'); delete _memo.__al; }
/** All lines of ACTIVE vouchers, with the voucher's date/type/nature attached. */
function activeLines_() {
  if (_memo.__al) return _memo.__al;
  const vs = idMap_(cached_('Vouchers'), 'vNo'), out = [];
  cached_('VoucherLines').forEach(function (l) {
    const v = vs[l.vNo]; if (!v || v.status !== 'ACTIVE') return;
    out.push({ id: l.id, vNo: l.vNo, accountId: l.accountId, side: l.side, amount: num_(l.amount), fundId: l.fundId, partyId: l.partyId, dueDate: l.dueDate, memo: l.memo, clearedDate: l.clearedDate,
      date: v.date, vtype: v.type, nature: v.nature, narration: v.narration, refNo: v.refNo, partyName: v.partyName, by: v.createdBy });
  });
  _memo.__al = out; return out;
}
const drOf_ = function (l) { return l.side === 'Dr' ? l.amount : -l.amount; };

function assertUnlocked_(date) {
  const lock = String(settings_().booksLockDate || '');
  if (lock && String(date) <= lock) throw new Error('The books are locked up to ' + lock + '. Entries on or before this date cannot be added, changed or cancelled. Ask an administrator to move the lock date if a correction is unavoidable.');
}
function assertNotReconciled_(vNo) {
  const hit = cached_('VoucherLines').some(function (l) { return String(l.vNo) === String(vNo) && String(l.clearedDate || '') !== ''; });
  if (hit) throw new Error(vNo + ' has bank lines that are already reconciled. Un-reconcile them first (Bank & cash → Reconcile).');
}
/** Simulates the books after removing `except` vouchers and adding `add` lines; throws if a rule would break. */
function checkIntegrity_(except, add) {
  const ex = {}; (except || []).forEach(function (v) { ex[v] = 1; });
  const accs = accMap_(), parties = idMap_(cached_('Parties')), touched = {};
  const cur = activeLines_();
  cur.forEach(function (l) { if (ex[l.vNo]) touched[l.accountId] = 1; });
  (add || []).forEach(function (l) { touched[l.accountId] = 1; });
  const hyp = cur.filter(function (l) { return !ex[l.vNo]; }).concat((add || []).map(function (x) { return { accountId: x.accountId, side: x.side, amount: num_(x.amount), date: x.date, partyId: x.partyId || '' }; }));
  Object.keys(touched).forEach(function (id) {
    const a = accs[id]; if (!a) return;
    const lines = hyp.filter(function (l) { return l.accountId === id; });
    if (a.kind === 'Cash') {
      const bad = runningNegative_(lines, openSigned_(a), 1);
      if (bad) throw new Error('Cash account “' + a.name + '” would go negative on ' + bad.date + ' (' + money_(bad.bal) + '). You cannot spend or return cash that was not yet received – check the date and amount.');
    } else if (truthy_(a.partyLedger) && (a.type === 'Liability' || a.type === 'Asset')) {
      const by = {}; lines.forEach(function (l) { (by[l.partyId || ''] = by[l.partyId || ''] || []).push(l); });
      Object.keys(by).forEach(function (pid) {
        const bad = runningNegative_(by[pid], 0, a.type === 'Asset' ? 1 : -1);
        if (bad) throw new Error('“' + a.name + '”' + (pid && parties[pid] ? ' for ' + parties[pid].name : '') + ': ' + (a.type === 'Liability' ? 'the amount returned/settled would exceed the amount received' : 'the amount recovered would exceed the amount advanced') + ' on ' + bad.date + ' (short by ' + money_(Math.abs(bad.bal)) + ').');
      });
    }
  });
}
function money_(n) { return (Math.round(num_(n) * 100) / 100).toFixed(2); }
/** natural sign: +1 → balance = open + Σ(Dr−Cr);  −1 → balance = open − Σ(Dr−Cr). Checked at the end of each day. */
function runningNegative_(lines, open, sign) {
  const byDate = {}; lines.forEach(function (l) { byDate[l.date] = (byDate[l.date] || 0) + drOf_(l); });
  let bal = open;
  const dates = Object.keys(byDate).sort();
  for (let i = 0; i < dates.length; i++) { bal = r2_(bal + sign * byDate[dates[i]]); if (bal < -0.004) return { date: dates[i], bal: bal }; }
  return null;
}

/* ------------------------------------------------------------------ */
/* Files (bill photos, PDFs, photos) – all private in Drive            */
/* ------------------------------------------------------------------ */
function driveFolder_(parts) {
  let f = DriveApp.getFolderById(prop_('DRIVE_FOLDER_ID'));
  parts.forEach(function (n) { f = folder_(f, n); });
  return f;
}
function registerFile_(fileId, kind, refId, name, mime, size, u) {
  appendRows_('Files', [{ id: uid_('f_'), fileId: fileId, kind: kind, refId: String(refId), name: name, mime: mime, size: size || 0, deleted: false, by: u ? u.username : 'system', at: now_() }]);
  delete _memo.__al;
}
function retireFile_(fileId) {
  const row = readAll_('Files').filter(function (f) { return f.fileId === fileId; })[0];
  if (row) { updateRow_('Files', row._row, { deleted: true }); }
}
function magicOk_(b, mime) {
  const x = function (i) { return (b[i] + 256) % 256; };
  if (mime === 'image/jpeg') return x(0) === 0xFF && x(1) === 0xD8 && x(2) === 0xFF;
  if (mime === 'image/png') return x(0) === 0x89 && x(1) === 0x50 && x(2) === 0x4E && x(3) === 0x47;
  if (mime === 'application/pdf') return x(0) === 0x25 && x(1) === 0x50 && x(2) === 0x44 && x(3) === 0x46;
  if (mime === 'image/webp') return x(0) === 0x52 && x(1) === 0x49 && x(2) === 0x46 && x(3) === 0x46;
  return false;
}
/** Validates and stores an uploaded file (base64) in Drive, registers it, returns the Files row info. */
function checkUpload_(f) {
  const mime = String(f.mime || '').toLowerCase();
  if (ATT_MIMES.indexOf(mime) < 0) throw new Error('Only JPG, PNG, WebP or PDF files are allowed.');
  const bytes = Utilities.base64Decode(String(f.data || ''));
  if (!bytes || !bytes.length) throw new Error('The file is empty.');
  if (bytes.length > 6 * 1024 * 1024) throw new Error('File is too large (max 6 MB). Take the photo again at a lower size.');
  if (!magicOk_(bytes, mime)) throw new Error('The file does not look like a valid ' + mime.split('/')[1].toUpperCase() + '.');
  return { mime: mime, bytes: bytes };
}
function saveUpload_(f, kind, refId, u, folderParts) {
  const c = checkUpload_(f), mime = c.mime, bytes = c.bytes;
  const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1].replace('jpeg', 'jpg');
  const base = String(f.name || kind).replace(/\.[A-Za-z0-9]{2,4}$/, '').replace(/[^\w\-]+/g, '_').slice(0, 40) || kind;
  const name = kind + '_' + String(refId).replace(/[^\w\-]+/g, '_') + '_' + base + '_' + Utilities.getUuid().slice(0, 4) + '.' + ext;
  const file = driveFolder_(folderParts).createFile(Utilities.newBlob(bytes, mime, name));
  registerFile_(file.getId(), kind, refId, name, mime, bytes.length, u);
  return { fileId: file.getId(), name: name, mime: mime, size: bytes.length };
}
const FILE_PERM = { VOUCHER_ATT: ['accounts.view'], VOUCHER_PDF: ['accounts.view'], RECEIPT_PDF: ['fees.receive', 'accounts.view'], PHOTO_STUDENT: ['students.view', 'gate.issue', 'gate.verify'], PHOTO_GUARDIAN: ['students.view', 'gate.issue', 'gate.verify'], PHOTO_PASS: ['students.view', 'gate.issue', 'gate.verify'], PASS_PDF: ['students.view', 'gate.issue', 'gate.verify'] };
function fileData_(p, u) {
  const f = readAll_('Files').filter(function (x) { return x.fileId === String(p.fileId); })[0];
  if (!f) throw new Error('File not found.');
  const need = FILE_PERM[f.kind] || ['accounts.manage'];
  if (!need.some(function (perm) { return can_(u, perm); })) throw new Error('You do not have permission to view this file.');
  const blob = DriveApp.getFileById(f.fileId).getBlob();
  return { name: f.name, mime: f.mime, kind: f.kind, deleted: truthy_(f.deleted), data: Utilities.base64Encode(blob.getBytes()) };
}
function htmlToPdf_(html, name) { return Utilities.newBlob(html, 'text/html', name + '.html').getAs('application/pdf').setName(name.replace(/[^\w\-]+/g, '_') + '.pdf'); }

/* ------------------------------------------------------------------ */
/* Accounts, parties, funds                                            */
/* ------------------------------------------------------------------ */
function accountAgg_() {
  const agg = {}; activeLines_().forEach(function (l) { const a = agg[l.accountId] = agg[l.accountId] || { dr: 0, cr: 0, n: 0 }; if (l.side === 'Dr') a.dr += l.amount; else a.cr += l.amount; a.n++; });
  return agg;
}
function accountList_() {
  const agg = accountAgg_(), used = {}; cached_('VoucherLines').forEach(function (l) { used[l.accountId] = 1; });
  return readAll_('Accounts').map(function (a) {
    const g = agg[a.id] || { dr: 0, cr: 0 }, net = r2_(openSigned_(a) + g.dr - g.cr), natDr = (a.type === 'Asset' || a.type === 'Expense');
    const o = strip_(a); o.balance = net; o.naturalBalance = natDr ? net : -net; o.used = !!used[a.id]; o.openingSigned = openSigned_(a); return o;
  });
}
function accountSave_(p, u) {
  const x = p.account || {}, name = String(x.name || '').trim();
  if (!name) throw new Error('Account name is required.');
  if (['Asset', 'Liability', 'Income', 'Expense', 'Fund'].indexOf(x.type) < 0) throw new Error('Choose an account type.');
  const group = String(x.group || '').trim(); if (!group) throw new Error('Choose or type a group (e.g. Staff Costs, Premises).');
  const kind = x.type === 'Asset' && ['Cash', 'Bank'].indexOf(x.kind) >= 0 ? x.kind : 'Other';
  const all = readAll_('Accounts');
  if (all.some(function (a) { return a.id !== x.id && String(a.name).toLowerCase() === name.toLowerCase(); })) throw new Error('An account with this name already exists.');
  const ob = num_(x.openingBal); if (ob < 0) throw new Error('Opening balance cannot be negative – use the Dr/Cr side.');
  const rec = { code: String(x.code || '').slice(0, 20), name: name.slice(0, 80), group: group.slice(0, 60), type: x.type, kind: kind, partyLedger: truthy_(x.partyLedger) && (x.type === 'Liability' || x.type === 'Asset'),
    bankName: kind === 'Bank' ? String(x.bankName || '').slice(0, 60) : '', accountNo: kind === 'Bank' ? String(x.accountNo || '').slice(0, 30) : '', ifsc: kind === 'Bank' ? String(x.ifsc || '').slice(0, 15) : '',
    openingBal: ob, openingSide: x.openingSide === 'Cr' ? 'Cr' : 'Dr', active: x.active !== false, remarks: String(x.remarks || '').slice(0, 200) };
  if (x.id) {
    const cur = all.filter(function (a) { return a.id === x.id; })[0]; if (!cur) throw new Error('Account not found.');
    const used = cached_('VoucherLines').some(function (l) { return l.accountId === cur.id; });
    if (used && (cur.type !== rec.type || cur.kind !== rec.kind)) throw new Error('This account already has entries, so its type and cash/bank kind cannot change.');
    if (truthy_(cur.system) && (cur.type !== rec.type || cur.kind !== rec.kind)) throw new Error('System accounts keep their type.');
    if (rec.active === false && used) { const bal = accountList_().filter(function (a) { return a.id === cur.id; })[0].balance; if (Math.abs(bal) > 0.004) throw new Error('Balance must be zero before an account can be deactivated.'); }
    const prev = strip_(cur); updateRow_('Accounts', cur._row, rec); dirty_('Accounts');
    try { checkIntegrity_([], [{ accountId: cur.id, side: 'Dr', amount: 0, date: today_(), partyId: '' }]); } catch (e) { updateRow_('Accounts', cur._row, prev); dirty_('Accounts'); throw new Error('This opening balance would make the history inconsistent: ' + e.message); }
    audit_(u, 'ACCOUNT_UPDATE', 'Account', x.id, { before: prev, after: rec });
    return { id: x.id };
  }
  rec.id = uid_('ac_'); rec.system = false; appendRows_('Accounts', [rec]); audit_(u, 'ACCOUNT_CREATE', 'Account', rec.id, rec);
  return { id: rec.id };
}
function accountDelete_(p, u) {
  const a = accMap_()[p.id]; if (!a) throw new Error('Account not found.');
  if (truthy_(a.system)) throw new Error('System accounts cannot be deleted (you can rename or deactivate them).');
  if (cached_('VoucherLines').some(function (l) { return l.accountId === a.id; })) throw new Error('This account has entries and cannot be deleted. Deactivate it instead.');
  removeRows_('Accounts', [a._row]); audit_(u, 'ACCOUNT_DELETE', 'Account', a.id, { name: a.name }); return true;
}
function partySave_(p, u) {
  const x = p.party || {}, name = String(x.name || '').trim();
  if (!name) throw new Error('Name is required.');
  if (['Donor', 'Grantor', 'Vendor', 'Staff', 'Lender', 'Parent', 'Other'].indexOf(x.type) < 0) throw new Error('Choose a party type.');
  if (x.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.email)) throw new Error('Email looks invalid.');
  if (x.pan && !/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(String(x.pan).trim())) throw new Error('PAN looks invalid (format ABCDE1234F).');
  const rec = { name: name.slice(0, 100), type: x.type, mobile: String(x.mobile || '').slice(0, 20), email: String(x.email || '').trim(), address: String(x.address || '').slice(0, 200), pan: String(x.pan || '').toUpperCase().trim(), notes: String(x.notes || '').slice(0, 200), active: x.active !== false };
  if (x.id) { const cur = idMap_(readAll_('Parties'))[x.id]; if (!cur) throw new Error('Party not found.'); updateRow_('Parties', cur._row, rec); audit_(u, 'PARTY_UPDATE', 'Party', x.id, rec); return { id: x.id }; }
  if (readAll_('Parties').some(function (r) { return String(r.name).toLowerCase() === name.toLowerCase() && r.type === rec.type; })) throw new Error('A ' + rec.type + ' with this name already exists.');
  rec.id = uid_('pt_'); rec.createdAt = now_(); appendRows_('Parties', [rec]); audit_(u, 'PARTY_CREATE', 'Party', rec.id, rec);
  return { id: rec.id };
}
function fundSave_(p, u) {
  const x = p.fund || {}, name = String(x.name || '').trim(); if (!name) throw new Error('Fund name is required.');
  const rec = { name: name.slice(0, 80), kind: x.kind === 'Restricted' ? 'Restricted' : 'Unrestricted', partyId: x.partyId || '', purpose: String(x.purpose || '').slice(0, 200), startDate: String(x.startDate || '').slice(0, 10), endDate: String(x.endDate || '').slice(0, 10), active: x.active !== false };
  if (x.id) { const cur = idMap_(readAll_('Funds'))[x.id]; if (!cur) throw new Error('Fund not found.'); updateRow_('Funds', cur._row, rec); audit_(u, 'FUND_UPDATE', 'Fund', x.id, rec); return { id: x.id }; }
  rec.id = uid_('fd_'); appendRows_('Funds', [rec]); audit_(u, 'FUND_CREATE', 'Fund', rec.id, rec); return { id: rec.id };
}
function accSettingsSave_(p, u) {
  const v = p.values || {}, s = settings_(), changed = {};
  Object.keys(v).forEach(function (k) {
    if (ACC_SETTING_KEYS.indexOf(k) < 0) return; const val = String(v[k] == null ? '' : v[k]).trim();
    if (/^prefix/.test(k) && !/^[A-Za-z0-9\-]{1,6}$/.test(val)) throw new Error('Prefixes: 1–6 letters, digits or dashes.');
    if (/^next/.test(k)) { if (!/^\d+$/.test(val)) throw new Error('Next numbers must be whole numbers.'); if (num_(val) < num_(s[k])) throw new Error('A voucher counter can only go forward (it would create duplicate numbers).'); }
    if (k === 'booksLockDate') {
      if (val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) throw new Error('Lock date must be a date.');
      if (val > today_()) throw new Error('Lock date cannot be in the future.');
      if (String(s.booksLockDate || '') && val < String(s.booksLockDate)) { if (String(p.reason || '').trim().length < 5) throw new Error('Enter a reason for moving the lock date back (it is recorded in the audit log).'); }
    }
    if (k === 'defaultBankId') { const a = accMap_()[val]; if (!a || a.kind !== 'Bank') throw new Error('Default bank must be a bank account.'); }
    if (k === 'billRequiredAbove' && !(num_(val) >= 0)) throw new Error('Bill threshold must be zero or more.');
    if (k === 'fyStart' && val && !/^\d{2}-\d{2}$/.test(val)) throw new Error('Financial year start must look like 04-01.');
    setSetting_(k, val); changed[k] = val;
  });
  audit_(u, 'ACCOUNT_SETTINGS', 'Settings', '', { changed: changed, reason: p.reason || '' });
  return publicSettings_();
}

/* ------------------------------------------------------------------ */
/* Fee receipts → books                                                */
/* ------------------------------------------------------------------ */
function feeIncomeAccountId_(ftId) { return ftId === 'LATE' ? 'ac_inc_late' : 'ac_fee_' + ftId; }
function ensureFeeIncomeAccounts_(ids) {
  const accs = accMap_(), ft = idMap_(cached_('FeeTypes')), add = [];
  ids.forEach(function (id) {
    const aid = feeIncomeAccountId_(id); if (accs[aid]) return;
    add.push({ id: aid, code: '', name: 'Fee – ' + (ft[id] ? ft[id].name : id), group: 'Fee Income', type: 'Income', kind: 'Other', partyLedger: false, bankName: '', accountNo: '', ifsc: '', openingBal: 0, openingSide: 'Cr', active: true, system: true, remarks: 'Auto-created for this fee type' });
  });
  appendRows_('Accounts', add);
}
function postFeeVoucher_(rec, income, u) {
  ensureFeeIncomeAccounts_(Object.keys(income).filter(function (k) { return k !== 'LATE'; }));
  const lines = [{ accountId: rec.accountId, side: 'Dr', amount: r2_(rec.total) }];
  let crSum = 0; Object.keys(income).forEach(function (k) { lines.push({ accountId: feeIncomeAccountId_(k), side: 'Cr', amount: r2_(income[k]) }); crSum = r2_(crSum + income[k]); });
  if (Math.abs(crSum - r2_(rec.total)) > 0.004) throw new Error('Internal error: fee receipt does not balance (' + crSum + ' vs ' + rec.total + ').');
  const head = { vNo: rec.receiptNo, type: 'FEE', nature: 'Fee', date: rec.date, partyId: '', partyName: rec.studentName + ' (Adm ' + rec.admNo + ')', refNo: rec.bankRef || '', narration: 'Fee receipt – ' + rec.studentName + ', ' + rec.className,
    amount: r2_(rec.total), status: 'ACTIVE', cancelReason: '', updatedBy: u.username, updatedAt: now_() };
  const old = cached_('Vouchers').filter(function (v) { return v.vNo === rec.receiptNo; })[0];
  if (old) {
    removeRows_('VoucherLines', cached_('VoucherLines').filter(function (l) { return String(l.vNo) === rec.receiptNo; }).map(function (l) { return l._row; }));
    head.rev = num_(old.rev) + 1; updateRow_('Vouchers', old._row, head);
  } else { head.rev = 1; head.createdBy = u.username; head.createdAt = now_(); appendRows_('Vouchers', [head]); }
  appendRows_('VoucherLines', lines.map(function (l) { return { id: uid_('vl'), vNo: rec.receiptNo, accountId: l.accountId, side: l.side, amount: l.amount, fundId: '', partyId: '', dueDate: '', memo: '', clearedDate: '' }; }));
  dirtyBooks_();
}
function cancelFeeVoucher_(receiptNo, reason, u) {
  const v = cached_('Vouchers').filter(function (x) { return x.vNo === receiptNo; })[0];
  if (v) { updateRow_('Vouchers', v._row, { status: 'CANCELLED', cancelReason: reason, updatedBy: u.username, updatedAt: now_() }); dirtyBooks_(); }
}

/* ------------------------------------------------------------------ */
/* Vouchers                                                            */
/* ------------------------------------------------------------------ */
function normVoucher_(v) {
  const type = v.type; if (!NATURES[type]) throw new Error('Invalid voucher type.');
  const nature = v.nature || NATURES[type][0]; if (NATURES[type].indexOf(nature) < 0) throw new Error('Invalid purpose for a ' + type.toLowerCase() + ' voucher.');
  const date = String(v.date || today_()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date.');
  if (date > today_()) throw new Error('Voucher date cannot be in the future.');
  const accs = accMap_(), funds = idMap_(cached_('Funds')), parties = idMap_(cached_('Parties'));
  const party = v.partyId ? parties[v.partyId] : null; if (v.partyId && !party) throw new Error('Party not found.');
  const lines = (v.lines || []).map(function (l) { return { accountId: String(l.accountId || ''), side: l.side === 'Cr' ? 'Cr' : (l.side === 'Dr' ? 'Dr' : ''), amount: r2_(num_(l.amount)), fundId: String(l.fundId || ''), dueDate: String(l.dueDate || '').slice(0, 10), memo: String(l.memo || '').slice(0, 200) }; })
    .filter(function (l) { return l.accountId || l.amount; });
  if (lines.length < 2) throw new Error('A voucher needs at least two lines.');
  let dr = 0, cr = 0;
  lines.forEach(function (l) {
    const a = accs[l.accountId]; if (!a || !truthy_(a.active)) throw new Error('Choose an active account on every line.');
    if (!l.side) throw new Error('Every line needs Dr or Cr.'); if (!(l.amount > 0)) throw new Error('Every line needs an amount above zero.');
    if (l.fundId && !funds[l.fundId]) throw new Error('Unknown fund.');
    if (l.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(l.dueDate)) throw new Error('Invalid due date.');
    if (l.side === 'Dr') dr = r2_(dr + l.amount); else cr = r2_(cr + l.amount);
  });
  if (Math.abs(dr - cr) > 0.004) throw new Error('The voucher does not balance: debits ' + money_(dr) + ' ≠ credits ' + money_(cr) + '.');
  const cashSide = { Dr: [], Cr: [] }, otherSide = { Dr: [], Cr: [] };
  lines.forEach(function (l) { (isCashBank_(accs[l.accountId]) ? cashSide : otherSide)[l.side].push(l); });
  const nCash = cashSide.Dr.length + cashSide.Cr.length;
  if (type === 'RECEIPT') { if (cashSide.Cr.length || !cashSide.Dr.length || otherSide.Dr.length) throw new Error('A receipt must debit cash/bank and credit income, fund or liability accounts.'); }
  else if (type === 'PAYMENT') { if (cashSide.Dr.length || !cashSide.Cr.length || otherSide.Cr.length) throw new Error('A payment must credit cash/bank and debit expense, asset or liability accounts.'); }
  else if (type === 'CONTRA') { if (nCash !== lines.length) throw new Error('A transfer must only involve cash and bank accounts.'); if (lines.some(function (l) { return lines.some(function (m) { return m !== l && m.accountId === l.accountId; }); })) throw new Error('Choose two different accounts for a transfer.'); }
  else if (type === 'JOURNAL') { if (nCash) throw new Error('Journal entries cannot touch cash or bank accounts – use a receipt, payment or transfer so the cash book stays accurate.'); }
  const needParty = ['Donation', 'Grant', 'Liability', 'Liability return', 'Reimbursement'].indexOf(nature) >= 0;
  if (needParty && !party) throw new Error('Select the ' + (nature === 'Donation' ? 'donor' : nature === 'Grant' ? 'grantor' : nature === 'Liability' ? 'lender / depositor' : nature === 'Reimbursement' ? 'person being reimbursed' : 'party') + '.');
  if (nature === 'Donation') otherSide.Cr.forEach(function (l) { if (['Income', 'Fund'].indexOf(accs[l.accountId].type) < 0) throw new Error('Donations must be credited to an income or fund account.'); });
  if (nature === 'Grant') otherSide.Cr.forEach(function (l) { if (['Income', 'Liability', 'Fund'].indexOf(accs[l.accountId].type) < 0) throw new Error('Grants must be credited to an income, liability (if refundable) or fund account.'); if (!l.fundId) throw new Error('Tag every grant line with a fund so utilisation can be tracked.'); });
  if (nature === 'Liability') otherSide.Cr.forEach(function (l) { const a = accs[l.accountId]; if (a.type !== 'Liability' || !truthy_(a.partyLedger)) throw new Error('Liabilities to be returned must use a liability account that tracks parties (e.g. Refundable Deposits, Loans).'); });
  if (nature === 'Liability return') otherSide.Dr.forEach(function (l) { const a = accs[l.accountId]; if (a.type !== 'Liability' || !truthy_(a.partyLedger)) throw new Error('Returns must be debited to a liability account that tracks parties.'); });
  return { type: type, nature: nature, date: date, party: party, lines: lines, total: dr };
}
function nextVNo_(type) {
  const s = settings_(), pfx = VTYPE[type], key = 'next' + pfx, pre = s['prefix' + pfx] || (pfx + '-');
  const n = num_(s[key]) || 1, vNo = pre + ('00000' + n).slice(-Math.max(5, String(n).length));
  if (cached_('Vouchers').some(function (x) { return x.vNo === vNo; })) throw new Error('Voucher number ' + vNo + ' is already used – raise the counter in Accounts → Settings.');
  setSetting_(key, String(n + 1)); return vNo;
}
function voucherFiles_(vNo, includeDeleted) {
  return readAll_('Files').filter(function (f) { return f.kind === 'VOUCHER_ATT' && String(f.refId) === String(vNo) && (includeDeleted || !truthy_(f.deleted)); });
}
function voucherSave_(p, u) {
  const v = p.voucher || {}; if (v.type === 'FEE') throw new Error('Fee receipts are created and edited in Fee Collection.');
  const editing = !!v.vNo; if (editing && !can_(u, 'accounts.edit')) throw new Error('You do not have permission to edit vouchers.');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  let vNo;
  try {
    _memo = {};
    let old = null;
    if (editing) {
      old = cached_('Vouchers').filter(function (x) { return x.vNo === v.vNo; })[0];
      if (!old) throw new Error('Voucher not found.'); if (old.type === 'FEE') throw new Error('Edit fee receipts from Fee Collection.');
      if (old.status !== 'ACTIVE') throw new Error('Cancelled vouchers cannot be edited.'); if (old.type !== v.type) throw new Error('The voucher type cannot be changed.');
      assertUnlocked_(old.date); assertNotReconciled_(old.vNo);
    }
    const n = normVoucher_(v); assertUnlocked_(n.date);
    const partyId = n.party ? n.party.id : '';
    // attachments
    const existing = old ? voucherFiles_(old.vNo) : [], removeIds = p.removeFileIds || [];
    removeIds.forEach(function (fid) { if (!existing.some(function (f) { return f.fileId === fid; })) throw new Error('Attachment not found.'); });
    (p.newFiles || []).forEach(checkUpload_); // validate every file BEFORE anything is written
    const remaining = existing.length - removeIds.length + (p.newFiles || []).length;
    const threshold = num_(settings_().billRequiredAbove);
    let noBill = String(v.noBillReason || '').trim();
    if (n.type === 'PAYMENT' && BILL_NATURES.indexOf(n.nature) >= 0 && threshold > 0 && n.total >= threshold && remaining === 0 && noBill.length < 5) throw new Error('Attach a photo of the bill/invoice (payments of ' + money_(threshold) + ' or more need one), or enter the reason no bill is available.');
    if (remaining > 0) noBill = '';
    // integrity (cash never negative, refunds never above what was received…)
    checkIntegrity_(old ? [old.vNo] : [], n.lines.map(function (l) { return { accountId: l.accountId, side: l.side, amount: l.amount, date: n.date, partyId: partyId }; }));
    vNo = old ? old.vNo : nextVNo_(n.type);
    const before = old ? { voucher: strip_(old), lines: cached_('VoucherLines').filter(function (l) { return String(l.vNo) === vNo; }).map(strip_) } : null;
    const head = { vNo: vNo, type: n.type, nature: n.nature, date: n.date, partyId: partyId, partyName: n.party ? n.party.name : '', refNo: String(v.refNo || '').slice(0, 60), narration: String(v.narration || '').slice(0, 300), amount: n.total,
      status: 'ACTIVE', cancelReason: '', noBillReason: noBill.slice(0, 200), emailTo: String(v.emailTo || (n.party ? n.party.email : '') || '').trim(), updatedBy: u.username, updatedAt: now_() };
    if (old) { removeRows_('VoucherLines', cached_('VoucherLines').filter(function (l) { return String(l.vNo) === vNo; }).map(function (l) { return l._row; })); head.rev = num_(old.rev) + 1; updateRow_('Vouchers', old._row, head); }
    else { head.rev = 1; head.createdBy = u.username; head.createdAt = now_(); head.emailStatus = ''; appendRows_('Vouchers', [head]); }
    appendRows_('VoucherLines', n.lines.map(function (l) { return { id: uid_('vl'), vNo: vNo, accountId: l.accountId, side: l.side, amount: l.amount, fundId: l.fundId, partyId: partyId, dueDate: l.dueDate, memo: l.memo, clearedDate: '' }; }));
    dirtyBooks_();
    const ym = n.date.slice(0, 4), mm = n.date.slice(0, 7);
    removeIds.forEach(function (fid) { retireFile_(fid); });
    (p.newFiles || []).forEach(function (f) { saveUpload_(f, 'VOUCHER_ATT', vNo, u, ['Bills', ym, mm]); });
    audit_(u, old ? 'VOUCHER_EDIT' : 'VOUCHER_CREATE', 'Voucher', vNo, old ? { before: before, after: { voucher: head, lines: n.lines }, removedFiles: removeIds } : { type: n.type, nature: n.nature, amount: n.total, party: head.partyName, files: (p.newFiles || []).length });
  } finally { lock.releaseLock(); }
  return finalizeVoucher_(vNo, !!p.sendEmail, v.emailTo);
}
function voucherData_(vNo) {
  const v = cached_('Vouchers').filter(function (x) { return x.vNo === vNo; })[0]; if (!v) throw new Error('Voucher not found.');
  const accs = accMap_(), funds = idMap_(cached_('Funds'));
  const lines = cached_('VoucherLines').filter(function (l) { return String(l.vNo) === vNo; }).map(function (l) { const a = accs[l.accountId] || {}; return { id: l.id, accountId: l.accountId, accountName: a.name || l.accountId, group: a.group, type: a.type, side: l.side, amount: num_(l.amount), fundId: l.fundId, fundName: funds[l.fundId] ? funds[l.fundId].name : '', dueDate: l.dueDate, memo: l.memo, clearedDate: l.clearedDate }; });
  return { v: v, lines: lines, party: v.partyId ? idMap_(cached_('Parties'))[v.partyId] : null, s: settings_(), files: voucherFiles_(vNo) };
}
function voucherGet_(p) {
  const d = voucherData_(p.vNo);
  const audit = readAll_('Audit').filter(function (a) { return a.entity === 'Voucher' && String(a.entityId) === p.vNo || (a.entity === 'Receipt' && String(a.entityId) === p.vNo); }).map(strip_).reverse().slice(0, 30);
  return { voucher: strip_(d.v), lines: d.lines, party: d.party ? strip_(d.party) : null, files: d.files.map(strip_), audit: audit };
}
function voucherList_(p) {
  const q = String(p.q || '').toLowerCase().trim(), acc = accMap_();
  const att = {}; readAll_('Files').forEach(function (f) { if (f.kind === 'VOUCHER_ATT' && !truthy_(f.deleted)) att[f.refId] = (att[f.refId] || 0) + 1; });
  const touching = {}; if (p.accountId) cached_('VoucherLines').forEach(function (l) { if (l.accountId === p.accountId) touching[l.vNo] = 1; });
  const thr = num_(settings_().billRequiredAbove);
  let list = cached_('Vouchers').filter(function (v) {
    if (p.type && v.type !== p.type) return false; if (p.nature && v.nature !== p.nature) return false;
    if (p.from && v.date < p.from) return false; if (p.to && v.date > p.to) return false;
    if (p.partyId && v.partyId !== p.partyId) return false;
    if (p.status && p.status !== 'all' && v.status !== p.status) return false;
    if (p.accountId && !touching[v.vNo]) return false;
    if (p.missingBill && !(v.type === 'PAYMENT' && v.status === 'ACTIVE' && BILL_NATURES.indexOf(v.nature) >= 0 && num_(v.amount) >= thr && !att[v.vNo])) return false;
    if (!q) return true;
    return [v.vNo, v.narration, v.partyName, v.refNo, v.nature].some(function (x) { return String(x).toLowerCase().indexOf(q) >= 0; });
  });
  list.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.vNo).localeCompare(String(a.vNo)); });
  return { total: list.length, rows: list.slice(0, num_(p.limit) || 300).map(function (v) { const o = strip_(v); o.attachments = att[v.vNo] || 0; return o; }) };
}
function voucherCancel_(p, u) {
  if (String(p.reason || '').trim().length < 3) throw new Error('Cancellation reason is required.');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    _memo = {};
    const v = cached_('Vouchers').filter(function (x) { return x.vNo === p.vNo; })[0]; if (!v) throw new Error('Voucher not found.');
    if (v.type === 'FEE') throw new Error('Cancel fee receipts from the Receipts page.'); if (v.status !== 'ACTIVE') throw new Error('Already cancelled.');
    assertUnlocked_(v.date); assertNotReconciled_(v.vNo);
    checkIntegrity_([v.vNo], []);
    updateRow_('Vouchers', v._row, { status: 'CANCELLED', cancelReason: p.reason, updatedBy: u.username, updatedAt: now_(), rev: num_(v.rev) + 1 }); dirtyBooks_();
    audit_(u, 'VOUCHER_CANCEL', 'Voucher', v.vNo, { reason: p.reason, amount: v.amount });
  } finally { lock.releaseLock(); }
  return finalizeVoucher_(p.vNo, false);
}
function voucherAttach_(p, u) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    _memo = {};
    const v = cached_('Vouchers').filter(function (x) { return x.vNo === p.vNo; })[0]; if (!v) throw new Error('Voucher not found.');
    if (v.status !== 'ACTIVE') throw new Error('Cannot attach to a cancelled voucher.');
    if ((p.removeFileIds || []).length) { if (!can_(u, 'accounts.edit')) throw new Error('You do not have permission to remove attachments.'); assertUnlocked_(v.date); }
    const existing = voucherFiles_(v.vNo);
    (p.removeFileIds || []).forEach(function (fid) { if (!existing.some(function (f) { return f.fileId === fid; })) throw new Error('Attachment not found.'); retireFile_(fid); });
    const ym = String(v.date).slice(0, 4), mm = String(v.date).slice(0, 7);
    (p.files || []).forEach(checkUpload_);
    (p.files || []).forEach(function (f) { saveUpload_(f, 'VOUCHER_ATT', v.vNo, u, ['Bills', ym, mm]); });
    if ((p.files || []).length && String(v.noBillReason || '')) updateRow_('Vouchers', v._row, { noBillReason: '' });
    dirtyBooks_();
    audit_(u, 'VOUCHER_ATTACH', 'Voucher', v.vNo, { added: (p.files || []).length, removed: (p.removeFileIds || []).length });
  } finally { lock.releaseLock(); }
  return { files: voucherFiles_(p.vNo).map(strip_) };
}

function voucherTitle_(v) {
  if (v.type === 'RECEIPT') return { Donation: 'DONATION RECEIPT / ਦਾਨ ਰਸੀਦ', Grant: 'GRANT RECEIPT / ਗ੍ਰਾਂਟ ਰਸੀਦ', Liability: 'RECEIPT OF REFUNDABLE DEPOSIT / LOAN', 'Other income': 'RECEIPT / ਰਸੀਦ' }[v.nature] || 'RECEIPT';
  return { PAYMENT: 'PAYMENT VOUCHER / ਭੁਗਤਾਨ ਵਾਊਚਰ', CONTRA: 'TRANSFER (CONTRA) VOUCHER', JOURNAL: 'JOURNAL VOUCHER' }[v.type] || 'VOUCHER';
}
function voucherHtml_(d) {
  const v = d.v, s = d.s, cur = esc_(s.currency || '₹'), cancelled = v.status === 'CANCELLED', isRc = v.type === 'RECEIPT', party = d.party || {};
  const rows = d.lines.map(function (l) { return '<tr><td>' + esc_(l.accountName) + (l.memo ? '<br><span class="m">' + esc_(l.memo) + '</span>' : '') + (l.dueDate ? '<br><span class="m">Due for return: ' + esc_(l.dueDate) + '</span>' : '') + '</td><td>' + esc_(l.fundName) + '</td><td class="r">' + (l.side === 'Dr' ? Number(l.amount).toFixed(2) : '') + '</td><td class="r">' + (l.side === 'Cr' ? Number(l.amount).toFixed(2) : '') + '</td></tr>'; }).join('');
  const files = d.files.map(function (f) { return esc_(f.name); });
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'body{font-family:"Noto Sans Gurmukhi","Noto Sans",Arial,sans-serif;color:#1a1a1a;font-size:12px;margin:0;padding:24px;position:relative}.h{text-align:center;border-bottom:2px solid #1f3a8a;padding-bottom:8px;margin-bottom:10px}.h h1{margin:0;font-size:20px;color:#1f3a8a}.h p{margin:2px 0;color:#444}' +
    '.t{text-align:center;font-size:14px;font-weight:bold;margin:8px 0}table{width:100%;border-collapse:collapse}.meta td{padding:3px 4px;vertical-align:top}.grid th{background:#eef2ff;text-align:left;border:1px solid #c7d2fe;padding:5px}.grid td{border:1px solid #d9d9e3;padding:5px;vertical-align:top}' +
    '.r{text-align:right}.tot td{font-weight:bold;background:#f7f7fb}.m{color:#666;font-size:10px}.sig{margin-top:46px}.sig td{width:33%;text-align:center;border-top:1px solid #999;padding-top:4px;font-size:11px}.ft{margin-top:14px;color:#666;font-size:10px;text-align:center}' +
    '.wm{position:absolute;top:38%;left:12%;font-size:80px;color:rgba(200,0,0,.18);transform:rotate(-25deg);font-weight:bold}</style></head><body>' + (cancelled ? '<div class="wm">CANCELLED</div>' : '') +
    '<div class="h"><h1>' + esc_(s.schoolName) + '</h1>' + (s.schoolNameLocal ? '<div>' + esc_(s.schoolNameLocal) + '</div>' : '') + '<p>' + esc_(s.address) + '</p><p>' + [s.phone, s.email, s.panNo ? 'PAN: ' + s.panNo : '', s.regNo80G ? '80G/12A: ' + s.regNo80G : ''].filter(String).map(esc_).join(' · ') + '</p></div>' +
    '<div class="t">' + esc_(voucherTitle_(v)) + '</div>' +
    '<table class="meta"><tr><td><b>Voucher No:</b> ' + esc_(v.vNo) + '</td><td class="r"><b>Date / ਮਿਤੀ:</b> ' + esc_(v.date) + '</td></tr>' +
    (v.partyName ? '<tr><td><b>' + (isRc ? 'Received from / ਪ੍ਰਾਪਤ ਕਰਤਾ' : 'Paid to / ਭੁਗਤਾਨ') + ':</b> ' + esc_(v.partyName) + '</td><td class="r">' + (party.pan ? '<b>PAN:</b> ' + esc_(party.pan) : '') + '</td></tr>' : '') +
    (party.address ? '<tr><td colspan="2"><b>Address:</b> ' + esc_(party.address) + '</td></tr>' : '') +
    '<tr><td><b>Purpose:</b> ' + esc_(v.nature) + '</td><td class="r">' + (v.refNo ? '<b>Ref / Cheque / UTR:</b> ' + esc_(v.refNo) : '') + '</td></tr></table><br>' +
    '<table class="grid"><tr><th>Account / Particulars</th><th>Fund</th><th class="r">Debit (' + cur + ')</th><th class="r">Credit (' + cur + ')</th></tr>' + rows + '<tr class="tot"><td colspan="2" class="r">Total</td><td class="r">' + Number(v.amount).toFixed(2) + '</td><td class="r">' + Number(v.amount).toFixed(2) + '</td></tr></table>' +
    '<p><b>Amount in words:</b> ' + esc_(words_(num_(v.amount))) + '</p>' + (v.narration ? '<p><b>Narration:</b> ' + esc_(v.narration) + '</p>' : '') +
    (isRc && v.nature === 'Liability' ? '<p><b>Note:</b> This amount is a refundable liability and will be returned as agreed' + (d.lines.some(function (l) { return l.dueDate; }) ? ' (due ' + esc_(d.lines.filter(function (l) { return l.dueDate; })[0].dueDate) + ')' : '') + '.</p>' : '') +
    (v.type === 'PAYMENT' ? '<p class="m">Attachments: ' + (files.length ? files.join(', ') : (v.noBillReason ? 'none – ' + esc_(v.noBillReason) : 'none')) + '</p>' : '') +
    (cancelled ? '<p style="color:#b00020"><b>CANCELLED:</b> ' + esc_(v.cancelReason) + '</p>' : '') +
    (isRc ? '<div style="margin-top:44px;text-align:right">' + esc_(s.signatory) + '</div><div class="ft">' + esc_(s.donationFooter) + '</div>' : '<table class="sig"><tr><td>Prepared by (' + esc_(v.createdBy) + ')</td><td>Approved by</td><td>' + (v.type === 'PAYMENT' ? 'Received by' : 'Checked by') + '</td></tr></table>') +
    '<div class="ft">Generated ' + esc_(now_().replace('T', ' ')) + (num_(v.rev) > 1 ? ' · Revision ' + esc_(v.rev) : '') + '</div></body></html>';
}
function finalizeVoucher_(vNo, sendEmail, emailTo) {
  _memo = {};
  const d = voucherData_(vNo), v = d.v;
  const blob = htmlToPdf_(voucherHtml_(d), vNo);
  const ym = String(v.date).slice(0, 4), mm = String(v.date).slice(0, 7);
  const file = driveFolder_(['Vouchers', ym, mm]).createFile(blob);
  if (v.pdfFileId) { try { DriveApp.getFileById(v.pdfFileId).setTrashed(true); } catch (e) { /* gone */ } retireFile_(v.pdfFileId); }
  updateRow_('Vouchers', v._row, { pdfFileId: file.getId() });
  registerFile_(file.getId(), 'VOUCHER_PDF', vNo, vNo + '.pdf', 'application/pdf', 0, null);
  let status = v.emailStatus || '';
  if (sendEmail && v.status === 'ACTIVE' && v.type === 'RECEIPT') {
    const to = String(emailTo || v.emailTo || (d.party && d.party.email) || '').trim();
    try {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error('No valid email address');
      const s = d.s, map = { school: s.schoolName, party: v.partyName, vNo: vNo, amount: s.currency + ' ' + Number(v.amount).toFixed(2), date: v.date, nature: v.nature };
      const fill = function (t, enc) { return String(t).replace(/\{\{(\w+)\}\}/g, function (m, k) { return String(map[k] == null ? '' : map[k]).replace(/[\r\n]+/g, enc ? ' ' : '\n'); }); };
      MailApp.sendEmail({ to: to, subject: fill(s.donationEmailSubject, true), htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">' + esc_(fill(s.donationEmailBody)).replace(/\n/g, '<br>') + '</div>', attachments: [blob], name: s.schoolName || 'School', replyTo: s.email || undefined });
      status = 'SENT'; updateRow_('Vouchers', v._row, { emailTo: to, emailStatus: 'SENT', emailAt: now_() });
    } catch (e) { status = 'FAILED: ' + String(e.message).slice(0, 120); updateRow_('Vouchers', v._row, { emailTo: to, emailStatus: status, emailAt: now_() }); }
  }
  dirtyBooks_();
  return { vNo: vNo, pdfFileId: file.getId(), emailStatus: status, amount: v.amount };
}
function voucherResend_(p, u) {
  const v = cached_('Vouchers').filter(function (x) { return x.vNo === p.vNo; })[0]; if (!v) throw new Error('Voucher not found.');
  if (v.type !== 'RECEIPT' || v.status !== 'ACTIVE') throw new Error('Only active receipts can be emailed.');
  const r = finalizeVoucher_(p.vNo, true, p.emailTo); audit_(u, 'VOUCHER_EMAIL', 'Voucher', p.vNo, { to: p.emailTo, status: r.emailStatus }); return r;
}

/* ------------------------------------------------------------------ */
/* Bank reconciliation & day close                                     */
/* ------------------------------------------------------------------ */
function reconList_(p) {
  const a = accMap_()[p.accountId]; if (!a || a.kind !== 'Bank') throw new Error('Choose a bank account.');
  const upto = String(p.upto || today_()).slice(0, 10);
  const lines = activeLines_().filter(function (l) { return l.accountId === a.id && l.date <= upto; });
  let book = openSigned_(a); lines.forEach(function (l) { book += drOf_(l); });
  const unc = lines.filter(function (l) { return !l.clearedDate || String(l.clearedDate) > upto; }).sort(function (x, y) { return String(x.date).localeCompare(String(y.date)); });
  const uncNet = unc.reduce(function (s, l) { return s + drOf_(l); }, 0);
  return { account: strip_(a), upto: upto, bookBalance: r2_(book), unclearedNet: r2_(uncNet), expectedStatement: r2_(book - uncNet),
    uncleared: unc.map(function (l) { return { id: l.id, date: l.date, vNo: l.vNo, vtype: l.vtype, party: l.partyName, narration: l.narration, refNo: l.refNo, dr: l.side === 'Dr' ? l.amount : 0, cr: l.side === 'Cr' ? l.amount : 0, clearedDate: l.clearedDate }; }) };
}
function reconMark_(p, u, mark) {
  const ids = (p.ids || []).map(String); if (!ids.length) throw new Error('Select at least one entry.');
  const date = String(p.clearedDate || today_()).slice(0, 10); if (mark && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Enter the bank clearing date.');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    _memo = {}; const accs = accMap_(), vs = idMap_(cached_('Vouchers'), 'vNo'); let n = 0;
    cached_('VoucherLines').forEach(function (l) {
      if (ids.indexOf(String(l.id)) < 0) return; const a = accs[l.accountId], v = vs[l.vNo];
      if (!a || a.kind !== 'Bank' || !v || v.status !== 'ACTIVE') throw new Error('Only active bank entries can be reconciled.');
      if (mark && date < String(v.date)) throw new Error('Clearing date cannot be before the entry date (' + v.date + ').');
      updateRow_('VoucherLines', l._row, { clearedDate: mark ? date : '' }); n++;
    });
    dirtyBooks_(); audit_(u, mark ? 'RECON_MARK' : 'RECON_UNMARK', 'Bank', p.accountId || '', { count: n, date: mark ? date : '' });
    return { updated: n };
  } finally { lock.releaseLock(); }
}
function reconSave_(p, u) {
  const r = reconList_({ accountId: p.accountId, upto: p.asOn });
  const st = num_(p.statementBal), diff = r2_(st - r.expectedStatement);
  appendRows_('Recons', [{ id: uid_('rc'), accountId: p.accountId, asOn: r.upto, statementBal: st, bookBal: r.bookBalance, unclearedNet: r.unclearedNet, diff: diff, by: u.username, at: now_() }]);
  audit_(u, 'RECON_SAVE', 'Bank', p.accountId, { asOn: r.upto, statement: st, diff: diff });
  return { diff: diff, reconciled: Math.abs(diff) < 0.005 };
}
function dayCloseSave_(p, u) {
  const a = accMap_()[p.accountId]; if (!a || a.kind !== 'Cash') throw new Error('Choose a cash account.');
  const date = String(p.date || today_()).slice(0, 10); if (date > today_()) throw new Error('Date cannot be in the future.');
  let book = openSigned_(a); activeLines_().forEach(function (l) { if (l.accountId === a.id && l.date <= date) book += drOf_(l); });
  book = r2_(book); const counted = r2_(num_(p.counted)), diff = r2_(counted - book);
  if (Math.abs(diff) > 0.004 && String(p.notes || '').trim().length < 3) throw new Error('Cash counted (' + money_(counted) + ') differs from the books (' + money_(book) + ') by ' + money_(diff) + '. Enter a note explaining the difference.');
  appendRows_('DayClose', [{ id: uid_('dc'), date: date, accountId: a.id, book: book, counted: counted, diff: diff, notes: String(p.notes || '').slice(0, 200), by: u.username, at: now_() }]);
  audit_(u, 'DAY_CLOSE', 'Cash', a.id, { date: date, book: book, counted: counted, diff: diff });
  return { book: book, counted: counted, diff: diff };
}
