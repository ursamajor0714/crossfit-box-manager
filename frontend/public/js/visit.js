const API = '/api';

// 체험 신청 메모 기본 양식 — 수업 전에 미리 알아야 하는 항목
const TRIAL_MEMO_TEMPLATE = [
  '성별:',
  '나이:',
  '운동경험:',
  '기저질환:',
].join('\n');

let applyType = '체험';
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth() + 1;
let calScheduleEvents = [];
let calNoticeEvents = [];

// URL ?type= 으로 초기 타입 결정
const urlType = new URLSearchParams(location.search).get('type');
if (urlType === '드랍인' || urlType === '체험') applyType = urlType;

function setType(type) {
  applyType = type;
  document.getElementById('tab-체험').classList.toggle('active', type === '체험');
  document.getElementById('tab-드랍인').classList.toggle('active', type === '드랍인');
  document.getElementById('page-title').textContent = type === '체험' ? '1일 체험 신청' : '드랍인 신청';
}

function changeCalMonth(delta) {
  calMonth += delta;
  if (calMonth > 12) { calMonth = 1; calYear++; }
  if (calMonth < 1)  { calMonth = 12; calYear--; }
  loadCalendar();
}

async function loadCalendar() {
  document.getElementById('cal-month-label').textContent = `${calYear}년 ${calMonth}월`;
  const [scheduleRes, noticeRes] = await Promise.all([
    fetch(API + `/schedule/events/${calYear}/${calMonth}`).then(r => r.json()),
    fetch(API + `/calendar/events/${calYear}/${calMonth}`).then(r => r.json()),
  ]);
  calScheduleEvents = scheduleRes;
  calNoticeEvents = noticeRes;

  // 해당 월에 (취소되지 않은) 수업이 하나도 없으면 신청 불가 안내
  const activeClasses = scheduleRes.filter(e => !e.is_cancelled);
  if (activeClasses.length === 0) {
    document.getElementById('cal-header').innerHTML = '';
    document.getElementById('cal-body').innerHTML =
      `<div style="grid-column:1/-1;text-align:center;padding:48px 20px;background:#141414;border:1px solid #222;border-radius:10px;color:var(--gray)">
        <div style="font-size:32px;margin-bottom:12px">🗓️</div>
        <div style="font-size:15px;font-weight:700;color:#ccc;margin-bottom:6px">${calYear}년 ${calMonth}월 수업 일정이 아직 올라오지 않았습니다</div>
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
    const classes = scheduleByDate[dateStr] || [];
    const isClosed = notices.some(n => n.type === '휴관일');

    const noticeHtml = notices.slice(0,2).map(n =>
      `<div class="cal-event" style="background:${n.color}">${n.title}</div>`
    ).join('');
    const noticeDotsHtml = notices.length
      ? `<div class="cal-notice-dots">${notices.slice(0,4).map(n => `<span class="cal-notice-dot" style="background:${n.color}"></span>`).join('')}</div>`
      : '';
    const dotsHtml = classes.length > 0 && !isClosed
      ? `<div style="display:flex;flex-wrap:wrap;gap:2px;margin-top:2px">${classes.slice(0,4).map(() => `<span class="cal-class-dot"></span>`).join('')}${classes.length>4?`<span style="font-size:9px;color:var(--gray)">+${classes.length-4}</span>`:''}</div>`
      : '';
    const numColor = dow===0?'#ff6b6b':dow===6?'#74b9ff':'';
    const clickable = !isClosed;

    cells.push(`<div class="cal-day${isToday?' today':''}${classes.length&&!isClosed?' has-class':''}${isClosed?' closed':''}"
      ${clickable ? `onclick="onCalDayClick('${dateStr}')"` : ''}
      style="cursor:${clickable?'pointer':'default'}">
      <div class="cal-day-num"${numColor?` style="color:${numColor}"`:''}>${d}</div>
      ${noticeHtml}
      ${noticeDotsHtml}
      ${dotsHtml}
    </div>`);
  }
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    cells.push(`<div class="cal-day other-month"><div class="cal-day-num">${i}</div></div>`);
  }
  document.getElementById('cal-body').innerHTML = cells.join('');
}

function onCalDayClick(dateStr) {
  const notices = calNoticeEvents.filter(n => n.event_date === dateStr);
  const classes = calScheduleEvents.filter(e => e.event_date === dateStr && !e.is_cancelled)
    .sort((a,b) => a.start_time.localeCompare(b.start_time));
  const [y, m, d] = dateStr.split('-');
  const dow = new Date(dateStr).getDay();
  const DAYS = ['일','월','화','수','목','금','토'];
  document.getElementById('class-pick-date-title').textContent = `${parseInt(m)}월 ${parseInt(d)}일 (${DAYS[dow]})`;

  const noticeEl = document.getElementById('class-pick-notice');
  const specialNotices = notices.filter(n => n.type !== '휴관일');
  if (specialNotices.length) {
    noticeEl.style.display = 'block';
    noticeEl.innerHTML = specialNotices.map(n => `<span style="color:${escapeHtml(n.color)};font-weight:700">[${escapeHtml(n.type)}]</span> ${escapeHtml(n.title)}`).join('<br>');
    noticeEl.style.background = '#1a1a2e';
    noticeEl.style.borderColor = '#1565c0';
    noticeEl.style.color = '#90caf9';
  } else {
    noticeEl.style.display = 'none';
  }

  const listEl = document.getElementById('class-pick-list');
  const emptyEl = document.getElementById('class-pick-empty');
  if (!classes.length) {
    listEl.innerHTML = `<button onclick="openApply('${dateStr}',null);closeClassPick()" class="modal-submit">이 날짜로 신청하기</button>`;
    emptyEl.style.display = 'block';
    emptyEl.textContent = '이 날은 등록된 수업이 없습니다. 위 버튼으로 날짜만 지정해 신청할 수 있습니다.';
  } else {
    emptyEl.style.display = 'none';
    listEl.innerHTML = `
      <div style="font-size:12px;color:var(--gray);margin-bottom:12px">수업을 선택하면 신청 화면으로 이동합니다</div>
      ${classes.map(c => `
        <div class="class-option" onclick="selectClassAndApply('${escapeJsAttr(dateStr)}', '${escapeJsAttr(c.start_time)}', '${escapeJsAttr(c.class_name)}')">
          <span class="class-dot" style="background:${escapeHtml(c.color)}"></span>
          <span style="font-weight:700;font-size:15px">${escapeHtml(c.start_time.slice(0,5))}</span>
          <span style="font-size:14px">${escapeHtml(c.class_name)}</span>
          ${c.memo ? `<span style="font-size:12px;color:var(--gray);margin-left:auto">${escapeHtml(c.memo)}</span>` : ''}
        </div>`).join('')}`;
  }
  document.getElementById('class-pick-modal').classList.add('open');
}

function closeClassPick() { document.getElementById('class-pick-modal').classList.remove('open'); }

let selectedClassTime = null;
let selectedClassName = null;

function selectClassAndApply(dateStr, time, className) {
  closeClassPick();
  selectedClassTime = time ? time.slice(0,5) : null;
  selectedClassName = className || null;
  openApply(dateStr, `${time.slice(0,5)} ${className}`);
}

function openApply(dateStr, classInfo) {
  document.getElementById('apply-modal-title').textContent = applyType + ' 신청';
  document.getElementById('apply-date').value = dateStr || '';
  if (!classInfo) { selectedClassTime = null; selectedClassName = null; }
  const infoEl = document.getElementById('apply-class-info');
  if (classInfo) {
    infoEl.style.display = 'block';
    infoEl.innerHTML = `📅 <b>${escapeHtml(dateStr)}</b> &nbsp;⏰ <b>${escapeHtml(classInfo)}</b>`;
  } else {
    infoEl.style.display = 'none';
  }
  // 체험 신청은 상담에 필요한 항목을 미리 적어둔다 (드랍인은 빈 칸 유지)
  document.getElementById('apply-memo').value = applyType === '체험' ? TRIAL_MEMO_TEMPLATE : '';
  document.getElementById('apply-modal').classList.add('open');
}

function closeApplyModal() {
  document.getElementById('apply-modal').classList.remove('open');
  document.getElementById('apply-name').value = '';
  document.getElementById('apply-phone').value = '';
  document.getElementById('apply-memo').value = '';
}

async function submitApply() {
  const name = document.getElementById('apply-name').value.trim();
  const phone = document.getElementById('apply-phone').value.trim();
  if (!name || !phone) return alert('이름과 연락처를 입력해주세요');
  await fetch(API + '/applications', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      type: applyType, name, phone,
      preferred_date: document.getElementById('apply-date').value,
      memo: document.getElementById('apply-memo').value,
      class_time: selectedClassTime,
      class_name: selectedClassName
    })
  });
  alert(`${applyType} 신청 접수가 완료되었습니다.\n박스 이용 안내는 문자를 통해 발송됩니다.`);
  closeApplyModal();
}

setType(applyType);
loadCalendar();
