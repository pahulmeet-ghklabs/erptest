/**
 * Gate.gs — gate pass system: student & guardian photos, pass issue / verify / exit, PDF to Drive.
 * Photos are stored privately in Drive and only served to signed-in staff through the app.
 */
const GATE_PURPOSES = ['Early pickup', 'Regular pickup', 'Medical', 'Late arrival', 'Visit / meeting', 'Other'];
const GATE_ANY = ['gate.issue', 'gate.verify'];

const GATE_ACTIONS = {
  studentPhotoSave: { perm: ['gate.issue', 'students.edit'], fn: function (p, u) { return studentPhotoSave_(p, u); } },
  guardianList: { perm: ['gate.issue', 'gate.verify', 'students.view'], fn: function (p) { return guardianList_(p); } },
  guardianSave: { perm: ['gate.issue', 'students.edit'], fn: function (p, u) { return guardianSave_(p, u); } },
  guardianRemove: { perm: ['gate.issue', 'students.edit'], fn: function (p, u) { return guardianRemove_(p, u); } },
  gatePassIssue: { perm: 'gate.issue', fn: function (p, u) { return gatePassIssue_(p, u); } },
  gatePassList: { perm: GATE_ANY, fn: function (p) { return gatePassList_(p); } },
  gatePassGet: { perm: GATE_ANY, fn: function (p) { return gatePassGet_(p); } },
  gatePassExit: { perm: 'gate.verify', fn: function (p, u) { return gatePassExit_(p, u); } },
  gatePassCancel: { perm: 'gate.issue', fn: function (p, u) { return gatePassCancel_(p, u); } },
  gatePassHtml: { perm: GATE_ANY, fn: function (p) { return gatePassHtml_(gatePassData_(p.passNo)); } }
};

function hhmm_() { return now_().slice(11, 16); }
function passStatus_(g) {
  if (g.status !== 'ISSUED') return g.status;
  const t = today_();
  if (String(g.date) < t) return 'EXPIRED';
  if (String(g.date) === t && hhmm_() > String(g.validUntil)) return 'EXPIRED';
  return 'ISSUED';
}
function photoOf_(b64) { return b64 && b64.data ? { data: b64.data, mime: b64.mime || 'image/jpeg', name: 'photo' } : null; }

function studentPhotoSave_(p, u) {
  const st = getStudent_(p.admNo); if (!st) throw new Error('Student not found.');
  const f = photoOf_(p.photo); if (!f) throw new Error('No photo received.');
  if (f.mime.indexOf('image/') !== 0) throw new Error('A photo must be an image.');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    _memo = {}; const st2 = getStudent_(p.admNo);
    const r = saveUpload_(f, 'PHOTO_STUDENT', st2.admNo, u, ['Photos', 'Students']);
    if (st2.photoFileId) retireFile_(st2.photoFileId);
    updateRow_('Students', st2._row, { photoFileId: r.fileId, updatedAt: now_() });
    audit_(u, 'STUDENT_PHOTO', 'Student', st2.admNo, { fileId: r.fileId });
    return { fileId: r.fileId };
  } finally { lock.releaseLock(); }
}
function guardianList_(p) {
  const st = getStudent_(p.admNo); if (!st) throw new Error('Student not found.');
  return { student: { admNo: st.admNo, name: st.name, fatherName: st.fatherName, motherName: st.motherName, mobile: st.mobile, email: st.email, classId: st.classId, sectionId: st.sectionId, photoFileId: st.photoFileId || '', left: truthy_(st.left) },
    guardians: cached_('Guardians').filter(function (g) { return String(g.admNo) === String(p.admNo) && truthy_(g.active); }).map(strip_) };
}
function guardianSave_(p, u) {
  const x = p.guardian || {}, st = getStudent_(x.admNo); if (!st) throw new Error('Student not found.');
  const name = String(x.name || '').trim(); if (!name) throw new Error('Name is required.');
  const relation = String(x.relation || '').trim(); if (!relation) throw new Error('Relation to the child is required.');
  const rec = { admNo: String(st.admNo), name: name.slice(0, 80), relation: relation.slice(0, 40), mobile: String(x.mobile || '').slice(0, 20), idProof: String(x.idProof || '').slice(0, 60), authorized: x.authorized !== false, active: true };
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    _memo = {};
    let g = null; if (x.id) { g = cached_('Guardians').filter(function (r) { return r.id === x.id && String(r.admNo) === String(st.admNo); })[0]; if (!g) throw new Error('Guardian not found.'); }
    const f = photoOf_(p.photo);
    if (f) { const r = saveUpload_(f, 'PHOTO_GUARDIAN', st.admNo, u, ['Photos', 'Guardians']); rec.photoFileId = r.fileId; if (g && g.photoFileId) retireFile_(g.photoFileId); }
    if (g) { updateRow_('Guardians', g._row, rec); audit_(u, 'GUARDIAN_UPDATE', 'Student', st.admNo, { name: name, relation: relation }); return { id: g.id, photoFileId: rec.photoFileId || g.photoFileId }; }
    if (!f && !x.photoFileId) throw new Error('Take a photo of the person.');
    rec.id = uid_('g_'); rec.photoFileId = rec.photoFileId || x.photoFileId; rec.createdBy = u.username; rec.createdAt = now_();
    appendRows_('Guardians', [rec]); audit_(u, 'GUARDIAN_CREATE', 'Student', st.admNo, { name: name, relation: relation });
    return { id: rec.id, photoFileId: rec.photoFileId };
  } finally { lock.releaseLock(); }
}
function guardianRemove_(p, u) {
  const g = cached_('Guardians').filter(function (r) { return r.id === p.id; })[0]; if (!g) throw new Error('Guardian not found.');
  updateRow_('Guardians', g._row, { active: false }); audit_(u, 'GUARDIAN_REMOVE', 'Student', g.admNo, { name: g.name }); return true;
}

function gatePassIssue_(p, u) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  let passNo;
  try {
    _memo = {};
    const s = settings_(), st = getStudent_(p.admNo);
    if (!st) throw new Error('Student not found.'); if (truthy_(st.left)) throw new Error('This student has left the school.');
    const purpose = GATE_PURPOSES.indexOf(p.purpose) >= 0 ? p.purpose : null; if (!purpose) throw new Error('Choose the purpose of the pass.');
    let person = { name: '', relation: '', mobile: '', photoFileId: '' }, guardianId = '';
    if (p.guardianId) {
      const g = cached_('Guardians').filter(function (r) { return r.id === p.guardianId && String(r.admNo) === String(st.admNo) && truthy_(r.active); })[0];
      if (!g) throw new Error('This person is not on the authorised list for the student.');
      if (!truthy_(g.authorized)) throw new Error(g.name + ' is not authorised to take the child. Ask a parent/administrator.');
      person = { name: g.name, relation: g.relation, mobile: g.mobile, photoFileId: g.photoFileId }; guardianId = g.id;
    } else {
      const x = p.person || {}; if (!String(x.name || '').trim() || !String(x.relation || '').trim()) throw new Error('Enter the name and relation of the person collecting the child.');
      person = { name: String(x.name).trim().slice(0, 80), relation: String(x.relation).trim().slice(0, 40), mobile: String(x.mobile || '').slice(0, 20), photoFileId: '' };
    }
    const ym = today_().slice(0, 4), mm = today_().slice(0, 7);
    let personPhoto = person.photoFileId, studentPhoto = st.photoFileId || '';
    const live = photoOf_(p.personPhoto), liveS = photoOf_(p.studentPhoto);
    if (live) personPhoto = saveUpload_(live, 'PHOTO_PASS', 'person', u, ['Photos', 'Passes', mm]).fileId;
    if (liveS) studentPhoto = saveUpload_(liveS, 'PHOTO_PASS', 'student', u, ['Photos', 'Passes', mm]).fileId;
    if (!personPhoto) throw new Error('Take a photo of the person collecting the child.');
    if (!studentPhoto) throw new Error('Take a photo of the child (it will be saved for next time).');
    if (!st.photoFileId && studentPhoto) { updateRow_('Students', st._row, { photoFileId: studentPhoto }); dirty_('Students'); }
    if (!p.guardianId && p.person && p.person.saveAsGuardian) {
      const g = { id: uid_('g_'), admNo: String(st.admNo), name: person.name, relation: person.relation, mobile: person.mobile, idProof: '', photoFileId: personPhoto, authorized: true, active: true, createdBy: u.username, createdAt: now_() };
      appendRows_('Guardians', [g]); guardianId = g.id;
    }
    const n = num_(s.nextGP) || 1; passNo = (s.prefixGP || 'GP-') + ('00000' + n).slice(-Math.max(5, String(n).length));
    if (cached_('GatePasses').some(function (r) { return r.passNo === passNo; })) throw new Error('Pass number ' + passNo + ' already used.');
    setSetting_('nextGP', String(n + 1));
    const mins = Math.max(10, Math.min(600, num_(p.validMins) || num_(s.gatePassValidMins) || 120)), t = hhmm_();
    let vm = Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) + mins; if (vm > 1439) vm = 1439;
    const valid = ('0' + Math.floor(vm / 60)).slice(-2) + ':' + ('0' + (vm % 60)).slice(-2);
    const cls = idMap_(cached_('Classes'))[st.classId], sec = idMap_(cached_('Sections'))[st.sectionId];
    appendRows_('GatePasses', [{ passNo: passNo, date: today_(), timeOut: t, validUntil: valid, admNo: String(st.admNo), studentName: st.name, className: (cls ? cls.name : '') + (sec ? '-' + sec.name : ''), guardianId: guardianId, personName: person.name, relation: person.relation, personMobile: person.mobile,
      studentPhotoFileId: studentPhoto, personPhotoFileId: personPhoto, purpose: purpose, remarks: String(p.remarks || '').slice(0, 200), approvedBy: String(p.approvedBy || u.name || u.username).slice(0, 60), status: 'ISSUED', emailStatus: '', createdBy: u.username, createdAt: now_() }]);
    audit_(u, 'GATEPASS_ISSUE', 'GatePass', passNo, { admNo: st.admNo, person: person.name, relation: person.relation, purpose: purpose });
  } finally { lock.releaseLock(); }
  return finalizeGatePass_(passNo, p.sendEmail !== false);
}
function gatePassData_(passNo) {
  const g = cached_('GatePasses').filter(function (r) { return r.passNo === passNo; })[0]; if (!g) throw new Error('Gate pass not found.');
  return { g: g, s: settings_(), st: getStudent_(g.admNo) || {} };
}
function photoUri_(fileId) {
  if (!fileId) return '';
  try { const b = DriveApp.getFileById(fileId).getBlob(); return 'data:' + (b.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(b.getBytes()); } catch (e) { return ''; }
}
function gatePassHtml_(d) {
  const g = d.g, s = d.s, st = passStatus_(g), img = function (id, alt) { const u = photoUri_(id); return u ? '<img src="' + u + '" alt="' + esc_(alt) + '" style="width:150px;height:180px;object-fit:cover;border:1px solid #999">' : '<div style="width:150px;height:180px;border:1px dashed #999;line-height:180px;text-align:center;color:#999">No photo</div>'; };
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:"Noto Sans Gurmukhi","Noto Sans",Arial,sans-serif;color:#1a1a1a;font-size:12px;margin:0;padding:20px;position:relative}' +
    '.h{text-align:center;border-bottom:2px solid #1f3a8a;padding-bottom:6px;margin-bottom:8px}.h h1{margin:0;font-size:18px;color:#1f3a8a}.t{text-align:center;font-size:16px;font-weight:bold;margin:6px 0;letter-spacing:1px}' +
    'table{width:100%;border-collapse:collapse}td{padding:4px;vertical-align:top}.ph{text-align:center;width:50%}.k{color:#555;width:32%}.no{font-size:20px;font-weight:bold;color:#b00020}.sig td{border-top:1px solid #999;text-align:center;padding-top:4px;font-size:11px;width:33%}.ft{margin-top:10px;font-size:10px;color:#666;text-align:center}' +
    '.wm{position:absolute;top:35%;left:15%;font-size:70px;color:rgba(200,0,0,.18);transform:rotate(-25deg);font-weight:bold}</style></head><body>' + (st !== 'ISSUED' && st !== 'EXITED' ? '<div class="wm">' + esc_(st) + '</div>' : '') +
    '<div class="h"><h1>' + esc_(s.schoolName) + '</h1>' + (s.schoolNameLocal ? '<div>' + esc_(s.schoolNameLocal) + '</div>' : '') + '<div style="color:#444">' + esc_(s.address) + '</div></div>' +
    '<div class="t">GATE PASS / ਗੇਟ ਪਾਸ</div><table><tr><td><span class="no">' + esc_(g.passNo) + '</span></td><td style="text-align:right"><b>' + esc_(g.date) + '</b> · ' + esc_(g.timeOut) + ' (valid until ' + esc_(g.validUntil) + ')</td></tr></table>' +
    '<table style="margin-top:6px"><tr><td class="ph">' + img(g.studentPhotoFileId, 'Student') + '<div><b>' + esc_(g.studentName) + '</b><br>Adm. ' + esc_(g.admNo) + ' · ' + esc_(g.className) + '</div></td>' +
    '<td class="ph">' + img(g.personPhotoFileId, 'Person') + '<div><b>' + esc_(g.personName) + '</b><br>' + esc_(g.relation) + (g.personMobile ? ' · ' + esc_(g.personMobile) : '') + '</div></td></tr></table>' +
    '<table style="margin-top:8px"><tr><td class="k">Purpose / ਕਾਰਨ</td><td><b>' + esc_(g.purpose) + '</b></td></tr>' + (g.remarks ? '<tr><td class="k">Remarks</td><td>' + esc_(g.remarks) + '</td></tr>' : '') + '<tr><td class="k">Approved by</td><td>' + esc_(g.approvedBy) + '</td></tr>' +
    (g.exitAt ? '<tr><td class="k">Exited</td><td>' + esc_(String(g.exitAt).replace('T', ' ')) + '</td></tr>' : '') + '</table>' +
    '<table style="margin-top:34px" class="sig"><tr><td>Issued by (' + esc_(g.createdBy) + ')</td><td>Person collecting</td><td>Gate keeper</td></tr></table><div class="ft">' + esc_(s.gateFooter) + '</div></body></html>';
}
function finalizeGatePass_(passNo, sendEmail) {
  _memo = {};
  const d = gatePassData_(passNo), g = d.g, ym = String(g.date).slice(0, 4), mm = String(g.date).slice(0, 7);
  const blob = htmlToPdf_(gatePassHtml_(d), passNo);
  const file = driveFolder_(['GatePasses', ym, mm]).createFile(blob);
  if (g.pdfFileId) { try { DriveApp.getFileById(g.pdfFileId).setTrashed(true); } catch (e) { /* gone */ } retireFile_(g.pdfFileId); }
  updateRow_('GatePasses', g._row, { pdfFileId: file.getId() });
  registerFile_(file.getId(), 'PASS_PDF', passNo, passNo + '.pdf', 'application/pdf', 0, null);
  let status = g.emailStatus || '';
  const to = String(d.st.email || '').trim();
  if (sendEmail && g.status === 'ISSUED' && String(d.s.gateEmailParent) === 'true' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    try {
      MailApp.sendEmail({ to: to, subject: 'Gate pass ' + passNo + ' – ' + g.studentName + ' – ' + d.s.schoolName, name: d.s.schoolName || 'School', replyTo: d.s.email || undefined, attachments: [blob],
        htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">' + esc_('Dear Parent/Guardian,\n\n' + g.studentName + ' is leaving school at ' + g.timeOut + ' today with ' + g.personName + ' (' + g.relation + ') – ' + g.purpose + '.\nGate pass ' + passNo + ' is attached. If you did not authorise this, please call the school immediately' + (d.s.phone ? ' on ' + d.s.phone : '') + '.\n\nRegards,\n' + d.s.schoolName).replace(/\n/g, '<br>') + '</div>' });
      status = 'SENT';
    } catch (e) { status = 'FAILED: ' + String(e.message).slice(0, 100); }
    updateRow_('GatePasses', g._row, { emailStatus: status });
  }
  dirty_('GatePasses');
  return { passNo: passNo, pdfFileId: file.getId(), emailStatus: status, validUntil: g.validUntil, timeOut: g.timeOut };
}
function gatePassGet_(p) {
  const d = gatePassData_(p.passNo), g = d.g, o = strip_(g); o.effectiveStatus = passStatus_(g); o.studentMobile = d.st.mobile; o.fatherName = d.st.fatherName; o.motherName = d.st.motherName; return o;
}
function gatePassList_(p) {
  const q = String(p.q || '').toLowerCase().trim(), from = p.from || today_(), to = p.to || today_();
  let list = cached_('GatePasses').filter(function (g) {
    if (g.date < from || g.date > to) return false; const st = passStatus_(g); if (p.status && p.status !== 'all' && st !== p.status) return false;
    return !q || [g.passNo, g.studentName, g.personName, g.admNo].some(function (x) { return String(x).toLowerCase().indexOf(q) >= 0; });
  }).sort(function (a, b) { return String(b.date + b.timeOut).localeCompare(a.date + a.timeOut); });
  return { total: list.length, rows: list.slice(0, num_(p.limit) || 300).map(function (g) { const o = strip_(g); o.effectiveStatus = passStatus_(g); return o; }) };
}
function gatePassExit_(p, u) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    _memo = {}; const g = cached_('GatePasses').filter(function (r) { return r.passNo === p.passNo; })[0]; if (!g) throw new Error('Gate pass not found.');
    const st = passStatus_(g);
    if (st === 'EXITED') throw new Error('This pass was already used at ' + String(g.exitAt).replace('T', ' ') + '.');
    if (st === 'CANCELLED') throw new Error('This pass was cancelled' + (g.cancelReason ? ': ' + g.cancelReason : '') + '.');
    if (st === 'EXPIRED') throw new Error('This pass expired (valid until ' + g.validUntil + ' on ' + g.date + '). Ask reception to issue a new pass.');
    updateRow_('GatePasses', g._row, { status: 'EXITED', exitAt: now_(), exitBy: u.username }); dirty_('GatePasses');
    audit_(u, 'GATEPASS_EXIT', 'GatePass', g.passNo, { student: g.studentName, person: g.personName });
    return { passNo: g.passNo, exitAt: now_() };
  } finally { lock.releaseLock(); }
}
function gatePassCancel_(p, u) {
  if (String(p.reason || '').trim().length < 3) throw new Error('Reason is required.');
  const g = cached_('GatePasses').filter(function (r) { return r.passNo === p.passNo; })[0]; if (!g) throw new Error('Gate pass not found.');
  if (g.status !== 'ISSUED') throw new Error('Only unused passes can be cancelled.');
  updateRow_('GatePasses', g._row, { status: 'CANCELLED', cancelReason: p.reason }); dirty_('GatePasses'); audit_(u, 'GATEPASS_CANCEL', 'GatePass', g.passNo, { reason: p.reason });
  return finalizeGatePass_(p.passNo, false);
}
