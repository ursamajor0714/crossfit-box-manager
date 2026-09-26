// ============================================================
// 등록/가격표: 신규·재등록 폼, 가격표
// CrossFit Grove 관리자 - admin.html에서 분리된 스크립트
// 모든 함수/변수는 전역 스코프 공유 (일반 <script> 로드)
// ============================================================

let selectedRenewMember = null;

function setRegType(btn, type) {
  document.querySelectorAll('.tab-sm').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('reg-new').style.display    = type==='new'    ? 'block' : 'none';
  document.getElementById('reg-renew').style.display  = type==='renew'  ? 'block' : 'none';
}

async function searchRenewMember() {
  const q = document.getElementById('renew-search').value.toLowerCase();
  const result = document.getElementById('renew-search-result');
  if (!q) { result.innerHTML = ''; return; }
  const members = await adminFetch(API + '/members').then(r => r.json());
  const filtered = members.filter(m => m.name.includes(q) || (m.phone||'').includes(q));
  result.innerHTML = filtered.slice(0,6).map(m =>
    `<div style="padding:10px 12px;border:1px solid #e5e5e5;border-radius:8px;cursor:pointer;margin-bottom:4px;font-size:13px" onclick="selectRenewMember(${m.id})">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span><b>${escapeHtml(m.name)}</b> <span style="color:#888">${escapeHtml(m.phone||'')}</span></span>
        <span style="font-size:11px;color:#aaa">${m.end_date||'-'} 만료</span>
      </div>
      ${m.memo ? `<div style="font-size:11px;color:#aaa;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">📝 ${escapeHtml(memoPreview(m.memo))}</div>` : ''}
    </div>`).join('');
}

async function selectRenewMember(id) {
  const m = await adminFetch(API + '/members/' + id).then(r => r.json());
  selectedRenewMember = m;
  document.getElementById('renew-search').value = m.name;
  document.getElementById('renew-search-result').innerHTML = '';

  const cur = (m.registrations||[]).find(r => r.is_current===1) || {};
  const histRows = (m.registrations||[]).slice(0,3).map(r =>
    `<span style="font-size:11px;color:#888">${r.start_date||'-'} ~ ${r.end_date||'-'} · ${r.plan||'-'} · ${(r.amount||0).toLocaleString()}원</span>`
  ).join('<br>');

  document.getElementById('renew-member-name').textContent = m.name;
  document.getElementById('renew-member-info').innerHTML = `
    <span>📞 ${escapeHtml(m.phone)||'-'}</span>
    <span>📅 현재 만료일: <b>${cur.end_date||'-'}</b></span>
    <span>💳 현재 요금제: ${escapeHtml(cur.plan)||'-'}</span>
    <span style="grid-column:1/-1">📝 메모: <span style="white-space:pre-wrap">${escapeHtml(formatMemo(m.memo))||'-'}</span></span>
    ${histRows ? `<span style="grid-column:1/-1;margin-top:4px;border-top:1px solid #e5e5e5;padding-top:6px"><b>최근 등록이력</b><br>${histRows}</span>` : ''}`;

  // 이전 메모를 이어받고, 이번에 끝나는 계약을 "과거 계약 내역"에 다음 번호로 자동 추가한다
  // (요약줄 "총 N건 · 누적 M개월 · 전체기간 …"도 다시 계산됨. 저장 전에 수정 가능)
  const renewMemo = document.getElementById('renew-memo');
  if (renewMemo) renewMemo.value = appendContractToMemo(m.memo, cur);

  const today = todayKST();
  document.getElementById('renew-start').value = today;
  renewCustomAmountMode = false;
  document.getElementById('renew-amount-custom').value = '';
  calcRenewEndDate();
  calcRenewPrice();

  // 락커 현황 — 체크박스와 무관하게 항상 표시 (운동복 서비스는 종료되어 표시하지 않음)
  const fac = document.getElementById('renew-facility-status');
  if (fac) {
    fac.innerHTML = m.locker
      ? `<div style="background:#e3f2fd;border:1px solid #90caf9;border-radius:8px;padding:10px 12px;font-size:12px;color:#1565c0">🔒 <b>${m.locker.id}번</b> 락커 사용 중<br><span style="color:#555">만료 ${m.locker.end_date||'-'}</span></div>`
      : `<div style="background:#f5f5f5;border:1px solid #e5e5e5;border-radius:8px;padding:10px 12px;font-size:12px;color:#888">🔒 사용 중인 락커 없음</div>`;
  }

  // 락커 입력칸 초기화.
  // 쓸 수 있는 번호(지금 쓰는 것 또는 비어 있는 예전 락커)가 있으면 자동으로 체크하고 번호를 채운다.
  const lockerToggle = document.getElementById('renew-locker-toggle');
  const lockerIdInput = document.getElementById('renew-locker-id');
  if (lockerToggle && lockerIdInput) {
    document.getElementById('renew-locker-months').value = '';   // 앞 회원 값이 남지 않게
    document.getElementById('renew-locker-amount').value = '';
    const suggested = await findRenewLockerId(m);
    lockerIdInput.value = suggested || '';
    lockerToggle.checked = !!suggested;
    toggleSection('renew-locker-section', !!suggested);
    if (suggested) initRenewLocker();
  }

  document.getElementById('renew-selected').style.display = 'block';
}

// 락커 금액 자동계산 (개월수 × LOCKER_MONTHLY_FEE)
function calcRenewLockerAmount() {
  const months = parseInt(document.getElementById('renew-locker-months').value) || 0;
  document.getElementById('renew-locker-amount').value = months * LOCKER_MONTHLY_FEE;
}

// 재등록 시 채워줄 락커 번호를 고른다.
// 1) 지금 쓰고 있는 락커가 있으면 그 번호
// 2) 없으면, 예전에 쓰던 락커가 지금 비어 있을 때만 그 번호를 다시 제안한다 (다른 사람이 쓰고 있으면 제안하지 않는다)
async function findRenewLockerId(m) {
  if (m.locker) return m.locker.id;

  const [history, lockers] = await Promise.all([
    adminFetch(API + '/lockers/history').then(r => r.json()).catch(() => []),
    adminFetch(API + '/lockers').then(r => r.json()).catch(() => []),
  ]);
  const emptyIds = new Set(lockers.filter(l => l.status === 'empty').map(l => l.id));
  // history는 최신순이라 먼저 걸리는 것이 가장 최근에 쓰던 락커다
  const mine = history.find(h =>
    (String(h.member_id) === String(m.id) || h.member_name === m.name) && emptyIds.has(h.locker_id)
  );
  return mine ? mine.locker_id : null;
}

// 락커 토글 켤 때: 개월수 기본값(등록 기간과 동일) 채우고 금액 자동계산
function initRenewLocker() {
  const monthsInput = document.getElementById('renew-locker-months');
  if (!monthsInput.value) {
    const period = getRenewPeriod() || 1;
    monthsInput.value = period;
  }
  calcRenewLockerAmount();
}

// ── 신규등록 락커 금액 자동계산 ──
// 락커: 개월수 × LOCKER_MONTHLY_FEE
function calcRegLockerAmount() {
  const months = parseInt(document.getElementById('reg-locker-months').value) || 0;
  document.getElementById('reg-locker-amount').value = months * LOCKER_MONTHLY_FEE;
  updateRegTotal();
}
// 락커 토글 켤 때: 개월수 기본값(등록 기간과 동일) 채우고 금액 자동계산
function initRegLocker() {
  const monthsInput = document.getElementById('reg-locker-months');
  if (!monthsInput.value) {
    const period = getRegPeriod() || 1;
    monthsInput.value = period;
  }
  calcRegLockerAmount();
}

function calcRenewPrice() {
  if (renewCustomAmountMode) return;
  const plan = document.getElementById('renew-plan').value;
  const period = getRenewPeriod();
  const disc = parseFloat(document.getElementById('renew-discount').value) || 0;
  const match = pricingData.find(p => p.plan === plan && p.period === period);
  const final = match ? Math.round(match.amount * (1-disc)) : 0;
  document.getElementById('renew-price-display').textContent = final ? final.toLocaleString('ko-KR') + '원' : '-';
}

function calcRenewEndDate() {
  if (document.getElementById('renew-period').value === 'custom') return;
  const start = document.getElementById('renew-start').value;
  const sel = parseInt(document.getElementById('renew-period').value) || 0;
  if (!start || !sel) return;
  const end = new Date(start); end.setMonth(end.getMonth() + sel);
  document.getElementById('renew-end').value = end.toISOString().split('T')[0];
}

function getRenewPeriod() {
  const sel = document.getElementById('renew-period').value;
  if (sel === 'custom') {
    const start = document.getElementById('renew-start').value;
    const end = document.getElementById('renew-end').value;
    if (start && end) {
      const s = new Date(start), e = new Date(end);
      return Math.round((e - s) / (30*86400000));
    }
    return 0;
  }
  return parseInt(sel) || 0;
}

function onRenewPeriodChange() {
  const val = document.getElementById('renew-period').value;
  const endInput = document.getElementById('renew-end');
  if (val === 'custom') {
    endInput.removeAttribute('readonly');
    endInput.style.background = '#fff';
    endInput.focus();
  } else {
    endInput.setAttribute('readonly', true);
    endInput.style.background = '#f9f9f9';
    calcRenewEndDate();
    const p = parseInt(val) || 0;
    const holdInput = document.getElementById('renew-holding');
    if (holdInput) {
      if (p >= 6) holdInput.value = 30;
      else if (p >= 3) holdInput.value = 10;
      else holdInput.value = 0;
    }
  }
  calcRenewPrice();
  syncRenewLockerMonths();
}

// 회원권 기간을 바꾸면 락커 개월수도 같이 맞춘다 (락커를 등록하기로 체크한 경우만).
// '만료일 직접입력'이면 getRenewPeriod()가 날짜 차이로 개월수를 되짚어준다.
function syncRenewLockerMonths() {
  const toggle = document.getElementById('renew-locker-toggle');
  if (!toggle || !toggle.checked) return;
  const period = getRenewPeriod();
  if (!period) return;
  document.getElementById('renew-locker-months').value = period;
  calcRenewLockerAmount();
}

let renewCustomAmountMode = false;
function onRenewAmountCustomInput() {
  const val = document.getElementById('renew-amount-custom').value;
  renewCustomAmountMode = val !== '';
  if (renewCustomAmountMode) {
    document.getElementById('renew-price-display').textContent = parseInt(val).toLocaleString('ko-KR') + '원';
  }
}

async function submitRenew() {
  if (!selectedRenewMember) return alert('회원을 선택해주세요');
  const m = selectedRenewMember;
  const plan = document.getElementById('renew-plan').value;
  const period = getRenewPeriod();
  const disc = parseFloat(document.getElementById('renew-discount').value) || 0;
  const customAmt = document.getElementById('renew-amount-custom').value;
  const match = pricingData.find(p => p.plan === plan && p.period === period);
  const amount = customAmt ? parseInt(customAmt) : Math.round((match?.amount||0)*(1-disc));
  const body = {
    name: m.name, phone: m.phone,
    plan, period, amount,
    payment_method: document.getElementById('renew-payment').value,
    start_date: document.getElementById('renew-start').value,
    end_date: document.getElementById('renew-end').value,
    holding_total: parseInt((document.getElementById('renew-holding')||{}).value)||0,
    memo: document.getElementById('renew-memo').value,
    reg_type: '등록비',
  };
  // 락커 등록/연장
  if (document.getElementById('renew-locker-toggle').checked) {
    const lid = document.getElementById('renew-locker-id').value;
    if (!lid) return alert('락커 번호를 입력해주세요');
    body.locker_id = parseInt(lid);
    const lm = parseInt(document.getElementById('renew-locker-months').value);
    if (lm) body.locker_months = lm;
    body.locker_amount = parseInt(document.getElementById('renew-locker-amount').value)||0;
  }
  const renewRes = await adminFetch(API + '/members',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  // 계약서에서 넘어온 재등록이면 계약서를 '등록완료'로 연결
  if (window._registeringContractId) {
    const rd = await renewRes.json().catch(()=>({}));
    await adminFetch(API + '/contracts/' + window._registeringContractId + '/link', {
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ member_id: m.id || rd.id || null })
    }).catch(()=>{});
    window._registeringContractId = null;
  }
  alert(m.name + ' 님 재등록 완료!');
  selectedRenewMember = null;
  renewCustomAmountMode = false;
  document.getElementById('renew-search').value = '';
  document.getElementById('renew-amount-custom').value = '';
  document.getElementById('renew-selected').style.display = 'none';
  openPage('members');
}

let pricingData = [];
let customAmountMode = false;

async function loadPricingData() {
  // 요금표 열람 권한이 없는 코치도 홈을 보므로, 못 읽으면 조용히 넘어간다
  const res = await adminFetch(API + '/pricing');
  if (!res.ok) { pricingData = []; return; }
  pricingData = await res.json();
  const plans = [...new Set(pricingData.map(p => p.plan))];
  const opts = '<option value="">선택...</option>' + plans.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
  const regSel = document.getElementById('reg-plan');
  if (regSel) regSel.innerHTML = opts;
  const renewSel = document.getElementById('renew-plan');
  if (renewSel) renewSel.innerHTML = opts;
}

function onPeriodChange() {
  const val = document.getElementById('reg-period').value;
  const endInput = document.getElementById('reg-end');
  if (val === 'custom') {
    // 만료일 직접입력 모드
    endInput.removeAttribute('readonly');
    endInput.style.background = '#fff';
    endInput.focus();
  } else {
    endInput.setAttribute('readonly', true);
    endInput.style.background = '#f9f9f9';
    calcEndDate();
    const p = parseInt(val) || 0;
    const holdInput = document.getElementById('reg-holding');
    if (holdInput) {
      if (p >= 6) holdInput.value = 30;
      else if (p >= 3) holdInput.value = 10;
      else holdInput.value = 0;
    }
  }
  calcPrice();
}

// 회원권 금액 읽기 (직접입력 우선, 없으면 계산된 표시값)
function getRegMembershipAmount() {
  const custom = document.getElementById('reg-amount-custom').value;
  if (custom !== '') return parseInt(custom) || 0;
  const txt = document.getElementById('price-display').textContent.replace(/[^0-9]/g, '');
  return parseInt(txt) || 0;
}

// 총 최종 금액 갱신 (회원권 + 락커)
function updateRegTotal() {
  const lockerOn = document.getElementById('locker-toggle').checked;
  const box = document.getElementById('reg-total-box');
  // 락커가 없으면 총액 박스 숨김 (회원권 금액만 보면 됨)
  if (!lockerOn) { box.style.display = 'none'; return; }
  const mem = getRegMembershipAmount();
  const locker = parseInt(document.getElementById('reg-locker-amount').value) || 0;
  const total = mem + locker;
  const parts = [`회원권 ${mem.toLocaleString('ko-KR')}원`, `락커 ${locker.toLocaleString('ko-KR')}원`];
  document.getElementById('reg-total-breakdown').textContent = parts.join('  +  ');
  document.getElementById('reg-total-amount').textContent = total.toLocaleString('ko-KR') + '원';
  box.style.display = 'block';
}

function onAmountCustomInput() {
  const val = document.getElementById('reg-amount-custom').value;
  customAmountMode = val !== '';
  if (customAmountMode) {
    document.getElementById('price-display').textContent = parseInt(val).toLocaleString('ko-KR') + '원';
  }
  updateRegTotal();
}

function getRegPeriod() {
  const sel = document.getElementById('reg-period').value;
  if (sel === 'custom') {
    // 만료일 직접입력 시 시작일~만료일로 개월수 추정
    const start = document.getElementById('reg-start').value;
    const end = document.getElementById('reg-end').value;
    if (start && end) {
      const s = new Date(start), e = new Date(end);
      return Math.round((e - s) / (30*86400000));
    }
    return 0;
  }
  return parseInt(sel) || 0;
}

function calcPrice() {
  if (customAmountMode) return;
  const plan = document.getElementById('reg-plan').value;
  const period = getRegPeriod();
  const disc = parseFloat(document.getElementById('reg-discount').value) || 0;
  const match = pricingData.find(p => p.plan === plan && p.period === period);
  const base = match ? match.amount : 0;
  const final = Math.round(base * (1 - disc));
  document.getElementById('price-display').textContent = final ? final.toLocaleString('ko-KR') + '원' : '-';
  updateRegTotal();
}

function calcEndDate() {
  if (document.getElementById('reg-period').value === 'custom') return; // 직접입력 모드면 건드리지 않음
  const start = document.getElementById('reg-start').value;
  const sel = parseInt(document.getElementById('reg-period').value) || 0;
  if (!start || !sel) return;
  const end = new Date(start); end.setMonth(end.getMonth() + sel);
  document.getElementById('reg-end').value = end.toISOString().split('T')[0];
}

// 가격표 관리
async function loadPricing() {
  const pricing = await adminFetch(API + '/pricing').then(r => r.json());
  const tbody = document.getElementById('pricing-tbody');
  if (!pricing.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">가격표가 없습니다</td></tr>'; return; }
  tbody.innerHTML = pricing.map(p => `<tr>
    <td style="font-weight:500">${escapeHtml(p.plan)}</td>
    <td>${p.period}개월</td>
    <td>
      <input type="number" value="${p.amount}" style="width:120px;font-size:13px;padding:4px 8px;border:1px solid #e5e5e5;border-radius:6px" id="price-${p.id}">
    </td>
    <td style="color:#888">${p.label||'-'}</td>
    <td style="display:flex;gap:4px">
      <button class="action-btn" onclick="savePricing(${p.id})">저장</button>
      <button class="action-btn danger" onclick="deletePricing(${p.id})">삭제</button>
    </td>
  </tr>`).join('');
}

async function savePricing(id) {
  const amount = parseInt(document.getElementById('price-'+id).value);
  if (!amount) return alert('금액을 입력해주세요');
  await adminFetch(API + '/pricing/' + id, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({amount})});
  alert('저장 완료!');
  loadPricingData();
}

async function deletePricing(id) {
  if (!confirm('삭제하시겠습니까?')) return;
  await adminFetch(API + '/pricing/' + id, {method:'DELETE'});
  loadPricing();
  loadPricingData();
}

function openAddPricingModal() {
  document.getElementById('pricing-modal').classList.add('open');
}

async function submitAddPricing() {
  const plan = document.getElementById('pm-plan').value.trim();
  const period = parseInt(document.getElementById('pm-period').value);
  const amount = parseInt(document.getElementById('pm-amount').value);
  const label = document.getElementById('pm-label').value;
  if (!plan || !period || !amount) return alert('요금제명, 기간, 금액은 필수입니다');
  await adminFetch(API + '/pricing', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({plan, period, amount, label: label || plan+' '+period+'개월'})});
  closeModal('pricing-modal');
  loadPricing();
  loadPricingData();
  alert('추가 완료!');
}

async function submitMember(type) {
  let body = {};
  {
    const name = document.getElementById('reg-name').value.trim();
    if (!name) return alert('회원명을 입력해주세요');
    // 이름 중복 체크
    if (typeof allMembers !== 'undefined' && allMembers.some(m => m.name === name)) {
      return alert(`이미 "${name}" 님이 등록되어 있습니다.\n동명이인이면 이름 뒤에 구분을 붙여주세요 (예: ${name}2). 재등록이라면 "재등록" 탭을 이용하세요.`);
    }
    const plan = document.getElementById('reg-plan').value;
    const period = getRegPeriod();
    const disc = parseFloat(document.getElementById('reg-discount').value);
    const customAmt = document.getElementById('reg-amount-custom').value;
    const match = pricingData.find(p => p.plan === plan && p.period === period);
    const baseAmt = customAmt ? parseInt(customAmt) : Math.round((match?.amount||0)*(1-disc));
    body = { name, phone:document.getElementById('reg-phone').value, gender:document.getElementById('reg-gender').value,
      age_group:document.getElementById('reg-age').value, plan, period,
      amount:baseAmt,
      payment_method:document.getElementById('reg-payment').value,
      start_date:document.getElementById('reg-start').value, end_date:document.getElementById('reg-end').value,
      holding_total:parseInt(document.getElementById('reg-holding').value)||0,
      region:document.getElementById('reg-region').value, source:document.getElementById('reg-source').value,
      memo:document.getElementById('reg-memo').value,
      birth_date:(document.getElementById('reg-birth')||{}).value||null,
      insta:(document.getElementById('reg-insta')||{}).value||null,
      goal:(document.getElementById('reg-goal')||{}).value||null,
      injury:(document.getElementById('reg-injury')||{}).value||null,
      photo: window._registeringPhoto||null,
      is_new_registration:true };
    // 락커 동시 등록 — 켰으면 번호와 개월수 필수
    if (document.getElementById('locker-toggle').checked) {
      const lid = parseInt(document.getElementById('reg-locker-id').value);
      const lm = parseInt(document.getElementById('reg-locker-months').value);
      if (!lid || lid < 1) return alert('락커를 선택했습니다. 락커 번호를 입력하거나, 등록하지 않으려면 락커 체크를 해제하세요.');
      if (!lm || lm < 1) return alert('락커 사용 개월수를 입력해주세요.');
      body.locker_id = lid;
      body.locker_months = lm;
      body.locker_amount = parseInt(document.getElementById('reg-locker-amount').value)||0;
    }
  }
  const res = await adminFetch(API + '/members', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  const data = await res.json().catch(()=>({}));
  if (!res.ok || data.error) return alert(data.error || '등록 중 오류가 발생했습니다.');
  // 계약서에서 넘어온 등록이면 계약서를 '등록완료'로 연결
  if (window._registeringContractId) {
    await adminFetch(API + '/contracts/' + window._registeringContractId + '/link', {
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ member_id: data.member_id || data.id || null })
    }).catch(()=>{});
    window._registeringContractId = null;
  }
  window._registeringPhoto = null;
  alert(body.name + ' 님 등록 완료!');
  openPage('members');
}