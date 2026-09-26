// ============================================================
// 제출된 계약서 관리: 목록/상세/등록전환/PDF 출력
// CrossFit Grove 관리자 - admin-members.js에서 분리된 스크립트
// ============================================================

let contractsCache = [];

async function loadContracts() {
  const list = await adminFetch(API + '/contracts').then(r => r.json()).catch(() => []);
  contractsCache = list;
  const tbody = document.getElementById('contracts-tbody');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty-state">제출된 계약서가 없습니다</td></tr>'; return; }
  tbody.innerHTML = list.map(c => {
    const statusBadge = c.status === 'registered'
      ? '<span class="badge badge-done">등록완료</span>'
      : '<span class="badge badge-active">대기</span>';
    const typeBadge = c.contract_type === '재등록'
      ? '<span class="badge" style="background:#ede7f6;color:#5e35b1">재등록</span>'
      : '<span class="badge" style="background:#e3f2fd;color:#1565c0">신규</span>';
    const regBtn = c.status === 'registered' ? '' : (
      c.contract_type === '재등록'
        ? `<button class="action-btn" style="background:#5e35b1;color:#fff" onclick="renewFromContract(${c.id})">재등록</button>`
        : (c.membership_type === '횟수권'
            ? `<button class="action-btn" style="background:#00695c;color:#fff" onclick="registerCountFromContract(${c.id})">횟수권 등록</button>`
            : `<button class="action-btn" style="background:#1a1a1a;color:#fff" onclick="registerFromContract(${c.id})">등록</button>`)
    );
    return `<tr>
      <td style="color:#888;font-size:12px">${(c.created_at||'').slice(0,16).replace('T',' ')}</td>
      <td style="font-weight:500">${escapeHtml(c.name)} ${typeBadge}</td>
      <td style="color:#888">${escapeHtml(c.phone)||'-'}</td>
      <td>${c.birth_date||'-'}</td>
      <td style="font-size:12px">${escapeHtml(c.goal)||'-'}</td>
      <td style="font-size:12px">${c.membership_type === '횟수권' ? '횟수권 '+(c.count_total||c.period||'')+'회' : (c.plan ? escapeHtml(c.plan)+' '+(c.period||'')+'개월' : '-')}</td>
      <td>${c.has_photo ? '📷' : '-'}</td>
      <td>${statusBadge}</td>
      <td style="display:flex;gap:4px">
        <button class="action-btn" onclick="openContractDetail(${c.id})">보기</button>
        ${regBtn}
        <button class="action-btn danger" onclick="deleteContract(${c.id})">삭제</button>
      </td>
    </tr>`;
  }).join('');
}

async function openContractDetail(id) {
  const c = await adminFetch(API + '/contracts/' + id).then(r => r.json()).catch(() => null);
  if (!c) return alert('계약서를 불러올 수 없습니다');
  const row = (label, val) => `<div style="display:flex;padding:7px 0;border-bottom:1px solid #f5f5f5"><span style="width:90px;color:#888;font-size:13px;flex:none">${escapeHtml(label)}</span><span style="font-size:14px">${escapeHtml(val)||'-'}</span></div>`;
  document.getElementById('contract-detail').innerHTML = `
    ${c.photo ? `<div style="text-align:center;margin-bottom:14px"><img src="${escapeHtml(c.photo)}" style="width:120px;height:120px;border-radius:12px;object-fit:cover;border:1px solid #eee"></div>` : ''}
    ${row('이름', c.name)}
    ${row('연락처', c.phone)}
    ${row('생년월일', c.birth_date)}
    ${row('성별', c.gender)}
    ${row('인스타', c.insta)}
    ${row('방향성', c.goal)}
    ${row('부상/특이', c.injury)}
    ${row('지역', c.region)}
    ${row('가입경로', c.source)}
    ${row('개인정보 동의', c.privacy_agreed ? '✅ 동의' : '미동의')}
    <div style="margin-top:10px;padding:10px 12px;background:#f5f5f5;border-radius:8px">
      <div style="font-size:12px;color:#888;margin-bottom:4px">👔 직원 작성 내용</div>
      ${row('회원권 종류', c.membership_type || '기간제')}
      ${c.membership_type === '횟수권'
        ? row('총 횟수', (c.count_total||c.period||'-')+'회')
        : row('요금제', c.plan ? `${escapeHtml(c.plan)} ${c.period||''}개월` : '-')}
      ${(c.membership_type !== '횟수권' && (c.start_date || c.end_date)) ? row('기간(직접)', `${c.start_date||'-'} ~ ${c.end_date||'-'}`) : ''}
      ${row('할인율', c.discount ? (c.discount*100)+'%' : '없음')}
      ${row('금액', c.amount ? c.amount.toLocaleString('ko-KR')+'원' : '-')}
      ${row('락커', c.locker_months ? c.locker_months+'개월' : '-')}
      ${row('운동복', c.uniform_months ? c.uniform_months+'개월' : '-')}
      ${c.staff_memo ? row('직원메모', c.staff_memo) : ''}
    </div>
    <div style="margin-top:12px"><div style="font-size:13px;color:#888;margin-bottom:6px">서명</div>
      ${c.signature ? `<img src="${escapeHtml(c.signature)}" style="width:100%;max-width:300px;border:1px solid #eee;border-radius:8px;background:#fff">` : '-'}</div>
    <div style="display:flex;gap:8px;margin-top:18px">
      <button class="action-btn" style="border-color:#1565c0;color:#1565c0" onclick="printContract(${c.id})">📄 PDF 출력</button>
      ${c.status !== 'registered' ? `<button class="submit-btn" style="flex:1" onclick="closeModal('contract-modal');${c.contract_type==='재등록'?'renewFromContract':(c.membership_type==='횟수권'?'registerCountFromContract':'registerFromContract')}(${c.id})">이 내용으로 ${c.contract_type==='재등록'?'재등록':(c.membership_type==='횟수권'?'횟수권 등록':'등록')}</button>` : '<div style="flex:1;text-align:center;color:#888;font-size:13px;padding:10px">이미 등록 완료된 계약서입니다</div>'}
    </div>`;
  document.getElementById('contract-modal').classList.add('open');
}

// 계약서 내용으로 등록 폼 자동 채우기 → 등록 탭으로
async function registerFromContract(id) {
  let c = contractsCache.find(x => x.id === id);
  if (!c) return;
  // 사진 포함 전체 데이터 가져오기 (목록은 has_photo만 줌)
  try {
    const full = await adminFetch(API + '/contracts/' + id).then(r => r.json());
    if (full && !full.error) c = full;
  } catch (e) {}
  window._registeringPhoto = c.photo || null;
  // 등록 탭으로 전환 (신규)
  openMemberSubTab('register', document.querySelector('#page-members > .sub-tabs .sub-tab:nth-child(2)'));
  setRegType(document.querySelector('#member-sub-register .tab-sm'), 'new');
  // 요금제 옵션이 준비됐는지 보장 (안 돼있으면 먼저 로드)
  if (typeof loadPricingData === 'function') {
    const planSel0 = document.getElementById('reg-plan');
    if (!planSel0 || planSel0.options.length <= 1) { try { await loadPricingData(); } catch(e){} }
  }
  // 폼 채우기
  setTimeout(() => {
    const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = (val == null ? '' : val); };
    set('reg-name', c.name);
    set('reg-phone', c.phone);
    // 성별 select
    const g = document.getElementById('reg-gender'); if (g) g.value = c.gender || '';
    // 생년월일/인스타/방향성/부상 — 전용 칸에 따로 저장 (메모에 안 넣음)
    set('reg-birth', c.birth_date);
    set('reg-insta', c.insta);
    set('reg-goal', c.goal);
    set('reg-injury', c.injury);
    set('reg-region', c.region);
    // 가입경로 select
    const srcSel = document.getElementById('reg-source');
    if (srcSel) srcSel.value = (c.source && [...srcSel.options].some(o => o.value === c.source)) ? c.source : '';
    // 메모는 직원 메모만 (있으면)
    set('reg-memo', c.staff_memo || '');

    // 직원 작성란 — 요금제/기간/할인율
    // 요금제: 계약서에 없거나 가격표에 없으면 비워서 이전 계약서 값이 안 남게
    { const _ps = document.getElementById('reg-plan');
      if (_ps) { const ok = c.plan && [...(_ps.options)].some(o => o.value === c.plan); _ps.value = ok ? c.plan : ''; } }
    if (c.plan) {
      const planSel = document.getElementById('reg-plan');
      if (planSel) {
        const hasPlan = [...planSel.options].some(o => o.value === c.plan);
        if (hasPlan) planSel.value = c.plan;
      }
      const periodSel = document.getElementById('reg-period');
      // 계약서에 시작일/만료일이 직접 들어있으면 '만료일 직접입력' 모드로 채움 (period 역산이 덮어쓰지 않게)
      if (c.start_date || c.end_date) {
        if (periodSel) periodSel.value = 'custom';
        if (typeof onPeriodChange === 'function') onPeriodChange();
        const sEl = document.getElementById('reg-start');
        const eEl = document.getElementById('reg-end');
        if (sEl && c.start_date) sEl.value = c.start_date;
        if (eEl && c.end_date) eEl.value = c.end_date;
      } else {
        if (periodSel && c.period) {
          const pv = String(c.period);
          if ([...periodSel.options].some(o => o.value === pv)) periodSel.value = pv;
        }
        if (typeof onPeriodChange === 'function') onPeriodChange();
      }
      const discSel = document.getElementById('reg-discount');
      if (discSel && c.discount != null) {
        // 가장 가까운 할인율 옵션 선택
        const target = parseFloat(c.discount);
        let best = discSel.options[0].value;
        let bestDiff = Infinity;
        [...discSel.options].forEach(o => { const d = Math.abs(parseFloat(o.value) - target); if (d < bestDiff) { bestDiff = d; best = o.value; } });
        discSel.value = best;
      }
      if (typeof calcPrice === 'function') calcPrice();
      // 계약서에서 입력한 금액(직접입력 포함)을 그대로 반영 — 직접입력칸에 넣어 자동계산이 덮어쓰지 않게
      if (c.amount != null) {
        const customInput = document.getElementById('reg-amount-custom');
        if (customInput) {
          customInput.value = c.amount;
          if (typeof onAmountCustomInput === 'function') onAmountCustomInput();
        }
      }
    }
    // 락커 자동 체크 + 개월수
    if (c.locker_months) {
      const lt = document.getElementById('locker-toggle');
      if (lt && !lt.checked) { lt.checked = true; toggleSection('locker-section', true); if (typeof initRegLocker==='function') initRegLocker(); }
      const lm = document.getElementById('reg-locker-months');
      if (lm) { lm.value = c.locker_months; if (typeof calcRegLockerAmount==='function') calcRegLockerAmount(); }
    }
    // 운동복은 서비스 종료로 등록 폼에서 제거됨 (옛 계약서에 값이 있어도 무시)
    if (typeof updateRegTotal === 'function') updateRegTotal();

    // 계약서 ID를 기억해서 등록 완료 시 연결
    window._registeringContractId = c.id;
    alert(`${c.name} 님의 계약서 내용을 등록 폼에 채웠습니다.\n요금·락커·운동복까지 채워졌으니 확인 후 등록을 완료하세요.`);
    document.getElementById('reg-name').scrollIntoView({ behavior:'smooth', block:'center' });
  }, 80);
}

// 계약서 내용으로 횟수권 등록 (신규 횟수권 전용) → 회원관리>횟수권 탭
async function registerCountFromContract(id) {
  let c = contractsCache.find(x => x.id === id);
  if (!c) return;
  try {
    const full = await adminFetch(API + '/contracts/' + id).then(r => r.json());
    if (full && !full.error) c = full;
  } catch (e) {}

  // 회원관리 페이지 > 횟수권 탭으로 이동
  openPage('members');
  setTimeout(() => {
    openMemberSubTab('counts', document.querySelector("#page-members > .sub-tabs .sub-tab:nth-child(3)"));
    // 등록 폼 열기
    const card = document.getElementById('ct-register-card');
    const btn = document.getElementById('ct-toggle-btn');
    if (card && card.style.display === 'none') {
      card.style.display = 'block';
      if (btn) btn.textContent = '✕ 닫기';
    }
    const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = (val == null ? '' : val); };
    set('ct-name', c.name);
    set('ct-phone', c.phone);
    const g = document.getElementById('ct-gender'); if (g) g.value = c.gender || '';
    // 인스타/운동목적/부상/생년월일/지역 — 일반 등록과 동일하게 채움
    set('ct-region', c.region);
    set('ct-birth', c.birth_date);
    set('ct-insta', c.insta);
    set('ct-goal', c.goal);
    set('ct-injury', c.injury);
    // 총 횟수: count_total 우선, 없으면 period
    set('ct-count', c.count_total || c.period || '');
    set('ct-amount', c.amount || '');
    // 가입 경로
    const srcSel = document.getElementById('ct-source');
    if (srcSel) srcSel.value = (c.source && [...srcSel.options].some(o => o.value === c.source)) ? c.source : '';
    set('ct-memo', c.staff_memo || '');
    // 등록일 기본값
    const cs = document.getElementById('ct-start'); if (cs && !cs.value) cs.value = todayKST();

    // 등록 완료 시 계약서 연결용
    window._registeringCountContractId = c.id;

    alert(`${c.name} 님의 횟수권 계약 내용을 등록 폼에 채웠습니다.\n총 횟수·금액을 확인 후 등록을 완료하세요.`);
    if (card) card.scrollIntoView({ behavior:'smooth', block:'center' });
  }, 100);
}

// 계약서 내용으로 재등록 (기존 회원 연결 + 요금/락커/운동복 채움)
async function renewFromContract(id) {
  const c = contractsCache.find(x => x.id === id);
  if (!c) return;
  if (!c.renew_member_id) return alert('연결된 회원 정보가 없습니다. 신규 등록으로 처리해 주세요.');
  // 기존 재등록 흐름으로 진입 (회원 자동 선택)
  await goToRenew(c.renew_member_id);
  // 요금제/기간/할인/금액/락커/운동복 채우기 (재등록 폼)
  await new Promise(r => setTimeout(r, 120));
  const setV = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = (val == null ? '' : val); };
  { const _psR = document.getElementById('renew-plan');
    if (_psR) { const ok = c.plan && [...(_psR.options)].some(o => o.value === c.plan); _psR.value = ok ? c.plan : ''; } }
  if (c.plan) {
    const planSel = document.getElementById('renew-plan');
    if (planSel && [...planSel.options].some(o => o.value === c.plan)) planSel.value = c.plan;
    const periodSel = document.getElementById('renew-period');
    // 계약서에 시작일/만료일이 직접 들어있으면 '만료일 직접입력' 모드로 채움
    if (c.start_date || c.end_date) {
      if (periodSel) periodSel.value = 'custom';
      if (typeof onRenewPeriodChange === 'function') onRenewPeriodChange();
      const sEl = document.getElementById('renew-start');
      const eEl = document.getElementById('renew-end');
      if (sEl && c.start_date) sEl.value = c.start_date;
      if (eEl && c.end_date) eEl.value = c.end_date;
    } else {
      if (periodSel && c.period && [...periodSel.options].some(o => o.value === String(c.period))) periodSel.value = String(c.period);
      if (typeof onRenewPeriodChange === 'function') onRenewPeriodChange();
    }
    const discSel = document.getElementById('renew-discount');
    if (discSel && c.discount != null) {
      const target = parseFloat(c.discount); let best = discSel.options[0].value, bd = Infinity;
      [...discSel.options].forEach(o => { const d = Math.abs(parseFloat(o.value)-target); if (d<bd){bd=d;best=o.value;} });
      discSel.value = best;
    }
    if (typeof calcRenewPrice === 'function') calcRenewPrice();
  }
  // 금액 직접입력칸 (계약서 금액 우선)
  if (c.amount != null) {
    const rc = document.getElementById('renew-amount-custom');
    if (rc) { rc.value = c.amount; if (typeof onRenewAmountCustomInput === 'function') onRenewAmountCustomInput(); }
  }
  // 락커/운동복 — 계약서에서 '연장' 체크했거나 개월수 입력시 자동 반영
  if (c.extend_locker || c.locker_months) {
    const lt = document.getElementById('renew-locker-toggle');
    if (lt && !lt.checked) { lt.checked = true; toggleSection('renew-locker-section', true); }
    if (c.locker_months) setV('renew-locker-months', c.locker_months);
    if (typeof calcRenewLockerAmount === 'function') calcRenewLockerAmount();
  }
  // 운동복은 서비스 종료로 재등록 폼에서 제거됨 (옛 계약서에 값이 있어도 무시)
  window._registeringContractId = c.id;
  alert(`${c.name} 님 재등록 계약서를 불러왔습니다.\n요금·기간을 확인하고 재등록을 완료하세요.`);
}


// 계약서 PDF 출력 (인쇄 → PDF 저장)
async function printContract(id) {
  const c = await adminFetch(API + '/contracts/' + id).then(r => r.json()).catch(() => null);
  if (!c) return alert('계약서를 불러올 수 없습니다');
  const esc = (s) => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const dateStr = (c.created_at||'').slice(0,10);
  const goalStr = c.goal || '-';
  const isCount = c.membership_type === '횟수권';
  const priceRows = isCount ? `
    <tr><td>회원권 종류</td><td>횟수권</td></tr>
    <tr><td>총 횟수</td><td>${esc(String(c.count_total||c.period||'-'))}회</td></tr>
    <tr><td>결제 금액</td><td>${c.amount ? Number(c.amount).toLocaleString('ko-KR')+'원' : '-'}</td></tr>`
    : (c.plan ? `
    <tr><td>요금제</td><td>${esc(c.plan)} ${c.period||''}개월</td></tr>
    ${(c.start_date || c.end_date) ? `<tr><td>이용 기간</td><td>${esc(c.start_date||'-')} ~ ${esc(c.end_date||'-')}</td></tr>` : ''}
    <tr><td>할인율</td><td>${c.discount ? (c.discount*100)+'%' : '없음'}</td></tr>
    <tr><td>결제 금액</td><td>${c.amount ? Number(c.amount).toLocaleString('ko-KR')+'원' : '-'}</td></tr>
    ${c.locker_months ? `<tr><td>락커</td><td>${c.locker_months}개월</td></tr>` : ''}
    ${c.uniform_months ? `<tr><td>운동복</td><td>${c.uniform_months}개월</td></tr>` : ''}` : '');

  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>가입 신청서 - ${esc(c.name)}</title>
<style>
  @page { margin: 18mm; }
  * { box-sizing:border-box; }
  body { font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif; color:#1a1a1a; line-height:1.6; font-size:12px; }
  h1 { text-align:center; font-size:20px; margin:0 0 4px; }
  .sub { text-align:center; color:#666; font-size:12px; margin-bottom:18px; }
  .sec-title { font-weight:700; font-size:13px; border-bottom:2px solid #1a1a1a; padding-bottom:4px; margin:18px 0 8px; }
  table { width:100%; border-collapse:collapse; margin-bottom:8px; }
  td { border:1px solid #ddd; padding:6px 10px; font-size:12px; }
  td:first-child { background:#f5f5f5; width:120px; font-weight:600; }
  .terms { font-size:10.5px; line-height:1.6; color:#333; white-space:pre-line; border:1px solid #eee; padding:12px; border-radius:4px; }
  .sign-area { margin-top:24px; display:flex; justify-content:space-between; align-items:flex-end; }
  .sign-box { text-align:center; }
  .sign-box img { max-width:200px; max-height:90px; border-bottom:1px solid #999; }
  .sign-label { font-size:12px; margin-top:4px; }
  .agree { margin-top:10px; font-size:12px; }
  @media print { .no-print { display:none; } }
</style></head><body>
  <h1>CROSSFIT GROVE 군자점 회원 가입 신청서</h1>
  <div class="sub">작성일: ${esc(dateStr)} ${c.contract_type==='재등록'?'· 재등록':''}</div>

  <div class="sec-title">회원 정보</div>
  <table>
    <tr><td>이름</td><td>${esc(c.name)}</td></tr>
    <tr><td>연락처</td><td>${esc(c.phone)||'-'}</td></tr>
    <tr><td>생년월일</td><td>${esc(c.birth_date)||'-'}</td></tr>
    <tr><td>성별</td><td>${esc(c.gender)||'-'}</td></tr>
    <tr><td>인스타그램</td><td>${esc(c.insta)||'-'}</td></tr>
    <tr><td>거주 지역</td><td>${esc(c.region)||'-'}</td></tr>
    <tr><td>가입 경로</td><td>${esc(c.source)||'-'}</td></tr>
    <tr><td>운동 방향성</td><td>${esc(goalStr)}</td></tr>
    <tr><td>부상/특이사항</td><td>${esc(c.injury)||'-'}</td></tr>
  </table>

  ${priceRows ? `<div class="sec-title">등록 내용</div><table>${priceRows}</table>` : ''}

  <div class="sec-title">가입 약관</div>
  <div class="terms">* 1일 입장료(드랍인)는 25,000원입니다.

<b>1. 홀딩</b>
홀딩 기간은 1개월(0일), 3개월(10일), 6개월(30일)로 제한하며, 홀딩은 원하는 날짜에 사용 가능합니다. 홀딩은 운동 기간에 대해서만 가능하며, 홀딩 시 개인 락커와 운동복 대여 기간도 함께 정지(홀딩)됩니다. 제공된 홀딩 이외에 [크로스핏 그로브]에서 인정하는 정당한 사유로 인한 홀딩의 경우 협의에 의해 신청할 수 있습니다. (예: 코로나 감염, 골절, 해외출장, 신혼여행 등)

<b>2. 양도</b>
본 계약에 따른 회원권 이용은 본인만 사용함을 원칙으로 하나, 부득이한 경우 [크로스핏 그로브]의 사전 승인을 받아 양도할 수 있습니다. 양도는 1회에 한해서만 가능하며 양도 시 수수료(50,000원)가 부과됩니다. 양도 시 가입 시 받은 서비스 혜택(홀딩)은 자동 소멸되며, 양수인은 홀딩·재양도·환불이 불가하며 회원 간 양도는 불가능합니다.

<b>3. 해지</b>
계약 해지 시 가입하신 총합계 금액의 10%(공정거래법 준함)에 상당하는 해지 위약금, 해지일까지 이용일 수에 해당하는 금액을 정상금액(일 8,333원) 기준으로 정산 후 공제하여 잔여금액을 환불받을 수 있습니다. 해지 시 홀딩 기간도 이용 기간으로 포함됩니다.

<b>4. 회원 자격 상실</b>
[크로스핏 그로브]는 다른 회원님의 안전과 배려를 위해 본 계약서의 등록조건 및 회원권 규정을 위반하거나 다른 회원님의 수업에 방해되는 행동을 하시는 회원님의 회원권을 강제 해지할 수 있습니다.

<b>5. 추가비용</b>
[크로스핏 그로브]는 기본 시설을 제외한 부대시설을 별도의 추가 비용으로 이용하실 수 있습니다. 개인락커(월 5,000원), 운동복(월 15,000원)을 신청 후 사용할 수 있습니다. 회원권 또는 락커 기간 경과 후 회수하지 않을 시 별도의 통보 없이 임의로 폐기하며, [크로스핏 그로브]는 일체의 배상책임을 지지 않습니다.

<b>6. 면책규정</b>
귀중품은 반드시 안내데스크에 보관하시고 회원의 부주의로 인한 분실 또는 도난 시 [크로스핏 그로브]의 책임은 없습니다. 본 시설은 운동을 위한 공간이므로 휴대폰 및 귀중품을 바닥에 둘 시 파손의 우려가 있으므로 락카 또는 핸드폰 보관 장소에 보관 바랍니다. 부주의로 인한 파손에 [크로스핏 그로브]는 책임이 없습니다. 회원님은 본 박스가 시설관리 또는 회원 질서유지 등과 관련하여 책임이 없는 경우를 제외하고 회원님 또는 제3자의 행위로 인한 회원님의 신체 또는 정신적 장애나 경제적 손실에 대하여 [크로스핏 그로브]는 책임이 없다는 것에 동의합니다.

<b>7. 회원님의 권리와 의무</b>
회원님의 권리와 의무는 본 계약 및 회원권 규정에 명시되어 있습니다. 회원님은 본 계약서에 서명할 때 회원님의 권리와 의무를 수락하였음을 인정합니다. 본 약관에 [크로스핏 그로브]와 관련된 모든 사항은 [크로스핏 그로브]가 정한 기본 규정에 준합니다. 이 계약과 관련하여 회원님으로부터 취득한 개인정보는 일체 외부 유출이 금지되며, 관련 법률이 정한 바에 따라 엄격히 관리됩니다. 본인은 회원 가입 약관에 명시된 모든 계약 조건을 알고 이해하였으며 이에 동의합니다.

<b>8. 초상권 사용 동의</b>
개인정보 보호 정책으로 홈페이지, 카페, SNS 등 다양한 홍보 매체를 통해 정보를 공유함에 따라 [크로스핏 그로브] 운영 시 촬영된 대상자 사진 및 영상과 관련하여 초상권 사용에 대해 동의합니다.</div>

  <div class="agree">[v] 위 가입 약관 및 개인정보 수집·이용, 초상권 사용에 모두 동의합니다.</div>

  <div class="sign-area">
    <div style="font-size:12px">작성일: ${esc(dateStr)}</div>
    <div class="sign-box">
      ${c.signature ? `<img src="${esc(c.signature)}">` : '<div style="width:200px;border-bottom:1px solid #999;height:60px"></div>'}
      <div class="sign-label">${esc(c.name)} (서명)</div>
    </div>
  </div>

  <div class="no-print" style="text-align:center;margin-top:24px">
    <button onclick="window.print()" style="padding:10px 20px;font-size:14px;background:#1a1a1a;color:#fff;border:none;border-radius:8px;cursor:pointer">인쇄 / PDF 저장</button>
  </div>
  <scr` + `ipt>window.onload=function(){setTimeout(function(){window.print();},400);};</scr` + `ipt>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) return alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.');
  w.document.write(html);
  w.document.close();
}

async function deleteContract(id) {
  if (!confirm('이 계약서를 삭제하시겠습니까?')) return;
  await adminFetch(API + '/contracts/' + id, { method:'DELETE' });
  loadContracts();
}