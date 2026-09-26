// ============================================================
// 홀딩 / 특별 연장 관리
// CrossFit Grove 관리자 - admin-members.js에서 분리된 스크립트
// ============================================================

async function searchHoldMember() {
  const q = document.getElementById('hold-search').value.toLowerCase();
  if (!q) { document.getElementById('hold-search-result').innerHTML = ''; return; }
  const members = await adminFetch(API + '/members').then(r => r.json());
  document.getElementById('hold-search-result').innerHTML = members.filter(m => m.name.includes(q) && m.status==='active').slice(0,5).map(m =>
    `<div style="padding:8px 12px;border:1px solid #e5e5e5;border-radius:8px;cursor:pointer;margin-bottom:4px;font-size:13px" onclick="selectHoldMember(${m.id},'${escapeJsAttr(m.name)}','${m.end_date}')"><b>${escapeHtml(m.name)}</b> <span style="color:#888">${escapeHtml(m.phone||'')}</span> · 만료: ${m.end_date||'-'}</div>`).join('');
}

function selectHoldMember(id, name, endDate) {
  selectedHoldId = id;
  document.getElementById('hold-search').value = name;
  document.getElementById('hold-search-result').innerHTML = `<div style="padding:6px 12px;background:#e8f5e9;border-radius:8px;font-size:12px">선택됨: <b>${escapeHtml(name)}</b> · 현재 만료일: ${escapeHtml(endDate)}</div>`;
}

async function submitHolding() {
  if (!selectedHoldId) return alert('회원을 선택해주세요');
  const start_date = document.getElementById('hold-start').value;
  const end_date = document.getElementById('hold-end').value;
  if (!start_date || !end_date) return alert('시작일과 종료일을 입력해주세요');
  if (end_date < start_date) return alert('종료일은 시작일 이후여야 합니다');

  const days = Math.round((new Date(end_date) - new Date(start_date)) / 86400000) + 1;

  const data = await adminFetch(API + '/holding-requests?admin=1', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({member_id: selectedHoldId, days, start_date})
  }).then(r=>r.json());
  if (data.error) return alert(data.error);

  alert(`${data.message}\n새 만료일: ${data.new_end_date}`);
  selectedHoldId = null;
  document.getElementById('hold-search').value = '';
  document.getElementById('hold-search-result').innerHTML = '';
  document.getElementById('hold-start').value = '';
  document.getElementById('hold-end').value = '';
  loadHoldingList();
}

let selectedSpecialId = null;

async function searchSpecialMember() {
  const q = document.getElementById('special-search').value.toLowerCase();
  if (!q) { document.getElementById('special-search-result').innerHTML = ''; return; }
  const members = await adminFetch(API + '/members').then(r => r.json());
  document.getElementById('special-search-result').innerHTML = members.filter(m => m.name.includes(q) && m.status==='active').slice(0,5).map(m =>
    `<div style="padding:8px 12px;border:1px solid #e5e5e5;border-radius:8px;cursor:pointer;margin-bottom:4px;font-size:13px" onclick="selectSpecialMember(${m.id},'${escapeJsAttr(m.name)}','${m.end_date}')"><b>${escapeHtml(m.name)}</b> <span style="color:#888">${escapeHtml(m.phone||'')}</span> · 만료: ${m.end_date||'-'}</div>`).join('');
}

function selectSpecialMember(id, name, endDate) {
  selectedSpecialId = id;
  document.getElementById('special-search').value = name;
  document.getElementById('special-search-result').innerHTML = `<div style="padding:6px 12px;background:#e8f5e9;border-radius:8px;font-size:12px">선택됨: <b>${escapeHtml(name)}</b> · 현재 만료일: ${escapeHtml(endDate)}</div>`;
}

async function submitSpecialExtension() {
  if (!selectedSpecialId) return alert('회원을 선택해주세요');
  const start_date = document.getElementById('special-start').value;
  const end_date = document.getElementById('special-end').value;
  const reason = document.getElementById('special-reason').value.trim();
  if (!start_date || !end_date) return alert('시작일과 종료일을 입력해주세요');
  if (end_date < start_date) return alert('종료일은 시작일 이후여야 합니다');

  const data = await adminFetch(API + '/special-extensions', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({member_id: selectedSpecialId, start_date, end_date, reason})
  }).then(r=>r.json());
  if (data.error) return alert(data.error);

  alert(`${data.message}\n새 만료일: ${data.new_end_date}`);
  selectedSpecialId = null;
  document.getElementById('special-search').value = '';
  document.getElementById('special-search-result').innerHTML = '';
  document.getElementById('special-start').value = '';
  document.getElementById('special-end').value = '';
  document.getElementById('special-reason').value = '';
  loadSpecialExtensions();
}

async function loadSpecialExtensions() {
  const list = await adminFetch(API + '/special-extensions').then(r => r.json());
  const tbody = document.getElementById('special-tbody');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-state">특별 연장 내역이 없습니다</td></tr>'; return; }
  tbody.innerHTML = list.map(s => `<tr>
    <td style="font-weight:500">${escapeHtml(s.member_name)||'-'}</td>
    <td>${s.start_date} ~ ${s.end_date} <span style="color:#888;font-size:12px">(${s.days}일)</span></td>
    <td style="color:#888">${escapeHtml(s.reason)||'-'}</td>
    <td><button class="action-btn danger" onclick="cancelSpecialExtension(${s.id})">취소</button></td>
  </tr>`).join('');
}

async function cancelSpecialExtension(id) {
  if (!confirm('이 특별 연장을 취소하시겠습니까?\n해당 기간만큼 만료일이 줄어듭니다.')) return;
  const data = await adminFetch(API + '/special-extensions/' + id, {method:'DELETE'}).then(r=>r.json());
  if (data.error) return alert(data.error);
  alert('취소되었습니다');
  loadSpecialExtensions();
}



let allHoldings = [];

async function loadHoldingList() {
  allHoldings = await adminFetch(API + '/holding-requests').then(r => r.json());
  filterHoldingList();
}

function filterHoldingList() {
  const q = (document.getElementById('holding-search').value || '').toLowerCase();
  const f = document.getElementById('holding-filter-status').value;
  const today = todayKST();

  let list = allHoldings.filter(h => {
    const matchQ = (h.member_name || '').toLowerCase().includes(q);
    let matchF = true;
    if (f === 'approved') matchF = h.status === 'approved';
    if (f === 'upcoming') matchF = h.start_date && h.start_date > today;
    return matchQ && matchF;
  });

  const tbody = document.getElementById('holding-tbody');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-state">홀딩 내역이 없습니다</td></tr>'; return; }
  // 날짜 내림차순 정렬
  list = list.slice().sort((a,b) => (b.start_date||'').localeCompare(a.start_date||''));
  tbody.innerHTML = list.map(h => {
    const upcoming = h.start_date && h.start_date > today;
    const badge = upcoming
      ? ' <span style="color:#1565c0;font-size:11px">(예정)</span>'
      : (h.start_date && h.start_date < today ? ' <span style="color:#aaa;font-size:11px">(지남)</span>' : '');
    const cancelBtn = `<button class="action-btn danger" onclick="cancelAdminHolding(${h.id},'${h.start_date||''}')">삭제</button>`;
    return `<tr>
      <td style="font-weight:500">${escapeHtml(h.member_name)||'-'}</td>
      <td id="hold-date-cell-${h.id}"><span onclick="editHoldingDate(${h.id},'${h.start_date||''}')" title="클릭해서 날짜 수정" style="cursor:pointer;border-bottom:1px dashed #999">${h.start_date||'-'}</span>${badge}</td>
      <td style="color:#888;font-size:12px">${h.created_at?.slice(0,10)||'-'}</td>
      <td>${cancelBtn}</td>
    </tr>`;
  }).join('');
}

// 날짜 셀 클릭 → 날짜 입력 + 저장/취소 버튼으로 전환
function editHoldingDate(id, current) {
  const cell = document.getElementById('hold-date-cell-' + id);
  if (!cell) return;
  cell.innerHTML = `<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
    <input type="date" id="hold-date-input-${id}" value="${current || todayKST()}" style="padding:4px 6px;border:1px solid #ccc;border-radius:6px;font-size:12px">
    <button class="action-btn" onclick="saveHoldingDate(${id})">저장</button>
    <button class="action-btn" onclick="filterHoldingList()">취소</button>
  </div>`;
  document.getElementById('hold-date-input-' + id).focus();
}

async function saveHoldingDate(id) {
  const input = document.getElementById('hold-date-input-' + id);
  if (!input) return;
  const start_date = input.value;
  if (!start_date) return alert('날짜를 선택해주세요');

  const data = await adminFetch(API + '/holding-requests/' + id + '/date', {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ start_date })
  }).then(r => r.json());
  if (data.error) return alert(data.error);

  alert(data.message);
  loadHoldingList();
}

async function cancelAdminHolding(id, startDate) {
  const past = startDate && startDate <= todayKST();
  const note = past
    ? '\n(이미 시작된 홀딩입니다. 삭제하면 만료일이 하루 줄어듭니다.)'
    : '\n만료일이 하루 줄어듭니다.';
  if (!confirm('이 홀딩을 삭제하시겠습니까?' + note)) return;
  const data = await adminFetch(API + '/holding-requests/' + id + '?admin=1', {method:'DELETE'}).then(r=>r.json());
  if (data.error) return alert(data.error);
  alert(data.message || '삭제되었습니다');
  loadHoldingList();
}

function goToHoldingTab(name) {
  closeModal('member-modal');
  openPage('members');
  setTimeout(() => {
    const btn = document.querySelector('#page-members > .sub-tabs .sub-tab:nth-child(4)');
    openMemberSubTab('holding', btn);
    setTimeout(() => {
      document.getElementById('holding-search').value = name;
      filterHoldingList();
    }, 50);
  }, 50);
}
