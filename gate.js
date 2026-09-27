/* School ERP – Gate pass screens (photos of child and parent, printable pass, verify & exit). Loaded after app.js and accounts.js. */
(function () {
'use strict';
const X = window.ERP; if (!X) return;
const { S, $, $$, e, v, fld, inp, chk, opt, pill, spinner, table, modal, ask, askText, toast, run, api, money, today, can, csv, download, debounce, emailOk, VIEWS, openFile, capturePhoto, autocomplete, cn, sn } = X;
const PURPOSES = ['Early pickup', 'Regular pickup', 'Medical', 'Late arrival', 'Visit / meeting', 'Other'];
const RELATIONS = ['Mother', 'Father', 'Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Brother', 'Sister', 'Driver', 'Family friend', 'Other'];
const G = { tab: '', st: null, guardians: [], gid: '', newP: false, personPhoto: null, childPhoto: null, freshPerson: false };
const stCls = s => s === 'ISSUED' ? 'ok' : s === 'EXITED' ? 'pri' : s === 'EXPIRED' ? 'warn' : 'bad';
const img = (id, cls, alt) => '<img class="' + (cls || 'ph-lg') + ' hide" alt="' + e(alt || '') + '" data-fid="' + e(id) + '">';
function hydrate(root) { $$('img[data-fid]', root || document).forEach(im => { if (im.dataset.fid && !im.dataset.done) { im.dataset.done = '1'; X.loadImg(im, im.dataset.fid); } }); }

VIEWS.gate = async () => {
  const canIssue = can('gate.issue'), canVerify = can('gate.verify');
  const tabs = {}; if (canIssue) tabs.new = 'New pass'; if (canVerify || canIssue) tabs.verify = 'Verify & exit'; tabs.reg = 'Register';
  if (G.owner !== S.user.username) { G.owner = S.user.username; G.tab = ''; G.st = null; }
  if (!tabs[G.tab]) G.tab = S.user.role === 'gatekeeper' && tabs.verify ? 'verify' : Object.keys(tabs)[0];
  $('#view').innerHTML = '<div class="tabs">' + Object.keys(tabs).map(k => '<button data-gt="' + k + '" class="' + (k === G.tab ? 'on' : '') + '">' + tabs[k] + '</button>').join('') + '</div><div id="gBody"></div>';
  $$('[data-gt]').forEach(b => b.onclick = () => { G.tab = b.dataset.gt; VIEWS.gate(); });
  if (G.tab === 'new') return newPass(); if (G.tab === 'verify') return verifyTab(); return registerTab();
};

/* ---------- New pass ---------- */
async function pickStudent(admNo) {
  const r = await api('guardianList', { admNo });
  Object.assign(G, { st: r.student, guardians: r.guardians, gid: '', newP: false, personPhoto: null, childPhoto: null, freshPerson: false });
  newPass();
}
function newPass() {
  const body = $('#gBody');
  if (!G.st) {
    body.innerHTML = '<div class="card" style="max-width:640px;margin:30px auto"><h2>Issue a gate pass</h2><p class="muted">Search the student by name, admission no., father’s name or mobile.</p><div class="ac mt"><input id="gSearch" placeholder="Start typing…" autocomplete="off"><div class="list hide"></div></div></div>';
    autocomplete($('.ac', body), s => run(null, () => pickStudent(s.admNo))); $('#gSearch').focus(); return;
  }
  const st = G.st, s = S.boot.settings, sel = G.guardians.find(g => g.id === G.gid);
  body.innerHTML = '<div class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);align-items:start" id="gGrid"><div class="grid" style="gap:16px">' +
    '<div class="card"><div class="row between"><div class="row" style="align-items:center;gap:14px">' + (st.photoFileId && !G.childPhoto ? img(st.photoFileId, 'ph-lg', 'Child') : G.childPhoto ? '<img class="ph-lg" alt="Child" src="' + G.childPhoto.preview + '">' : '<div class="ph-lg c muted" style="display:flex;align-items:center;justify-content:center">No photo</div>') + '<div><h2>' + e(st.name) + '</h2><div class="muted">#' + e(st.admNo) + ' · ' + e(cn(st.classId)) + (st.sectionId ? '-' + e(sn(st.sectionId)) : '') + '</div><div class="muted sm">Father: ' + e(st.fatherName) + ' · ' + e(st.mobile) + '</div><button class="btn sm mt" id="gChild">📷 ' + (st.photoFileId || G.childPhoto ? 'Retake photo of child' : 'Take photo of child *') + '</button></div></div><button class="btn sm" id="gChg">Change student</button></div></div>' +
    '<div class="card"><div class="row between mb"><h3>Who is taking the child?</h3><span class="muted sm">Choose an authorised person or add someone new</span></div><div class="chips" style="gap:12px">' +
    G.guardians.map(g => '<div class="gcard' + (g.id === G.gid ? ' on' : '') + ((g.authorized === true || g.authorized === 'true') ? '' : ' off') + '" data-g="' + e(g.id) + '" tabindex="0" role="button">' + img(g.photoFileId, 'ph-lg', g.name) + '<b>' + e(g.name) + '</b><span class="muted sm">' + e(g.relation) + ((g.authorized === true || g.authorized === 'true') ? '' : ' · NOT AUTHORISED') + '</span></div>').join('') +
    '<div class="gcard' + (G.newP ? ' on' : '') + '" data-gnew="1" tabindex="0" role="button"><div class="ph-lg c" style="display:flex;align-items:center;justify-content:center;font-size:40px">＋</div><b>New person</b><span class="muted sm">not on the list</span></div></div>' +
    (sel ? '<div class="row mt" style="align-items:center;gap:12px">' + chk('gFresh', 'Take a fresh photo of ' + sel.name + ' now (recommended for verification)', G.freshPerson) + (G.personPhoto ? '<img class="ph-sm" alt="Person" src="' + G.personPhoto.preview + '">' : '') + '</div>' : '') +
    (G.newP ? '<div class="form mt">' + fld('Name *', inp('gpN', '', 'maxlength="80"')) + fld('Relation to child *', '<select id="gpR">' + RELATIONS.map(r => '<option>' + r + '</option>').join('') + '</select>') + fld('Mobile', inp('gpM', '', 'inputmode="tel"')) + '<div class="row" style="align-items:center;gap:12px"><button class="btn" id="gPh">📷 Take photo of person *</button>' + (G.personPhoto ? '<img class="ph-sm" alt="Person" src="' + G.personPhoto.preview + '">' : '') + '</div><div class="full">' + chk('gSave', 'Add to the authorised list for future pickups', true) + '</div></div>' : '') + '</div></div>' +
    '<div class="card"><h3 class="mb">Pass details</h3><div class="grid" style="gap:12px">' + fld('Purpose *', '<select id="gPur">' + opt(PURPOSES.map(p => ({ id: p })), 'id', 'id', 'Early pickup') + '</select>') + fld('Remarks', inp('gRem', '', 'maxlength="200" placeholder="e.g. Doctor appointment"')) + fld('Valid for (minutes)', inp('gMin', s.gatePassValidMins || '120', 'type="number" min="10" max="600"')) +
    (emailOk(st.email) && s.gateEmailParent !== 'false' ? chk('gMail', 'Email the pass to the parent (' + st.email + ')', true) : '<p class="muted sm">No parent email on record – pass will only be printed.</p>') + '<button class="btn pri" id="gIssue" style="padding:12px;justify-content:center">Issue gate pass</button></div></div></div>';
  if (window.innerWidth < 1000) $('#gGrid').style.gridTemplateColumns = '1fr';
  hydrate(body);
  $('#gChg').onclick = () => { G.st = null; newPass(); };
  $('#gChild').onclick = () => run(null, async () => { const p = await capturePhoto({ title: 'Photo of ' + st.name, facing: 'user', maxDim: 720, quality: 0.85, name: 'child' }); if (p) { G.childPhoto = p; newPass(); } });
  body.onclick = ev => {
    const c = ev.target.closest('[data-g]'); if (c) { const g = G.guardians.find(x => x.id === c.dataset.g); if (!(g.authorized === true || g.authorized === 'true')) { toast(g.name + ' is not authorised to take this child. Ask a parent or the administrator.', 'bad'); return; } G.gid = g.id; G.newP = false; G.personPhoto = null; G.freshPerson = false; newPass(); return; }
    if (ev.target.closest('[data-gnew]')) { G.newP = true; G.gid = ''; G.personPhoto = null; newPass(); return; }
    if (ev.target.id === 'gPh') run(null, async () => { const keep = { n: v('gpN'), r: v('gpR'), m: v('gpM'), s: v('gSave') }; const p = await capturePhoto({ title: 'Photo of the person collecting the child', facing: 'user', maxDim: 720, quality: 0.85, name: 'person' }); if (p) { G.personPhoto = p; newPass(); $('#gpN').value = keep.n; $('#gpR').value = keep.r; $('#gpM').value = keep.m; $('#gSave').checked = keep.s; } });
  };
  const fr = $('#gFresh'); if (fr) fr.onchange = ev => run(null, async () => { G.freshPerson = ev.target.checked; if (G.freshPerson) { const p = await capturePhoto({ title: 'Photo of ' + sel.name, facing: 'user', maxDim: 720, quality: 0.85, name: 'person' }); if (p) G.personPhoto = p; else G.freshPerson = false; } else G.personPhoto = null; newPass(); });
  $('#gIssue').onclick = ev => run(ev.target, async () => {
    if (!G.gid && !G.newP) throw new Error('Choose who is taking the child, or add a new person.');
    if (!st.photoFileId && !G.childPhoto) throw new Error('Take a photo of the child first.');
    const pl = { admNo: st.admNo, purpose: v('gPur'), remarks: v('gRem'), validMins: v('gMin'), sendEmail: !!(v('gMail')) };
    if (G.childPhoto) pl.studentPhoto = { mime: G.childPhoto.mime, data: G.childPhoto.data };
    if (G.newP) {
      if (!v('gpN')) throw new Error('Enter the name of the person.'); if (!G.personPhoto) throw new Error('Take a photo of the person collecting the child.');
      pl.person = { name: v('gpN'), relation: v('gpR'), mobile: v('gpM'), saveAsGuardian: v('gSave') }; pl.personPhoto = { mime: G.personPhoto.mime, data: G.personPhoto.data };
    } else { pl.guardianId = G.gid; if (G.personPhoto) pl.personPhoto = { mime: G.personPhoto.mime, data: G.personPhoto.data }; }
    const who = G.newP ? v('gpN') : sel.name;
    if (!(await ask('Issue a pass for ' + st.name + ' to leave with ' + who + '?', 'Issue pass'))) return;
    const r = await api('gatePassIssue', pl);
    G.st = null; G.gid = ''; G.newP = false; G.personPhoto = null; G.childPhoto = null; passDone(r);
  });
}
function passDone(r) {
  const em = r.emailStatus || '';
  const m = modal({ title: 'Gate pass issued', size: 'sm', locked: true, body: '<div class="c"><div style="font-size:42px;color:var(--ok)">✓</div><h2>' + e(r.passNo) + '</h2><div class="muted">Valid until <b>' + e(r.validUntil) + '</b></div></div><div class="grid mt" style="gap:8px"><div class="alert ok">Pass saved to Drive.</div>' + (em === 'SENT' ? '<div class="alert ok">Emailed to parent.</div>' : em.indexOf('FAILED') === 0 ? '<div class="alert bad">Email not sent – ' + e(em.replace('FAILED: ', '')) + '</div>' : '') + '</div>',
    footer: '<button class="btn" id="gpPrint">Print pass</button><button class="btn pri" id="gpNew">New pass</button>' });
  $('#gpPrint', m.el).onclick = () => viewPass(r.passNo, true); $('#gpNew', m.el).onclick = () => { m.el.remove(); VIEWS.gate(); };
}
async function viewPass(no, autoPrint) {
  const m = modal({ title: 'Gate pass ' + no, size: 'wide', body: spinner, footer: '<button class="btn" data-close>Close</button><button class="btn pri" id="gvPrint">Print</button>' });
  try {
    const html = await api('gatePassHtml', { passNo: no });
    $('.body', m.el).innerHTML = '<iframe id="gvf" title="Gate pass" style="width:100%;height:68vh;border:1px solid var(--line);border-radius:8px;background:#fff"></iframe>';
    const f = $('#gvf', m.el); f.srcdoc = html; f.onload = () => { if (autoPrint) { autoPrint = false; f.contentWindow.print(); } }; $('#gvPrint', m.el).onclick = () => f.contentWindow.print();
  } catch (x) { $('.body', m.el).innerHTML = '<div class="alert bad">' + e(x.message) + '</div>'; }
}
X.acts.gpview = (a, id) => viewPass(id);

/* ---------- Verify & exit ---------- */
async function verifyTab() {
  const body = $('#gBody');
  body.innerHTML = '<div class="grid g2" style="align-items:start"><div class="card"><h2>Check a pass</h2><p class="muted sm">Type the pass number printed on the slip (e.g. GP-00012) or tap one from today’s list.</p><div class="row mt"><input id="vpNo" placeholder="GP-00001" style="text-transform:uppercase"><button class="btn pri" id="vpGo">Check</button></div><div id="vpOut" class="mt"></div></div><div class="card"><h2 class="mb">Today’s passes</h2><div id="vpList">' + spinner + '</div></div></div>';
  const check = async no => {
    no = (no || v('vpNo')).toUpperCase(); if (!no) return; $('#vpNo').value = no; $('#vpOut').innerHTML = spinner;
    try {
      const g = await api('gatePassGet', { passNo: no }), sts = g.effectiveStatus;
      $('#vpOut').innerHTML = '<div class="pass-status ' + stCls(sts) + '">' + (sts === 'ISSUED' ? 'VALID until ' + e(g.validUntil) : sts === 'EXITED' ? 'ALREADY USED' : sts) + '</div>' +
        '<div class="row mt" style="justify-content:center;gap:18px;align-items:flex-start"><div class="c">' + img(g.studentPhotoFileId, 'ph-lg', 'Child') + '<div><b>' + e(g.studentName) + '</b></div><div class="muted sm">' + e(g.className) + ' · #' + e(g.admNo) + '</div></div><div class="c">' + img(g.personPhotoFileId, 'ph-lg', 'Person') + '<div><b>' + e(g.personName) + '</b></div><div class="muted sm">' + e(g.relation) + (g.personMobile ? ' · ' + e(g.personMobile) : '') + '</div></div></div>' +
        '<div class="muted sm mt c">' + e(g.purpose) + (g.remarks ? ' – ' + e(g.remarks) : '') + '<br>Issued ' + e(g.date) + ' ' + e(g.timeOut) + ' by ' + e(g.approvedBy) + (g.exitAt ? '<br>Exited ' + e(String(g.exitAt).replace('T', ' ')) : '') + (g.cancelReason ? '<br>Cancelled: ' + e(g.cancelReason) : '') + '</div>' +
        '<div class="row mt" style="justify-content:center">' + (sts === 'ISSUED' && can('gate.verify') ? '<button class="btn pri" id="vpExit" style="padding:12px 26px">✓ Let the child leave</button>' : '') + (sts === 'ISSUED' && can('gate.issue') ? '<button class="btn bad" id="vpCancel">Cancel pass</button>' : '') + '<button class="btn" id="vpView">View pass</button></div>';
      hydrate($('#vpOut'));
      const ex = $('#vpExit'); if (ex) ex.onclick = e2 => run(e2.target, async () => { await api('gatePassExit', { passNo: no }); toast('Exit recorded.', 'ok'); check(no); loadList(); });
      const cn_ = $('#vpCancel'); if (cn_) cn_.onclick = () => askText('Cancel pass ' + no, 'Reason (required)', '', true).then(rs => { if (rs) run(null, async () => { await api('gatePassCancel', { passNo: no, reason: rs }); toast('Pass cancelled.', 'ok'); check(no); loadList(); }); });
      $('#vpView').onclick = () => viewPass(no);
    } catch (x) { $('#vpOut').innerHTML = '<div class="pass-status bad">NOT FOUND</div><div class="muted c mt">' + e(x.message) + '</div>'; }
  };
  const loadList = async () => {
    const r = await api('gatePassList', { from: today(), to: today(), limit: 100 });
    $('#vpList').innerHTML = table([{ l: 'Pass', h: x => '<a href="#" data-vp="' + e(x.passNo) + '"><b>' + e(x.passNo) + '</b></a>' }, { l: 'Child', h: x => e(x.studentName) + '<div class="muted sm">' + e(x.className) + '</div>' }, { l: 'With', k: 'personName' }, { l: 'Until', k: 'validUntil' }, { l: '', h: x => pill(x.effectiveStatus, stCls(x.effectiveStatus)) }], r.rows, { empty: 'No passes issued today.' });
  };
  $('#vpGo').onclick = () => check(); $('#vpNo').onkeydown = ev => { if (ev.key === 'Enter') check(); };
  body.onclick = ev => { const a = ev.target.closest('[data-vp]'); if (a) { ev.preventDefault(); check(a.dataset.vp); } };
  await loadList(); $('#vpNo').focus();
}

/* ---------- Register ---------- */
const GR = { q: '', from: '', to: '', status: 'all' };
async function registerTab() {
  const body = $('#gBody'); GR.from = GR.from || today(); GR.to = GR.to || today();
  body.innerHTML = '<div class="card"><div class="row mb"><div class="grow"><input id="grq" placeholder="Search pass no., child, person…" value="' + e(GR.q) + '"></div><input type="date" id="grf" value="' + e(GR.from) + '" style="width:auto"><input type="date" id="grt" value="' + e(GR.to) + '" style="width:auto"><select id="grs" style="width:auto">' + [['all', 'All'], ['ISSUED', 'Issued'], ['EXITED', 'Exited'], ['EXPIRED', 'Expired'], ['CANCELLED', 'Cancelled']].map(o => '<option value="' + o[0] + '"' + (GR.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select><button class="btn sm" id="grCsv">Export CSV</button></div><div id="grList">' + spinner + '</div></div>';
  let rows = [];
  const load = async () => {
    Object.assign(GR, { q: v('grq'), from: v('grf'), to: v('grt'), status: v('grs') });
    const r = await api('gatePassList', { q: GR.q, from: GR.from, to: GR.to, status: GR.status, limit: 500 }); rows = r.rows;
    $('#grList').innerHTML = '<div class="muted sm mb">' + r.total + ' pass(es)</div>' + table([{ l: 'Pass', h: x => '<b>' + e(x.passNo) + '</b>' }, { l: 'Date / time', f: x => x.date + ' ' + x.timeOut }, { l: 'Child', h: x => e(x.studentName) + '<div class="muted sm">' + e(x.className) + ' · #' + e(x.admNo) + '</div>' }, { l: 'Taken by', h: x => e(x.personName) + '<div class="muted sm">' + e(x.relation) + '</div>' }, { l: 'Purpose', k: 'purpose' }, { l: 'Exit', f: x => x.exitAt ? String(x.exitAt).replace('T', ' ').slice(11, 16) : '' }, { l: 'Status', h: x => pill(x.effectiveStatus, stCls(x.effectiveStatus)) }, { l: '', h: x => '<div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="gpview" data-id="' + e(x.passNo) + '">View</button>' + (x.pdfFileId ? '<button class="btn sm" data-act="gppdf" data-id="' + e(x.passNo) + '" data-f="' + e(x.pdfFileId) + '">PDF</button>' : '') + '</div>' }], rows, { empty: 'No passes in this period.' });
  };
  $('#grq').oninput = debounce(() => run(null, load), 300); ['grf', 'grt', 'grs'].forEach(i => $('#' + i).onchange = () => run(null, load));
  $('#grCsv').onclick = () => download('gate-passes-' + today() + '.csv', csv(rows.map(r => Object.assign({}, r, { status2: r.effectiveStatus })), [{ k: 'passNo', l: 'Pass' }, { k: 'date', l: 'Date' }, { k: 'timeOut', l: 'Time' }, { k: 'admNo', l: 'Adm no' }, { k: 'studentName', l: 'Child' }, { k: 'className', l: 'Class' }, { k: 'personName', l: 'Taken by' }, { k: 'relation', l: 'Relation' }, { k: 'personMobile', l: 'Mobile' }, { k: 'purpose', l: 'Purpose' }, { k: 'exitAt', l: 'Exited at' }, { k: 'approvedBy', l: 'Approved by' }, { k: 'status2', l: 'Status' }]));
  await load();
}
X.acts.gppdf = (a, id) => openFile(a.dataset.f, 'Gate pass ' + id);
})();
