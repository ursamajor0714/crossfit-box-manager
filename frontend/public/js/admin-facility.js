// ============================================================
// 시설: 락커/운동복
// CrossFit Grove 관리자 - admin.html에서 분리된 스크립트
// 모든 함수/변수는 전역 스코프 공유 (일반 <script> 로드)
// ============================================================

// 최상위 락커/운동복 탭 전환 (page-locker-uniform 직계 sub-page 토글)
function openLU(which, btn) {
  const page = document.getElementById('page-locker-uniform');
  if (!page) return;
  document.querySelectorAll('#lu-top-tabs .sub-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('locker-inner').classList.toggle('active', which === 'locker');
  document.getElementById('uniform-inner').classList.toggle('active', which === 'uniform');
  if (which === 'locker') loadLockers();
  else loadUniforms();
}

async function loadLockers() {
  const lockers = await adminFetch(API + '/lockers').then(r => r.json());
  window._lockerData = lockers;
  const used = lockers.filter(l => l.status === 'active' || l.status === 'staff').length;
  document.getElementById('locker-count-text').textContent = `사용 중 ${used}개 / 총 152개`;
  document.getElementById('locker-grid').innerHTML = lockers.map(l => {
    let cls = 'locker-empty';
    if (l.status === 'active') cls = 'locker-active';
    if (l.status === 'staff') cls = 'locker-staff';
    return `<div class="locker ${cls}" onclick='openLockerModal(${escapeJsonForAttr(JSON.stringify(l))})' title="${l.id}번${l.member_name?' - '+escapeHtml(l.member_name):''}">${l.id}</div>`;
  }).join('');
}

async function loadLockerHistory() {
  const history = await adminFetch(API + '/lockers/history').then(r => r.json());
  window._lockerHistory = history;
  const tbody = document.getElementById('locker-history-tbody');
  if (!history.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state">이력이 없습니다</td></tr>'; return; }
  tbody.innerHTML = history.map(h => `<tr>
    <td style="color:#888;font-size:12px">${h.created_at}</td>
    <td style="font-weight:500">${h.locker_id}번</td>
    <td>${escapeHtml(h.member_name)||'-'}</td>
    <td><span class="badge ${h.action==='배정'?'badge-assign':'badge-return'}">${escapeHtml(h.action)}</span></td>
    <td>${h.start_date||'-'}</td>
    <td>${h.end_date||'-'}</td>
    <td style="${(h.amount||0)<0?'color:#c62828;font-weight:600':''}">${(h.amount||0)<0?'환불 ':''}${(h.amount||0).toLocaleString('ko-KR')}원</td>
    <td style="display:flex;gap:4px"><button class="action-btn" onclick="editLockerHistory(${h.id})">수정</button><button class="action-btn danger" onclick="deleteLockerHistory(${h.id})">삭제</button></td>
  </tr>`).join('');
}

// 락커 이력 수정 모달 열기
function editLockerHistory(id) {
  const h = (window._lockerHistory || []).find(x => x.id === id);
  if (!h) return;
  document.getElementById('lh-id').value = h.id;
  document.getElementById('lh-member').value = h.member_name || '';
  document.getElementById('lh-start').value = h.start_date || '';
  document.getElementById('lh-end').value = h.end_date || '';
  document.getElementById('lh-amount').value = (h.amount != null ? h.amount : 0);
  document.getElementById('locker-history-modal').classList.add('open');
}

// 락커 이력 수정 저장
async function submitLockerHistory() {
  const id = document.getElementById('lh-id').value;
  const body = {
    member_name: document.getElementById('lh-member').value.trim() || null,
    start_date: document.getElementById('lh-start').value || null,
    end_date: document.getElementById('lh-end').value || null,
    amount: parseInt(document.getElementById('lh-amount').value) || 0,
  };
  const data = await adminFetch(API + '/lockers/history/' + id, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).then(r => r.json()).catch(() => ({}));
  if (data.error) return alert(data.error);
  closeModal('locker-history-modal');
  loadLockerHistory();
}

// 락커 이력 단건 삭제 (잘못 입력한 기록 정리용)
async function deleteLockerHistory(id) {
  if (!confirm('이 이력 기록을 삭제하시겠습니까?\n(기록만 지웁니다. 락커 배정 상태와 매출에는 영향 없습니다.)')) return;
  const data = await adminFetch(API + '/lockers/history/' + id, { method: 'DELETE' }).then(r => r.json()).catch(() => ({}));
  if (data.error) return alert(data.error);
  loadLockerHistory();
}

function openLockerModal(l) {
  document.getElementById('locker-modal-title').textContent = `${l.id}번 락커`;
  const el = document.getElementById('locker-modal-content');
  if (!l.member_name) {
    const today = todayKST();
    el.innerHTML = `
      <div style="color:#888;font-size:13px;margin-bottom:16px">비어있는 락커입니다. 회원을 배정해주세요.</div>
      <div class="form-grid">
        <div class="form-group form-full"><label>회원 검색 (없으면 직접 입력)</label><input type="text" id="la-search" placeholder="이름 입력..." oninput="searchLockerMember()"><div id="la-search-result" style="margin-top:6px"></div></div>
        <div class="form-group"><label>시작일</label><input type="date" id="la-start" value="${today}" onchange="calcLockerEndDate()"></div>
        <div class="form-group"><label>종료일</label><input type="date" id="la-end"></div>
        <div class="form-group"><label>개월수 (종료일 자동계산용)</label><select id="la-months" onchange="calcLockerEndDate()"><option value="">직접 입력</option><option value="1">1개월</option><option value="3">3개월</option><option value="6">6개월</option><option value="11">11개월</option><option value="12">12개월</option></select></div>
        <div class="form-group"><label>금액</label><input type="number" id="la-amount" placeholder="개월수 × 5,000"></div>
        <div class="form-group"><label>결제 수단</label><select id="la-payment"><option>카드</option><option>계좌이체</option><option>서비스</option><option>현금</option></select></div>
      </div>
      <button class="submit-btn" onclick="assignLocker(${l.id})">배정 완료</button>`;
  } else {
    el.innerHTML = `
      <div class="form-grid" style="font-size:13px;margin-bottom:20px">
        <div><span style="color:#888">회원명</span><br><b>${escapeHtml(l.member_name)}</b></div>
        <div><span style="color:#888">구분</span><br><b>${l.status==='staff'?'스태프':'회원'}</b></div>
        <div><span style="color:#888">시작일</span><br><b>${l.start_date||'-'}</b></div>
        <div><span style="color:#888">만료일</span><br><b id="locker-end-display">${l.end_date||'-'}</b></div>
        <div><span style="color:#888">개월수</span><br><b>${l.months||'-'}개월</b></div>
        <div><span style="color:#888">금액</span><br><b>${(l.amount||0).toLocaleString('ko-KR')}원</b></div>
      </div>

      <div class="section-box" style="margin-bottom:16px">
        <div class="section-box-title">🔄 락커 연장</div>
        <div class="form-grid">
          <div class="form-group">
            <label>연장 개월수</label>
            <select id="extend-months">
              <option value="1">1개월</option>
              <option value="3" selected>3개월</option>
              <option value="6">6개월</option>
              <option value="11">11개월</option>
              <option value="12">12개월</option>
            </select>
          </div>
          <div class="form-group">
            <label>연장 후 만료일</label>
            <div id="extend-preview" style="padding:9px 0;font-size:13px;font-weight:500;color:#2e7d32"></div>
          </div>
          <div class="form-group">
            <label>금액</label>
            <input type="number" id="extend-amount" placeholder="개월수 × 5,000">
          </div>
          <div class="form-group">
            <label>결제 수단</label>
            <select id="extend-payment"><option>카드</option><option>계좌이체</option><option>현금</option><option>서비스</option></select>
          </div>
        </div>
        <button class="submit-btn" style="margin-top:12px" onclick="extendLocker(${l.id},'${l.end_date}')">연장 완료</button>
      </div>

      <div style="display:flex;gap:8px">
        <button class="action-btn danger" style="flex:1;padding:10px" onclick="returnLocker(${l.id})">반납 처리</button>
        <button class="action-btn" style="flex:1;padding:10px" onclick="closeModal('locker-modal')">닫기</button>
      </div>`;

    // 연장 미리보기 초기화 및 이벤트
    const endDate = l.end_date || null;
    updateExtendPreview(endDate);
    document.getElementById('extend-months').addEventListener('change', () => updateExtendPreview(endDate));
  }
  document.getElementById('locker-modal').classList.add('open');
}

async function searchLockerMember() {
  const q = document.getElementById('la-search').value.toLowerCase();
  if (!q) { document.getElementById('la-search-result').innerHTML = ''; return; }
  const members = await adminFetch(API + '/members').then(r => r.json());
  document.getElementById('la-search-result').innerHTML = members.filter(m => m.name.includes(q) && m.status==='active').slice(0,5).map(m =>
    `<div style="padding:8px 12px;border:1px solid #e5e5e5;border-radius:8px;cursor:pointer;margin-bottom:4px;font-size:13px" onclick="selectLockerMember(${m.id},'${escapeJsAttr(m.name)}')"><b>${escapeHtml(m.name)}</b> <span style="color:#888">${escapeHtml(m.phone||'')}</span></div>`).join('');
}

function selectLockerMember(id, name) {
  selectedLockerMember = {id, name};
  document.getElementById('la-search').value = name;
  document.getElementById('la-search-result').innerHTML = `<div style="padding:6px 12px;background:#e8f5e9;border-radius:8px;font-size:12px">선택됨: <b>${escapeHtml(name)}</b></div>`;
}

function calcLockerEndDate() {
  const start = document.getElementById('la-start').value;
  const months = document.getElementById('la-months').value;
  if (!start || !months) return;
  const end = new Date(start);
  end.setMonth(end.getMonth() + parseInt(months));
  document.getElementById('la-end').value = end.toISOString().split('T')[0];
  document.getElementById('la-amount').value = parseInt(months) * LOCKER_MONTHLY_FEE;
}

async function assignLocker(id) {
  const member = selectedLockerMember;
  const name = member ? member.name : document.getElementById('la-search').value.trim();
  if (!name) return alert('회원 이름을 입력해주세요');
  const start = document.getElementById('la-start').value;
  const end = document.getElementById('la-end').value;
  if (!start || !end) return alert('시작일과 종료일을 입력해주세요');
  const months = document.getElementById('la-months').value || null;
  await adminFetch(API + '/lockers/' + id, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
    member_id: member?.id || null, member_name: name,
    start_date: start, end_date: end,
    months: months ? parseInt(months) : null,
    amount: parseInt(document.getElementById('la-amount').value)||0,
    payment_method: document.getElementById('la-payment').value, status:'active'
  })});
  selectedLockerMember = null;
  closeModal('locker-modal');
  loadLockers();
  alert(`${id}번 락커 → ${name} 배정 완료!`);
}

function updateExtendPreview(currentEndDate) {
  const el = document.getElementById('extend-preview');
  if (!el || !currentEndDate || currentEndDate === '-') return;
  const months = parseInt(document.getElementById('extend-months').value);
  const newEnd = new Date(currentEndDate);
  newEnd.setMonth(newEnd.getMonth() + months);
  el.textContent = newEnd.toISOString().split('T')[0];
  document.getElementById('extend-amount').value = months * LOCKER_MONTHLY_FEE;
}

async function extendLocker(id, currentEndDate) {
  const months = parseInt(document.getElementById('extend-months').value);
  const amount = parseInt(document.getElementById('extend-amount').value) || 0;
  const payment = document.getElementById('extend-payment').value;
  if (!currentEndDate || currentEndDate === '-') return alert('만료일 정보가 없습니다');

  const newEnd = new Date(currentEndDate);
  newEnd.setMonth(newEnd.getMonth() + months);
  const newEndStr = newEnd.toISOString().split('T')[0];

  // 락커 만료일 업데이트
  await adminFetch(API + '/lockers/' + id + '/extend', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ months, new_end_date: newEndStr, amount, payment_method: payment })
  });

  closeModal('locker-modal');
  loadLockers();
  alert(`연장 완료!\n새 만료일: ${newEndStr}`);
}

// 남은 개월수 계산 (오늘~만료일)
function monthsLeft(endDate) {
  if (!endDate) return 0;
  const today = new Date(todayKST());
  const end = new Date(endDate);
  const diff = Math.ceil((end - today) / (30*86400000));
  return Math.max(0, diff);
}

// 남은 기간을 "N개월 M일" 텍스트로 (만료일 - 오늘)
function remainingText(endDate) {
  if (!endDate) return '-';
  const today = new Date(todayKST());
  const end = new Date(endDate);
  let days = Math.max(0, Math.round((end - today) / 86400000));
  const months = Math.floor(days / 30);
  const restDays = days % 30;
  if (months && restDays) return `${months}개월 ${restDays}일`;
  if (months) return `${months}개월`;
  return `${restDays}일`;
}

let refundContext = null; // { type:'locker'|'member', id, name }

function openRefundModal(type, id, name, endDate, perMonth) {
  refundContext = { type, id };
  const titleMap = { locker:'락커 반납·환불', member:'회원권 환불' };
  document.getElementById('refund-modal-title').textContent = titleMap[type] || '환불 처리';
  document.getElementById('refund-date').value = todayKST();
  document.getElementById('refund-memo').value = '';
  const ml = monthsLeft(endDate);
  const auto = perMonth ? ml * perMonth : 0;
  document.getElementById('refund-amount').value = auto || '';
  let info = `<b>${escapeHtml(name||'')}</b>`;
  if (endDate) info += ` · 만료일 ${endDate}`;
  document.getElementById('refund-info').innerHTML = info;
  document.getElementById('refund-calc-hint').textContent = perMonth
    ? `남은 기간 ${remainingText(endDate)}`
    : '환불 금액을 입력하세요. (수정 가능)';
  document.getElementById('refund-modal').classList.add('open');
}

function onRefundAmountInput() { /* 자유 입력 허용 */ }

async function submitRefund() {
  if (!refundContext) return;
  const totalAmount = parseInt(document.getElementById('refund-amount').value) || 0;
  const date = document.getElementById('refund-date').value;
  const memo = document.getElementById('refund-memo').value;
  const { type, id } = refundContext;
  if (type === 'locker') {
    await adminFetch(API + '/lockers/' + id, {method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({refund_amount:totalAmount})});
    closeModal('refund-modal'); closeModal('locker-modal'); loadLockers();
  } else if (type === 'member') {
    const lockerChecked = document.getElementById('refund-locker-check')?.checked && refundContext.locker;
    // 환불 총액은 회원권 레코드에 한 번에 기록 (매출 차감도 여기서)
    // 락커 이력엔 금액 없이 '반납'만 남김 (중복 기록 방지)
    let mMemo = memo;
    const incl = [];
    if (lockerChecked) incl.push('락커');
    if (incl.length) mMemo = (memo ? memo + ' / ' : '') + incl.join('·') + ' 포함 환불';

    // 1) 회원권 환불 (총액 전체를 회원권에 기록)
    const res = await adminFetch(API + '/members/' + id + '/refund', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({refund_amount:totalAmount, refund_date:date, memo:mMemo})});
    const data = await res.json().catch(()=>({}));
    if (data.error) return alert(data.error);
    // 2) 락커 반납 (금액 0 — 이력엔 '반납'만)
    if (lockerChecked) {
      await adminFetch(API + '/lockers/' + refundContext.locker.id, {method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({refund_amount:0})});
    }
    closeModal('refund-modal');
    closeModal('member-modal');
    alert(`환불 처리 완료 (총 ${totalAmount.toLocaleString('ko-KR')}원)`);
    if (typeof loadMembers === 'function') loadMembers();
  }
  refundContext = null;
}

async function returnLocker(id) {
  const l = (window._lockerData||[]).find(x => x.id === id) || {};
  openRefundModal('locker', id, (l.member_name||'')+' '+id+'번', l.end_date, 5000);
}

async function loadUniforms() {
  const uniforms = await adminFetch(API + '/uniforms').then(r => r.json());
  window._uniformData = uniforms;
  const today = todayKST();
  const tbody = document.getElementById('uniform-tbody');
  if (!uniforms.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state">등록된 운동복 대여가 없습니다</td></tr>'; return; }
  tbody.innerHTML = uniforms.map(u => {
    let badge = '<span class="badge badge-active">이용 중</span>';
    if (u.status==='returned') badge = '<span class="badge badge-done">반납</span>';
    else if (u.end_date && u.end_date <= today) badge = '<span class="badge badge-expire">만료</span>';
    const actions = u.status!=='returned'
      ? `<button class="action-btn" onclick="openUniformExtendModal(${u.id},'${u.end_date}','${escapeJsAttr(u.member_name)}')">연장</button><button class="action-btn danger" onclick="deleteUniform(${u.id})">삭제</button>`
      : `<button class="action-btn danger" onclick="deleteUniform(${u.id})">삭제</button>`;
    return `<tr><td>${u.id}</td><td style="font-weight:500">${escapeHtml(u.member_name)}</td><td>${u.start_date||'-'}</td><td>${u.end_date||'-'}</td><td>${u.months||'-'}개월</td><td>${(u.amount||0).toLocaleString('ko-KR')}원</td><td>${badge}</td><td style="display:flex;gap:4px;flex-wrap:wrap">${actions}</td></tr>`;
  }).join('');
}

async function loadUniformHistory() {
  const history = await adminFetch(API + '/uniforms/history').then(r => r.json());
  const tbody = document.getElementById('uniform-history-tbody');
  if (!history.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state">이력이 없습니다</td></tr>'; return; }
  tbody.innerHTML = history.map(h => `<tr>
    <td style="color:#888;font-size:12px">${h.created_at}</td>
    <td style="font-weight:500">${escapeHtml(h.member_name)||'-'}</td>
    <td><span class="badge ${h.action==='등록'?'badge-assign':'badge-return'}">${escapeHtml(h.action)}</span></td>
    <td>${h.start_date||'-'}</td>
    <td>${h.end_date||'-'}</td>
    <td>${h.months||'-'}개월</td>
    <td style="${(h.amount||0)<0?'color:#c62828;font-weight:600':''}">${(h.amount||0)<0?'환불 ':''}${(h.amount||0).toLocaleString('ko-KR')}원</td>
    <td><button class="action-btn danger" onclick="deleteUniformHistory(${h.id})">삭제</button></td>
  </tr>`).join('');
}

// 운동복 이력 단건 삭제 (잘못 입력한 기록 정리용)
async function deleteUniformHistory(id) {
  if (!confirm('이 이력 기록을 삭제하시겠습니까?\n(기록만 지웁니다. 운동복 등록 상태와 매출에는 영향 없습니다.)')) return;
  const data = await adminFetch(API + '/uniforms/history/' + id, { method: 'DELETE' }).then(r => r.json()).catch(() => ({}));
  if (data.error) return alert(data.error);
  loadUniformHistory();
}

let currentUniformExtendId = null;
let currentUniformEndDate = null;

function openUniformExtendModal(id, endDate, memberName) {
  currentUniformExtendId = id;
  currentUniformEndDate = endDate;
  document.getElementById('uniform-extend-title').textContent = `운동복 연장 — ${memberName}`;
  document.getElementById('uniform-current-end').textContent = endDate || '-';
  calcUniformExtendPreview();
  document.getElementById('ue-submit-btn').onclick = () => extendUniform(id, endDate);
  document.getElementById('uniform-extend-modal').classList.add('open');
}

function calcUniformExtendPreview() {
  const endDate = currentUniformEndDate;
  if (!endDate || endDate === '-') return;
  const months = parseInt(document.getElementById('ue-months').value);
  const newEnd = new Date(endDate);
  newEnd.setMonth(newEnd.getMonth() + months);
  document.getElementById('uniform-extend-preview').textContent = newEnd.toISOString().split('T')[0];
}

async function extendUniform(id, currentEndDate) {
  const months = parseInt(document.getElementById('ue-months').value);
  const amount = parseInt(document.getElementById('ue-amount').value) || 0;
  const payment = document.getElementById('ue-payment').value;
  const newEnd = new Date(currentEndDate);
  newEnd.setMonth(newEnd.getMonth() + months);
  const newEndStr = newEnd.toISOString().split('T')[0];

  await adminFetch(API + '/uniforms/' + id + '/extend', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ months, new_end_date: newEndStr, amount, payment_method: payment })
  });
  closeModal('uniform-extend-modal');
  loadUniforms();
  alert(`연장 완료!\n새 만료일: ${newEndStr}`);
}

function openUniformModal() {
  document.getElementById('u-start').value = todayKST();
  document.getElementById('uniform-modal').classList.add('open');
}

async function submitUniform() {
  const name = document.getElementById('u-name').value.trim();
  if (!name) return alert('회원명을 입력해주세요');
  const start = document.getElementById('u-start').value;
  const months = parseInt(document.getElementById('u-months').value);
  const end = new Date(start); end.setMonth(end.getMonth() + months);
  await adminFetch(API + '/uniforms', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
    member_name:name, start_date:start, end_date:end.toISOString().split('T')[0],
    months, amount:parseInt(document.getElementById('u-amount').value)||0,
    payment_method:document.getElementById('u-payment').value
  })});
  closeModal('uniform-modal');
  loadUniforms();
}

// 운동복 대여 현황에서 완전 삭제 (잘못 등록한 기록 정리용)
async function deleteUniform(id) {
  if (!confirm('이 운동복 대여 기록을 완전히 삭제하시겠습니까?\n(현황 목록에서 행 자체가 사라집니다. 매출에는 영향 없습니다.)')) return;
  const data = await adminFetch(API + '/uniforms/' + id + '/purge', { method: 'DELETE' }).then(r => r.json()).catch(() => ({}));
  if (data.error) return alert(data.error);
  loadUniforms();
}

// ============================================================
// 회원 상세에서 바로 락커 등록
// 배정 API(PUT /api/lockers/:id)를 그대로 쓴다 — 락커의 실제 기간(start_date~end_date)이 바뀌고
// locker_history에 '배정'으로 남아 매출에도 잡힌다.
// ============================================================

let memberLockerTarget = null; // { id, name, start, end } — start/end는 현재 회원권 기간

async function openMemberLockerModal(memberId, name, curStart, curEnd) {
  memberLockerTarget = { id: memberId, name, start: curStart || '', end: curEnd || '' };
  document.getElementById('ml-name').textContent = name;
  document.getElementById('ml-error').textContent = '';
  document.getElementById('ml-amount').value = '';

  const lockers = await adminFetch(API + '/lockers').then(r => r.json()).catch(() => []);
  const empty = lockers.filter(l => l.status === 'empty');
  document.getElementById('ml-locker').innerHTML = empty.length
    ? empty.map(l => `<option value="${l.id}">${l.id}번</option>`).join('')
    : '<option value="">비어있는 락커가 없습니다</option>';

  document.getElementById('ml-start').value = todayKST();
  document.getElementById('ml-months').value = '3';
  calcMemberLockerEnd();

  // 연동 상태를 항상 먼저 푼다. 앞 회원에게 '예'를 눌렀다면 입력칸이 잠긴 채로 남아,
  // 회원권이 없는 다음 회원에서는 아무것도 고칠 수 없게 된다.
  setMemberLockerSync(false);

  // 회원권 기간이 있을 때만 연동 여부를 묻는다 (없으면 맞출 대상이 없다)
  const ask = document.getElementById('ml-sync-ask');
  const hasPeriod = !!(memberLockerTarget.start && memberLockerTarget.end);
  if (hasPeriod) {
    document.getElementById('ml-sync-range').textContent =
      `회원권 기간: ${memberLockerTarget.start} ~ ${memberLockerTarget.end}`;
  }
  ask.style.display = hasPeriod ? '' : 'none';

  document.getElementById('member-locker-modal').classList.add('open');
}

// 예를 고르면 락커 기간을 회원권 기간에 맞추고 날짜·기간 입력을 잠근다
function setMemberLockerSync(on) {
  const months = document.getElementById('ml-months');
  const start = document.getElementById('ml-start');
  const end = document.getElementById('ml-end');

  if (on) {
    start.value = memberLockerTarget.start;
    end.value = memberLockerTarget.end;
    months.value = '';
    // 회원권 기간이 몇 개월인지 날짜에서 되짚어 금액을 채운다
    memberLockerTarget.syncedMonths = monthsBetweenDates(memberLockerTarget.start, memberLockerTarget.end);
    document.getElementById('ml-amount').value = memberLockerTarget.syncedMonths * LOCKER_MONTHLY_FEE;
  } else {
    memberLockerTarget.syncedMonths = 0;
  }
  months.disabled = start.disabled = end.disabled = on;

  const picked = 'background:#2e7d32;border-color:#2e7d32;color:#fff';
  document.getElementById('ml-sync-yes').style.cssText = 'flex:1;' + (on ? picked : '');
  document.getElementById('ml-sync-no').style.cssText  = 'flex:1;' + (on ? '' : picked);
}

function calcMemberLockerEnd() {
  const start = document.getElementById('ml-start').value;
  const months = document.getElementById('ml-months').value;
  if (!start || !months) return;  // '기타 (직접 설정)'이면 종료일·금액을 건드리지 않는다
  const end = new Date(start);
  end.setMonth(end.getMonth() + parseInt(months));
  document.getElementById('ml-end').value = end.toISOString().split('T')[0];
  document.getElementById('ml-amount').value = parseInt(months) * LOCKER_MONTHLY_FEE;
}

async function submitMemberLocker(btn) {
  const err = document.getElementById('ml-error');
  const show = (m) => { err.textContent = m; };
  show('');

  const lockerId = document.getElementById('ml-locker').value;
  if (!lockerId) return show('비어있는 락커가 없습니다');
  const start = document.getElementById('ml-start').value;
  const end = document.getElementById('ml-end').value;
  if (!start || !end) return show('시작일과 종료일을 입력해주세요');
  if (end < start) return show('종료일이 시작일보다 빠릅니다');
  const monthsVal = document.getElementById('ml-months').value;

  const original = btn.textContent;
  btn.disabled = true; btn.textContent = '등록 중...';
  try {
    const res = await adminFetch(API + '/lockers/' + lockerId, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        member_id: memberLockerTarget.id,
        member_name: memberLockerTarget.name,
        start_date: start, end_date: end,
        months: monthsVal ? parseInt(monthsVal) : (memberLockerTarget.syncedMonths || null),
        amount: parseInt(document.getElementById('ml-amount').value) || 0,
        payment_method: document.getElementById('ml-payment').value,
        status: 'active',
      }),
    });
    if (!res.ok) return show('등록하지 못했습니다');

    closeModal('member-locker-modal');
    alert(`${lockerId}번 락커 → ${memberLockerTarget.name} 등록 완료 (${start} ~ ${end})`);
    if (typeof loadMembers === 'function') loadMembers();
    openMemberModal(memberLockerTarget.id);  // 상세를 다시 열어 락커 정보 반영
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
}
