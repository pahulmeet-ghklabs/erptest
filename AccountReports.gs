/**
 * AccountReports.gs — statements and audit reports computed from the books.
 * Every report returns { title, columns:[{k,l,t}], rows, totals, note }.
 * Row kinds: _k:'h' (section heading), 't' (total), 'ob' (opening balance).
 * Column types: money · drcr (positive = Dr, negative = Cr) · pct · text
 */
function accReport_(p, u) {
  if (!Object.prototype.hasOwnProperty.call(ACC_REPORTS, p.name)) throw new Error('Unknown report');
  return ACC_REPORTS[p.name](p.params || {}, u);
}
function fyStartFor_(asOn) {
  const md = String(settings_().fyStart || '04-01') || '04-01'; const y = +String(asOn).slice(0, 4);
  let d = y + '-' + md; if (d > asOn) d = (y - 1) + '-' + md; return d;
}
function addDays_(iso, n) { return Utilities.formatDate(new Date((dayNum_(iso) + n) * 86400000), 'UTC', 'yyyy-MM-dd'); }
const NAT_DR = { Asset: 1, Expense: 1 };
const byDateVno_ = function (a, b) { return String(a.date).localeCompare(String(b.date)) || String(a.vNo).localeCompare(String(b.vNo)); };
function sumNet_(lines, filter) { let n = 0; lines.forEach(function (l) { if (!filter || filter(l)) n += drOf_(l); }); return r2_(n); }
function groupedRows_(list, valueKey, out) { // list: [{group,name,amount}] → heading + accounts + subtotal per group
  const groups = {}, order = [];
  list.forEach(function (x) { if (!groups[x.group]) { groups[x.group] = []; order.push(x.group); } groups[x.group].push(x); });
  let total = 0;
  order.sort().forEach(function (g) {
    out.push({ _k: 'h', name: g }); let sub = 0;
    groups[g].sort(function (a, b) { return String(a.name).localeCompare(b.name); }).forEach(function (x) { out.push({ name: x.name, amount: x.amount }); sub = r2_(sub + x.amount); });
    out.push({ _k: 't', name: 'Total ' + g, amount: sub }); total = r2_(total + sub);
  });
  return total;
}

const ACC_REPORTS = {
  ledger: function (q) {
    const a = accMap_()[q.accountId]; if (!a) throw new Error('Choose an account.');
    const from = q.from || '0000-00-00', to = q.to || today_(), filtered = !!(q.fundId || q.partyId);
    const all = activeLines_().filter(function (l) { return l.accountId === a.id && (!q.fundId || l.fundId === q.fundId) && (!q.partyId || l.partyId === q.partyId); });
    let open = filtered ? 0 : openSigned_(a); all.forEach(function (l) { if (l.date < from) open += drOf_(l); }); open = r2_(open);
    const inr = all.filter(function (l) { return l.date >= from && l.date <= to; }).sort(byDateVno_);
    const rows = [{ _k: 'ob', particulars: 'Opening balance', bal: open }]; let bal = open, dr = 0, cr = 0;
    inr.forEach(function (l) { bal = r2_(bal + drOf_(l)); if (l.side === 'Dr') dr = r2_(dr + l.amount); else cr = r2_(cr + l.amount); rows.push({ date: l.date, vNo: l.vNo, nature: l.nature || l.vtype, party: l.partyName, particulars: l.narration || l.memo, refNo: l.refNo, cleared: l.clearedDate || '', dr: l.side === 'Dr' ? l.amount : '', cr: l.side === 'Cr' ? l.amount : '', bal: bal }); });
    const cols = [{ k: 'date', l: 'Date' }, { k: 'vNo', l: 'Voucher' }, { k: 'nature', l: 'Type' }, { k: 'party', l: 'Party' }, { k: 'particulars', l: 'Particulars' }, { k: 'refNo', l: 'Ref' }];
    if (a.kind === 'Bank') cols.push({ k: 'cleared', l: 'Cleared on' });
    cols.push({ k: 'dr', l: 'Debit', t: 'money' }, { k: 'cr', l: 'Credit', t: 'money' }, { k: 'bal', l: 'Balance', t: 'drcr' });
    return { title: 'Ledger – ' + a.name, columns: cols, rows: rows, totals: { dr: dr, cr: cr, bal: bal }, note: (filtered ? 'Filtered view – opening balance of the account excluded. ' : '') + a.group + ' · ' + a.type };
  },
  trialBalance: function (q) {
    const asOn = q.asOn || today_(), lines = activeLines_().filter(function (l) { return l.date <= asOn; }), agg = {};
    lines.forEach(function (l) { agg[l.accountId] = r2_((agg[l.accountId] || 0) + drOf_(l)); });
    const rows = []; let td = 0, tc = 0;
    ['Asset', 'Liability', 'Fund', 'Income', 'Expense'].forEach(function (t) {
      const items = readAll_('Accounts').filter(function (a) { return a.type === t; }).map(function (a) { return { a: a, net: r2_(openSigned_(a) + (agg[a.id] || 0)) }; }).filter(function (x) { return Math.abs(x.net) > 0.004; });
      if (!items.length) return; rows.push({ _k: 'h', name: t + 's' + (t === 'Fund' ? '' : '') });
      items.sort(function (x, y) { return String(x.a.group).localeCompare(y.a.group) || String(x.a.name).localeCompare(y.a.name); }).forEach(function (x) { const dr = x.net > 0 ? x.net : 0, cr = x.net < 0 ? -x.net : 0; td = r2_(td + dr); tc = r2_(tc + cr); rows.push({ name: x.a.name, group: x.a.group, dr: dr || '', cr: cr || '' }); });
    });
    const diff = r2_(td - tc); if (Math.abs(diff) > 0.004) rows.push({ _k: 't', name: 'Difference (opening balances do not balance – fix under Chart of accounts)', dr: diff < 0 ? -diff : '', cr: diff > 0 ? diff : '' });
    return { title: 'Trial balance as on ' + asOn, columns: [{ k: 'name', l: 'Account' }, { k: 'group', l: 'Group' }, { k: 'dr', l: 'Debit', t: 'money' }, { k: 'cr', l: 'Credit', t: 'money' }], rows: rows, totals: { dr: Math.max(td, tc), cr: Math.max(td, tc) }, note: Math.abs(diff) < 0.005 ? 'Books are in balance.' : 'Books are NOT in balance.' };
  },
  incomeExpenditure: function (q) {
    const from = q.from || fyStartFor_(today_()), to = q.to || today_();
    const lines = activeLines_().filter(function (l) { return l.date >= from && l.date <= to && (!q.fundId || l.fundId === q.fundId); }), accs = readAll_('Accounts'), agg = {};
    lines.forEach(function (l) { agg[l.accountId] = (agg[l.accountId] || 0) + drOf_(l); });
    const inc = [], exp = [];
    accs.forEach(function (a) { const n = r2_(agg[a.id] || 0); if (Math.abs(n) < 0.005) return; if (a.type === 'Income') inc.push({ group: a.group, name: a.name, amount: r2_(-n) }); else if (a.type === 'Expense') exp.push({ group: a.group, name: a.name, amount: n }); });
    const rows = [{ _k: 'h', name: 'INCOME' }]; const ti = groupedRows_(inc, 'amount', rows); rows.push({ _k: 't', name: 'TOTAL INCOME', amount: ti });
    rows.push({ _k: 'h', name: 'EXPENDITURE' }); const te = groupedRows_(exp, 'amount', rows); rows.push({ _k: 't', name: 'TOTAL EXPENDITURE', amount: te });
    const sur = r2_(ti - te); rows.push({ _k: 't', name: sur >= 0 ? 'SURPLUS (Income over Expenditure)' : 'DEFICIT (Expenditure over Income)', amount: Math.abs(sur) });
    return { title: 'Income & Expenditure account, ' + from + ' to ' + to, columns: [{ k: 'name', l: 'Particulars' }, { k: 'amount', l: 'Amount', t: 'money' }], rows: rows, totals: { amount: sur }, note: 'Fee income is recognised when fees are received (cash basis). Fund filter: ' + (q.fundId ? 'applied' : 'none') };
  },
  balanceSheet: function (q) {
    const asOn = q.asOn || today_(), fy = fyStartFor_(asOn), accs = readAll_('Accounts'), lines = activeLines_().filter(function (l) { return l.date <= asOn; }), agg = {};
    lines.forEach(function (l) { agg[l.accountId] = (agg[l.accountId] || 0) + drOf_(l); });
    const A = [], Lb = [], F = []; let prior = 0, curY = 0;
    accs.forEach(function (a) {
      const net = r2_(openSigned_(a) + (agg[a.id] || 0));
      if (a.type === 'Asset') { if (Math.abs(net) > 0.004) A.push({ group: a.group, name: a.name, amount: net }); }
      else if (a.type === 'Liability') { if (Math.abs(net) > 0.004) Lb.push({ group: a.group, name: a.name, amount: -net }); }
      else if (a.type === 'Fund') { if (Math.abs(net) > 0.004) F.push({ group: a.group, name: a.name, amount: -net }); }
    });
    lines.forEach(function (l) { const a = accMap_()[l.accountId]; if (!a || (a.type !== 'Income' && a.type !== 'Expense')) return; if (l.date < fy) prior -= drOf_(l); else curY -= drOf_(l); });
    accs.forEach(function (a) { if (a.type === 'Income' || a.type === 'Expense') prior -= openSigned_(a); });
    prior = r2_(prior); curY = r2_(curY);
    const rows = [{ _k: 'h', name: 'ASSETS' }]; const ta = groupedRows_(A, 'amount', rows); rows.push({ _k: 't', name: 'TOTAL ASSETS', amount: ta });
    rows.push({ _k: 'h', name: 'FUNDS' }); const tf0 = groupedRows_(F, 'amount', rows);
    rows.push({ name: 'Surplus / (deficit) brought forward', amount: prior }); rows.push({ name: 'Surplus / (deficit) for the year from ' + fy, amount: curY });
    const tf = r2_(tf0 + prior + curY); rows.push({ _k: 't', name: 'TOTAL FUNDS', amount: tf });
    rows.push({ _k: 'h', name: 'LIABILITIES' }); const tl = groupedRows_(Lb, 'amount', rows); rows.push({ _k: 't', name: 'TOTAL LIABILITIES', amount: tl });
    const tot = r2_(tf + tl), diff = r2_(ta - tot); rows.push({ _k: 't', name: 'TOTAL FUNDS + LIABILITIES', amount: tot });
    if (Math.abs(diff) > 0.004) rows.push({ _k: 't', name: 'DIFFERENCE (opening balances do not balance)', amount: diff });
    return { title: 'Balance sheet as on ' + asOn, columns: [{ k: 'name', l: 'Particulars' }, { k: 'amount', l: 'Amount', t: 'money' }], rows: rows, totals: { amount: ta }, note: Math.abs(diff) < 0.005 ? 'Assets = Funds + Liabilities ✓' : 'Assets and Funds+Liabilities differ by ' + money_(diff) };
  },
  receiptsPayments: function (q) {
    const from = q.from || fyStartFor_(today_()), to = q.to || today_(), accs = accMap_(), cash = readAll_('Accounts').filter(isCashBank_), all = activeLines_();
    const rows = [{ _k: 'h', name: 'RECEIPTS' }, { _k: 'h', name: 'Opening balances' }]; let recTot = 0, payTot = 0;
    cash.forEach(function (a) { let o = openSigned_(a); all.forEach(function (l) { if (l.accountId === a.id && l.date < from) o += drOf_(l); }); o = r2_(o); rows.push({ name: a.name, amount: o }); recTot = r2_(recTot + o); });
    const flows = function (types, side) {
      const vs = idMap_(cached_('Vouchers'), 'vNo'), inR = all.filter(function (l) { return l.date >= from && l.date <= to && types.indexOf(l.vtype) >= 0 && l.side === side && !isCashBank_(accs[l.accountId]); }), agg = {};
      inR.forEach(function (l) { agg[l.accountId] = r2_((agg[l.accountId] || 0) + l.amount); });
      return Object.keys(agg).map(function (id) { return { group: accs[id].group, name: accs[id].name, amount: agg[id] }; });
    };
    rows.push({ _k: 'h', name: 'Receipts during the period' }); const rt = groupedRows_(flows(['RECEIPT', 'FEE'], 'Cr'), 'amount', rows); recTot = r2_(recTot + rt);
    rows.push({ _k: 't', name: 'TOTAL RECEIPTS (incl. opening)', amount: recTot });
    rows.push({ _k: 'h', name: 'PAYMENTS' }, { _k: 'h', name: 'Payments during the period' }); const pt = groupedRows_(flows(['PAYMENT'], 'Dr'), 'amount', rows); payTot = r2_(payTot + pt);
    rows.push({ _k: 'h', name: 'Closing balances' });
    cash.forEach(function (a) { let c = openSigned_(a); all.forEach(function (l) { if (l.accountId === a.id && l.date <= to) c += drOf_(l); }); c = r2_(c); rows.push({ name: a.name, amount: c }); payTot = r2_(payTot + c); });
    rows.push({ _k: 't', name: 'TOTAL PAYMENTS (incl. closing)', amount: payTot });
    return { title: 'Receipts & Payments account, ' + from + ' to ' + to, columns: [{ k: 'name', l: 'Particulars' }, { k: 'amount', l: 'Amount', t: 'money' }], rows: rows, totals: { amount: recTot }, note: Math.abs(recTot - payTot) < 0.005 ? 'Receipts side = Payments side ✓ (transfers between cash/bank accounts are excluded).' : 'Sides differ by ' + money_(recTot - payTot) };
  },
  daybook: function (q) {
    const from = q.from || today_(), to = q.to || today_(), lines = {};
    cached_('VoucherLines').forEach(function (l) { (lines[l.vNo] = lines[l.vNo] || []).push(l); });
    const accs = accMap_(), rows = cached_('Vouchers').filter(function (v) { return v.date >= from && v.date <= to && (!q.type || v.type === q.type) && (q.status === 'all' || (q.status === 'CANCELLED' ? v.status === 'CANCELLED' : v.status === 'ACTIVE')); }).sort(byDateVno_).map(function (v) {
      return { date: v.date, vNo: v.vNo, type: v.type, nature: v.nature, party: v.partyName, particulars: (lines[v.vNo] || []).map(function (l) { return l.side + ' ' + (accs[l.accountId] ? accs[l.accountId].name : l.accountId); }).join('; '), amount: num_(v.amount), status: v.status, by: v.createdBy };
    });
    return { title: 'Day book, ' + from + ' to ' + to, columns: [{ k: 'date', l: 'Date' }, { k: 'vNo', l: 'Voucher' }, { k: 'type', l: 'Type' }, { k: 'nature', l: 'Purpose' }, { k: 'party', l: 'Party' }, { k: 'particulars', l: 'Particulars' }, { k: 'amount', l: 'Amount', t: 'money' }, { k: 'status', l: 'Status' }, { k: 'by', l: 'By' }], rows: rows, totals: { amount: r2_(rows.filter(function (r) { return r.status === 'ACTIVE'; }).reduce(function (a, r) { return a + r.amount; }, 0)) }, note: 'Total counts active vouchers only.' };
  },
  fundReport: function (q) {
    const from = q.from || '0000-00-00', to = q.to || today_(), accs = accMap_(), funds = readAll_('Funds'), agg = {};
    activeLines_().forEach(function (l) {
      if (l.date < from || l.date > to) return; const a = accs[l.accountId]; if (!a) return; const k = l.fundId || '_none';
      const o = agg[k] = agg[k] || { inc: 0, exp: 0, liab: 0 };
      if (a.type === 'Income') o.inc -= drOf_(l); else if (a.type === 'Expense') o.exp += drOf_(l); else if (a.type === 'Liability') o.liab -= drOf_(l);
    });
    const rows = funds.concat([{ id: '_none', name: 'Not allocated to a fund', kind: '' }]).filter(function (f) { return agg[f.id]; }).map(function (f) {
      const o = agg[f.id], avail = r2_(o.inc + o.liab);
      return { fund: f.name, kind: f.kind, income: r2_(o.inc), refundable: r2_(o.liab), expense: r2_(o.exp), balance: r2_(avail - o.exp), util: avail > 0 ? Math.round(o.exp / avail * 1000) / 10 : '' };
    });
    const tot = { income: 0, refundable: 0, expense: 0, balance: 0 }; rows.forEach(function (r) { Object.keys(tot).forEach(function (k) { tot[k] = r2_(tot[k] + r[k]); }); });
    return { title: 'Fund-wise income, utilisation and balance', columns: [{ k: 'fund', l: 'Fund / project' }, { k: 'kind', l: 'Kind' }, { k: 'income', l: 'Income received', t: 'money' }, { k: 'refundable', l: 'Refundable received', t: 'money' }, { k: 'expense', l: 'Spent', t: 'money' }, { k: 'balance', l: 'Unspent balance', t: 'money' }, { k: 'util', l: 'Utilised %', t: 'pct' }], rows: rows, totals: tot, note: 'Only lines tagged with a fund are attributed to it.' };
  },
  donorRegister: function (q) {
    const from = q.from || '0000-00-00', to = q.to || today_(), accs = accMap_(), parties = idMap_(cached_('Parties')), lines = {};
    cached_('VoucherLines').forEach(function (l) { (lines[l.vNo] = lines[l.vNo] || []).push(l); });
    const funds = idMap_(cached_('Funds'));
    let rows = cached_('Vouchers').filter(function (v) { return v.type === 'RECEIPT' && v.status === 'ACTIVE' && (q.nature ? v.nature === q.nature : (v.nature === 'Donation' || v.nature === 'Grant')) && v.date >= from && v.date <= to && (!q.partyId || v.partyId === q.partyId); }).sort(byDateVno_).map(function (v) {
      const ls = lines[v.vNo] || [], pt = parties[v.partyId] || {};
      return { date: v.date, vNo: v.vNo, donor: v.partyName, pan: pt.pan || '', nature: v.nature, amount: num_(v.amount), into: ls.filter(function (l) { return l.side === 'Dr'; }).map(function (l) { return accs[l.accountId] ? accs[l.accountId].name : ''; }).join(', '), fund: ls.filter(function (l) { return l.side === 'Cr' && l.fundId; }).map(function (l) { return funds[l.fundId] ? funds[l.fundId].name : ''; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(', '), email: v.emailStatus || '' };
    });
    if (q.summary) { const g = {}; rows.forEach(function (r) { const o = g[r.donor] = g[r.donor] || { donor: r.donor, pan: r.pan, count: 0, amount: 0 }; o.count++; o.amount = r2_(o.amount + r.amount); }); rows = Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.amount - a.amount; });
      return { title: 'Donor-wise summary', columns: [{ k: 'donor', l: 'Donor / grantor' }, { k: 'pan', l: 'PAN' }, { k: 'count', l: 'Receipts' }, { k: 'amount', l: 'Total', t: 'money' }], rows: rows, totals: { count: rows.reduce(function (a, r) { return a + r.count; }, 0), amount: r2_(rows.reduce(function (a, r) { return a + r.amount; }, 0)) } }; }
    return { title: 'Donation & grant register', columns: [{ k: 'date', l: 'Date' }, { k: 'vNo', l: 'Receipt' }, { k: 'donor', l: 'Donor / grantor' }, { k: 'pan', l: 'PAN' }, { k: 'nature', l: 'Type' }, { k: 'amount', l: 'Amount', t: 'money' }, { k: 'into', l: 'Received into' }, { k: 'fund', l: 'Fund' }, { k: 'email', l: 'Email' }], rows: rows, totals: { amount: r2_(rows.reduce(function (a, r) { return a + r.amount; }, 0)) } };
  },
  liabilityRegister: function (q) {
    const kind = q.kind === 'Asset' ? 'Asset' : 'Liability', asOn = q.asOn || today_(), accs = accMap_(), parties = idMap_(cached_('Parties')), g = {};
    activeLines_().forEach(function (l) {
      const a = accs[l.accountId]; if (!a || a.type !== kind || !truthy_(a.partyLedger) || l.date > asOn) return;
      const k = l.accountId + '|' + (l.partyId || ''); const o = g[k] = g[k] || { account: a.name, party: l.partyId && parties[l.partyId] ? parties[l.partyId].name : '(no party)', partyId: l.partyId || '', accountId: a.id, given: 0, back: 0, due: '' };
      const inSide = kind === 'Liability' ? 'Cr' : 'Dr';
      if (l.side === inSide) { o.given = r2_(o.given + l.amount); if (l.dueDate && (!o.due || l.dueDate < o.due)) o.due = l.dueDate; } else o.back = r2_(o.back + l.amount);
    });
    const t = today_(); let rows = Object.keys(g).map(function (k) { const o = g[k]; o.outstanding = r2_(o.given - o.back); o.status = o.outstanding < 0.005 ? 'Settled' : (o.due && o.due < t ? 'Overdue' : 'Open'); return o; });
    if (!q.includeSettled) rows = rows.filter(function (r) { return r.outstanding >= 0.005; });
    rows.sort(function (a, b) { return String(a.due || '9999').localeCompare(b.due || '9999') || a.party.localeCompare(b.party); });
    return { title: kind === 'Liability' ? 'Liabilities to be returned (deposits, loans, refundable grants)' : 'Advances / receivables outstanding', columns: [{ k: 'party', l: 'Party' }, { k: 'account', l: 'Account' }, { k: 'given', l: kind === 'Liability' ? 'Received' : 'Advanced', t: 'money' }, { k: 'back', l: kind === 'Liability' ? 'Returned' : 'Recovered', t: 'money' }, { k: 'outstanding', l: 'Outstanding', t: 'money' }, { k: 'due', l: 'Next due' }, { k: 'status', l: 'Status' }], rows: rows, totals: { given: r2_(rows.reduce(function (a, r) { return a + r.given; }, 0)), back: r2_(rows.reduce(function (a, r) { return a + r.back; }, 0)), outstanding: r2_(rows.reduce(function (a, r) { return a + r.outstanding; }, 0)) } };
  },
  partyStatement: function (q) {
    const pt = idMap_(cached_('Parties'))[q.partyId]; if (!pt) throw new Error('Choose a party.');
    const from = q.from || '0000-00-00', to = q.to || today_(), accs = accMap_();
    const ls = activeLines_().filter(function (l) { return l.partyId === pt.id && !isCashBank_(accs[l.accountId]); }).sort(byDateVno_);
    let bal = 0; ls.forEach(function (l) { if (l.date < from) bal += drOf_(l); }); bal = r2_(bal);
    const rows = [{ _k: 'ob', particulars: 'Opening balance', bal: bal }]; let dr = 0, cr = 0;
    ls.filter(function (l) { return l.date >= from && l.date <= to; }).forEach(function (l) { bal = r2_(bal + drOf_(l)); if (l.side === 'Dr') dr = r2_(dr + l.amount); else cr = r2_(cr + l.amount); rows.push({ date: l.date, vNo: l.vNo, nature: l.nature, account: accs[l.accountId] ? accs[l.accountId].name : '', particulars: l.narration, dr: l.side === 'Dr' ? l.amount : '', cr: l.side === 'Cr' ? l.amount : '', bal: bal }); });
    return { title: 'Statement – ' + pt.name + ' (' + pt.type + ')', columns: [{ k: 'date', l: 'Date' }, { k: 'vNo', l: 'Voucher' }, { k: 'nature', l: 'Purpose' }, { k: 'account', l: 'Account' }, { k: 'particulars', l: 'Particulars' }, { k: 'dr', l: 'Debit', t: 'money' }, { k: 'cr', l: 'Credit', t: 'money' }, { k: 'bal', l: 'Balance', t: 'drcr' }], rows: rows, totals: { dr: dr, cr: cr, bal: bal } };
  },
  explorer: function (q) {
    const accs = accMap_(), funds = idMap_(cached_('Funds')), vs = idMap_(cached_('Vouchers'), 'vNo'), att = {};
    readAll_('Files').forEach(function (f) { if (f.kind === 'VOUCHER_ATT' && !truthy_(f.deleted)) att[f.refId] = (att[f.refId] || 0) + 1; });
    const inc = q.includeCancelled ? cached_('VoucherLines').map(function (l) { const v = vs[l.vNo]; return v ? { id: l.id, vNo: l.vNo, accountId: l.accountId, side: l.side, amount: num_(l.amount), fundId: l.fundId, partyId: l.partyId, date: v.date, vtype: v.type, nature: v.nature, narration: v.narration, refNo: v.refNo, partyName: v.partyName, status: v.status } : null; }).filter(Boolean) : activeLines_();
    const list = (q.accountIds || []).length ? q.accountIds : null, groups = (q.groups || []).length ? q.groups : null, types = (q.voucherTypes || []).length ? q.voucherTypes : null, atypes = (q.accountTypes || []).length ? q.accountTypes : null, natures = (q.natures || []).length ? q.natures : null;
    const min = q.min === '' || q.min == null ? null : num_(q.min), max = q.max === '' || q.max == null ? null : num_(q.max), txt = String(q.q || '').toLowerCase().trim();
    let rows = inc.filter(function (l) {
      const a = accs[l.accountId]; if (!a) return false;
      if (q.from && l.date < q.from) return false; if (q.to && l.date > q.to) return false;
      if (list && list.indexOf(l.accountId) < 0) return false; if (groups && groups.indexOf(a.group) < 0) return false; if (atypes && atypes.indexOf(a.type) < 0) return false;
      if (types && types.indexOf(l.vtype) < 0) return false; if (natures && natures.indexOf(l.nature) < 0) return false;
      if (q.partyId && l.partyId !== q.partyId) return false; if (q.fundId && (q.fundId === '_none' ? l.fundId : l.fundId !== q.fundId)) return false;
      if (q.side && l.side !== q.side) return false; if (min != null && l.amount < min) return false; if (max != null && l.amount > max) return false;
      if (q.onlyCashBank === true && !isCashBank_(a)) return false; if (q.excludeCashBank === true && isCashBank_(a)) return false;
      if (txt && [l.narration, l.partyName, l.refNo, l.memo, l.vNo, a.name].every(function (x) { return String(x || '').toLowerCase().indexOf(txt) < 0; })) return false;
      return true;
    }).sort(byDateVno_);
    const ym = function (d) { return String(d).slice(0, 7); };
    if (q.groupBy && q.groupBy !== 'none') {
      const key = { account: function (l) { return accs[l.accountId].name; }, group: function (l) { return accs[l.accountId].group; }, type: function (l) { return accs[l.accountId].type; }, party: function (l) { return l.partyName || '(none)'; }, fund: function (l) { return l.fundId && funds[l.fundId] ? funds[l.fundId].name : '(none)'; }, month: function (l) { return ym(l.date); }, nature: function (l) { return l.nature; }, vtype: function (l) { return l.vtype; } }[q.groupBy];
      if (!key) throw new Error('Unknown grouping.'); const g = {};
      rows.forEach(function (l) { const k = key(l), o = g[k] = g[k] || { key: k, count: 0, dr: 0, cr: 0 }; o.count++; if (l.side === 'Dr') o.dr = r2_(o.dr + l.amount); else o.cr = r2_(o.cr + l.amount); });
      const out = Object.keys(g).sort().map(function (k) { const o = g[k]; o.net = r2_(o.dr - o.cr); return o; });
      return { title: 'Custom report – grouped by ' + q.groupBy, columns: [{ k: 'key', l: q.groupBy.charAt(0).toUpperCase() + q.groupBy.slice(1) }, { k: 'count', l: 'Lines' }, { k: 'dr', l: 'Debit', t: 'money' }, { k: 'cr', l: 'Credit', t: 'money' }, { k: 'net', l: 'Net (Dr − Cr)', t: 'drcr' }], rows: out, totals: { count: out.reduce(function (a, r) { return a + r.count; }, 0), dr: r2_(out.reduce(function (a, r) { return a + r.dr; }, 0)), cr: r2_(out.reduce(function (a, r) { return a + r.cr; }, 0)), net: r2_(out.reduce(function (a, r) { return a + r.net; }, 0)) } };
    }
    const out = rows.slice(0, 5000).map(function (l) { const a = accs[l.accountId]; return { date: l.date, vNo: l.vNo, vtype: l.vtype, nature: l.nature, party: l.partyName, account: a.name, group: a.group, fund: l.fundId && funds[l.fundId] ? funds[l.fundId].name : '', dr: l.side === 'Dr' ? l.amount : '', cr: l.side === 'Cr' ? l.amount : '', narration: l.narration, refNo: l.refNo, files: att[l.vNo] || 0, status: l.status || 'ACTIVE' }; });
    return { title: 'Custom report – ledger lines', columns: [{ k: 'date', l: 'Date' }, { k: 'vNo', l: 'Voucher' }, { k: 'vtype', l: 'Type' }, { k: 'nature', l: 'Purpose' }, { k: 'party', l: 'Party' }, { k: 'account', l: 'Account' }, { k: 'group', l: 'Group' }, { k: 'fund', l: 'Fund' }, { k: 'dr', l: 'Debit', t: 'money' }, { k: 'cr', l: 'Credit', t: 'money' }, { k: 'narration', l: 'Narration' }, { k: 'refNo', l: 'Ref' }, { k: 'files', l: 'Files' }, { k: 'status', l: 'Status' }], rows: out, totals: { dr: r2_(out.reduce(function (a, r) { return a + num_(r.dr); }, 0)), cr: r2_(out.reduce(function (a, r) { return a + num_(r.cr); }, 0)) }, note: rows.length > 5000 ? 'Showing first 5,000 of ' + rows.length + ' lines – narrow the filters.' : '' };
  },
  auditPack: function (q) {
    // Voucher register with evidence status — the file an auditor asks for.
    const from = q.from || fyStartFor_(today_()), to = q.to || today_(), thr = num_(settings_().billRequiredAbove);
    const att = {}; readAll_('Files').forEach(function (f) { if (f.kind === 'VOUCHER_ATT' && !truthy_(f.deleted)) att[f.refId] = (att[f.refId] || 0) + 1; });
    const rows = cached_('Vouchers').filter(function (v) { return v.date >= from && v.date <= to && v.status === 'ACTIVE' && v.type !== 'FEE'; }).sort(byDateVno_).map(function (v) {
      const needs = v.type === 'PAYMENT' && BILL_NATURES.indexOf(v.nature) >= 0; const n = att[v.vNo] || 0;
      return { date: v.date, vNo: v.vNo, type: v.type, nature: v.nature, party: v.partyName, amount: num_(v.amount), ref: v.refNo, files: n, evidence: !needs ? '—' : (n ? 'Bill attached' : (v.noBillReason ? 'No bill: ' + v.noBillReason : (num_(v.amount) >= thr ? 'MISSING' : 'Below threshold'))), by: v.createdBy, edits: Math.max(0, num_(v.rev) - 1) };
    });
    return { title: 'Audit pack – vouchers with evidence, ' + from + ' to ' + to, columns: [{ k: 'date', l: 'Date' }, { k: 'vNo', l: 'Voucher' }, { k: 'type', l: 'Type' }, { k: 'nature', l: 'Purpose' }, { k: 'party', l: 'Party' }, { k: 'amount', l: 'Amount', t: 'money' }, { k: 'ref', l: 'Ref' }, { k: 'files', l: 'Files' }, { k: 'evidence', l: 'Evidence' }, { k: 'by', l: 'Entered by' }, { k: 'edits', l: 'Edits' }], rows: rows, totals: { amount: r2_(rows.reduce(function (a, r) { return a + r.amount; }, 0)) }, note: rows.filter(function (r) { return r.evidence === 'MISSING'; }).length + ' payment(s) above the bill threshold have no attachment.' };
  }
};

function accountsDashboard_() {
  const t = today_(), month = t.slice(0, 7), accs = accountList_(), lines = activeLines_(), s = settings_(), thr = num_(s.billRequiredAbove);
  let inflow = 0, outflow = 0, todayIn = 0, todayOut = 0;
  const accm = idMap_(accs);
  lines.forEach(function (l) {
    const a = accm[l.accountId]; if (!a || (a.kind !== 'Cash' && a.kind !== 'Bank')) return;
    if (l.vtype === 'RECEIPT' || l.vtype === 'FEE') { if (l.side === 'Dr') { if (String(l.date).slice(0, 7) === month) inflow += l.amount; if (l.date === t) todayIn += l.amount; } }
    if (l.vtype === 'PAYMENT') { if (l.side === 'Cr') { if (String(l.date).slice(0, 7) === month) outflow += l.amount; if (l.date === t) todayOut += l.amount; } }
  });
  const liab = ACC_REPORTS.liabilityRegister({}), overdue = liab.rows.filter(function (r) { return r.status === 'Overdue'; }).length;
  const att = {}; readAll_('Files').forEach(function (f) { if (f.kind === 'VOUCHER_ATT' && !truthy_(f.deleted)) att[f.refId] = 1; });
  const missing = cached_('Vouchers').filter(function (v) { return v.type === 'PAYMENT' && v.status === 'ACTIVE' && BILL_NATURES.indexOf(v.nature) >= 0 && num_(v.amount) >= thr && thr > 0 && !att[v.vNo] && !String(v.noBillReason || ''); }).length;
  const unc = {}; lines.forEach(function (l) { const a = accm[l.accountId]; if (a && a.kind === 'Bank' && !l.clearedDate) unc[a.id] = (unc[a.id] || 0) + 1; });
  let od = 0; accs.forEach(function (a) { od += a.openingSigned; }); od = r2_(od);
  const recent = cached_('Vouchers').filter(function (v) { return v.type !== 'FEE'; }).slice().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }).slice(0, 8).map(strip_);
  return { cashBank: accs.filter(function (a) { return a.kind === 'Cash' || a.kind === 'Bank'; }).map(function (a) { return { id: a.id, name: a.name, kind: a.kind, bankName: a.bankName, balance: a.balance, unreconciled: unc[a.id] || 0 }; }),
    monthIn: r2_(inflow), monthOut: r2_(outflow), todayIn: r2_(todayIn), todayOut: r2_(todayOut), liabilities: liab.totals.outstanding, liabilityCount: liab.rows.length, overdue: overdue, missingBills: missing, openingDiff: od, lockDate: s.booksLockDate || '', recent: recent };
}
