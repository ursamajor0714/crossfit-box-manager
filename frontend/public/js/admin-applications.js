// ============================================================
// 신청 관리: 홈 위젯(오늘의 신청) + 전체 신청 내역
// CrossFit Grove 관리자 - admin-schedule.js에서 분리된 스크립트
// ============================================================

let appViewDate = null; // 신청 카드에서 보고 있는 날짜 (null=오늘)

function changeAppDay(delta) {
  if (delta === 0) { appViewDate = todayKST(); }
  else {
    const base = appViewDate || todayKST();
    appViewDate = addDaysKST(base, delta);
  }
  loadTodayApplications();
}

async function loadTodayApplications() {
  const viewDate = appViewDate || todayKST();
  appViewDate = viewDate;
  const apps = await adminFetch(`${API}/applications`).then(r=>r.json()).catch(()=>[]);
  const el = document.getElementById('today-applications-list');
  if (!el) return;
  // 날짜 라벨
  const label = document.getElementById('app-day-label');
  if (label) {
    const today = todayKST();
    const dow = ['일','월','화','수','목','금','토'][new Date(viewDate).getDay()];
    const [, mm, dd] = viewDate.split('-');
    label.textContent = `${parseInt(mm)}/${parseInt(dd)} (${dow})` + (viewDate===today ? ' · 오늘' : '');
  }
  // 방문 희망일 기준 필터 + 희망 수업시간 순 정렬
  const dayApps = apps
    .filter(a => (a.preferred_date||'') === viewDate)
    .sort((a,b) => (a.class_time||'99:99').localeCompare(b.class_time||'99:99'));
  if (!dayApps.length) { el.innerHTML = '<div class="empty-state" style="padding:16px">이 날 방문 예정인 드랍인·체험이 없습니다</div>'; return; }
  el.innerHTML = dayApps.map(a => {
    const isDrop = a.type === '드랍인';
    const badge = `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:${isDrop?'#e8f5e9':'#fff3e0'};color:${isDrop?'#2e7d32':'#e65100'}">${a.type}</span>`;
    const timeStr = a.class_time
      ? `<span style="font-weight:700;font-size:14px;color:#1a1a1a">${escapeHtml(a.class_time)}</span>${a.class_name?`<span style="font-size:12px;color:#888">${escapeHtml(a.class_name)}</span>`:''}`
      : `<span style="font-size:12px;color:#bbb">시간 미선택</span>`;
    const appliedAt = a.created_at ? `<span style="font-size:11px;color:#bbb;margin-left:auto">신청 ${a.created_at.slice(5,16).replace('T',' ')}</span>` : '';
    return `<div onclick="goToApplications()" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f5f5f5;cursor:pointer" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''">
      ${timeStr}
      ${badge}
      <span style="font-weight:600;font-size:14px">${escapeHtml(a.name)}</span>
      <span style="font-size:13px;color:#888">${escapeHtml(a.phone||'')}</span>
      ${appliedAt}
    </div>`;
  }).join('');
}

function goToApplications() {
  openPage('schedule-all');
  setTimeout(()=>openSubTab('schedule-all','applications'), 50);
}

// ══════════════════════════════════════════════
// 신청 관리
let allApplications = [];
let appTypeFilter = 'all';
let appSortField = 'preferred_date'; // 'preferred_date'(수업날짜) | 'created_at'(신청시각)
let appSortDir = 1; // 1=오름차순, -1=내림차순

function toggleAppSort(field) {
  if (appSortField === field) appSortDir *= -1;
  else { appSortField = field; appSortDir = 1; }
  document.querySelectorAll('[id^="appsort-"]').forEach(el => el.textContent = '↕');
  const el = document.getElementById('appsort-' + field);
  if (el) el.textContent = appSortDir === 1 ? '↑' : '↓';
  renderApplications();
}

async function loadApplications() {
  allApplications = await adminFetch(API + '/applications').then(r => r.json());
  renderApplications();
}

function filterApplications(type) {
  appTypeFilter = type;
  document.querySelectorAll('[id^="app-tab-"]').forEach(b => b.classList.remove('active'));
  document.getElementById('app-tab-' + type).classList.add('active');
  renderApplications();
}

function renderApplications() {
  const q = (document.getElementById('app-search').value || '').toLowerCase();
  const statusF = document.getElementById('app-filter-status').value;
  let list = allApplications.filter(a => {
    const matchType = appTypeFilter === 'all' || a.type === appTypeFilter;
    const matchQ = (a.name||'').toLowerCase().includes(q) || (a.phone||'').includes(q);
    const matchStatus = statusF === 'all' || a.status === statusF;
    return matchType && matchQ && matchStatus;
  });
  list = list.slice().sort((a,b) => {
    if (appSortField === 'created_at') {
      const va = a.created_at||'', vb = b.created_at||'';
      return va < vb ? -appSortDir : va > vb ? appSortDir : 0;
    }
    // 수업날짜 기준: 날짜 → 수업시간 순
    const va = (a.preferred_date||'') + ' ' + (a.class_time||'99:99');
    const vb = (b.preferred_date||'') + ' ' + (b.class_time||'99:99');
    return va < vb ? -appSortDir : va > vb ? appSortDir : 0;
  });
  const tbody = document.getElementById('applications-tbody');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="10" class="empty-state">신청 내역이 없습니다</td></tr>'; return; }
  tbody.innerHTML = list.map(a => {
    // 드랍인만 결제 입력칸 표시 (체험은 빈칸)
    let payCell = '<span style="color:#bbb">-</span>';
    if (a.type === '드랍인') {
      const amt = a.amount || 0;
      payCell = `<div style="display:flex;gap:4px;align-items:center">
        <input type="number" value="${amt||''}" placeholder="금액" onchange="updateDropinPayment(${a.id}, this.value, null)" style="width:72px;padding:4px 6px;border:1px solid #e5e5e5;border-radius:6px;font-size:12px">
        <select onchange="updateDropinPayment(${a.id}, null, this.value)" style="padding:4px 6px;border:1px solid #e5e5e5;border-radius:6px;font-size:12px;background:#fff">
          <option value="카드" ${a.payment_method==='카드'?'selected':''}>카드</option>
          <option value="계좌이체" ${a.payment_method==='계좌이체'?'selected':''}>계좌이체</option>
          <option value="현금" ${a.payment_method==='현금'?'selected':''}>현금</option>
        </select>
      </div>`;
    }
    return `<tr>
    <td><span class="badge ${a.type==='체험'?'badge-active':'badge-assign'}">${escapeHtml(a.type)}</span></td>
    <td style="font-weight:500">${escapeHtml(a.name)}</td>
    <td style="color:#888">${escapeHtml(a.phone)||'-'}</td>
    <td>${a.preferred_date||'-'}</td>
    <td>${a.class_time?`<b>${escapeHtml(a.class_time)}</b>${a.class_name?' '+escapeHtml(a.class_name):''}`:'<span style="color:#bbb">-</span>'}</td>
    <td style="color:#888;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${a.memo?'cursor:pointer;text-decoration:underline dotted':''}" ${a.memo?`onclick="openAppMemoModal(${a.id})"`:''}>${escapeHtml(a.memo)||'-'}</td>
    <td style="color:#aaa;font-size:12px">${(a.created_at||'').slice(0,16).replace('T',' ')}</td>
    <td>${payCell}</td>
    <td><select onchange="updateApplicationStatus(${a.id},this.value)" style="padding:4px 8px;border:1px solid #e5e5e5;border-radius:6px;font-size:12px;background:#fff">
      <option value="pending" ${a.status==='pending'?'selected':''}>대기</option>
      <option value="confirmed" ${a.status==='confirmed'?'selected':''}>확인</option>
      <option value="done" ${a.status==='done'?'selected':''}>완료</option>
      <option value="registered" ${a.status==='registered'?'selected':''}>등록</option>
    </select></td>
    <td><button class="action-btn danger" onclick="deleteApplication(${a.id})">삭제</button></td>
  </tr>`;
  }).join('');
}

function openAppMemoModal(id) {
  const a = allApplications.find(a => a.id === id);
  if (!a) return;
  document.getElementById('app-memo-content').textContent = a.memo || '';
  document.getElementById('app-memo-modal').classList.add('open');
}

// 드랍인 결제 금액/수단 저장 (금액만 입력해도 매출 반영, 상태 무관)
async function updateDropinPayment(id, amount, payment_method) {
  const a = allApplications.find(x => x.id === id);
  if (!a) return;
  const body = {};
  if (amount !== null) { body.amount = parseInt(amount) || 0; a.amount = body.amount; }
  if (payment_method !== null) { body.payment_method = payment_method; a.payment_method = payment_method; }
  await adminFetch(API + '/applications/' + id, {
    method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
  });
  // 매출에 즉시 반영되도록 홈 통계 갱신 (홈이 로드돼 있으면)
  if (typeof loadStats === 'function' && document.getElementById('page-home')?.classList.contains('active')) {
    loadStats();
  }
}

async function updateApplicationStatus(id, status) {
  await adminFetch(API + '/applications/' + id, {
    method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status})
  });
  const a = allApplications.find(a => a.id === id);
  if (a) a.status = status;
}

async function deleteApplication(id) {
  if (!confirm('이 신청을 삭제하시겠습니까?')) return;
  await adminFetch(API + '/applications/' + id, {method:'DELETE'});
  allApplications = allApplications.filter(a => a.id !== id);
  renderApplications();
}
