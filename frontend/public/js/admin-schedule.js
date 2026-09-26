// ============================================================
// 시간표: 홈 위젯(오늘 시간표), 캘린더, 템플릿, 일괄 등록
// CrossFit Box 관리자 - admin.html에서 분리된 스크립트
// ============================================================

async function deleteMonthEvents() {
  const y = scheduleYear, m = scheduleMonth;
  if (!confirm(`${y}년 ${m}월 수업 일정을 전체 삭제하시겠습니까?`)) return;
  const events = await adminFetch(`${API}/schedule/events/${y}/${m}`).then(r=>r.json());
  if (!events.length) { alert('삭제할 일정이 없습니다'); return; }
  for (const e of events) await adminFetch(`${API}/schedule/events/${e.id}`, {method:'DELETE'});
  alert(`${events.length}개 일정이 삭제되었습니다`);
  renderScheduleCalendar();
}

// ══════════════════════════════════════════════
// 템플릿 일괄 추가
// ══════════════════════════════════════════════
let bulkTimes = ['06:00', '07:00', '10:00', '19:00', '20:00'];

function selectBulkColor(color) {
  document.getElementById('bulk-color').value = color;
  document.querySelectorAll('#bulk-color-picker span').forEach(s => {
    s.style.outline = s.style.background === color ? '2px solid #333' : 'none';
    s.style.outlineOffset = '2px';
  });
}

function openBulkTemplateModal() {
  document.getElementById('bulk-class').value = '';
  selectBulkColor('#1a1a1a');
  renderBulkMatrix();
  document.getElementById('bulk-preview').textContent = '';
  document.getElementById('bulk-template-modal').classList.add('open');
}

function renderBulkMatrix() {
  const tbody = document.getElementById('bulk-matrix-body');
  tbody.innerHTML = bulkTimes.map(t => `
    <tr>
      <td style="padding:6px 8px;border:1px solid #e5e5e5;font-weight:500;color:#555;white-space:nowrap">
        ${escapeHtml(t)}
        <button onclick="bulkRemoveTime('${escapeJsAttr(t)}')" style="background:none;border:none;color:#ccc;cursor:pointer;font-size:11px;margin-left:4px">✕</button>
      </td>
      ${[0,1,2,3,4,5,6].map(d => `
        <td style="padding:4px;border:1px solid #e5e5e5;text-align:center">
          <input type="checkbox" id="bulk-${t}-${d}" onchange="updateBulkPreview()"
            style="width:16px;height:16px;cursor:pointer;accent-color:#1a1a1a">
        </td>`).join('')}
    </tr>`).join('');
  updateBulkPreview();
}

function bulkAddTime() {
  const t = document.getElementById('bulk-new-time').value;
  if (!t) return alert('시간을 선택해주세요');
  if (bulkTimes.includes(t)) return alert('이미 추가된 시간입니다');
  bulkTimes.push(t);
  bulkTimes.sort();
  document.getElementById('bulk-new-time').value = '';
  renderBulkMatrix();
}

function bulkRemoveTime(t) {
  bulkTimes = bulkTimes.filter(x => x !== t);
  renderBulkMatrix();
}

function bulkSelectRow() {
  // 마지막으로 추가된 시간 행 전체 선택
  const lastTime = bulkTimes[bulkTimes.length - 1];
  if (!lastTime) return;
  [0,1,2,3,4,5,6].forEach(d => {
    const cb = document.getElementById(`bulk-${lastTime}-${d}`);
    if (cb) cb.checked = true;
  });
  updateBulkPreview();
}

function bulkClearAll() {
  bulkTimes.forEach(t => [0,1,2,3,4,5,6].forEach(d => {
    const cb = document.getElementById(`bulk-${t}-${d}`);
    if (cb) cb.checked = false;
  }));
  updateBulkPreview();
}

function updateBulkPreview() {
  const items = getBulkItems();
  const el = document.getElementById('bulk-preview');
  if (!items.length) { el.textContent = '선택된 항목 없음'; return; }
  el.textContent = `${items.length}개 템플릿 추가 예정: ` +
    items.slice(0,5).map(i => `${['일','월','화','수','목','금','토'][i.dow]} ${i.start_time}`).join(', ') +
    (items.length > 5 ? ` 외 ${items.length-5}개` : '');
}

function getBulkItems() {
  const items = [];
  bulkTimes.forEach(t => [0,1,2,3,4,5,6].forEach(d => {
    const cb = document.getElementById(`bulk-${t}-${d}`);
    if (cb && cb.checked) items.push({dow: d, start_time: t});
  }));
  return items;
}

async function submitBulkTemplates() {
  const class_name = document.getElementById('bulk-class').value.trim();
  const color = document.getElementById('bulk-color').value;
  if (!class_name) return alert('수업명을 입력해주세요');
  const items = getBulkItems();
  if (!items.length) return alert('최소 하나 이상 선택해주세요');

  for (const item of items) {
    await adminFetch(API + '/schedule/templates', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({class_name, dow: item.dow, start_time: item.start_time, color})
    });
  }
  alert(`${items.length}개 템플릿이 추가되었습니다!`);
  closeModal('bulk-template-modal');
  loadTemplates();
}

// ══════════════════════════════════════════════
// 시간표
// ══════════════════════════════════════════════
let scheduleYear = new Date().getFullYear();
let scheduleMonth = new Date().getMonth() + 1;
let scheduleEvents = [];
let editingEventId = null;
let editingTemplateId = null;

const DOW_KR = ['일','월','화','수','목','금','토'];

function initSchedulePage() {
  renderScheduleCalendar();
  loadTemplates();
}

function changeScheduleMonth(delta) {
  scheduleMonth += delta;
  if (scheduleMonth > 12) { scheduleMonth = 1; scheduleYear++; }
  if (scheduleMonth < 1)  { scheduleMonth = 12; scheduleYear--; }
  renderScheduleCalendar();
}

async function renderScheduleCalendar() {
  document.getElementById('schedule-month-label').textContent = `${scheduleYear}년 ${scheduleMonth}월`;
  const [events, calEvents] = await Promise.all([
    adminFetch(`${API}/schedule/events/${scheduleYear}/${scheduleMonth}`).then(r => r.json()),
    adminFetch(`${API}/calendar/events/${scheduleYear}/${scheduleMonth}`).then(r => r.json()).catch(() => [])
  ]);
  scheduleEvents = events;

  // 수업 이벤트를 날짜별로 그룹핑
  const byDate = {};
  events.forEach(e => {
    if (!byDate[e.event_date]) byDate[e.event_date] = [];
    byDate[e.event_date].push(e);
  });

  // 공지 캘린더 이벤트를 날짜별로 그룹핑
  const calByDate = {};
  calEvents.forEach(e => {
    if (!calByDate[e.event_date]) calByDate[e.event_date] = [];
    calByDate[e.event_date].push(e);
  });

  const firstDay = new Date(scheduleYear, scheduleMonth - 1, 1).getDay();
  const daysInMonth = new Date(scheduleYear, scheduleMonth, 0).getDate();
  const today = todayKST();

  let html = '';

  // 요일 헤더
  ['일','월','화','수','목','금','토'].forEach((d,i) => {
    const color = i===0?'#c62828':i===6?'#1565c0':'#555';
    html += `<div style="text-align:center;font-size:11px;font-weight:600;color:${color};padding:4px 0;background:#f9f9f9;border-radius:4px">${d}</div>`;
  });

  // 앞 빈칸
  for (let i = 0; i < firstDay; i++) {
    html += `<div style="min-height:80px;background:#fafafa;border-radius:4px;border:1px solid #f0f0f0"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${scheduleYear}-${String(scheduleMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow = new Date(scheduleYear, scheduleMonth-1, d).getDay();
    const isToday = dateStr === today;
    const isWeekend = dow === 0 || dow === 6;
    const dayEvents = (byDate[dateStr] || []).sort((a,b) => a.start_time.localeCompare(b.start_time));
    const dayCals = calByDate[dateStr] || [];

    const evHtml = dayEvents.map(e => `
      <div onclick="event.stopPropagation();openEventModal(${e.id}, '${dateStr}')" style="background:${e.is_cancelled?'#eee':e.color};color:${e.is_cancelled?'#aaa':'#fff'};border-radius:3px;padding:2px 5px;font-size:10px;cursor:pointer;margin-bottom:2px;display:flex;justify-content:space-between;align-items:center;${e.is_cancelled?'text-decoration:line-through':''}">
        <span>${e.start_time.slice(0,5)} ${e.class_name}</span>
      </div>`).join('');

    // 공지 캘린더 이벤트 메모 뱃지
    const calHtml = dayCals.map(e => `
      <div onclick="event.stopPropagation();openSubTab('schedule-all','calendar')" title="${e.memo||e.title}" style="background:${e.color}22;color:${e.color};border:1px solid ${e.color}66;border-radius:3px;padding:1px 5px;font-size:9px;cursor:pointer;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600">
        ${e.title}${e.memo ? ' · ' + e.memo : ''}
      </div>`).join('');

    html += `<div style="min-height:80px;padding:4px;border:1px solid ${isToday?'#1a1a1a':'#f0f0f0'};border-radius:4px;background:${isToday?'#f0f8f0':'#fff'};cursor:pointer" onclick="openEventModal(null,'${dateStr}')">
      <div style="font-size:11px;font-weight:${isToday?'700':'400'};color:${isToday?'#1a1a1a':dow===0?'#c62828':dow===6?'#1565c0':'#333'};margin-bottom:4px">${d}</div>
      ${calHtml}
      ${evHtml}
    </div>`;
  }

  document.getElementById('schedule-calendar').innerHTML = html;
}

function openEventModal(eventId, dateStr) {
  editingEventId = eventId;
  const title = document.getElementById('event-modal-title');
  const submitBtn = document.getElementById('ev-submit-btn');

  if (eventId) {
    const ev = scheduleEvents.find(e => e.id === eventId);
    if (!ev) return;
    title.textContent = '일정 수정';
    submitBtn.textContent = '수정 완료';
    document.getElementById('ev-class').value = ev.class_name;
    document.getElementById('ev-date').value = ev.event_date;
    document.getElementById('ev-time').value = ev.start_time;
    document.getElementById('ev-color').value = ev.color || '#1a1a1a';
    document.getElementById('ev-memo').value = ev.memo || '';
    selectColor(ev.color || '#1a1a1a');
    document.getElementById('ev-delete-btn').style.display = 'block';
  } else {
    title.textContent = '일정 추가';
    submitBtn.textContent = '추가 완료';
    document.getElementById('ev-class').value = '';
    document.getElementById('ev-date').value = dateStr || '';
    document.getElementById('ev-time').value = '';
    document.getElementById('ev-color').value = '#1a1a1a';
    document.getElementById('ev-memo').value = '';
    selectColor('#1a1a1a');
    document.getElementById('ev-delete-btn').style.display = 'none';
  }
  document.getElementById('event-modal').classList.add('open');
}

function selectColor(color) {
  document.getElementById('ev-color').value = color;
  document.querySelectorAll('#ev-color-picker span').forEach(s => {
    s.style.border = s.style.background === color ? '2px solid #333' : '2px solid transparent';
  });
  // 직접 배경색 비교
  document.querySelectorAll('#ev-color-picker span').forEach(s => {
    const bg = s.style.background;
    s.style.outline = bg === color ? '2px solid #333' : 'none';
    s.style.outlineOffset = '1px';
  });
}

function selectTmColor(color) {
  document.getElementById('tm-color').value = color;
  document.querySelectorAll('#tm-color-picker span').forEach(s => {
    s.style.outline = s.style.background === color ? '2px solid #333' : 'none';
    s.style.outlineOffset = '1px';
  });
}

async function submitEvent() {
  const class_name = document.getElementById('ev-class').value.trim();
  const event_date = document.getElementById('ev-date').value;
  const start_time = document.getElementById('ev-time').value;
  const color = document.getElementById('ev-color').value;
  const memo = document.getElementById('ev-memo').value.trim();
  if (!class_name || !event_date || !start_time) return alert('수업명, 날짜, 시간은 필수입니다');

  if (editingEventId) {
    await adminFetch(`${API}/schedule/events/${editingEventId}`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({class_name, start_time, color, memo})
    });
  } else {
    await adminFetch(`${API}/schedule/events`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({event_date, class_name, start_time, color, memo})
    });
  }

  closeModal('event-modal');
  renderScheduleCalendar();
}

async function deleteEvent() {
  if (!editingEventId) return;
  if (!confirm('이 일정을 삭제하시겠습니까?')) return;
  await adminFetch(`${API}/schedule/events/${editingEventId}`, {method:'DELETE'});
  closeModal('event-modal');
  renderScheduleCalendar();
}

async function generateMonth() {
  if (!confirm(`${scheduleYear}년 ${scheduleMonth}월의 반복 일정을 채우시겠습니까?\n이미 있는 날짜는 중복 생성되지 않습니다.`)) return;
  const data = await adminFetch(`${API}/schedule/generate`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({year: scheduleYear, month: scheduleMonth})
  }).then(r => r.json());
  alert(data.message || data.error);
  renderScheduleCalendar();
}

// 템플릿 관리
async function loadTemplates() {
  const templates = await adminFetch(`${API}/schedule/templates`).then(r => r.json());
  const tbody = document.getElementById('templates-tbody');
  if (!templates.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">템플릿이 없습니다. 추가해주세요.</td></tr>'; return; }
  tbody.innerHTML = templates.map(t => `<tr>
    <td style="font-weight:500">${escapeHtml(t.class_name)}</td>
    <td>${DOW_KR[t.dow]}요일</td>
    <td>${escapeHtml(t.start_time)}</td>
    <td><span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:${escapeHtml(t.color)};vertical-align:middle"></span></td>
    <td><span class="badge ${t.is_active?'badge-active':'badge-done'}">${t.is_active?'활성':'비활성'}</span></td>
    <td style="display:flex;gap:4px">
      <button class="action-btn" onclick="openTemplateModal(${t.id})">수정</button>
      <button class="action-btn danger" onclick="deleteTemplate(${t.id})">삭제</button>
    </td>
  </tr>`).join('');
}

function openTemplateModal(id) {
  editingTemplateId = id;
  if (id) {
    adminFetch(`${API}/schedule/templates`).then(r => r.json()).then(templates => {
      const t = templates.find(t => t.id === id);
      if (!t) return;
      document.getElementById('template-modal-title').textContent = '템플릿 수정';
      document.getElementById('tm-submit-btn').textContent = '수정 완료';
      document.getElementById('tm-class').value = t.class_name;
      document.getElementById('tm-dow').value = t.dow;
      document.getElementById('tm-time').value = t.start_time;
      document.getElementById('tm-color').value = t.color || '#1a1a1a';
      selectTmColor(t.color || '#1a1a1a');
      document.getElementById('template-modal').classList.add('open');
    });
  } else {
    document.getElementById('template-modal-title').textContent = '템플릿 추가';
    document.getElementById('tm-submit-btn').textContent = '추가 완료';
    document.getElementById('tm-class').value = '';
    document.getElementById('tm-dow').value = '1';
    document.getElementById('tm-time').value = '';
    document.getElementById('tm-color').value = '#1a1a1a';
    selectTmColor('#1a1a1a');
    document.getElementById('template-modal').classList.add('open');
  }
}

async function submitTemplate() {
  const class_name = document.getElementById('tm-class').value.trim();
  const dow = parseInt(document.getElementById('tm-dow').value);
  const start_time = document.getElementById('tm-time').value;
  const color = document.getElementById('tm-color').value;
  if (!class_name || !start_time) return alert('수업명과 시간은 필수입니다');

  if (editingTemplateId) {
    await adminFetch(`${API}/schedule/templates/${editingTemplateId}`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({class_name, dow, start_time, color, is_active:1})
    });
  } else {
    await adminFetch(`${API}/schedule/templates`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({class_name, dow, start_time, color})
    });
  }
  closeModal('template-modal');
  loadTemplates();
}

async function deleteTemplate(id) {
  if (!confirm('이 템플릿을 삭제하시겠습니까?')) return;
  await adminFetch(`${API}/schedule/templates/${id}`, {method:'DELETE'});
  loadTemplates();
}