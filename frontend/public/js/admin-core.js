// ============================================================
// 공통: 인증/세션, 네비게이션, 유틸, 통계
// CrossFit Box 관리자 - admin.html에서 분리된 스크립트
// 모든 함수/변수는 전역 스코프 공유 (일반 <script> 로드)
// ============================================================

// 비밀번호 하나로 누구인지까지 가린다 — 사장님 비밀번호면 관리자로, 코치 본인 비밀번호면 그 코치로 들어간다
async function adminLogin() {
  const pw = document.getElementById('admin-pw').value;
  const res = await fetch('/api/admin/login', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({password: pw})
  });
  if (res.ok) {
    const data = await res.json();
    sessionStorage.setItem('adminAuth', 'true');
    sessionStorage.setItem('adminToken', data.token);
    document.getElementById('admin-gate').style.display = 'none';
    loadStats();
    loadPricingData();
  } else {
    const data = await res.json().catch(() => ({}));
    document.getElementById('admin-pw-error').textContent = data.error || '비밀번호가 일치하지 않습니다';
    document.getElementById('admin-pw').value = '';
  }
}
// 세션 확인 (서버에서 로그인 게이트가 렌더링되었으면 로컬 세션도 비우기)
document.addEventListener('DOMContentLoaded', () => {
  const gate = document.getElementById('admin-gate');
  if (gate) {
    sessionStorage.removeItem('adminAuth');
    sessionStorage.removeItem('adminToken');
    return;
  }
  loadAdminSession();
});

// 인증 토큰을 자동으로 첨부하는 fetch 래퍼. 토큰 만료/무효 시 자동으로 로그인 화면 복귀.
async function adminFetch(url, options = {}) {
  const token = sessionStorage.getItem('adminToken');
  options.headers = Object.assign({}, options.headers, token ? { 'Authorization': 'Bearer ' + token } : {});
  const res = await fetch(url, options);
  if (res.status === 401) {
    sessionStorage.removeItem('adminAuth');
    sessionStorage.removeItem('adminToken');
    alert('세션이 만료되었습니다. 다시 로그인해주세요.');
    location.reload();
  }
  return res;
}

async function adminLogout() {
  sessionStorage.removeItem('adminAuth');
  sessionStorage.removeItem('adminToken');
  try {
    await fetch('/api/admin/logout', { method: 'POST' });
  } catch (e) {
    console.error('로그아웃 중 오류 발생:', e);
  }
  location.reload();
}

const API = '/api';

// ─── 열람 권한 ────────────────────────────────────────
// 사장님(owner)은 전부 보고, 코치(staff)는 사장님이 회원 상세에서 켜 준 탭만 본다.
// 서버에서도 같은 기준으로 막지만(backend/middleware/perms.js), 화면에서도 미리 잠가 준다.
let adminSession = null;   // { role, name, perms[], tree[] }

function hasPerm(key) {
  if (!adminSession) return true;              // 아직 못 읽었으면 막지 않는다 (사장님 화면이 깜빡이지 않도록)
  if (adminSession.role === 'owner') return true;
  return (adminSession.perms || []).includes(key);
}

async function loadAdminSession() {
  try {
    const res = await adminFetch(API + '/admin/me');
    if (!res.ok) return;
    adminSession = await res.json();
  } catch (e) { return; }
  applyPermissions();
  // 아직 전화번호 뒷 4자리를 쓰는 코치면 들어오자마자 변경창을 띄운다.
  // 바꾸지 않고 닫아도 다음에 들어올 때 서버가 다시 알려주므로 또 뜬다.
  if (adminSession.must_change_password) openPwChange();
}

// ─── 첫 로그인 비밀번호 변경 ──────────────────────────
function openPwChange() {
  ['pw-current','pw-new','pw-new2'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const err = document.getElementById('pw-change-error');
  if (err) err.textContent = '';
  document.getElementById('pw-change-modal').classList.add('open');
}

function closePwChange() {
  document.getElementById('pw-change-modal').classList.remove('open');
}

async function submitPwChange() {
  const cur = document.getElementById('pw-current').value;
  const pw1 = document.getElementById('pw-new').value;
  const pw2 = document.getElementById('pw-new2').value;
  const err = document.getElementById('pw-change-error');
  err.textContent = '';
  if (!cur || !pw1) return err.textContent = '모든 칸을 입력해주세요.';
  if (pw1 !== pw2) return err.textContent = '새 비밀번호가 서로 다릅니다.';
  if (cur === pw1) return err.textContent = '지금 쓰는 비밀번호와 다른 것으로 정해주세요.';

  const res = await adminFetch(API + '/member/' + adminSession.member_id + '/password', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ current_password: cur, new_password: pw1 })
  });
  const data = await res.json().catch(() => ({}));
  if (data.error) return err.textContent = data.error;

  adminSession.must_change_password = false;
  closePwChange();
  alert('비밀번호를 바꿨습니다. 다음부터는 새 비밀번호로 로그인하세요.');
}

// 권한 없는 탭에 자물쇠를 달고, 볼 수 있는 첫 화면으로 옮겨 준다
function applyPermissions() {
  const who = document.getElementById('header-who');
  if (who) who.textContent = adminSession.role === 'owner'
    ? '관리자 대시보드'
    : `관리자 대시보드 · ${adminSession.name} 코치`;

  document.querySelectorAll('[data-perm]').forEach(el => {
    const ok = hasPerm(el.dataset.perm);
    el.classList.toggle('locked', !ok);
    if (!ok && el.id === 'contract-write-link') el.style.display = 'none';
    if (!ok && el.tagName === 'BUTTON' && !el.textContent.startsWith('🔒')) {
      el.textContent = '🔒 ' + el.textContent;
    }
  });

  // 홈을 못 보는 코치는 빈 화면으로 시작하지 않도록 볼 수 있는 첫 탭을 연다
  if (!hasPerm('home')) {
    const first = [...document.querySelectorAll('.nav-btn[data-perm]')].find(b => hasPerm(b.dataset.perm));
    if (first) first.click(); else openPage('home');
  }
}
// 락커 월 요금. 가격이 바뀌면 여기만 고치면 등록·재등록·배정·연장 화면이 모두 따라온다.
const LOCKER_MONTHLY_FEE = 5000;
// 가격은 DB에서 동적으로 로드 (loadPricingData)
let allMembers = [];
let selectedHoldId = null;
let selectedLockerMember = null;

// 한국시간(KST) 기준 오늘 날짜 (UTC 변환으로 인한 날짜 오차 방지)
function todayKST() {
  return new Date(Date.now() + 9*60*60*1000).toISOString().split('T')[0];
}
function addDaysKST(dateStr, days) {
  return new Date(new Date(dateStr + 'T00:00:00+09:00').getTime() + days*86400000 + 9*60*60*1000)
    .toISOString().split('T')[0];
}

function openPage(p) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  const pageEl = document.getElementById('page-' + p);
  if (!pageEl) return;
  const idx = {home:0, revenue:1, members:2, 'locker-uniform':3, 'schedule-all':4, wod:5, notices:6, sms:7};
  if (idx[p] !== undefined) document.querySelectorAll('.nav-btn')[idx[p]].classList.add('active');
  // 권한 없는 탭은 내용 대신 '열람 권한이 없습니다.' 화면을 띄운다
  const navBtn = idx[p] !== undefined ? document.querySelectorAll('.nav-btn')[idx[p]] : null;
  if (navBtn && navBtn.dataset.perm && !hasPerm(navBtn.dataset.perm)) {
    document.getElementById('page-denied').classList.add('active');
    return;
  }
  pageEl.classList.add('active');
  if (p === 'home') { loadStats(); loadPricingData(); loadTodayApplications(); }
  if (p === 'revenue') {
    if (hasPerm('revenue.list')) loadRevenueAll(); else openFirstAllowedSubTab('page-revenue');
    // 가계부 탭이 열린 채로 돌아온 경우, 그 사이 생긴 회원등록·환불이 반영되도록 같이 다시 읽는다
    if (document.getElementById('page-revenue-stats')?.classList.contains('active')) loadLedger();
  }
  if (p === 'members') {
    loadPricingData();
    if (hasPerm('members.list')) loadMembers(); else openFirstAllowedSubTab('page-members');
  }
  if (p === 'locker-uniform') loadLockers();
  if (p === 'schedule-all') initSchedulePage();
  if (p === 'wod') initWodPage();
  if (p === 'notices') loadNotices();
  if (p === 'sms') loadSmsLogs();
}

function openMemberSubTab(tab, btn) {
  document.querySelectorAll('#page-members > .sub-tabs .sub-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#page-members > .sub-page').forEach(el => el.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // 권한 없는 서브탭은 내용 대신 '열람 권한이 없습니다.' 화면을 띄운다
  if (btn && btn.dataset.perm && !hasPerm(btn.dataset.perm)) {
    document.getElementById('member-sub-denied').classList.add('active');
    return;
  }
  const el = document.getElementById('member-sub-' + tab);
  if (el) el.classList.add('active');
  if (tab === 'list') loadMembers();
  if (tab === 'counts') loadCounts();
  if (tab === 'holding') loadHoldingList();
  if (tab === 'special') loadSpecialExtensions();
  if (tab === 'pricing') loadPricing();
  if (tab === 'contracts') loadContracts();
  if (tab === 'register') {
    const t = todayKST();
    const rs = document.getElementById('reg-start'); if (rs) rs.value = t;
    if (typeof calcEndDate === 'function') calcEndDate();
    if (typeof calcPrice === 'function') calcPrice();
  }
}

// 기본 서브탭(매출 내역·회원 목록)을 못 보는 코치를 위해, 볼 수 있는 첫 서브탭을 대신 연다
function openFirstAllowedSubTab(parentId) {
  const btns = [...document.querySelectorAll('#' + parentId + ' > .sub-tabs .sub-tab[data-perm]')];
  const ok = btns.find(b => hasPerm(b.dataset.perm));
  if (ok) ok.click();
  else {
    document.querySelectorAll('#' + parentId + ' > .sub-page').forEach(el => el.classList.remove('active'));
    btns.forEach(b => b.classList.remove('active'));
    const denied = document.getElementById(parentId === 'page-members' ? 'member-sub-denied' : parentId + '-denied');
    if (denied) denied.classList.add('active');
  }
}

function openInnerSubTab(parentId, tab, btn) {
  const parent = document.getElementById(parentId);
  if (!parent) return;
  parent.querySelectorAll(':scope > .sub-tabs .sub-tab').forEach(b => b.classList.remove('active'));
  parent.querySelectorAll(':scope > .sub-page').forEach(el => el.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (btn && btn.dataset.perm && !hasPerm(btn.dataset.perm)) {
    const denied = document.getElementById(parentId + '-denied');
    if (denied) { denied.classList.add('active'); return; }
  }
  const target = document.getElementById(parentId + '-' + tab);
  if (target) target.classList.add('active');
}

function openSubTab(page, tab) {
  const pageEl = document.getElementById('page-' + page);
  if (!pageEl) return;
  pageEl.querySelectorAll(':scope > .sub-tabs .sub-tab').forEach(b => b.classList.remove('active'));
  pageEl.querySelectorAll(':scope > .sub-page').forEach(el => el.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  const target = document.getElementById(page + '-sub-' + tab);
  if (target) target.classList.add('active');
  if (page === 'schedule-all' && tab === 'schedule') renderScheduleCalendar();
  if (page === 'schedule-all' && tab === 'calendar') initAdminCalendar();
  if (page === 'schedule-all' && tab === 'applications') loadApplications();
  if (page === 'schedule-all' && tab === 'templates') loadTemplates();
  if (page === 'sms' && tab === 'logs') loadSmsLogs();
  if (page === 'sms' && tab === 'templates') loadSmsTemplates();
}

function toggleSection(id, show) {
  document.getElementById(id).style.display = show ? 'block' : 'none';
}

async function loadStats() {
  const d = await adminFetch(API + '/stats').then(r => r.json());
  if (d.error) return; // 인증 만료 등으로 실패 시 undefined 렌더링 방지 (adminFetch가 로그인 화면으로 복귀시킴)
  document.getElementById('stat-members').textContent = d.active_members + '명';
  document.getElementById('stat-lockers').textContent = d.locker_used + '개';
  document.getElementById('stat-expiring').textContent = d.expiring_members.length + '명';
  const today = new Date();
  document.getElementById('expiring-list').innerHTML = d.expiring_members.length === 0
    ? '<div class="empty-state">만료 임박 회원이 없습니다</div>'
    : d.expiring_members.map(m => {
        const diff = Math.ceil((new Date(m.end_date) - today) / 86400000);
        return `<div class="alert-row"><div><div class="alert-name">${escapeHtml(m.name)}</div><div class="alert-date">${escapeHtml(m.phone||'')}</div></div><div style="text-align:right"><div class="${diff<=3?'days-red':'days-amber'}">D-${diff}</div><div class="alert-date">${m.end_date}</div></div></div>`;
      }).join('');

  const birthdays = d.upcoming_birthdays || [];
  document.getElementById('birthday-list').innerHTML = birthdays.length === 0
    ? '<div class="empty-state">임박한 생일이 없습니다</div>'
    : birthdays.map(m => {
        const diff = Math.ceil((new Date(m.next_birthday) - today) / 86400000);
        const dday = diff === 0 ? '🎂' : `D-${diff}`;
        return `<div class="alert-row"><div><div class="alert-name">${escapeHtml(m.name)}</div><div class="alert-date">${escapeHtml(m.phone||'')}</div></div><div style="text-align:right"><div class="${diff<=3?'days-red':'days-amber'}">${dday}</div><div class="alert-date">${m.birth_date.slice(5)}</div></div></div>`;
      }).join('');
}

function closeModal(id) {
  // 회원 모달을 닫을 때 정보 수정 탭에서 켜 둔 카메라가 남지 않도록 끈다
  if (id === 'member-modal' && typeof stopEditCamera === 'function') stopEditCamera();
  document.getElementById(id).classList.remove('open');
}

// 팝업 바깥(어두운 배경)을 클릭하면 닫는다.
// .modal-bg 자기 자신이 눌렸을 때만 — 내부 .modal 안에서 시작된 클릭/드래그는 무시.
document.addEventListener('mousedown', (e) => {
  const bg = e.target.classList && e.target.classList.contains('modal-bg') ? e.target : null;
  if (bg && bg.classList.contains('open')) bg.dataset.pressedOutside = '1';
});
document.addEventListener('click', (e) => {
  document.querySelectorAll('.modal-bg.open').forEach(bg => {
    if (e.target === bg && bg.dataset.pressedOutside === '1') bg.classList.remove('open');
    delete bg.dataset.pressedOutside;
  });
});
// ESC로도 닫기 (가장 위에 열린 것부터)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = [...document.querySelectorAll('.modal-bg.open')];
  if (open.length) open[open.length - 1].classList.remove('open');
});

// ============================================================
// 매출 관리: 통합 매출 목록 (등록/드랍인/락커/운동복)
// ============================================================
let revenueData = [];
let revSortField = 'paid_at';
let revSortDir = -1; // 기본: 결제일시 내림차순

// 매출 화면·엑셀에서 결제수단으로 인정하는 값. 이 외(미지정·서비스 등)는 결제수단별 집계에서 뺀다.
const PAYMENT_METHODS = ['카드', '계좌이체', '현금', '환불'];

async function loadRevenueAll() {
  const tbody = document.getElementById('revenue-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state">불러오는 중...</td></tr>';
  const data = await adminFetch(API + '/revenue/all').then(r => r.json()).catch(() => null);
  if (!data || data.error) { if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state">불러오지 못했습니다</td></tr>'; return; }
  revenueData = data.items || [];
  fillRevenueMonths();
  renderRevenue();
}

// 매출에 존재하는 월만 골라 드롭다운 채우기 (최신 월이 위로)
function fillRevenueMonths() {
  const sel = document.getElementById('rev-month');
  if (!sel) return;
  const prev = sel.value;
  const months = [...new Set(revenueData.map(x => (x.paid_at || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  sel.innerHTML = '<option value="">전체 기간</option>' +
    months.map(m => `<option value="${m}">${m.replace('-', '년 ')}월</option>`).join('');
  if (prev && months.includes(prev)) sel.value = prev;
}

function toggleRevenueSort(field) {
  if (revSortField === field) revSortDir *= -1;
  else { revSortField = field; revSortDir = -1; }
  document.querySelectorAll('[id^="revsort-"]').forEach(el => el.textContent = '↕');
  const el = document.getElementById('revsort-' + field);
  if (el) el.textContent = revSortDir === 1 ? '↑' : '↓';
  renderRevenue();
}

function renderRevenue() {
  const tbody = document.getElementById('revenue-tbody');
  if (!tbody) return;
  const q = (document.getElementById('rev-search')?.value || '').toLowerCase().trim();
  const fSource = document.getElementById('rev-filter-source')?.value || '';
  const fMethod = document.getElementById('rev-filter-method')?.value || '';
  const fMonth = document.getElementById('rev-month')?.value || '';

  let list = revenueData.filter(x => {
    if (q && !(x.name || '').toLowerCase().includes(q)) return false;
    if (fSource && x.source !== fSource) return false;
    if (fMethod && (x.payment_method || '') !== fMethod) return false;
    if (fMonth && (x.paid_at || '').slice(0, 7) !== fMonth) return false;
    return true;
  });

  list.sort((a, b) => {
    let va, vb;
    if (revSortField === 'amount') { va = a.amount || 0; vb = b.amount || 0; }
    else { va = a.paid_at || ''; vb = b.paid_at || ''; }
    return va < vb ? -revSortDir : va > vb ? revSortDir : 0;
  });

  // 요약 (필터 반영)
  const total = list.reduce((s, x) => s + (x.amount || 0), 0);
  // 결제수단별 카드는 아래 4가지만 노출 (미지정·서비스 등 그 외는 카드로 만들지 않음).
  // 제외된 건의 금액도 합계 매출에는 그대로 포함된다.
  const byMethod = {};
  list.forEach(x => {
    if (!x.amount || !PAYMENT_METHODS.includes(x.payment_method)) return;
    byMethod[x.payment_method] = (byMethod[x.payment_method] || 0) + x.amount;
  });
  const summary = document.getElementById('rev-summary');
  if (summary) {
    const card = (label, val, color) => `<div style="flex:1;min-width:130px;background:#f9fdf9;border:1px solid #e8f5e9;border-radius:10px;padding:12px 14px">
      <div style="font-size:12px;color:#888;margin-bottom:4px">${label}</div>
      <div style="font-size:18px;font-weight:700;color:${color||'#2e7d32'}">${val}</div></div>`;
    let cards = card(fMonth ? `${fMonth.replace('-', '년 ')}월 매출` : '합계 매출', total.toLocaleString('ko-KR') + '원');
    cards += card('건수', list.length + '건', '#1a1a1a');
    Object.keys(byMethod).sort((a,b)=>byMethod[b]-byMethod[a]).forEach(k => {
      cards += card(k, byMethod[k].toLocaleString('ko-KR') + '원', '#555');
    });
    summary.innerHTML = cards;
  }

  if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">매출 내역이 없습니다</td></tr>'; return; }

  const badgeColor = { '회원등록':'#e8f5e9|#2e7d32', '드랍인':'#e3f2fd|#1565c0', '체험':'#e0f7fa|#00838f', '락커':'#fff3e0|#e65100', '운동복':'#f3e5f5|#7b1fa2', '환불':'#ffebee|#c62828' };
  tbody.innerHTML = list.map(x => {
    const at = (x.paid_at || '').slice(0, 16).replace('T', ' ') || '-';
    const bc = (badgeColor[x.source] || '#eee|#555').split('|');
    const amt = (x.amount || 0).toLocaleString('ko-KR') + '원';
    const amtStyle = (x.amount || 0) === 0 ? 'color:#bbb' : 'font-weight:600';
    return `<tr>
      <td style="white-space:nowrap;font-size:13px">${at}</td>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;background:${bc[0]};color:${bc[1]}">${x.source}</span></td>
      <td style="font-weight:500">${escapeHtml(x.name) || '-'}</td>
      <td style="${amtStyle};white-space:nowrap">${amt}</td>
      <td style="font-size:13px;color:#666">${escapeHtml(x.payment_method) || '-'}</td>
      <td style="font-size:13px;color:#888">${escapeHtml(x.detail) || '-'}</td>
    </tr>`;
  }).join('');
}

// 엑셀 다운로드 (탭 5개: 전체/월별/결제수단별/상세별/분류별)
// 관리자 인증이 Bearer 토큰이라 링크로는 못 받고, blob으로 받아서 저장한다.
async function downloadRevenueExcel(btn) {
  const params = new URLSearchParams({
    month:  document.getElementById('rev-month')?.value || '',
    source: document.getElementById('rev-filter-source')?.value || '',
    method: document.getElementById('rev-filter-method')?.value || '',
    q:      document.getElementById('rev-search')?.value || '',
  });

  const original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '만드는 중...'; }
  try {
    const res = await adminFetch(API + '/revenue/export?' + params.toString());
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return alert(err.error || '엑셀을 만들지 못했습니다');
    }

    // 서버가 지정한 파일명(RFC 5987) 사용, 없으면 직접 만든다
    const disp = res.headers.get('Content-Disposition') || '';
    const m = disp.match(/filename\*=UTF-8''([^;]+)/);
    const month = document.getElementById('rev-month')?.value || '전체';
    const fileName = m ? decodeURIComponent(m[1]) : `매출_${month}_${todayKST()}.xlsx`;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}