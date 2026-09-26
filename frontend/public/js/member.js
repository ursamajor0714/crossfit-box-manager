const API = '/api';
let memberId = null;
let memberToken = null;

// 회원 인증 토큰을 자동 첨부하는 fetch 래퍼 (토큰 만료/무효 시 로그아웃)
async function memberFetch(url, options = {}) {
  options.headers = Object.assign({}, options.headers, memberToken ? { 'Authorization': 'Bearer ' + memberToken } : {});
  const res = await fetch(url, options);
  if (res.status === 401) {
    // 세션 만료 등 → 로그인 화면으로
    logout();
    throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
  }
  return res;
}

// 한국시간(KST) 기준 오늘 날짜 (UTC 변환으로 인한 날짜 오차 방지)
function todayKST() {
  return new Date(Date.now() + 9*60*60*1000).toISOString().split('T')[0];
}
function addDaysKST(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  d.setDate(d.getDate() + days);
  return new Date(d.getTime() + 9*60*60*1000).toISOString().split('T')[0];
}

async function doLogin() {
  const name = document.getElementById('login-name').value.trim();
  const password = document.getElementById('login-pw').value.trim();
  if (!name || !password) return alert('이름과 비밀번호를 입력해주세요');

  const res = await fetch(API + '/member/login', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({name, password})
  });
  const data = await res.json();
  if (data.error) return alert(data.error);

  memberId = data.id;
  memberToken = data.token;
  sessionStorage.setItem('memberId', data.id);
  sessionStorage.setItem('memberToken', data.token || '');
  loadDashboard();
}

async function loadDashboard() {
  const m = await memberFetch(API + '/member/' + memberId + '/info').then(r => r.json()).catch(() => ({error:true}));
  if (m.error) { logout(); return; }
  window.currentMember = m;

  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('dash-view').classList.remove('hidden');
  document.getElementById('member-name').textContent = m.name;

  // 비밀번호 변경이 필요한 계정이면 닫을 수 없는 안내 모달을 띄워 강제로 변경하게 함
  if (m.must_change_password) openForcePwModal();

  loadMemberMessage();

  // 회원권
  const reg = m.registration;
  const today = todayKST();
  let membershipHtml = '';
  if (reg) {
    if (reg.reg_type === '횟수권') {
      const remain = reg.remaining_count||0;
      const usages = m.count_usages || [];
      const today = todayKST();
      const usedToday = usages.some(u => u.used_date === today);
      const historyHtml = usages.length
        ? usages.map(u => `<div class="hold-status"><span>${u.used_date}</span><span style="color:#888;font-size:12px">${u.memo||''}</span></div>`).join('')
        : '<div class="empty">출석 이력이 없습니다</div>';
      membershipHtml = `
        <div class="info-row"><span class="label">요금제</span><span class="value">횟수권</span></div>
        <div class="info-row"><span class="label">잔여 횟수</span><span class="value lime">${remain}회</span></div>
        ${remain <= 0
          ? `<div class="empty" style="margin-top:8px">잔여 횟수가 없습니다</div>`
          : usedToday
            ? `<div class="empty" style="margin-top:8px">오늘 출석 완료 ✓</div>`
            : `<button class="btn-hold" style="margin-top:12px" onclick="useMyCount()">출석 체크 (1회 차감)</button>`}
        <button onclick="toggleCountHistory()" id="count-history-btn" style="width:100%;background:none;border:1px solid #333;color:#888;padding:11px;border-radius:8px;font-size:13px;cursor:pointer;margin-top:8px">출석 이력 보기 (${usages.length}회) ▾</button>
        <div id="count-history-list" style="margin-top:12px;display:none">${historyHtml}</div>`;
    } else {
      const expSoon = reg.end_date && reg.end_date <= addDaysKST(todayKST(), 7);
      const holdRemain = (reg.holding_total||0) - (reg.holding_days||0);
      membershipHtml = `
        <div class="info-row"><span class="label">요금제</span><span class="value">${reg.plan||'-'}</span></div>
        <div class="info-row"><span class="label">시작일</span><span class="value">${reg.start_date||'-'}</span></div>
        <div class="info-row"><span class="label">만료일</span><span class="value ${expSoon?'warn':''}">${reg.end_date||'-'}${expSoon?' (곧 만료)':''}</span></div>
        <div class="info-row"><span class="label">홀딩</span><span class="value">잔여 <span class="lime">${holdRemain}일</span> / 총 ${reg.holding_total||0}일</span></div>`;
    }
  } else {
    membershipHtml = '<div class="empty">활성 회원권이 없습니다</div>';
  }
  document.getElementById('membership-info').innerHTML = membershipHtml;

  // 횟수권 회원은 홀딩 신청 숨김 (만료일 개념이 없으므로)
  const holdingCard = document.getElementById('holding-card');
  if (reg && reg.reg_type === '횟수권') {
    holdingCard.style.display = 'none';
  } else {
    holdingCard.style.display = '';
  }

  // 락커/운동복
  let lockerHtml = '';
  if (m.locker) lockerHtml += `<div class="info-row"><span class="label">락커</span><span class="value">${m.locker.id}번 · 만료 ${m.locker.end_date||'-'}</span></div>`;
  if (m.uniform) lockerHtml += `<div class="info-row"><span class="label">운동복</span><span class="value">이용 중 · 만료 ${m.uniform.end_date||'-'}</span></div>`;
  if (!lockerHtml) lockerHtml = '<div class="empty">이용 중인 락커/운동복이 없습니다</div>';
  document.getElementById('locker-info').innerHTML = lockerHtml;

  // 홀딩 신청 이력 (날짜별 1일 단위)
  const hr = (m.holding_requests || []).slice().sort((a,b) => (b.start_date||'').localeCompare(a.start_date||''));
  const todayStr = todayKST();
  document.getElementById('holding-list').innerHTML = hr.length
    ? hr.map(h => {
        // 당일 홀딩은 취소 불가 (서버와 동일한 기준: 오늘보다 미래인 날짜만 취소 가능)
        const canCancel = h.start_date && h.start_date > todayStr;
        const cancelBtn = canCancel
          ? `<button onclick="cancelHold(${h.id})" style="background:none;border:1px solid #444;color:#ff8a80;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;margin-left:8px">취소</button>`
          : `<span style="color:#555;font-size:11px;margin-left:8px">${h.start_date === todayStr ? '당일 취소 불가' : '지남'}</span>`;
        return `<div class="hold-status"><span>${h.start_date||'-'}</span><span style="display:flex;align-items:center">${cancelBtn}</span></div>`;
      }).join('')
    : '<div class="empty">신청 이력이 없습니다</div>';
  document.getElementById('holding-toggle-btn').textContent = `기존 홀딩 신청 내역 보기 (${hr.length}건) ▾`;

  // 특별 연장 (관리자가 부여, 조회 전용 · 받은 적 없으면 카드 자체를 숨김)
  const se = m.special_extensions || [];
  const specialCard = document.getElementById('special-card');
  if (se.length) {
    specialCard.classList.remove('hidden');
    document.getElementById('special-list').innerHTML = se.map(s => `
      <div class="info-row">
        <span class="label">${s.start_date} ~ ${s.end_date}</span>
        <span class="value">${s.reason ? s.reason : '-'}</span>
      </div>`).join('');
  } else {
    specialCard.classList.add('hidden');
  }
}

// ── 관리자 안내 메시지 (1회성, 48시간 내 미확인 시 자동 만료) ──
let currentMessageId = null;
async function loadMemberMessage() {
  const data = await memberFetch(API + '/member/' + memberId + '/message').then(r => r.json()).catch(() => ({message:null}));
  const card = document.getElementById('message-card');
  if (data.message) {
    currentMessageId = data.message.id;
    document.getElementById('message-content').textContent = data.message.content;
    card.classList.remove('hidden');
  } else {
    currentMessageId = null;
    card.classList.add('hidden');
  }
}

async function dismissMessage() {
  if (!currentMessageId) return;
  const id = currentMessageId;
  document.getElementById('message-card').classList.add('hidden');
  await memberFetch(API + '/member/' + memberId + '/message/' + id + '/read', { method: 'POST' }).catch(() => {});
}

function toggleHoldingList() {
  const list = document.getElementById('holding-list');
  const btn = document.getElementById('holding-toggle-btn');
  if (list.style.display === 'none') {
    list.style.display = 'block';
    btn.textContent = btn.textContent.replace('▾', '▴');
  } else {
    list.style.display = 'none';
    btn.textContent = btn.textContent.replace('▴', '▾');
  }
}

function openHold() {
  const m = window.currentMember;
  const reg = m && m.registration;
  const holdRemain = reg ? (reg.holding_total||0) - (reg.holding_days||0) : 0;
  if (holdRemain <= 0) {
    alert('사용 가능한 홀딩이 없습니다.');
    return;
  }
  document.getElementById('hold-start').value = todayKST();
  document.getElementById('hold-end').value = todayKST();
  document.getElementById('hold-remain-info').textContent = `사용 가능한 홀딩: ${holdRemain}일`;
  document.getElementById('hold-modal').classList.add('open');
}
function closeHold() { document.getElementById('hold-modal').classList.remove('open'); }

async function submitHold() {
  const start_date = document.getElementById('hold-start').value;
  const end_date = document.getElementById('hold-end').value;
  if (!start_date) return alert('홀딩 시작일을 선택해주세요');
  if (!end_date) return alert('홀딩 종료일을 선택해주세요');
  if (end_date < start_date) return alert('종료일은 시작일 이후여야 합니다');

  const todayStr = todayKST();
  if (start_date < todayStr) return alert('홀딩 시작일은 오늘 이후만 가능합니다');

  const days = Math.round((new Date(end_date) - new Date(start_date)) / 86400000) + 1;

  // 이미 홀딩한 날짜가 신청 구간에 있으면 서버 요청 전에 바로 안내 (서버에서도 동일하게 한 번 더 검사)
  const existing = new Set(((window.currentMember && window.currentMember.holding_requests) || [])
    .map(h => h.start_date).filter(Boolean));
  for (let i = 0; i < days; i++) {
    const d = new Date(new Date(start_date + 'T00:00:00Z').getTime() + i * 86400000)
      .toISOString().split('T')[0];
    if (existing.has(d)) return alert(`이미 홀딩한 날짜입니다 (${d})`);
  }

  const btn = document.getElementById('hold-submit-btn');
  if (btn.disabled) return; // 중복 클릭 방지
  btn.disabled = true;
  btn.textContent = '처리 중...';

  try {
    const res = await memberFetch(API + '/holding-requests', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({member_id: memberId, days, start_date})
    });
    const data = await res.json();
    if (data.error) return alert(data.error);

    alert(`홀딩이 적용되었습니다!\n새 만료일: ${data.new_end_date}\n락커·운동복도 함께 연장되었습니다.`);
    closeHold();
    loadDashboard();
  } finally {
    btn.disabled = false;
    btn.textContent = '신청하기';
  }
}

async function cancelHold(id) {
  if (!confirm('이 홀딩을 취소하시겠습니까?\n만료일이 원래대로 돌아갑니다.')) return;
  const res = await memberFetch(API + '/holding-requests/' + id, {method:'DELETE'});
  const data = await res.json();
  if (data.error) return alert(data.error);
  alert('홀딩이 취소되었습니다.');
  loadDashboard();
}

async function useMyCount() {
  if (!confirm('출석 체크하시겠습니까?\n횟수권 1회가 차감됩니다.')) return;
  const res = await memberFetch(API + '/member/' + memberId + '/use-count', {
    method:'POST', headers:{'Content-Type':'application/json'}
  });
  const data = await res.json();
  if (data.error) return alert(data.error);
  alert(`출석 완료!\n남은 횟수: ${data.remaining_count}회`);
  loadDashboard();
}

function toggleCountHistory() {
  const list = document.getElementById('count-history-list');
  const btn = document.getElementById('count-history-btn');
  if (list.style.display === 'none') {
    list.style.display = 'block';
    btn.textContent = btn.textContent.replace('▾', '▴');
  } else {
    list.style.display = 'none';
    btn.textContent = btn.textContent.replace('▴', '▾');
  }
}

function logout() {
  sessionStorage.removeItem('memberId');
  sessionStorage.removeItem('memberToken');
  memberId = null;
  memberToken = null;
  document.getElementById('dash-view').classList.add('hidden');
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('login-name').value = '';
  document.getElementById('login-pw').value = '';
}

// 비밀번호 정책: 8자 이상, 영소문자와 숫자 필수 포함 (대문자·특수문자는 사용 가능하나 필수 아님) — 서버 정책과 동일
const PASSWORD_POLICY_HINT = '8자 이상, 영소문자와 숫자를 포함해야 합니다 (대문자·특수문자 사용 가능)';
function isValidPasswordClient(pw) {
  return typeof pw === 'string' && /^(?=.*[a-z])(?=.*[0-9]).{8,}$/.test(pw);
}

function openPwModal() {
  document.getElementById('pw-current').value = '';
  document.getElementById('pw-new').value = '';
  document.getElementById('pw-new2').value = '';
  document.getElementById('pw-modal').classList.add('open');
}
function closePwModal() { document.getElementById('pw-modal').classList.remove('open'); }

async function submitPwChange() {
  const cur = document.getElementById('pw-current').value.trim();
  const np = document.getElementById('pw-new').value.trim();
  const np2 = document.getElementById('pw-new2').value.trim();
  if (!cur) return alert('현재 비밀번호를 입력해주세요');
  if (!isValidPasswordClient(np)) return alert(PASSWORD_POLICY_HINT);
  if (np !== np2) return alert('새 비밀번호가 일치하지 않습니다');

  const res = await memberFetch(API + '/member/' + memberId + '/password', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({current_password: cur, new_password: np})
  });
  const data = await res.json();
  if (data.error) return alert(data.error);
  alert('비밀번호가 변경되었습니다.');
  closePwModal();
}

// ── 최초 로그인 비밀번호 강제 변경 (닫기 불가) ──
function openForcePwModal() {
  document.getElementById('fpw-current').value = '';
  document.getElementById('fpw-new').value = '';
  document.getElementById('fpw-new2').value = '';
  document.getElementById('force-pw-modal').classList.add('open');
}

async function submitForcePwChange() {
  const cur = document.getElementById('fpw-current').value.trim();
  const np = document.getElementById('fpw-new').value.trim();
  const np2 = document.getElementById('fpw-new2').value.trim();
  if (!cur) return alert('현재 비밀번호를 입력해주세요');
  if (!isValidPasswordClient(np)) return alert(PASSWORD_POLICY_HINT);
  if (np !== np2) return alert('새 비밀번호가 일치하지 않습니다');

  const res = await memberFetch(API + '/member/' + memberId + '/password', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({current_password: cur, new_password: np})
  });
  const data = await res.json();
  if (data.error) return alert(data.error);
  alert('비밀번호가 변경되었습니다.');
  document.getElementById('force-pw-modal').classList.remove('open');
  if (window.currentMember) window.currentMember.must_change_password = 0;
}

// 세션 복원
const saved = sessionStorage.getItem('memberId');
const savedToken = sessionStorage.getItem('memberToken');
if (saved && savedToken) { memberId = saved; memberToken = savedToken; loadDashboard(); }
