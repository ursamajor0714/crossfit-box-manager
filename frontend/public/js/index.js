const API = '/api';
let wodDate = new Date();
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth() + 1;
let calNoticeEvents = [];

function fmtDate(d) { return d.toISOString().split('T')[0]; }

// ── WOD ─────────────────────────────────────────────
function changeWodDate(delta) {
  wodDate.setDate(wodDate.getDate() + delta);
  document.getElementById('wod-date-picker').value = fmtDate(wodDate);
  loadWodByDate();
}

async function loadWodByDate() {
  const dateStr = document.getElementById('wod-date-picker').value || fmtDate(wodDate);
  wodDate = new Date(dateStr);
  const wods = await fetch(API + '/wods/date/' + dateStr).then(r => r.json());
  const container = document.getElementById('wod-container');
  if (!wods.length) {
    container.innerHTML = '<div class="wod-card"><div class="wod-empty">이 날짜의 WOD가 아직 공개되지 않았습니다</div></div>';
    return;
  }
  container.innerHTML = wods.map(w => `<div class="wod-card" style="margin-bottom:16px">
    <div class="wod-date">${w.wod_date}</div>
    ${w.title ? `<div class="wod-title">${w.title}</div>` : ''}
    <div class="wod-content">${w.content}</div>
  </div>`).join('');
}

// ── 캘린더 ───────────────────────────────────────────
function changeCalMonth(delta) {
  calMonth += delta;
  if (calMonth > 12) { calMonth = 1; calYear++; }
  if (calMonth < 1)  { calMonth = 12; calYear--; }
  loadCalendar();
}

async function loadCalendar() {
  document.getElementById('cal-month-label').textContent = `${calYear}년 ${calMonth}월`;
  const [noticeRes, scheduleRes] = await Promise.all([
    fetch(API + `/calendar/events/${calYear}/${calMonth}`).then(r => r.json()),
    fetch(API + `/schedule/events/${calYear}/${calMonth}`).then(r => r.json()).catch(() => [])
  ]);
  calNoticeEvents = noticeRes;

  const noticeByDate = {};
  noticeRes.forEach(e => {
    if (!noticeByDate[e.event_date]) noticeByDate[e.event_date] = [];
    noticeByDate[e.event_date].push(e);
  });

  // 수업 있는 날짜 세트
  const classDateSet = new Set(scheduleRes.filter(e => !e.is_cancelled).map(e => e.event_date));

  const DAYS = ['일','월','화','수','목','금','토'];
  document.getElementById('cal-header').innerHTML = DAYS.map((d,i) =>
    `<div class="cal-header-cell ${i===0?'sun':i===6?'sat':''}">${d}</div>`
  ).join('');

  const today = new Date().toISOString().split('T')[0];
  const firstDay = new Date(calYear, calMonth-1, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const prevDays = new Date(calYear, calMonth-1, 0).getDate();

  let cells = [];
  for (let i = firstDay-1; i >= 0; i--) {
    cells.push(`<div class="cal-day other-month"><div class="cal-day-num">${prevDays-i}</div></div>`);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow = new Date(calYear, calMonth-1, d).getDay();
    const isToday = dateStr === today;
    const notices = noticeByDate[dateStr] || [];
    const isClosed = notices.some(n => n.type === '휴관일');

    // 공지 이벤트 표시 (데스크톱: 텍스트 / 모바일: 점)
    const noticeHtml = notices.slice(0,2).map(n =>
      `<div class="cal-event" style="background:${escapeHtml(n.color)}">${escapeHtml(n.title)}</div>`
    ).join('');
    const dotsHtml = notices.length
      ? `<div class="cal-dots">${notices.slice(0,4).map(n => `<span class="cal-dot" style="background:${escapeHtml(n.color)}"></span>`).join('')}</div>`
      : '';

    // 공지가 있는 날만 클릭 가능 (상세 표시용)
    const clickable = notices.length > 0;

    // 우선순위: 1) 정규수업(초록/파랑) → 2) 휴관일 → 3) 그 외(오픈짐 포함) 푸르딩딩
    const REGULAR_COLORS = new Set(['#2e7d32','#1565c0']);
    const hasRegular = scheduleRes.some(e => !e.is_cancelled && e.event_date === dateStr && REGULAR_COLORS.has(e.color));
    const dayClass = hasRegular ? 'has-class' : isClosed ? 'closed' : 'open-gym';

    // 요일 색은 정규수업/휴관일엔 CSS가 처리, open-gym은 파란색 CSS가 처리
    const numColor = (!hasRegular && !isClosed && dow===0) ? '#ff6b6b' : '';

    cells.push(`<div class="cal-day${isToday?' today':''} ${dayClass}"
      ${clickable ? `data-date="${dateStr}"` : ''}
      style="cursor:${clickable?'pointer':'default'}">
      <div class="cal-day-num"${numColor?` style="color:${numColor}"`:''}>${d}</div>
      ${noticeHtml}
      ${dotsHtml}
    </div>`);
  }

  // 수업도 공지도 둘 다 없으면 빈 달 안내
  if (scheduleRes.length === 0 && noticeRes.length === 0) {
    document.getElementById('cal-header').innerHTML = '';
    document.getElementById('cal-body').innerHTML =
      `<div style="grid-column:1/-1;text-align:center;padding:48px 20px;background:#141414;border:1px solid #222;border-radius:10px;color:var(--gray)">
        <div style="font-size:32px;margin-bottom:12px">🗓️</div>
        <div style="font-size:15px;font-weight:700;color:#ccc;margin-bottom:6px">${calYear}년 ${calMonth}월 일정이 아직 공개되지 않았습니다</div>
        <div style="font-size:13px">일정이 등록되면 확인하실 수 있습니다.<br>다른 달을 확인하시려면 좌우 화살표를 눌러주세요.</div>
      </div>`;
    return;
  }

  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    cells.push(`<div class="cal-day other-month"><div class="cal-day-num">${i}</div></div>`);
  }
  document.getElementById('cal-body').innerHTML = cells.join('');
}

// ── 날짜 클릭 → 수업 선택 모달 ───────────────────────
function onCalDayClick(dateStr) {
  const notices = calNoticeEvents.filter(n => n.event_date === dateStr);
  if (!notices.length) return;
  const [y, m, d] = dateStr.split('-');
  const dow = new Date(dateStr).getDay();
  const DAYS = ['일','월','화','수','목','금','토'];
  document.getElementById('notice-pop-title').textContent = `${parseInt(m)}월 ${parseInt(d)}일 (${DAYS[dow]})`;
  document.getElementById('notice-pop-body').innerHTML = notices.map(n =>
    `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #222">
      <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${escapeHtml(n.color)};flex-shrink:0"></span>
      <span style="font-weight:700">[${escapeHtml(n.type)}]</span>
      <span>${escapeHtml(n.title)}</span>
    </div>${n.memo ? `<div style="font-size:13px;color:var(--gray);padding:4px 0 8px 18px">${escapeHtml(n.memo)}</div>` : ''}`
  ).join('');
  document.getElementById('notice-pop-modal').classList.add('open');
}

function closeNoticePop() { document.getElementById('notice-pop-modal').classList.remove('open'); }


// ── 공지사항 ──────────────────────────────────────────
async function loadNotices() {
  const notices = await fetch(API + '/notices').then(r => r.json());
  const list = document.getElementById('notice-list');
  if (!notices.length) return;
  list.innerHTML = notices.map(n => `
    <div class="notice-item ${n.pinned?'pinned':''}">
      <div class="notice-title">${n.pinned?'<span class="notice-pin">고정</span>':''}${escapeHtml(n.title)}</div>
      <div class="notice-date">${escapeHtml(n.created_at?.slice(0,10)||'')}</div>
      <div class="notice-content">${escapeHtml(n.content||'')}</div>
    </div>`).join('');
}

// ── JOIN US: 체험/드랍인 신청 ──────────────────────────
// 체험 신청 메모 기본 양식 — 수업 전에 미리 알아야 하는 항목
const TRIAL_MEMO_TEMPLATE = [
  '성별:',
  '나이:',
  '운동경험:',
  '기저질환:',
].join('\n');

let joinApplyType = '체험';
let joinCalYear = new Date().getFullYear();
let joinCalMonth = new Date().getMonth() + 1;
let joinCalScheduleEvents = [];
let joinCalNoticeEvents = [];
let joinSelectedClassTime = null;
let joinSelectedClassName = null;

function joinSetType(type) {
  joinApplyType = type;
  document.getElementById('join-tab-체험').classList.toggle('active', type === '체험');
  document.getElementById('join-tab-드랍인').classList.toggle('active', type === '드랍인');
}

function joinChangeCalMonth(delta) {
  joinCalMonth += delta;
  if (joinCalMonth > 12) { joinCalMonth = 1; joinCalYear++; }
  if (joinCalMonth < 1)  { joinCalMonth = 12; joinCalYear--; }
  joinLoadCalendar();
}

async function joinLoadCalendar() {
  document.getElementById('join-cal-month-label').textContent = `${joinCalYear}년 ${joinCalMonth}월`;
  const [scheduleRes, noticeRes] = await Promise.all([
    fetch(API + `/schedule/events/${joinCalYear}/${joinCalMonth}`).then(r => r.json()),
    fetch(API + `/calendar/events/${joinCalYear}/${joinCalMonth}`).then(r => r.json()),
  ]);
  joinCalScheduleEvents = scheduleRes;
  joinCalNoticeEvents = noticeRes;

  // 해당 월에 (취소되지 않은) 수업이 하나도 없으면 신청 불가 안내
  const activeClasses = scheduleRes.filter(e => !e.is_cancelled);
  if (activeClasses.length === 0) {
    document.getElementById('join-cal-header').innerHTML = '';
    document.getElementById('join-cal-body').innerHTML =
      `<div style="grid-column:1/-1;text-align:center;padding:48px 20px;background:#141414;border:1px solid #222;border-radius:10px;color:var(--gray)">
        <div style="font-size:32px;margin-bottom:12px">🗓️</div>
        <div style="font-size:15px;font-weight:700;color:#ccc;margin-bottom:6px">${joinCalYear}년 ${joinCalMonth}월 수업 일정이 아직 올라오지 않았습니다</div>
        <div style="font-size:13px">일정이 등록되면 신청하실 수 있습니다.<br>다른 달을 확인하시려면 좌우 화살표를 눌러주세요.</div>
      </div>`;
    return;
  }

  const scheduleByDate = {};
  scheduleRes.filter(e => !e.is_cancelled).forEach(e => {
    if (!scheduleByDate[e.event_date]) scheduleByDate[e.event_date] = [];
    scheduleByDate[e.event_date].push(e);
  });
  const noticeByDate = {};
  noticeRes.forEach(e => {
    if (!noticeByDate[e.event_date]) noticeByDate[e.event_date] = [];
    noticeByDate[e.event_date].push(e);
  });

  const DAYS = ['일','월','화','수','목','금','토'];
  document.getElementById('join-cal-header').innerHTML = DAYS.map((d,i) =>
    `<div class="cal-header-cell ${i===0?'sun':i===6?'sat':''}">${d}</div>`
  ).join('');

  const today = new Date().toISOString().split('T')[0];
  const firstDay = new Date(joinCalYear, joinCalMonth-1, 1).getDay();
  const daysInMonth = new Date(joinCalYear, joinCalMonth, 0).getDate();
  const prevDays = new Date(joinCalYear, joinCalMonth-1, 0).getDate();

  let cells = [];
  for (let i = firstDay-1; i >= 0; i--) {
    cells.push(`<div class="cal-day other-month"><div class="cal-day-num">${prevDays-i}</div></div>`);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${joinCalYear}-${String(joinCalMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow = new Date(joinCalYear, joinCalMonth-1, d).getDay();
    const isToday = dateStr === today;
    const notices = noticeByDate[dateStr] || [];
    const classes = scheduleByDate[dateStr] || [];
    const isClosed = notices.some(n => n.type === '휴관일');

    const noticeHtml = notices.slice(0,2).map(n =>
      `<div class="cal-event" style="background:${n.color}">${escapeHtml(n.title)}</div>`
    ).join('');
    const dotsHtml = classes.length > 0 && !isClosed
      ? `<div style="display:flex;flex-wrap:wrap;gap:2px;margin-top:2px">${classes.slice(0,4).map(() => `<span class="cal-class-dot"></span>`).join('')}${classes.length>4?`<span style="font-size:9px;color:var(--gray)">+${classes.length-4}</span>`:''}</div>`
      : '';
    const numColor = dow===0?'#ff6b6b':dow===6?'#74b9ff':'';
    const clickable = !isClosed;

    cells.push(`<div class="cal-day${isToday?' today':''}${classes.length&&!isClosed?' has-class':''}${isClosed?' closed':''}"
      ${clickable ? `data-date="${dateStr}"` : ''}
      style="cursor:${clickable?'pointer':'default'}">
      <div class="cal-day-num"${numColor?` style="color:${numColor}"`:''}>${d}</div>
      ${noticeHtml}
      ${dotsHtml}
    </div>`);
  }
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    cells.push(`<div class="cal-day other-month"><div class="cal-day-num">${i}</div></div>`);
  }
  document.getElementById('join-cal-body').innerHTML = cells.join('');
}

function joinOnCalDayClick(dateStr) {
  const notices = joinCalNoticeEvents.filter(n => n.event_date === dateStr);
  const classes = joinCalScheduleEvents.filter(e => e.event_date === dateStr && !e.is_cancelled)
    .sort((a,b) => a.start_time.localeCompare(b.start_time));
  const [, m, d] = dateStr.split('-');
  const dow = new Date(dateStr).getDay();
  const DAYS = ['일','월','화','수','목','금','토'];
  document.getElementById('join-class-pick-date-title').textContent = `${parseInt(m)}월 ${parseInt(d)}일 (${DAYS[dow]})`;

  const noticeEl = document.getElementById('join-class-pick-notice');
  const specialNotices = notices.filter(n => n.type !== '휴관일');
  if (specialNotices.length) {
    noticeEl.style.display = 'block';
    noticeEl.innerHTML = specialNotices.map(n => `<span style="color:${n.color};font-weight:700">[${escapeHtml(n.type)}]</span> ${escapeHtml(n.title)}`).join('<br>');
  } else {
    noticeEl.style.display = 'none';
  }

  const listEl = document.getElementById('join-class-pick-list');
  const emptyEl = document.getElementById('join-class-pick-empty');
  if (!classes.length) {
    listEl.innerHTML = `<button class="modal-submit" data-apply-only-date="${dateStr}">이 날짜로 신청하기</button>`;
    emptyEl.style.display = 'block';
    emptyEl.textContent = '이 날은 등록된 수업이 없습니다. 위 버튼으로 날짜만 지정해 신청할 수 있습니다.';
  } else {
    emptyEl.style.display = 'none';
    listEl.innerHTML = `
      <div style="font-size:12px;color:var(--gray);margin-bottom:12px">수업을 선택하면 신청 화면으로 이동합니다</div>
      ${classes.map(c => `
        <div class="class-option" data-date="${dateStr}" data-time="${c.start_time}" data-class-name="${escapeHtml(c.class_name)}">
          <span class="class-dot" style="background:${c.color}"></span>
          <span style="font-weight:700;font-size:15px">${c.start_time.slice(0,5)}</span>
          <span style="font-size:14px">${escapeHtml(c.class_name)}</span>
          ${c.memo ? `<span style="font-size:12px;color:var(--gray);margin-left:auto">${escapeHtml(c.memo)}</span>` : ''}
        </div>`).join('')}`;
  }
  document.getElementById('join-class-pick-modal').classList.add('open');
}

function joinCloseClassPick() { document.getElementById('join-class-pick-modal').classList.remove('open'); }

function joinSelectClassAndApply(dateStr, time, className) {
  joinCloseClassPick();
  joinSelectedClassTime = time ? time.slice(0,5) : null;
  joinSelectedClassName = className || null;
  joinOpenApply(dateStr, `${time.slice(0,5)} ${className}`);
}

function joinOpenApply(dateStr, classInfo) {
  document.getElementById('join-apply-modal-title').textContent = joinApplyType + ' 신청';
  document.getElementById('join-apply-date').value = dateStr || '';
  if (!classInfo) { joinSelectedClassTime = null; joinSelectedClassName = null; }
  const infoEl = document.getElementById('join-apply-class-info');
  if (classInfo) {
    infoEl.style.display = 'block';
    infoEl.innerHTML = `📅 <b>${dateStr}</b> &nbsp;⏰ <b>${escapeHtml(classInfo)}</b>`;
  } else {
    infoEl.style.display = 'none';
  }
  // 체험 신청은 상담에 필요한 항목을 미리 적어둔다 (드랍인은 빈 칸 유지)
  document.getElementById('join-apply-memo').value =
    joinApplyType === '체험' ? TRIAL_MEMO_TEMPLATE : '';
  document.getElementById('join-apply-modal').classList.add('open');
}

function joinCloseApplyModal() {
  document.getElementById('join-apply-modal').classList.remove('open');
  document.getElementById('join-apply-name').value = '';
  document.getElementById('join-apply-phone').value = '';
  document.getElementById('join-apply-memo').value = '';
}

async function joinSubmitApply() {
  const name = document.getElementById('join-apply-name').value.trim();
  const phone = document.getElementById('join-apply-phone').value.trim();
  if (!name || !phone) return alert('이름과 연락처를 입력해주세요');
  await fetch(API + '/applications', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      type: joinApplyType, name, phone,
      preferred_date: document.getElementById('join-apply-date').value,
      memo: document.getElementById('join-apply-memo').value,
      class_time: joinSelectedClassTime,
      class_name: joinSelectedClassName
    })
  });
  alert(`${joinApplyType} 신청 접수가 완료되었습니다.\n박스 이용 안내는 문자를 통해 발송됩니다.`);
  joinCloseApplyModal();
}

// ── 초기화 ────────────────────────────────────────────
document.getElementById('wod-date-picker').value = fmtDate(wodDate);
loadWodByDate();
loadCalendar();
loadNotices();
joinLoadCalendar();

// ── 홈 화면에 추가 ────────────────────────────────────
let deferredInstallPrompt = null;

function showAddToHomeBanner() {
  document.getElementById('add-to-home-banner').classList.add('visible');
}

// Android Chrome: 설치 프롬프트 이벤트 캐치
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showAddToHomeBanner();
});

// iOS Safari 감지
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInStandaloneMode = window.navigator.standalone === true;
if (isIOS && !isInStandaloneMode) {
  showAddToHomeBanner();
}

function triggerAddToHome() {
  if (deferredInstallPrompt) {
    // Android Chrome: 네이티브 설치 팝업
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => {
      deferredInstallPrompt = null;
      document.getElementById('add-to-home-banner').classList.remove('visible');
    });
  } else if (isIOS) {
    // iOS: 안내 모달 표시
    document.getElementById('ios-guide-modal').classList.add('open');
  }
}

// ── CSP 대응 이벤트 리스너 등록 (inline onclick 제거용) ───────────────────
document.addEventListener('DOMContentLoaded', () => {
  // 회원 로그인 상태인 경우 헤더의 '회원 로그인' 버튼을 '내 정보'로 변경
  const headerLoginBtn = document.querySelector('.header .login-btn');
  if (headerLoginBtn && sessionStorage.getItem('memberToken')) {
    headerLoginBtn.textContent = '내 정보';
  }

  // Hero 영역 버튼
  document.getElementById('btn-hero-visit')?.addEventListener('click', () => {
    location.href = '/visit?type=체험';
  });
  document.getElementById('btn-hero-dropin')?.addEventListener('click', () => {
    location.href = '/visit?type=드랍인';
  });

  // WOD 이전/다음 및 데이트 피커
  document.getElementById('btn-wod-prev')?.addEventListener('click', () => changeWodDate(-1));
  document.getElementById('btn-wod-next')?.addEventListener('click', () => changeWodDate(1));
  document.getElementById('wod-date-picker')?.addEventListener('change', () => loadWodByDate());

  // 캘린더 이전/다음
  document.getElementById('btn-cal-prev')?.addEventListener('click', () => changeCalMonth(-1));
  document.getElementById('btn-cal-next')?.addEventListener('click', () => changeCalMonth(1));

  // JOIN US 영역: 체험/드랍인 탭
  document.getElementById('join-tab-체험')?.addEventListener('click', () => joinSetType('체험'));
  document.getElementById('join-tab-드랍인')?.addEventListener('click', () => joinSetType('드랍인'));

  // JOIN US 영역: 캘린더 이전/다음
  document.getElementById('join-btn-cal-prev')?.addEventListener('click', () => joinChangeCalMonth(-1));
  document.getElementById('join-btn-cal-next')?.addEventListener('click', () => joinChangeCalMonth(1));

  // JOIN US 영역: 이벤트 위임으로 날짜 클릭
  document.getElementById('join-cal-body')?.addEventListener('click', (e) => {
    const dayCell = e.target.closest('.cal-day');
    if (dayCell && dayCell.dataset.date) {
      joinOnCalDayClick(dayCell.dataset.date);
    }
  });

  // JOIN US 영역: 수업 선택 모달 내부 클릭 (이벤트 위임)
  document.getElementById('join-class-pick-list')?.addEventListener('click', (e) => {
    const dateOnlyBtn = e.target.closest('[data-apply-only-date]');
    if (dateOnlyBtn) {
      joinOpenApply(dateOnlyBtn.dataset.applyOnlyDate, null);
      joinCloseClassPick();
      return;
    }
    const option = e.target.closest('.class-option');
    if (option) {
      joinSelectClassAndApply(option.dataset.date, option.dataset.time, option.dataset.className);
    }
  });
  document.getElementById('btn-close-join-class-pick')?.addEventListener('click', () => joinCloseClassPick());

  // JOIN US 영역: 신청 모달
  document.getElementById('btn-close-join-apply-modal')?.addEventListener('click', () => joinCloseApplyModal());
  document.getElementById('btn-submit-join-apply')?.addEventListener('click', () => joinSubmitApply());

  // PWA 홈 화면 추가 배너 클릭
  document.getElementById('add-to-home-banner')?.addEventListener('click', () => triggerAddToHome());

  // iOS 및 공지 상세 모달 닫기
  document.getElementById('btn-close-ios-modal')?.addEventListener('click', () => {
    document.getElementById('ios-guide-modal')?.classList.remove('open');
  });
  document.getElementById('btn-close-notice-modal')?.addEventListener('click', () => {
    closeNoticePop();
  });

  // 이벤트 위임: 캘린더 날짜 클릭
  document.getElementById('cal-body')?.addEventListener('click', (e) => {
    const dayCell = e.target.closest('.cal-day');
    if (dayCell && dayCell.dataset.date) {
      onCalDayClick(dayCell.dataset.date);
    }
  });

  // 이벤트 위임: 공지사항 클릭 토글
  document.getElementById('notice-list')?.addEventListener('click', (e) => {
    const item = e.target.closest('.notice-item');
    if (item) {
      item.classList.toggle('open');
    }
  });
});
