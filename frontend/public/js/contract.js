const API = '/api';
// ── 계약서 인증 ──
let contractToken = sessionStorage.getItem('contractToken') || '';
function cFetch(url, opts = {}) {
  opts.headers = Object.assign({}, opts.headers, { 'x-contract-token': contractToken });
  return fetch(url, opts);
}
async function unlockContract() {
  const pw = document.getElementById('lock-pw').value;
  const errEl = document.getElementById('lock-error');
  errEl.textContent = '';
  try {
    const res = await fetch(API + '/contract/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password: pw }) });
    const data = await res.json();
    if (!res.ok || !data.ok) { errEl.textContent = data.error || '인증 실패'; return; }
    contractToken = data.token;
    sessionStorage.setItem('contractToken', contractToken);
    showForm();
  } catch (e) { errEl.textContent = '오류가 발생했습니다. 다시 시도해 주세요.'; }
}
function showForm() {
  document.getElementById('lock-view').classList.add('hidden');
  document.getElementById('form-view').classList.remove('hidden');
  resizeCanvas();
  loadPricing();
}
let photoData = null;
let stream = null;
let camFacing = 'user';  // 'user'(전면) / 'environment'(후면)
let genderVal = '';
let contractType = '신규';
let membershipType = '기간제';
let renewMembers = [];
let renewSelectedId = null;
let renewSelectedName = '';
let renewSelectedMember = null;

// 신규/재등록 선택
function pickContractType(type) {
  contractType = type;
  document.getElementById('type-new').classList.toggle('on', type === '신규');
  document.getElementById('type-renew').classList.toggle('on', type === '재등록');
  const isRenew = type === '재등록';
  document.getElementById('renew-pick-card').classList.toggle('hidden', !isRenew);
  // 재등록이면 기본정보/사진/운동정보 숨김
  document.querySelectorAll('.member-only').forEach(el => el.classList.toggle('hidden', isRenew));
  // 재등록이면 회원권 종류 숨기고 기간제 강제 (횟수권은 신규만)
  const mtypeRow = document.getElementById('s-membership-type-row');
  if (mtypeRow) mtypeRow.style.display = isRenew ? 'none' : 'block';
  if (isRenew) pickMembershipType('기간제');
  if (isRenew && !renewMembers.length) loadRenewMembers();
  // 재등록 전환 시 선택 초기화
  if (isRenew) { renewSelectedId = null; renewSelectedName = ''; document.getElementById('renew-selected').classList.add('hidden'); }
  checkSubmit();
}

// 회원권 종류 선택 (기간제/횟수권/직원등록) - 신규만
const MEMBERSHIP_CHIPS = { '기간제': 'mtype-period', '횟수권': 'mtype-count', '직원': 'mtype-staff' };
function pickMembershipType(type) {
  membershipType = type;
  for (const [t, id] of Object.entries(MEMBERSHIP_CHIPS)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const on = t === type;
    el.classList.toggle('on', on);
    el.style.background = on ? 'var(--lime)' : '#1a1a1a';
    el.style.color = on ? '#1a1a1a' : '#fff';
    el.style.borderColor = on ? 'var(--lime)' : '#555';
  }
  const isCount = type === '횟수권';
  const isStaff = type === '직원';
  // 필드 토글: 횟수권이면 요금제/기간 숨기고 총횟수 표시, 직원이면 둘 다 숨긴다
  document.getElementById('s-period-fields').style.display = (isCount || isStaff) ? 'none' : 'block';
  document.getElementById('s-count-fields').style.display = isCount ? 'block' : 'none';
  // 직접입력 날짜행은 횟수권·직원일 때 숨김
  const dr = document.getElementById('s-custom-date-row');
  if (dr && (isCount || isStaff)) dr.style.display = 'none';
  setStaffLocked(isStaff);
  calcContractTotal();
}

// 직원(코치)은 회원권·락커·금액이 없다 — 직원 작성란의 입력칸을 전부 잠그고 비운다.
// 회원권 종류 칩은 <span> 이라 여기 걸리지 않으므로 직원을 잘못 눌러도 되돌릴 수 있다.
function setStaffLocked(locked) {
  const box = document.getElementById('staff-section');
  if (!box) return;
  box.querySelectorAll('input, select, textarea').forEach(el => {
    el.disabled = locked;
    el.style.opacity = locked ? '0.4' : '';
    if (locked) el.value = '';
  });
  const note = document.getElementById('staff-lock-note');
  if (note) note.style.display = locked ? 'block' : 'none';
  if (locked) document.getElementById('s-total-box').style.display = 'none';
}

// 회원 목록 로드 (공개 API)
async function loadRenewMembers() {
  try {
    const res = await cFetch(API + '/contract-members');
    if (res.status === 401) { sessionStorage.removeItem('contractToken'); contractToken=''; alert('인증이 만료되었습니다. 직원 비밀번호를 다시 입력해 주세요.'); location.reload(); return; }
    renewMembers = await res.json();
  } catch (e) { renewMembers = []; }
  renderRenewMembers(renewMembers);
}
function renderRenewMembers(list) {
  const box = document.getElementById('renew-member-list');
  if (!list.length) { box.innerHTML = '<div style="padding:16px;text-align:center;color:#aaa;font-size:14px">회원이 없습니다</div>'; return; }
  box.innerHTML = list.map(m => `
    <div onclick="selectRenewMember(${m.id})" style="padding:13px 14px;border-bottom:1px solid #f0f0f0;cursor:pointer;display:flex;justify-content:space-between;align-items:center">
      <span style="font-weight:600">${escapeHtml(m.name)}</span>
      <span style="color:#999;font-size:13px">${m.phone_tail ? '···· '+escapeHtml(m.phone_tail) : ''}</span>
    </div>`).join('');
}
function filterRenewMembers() {
  const q = document.getElementById('renew-search').value.trim().toLowerCase();
  renderRenewMembers(q ? renewMembers.filter(m => m.name.toLowerCase().includes(q)) : renewMembers);
}
function selectRenewMember(id) {
  const m = renewMembers.find(x => x.id === id);
  if (!m) return;
  renewSelectedId = m.id;
  renewSelectedName = m.name;
  const sel = document.getElementById('renew-selected');
  sel.textContent = `✓ ${m.name} 님으로 재등록`;
  sel.classList.remove('hidden');
  // 락커/운동복 사용 중이면 연장 옵션 표시
  const fac = document.getElementById('renew-facility');
  let html = '';
  if (m.locker || m.uniform) {
    html += '<div style="background:#fff8e1;border:1px solid #ffe082;border-radius:10px;padding:12px 14px">';
    html += '<div style="font-size:13px;font-weight:600;color:#a06800;margin-bottom:8px">현재 사용 중 — 함께 연장할까요?</div>';
    if (m.locker) {
      html += `<label style="display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:6px;cursor:pointer">
        <input type="checkbox" id="renew-ext-locker" style="width:18px;height:18px"> 🔒 락커 ${m.locker.id}번 (만료 ${m.locker.end_date||'-'})</label>`;
    }
    if (m.uniform) {
      html += `<label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer">
        <input type="checkbox" id="renew-ext-uniform" style="width:18px;height:18px"> 👕 운동복 (만료 ${m.uniform.end_date||'-'})</label>`;
    }
    html += '</div>';
  }
  fac.innerHTML = html;
  fac.classList.toggle('hidden', !html);
  renewSelectedMember = m;
  checkSubmit();
}

let pricingData = [];

// ── 요금제 로드 (직원 작성란) ──
async function loadPricing() {
  try {
    pricingData = await cFetch(API + '/pricing').then(r => r.json());
  } catch (e) { pricingData = []; }
  const plans = [...new Set(pricingData.map(p => p.plan))];
  const planSel = document.getElementById('s-plan');
  planSel.innerHTML = '<option value="">선택</option>' + plans.map(p => `<option value="${p}">${p}</option>`).join('');
  updateContractPeriods();
}
function updateContractPeriods() {
  const plan = document.getElementById('s-plan').value;
  const periods = pricingData.filter(p => p.plan === plan);
  const periodSel = document.getElementById('s-period');
  periodSel.innerHTML = '<option value="">선택</option>'
    + periods.map(p => `<option value="${p.period}">${p.period}개월</option>`).join('')
    + '<option value="custom">만료일 직접입력</option>';
  // 옵션이 새로 그려지면 직접입력 행은 숨김
  const row = document.getElementById('s-custom-date-row');
  if (row) row.style.display = 'none';
}

// 기간 select 변경: '만료일 직접입력' 선택 시 날짜칸 표시
function onContractPeriodChange() {
  const val = document.getElementById('s-period').value;
  const row = document.getElementById('s-custom-date-row');
  if (val === 'custom') {
    if (row) row.style.display = 'grid';
  } else {
    if (row) row.style.display = 'none';
  }
  resetAmountAuto();
}
let amountManual = false; // 직원이 금액 직접 수정했는지
function calcContractPrice() {
  const plan = document.getElementById('s-plan').value;
  const periodRaw = document.getElementById('s-period').value;
  // 만료일 직접입력 모드면 자동 금액계산 안 함 (직원이 직접 금액 입력)
  if (periodRaw === 'custom') { calcContractTotal(); return; }
  const period = parseInt(periodRaw);
  const disc = parseFloat(document.getElementById('s-discount').value) || 0;
  const match = pricingData.find(p => p.plan === plan && p.period === period);
  const amtInput = document.getElementById('s-amount');
  if (match && !amountManual) {
    const final = Math.round(match.amount * (1 - disc));
    amtInput.value = final;
  }
  calcContractTotal();
}
// 금액 직접 입력 시
function onAmountManual() {
  amountManual = document.getElementById('s-amount').value !== '';
  calcContractTotal();
}
// 요금제/기간/할인 변경 시: 직접입력 상태가 아닐 때만 자동계산
function resetAmountAuto() {
  if (!amountManual) calcContractPrice();
  else calcContractTotal();
}

// 총 최종 금액 = 회원권 + 락커 + 운동복
function calcContractTotal() {
  const mem = parseInt(document.getElementById('s-amount').value) || 0;
  const lockerM = parseInt(document.getElementById('s-locker').value) || 0;
  const uniformM = parseInt(document.getElementById('s-uniform').value) || 0;
  const locker = lockerM * 5000;
  const uniform = uniformM * 15000;
  const box = document.getElementById('s-total-box');
  if (!lockerM && !uniformM) { box.style.display = 'none'; return; }
  const total = mem + locker + uniform;
  const parts = [`회원권 ${mem.toLocaleString('ko-KR')}원`];
  if (lockerM) parts.push(`락커 ${locker.toLocaleString('ko-KR')}원`);
  if (uniformM) parts.push(`운동복 ${uniform.toLocaleString('ko-KR')}원`);
  document.getElementById('s-total-breakdown').textContent = parts.join('  +  ');
  document.getElementById('s-total-amount').textContent = total.toLocaleString('ko-KR') + '원';
  box.style.display = 'block';
}

// 칩 (단일 선택 - 성별)
function pickChip(group, el) {
  document.querySelectorAll('#'+group+'-chips .chip').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
  if (group === 'gender') genderVal = el.dataset.v;
}
// 칩 (복수 선택 - 방향성)
function toggleChip(el) { el.classList.toggle('on'); }
function getGoals() {
  return [...document.querySelectorAll('#goal-chips .chip.on')].map(c => c.dataset.v).join(', ');
}

// ── 카메라 ──
// 여는 방법·자르는 규격은 photo-capture.js 에 있다 (관리자 화면과 공용).
// 여기서는 이 화면의 버튼만 갈아끼운다.
async function startCamera() {
  const preview = document.getElementById('photo-preview');
  stream = stopCamera();                        // 기존 스트림 정리 (전환 시)
  try {
    stream = await openSquareCamera(preview, camFacing);
    document.getElementById('cam-btn').classList.add('hidden');
    document.getElementById('shoot-btn').classList.remove('hidden');
    document.getElementById('flip-btn').classList.remove('hidden');
    document.getElementById('retake-btn').classList.add('hidden');
  } catch (e) {
    alert('카메라를 사용할 수 없습니다. 권한을 확인하거나 데스크에 문의해 주세요.');
  }
}

// 전면/후면 카메라 전환
function flipCamera() {
  camFacing = (camFacing === 'user') ? 'environment' : 'user';
  startCamera();
}

function takePhoto() {
  const preview = document.getElementById('photo-preview');
  const shot = captureSquarePhoto(preview, camFacing);
  if (!shot) return;
  photoData = shot;
  stopCamera();
  preview.innerHTML = `<img src="${photoData}">`;
  document.getElementById('shoot-btn').classList.add('hidden');
  document.getElementById('cam-btn').classList.add('hidden');
  document.getElementById('flip-btn').classList.add('hidden');
  document.getElementById('retake-btn').classList.remove('hidden');
}

function stopCamera() { stream = stopStream(stream); return null; }

// ── 서명 캔버스 ──
const canvas = document.getElementById('sign-canvas');
const ctx = canvas.getContext('2d');
let drawing = false, hasSign = false;
function resizeCanvas() {
  const w = canvas.parentElement.clientWidth - 40;
  canvas.width = w; canvas.height = 200;
  ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#1a1a1a';
}
function pos(e) {
  const r = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX - r.left, y: t.clientY - r.top };
}
function startDraw(e) { drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
function moveDraw(e) { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); hasSign = true; checkSubmit(); e.preventDefault(); }
function endDraw() { drawing = false; }
canvas.addEventListener('mousedown', startDraw); canvas.addEventListener('mousemove', moveDraw);
canvas.addEventListener('mouseup', endDraw); canvas.addEventListener('mouseout', endDraw);
canvas.addEventListener('touchstart', startDraw); canvas.addEventListener('touchmove', moveDraw);
canvas.addEventListener('touchend', endDraw);
function clearSign() { ctx.clearRect(0,0,canvas.width,canvas.height); hasSign = false; checkSubmit(); }

// ── 제출 가능 여부 ──
function checkSubmit() {
  let ok = document.getElementById('agree-all').checked && hasSign;
  // 재등록이면 회원 선택 필수
  if (contractType === '재등록' && !renewSelectedId) ok = false;
  document.getElementById('submit-btn').disabled = !ok;
}

// 이름 → 서명 라벨
document.getElementById('f-name').addEventListener('input', e => {
  document.getElementById('sign-name-label').textContent = e.target.value ? e.target.value + ' (서명)' : '';
});

// ── 제출 ──
async function submitContract() {
  const isRenew = contractType === '재등록';
  let name, phone;
  if (isRenew) {
    if (!renewSelectedId) return alert('본인을 선택해 주세요.');
    name = renewSelectedName;
    phone = (renewSelectedMember && renewSelectedMember.phone) || null;
  } else {
    name = document.getElementById('f-name').value.trim();
    phone = document.getElementById('f-phone').value.trim();
    if (!name) return alert('이름을 입력해 주세요.');
    if (!phone) return alert('연락처를 입력해 주세요.');
  }
  if (!document.getElementById('agree-all').checked) return alert('약관에 동의해 주세요.');
  if (!hasSign) return alert('서명을 해주세요.');

  const signature = canvas.toDataURL('image/png');
  const body = {
    name, phone,
    birth_date: isRenew ? ((renewSelectedMember && renewSelectedMember.birth_date) || null) : (document.getElementById('f-birth').value || null),
    insta: isRenew ? null : (document.getElementById('f-insta').value.trim() || null),
    gender: isRenew ? null : (genderVal || null),
    injury: isRenew ? null : (document.getElementById('f-injury').value.trim() || null),
    goal: isRenew ? null : (getGoals() || null),
    photo: isRenew ? null : photoData,
    signature,
    privacy_agreed: 1,
    contract_type: contractType,
    renew_member_id: isRenew ? renewSelectedId : null,
    extend_locker: isRenew && document.getElementById('renew-ext-locker') ? document.getElementById('renew-ext-locker').checked : false,
    extend_uniform: isRenew && document.getElementById('renew-ext-uniform') ? document.getElementById('renew-ext-uniform').checked : false,
    region: document.getElementById('f-region').value.trim() || null,
    source: document.getElementById('f-source').value || null,
    plan: document.getElementById('s-plan').value || null,
    discount: parseFloat(document.getElementById('s-discount').value) || 0,
    amount: parseInt(document.getElementById('s-amount').value) || null,
    locker_months: parseInt(document.getElementById('s-locker').value) || null,
    uniform_months: parseInt(document.getElementById('s-uniform').value) || null,
    staff_memo: document.getElementById('s-memo').value.trim() || null,
    membership_type: isRenew ? '기간제' : membershipType,
  };
  // 직원(신규만): 회원권이 없으므로 금액·기간에 해당하는 값을 모두 비워 보낸다
  if (!isRenew && membershipType === '직원') {
    body.plan = null; body.period = null; body.amount = null; body.discount = 0;
    body.locker_months = null; body.uniform_months = null;
    body.start_date = null; body.end_date = null;
  } else if (!isRenew && membershipType === '횟수권') {
    body.count_total = parseInt(document.getElementById('s-count-total').value) || null;
    body.plan = '횟수권';
    body.period = body.count_total;   // 총 횟수
    body.start_date = null;
    body.end_date = null;
  } else {
    // 기간제: 직접입력 모드면 시작일/만료일을 보내고 period는 개월수로 환산, 아니면 기존대로
    const periodRaw = document.getElementById('s-period').value;
    if (periodRaw === 'custom') {
      const sd = document.getElementById('s-start').value || null;
      const ed = document.getElementById('s-end').value || null;
      body.start_date = sd;
      body.end_date = ed;
      if (sd && ed) {
        const s = new Date(sd), e = new Date(ed);
        body.period = Math.max(1, Math.round((e - s) / (30*86400000)));
      } else {
        body.period = null;
      }
    } else {
      body.period = parseInt(periodRaw) || null;
      body.start_date = null;
      body.end_date = null;
    }
  }
  document.getElementById('submit-btn').disabled = true;
  document.getElementById('submit-btn').textContent = '제출 중...';
  try {
    const res = await cFetch(API + '/contracts', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.error) { alert(data.error); document.getElementById('submit-btn').disabled = false; document.getElementById('submit-btn').textContent = '제출하기'; return; }
    stopCamera();
    document.getElementById('form-view').classList.add('hidden');
    document.getElementById('done-view').classList.remove('hidden');
    window.scrollTo(0,0);
  } catch (e) {
    alert('제출 중 오류가 발생했습니다. 다시 시도해 주세요.');
    document.getElementById('submit-btn').disabled = false;
    document.getElementById('submit-btn').textContent = '제출하기';
  }
}

window.addEventListener('load', () => {
  if (contractToken) {
    // 토큰 유효성은 첫 API 호출에서 검증됨 (만료면 회원목록/제출 시 재인증 유도)
    showForm();
  } else {
    document.getElementById('lock-pw').focus();
  }
});
window.addEventListener('resize', resizeCanvas);
