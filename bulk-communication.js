/* ═══════════════════════════════════════════════════════
   BULK COMMUNICATION — WhatsApp + Email
   Load this AFTER script-additions.js (it overrides the
   placeholder bulkEmail() stub defined there — see notes
   at the bottom of this file).

   Depends on globals already defined elsewhere in the app:
     selectedStudentIds (Set), window.students, escapeHtml(),
     toast(), checkAccess()
═══════════════════════════════════════════════════════ */

const BULK_WA_DEFAULT_TEMPLATE =
  "Hi {{name}}, this is Route2Uni. We have an update regarding your application ({{id}}). Please get in touch when you have a moment.";

const BULK_EMAIL_DEFAULT_SUBJECT = "Update on your application";
const BULK_EMAIL_DEFAULT_BODY =
  "Hi {{name}},\n\nWe wanted to share an update regarding your application ({{id}}).\n\n[Write your message here]\n\nBest regards,\nRoute2Uni Team";

function fillTemplate(tpl, student) {
  return (tpl || '')
    .replace(/{{\s*name\s*}}/gi, student['STUDENT NAME'] || 'there')
    .replace(/{{\s*id\s*}}/gi, student['STUDENT ID'] || student.id || '')
    .replace(/{{\s*course\s*}}/gi, student['COURSE'] || '')
    .replace(/{{\s*agent\s*}}/gi, student['AGENT'] || '');
}

// Adjust the default country code for your student base.
function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d+]/g, '');
  digits = digits.replace(/^00/, '+');
  if (!digits.startsWith('+')) digits = '+977' + digits.replace(/^0+/, '');
  return digits.length > 6 ? digits.replace('+', '') : null;
}

function getSelectedStudentObjects(ids) {
  const idArr = Array.from(ids || selectedStudentIds || []);
  return idArr
    .map(id => (window.students || []).find(s => (s['STUDENT ID'] || s.id) === id))
    .filter(Boolean);
}

/* ═══════════════════════════════════════════════════════
   BULK WHATSAPP
═══════════════════════════════════════════════════════ */
function bulkWhatsApp(ids) {
  if (!checkAccess(['Super Admin', 'Admin', 'Document Officer', 'Application User'])) {
    toast("Tapaisanga bulk WhatsApp garne permission chaina", 'error');
    return;
  }
  const targets = getSelectedStudentObjects(ids);
  if (!targets.length) { toast('No students selected', 'error'); return; }

  const withPhone = targets.filter(s => normalizePhone(s['MOBILE']));
  const skipped = targets.length - withPhone.length;
  if (!withPhone.length) { toast('None of the selected students have a usable mobile number', 'error'); return; }
  if (skipped) toast(skipped + ' student(s) skipped — no/invalid mobile number', 'info');

  openBulkWaQueue(withPhone);
}

let bulkWaQueue = [];

function openBulkWaQueue(students) {
  bulkWaQueue = students.map(s => ({ student: s, sent: false }));
  ensureBulkModalsExist();
  document.getElementById('bulk-wa-template').value = BULK_WA_DEFAULT_TEMPLATE;
  document.getElementById('bulk-wa-count').textContent = bulkWaQueue.length + ' recipient(s)';
  renderBulkWaQueue();
  document.getElementById('bulk-wa-overlay').style.display = 'flex';
}

function renderBulkWaQueue() {
  const wrap = document.getElementById('bulk-wa-list');
  if (!wrap) return;
  wrap.innerHTML = bulkWaQueue.map((item, i) => {
    const s = item.student;
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 20px;border-bottom:1px solid var(--border-subtle)">
      <div style="flex:1">
        <div style="font-weight:600;font-size:12.5px">${escapeHtml(s['STUDENT NAME'] || s.id)}</div>
        <div style="font-size:10.5px;color:var(--text-muted)">${escapeHtml(s['MOBILE'] || '')}</div>
      </div>
      <button class="btn btn-sm ${item.sent ? 'btn-secondary' : 'btn-primary'}" onclick="sendBulkWaItem(${i})">
        ${item.sent ? 'Sent ✓' : 'Open chat'}
      </button>
    </div>`;
  }).join('');
}

function sendBulkWaItem(i) {
  const item = bulkWaQueue[i];
  if (!item) return;
  const tpl = document.getElementById('bulk-wa-template')?.value || BULK_WA_DEFAULT_TEMPLATE;
  const msg = fillTemplate(tpl, item.student);
  const phone = normalizePhone(item.student['MOBILE']);
  window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank');
  item.sent = true;
  renderBulkWaQueue();
}

function sendAllBulkWa() {
  // Browsers block rapid-fire window.open() calls, so these are staggered.
  // The user needs to allow popups for this site for it to work reliably.
  bulkWaQueue.forEach((item, i) => {
    if (item.sent) return;
    setTimeout(() => sendBulkWaItem(i), i * 600);
  });
}

function closeBulkWaModal() {
  document.getElementById('bulk-wa-overlay').style.display = 'none';
}

/* ═══════════════════════════════════════════════════════
   BULK EMAIL
═══════════════════════════════════════════════════════ */
// Option A: fill in EmailJS credentials (https://www.emailjs.com) and
// include their CDN script in index.html: <script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
// Option B: leave serviceId as-is and implement a Firebase Cloud Function
// named "sendBulkEmail" — sendOneBulkEmail() below falls back to it.
const BULK_EMAIL_CONFIG = {
  serviceId: 'YOUR_EMAILJS_SERVICE_ID',     // ← from EmailJS dashboard > Email Services
  templateId: 'YOUR_EMAILJS_TEMPLATE_ID',   // ← from EmailJS dashboard > Email Templates
  publicKey: 'YOUR_EMAILJS_PUBLIC_KEY'      // ← from EmailJS dashboard > Account > General
};

if (window.emailjs && BULK_EMAIL_CONFIG.publicKey !== 'YOUR_EMAILJS_PUBLIC_KEY') {
  emailjs.init({ publicKey: BULK_EMAIL_CONFIG.publicKey });
}

function bulkEmail(ids) {
  if (!checkAccess(['Super Admin', 'Admin', 'Document Officer', 'Application User'])) {
    toast("Tapaisanga bulk email garne permission chaina", 'error');
    return;
  }
  const targets = getSelectedStudentObjects(ids);
  if (!targets.length) { toast('No students selected', 'error'); return; }

  const withEmail = targets.filter(s => s['EMAIL']);
  const skipped = targets.length - withEmail.length;
  if (!withEmail.length) { toast('None of the selected students have an email on file', 'error'); return; }
  if (skipped) toast(skipped + ' student(s) skipped — no email on file', 'info');

  openBulkEmailModal(withEmail);
}

let bulkEmailTargets = [];

function openBulkEmailModal(students) {
  bulkEmailTargets = students;
  ensureBulkModalsExist();
  document.getElementById('bulk-email-subject').value = BULK_EMAIL_DEFAULT_SUBJECT;
  document.getElementById('bulk-email-body').value = BULK_EMAIL_DEFAULT_BODY;
  document.getElementById('bulk-email-count').textContent = students.length + ' recipient(s)';
  document.getElementById('bulk-email-progress').textContent = '';
  document.getElementById('bulk-email-overlay').style.display = 'flex';
}

function closeBulkEmailModal() {
  document.getElementById('bulk-email-overlay').style.display = 'none';
}

async function sendOneBulkEmail(student, subject, body) {
  if (window.emailjs && BULK_EMAIL_CONFIG.serviceId !== 'YOUR_EMAILJS_SERVICE_ID') {
    return emailjs.send(BULK_EMAIL_CONFIG.serviceId, BULK_EMAIL_CONFIG.templateId, {
      to_email: student['EMAIL'],
      to_name: student['STUDENT NAME'],
      subject: fillTemplate(subject, student),
      message: fillTemplate(body, student)
    }, BULK_EMAIL_CONFIG.publicKey);
  }

  const sendEmailFn = firebase.functions().httpsCallable('sendBulkEmail');
  return sendEmailFn({
    to: student['EMAIL'],
    subject: fillTemplate(subject, student),
    body: fillTemplate(body, student),
    studentId: student['STUDENT ID'] || student.id
  });
}

async function submitBulkEmail() {
  const subject = document.getElementById('bulk-email-subject').value.trim();
  const body = document.getElementById('bulk-email-body').value.trim();
  if (!subject || !body) { toast('Subject and message are required', 'error'); return; }

  const btn = document.getElementById('bulk-email-send-btn');
  const progressEl = document.getElementById('bulk-email-progress');
  btn.disabled = true;

  let sent = 0, failed = 0;
  for (const student of bulkEmailTargets) {
    try {
      await sendOneBulkEmail(student, subject, body);
      sent++;
    } catch (e) {
      console.error('[bulkEmail] failed for', student['STUDENT ID'], e);
      failed++;
    }
    progressEl.textContent = `Sent ${sent + failed} / ${bulkEmailTargets.length}`;
    await new Promise(r => setTimeout(r, 250)); // light throttle
  }

  btn.disabled = false;
  if (failed === 0) {
    toast('Bulk email sent to ' + sent + ' student(s)', 'success');
    closeBulkEmailModal();
  } else {
    toast(`Sent ${sent}, failed ${failed} — check console`, 'error');
  }
}

/* ═══════════════════════════════════════════════════════
   LAZY-INJECTED MODAL MARKUP
   (kept in JS so you don't have to touch index.html at all)
═══════════════════════════════════════════════════════ */
function ensureBulkModalsExist() {
  if (!document.getElementById('bulk-wa-overlay')) {
    document.body.insertAdjacentHTML('beforeend', BULK_WA_MODAL_HTML);
  }
  if (!document.getElementById('bulk-email-overlay')) {
    document.body.insertAdjacentHTML('beforeend', BULK_EMAIL_MODAL_HTML);
  }
}

const BULK_WA_MODAL_HTML = `
<div id="bulk-wa-overlay" style="display:none;position:fixed;inset:0;background:rgba(10,15,30,.55);z-index:600;align-items:center;justify-content:center" onclick="if(event.target===this)closeBulkWaModal()">
  <div style="background:var(--surface-card);border-radius:var(--r-xl);max-width:480px;width:92%;max-height:82vh;display:flex;flex-direction:column;box-shadow:var(--shadow-xl)" onclick="event.stopPropagation()">
    <div style="padding:16px 20px;border-bottom:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:700;font-size:14px">Bulk WhatsApp</div>
        <div style="font-size:11px;color:var(--text-muted)" id="bulk-wa-count"></div>
      </div>
      <button onclick="closeBulkWaModal()" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-muted)">✕</button>
    </div>
    <div style="padding:16px 20px">
      <label class="form-label">Message template</label>
      <textarea id="bulk-wa-template" class="form-control" style="min-height:80px"></textarea>
      <div style="font-size:10.5px;color:var(--text-muted);margin-top:4px">Placeholders: {{name}}, {{id}}, {{course}}, {{agent}}</div>
    </div>
    <div id="bulk-wa-list" style="overflow-y:auto;border-top:1px solid var(--border-subtle);flex:1"></div>
    <div style="padding:12px 20px;border-top:1px solid var(--border-subtle);display:flex;justify-content:flex-end;gap:8px">
      <button class="btn btn-ghost btn-sm" onclick="closeBulkWaModal()">Close</button>
      <button class="btn btn-primary btn-sm" onclick="sendAllBulkWa()">Open all chats</button>
    </div>
  </div>
</div>`;

const BULK_EMAIL_MODAL_HTML = `
<div id="bulk-email-overlay" style="display:none;position:fixed;inset:0;background:rgba(10,15,30,.55);z-index:600;align-items:center;justify-content:center" onclick="if(event.target===this)closeBulkEmailModal()">
  <div style="background:var(--surface-card);border-radius:var(--r-xl);max-width:520px;width:92%;box-shadow:var(--shadow-xl)" onclick="event.stopPropagation()">
    <div style="padding:16px 20px;border-bottom:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:700;font-size:14px">Bulk Email</div>
        <div style="font-size:11px;color:var(--text-muted)" id="bulk-email-count"></div>
      </div>
      <button onclick="closeBulkEmailModal()" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-muted)">✕</button>
    </div>
    <div style="padding:16px 20px">
      <div class="form-group">
        <label class="form-label">Subject</label>
        <input id="bulk-email-subject" class="form-control" type="text">
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Message</label>
        <textarea id="bulk-email-body" class="form-control" style="min-height:150px"></textarea>
        <div style="font-size:10.5px;color:var(--text-muted);margin-top:4px">Placeholders: {{name}}, {{id}}, {{course}}, {{agent}}</div>
      </div>
    </div>
    <div style="padding:12px 20px;border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center">
      <span id="bulk-email-progress" style="font-size:11px;color:var(--text-muted)"></span>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="closeBulkEmailModal()">Cancel</button>
        <button class="btn btn-primary btn-sm" id="bulk-email-send-btn" onclick="submitBulkEmail()">Send</button>
      </div>
    </div>
  </div>
</div>`;

console.log('[bulk-communication.js] loaded — bulkEmail() and bulkWhatsApp() ready');
