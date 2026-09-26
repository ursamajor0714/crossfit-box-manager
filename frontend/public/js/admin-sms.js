// ============================================================
// 문자 발송 (SMS) — 발송 내역 / 템플릿 관리
// CrossFit Grove 관리자 - admin.html에서 분리된 스크립트
// ============================================================

let smsLogsAll = [];
let smsLogCategory = 'all';
let smsTemplatesAll = [];
let smsTplCategory = '체험';
let editingSmsTplId = null;

// ── 발송 내역 ──
async function loadSmsLogs() {
  smsLogsAll = await adminFetch(`${API}/sms/logs`).then(r => r.json()).catch(() => []);
  renderSmsLogs();
}

function filterSmsLogs(cat) {
  smsLogCategory = cat;
  ['all', '체험', '드랍인'].forEach(c => document.getElementById('sms-log-tab-' + c).classList.toggle('active', c === cat));
  renderSmsLogs();
}

function renderSmsLogs() {
  const rows = smsLogCategory === 'all' ? smsLogsAll : smsLogsAll.filter(l => l.category === smsLogCategory);
  document.getElementById('sms-logs-tbody').innerHTML = rows.length === 0
    ? '<tr><td colspan="6" class="empty-state">발송 내역이 없습니다</td></tr>'
    : rows.map(l => `<tr>
        <td style="color:#aaa;font-size:12px">${escapeHtml((l.sent_at || '').slice(0, 16))}</td>
        <td><span class="badge ${l.category === '체험' ? 'badge-active' : 'badge-assign'}">${escapeHtml(l.category)}</span></td>
        <td>${escapeHtml(l.name || '-')}</td>
        <td>${escapeHtml(l.phone)}</td>
        <td style="max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;text-decoration:underline dotted" onclick="openSmsLogContentModal(${l.id})">${escapeHtml(l.content)}</td>
        <td><span class="badge ${l.status === '성공' ? 'badge-active' : 'badge-overdue'}" title="${escapeHtml(l.error_msg || '')}">${escapeHtml(l.status)}</span></td>
      </tr>`).join('');
}

function openSmsLogContentModal(id) {
  const log = smsLogsAll.find(l => l.id === id);
  if (!log) return;
  document.getElementById('sms-log-content-detail').textContent = log.content;
  document.getElementById('sms-log-content-modal').classList.add('open');
}

// ── 템플릿 관리 ──
async function loadSmsTemplates() {
  smsTemplatesAll = await adminFetch(`${API}/sms/templates?category=${encodeURIComponent(smsTplCategory)}`).then(r => r.json()).catch(() => []);
  renderSmsTemplatesList();
}

function filterSmsTemplates(cat) {
  smsTplCategory = cat;
  ['체험', '드랍인'].forEach(c => document.getElementById('sms-tpl-tab-' + c).classList.toggle('active', c === cat));
  newSmsTemplate();
  loadSmsTemplates();
}

const SMS_CATEGORY_COLOR = { '체험': '#2e7d32', '드랍인': '#1565c0' };

function renderSmsTemplatesList() {
  const el = document.getElementById('sms-templates-list');
  el.innerHTML = smsTemplatesAll.length === 0
    ? '<div class="empty-state">저장된 템플릿이 없습니다</div>'
    : smsTemplatesAll.map(t => {
        const color = SMS_CATEGORY_COLOR[t.category] || '#888';
        const border = t.is_default ? `border:2px solid ${color};` : 'border:2px solid transparent;';
        return `<div class="alert-row" style="cursor:pointer;${border}border-radius:8px;padding:8px 10px;margin-bottom:4px" onclick="openSmsTemplateEditor(${t.id})" ondblclick="setSmsTemplateDefault(${t.id})" title="더블클릭하면 기본 템플릿으로 지정됩니다">
          <div><div class="alert-name">${escapeHtml(t.title)}</div><div class="alert-date">${escapeHtml((t.content || '').slice(0, 24))}${(t.content || '').length > 24 ? '…' : ''}</div></div>
          ${t.is_default ? `<div class="alert-date" style="color:${color};font-weight:600">기본</div>` : ''}
        </div>`;
      }).join('');
}

async function setSmsTemplateDefault(id) {
  await adminFetch(`${API}/sms/templates/${id}/default`, { method: 'PUT' });
  await loadSmsTemplates();
}

// 알리고 발송 기준(EUC-KR)과 동일하게 바이트 계산 — 90바이트 초과 시 LMS(장문)로 전환됨
function smsByteLength(str) {
  let bytes = 0;
  for (const ch of str) bytes += ch.charCodeAt(0) > 127 ? 2 : 1;
  return bytes;
}

function updateSmsByteCount(content) {
  const bytes = smsByteLength(content);
  const el = document.getElementById('sms-tpl-bytecount');
  el.textContent = bytes > 90 ? `${bytes} / 90 byte — 90바이트 초과, 장문문자(LMS)로 발송됩니다` : `${bytes} / 90 byte`;
  el.style.color = bytes > 90 ? '#e65100' : '#888';
}

function onSmsTplContentInput() {
  const content = document.getElementById('sms-tpl-content').value;
  document.getElementById('sms-tpl-preview').textContent = content || '문자 내용을 입력하세요';
  updateSmsByteCount(content);
}

function openSmsTemplateEditor(id) {
  const t = smsTemplatesAll.find(x => x.id === id);
  if (!t) return;
  editingSmsTplId = id;
  document.getElementById('sms-tpl-id').value = id;
  document.getElementById('sms-tpl-title').value = t.title;
  document.getElementById('sms-tpl-content').value = t.content;
  document.getElementById('sms-tpl-preview').textContent = t.content || '문자 내용을 입력하세요';
  document.getElementById('sms-tpl-delete-btn').style.display = 'block';
  updateSmsByteCount(t.content);
}

function newSmsTemplate() {
  editingSmsTplId = null;
  document.getElementById('sms-tpl-id').value = '';
  document.getElementById('sms-tpl-title').value = '';
  document.getElementById('sms-tpl-content').value = '';
  document.getElementById('sms-tpl-preview').textContent = '문자 내용을 입력하세요';
  document.getElementById('sms-tpl-delete-btn').style.display = 'none';
  updateSmsByteCount('');
}

async function saveSmsTemplate() {
  const title = document.getElementById('sms-tpl-title').value.trim();
  const content = document.getElementById('sms-tpl-content').value.trim();
  if (!title || !content) return alert('템플릿 제목과 내용을 입력해주세요');

  if (editingSmsTplId) {
    await adminFetch(`${API}/sms/templates/${editingSmsTplId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content }),
    });
  } else {
    await adminFetch(`${API}/sms/templates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: smsTplCategory, title, content }),
    });
  }
  await loadSmsTemplates();
  newSmsTemplate();
}

async function deleteSmsTemplate() {
  if (!editingSmsTplId || !confirm('이 템플릿을 삭제하시겠습니까?')) return;
  await adminFetch(`${API}/sms/templates/${editingSmsTplId}`, { method: 'DELETE' });
  await loadSmsTemplates();
  newSmsTemplate();
}
