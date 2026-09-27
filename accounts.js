/* School ERP – Accounts screens (vouchers, donations/grants/liabilities, bank & cash, reports, chart of accounts). Loaded after app.js. */
(function () {
'use strict';
const X = window.ERP; if (!X) return;
const { S, $, $$, e, v, fld, inp, chk, opt, pill, spinner, table, modal, ask, askText, toast, run, api, money, cm, today, can, csv, download, debounce, emailOk, VIEWS, NAV, openFile, attachBox } = X;

/* ---------- labels, navigation ---------- */
Object.assign(X.T.en, { campus: 'Campus', accsec: 'Accounts', gate: 'Gate Pass', accounts: 'Accounts Overview', vouchers: 'Vouchers', parties: 'Donors & Parties', liabilities: 'Liabilities', bank: 'Bank & Cash', accreports: 'Accounts Reports', chart: 'Chart & Books Settings' });
Object.assign(X.T.pa, { campus: 'ਕੈਂਪਸ', accsec: 'ਲੇਖਾ', gate: 'ਗੇਟ ਪਾਸ', accounts: 'ਲੇਖਾ ਸਾਰ', vouchers: 'ਵਾਊਚਰ', parties: 'ਦਾਨੀ ਤੇ ਪਾਰਟੀਆਂ', liabilities: 'ਦੇਣਦਾਰੀਆਂ', bank: 'ਬੈਂਕ ਤੇ ਨਕਦ', accreports: 'ਲੇਖਾ ਰਿਪੋਰਟਾਂ', chart: 'ਖਾਤਾ ਸੂਚੀ ਤੇ ਸੈਟਿੰਗਾਂ' });
const at = NAV.findIndex(n => n.id === 'setup');
NAV.splice(at < 0 ? NAV.length : at, 0,
  { id: 'gate', ic: '⇥', perm: ['gate.issue', 'gate.verify'], sec: 'campus' },
  { id: 'accounts', ic: '◎', perm: 'accounts.view', sec: 'accsec' }, { id: 'vouchers', ic: '☷', perm: 'accounts.view' }, { id: 'parties', ic: '♥', perm: 'accounts.view' }, { id: 'liabilities', ic: '⇄', perm: 'accounts.view' },
  { id: 'bank', ic: '▣', perm: 'accounts.view' }, { id: 'accreports', ic: '▥', perm: 'accounts.view' }, { id: 'chart', ic: '⚖', perm: 'accounts.manage' });

/* ---------- shared bits ---------- */
const NAT = { RECEIPT: ['Donation', 'Grant', 'Liability', 'Other income'], PAYMENT: ['Expense', 'Reimbursement', 'Liability return', 'Asset purchase', 'Other payment'], CONTRA: ['Transfer'], JOURNAL: ['Adjustment'] };
const TYPE_LBL = { RECEIPT: 'Receipt – money in', PAYMENT: 'Payment – money out', CONTRA: 'Transfer – cash ⇄ bank', JOURNAL: 'Journal – adjustment', FEE: 'Fee receipt' };
const NAT_HELP = { Donation: 'Money given with nothing to return. Choose the donor; an 80G-style receipt is emailed if the donor has an email.', Grant: 'Money from a grant-giver. Every line must be tagged with the fund / project so it can be reported to the grantor.', Liability: 'Money received that MUST be returned later (deposit, loan, refundable grant). It stays on the Liabilities register until returned.', 'Other income': 'Interest, rent, sale of scrap or any other income.',
  Expense: 'Payment for goods or services. Photograph the bill / invoice and attach it.', Reimbursement: 'Paying back a person who spent their own money. Attach their bills.', 'Liability return': 'Returning a deposit / loan / refundable grant received earlier. You cannot return more than is outstanding.', 'Asset purchase': 'Furniture, computers, equipment, etc. Attach the invoice.', 'Other payment': 'Any other payment.', Transfer: 'Cash deposited in the bank, cash withdrawn, or money moved between two bank accounts.', Adjustment: 'A correction between two non-cash accounts (no cash or bank money moves).' };
const NEED_PARTY = ['Donation', 'Grant', 'Liability', 'Liability return', 'Reimbursement'];
const BILL_NAT = ['Expense', 'Reimbursement', 'Asset purchase', 'Other payment'];
const PARTY_TYPES = ['Donor', 'Grantor', 'Vendor', 'Staff', 'Lender', 'Parent', 'Other'];
const dr = n => (n >= 0 ? money(n) + ' Dr' : money(-n) + ' Cr');
const fyStart = (d) => { const md = (S.boot.settings.fyStart || '04-01'), y = +d.slice(0, 4); let x = y + '-' + md; if (x > d) x = (y - 1) + '-' + md; return x; };
let ACCS = [], PARTIES = [], FUNDS = [];
async function loadRef() { const r = await Promise.all([api('accountList'), api('partyList'), api('fundList')]); ACCS = r[0]; PARTIES = r[1].sort((a, b) => a.name.localeCompare(b.name)); FUNDS = r[2]; }
const isCB = a => a.kind === 'Cash' || a.kind === 'Bank';
const accLabel = a => a.name + (a.kind === 'Bank' && a.bankName ? ' – ' + a.bankName : '');
const stPill = s => pill(s, s === 'ACTIVE' ? 'ok' : 'bad');

/* ---------- view a voucher (PDF-style) ---------- */
async function viewVoucher(vNo) {
  const m = modal({ title: vNo, size: 'wide', body: spinner });
  try {
    const [g, html] = await Promise.all([api('voucherGet', { vNo }), api('voucherHtml', { vNo }).catch(() => '')]);
    const vc = g.voucher, act = vc.status === 'ACTIVE' && vc.type !== 'FEE';
    const foot = '<button class="btn" data-close>Close</button>' + (vc.pdfFileId ? '<button class="btn" id="vwPdf">Open PDF</button>' : '') + '<button class="btn" id="vwPrint">Print</button>' +
      (act && vc.type === 'RECEIPT' ? '<button class="btn" id="vwMail">Email</button>' : '') + (act && can('accounts.post') ? '<button class="btn" id="vwAtt">Add bill / proof</button>' : '') + (act && can('accounts.edit') ? '<button class="btn" id="vwEdit">Edit</button>' : '') + (act && can('accounts.cancel') ? '<button class="btn bad" id="vwCancel">Cancel voucher</button>' : '');
    $('.body', m.el).innerHTML = '<div class="tabs"><button class="on" data-tab="0">Voucher</button><button data-tab="1">Bills & proofs (' + g.files.length + ')</button><button data-tab="2">History (' + g.audit.length + ')</button></div>' +
      '<div data-pane="0">' + (html ? '<iframe id="vwF" title="Voucher" style="width:100%;height:58vh;border:1px solid var(--line);border-radius:8px;background:#fff"></iframe>' : '<div class="empty">Preview unavailable.</div>') + '</div>' +
      '<div data-pane="1" class="hide">' + (g.files.length ? '<div class="att">' + g.files.map(f => '<div class="att-i"><div class="att-t" data-vf="' + e(f.fileId) + '">' + (/pdf/.test(f.mime) ? 'PDF' : '🖼') + '</div><div class="sm">' + e(f.name.replace(/^VOUCHER_ATT_[^_]*_/, '').slice(0, 24)) + '</div><button class="btn sm" data-vf="' + e(f.fileId) + '">View</button></div>').join('') + '</div>' : '<div class="empty">No bill or proof attached.' + (vc.noBillReason ? '<br>Reason recorded: <b>' + e(vc.noBillReason) + '</b>' : '') + '</div>') + '</div>' +
      '<div data-pane="2" class="hide">' + table([{ l: 'When', f: r => String(r.at).replace('T', ' ') }, { l: 'User', k: 'user' }, { l: 'Action', k: 'action' }, { l: '', h: r => '<button class="btn sm" data-aud="' + g.audit.indexOf(r) + '">Details</button>' }], g.audit, { empty: 'No history.' }) + '</div>';
    $('.body', m.el).parentElement.insertAdjacentHTML('beforeend', '<footer>' + foot + '</footer>');
    if (html) $('#vwF', m.el).srcdoc = html;
    m.el.addEventListener('click', ev => {
      const tb = ev.target.closest('[data-tab]'); if (tb) { $$('[data-tab]', m.el).forEach(b => b.classList.toggle('on', b === tb)); $$('[data-pane]', m.el).forEach(p => p.classList.toggle('hide', p.dataset.pane !== tb.dataset.tab)); }
      const vf = ev.target.closest('[data-vf]'); if (vf) openFile(vf.dataset.vf, 'Bill / proof for ' + vNo);
    });
    const B = id => $('#' + id, m.el);
    if (B('vwPdf')) B('vwPdf').onclick = () => openFile(vc.pdfFileId, vNo);
    B('vwPrint').onclick = () => { const f = $('#vwF', m.el); if (f) f.contentWindow.print(); };
    if (B('vwMail')) B('vwMail').onclick = () => askText('Email receipt ' + vNo, 'Send to', vc.emailTo || (g.party && g.party.email) || '', true).then(to => { if (to) run(null, async () => { const r = await api('voucherResend', { vNo, emailTo: to }); toast(r.emailStatus === 'SENT' ? 'Email sent.' : r.emailStatus, r.emailStatus === 'SENT' ? 'ok' : 'bad'); }); });
    if (B('vwAtt')) B('vwAtt').onclick = () => attachModal(vNo, () => { m.close(); viewVoucher(vNo); });
    if (B('vwEdit')) B('vwEdit').onclick = () => { m.close(); voucherForm({ vNo }); };
    if (B('vwCancel')) B('vwCancel').onclick = () => askText('Cancel ' + vNo, 'Reason for cancellation (required)', '', true).then(rs => { if (rs) run(null, async () => { await api('voucherCancel', { vNo, reason: rs }); toast('Voucher cancelled – it stays in the books, marked cancelled.', 'ok'); m.close(); refreshCurrent(); }); });
    $('.modal', m.el).addEventListener('click', ev => { const b = ev.target.closest('[data-aud]'); if (b) { const r = g.audit[+b.dataset.aud]; modal({ title: r.action, size: 'wide', body: '<pre style="white-space:pre-wrap;word-break:break-word;font-size:12px;background:var(--surface2);padding:12px;border-radius:8px">' + e((() => { try { return JSON.stringify(JSON.parse(r.detail), null, 2); } catch (z) { return r.detail; } })()) + '</pre>' }); } });
  } catch (x) { $('.body', m.el).innerHTML = '<div class="alert bad">' + e(x.message) + '</div>'; }
}
function attachModal(vNo, done) {
  const m = modal({ title: 'Add bill / proof to ' + vNo, body: '<div id="atBox"></div>', footer: '<button class="btn" data-close>Cancel</button><button class="btn pri" id="atSave">Attach</button>' });
  const box = attachBox($('#atBox', m.el), {});
  $('#atSave', m.el).onclick = ev => run(ev.target, async () => { if (!box.count()) throw new Error('Take or choose at least one photo / file.'); await api('voucherAttach', { vNo, files: box.newFiles() }); m.close(); toast('Attached.', 'ok'); if (done) done(); });
}
function refreshCurrent() { if (VIEWS[S.route]) X.go(S.route); }
X.acts.vview = (a, id) => { if (a.dataset.fee) X.viewReceipt(id); else viewVoucher(id); };
X.acts.vlist = (a, id) => { VL.missing = a.dataset.missing === '1'; X.go('vouchers'); };

/* ---------- party quick form ---------- */
function partyForm(id, done, presetType) {
  const p = id ? PARTIES.find(x => x.id === id) : { type: presetType || 'Donor' };
  const m = modal({ title: id ? 'Edit party' : 'New donor / vendor / lender', size: 'sm', body: '<div class="grid" style="gap:12px">' + fld('Name *', inp('pt_n', p.name || '', 'maxlength="100"')) + fld('Type', '<select id="pt_t">' + PARTY_TYPES.map(t_ => '<option' + (p.type === t_ ? ' selected' : '') + '>' + t_ + '</option>').join('') + '</select>') + fld('Email (receipts are emailed automatically)', inp('pt_e', p.email || '', 'type="email"')) + fld('Mobile', inp('pt_m', p.mobile || '')) + fld('PAN (donors – needed for tax receipts)', inp('pt_p', p.pan || '', 'maxlength="10" style="text-transform:uppercase"')) + fld('Address', '<textarea id="pt_a" rows="2">' + e(p.address || '') + '</textarea>') + fld('Notes', inp('pt_x', p.notes || '')) + '</div>', footer: '<button class="btn" data-close>Cancel</button><button class="btn pri" id="ptSave">Save</button>' });
  $('#ptSave', m.el).onclick = ev => run(ev.target, async () => {
    const r = await api('partySave', { party: { id: id || '', name: v('pt_n'), type: v('pt_t'), email: v('pt_e'), mobile: v('pt_m'), pan: v('pt_p'), address: v('pt_a'), notes: v('pt_x') } });
    PARTIES = await api('partyList'); PARTIES.sort((a, b) => a.name.localeCompare(b.name)); m.close(); toast('Saved.', 'ok'); if (done) done(r.id);
  });
}

/* ---------- voucher form ---------- */
async function voucherForm(o) {
  o = o || {}; const boot = S.boot;
  const m = modal({ title: 'Voucher', size: 'wide', body: spinner, locked: false }); let existing = null;
  try {
    await loadRef();
    if (o.vNo) existing = await api('voucherGet', { vNo: o.vNo });
  } catch (x) { $('.body', m.el).innerHTML = '<div class="alert bad">' + e(x.message) + '</div>'; return; }
  const ev0 = existing ? existing.voucher : null;
  let type = ev0 ? ev0.type : (o.type || 'RECEIPT'), nature = ev0 ? ev0.nature : (o.nature || NAT[type][0]);
  $('h2', m.el).textContent = (ev0 ? 'Edit ' + ev0.vNo : 'New voucher');
  const cbAccs = () => ACCS.filter(a => isCB(a) && (a.active === true || a.active === 'true' || a.id === 'x'));
  const active = a => a.active === true || String(a.active) === 'true';
  const purposeAccs = () => {
    const nc = ACCS.filter(a => active(a) && !isCB(a));
    if (type === 'JOURNAL') return nc;
    if (nature === 'Donation') return nc.filter(a => a.type === 'Income' || a.type === 'Fund');
    if (nature === 'Grant') return nc.filter(a => ['Income', 'Liability', 'Fund'].indexOf(a.type) >= 0);
    if (nature === 'Liability' || nature === 'Liability return') return nc.filter(a => a.type === 'Liability' && (a.partyLedger === true || a.partyLedger === 'true'));
    if (nature === 'Other income') return nc.filter(a => a.type === 'Income');
    if (nature === 'Asset purchase') return nc.filter(a => a.type === 'Asset');
    return nc.filter(a => a.type === 'Expense' || a.type === 'Asset' || a.type === 'Liability');
  };
  const defaultPurpose = () => ({ Donation: 'ac_inc_don', Grant: 'ac_inc_grant', Liability: 'ac_refdep', 'Liability return': 'ac_refdep', 'Other income': 'ac_inc_other', 'Asset purchase': 'ac_fa' }[nature] || '');
  const secDefs = () => type === 'RECEIPT' ? [{ side: 'Dr', title: 'Received in', sub: 'cash / bank account', kind: 'money' }, { side: 'Cr', title: 'Received for', sub: nature === 'Liability' ? 'liability account (tracks who to return it to)' : nature === 'Donation' ? 'donation income / fund' : nature === 'Grant' ? 'grant income / fund – tag the fund' : 'income account', kind: 'purpose' }]
    : type === 'PAYMENT' ? [{ side: 'Cr', title: 'Paid from', sub: 'cash / bank account', kind: 'money' }, { side: 'Dr', title: 'Paid for', sub: nature === 'Liability return' ? 'the liability being returned' : 'expense / asset account', kind: 'purpose' }]
    : type === 'CONTRA' ? [{ side: 'Cr', title: 'From', sub: 'cash / bank account', kind: 'money' }, { side: 'Dr', title: 'To', sub: 'cash / bank account', kind: 'money' }] : [{ side: 'Dr', title: 'Debit', sub: 'account', kind: 'any' }, { side: 'Cr', title: 'Credit', sub: 'account', kind: 'any' }];
  const accOptsFor = (kind, sel) => { const list = kind === 'money' ? cbAccs().filter(active) : kind === 'purpose' ? purposeAccs() : ACCS.filter(a => active(a) && !isCB(a)); return opt(list, 'id', a => accLabel(a) + (isCB(a) ? '  (' + money(a.balance) + ')' : ''), sel, 'Select account'); };
  const rowHtml = (sec, ln) => {
    ln = ln || {}; const isRec = type === 'RECEIPT' && sec.kind === 'purpose', due = type === 'RECEIPT' && nature === 'Liability' && sec.kind === 'purpose';
    return '<div class="vrow" data-side="' + sec.side + '" data-kind="' + sec.kind + '"><select class="va" aria-label="Account">' + accOptsFor(sec.kind, ln.accountId) + '</select>' +
      (isRec ? '<select class="vf" aria-label="Fund / project" title="Fund / project this money belongs to">' + opt(FUNDS.filter(active), 'id', 'name', ln.fundId, nature === 'Grant' ? 'Select fund *' : 'Fund (optional)') + '</select>' : '<input class="vmemo" placeholder="Note (optional)" value="' + e(ln.memo || '') + '" maxlength="120">') +
      '<input class="vm" type="number" min="0" step="0.01" placeholder="Amount" value="' + e(ln.amount || '') + '" aria-label="Amount">' + (due ? '<input class="vd" type="date" title="Date by which this must be returned" value="' + e(ln.dueDate || '') + '">' : '<span></span>') + '<button type="button" class="btn sm" data-vrm aria-label="Remove line">✕</button></div>';
  };
  const drawSecs = (lines) => {
    const defs = secDefs();
    $('#vSecs', m.el).innerHTML = defs.map((sec, i) => {
      let mine = lines ? lines.filter(l => l.side === sec.side) : [];
      if (!mine.length) { mine = [{ accountId: sec.kind === 'money' ? (type === 'CONTRA' && sec.side === 'Dr' ? (cbAccs().find(a => a.kind === 'Bank') || {}).id : (cbAccs().find(a => a.kind === 'Cash') || {}).id) : (sec.kind === 'purpose' ? defaultPurpose() : ''), amount: (o.amount && !lines) ? o.amount : '' }]; if (o.purposeAccountId && sec.kind === 'purpose' && !lines) mine[0].accountId = o.purposeAccountId; }
      return '<div class="card flat mb"><div class="row between"><div><b>' + e(sec.title) + '</b> <span class="muted sm">' + e(sec.sub) + '</span></div><button type="button" class="btn sm" data-vadd="' + sec.side + '" data-kind="' + sec.kind + '">+ Split</button></div><div class="vhead mt"><span>Account</span><span>' + (type === 'RECEIPT' && sec.kind === 'purpose' ? 'Fund / project' : 'Note') + '</span><span>Amount</span><span>' + (type === 'RECEIPT' && nature === 'Liability' && sec.kind === 'purpose' ? 'Return by' : '') + '</span><span></span></div><div data-sec="' + sec.side + '">' + mine.map(l => rowHtml(sec, l)).join('') + '</div></div>';
    }).join('') + '<div id="vBal" class="row between mb"></div>';
    bal();
  };
  const linesNow = () => $$('.vrow', m.el).map(r => ({ accountId: $('.va', r).value, side: r.dataset.side, amount: parseFloat($('.vm', r).value) || 0, fundId: $('.vf', r) ? $('.vf', r).value : '', dueDate: $('.vd', r) ? $('.vd', r).value : '', memo: $('.vmemo', r) ? $('.vmemo', r).value : '' }));
  function bal() {
    const L = linesNow(); let d = 0, c = 0; L.forEach(l => { if (l.side === 'Dr') d += l.amount; else c += l.amount; }); d = Math.round(d * 100) / 100; c = Math.round(c * 100) / 100;
    const ok = d > 0 && Math.abs(d - c) < 0.005, el = $('#vBal', m.el); if (!el) return;
    el.innerHTML = '<div class="' + (ok ? 'bal-ok' : 'bal-bad') + ' b">' + (ok ? '✓ Balanced – ' + cm(d) : d === 0 && c === 0 ? 'Enter the amount' : 'Not balanced: debit ' + money(d) + ' vs credit ' + money(c) + ' (difference ' + money(Math.abs(d - c)) + ')') + '</div>';
    total = d; needBillHint();
  }
  let total = 0, attBox = null;
  const partyOpts = sel => opt(PARTIES, 'id', p => p.name + ' (' + p.type + ')', sel, nature === 'Reimbursement' ? 'Select person' : 'Select …');
  const needParty = () => NEED_PARTY.indexOf(nature) >= 0;
  function needBillHint() {
    const h = $('#vBillHint', m.el); if (!h) return; const thr = parseFloat(boot.settings.billRequiredAbove) || 0;
    const req = type === 'PAYMENT' && BILL_NAT.indexOf(nature) >= 0 && thr > 0 && total >= thr;
    h.innerHTML = req ? '<div class="alert warn">Payments of ' + cm(thr) + ' or more need a photo of the bill / invoice. If there is really none, write the reason below.</div>' : '';
    const nb = $('#vNoBill', m.el); if (nb) nb.closest('label').classList.toggle('hide', type !== 'PAYMENT');
  }
  function head() {
    const showEmail = type === 'RECEIPT' && !ev0 || (ev0 && ev0.type === 'RECEIPT');
    const party = ev0 ? ev0.partyId : (o.partyId || '');
    $('#vHead', m.el).innerHTML = '<div class="form">' +
      fld('Purpose', '<select id="vNat">' + NAT[type].map(n => '<option' + (n === nature ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>') + fld('Date', inp('vDate', ev0 ? ev0.date : today(), 'type="date" max="' + today() + '"')) +
      '<div class="full muted sm" id="vHelp">' + e(NAT_HELP[nature] || '') + '</div>' +
      (type === 'CONTRA' || type === 'JOURNAL' ? '' : '<label class="f' + (needParty() ? '' : '') + '"><span>' + (nature === 'Donation' ? 'Donor *' : nature === 'Grant' ? 'Grantor *' : nature === 'Liability' ? 'Received from (lender / depositor) *' : nature === 'Liability return' ? 'Returned to *' : nature === 'Reimbursement' ? 'Reimbursed to *' : type === 'PAYMENT' ? 'Paid to (vendor / person)' : 'Received from') + '</span><div class="row" style="flex-wrap:nowrap"><select id="vParty" style="flex:1">' + partyOpts(party) + '</select>' + (can('accounts.post') ? '<button type="button" class="btn sm" id="vNewParty">+ New</button>' : '') + '</div></label>') +
      fld('Reference (cheque / UTR / bill no.)', inp('vRef', ev0 ? ev0.refNo : '', 'maxlength="60"')) + fld('Narration', inp('vNarr', ev0 ? ev0.narration : (o.narration || ''), 'maxlength="300" placeholder="What is this for?"'), 'full') + '</div>';
    const ps = $('#vParty', m.el); if (ps) ps.onchange = mailInit;
    const np = $('#vNewParty', m.el); if (np) np.onclick = () => partyForm('', id => { $('#vParty', m.el).innerHTML = partyOpts(id); mailInit(); }, nature === 'Donation' ? 'Donor' : nature === 'Grant' ? 'Grantor' : nature === 'Liability' || nature === 'Liability return' ? 'Lender' : nature === 'Reimbursement' ? 'Staff' : 'Vendor');
    mailInit();
  }
  function mailInit() {
    const box = $('#vMailBox', m.el); if (!box) return; const isRec = (ev0 ? ev0.type : type) === 'RECEIPT';
    box.classList.toggle('hide', !isRec); if (!isRec) return;
    const pid = v('vParty'), p = PARTIES.find(x => x.id === pid), em = p ? p.email : (ev0 ? ev0.emailTo : '');
    $('#vMail', m.el).value = em || ''; $('#vSend', m.el).checked = !ev0 && emailOk(em);
  }
  $('.body', m.el).innerHTML = '<div id="vTypes" class="chips mb"' + (ev0 ? ' style="display:none"' : '') + '>' + ['RECEIPT', 'PAYMENT', 'CONTRA', 'JOURNAL'].map(k => '<span class="chip' + (k === type ? ' on' : '') + '" data-vt="' + k + '" tabindex="0" role="button">' + e(TYPE_LBL[k]) + '</span>').join('') + '</div>' +
    (ev0 ? '<div class="alert mb">Editing <b>' + e(ev0.vNo) + '</b> (revision ' + e(ev0.rev) + '). The voucher number stays the same; the old version is kept in the audit trail.</div>' : '') +
    '<div id="vHead"></div><div id="vSecs" class="mt"></div><div id="vBillHint"></div>' +
    '<div class="card flat mb"><b>Bills, invoices & proofs</b> <span class="muted sm">– photos are compressed and saved in Google Drive against this voucher</span><div id="vAtt" class="mt"></div>' + fld('If there is no bill, reason', inp('vNoBill', ev0 ? ev0.noBillReason : '', 'maxlength="150" placeholder="e.g. Auto-rickshaw fare – no receipt given"'), 'mt') + '</div>' +
    '<div class="card flat" id="vMailBox"><div class="row">' + chk('vSend', 'Email the receipt to the donor / payer automatically', false) + '<input id="vMail" type="email" placeholder="email@example.com" style="max-width:280px"></div><div class="muted sm mt">A PDF copy is always saved in Drive. Emails go out from the school’s Google account.</div></div>';
  m.el.querySelector('.modal').insertAdjacentHTML('beforeend', '<footer><button class="btn" data-close>Cancel</button><button class="btn pri" id="vSave" style="padding:10px 22px">' + (ev0 ? 'Save changes' : 'Save voucher') + '</button></footer>');
  head(); drawSecs(existing ? existing.lines.map(l => ({ accountId: l.accountId, side: l.side, amount: l.amount, fundId: l.fundId, dueDate: l.dueDate, memo: l.memo })) : null);
  attBox = attachBox($('#vAtt', m.el), { existing: existing ? existing.files : [], canRemove: can('accounts.edit') });
  if (o.narration && !ev0) $('#vNarr', m.el).value = o.narration;
  const rebuild = () => { head(); drawSecs(null); };
  m.el.addEventListener('click', ev => {
    const chip = ev.target.closest('[data-vt]'); if (chip && !ev0) { type = chip.dataset.vt; nature = NAT[type][0]; $$('[data-vt]', m.el).forEach(c => c.classList.toggle('on', c === chip)); rebuild(); return; }
    const add = ev.target.closest('[data-vadd]'); if (add) { const side = add.dataset.vadd, sec = secDefs().find(s => s.side === side); $('[data-sec="' + side + '"]', m.el).insertAdjacentHTML('beforeend', rowHtml(sec, {})); return; }
    const rm = ev.target.closest('[data-vrm]'); if (rm) { const host = rm.closest('[data-sec]'); if ($$('.vrow', host).length > 1) { rm.closest('.vrow').remove(); bal(); } else toast('A voucher needs at least one line on each side.', 'bad'); }
  });
  m.el.addEventListener('change', ev => { if (ev.target.id === 'vNat') { nature = ev.target.value; rebuild(); } if (ev.target.closest('.vrow')) bal(); });
  m.el.addEventListener('input', ev => {
    if (!ev.target.classList.contains('vm')) return; bal();
    const rows = $$('.vrow', m.el); if (rows.length === 2 && rows[0].dataset.side !== rows[1].dataset.side) { const other = rows[0] === ev.target.closest('.vrow') ? rows[1] : rows[0]; if (!other.dataset.touched) { $('.vm', other).value = ev.target.value; bal(); } }
    else { /* multi-line: user balances manually */ }
    ev.target.closest('.vrow').dataset.touched = ev.target.closest('.vrow').dataset.touched || '';
  });
  m.el.addEventListener('keydown', ev => { if (ev.target.classList && ev.target.classList.contains('vm')) { const r = ev.target.closest('.vrow'); r.dataset.touched = '1'; } });
  $('#vSave', m.el).onclick = ev => run(ev.target, async () => {
    const L = linesNow().filter(l => l.accountId || l.amount); if (L.length < 2) throw new Error('Add the accounts and the amount.');
    const party = v('vParty'); if (needParty() && !party) throw new Error('Select the ' + (nature === 'Donation' ? 'donor' : nature === 'Grant' ? 'grantor' : nature === 'Reimbursement' ? 'person being reimbursed' : 'party') + '.');
    if (nature === 'Grant' && L.some(l => l.side === 'Cr' && !l.fundId)) throw new Error('Tag every grant line with a fund / project.');
    const voucher = { type: ev0 ? ev0.type : type, nature, date: v('vDate'), partyId: party, refNo: v('vRef'), narration: v('vNarr'), lines: L, noBillReason: v('vNoBill'), emailTo: v('vMail') };
    if (ev0) voucher.vNo = ev0.vNo;
    const send = !!(!$('#vMailBox', m.el).classList.contains('hide') && v('vSend')); if (send && !emailOk(v('vMail'))) throw new Error('Enter a valid email address or untick the email option.');
    if (!(await ask((ev0 ? 'Save changes to ' + ev0.vNo : 'Post this ' + (TYPE_LBL[type] || 'voucher').split(' –')[0].toLowerCase()) + ' of ' + cm(total) + '?', ev0 ? 'Save' : 'Post'))) return;
    const r = await api('voucherSave', { voucher, newFiles: attBox.newFiles(), removeFileIds: attBox.removed(), sendEmail: send });
    m.el.remove(); voucherDone(r);
  });
}
function voucherDone(r) {
  const em = r.emailStatus || '';
  const m = modal({ title: 'Voucher saved', size: 'sm', locked: true, body: '<div class="c"><div style="font-size:42px;color:var(--ok)">✓</div><h2>' + e(r.vNo) + '</h2><div class="tot-big">' + cm(r.amount) + '</div></div><div class="grid mt" style="gap:8px"><div class="alert ok">PDF saved to Drive.</div>' + (em === 'SENT' ? '<div class="alert ok">Receipt emailed.</div>' : em.indexOf('FAILED') === 0 ? '<div class="alert bad">Email not sent – ' + e(em.replace('FAILED: ', '')) + '. You can resend from the voucher.</div>' : '') + '</div>',
    footer: '<button class="btn" id="dView">View / print</button><button class="btn pri" id="dOk">Done</button>' });
  $('#dView', m.el).onclick = () => { m.el.remove(); viewVoucher(r.vNo); refreshCurrent(); };
  $('#dOk', m.el).onclick = () => { m.el.remove(); refreshCurrent(); };
}
X.acts.vnew = a => voucherForm({ type: a.dataset.t, nature: a.dataset.n });
X.acts.vreturn = a => voucherForm({ type: 'PAYMENT', nature: 'Liability return', partyId: a.dataset.p, purposeAccountId: a.dataset.a, amount: a.dataset.amt, narration: 'Return of ' + a.dataset.an });

/* ================= ACCOUNTS OVERVIEW ================= */
VIEWS.accounts = async () => {
  const d = await api('accountsDashboard');
  const P = can('accounts.post');
  $('#view').innerHTML = (d.openingDiff && Math.abs(d.openingDiff) > 0.004 ? '<div class="alert bad mb">Opening balances do not balance (difference ' + cm(Math.abs(d.openingDiff)) + '). Fix them in Chart & Books Settings → Accounts so the Balance Sheet balances.</div>' : '') +
    (d.lockDate ? '<div class="alert mb">🔒 Books are locked up to <b>' + e(d.lockDate) + '</b>. Nothing on or before that date can be added, changed or cancelled.</div>' : '') +
    (P ? '<div class="row mb"><button class="btn pri" data-act="vnew" data-t="RECEIPT" data-n="Donation">+ Donation</button><button class="btn" data-act="vnew" data-t="RECEIPT" data-n="Grant">+ Grant</button><button class="btn" data-act="vnew" data-t="RECEIPT" data-n="Liability">+ Money to be returned</button><button class="btn" data-act="vnew" data-t="PAYMENT" data-n="Expense">− Expense / bill</button><button class="btn" data-act="vnew" data-t="PAYMENT" data-n="Reimbursement">− Reimbursement</button><button class="btn" data-act="vnew" data-t="CONTRA" data-n="Transfer">⇄ Cash ⇄ Bank</button></div>' : '') +
    '<div class="grid g4 kpis mb">' + d.cashBank.map(a => '<div class="card kpi"><div class="l">' + e(a.name) + (a.kind === 'Bank' ? ' <span class="muted">' + e(a.bankName) + '</span>' : '') + '</div><div class="n">' + cm(a.balance) + '</div><div class="muted sm">' + (a.kind === 'Bank' ? (a.unreconciled ? a.unreconciled + ' entries not yet on statement' : 'all reconciled') : 'cash in hand') + '</div></div>').join('') + '</div>' +
    '<div class="grid g4 kpis mb">' + [['Money in this month', cm(d.monthIn), 'today ' + cm(d.todayIn)], ['Money out this month', cm(d.monthOut), 'today ' + cm(d.todayOut)], ['To be returned', cm(d.liabilities), d.liabilityCount + ' open' + (d.overdue ? ' · ' + d.overdue + ' overdue' : '')], ['Bills missing', String(d.missingBills), 'payments without bill or reason']].map((k, i) => '<div class="card kpi"' + (i === 2 ? ' data-go="liabilities" style="cursor:pointer"' : i === 3 ? ' data-act="vlist" data-missing="1" style="cursor:pointer"' : '') + '><div class="l">' + e(k[0]) + '</div><div class="n' + (i === 3 && d.missingBills ? ' bal-bad' : '') + '">' + e(k[1]) + '</div><div class="muted sm">' + e(k[2]) + '</div></div>').join('') + '</div>' +
    '<div class="card"><h2 class="mb">Recent vouchers</h2>' + table([{ l: 'Voucher', h: r => '<a href="#" data-act="vview" data-id="' + e(r.vNo) + '">' + e(r.vNo) + '</a>' }, { l: 'Date', k: 'date' }, { l: 'Purpose', k: 'nature' }, { l: 'Party', k: 'partyName' }, { l: 'Amount', n: 1, f: r => money(r.amount) }, { l: 'Status', h: r => stPill(r.status) }], d.recent, { empty: 'No vouchers yet.' }) + '</div>';
};
document.addEventListener('click', ev => { const a = ev.target.closest('a[data-act]'); if (a) ev.preventDefault(); });

/* ================= VOUCHERS ================= */
const VL = { q: '', type: '', status: 'ACTIVE', from: '', to: '', missing: false, accountId: '' };
VIEWS.vouchers = async () => {
  await loadRef(); const P = can('accounts.post');
  $('#view').innerHTML = '<div class="card"><div class="row mb"><div class="grow" style="min-width:200px"><input id="vq" placeholder="Search voucher no., party, narration, ref…" value="' + e(VL.q) + '"></div>' +
    '<select id="vt" style="width:auto"><option value="">All types</option>' + ['RECEIPT', 'PAYMENT', 'CONTRA', 'JOURNAL', 'FEE'].map(k => '<option value="' + k + '"' + (VL.type === k ? ' selected' : '') + '>' + TYPE_LBL[k] + '</option>').join('') + '</select>' +
    '<select id="vs" style="width:auto">' + [['ACTIVE', 'Active'], ['CANCELLED', 'Cancelled'], ['all', 'All']].map(o => '<option value="' + o[0] + '"' + (VL.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
    '<select id="va" style="width:auto">' + opt(ACCS, 'id', accLabel, VL.accountId, 'Any account') + '</select>' +
    '<input type="date" id="vfrom" style="width:auto" value="' + e(VL.from) + '" title="From"><input type="date" id="vto" style="width:auto" value="' + e(VL.to) + '" title="To">' + chk('vmiss', 'Payments with no bill', VL.missing) + '</div>' +
    (P ? '<div class="row mb"><button class="btn pri" data-act="vnew" data-t="RECEIPT">+ Receipt</button><button class="btn" data-act="vnew" data-t="PAYMENT">+ Payment</button><button class="btn" data-act="vnew" data-t="CONTRA">+ Transfer</button><button class="btn" data-act="vnew" data-t="JOURNAL">+ Journal</button><span class="grow"></span><button class="btn sm" id="vCsv">Export CSV</button></div>' : '<div class="row mb"><span class="grow"></span><button class="btn sm" id="vCsv">Export CSV</button></div>') + '<div id="vList">' + spinner + '</div></div>';
  let rows = [];
  const load = async () => {
    Object.assign(VL, { q: v('vq'), type: v('vt'), status: v('vs'), from: v('vfrom'), to: v('vto'), missing: v('vmiss'), accountId: v('va') });
    const r = await api('voucherList', { q: VL.q, type: VL.type, status: VL.status, from: VL.from, to: VL.to, missingBill: VL.missing, accountId: VL.accountId, limit: 400 }); rows = r.rows;
    $('#vList').innerHTML = '<div class="muted sm mb">' + r.total + ' voucher(s)' + (r.total > rows.length ? ' – showing first ' + rows.length : '') + '</div>' + table([
      { l: 'Voucher', h: x => '<a href="#" data-act="vview" data-id="' + e(x.vNo) + '"' + (x.type === 'FEE' ? ' data-fee="1"' : '') + '><b>' + e(x.vNo) + '</b></a>' + (+x.rev > 1 ? ' <span class="muted sm">rev ' + e(x.rev) + '</span>' : '') }, { l: 'Date', k: 'date' }, { l: 'Type', h: x => e(x.type === 'FEE' ? 'Fee receipt' : x.nature) }, { l: 'Party / narration', h: x => '<b>' + e(x.partyName) + '</b><div class="muted sm">' + e((x.narration || '').slice(0, 70)) + '</div>' },
      { l: 'Amount', n: 1, f: x => money(x.amount) }, { l: 'Bills', h: x => x.type === 'PAYMENT' ? (x.attachments ? pill(x.attachments + ' 📎', 'ok') : x.noBillReason ? '<span title="' + e(x.noBillReason) + '">' + pill('no bill', 'warn') + '</span>' : pill('none')) : '' },
      { l: 'Status', h: x => stPill(x.status) }, { l: '', h: x => '<button class="btn sm" data-act="vview" data-id="' + e(x.vNo) + '"' + (x.type === 'FEE' ? ' data-fee="1"' : '') + '>View</button>' }], rows, { empty: 'No vouchers match.' });
  };
  const dl = debounce(() => run(null, load), 300); $('#vq').oninput = dl; ['vt', 'vs', 'va', 'vfrom', 'vto', 'vmiss'].forEach(i => $('#' + i).onchange = () => run(null, load));
  $('#vCsv').onclick = () => download('vouchers-' + today() + '.csv', csv(rows, [{ k: 'vNo', l: 'Voucher' }, { k: 'date', l: 'Date' }, { k: 'type', l: 'Type' }, { k: 'nature', l: 'Purpose' }, { k: 'partyName', l: 'Party' }, { k: 'narration', l: 'Narration' }, { k: 'refNo', l: 'Ref' }, { k: 'amount', l: 'Amount' }, { k: 'attachments', l: 'Bills attached' }, { k: 'noBillReason', l: 'No-bill reason' }, { k: 'status', l: 'Status' }]));
  await load();
};

/* ================= PARTIES ================= */
const PL = { q: '', type: '' };
VIEWS.parties = async () => {
  await loadRef(); const P = can('accounts.post');
  $('#view').innerHTML = '<div class="card"><div class="row mb"><div class="grow"><input id="pq" placeholder="Search name, PAN, email, mobile…" value="' + e(PL.q) + '"></div><select id="ptype" style="width:auto"><option value="">All types</option>' + PARTY_TYPES.map(t_ => '<option' + (PL.type === t_ ? ' selected' : '') + '>' + t_ + '</option>').join('') + '</select>' + (P ? '<button class="btn pri" id="pAddP">+ New</button>' : '') + '</div><div id="pList"></div></div>';
  const draw = () => {
    PL.q = v('pq').toLowerCase(); PL.type = v('ptype');
    const rows = PARTIES.filter(p => (!PL.type || p.type === PL.type) && (!PL.q || [p.name, p.pan, p.email, p.mobile].some(x => String(x || '').toLowerCase().indexOf(PL.q) >= 0)));
    $('#pList').innerHTML = table([{ l: 'Name', h: p => '<b>' + e(p.name) + '</b>' }, { l: 'Type', h: p => pill(p.type, 'pri') }, { l: 'PAN', k: 'pan' }, { l: 'Email', k: 'email' }, { l: 'Mobile', k: 'mobile' }, { l: '', h: p => '<div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="pstate" data-id="' + e(p.id) + '">Statement</button>' + (P ? '<button class="btn sm" data-act="pedit2" data-id="' + e(p.id) + '">Edit</button>' : '') + '</div>' }], rows, { empty: 'No donors or parties yet – they are created when you post a donation, grant or payment.' });
  };
  $('#pq').oninput = debounce(draw, 200); $('#ptype').onchange = draw; const b = $('#pAddP'); if (b) b.onclick = () => partyForm('', () => VIEWS.parties()); draw();
};
X.acts.pedit2 = (a, id) => partyForm(id, () => VIEWS.parties());
X.acts.pstate = (a, id) => statementModal(id);
async function statementModal(partyId) {
  const p = PARTIES.find(x => x.id === partyId) || { name: '' }; const m = modal({ title: 'Statement – ' + p.name, size: 'wide', body: spinner });
  try { const r = await api('accReport', { name: 'partyStatement', params: { partyId, from: '0000-01-01', to: today() } }); $('.body', m.el).innerHTML = '<div class="row between mb"><span class="muted sm">' + e(r.note || '') + '</span><button class="btn sm" id="stCsv">Export CSV</button></div><div id="stTbl"></div>'; renderReport(r, $('#stTbl', m.el)); $('#stCsv', m.el).onclick = () => download('statement-' + p.name.replace(/\W+/g, '_') + '.csv', csv(r.rows.filter(x => !x._k), r.columns)); }
  catch (x) { $('.body', m.el).innerHTML = '<div class="alert bad">' + e(x.message) + '</div>'; }
}

/* ================= LIABILITIES ================= */
const LB = { kind: 'Liability', settled: false };
VIEWS.liabilities = async () => {
  const r = await api('accReport', { name: 'liabilityRegister', params: { kind: LB.kind, includeSettled: LB.settled } }); const P = can('accounts.post');
  $('#view').innerHTML = '<div class="tabs"><button data-lk="Liability" class="' + (LB.kind === 'Liability' ? 'on' : '') + '">Money to be returned</button><button data-lk="Asset" class="' + (LB.kind === 'Asset' ? 'on' : '') + '">Advances given (to recover)</button></div>' +
    '<div class="card"><div class="row between mb"><div><h2>' + e(r.title) + '</h2><div class="muted sm">Deposits, loans and refundable grants stay here until fully returned. A return can never exceed what is outstanding.</div></div><div class="row">' + chk('lset', 'Show settled', LB.settled) + (P && LB.kind === 'Liability' ? '<button class="btn pri" data-act="vnew" data-t="RECEIPT" data-n="Liability">+ Money received to return</button>' : '') + '</div></div>' +
    table([{ l: 'Party', h: x => '<b>' + e(x.party) + '</b><div class="muted sm">' + e(x.account) + '</div>' }, { l: LB.kind === 'Liability' ? 'Received' : 'Advanced', n: 1, f: x => money(x.given) }, { l: LB.kind === 'Liability' ? 'Returned' : 'Recovered', n: 1, f: x => money(x.back) }, { l: 'Outstanding', n: 1, h: x => '<b>' + money(x.outstanding) + '</b>' }, { l: 'Return by', k: 'due' }, { l: 'Status', h: x => pill(x.status, x.status === 'Overdue' ? 'bad' : x.status === 'Settled' ? 'ok' : 'warn') },
      { l: '', h: x => '<div class="row" style="flex-wrap:nowrap">' + (P && LB.kind === 'Liability' && x.outstanding > 0 ? '<button class="btn sm pri" data-act="vreturn" data-p="' + e(x.partyId) + '" data-a="' + e(x.accountId) + '" data-amt="' + x.outstanding + '" data-an="' + e(x.account) + '">Record return</button>' : '') + (x.partyId ? '<button class="btn sm" data-act="pstate" data-id="' + e(x.partyId) + '">Statement</button>' : '') + '</div>' }], r.rows, { foot: '<td><b>Total</b></td><td class="n">' + money(r.totals.given) + '</td><td class="n">' + money(r.totals.back) + '</td><td class="n"><b>' + money(r.totals.outstanding) + '</b></td><td colspan="3"></td>', empty: 'Nothing outstanding.' }) + '</div>';
  $$('[data-lk]').forEach(b => b.onclick = () => { LB.kind = b.dataset.lk; VIEWS.liabilities(); }); $('#lset').onchange = ev => { LB.settled = ev.target.checked; VIEWS.liabilities(); };
  loadRef();
};

/* ================= BANK & CASH ================= */
const BK = { tab: 'recon', acc: '' };
VIEWS.bank = async () => {
  await loadRef(); const banks = ACCS.filter(a => a.kind === 'Bank'), cash = ACCS.filter(a => a.kind === 'Cash'), tab = BK.tab;
  $('#view').innerHTML = '<div class="tabs">' + [['recon', 'Bank reconciliation'], ['day', 'Cash day-close'], ['bal', 'Balances']].map(k => '<button data-bk="' + k[0] + '" class="' + (k[0] === tab ? 'on' : '') + '">' + k[1] + '</button>').join('') + '</div><div id="bkBody"></div>';
  $$('[data-bk]').forEach(b => b.onclick = () => { BK.tab = b.dataset.bk; VIEWS.bank(); });
  const body = $('#bkBody');
  if (tab === 'bal') { body.innerHTML = '<div class="card"><h2 class="mb">Cash & bank balances</h2>' + table([{ l: 'Account', h: a => '<b>' + e(a.name) + '</b>' }, { l: 'Kind', k: 'kind' }, { l: 'Bank', k: 'bankName' }, { l: 'A/c no.', k: 'accountNo' }, { l: 'IFSC', k: 'ifsc' }, { l: 'Balance (books)', n: 1, f: a => money(a.balance) }], banks.concat(cash)) + '<p class="muted sm mt">Add or edit bank accounts under Chart & Books Settings.</p></div>'; return; }
  if (tab === 'day') {
    const c = cash[0] ? cash[0].id : '', hist = await api('dayCloseList', {});
    body.innerHTML = '<div class="grid g2" style="align-items:start"><div class="card"><h2>Count the cash</h2><p class="muted sm">At the end of the day count the notes and coins and enter the total. The system compares it with the cash book; any difference needs a note and stays on record.</p><div class="grid mt" style="gap:12px">' +
      fld('Cash account', '<select id="dcA">' + opt(cash, 'id', 'name', c) + '</select>') + fld('Date', inp('dcD', today(), 'type="date" max="' + today() + '"')) + '<div id="dcBook" class="muted"></div>' + fld('Cash counted', inp('dcC', '', 'type="number" step="0.01" min="0"')) + fld('Note (required if there is a difference)', inp('dcN', '', 'maxlength="150"')) + '<button class="btn pri" id="dcGo">Save day-close</button></div></div>' +
      '<div class="card"><h2 class="mb">History</h2>' + table([{ l: 'Date', k: 'date' }, { l: 'Books', n: 1, f: r => money(r.book) }, { l: 'Counted', n: 1, f: r => money(r.counted) }, { l: 'Diff', n: 1, h: r => +r.diff ? '<b class="bal-bad">' + money(r.diff) + '</b>' : '0.00' }, { l: 'Note', k: 'notes' }, { l: 'By', k: 'by' }], hist, { empty: 'No day-close yet.' }) + '</div></div>';
    const bookNow = async () => { try { const r = await api('accReport', { name: 'ledger', params: { accountId: v('dcA'), to: v('dcD'), from: '0000-01-01' } }); $('#dcBook').innerHTML = 'Cash book balance at end of day: <b>' + cm(r.totals.bal) + '</b>'; } catch (x) { /* */ } };
    $('#dcA').onchange = bookNow; $('#dcD').onchange = bookNow; bookNow();
    $('#dcGo').onclick = ev => run(ev.target, async () => { if (v('dcC') === '') throw new Error('Enter the cash counted.'); const r = await api('dayCloseSave', { accountId: v('dcA'), date: v('dcD'), counted: v('dcC'), notes: v('dcN') }); toast(Math.abs(r.diff) < 0.005 ? 'Cash agrees with the books ✓' : 'Saved – difference ' + money(r.diff) + ' recorded.', Math.abs(r.diff) < 0.005 ? 'ok' : 'bad'); VIEWS.bank(); });
    return;
  }
  if (!banks.length) { body.innerHTML = '<div class="empty">No bank accounts yet.</div>'; return; }
  if (!banks.some(b => b.id === BK.acc)) BK.acc = banks[0].id;
  body.innerHTML = '<div class="card"><div class="row mb">' + '<select id="rcA" style="width:auto">' + opt(banks, 'id', accLabel, BK.acc) + '</select><label class="row" style="gap:6px">As on <input type="date" id="rcU" value="' + today() + '" max="' + today() + '" style="width:auto"></label><label class="row" style="gap:6px">Bank statement closing balance <input type="number" step="0.01" id="rcS" style="width:150px"></label></div><div id="rcBody">' + spinner + '</div></div>';
  const load = async () => {
    BK.acc = v('rcA'); const r = await api('reconList', { accountId: BK.acc, upto: v('rcU') || today() });
    $('#rcBody').innerHTML = '<div class="grid g4 kpis mb"><div class="card kpi"><div class="l">Balance per books</div><div class="n">' + cm(r.bookBalance) + '</div></div><div class="card kpi"><div class="l">Not yet on statement (net)</div><div class="n">' + cm(r.unclearedNet) + '</div></div><div class="card kpi"><div class="l">Statement should show</div><div class="n">' + cm(r.expectedStatement) + '</div></div><div class="card kpi" id="rcDiff"><div class="l">Difference vs your statement</div><div class="n">—</div></div></div>' +
      '<p class="muted sm">Tick the entries that appear on the bank statement and choose the date the bank cleared them. What remains un-ticked is “in transit” (cheques not yet cleared, etc.).</p><div class="row mb"><input type="date" id="rcD" value="' + (v('rcU') || today()) + '" style="width:auto" title="Cleared on"><button class="btn pri" id="rcMark">Mark ticked as cleared</button><button class="btn" id="rcSave">Save reconciliation</button></div>' +
      table([{ l: '', h: x => '<input type="checkbox" class="rcx" value="' + e(x.id) + '"' + (x.clearedDate ? ' disabled' : '') + '>' }, { l: 'Date', k: 'date' }, { l: 'Voucher', h: x => '<a href="#" data-act="vview" data-id="' + e(x.vNo) + '"' + (x.vtype === 'FEE' ? ' data-fee="1"' : '') + '>' + e(x.vNo) + '</a>' }, { l: 'Party / narration', h: x => e(x.party) + '<div class="muted sm">' + e(x.narration) + '</div>' }, { l: 'Ref', k: 'refNo' }, { l: 'Deposit', n: 1, f: x => x.dr ? money(x.dr) : '' }, { l: 'Withdrawal', n: 1, f: x => x.cr ? money(x.cr) : '' }, { l: 'Cleared', k: 'clearedDate' }], r.uncleared, { empty: 'Every entry up to this date is reconciled.' });
    const upd = () => { const s = v('rcS'); const el = $('#rcDiff .n'); if (s === '') { el.textContent = '—'; el.className = 'n'; return; } const d = Math.round((parseFloat(s) - r.expectedStatement) * 100) / 100; el.textContent = Math.abs(d) < 0.005 ? '✓ Matches' : cm(d); el.className = 'n ' + (Math.abs(d) < 0.005 ? 'bal-ok' : 'bal-bad'); };
    $('#rcS').oninput = upd; upd();
    $('#rcMark').onclick = ev => run(ev.target, async () => { const ids = $$('.rcx:checked').map(c => c.value); if (!ids.length) throw new Error('Tick at least one entry.'); await api('reconMark', { ids, clearedDate: v('rcD'), accountId: BK.acc }); toast(ids.length + ' entries marked cleared.', 'ok'); load(); });
    $('#rcSave').onclick = ev => run(ev.target, async () => { if (v('rcS') === '') throw new Error('Enter the closing balance shown on your bank statement.'); const s = await api('reconSave', { accountId: BK.acc, asOn: v('rcU'), statementBal: v('rcS') }); toast(s.reconciled ? 'Reconciled ✓ – the books agree with the bank.' : 'Saved – difference of ' + money(s.diff) + ' recorded.', s.reconciled ? 'ok' : 'bad'); });
  };
  $('#rcA').onchange = () => run(null, load); $('#rcU').onchange = () => run(null, load); await load();
};

/* ================= REPORTS ================= */
function renderReport(r, host) {
  const cols = r.columns, cell = (c, x) => { const val = x[c.k]; if (val === '' || val === undefined || val === null) return ''; if (c.t === 'money') return money(val); if (c.t === 'drcr') return dr(+val); if (c.t === 'pct') return money(val) + '%'; if (c.k === 'vNo') return '<a href="#" data-act="vview" data-id="' + e(val) + '"' + (x.vtype === 'FEE' || x.type === 'FEE' ? ' data-fee="1"' : '') + '>' + e(val) + '</a>'; return e(val); };
  const num = c => c.t === 'money' || c.t === 'drcr' || c.t === 'pct';
  const body = r.rows.map(x => x._k === 'h' ? '<tr class="hd"><td colspan="' + cols.length + '">' + e(x.name || x.particulars || Object.values(x).filter(z => typeof z === 'string' && z !== 'h')[0] || '') + '</td></tr>' : '<tr' + (x._k === 't' ? ' class="tot"' : x._k === 'ob' ? ' class="tot"' : '') + '>' + cols.map((c, i) => '<td class="' + (num(c) ? 'n' : '') + '">' + (x._k === 'ob' && c.k === 'particulars' ? '<b>Opening balance</b>' : cell(c, x)) + '</td>').join('') + '</tr>').join('');
  const tf = r.totals && Object.keys(r.totals).length ? '<tfoot><tr class="tot">' + cols.map((c, i) => '<td class="' + (num(c) ? 'n' : '') + '">' + (r.totals[c.k] !== undefined ? (c.t === 'drcr' ? dr(+r.totals[c.k]) : c.t === 'money' ? money(r.totals[c.k]) : e(r.totals[c.k])) : (i === 0 ? '<b>Total</b>' : '')) + '</td>').join('') + '</tr></tfoot>' : '';
  host.innerHTML = r.rows.length ? '<div class="tbl-wrap"><table><thead><tr>' + cols.map(c => '<th class="' + (num(c) ? 'n' : '') + '">' + e(c.l) + '</th>').join('') + '</tr></thead><tbody>' + body + '</tbody>' + tf + '</table></div>' : '<div class="empty">No data for these filters.</div>';
}
const AR = {
  trialBalance: ['Trial balance', ['asOn']], balanceSheet: ['Balance sheet', ['asOn']], incomeExpenditure: ['Income & expenditure', ['range', 'fund']], receiptsPayments: ['Receipts & payments', ['range']], daybook: ['Day book (all vouchers)', ['range', 'vtype', 'status']],
  ledger: ['Ledger of an account (cash book / bank book)', ['account', 'range', 'party', 'fund']], donorRegister: ['Donations & grants register', ['range', 'party', 'nature', 'summary']], fundReport: ['Fund / grant utilisation', ['range']],
  liabilityRegister: ['Liabilities to be returned', ['asOn', 'lkind', 'settled']], partyStatement: ['Party statement', ['party', 'range']], auditPack: ['Audit pack – vouchers with evidence status', ['range']], explorer: ['★ Custom report builder', ['explorer']]
};
const RS = { name: 'trialBalance', out: null };
VIEWS.accreports = async () => {
  await loadRef(); const first = fyStart(today());
  $('#view').innerHTML = '<div class="card no-print"><div class="row"><select id="arn" style="width:auto;min-width:280px">' + Object.keys(AR).map(k => '<option value="' + k + '"' + (k === RS.name ? ' selected' : '') + '>' + AR[k][0] + '</option>').join('') + '</select><div id="arp" class="row grow"></div><button class="btn pri" id="arRun">Run report</button></div><div id="arx" class="mt"></div></div><div id="arOut" class="mt"></div>';
  const accSel = (id, ph) => '<select id="' + id + '" style="width:auto;max-width:260px">' + opt(ACCS, 'id', accLabel, '', ph) + '</select>', partySel = '<select id="ap_partyId" style="width:auto;max-width:220px">' + opt(PARTIES, 'id', p => p.name + ' (' + p.type + ')', '', 'All parties') + '</select>', fundSel = '<select id="ap_fundId" style="width:auto">' + opt(FUNDS, 'id', 'name', '', 'All funds') + '</select>';
  const params = () => {
    RS.name = v('arn'); const h = []; $('#arx').innerHTML = '';
    AR[RS.name][1].forEach(p => {
      if (p === 'asOn') h.push('<label class="row" style="gap:6px">As on <input type="date" id="ap_asOn" value="' + today() + '" style="width:auto"></label>');
      if (p === 'range') h.push('<input id="ap_from" type="date" value="' + first + '" style="width:auto"><input id="ap_to" type="date" value="' + today() + '" style="width:auto">');
      if (p === 'account') h.push(accSel('ap_accountId', 'Select account *'));
      if (p === 'party') h.push(partySel); if (p === 'fund') h.push(fundSel);
      if (p === 'vtype') h.push('<select id="ap_type" style="width:auto"><option value="">All types</option>' + ['RECEIPT', 'PAYMENT', 'CONTRA', 'JOURNAL', 'FEE'].map(k => '<option>' + k + '</option>').join('') + '</select>');
      if (p === 'status') h.push('<select id="ap_status" style="width:auto"><option value="ACTIVE">Active only</option><option value="all">Incl. cancelled</option></select>');
      if (p === 'nature') h.push('<select id="ap_nature" style="width:auto"><option value="">Donations & grants</option><option>Donation</option><option>Grant</option></select>');
      if (p === 'summary') h.push(chk('ap_summary', 'Donor-wise summary', false));
      if (p === 'lkind') h.push('<select id="ap_kind" style="width:auto"><option value="Liability">Liabilities (to return)</option><option value="Asset">Advances (to recover)</option></select>');
      if (p === 'settled') h.push(chk('ap_includeSettled', 'Include settled', false));
      if (p === 'explorer') { h.length = 0; explorerUI(); }
    });
    $('#arp').innerHTML = h.join('');
  };
  function explorerUI() {
    const types = ['Asset', 'Liability', 'Income', 'Expense', 'Fund'], groups = Array.from(new Set(ACCS.map(a => a.group))).sort();
    $('#arx').innerHTML = '<div class="form">' + fld('From', inp('ax_from', first, 'type="date"')) + fld('To', inp('ax_to', today(), 'type="date"')) +
      fld('Accounts (hold Ctrl / ⌘ to pick several)', '<select id="ax_accountIds" multiple size="5">' + opt(ACCS, 'id', accLabel, '') + '</select>') + fld('Account groups', '<select id="ax_groups" multiple size="5">' + groups.map(g => '<option>' + e(g) + '</option>').join('') + '</select>') +
      fld('Account types', '<select id="ax_accountTypes" multiple size="5">' + types.map(t_ => '<option>' + t_ + '</option>').join('') + '</select>') + fld('Voucher types', '<select id="ax_voucherTypes" multiple size="5">' + ['RECEIPT', 'PAYMENT', 'CONTRA', 'JOURNAL', 'FEE'].map(t_ => '<option>' + t_ + '</option>').join('') + '</select>') +
      fld('Purposes', '<select id="ax_natures" multiple size="5">' + Object.keys(NAT).reduce((a, k) => a.concat(NAT[k]), []).map(t_ => '<option>' + t_ + '</option>').join('') + '</select>') +
      fld('Party', '<select id="ax_partyId">' + opt(PARTIES, 'id', p => p.name + ' (' + p.type + ')', '', 'Any') + '</select>') + fld('Fund', '<select id="ax_fundId"><option value="">Any</option><option value="_none">No fund</option>' + opt(FUNDS, 'id', 'name', '') + '</select>') +
      fld('Side', '<select id="ax_side"><option value="">Both</option><option value="Dr">Debit only</option><option value="Cr">Credit only</option></select>') + fld('Min amount', inp('ax_min', '', 'type="number" min="0"')) + fld('Max amount', inp('ax_max', '', 'type="number" min="0"')) + fld('Text contains', inp('ax_q', '')) +
      fld('Group results by', '<select id="ax_groupBy"><option value="none">No grouping (list every line)</option>' + [['account', 'Account'], ['group', 'Account group'], ['type', 'Account type'], ['party', 'Party'], ['fund', 'Fund'], ['month', 'Month'], ['nature', 'Purpose'], ['vtype', 'Voucher type']].map(o => '<option value="' + o[0] + '">' + o[1] + '</option>').join('') + '</select>') +
      '<div class="full row">' + chk('ax_cash', 'Only cash / bank lines', false) + chk('ax_nocash', 'Exclude cash / bank lines', false) + chk('ax_canc', 'Include cancelled', false) + '</div></div>';
  }
  const multi = id => $$('#' + id + ' option:checked').map(o => o.value);
  params(); $('#arn').onchange = params;
  $('#arRun').onclick = ev => run(ev.target, async () => {
    const name = v('arn'), pr = {};
    if (name === 'explorer') { ['from', 'to', 'partyId', 'fundId', 'side', 'min', 'max', 'q', 'groupBy'].forEach(k => { pr[k] = v('ax_' + k); }); ['accountIds', 'groups', 'accountTypes', 'voucherTypes', 'natures'].forEach(k => { pr[k] = multi('ax_' + k); }); pr.onlyCashBank = v('ax_cash'); pr.excludeCashBank = v('ax_nocash'); pr.includeCancelled = v('ax_canc'); }
    else $$('#arp [id^=ap_]').forEach(el => { pr[el.id.slice(3)] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
    if (name === 'ledger' && !pr.accountId) throw new Error('Select an account.'); if (name === 'partyStatement' && !pr.partyId) throw new Error('Select a party.');
    $('#arOut').innerHTML = spinner; const r = await api('accReport', { name, params: pr }); RS.out = r;
    $('#arOut').innerHTML = '<div class="card"><div class="row between mb"><div><h2>' + e(r.title) + '</h2>' + (r.note ? '<div class="' + (/NOT/.test(r.note) ? 'bal-bad b' : 'muted sm') + '">' + e(r.note) + '</div>' : '') + '<div class="muted sm">' + e(S.boot.settings.schoolName) + ' · generated ' + e(today()) + '</div></div><div class="row no-print"><button class="btn sm" id="arCsv">Export CSV</button><button class="btn sm" id="arPrint">Print</button></div></div><div id="arT"></div></div>';
    renderReport(r, $('#arT')); $('#arPrint').onclick = () => window.print(); $('#arCsv').onclick = () => download(name + '-' + today() + '.csv', csv(r.rows.filter(x => x._k !== 'h'), r.columns));
  });
};

/* ================= CHART OF ACCOUNTS, FUNDS & BOOKS SETTINGS ================= */
const CH = { tab: 'accounts' };
VIEWS.chart = async () => {
  const tabs = { accounts: 'Chart of accounts', funds: 'Funds & projects', books: 'Books settings', donation: 'Donation receipt' }, tab = CH.tab;
  $('#view').innerHTML = '<div class="tabs">' + Object.keys(tabs).map(k => '<button data-ch="' + k + '" class="' + (k === tab ? 'on' : '') + '">' + tabs[k] + '</button>').join('') + '</div><div id="chBody">' + spinner + '</div>';
  $$('[data-ch]').forEach(b => b.onclick = () => { CH.tab = b.dataset.ch; VIEWS.chart(); });
  await loadRef(); const body = $('#chBody'), s = S.boot.settings;
  if (tab === 'accounts') {
    const opening = ACCS.reduce((t_, a) => t_ + a.openingSigned, 0);
    body.innerHTML = '<div class="card"><div class="row between mb"><div><h2>Chart of accounts</h2><div class="muted sm">Opening balances (as on the day you start using this system) must balance: total debit = total credit. ' + (Math.abs(opening) < 0.005 ? '<b class="bal-ok">✓ They balance.</b>' : '<b class="bal-bad">Difference ' + cm(Math.abs(opening)) + ' – put the balancing amount in General Fund / Corpus.</b>') + '</div></div><button class="btn pri" id="acAdd">+ New account</button></div>' +
      table([{ l: 'Account', h: a => '<b>' + e(a.name) + '</b>' + (a.kind === 'Bank' ? '<div class="muted sm">' + e(a.bankName) + ' ' + e(a.accountNo) + '</div>' : '') }, { l: 'Group', k: 'group' }, { l: 'Type', h: a => pill(a.type + (a.kind !== 'Other' ? ' · ' + a.kind : ''), 'pri') }, { l: 'Opening', n: 1, f: a => +a.openingBal ? money(a.openingBal) + ' ' + a.openingSide : '' }, { l: 'Balance', n: 1, f: a => dr(a.naturalBalance === a.balance ? a.balance : a.balance) }, { l: 'Active', h: a => (a.active === true || a.active === 'true') ? pill('Yes', 'ok') : pill('No', 'bad') },
        { l: '', h: a => '<div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="acedit" data-id="' + e(a.id) + '">Edit</button>' + (!(a.system === true || a.system === 'true') && !a.used ? '<button class="btn sm bad" data-act="acdel" data-id="' + e(a.id) + '">Delete</button>' : '') + '</div>' }], ACCS.slice().sort((a, b) => ['Asset', 'Liability', 'Fund', 'Income', 'Expense'].indexOf(a.type) - ['Asset', 'Liability', 'Fund', 'Income', 'Expense'].indexOf(b.type) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name)), {}) + '</div>';
    $('#acAdd').onclick = () => accountForm();
  } else if (tab === 'funds') {
    body.innerHTML = '<div class="card"><div class="row between mb"><div><h2>Funds & projects</h2><div class="muted sm">Tag grants and restricted donations to a fund so you can show the grantor exactly how it was used.</div></div><button class="btn pri" id="fdAdd">+ New fund</button></div>' + table([{ l: 'Fund', h: f => '<b>' + e(f.name) + '</b>' }, { l: 'Kind', h: f => pill(f.kind, f.kind === 'Restricted' ? 'warn' : '') }, { l: 'Purpose', k: 'purpose' }, { l: 'Period', f: f => (f.startDate || '') + (f.endDate ? ' → ' + f.endDate : '') }, { l: '', h: f => '<button class="btn sm" data-act="fdedit" data-id="' + e(f.id) + '">Edit</button>' }], FUNDS) + '</div>';
    $('#fdAdd').onclick = () => fundForm();
  } else if (tab === 'books') {
    body.innerHTML = '<div class="card" style="max-width:820px"><h2 class="mb">Books settings</h2><div class="form">' +
      fld('Books locked up to (audit lock)', inp('bk_lock', s.booksLockDate || '', 'type="date" max="' + today() + '"')) + fld('Reason (needed only to move the lock back)', inp('bk_reason', '', 'maxlength="150"')) + '<div class="full muted sm">After an audit is signed off, lock the books. Nothing on or before this date can then be added, edited or cancelled by anyone.</div>' +
      fld('Default bank account (for UPI / bank fee receipts)', '<select id="bk_bank">' + opt(ACCS.filter(a => a.kind === 'Bank'), 'id', accLabel, s.defaultBankId) + '</select>') + fld('Bill/invoice required for payments of ₹ or more', inp('bk_thr', s.billRequiredAbove || '0', 'type="number" min="0"')) +
      fld('Financial year starts (MM-DD)', inp('bk_fy', s.fyStart || '04-01', 'maxlength="5"')) + '<div></div>' + [['RV', 'Receipt vouchers'], ['PV', 'Payment vouchers'], ['CV', 'Transfer vouchers'], ['JV', 'Journal vouchers']].map(k => fld(k[1] + ' prefix / next no.', '<div class="row" style="flex-wrap:nowrap">' + inp('bk_prefix' + k[0], s['prefix' + k[0]] || k[0] + '-', 'maxlength="6" style="width:90px"') + inp('bk_next' + k[0], s['next' + k[0]] || '1', 'type="number" min="1"') + '</div>')).join('') + fld('Gate pass prefix / next no.', '<div class="row" style="flex-wrap:nowrap">' + inp('bk_prefixGP', s.prefixGP || 'GP-', 'maxlength="6" style="width:90px"') + inp('bk_nextGP', s.nextGP || '1', 'type="number" min="1"') + '</div>') + '</div><div class="row mt"><button class="btn pri" id="bkSave">Save books settings</button></div></div>';
    $('#bkSave').onclick = ev => run(ev.target, async () => {
      const vals = { booksLockDate: v('bk_lock'), defaultBankId: v('bk_bank'), billRequiredAbove: v('bk_thr'), fyStart: v('bk_fy'), prefixGP: v('bk_prefixGP'), nextGP: v('bk_nextGP') }; ['RV', 'PV', 'CV', 'JV'].forEach(k => { vals['prefix' + k] = v('bk_prefix' + k); vals['next' + k] = v('bk_next' + k); });
      S.boot.settings = await api('accSettingsSave', { values: vals, reason: v('bk_reason') }); toast('Saved.', 'ok');
    });
  } else {
    const F = (k, l, x, c) => fld(l, inp('dn_' + k, s[k] || '', x || ''), c);
    body.innerHTML = '<div class="card" style="max-width:820px"><h2 class="mb">Donation receipt & email</h2><div class="form">' + F('panNo', 'School / trust PAN') + F('regNo80G', '80G / 12A registration details') + F('donationEmailSubject', 'Email subject', '', 'full') + fld('Email body', '<textarea id="dn_donationEmailBody" rows="7">' + e(s.donationEmailBody || '') + '</textarea>', 'full') + F('donationFooter', 'Receipt footer (e.g. “Donations are eligible for deduction under 80G …”)', '', 'full') + '</div><p class="muted sm mt">Placeholders: {{school}} {{party}} {{vNo}} {{amount}} {{date}} {{nature}}. Emails are sent when the donor has an email address on record.</p><div class="row mt"><button class="btn pri" id="dnSave">Save</button></div></div>';
    $('#dnSave').onclick = ev => run(ev.target, async () => { const vals = {}; $$('[id^=dn_]').forEach(el => { vals[el.id.slice(3)] = el.value.trim(); }); S.boot.settings = await api('settingsSave', { values: vals }); toast('Saved.', 'ok'); });
  }
};
X.acts.acedit = (a, id) => accountForm(id); X.acts.fdedit = (a, id) => fundForm(id);
X.acts.acdel = (a, id) => ask('Delete this account? (only possible while it has no entries)', 'Delete', true).then(ok => { if (ok) run(a, async () => { await api('accountDelete', { id }); toast('Deleted.', 'ok'); VIEWS.chart(); }); });
function accountForm(id) {
  const a = id ? ACCS.find(x => x.id === id) : { type: 'Expense', kind: 'Other', openingSide: 'Dr', active: true, openingBal: 0 }, used = !!a.used, sys = a.system === true || a.system === 'true', groups = Array.from(new Set(ACCS.map(x => x.group))).sort();
  const m = modal({ title: id ? 'Edit account' : 'New account', body: '<div class="form">' + fld('Account name *', inp('ac_n', a.name || '', 'maxlength="80"'), 'full') + fld('Group *', inp('ac_g', a.group || '', 'list="acGroups" maxlength="60"') + '<datalist id="acGroups">' + groups.map(g => '<option value="' + e(g) + '">').join('') + '</datalist>') + fld('Code', inp('ac_c', a.code || '', 'maxlength="20"')) +
    fld('Type *', '<select id="ac_t"' + (used || sys ? ' disabled' : '') + '>' + ['Asset', 'Liability', 'Income', 'Expense', 'Fund'].map(t_ => '<option' + (a.type === t_ ? ' selected' : '') + '>' + t_ + '</option>').join('') + '</select>') + fld('Cash / bank?', '<select id="ac_k"' + (used || sys ? ' disabled' : '') + '>' + ['Other', 'Cash', 'Bank'].map(k => '<option' + (a.kind === k ? ' selected' : '') + '>' + k + '</option>').join('') + '</select>') +
    '<div class="full">' + chk('ac_p', 'Track by party (deposits, loans, advances – so each return is matched to who gave it)', a.partyLedger === true || a.partyLedger === 'true') + '</div>' + fld('Bank name', inp('ac_bn', a.bankName || '')) + fld('Account no.', inp('ac_an', a.accountNo || '')) + fld('IFSC', inp('ac_if', a.ifsc || '')) + '<div></div>' +
    fld('Opening balance', inp('ac_ob', a.openingBal || 0, 'type="number" min="0" step="0.01"')) + fld('Opening side', '<select id="ac_os"><option value="Dr"' + (a.openingSide === 'Dr' ? ' selected' : '') + '>Debit (Dr) – assets, expenses</option><option value="Cr"' + (a.openingSide === 'Cr' ? ' selected' : '') + '>Credit (Cr) – liabilities, funds, income</option></select>') + fld('Remarks', inp('ac_r', a.remarks || ''), 'full') + '<div class="full">' + chk('ac_a', 'Active', a.active === true || a.active === 'true') + '</div></div>' + (used ? '<p class="muted sm mt">This account already has entries, so its type and cash/bank kind are fixed.</p>' : ''), footer: '<button class="btn" data-close>Cancel</button><button class="btn pri" id="acSave">Save</button>' });
  $('#acSave', m.el).onclick = ev => run(ev.target, async () => {
    const t_ = $('#ac_t', m.el).disabled ? a.type : v('ac_t'), k = $('#ac_k', m.el).disabled ? a.kind : v('ac_k');
    await api('accountSave', { account: { id: id || '', name: v('ac_n'), group: v('ac_g'), code: v('ac_c'), type: t_, kind: k, partyLedger: v('ac_p'), bankName: v('ac_bn'), accountNo: v('ac_an'), ifsc: v('ac_if'), openingBal: v('ac_ob'), openingSide: v('ac_os'), remarks: v('ac_r'), active: v('ac_a') } });
    m.close(); await X.refreshBoot(); toast('Saved.', 'ok'); VIEWS.chart();
  });
}
function fundForm(id) {
  const f = id ? FUNDS.find(x => x.id === id) : { kind: 'Restricted' };
  const m = modal({ title: id ? 'Edit fund' : 'New fund / project', size: 'sm', body: '<div class="grid" style="gap:12px">' + fld('Name *', inp('fd_n', f.name || '')) + fld('Kind', '<select id="fd_k"><option' + (f.kind === 'Restricted' ? ' selected' : '') + '>Restricted</option><option' + (f.kind === 'Unrestricted' ? ' selected' : '') + '>Unrestricted</option></select>') + fld('Purpose', inp('fd_p', f.purpose || '')) + fld('Starts', inp('fd_s', f.startDate || '', 'type="date"')) + fld('Ends', inp('fd_e', f.endDate || '', 'type="date"')) + '</div>', footer: '<button class="btn" data-close>Cancel</button><button class="btn pri" id="fdSave">Save</button>' });
  $('#fdSave', m.el).onclick = ev => run(ev.target, async () => { await api('fundSave', { fund: { id: id || '', name: v('fd_n'), kind: v('fd_k'), purpose: v('fd_p'), startDate: v('fd_s'), endDate: v('fd_e') } }); m.close(); toast('Saved.', 'ok'); VIEWS.chart(); });
}

X.renderReport = renderReport; X.viewVoucher = viewVoucher;
})();
