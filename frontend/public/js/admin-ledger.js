// ============================================================
// 가계부: 왼쪽 매출(+) / 오른쪽 지출(-) / 아래 입력줄
// 매출 쪽은 기존 매출 집계를 그대로 끌어오고, 지출 쪽은 환불 + 직접 적은 지출이다.
// ============================================================

let ledgerCategories = { '매출': [], '지출': [] };
let ledgerKind = '매출';

// 조회 기간. 기본값은 한국시간 기준 이번 달.
// ledgerDate가 있으면 그 하루만, 없고 ledgerMonth만 있으면 그 달, 둘 다 비면 전체 기간.
let ledgerMonth = todayKST().slice(0, 7);
let ledgerDate = '';
// 달력 팝업 안에서 보고 있는 달 / 눌러둔 날 (확인을 눌러야 위 두 값에 반영된다)
let ledgerCalMonth = ledgerMonth;
let ledgerCalPick = '';

const won = (n) => (n || 0).toLocaleString('ko-KR') + '원';

async function loadLedger() {
  if (!ledgerCategories['매출'].length) {
    ledgerCategories = await adminFetch(API + '/ledger/categories').then(r => r.json()).catch(() => ledgerCategories);
    renderLedgerCategoryMenu();
  }
  updateLedgerPeriodLabel();

  const qs = ledgerDate ? 'date=' + ledgerDate : (ledgerMonth ? 'month=' + ledgerMonth : '');
  const data = await adminFetch(API + '/ledger?' + qs).then(r => r.json()).catch(() => null);
  if (!data || data.error) {
    [['ledger-income-tbody', 3], ['ledger-expense-tbody', 5]].forEach(([id, cols]) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<tr><td colspan="${cols}" class="empty-state">불러오지 못했습니다</td></tr>`;
    });
    return;
  }
  renderLedger(data);
}

// ─── 기간 선택 달력 ──────────────────────────────────

function updateLedgerPeriodLabel() {
  const el = document.getElementById('ledger-period-label');
  if (!el) return;
  if (ledgerDate) {
    const [y, m, d] = ledgerDate.split('-');
    el.textContent = `${y}년 ${+m}월 ${+d}일`;
  } else if (ledgerMonth) {
    const [y, m] = ledgerMonth.split('-');
    el.textContent = `${y}년 ${+m}월`;
  } else {
    el.textContent = '전체 기간';
  }
}

function toggleLedgerCalendar() {
  const cal = document.getElementById('ledger-cal');
  if (!cal) return;
  if (!cal.hidden) { cal.hidden = true; return; }
  // 열 때마다 지금 보고 있는 기간에서 다시 시작한다
  ledgerCalMonth = ledgerMonth || todayKST().slice(0, 7);
  ledgerCalPick = ledgerDate;
  renderLedgerCalendar();
  cal.hidden = false;
}

function moveLedgerCalMonth(delta) {
  const [y, m] = ledgerCalMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  ledgerCalMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  // 다른 달로 넘어가면 눌러둔 날은 풀린다 (그 달에 없는 날이라서)
  if (ledgerCalPick && ledgerCalPick.slice(0, 7) !== ledgerCalMonth) ledgerCalPick = '';
  renderLedgerCalendar();
}

function renderLedgerCalendar() {
  const title = document.getElementById('ledger-cal-title');
  const grid = document.getElementById('ledger-cal-grid');
  if (!title || !grid) return;

  const [y, m] = ledgerCalMonth.split('-').map(Number);
  title.textContent = `${y}년 ${m}월`;

  const firstDow = new Date(y, m - 1, 1).getDay();
  const lastDate = new Date(y, m, 0).getDate();
  const today = todayKST();

  let html = '';
  for (let i = 0; i < firstDow; i++) html += '<span></span>';
  for (let d = 1; d <= lastDate; d++) {
    const ds = `${ledgerCalMonth}-${String(d).padStart(2, '0')}`;
    const cls = ['ledger-cal-day'];
    if (ds === ledgerCalPick) cls.push('is-picked');
    if (ds === today) cls.push('is-today');
    html += `<button type="button" class="${cls.join(' ')}" onclick="pickLedgerCalDay('${ds}')">${d}</button>`;
  }
  grid.innerHTML = html;
}

// 같은 날을 다시 누르면 선택이 풀려 그 달 전체로 돌아간다
function pickLedgerCalDay(ds) {
  ledgerCalPick = (ledgerCalPick === ds) ? '' : ds;
  renderLedgerCalendar();
}

function clearLedgerCalDay() {
  ledgerCalPick = '';
  renderLedgerCalendar();
}

function pickLedgerAllTime() {
  ledgerMonth = '';
  ledgerDate = '';
  document.getElementById('ledger-cal').hidden = true;
  loadLedger();
}

function applyLedgerCalendar() {
  ledgerMonth = ledgerCalMonth;
  ledgerDate = ledgerCalPick;
  document.getElementById('ledger-cal').hidden = true;
  loadLedger();
}

function renderLedger(data) {
  const summary = document.getElementById('ledger-summary');
  if (summary) {
    const card = (label, val, color) => `<div class="ledger-card">
      <div class="ledger-card-label">${label}</div>
      <div class="ledger-card-value" style="color:${color}">${val}</div></div>`;
    summary.innerHTML =
      card('수입 합계', won(data.income_total), '#2e7d32') +
      card('지출 합계', won(data.expense_total), '#c62828') +
      card('순익', won(data.net), data.net < 0 ? '#c62828' : '#1a1a1a');
  }

  const incomeTotal = document.getElementById('ledger-income-total');
  if (incomeTotal) incomeTotal.textContent = won(data.income_total);
  const expenseTotal = document.getElementById('ledger-expense-total');
  if (expenseTotal) expenseTotal.textContent = won(data.expense_total);

  renderLedgerIncomeGroups(data.income);
  renderLedgerRows('ledger-expense-tbody', data.expense, '#c62828', '지출 내역이 없습니다');
}

// ─── 매출 덩어리 묶기 ────────────────────────────────
// 매출은 건별로 늘어놓지 않고 세 덩어리로 묶어서 보여준다. 줄을 누르면 팝업에 원래 건들이 뜬다.
// 자동 집계(회원등록·락커·드랍인·운동복)와 가계부 직접 등록(물품판매·기타)이 한 목록에 섞여 온다.
const LEDGER_INCOME_GROUPS = ['회원권', '락커', '기타부수입'];

function ledgerIncomeGroup(category) {
  if (category === '회원등록' || category === '회원권') return '회원권';
  if (category === '락커') return '락커';
  return '기타부수입';
}

// 팝업에서 다시 쓰려고 이번에 받은 매출 건들을 들고 있는다
let ledgerIncomeRows = [];
let ledgerOpenGroup = '';

function renderLedgerIncomeGroups(rows) {
  ledgerIncomeRows = rows || [];
  const tbody = document.getElementById('ledger-income-tbody');
  if (!tbody) return;

  tbody.innerHTML = LEDGER_INCOME_GROUPS.map(g => {
    const items = ledgerGroupItems(g);
    const total = items.reduce((s, r) => s + (r.amount || 0), 0);
    return `<tr class="ledger-group-row" onclick="openLedgerGroup('${g}')">
      <td style="white-space:nowrap;font-weight:600">${g}</td>
      <td style="font-size:13px;color:#888">${items.length}건</td>
      <td style="text-align:right;white-space:nowrap;font-weight:600;color:#2e7d32">${won(total)}</td>
    </tr>`;
  }).join('');

  // 팝업을 열어둔 채 등록·삭제했으면 팝업 내용도 같이 갱신한다
  const modal = document.getElementById('ledger-group-modal');
  if (modal && modal.classList.contains('open')) renderLedgerGroupRows();
}

function ledgerGroupItems(group) {
  return ledgerIncomeRows.filter(r => ledgerIncomeGroup(r.category) === group);
}

function openLedgerGroup(group) {
  ledgerOpenGroup = group;
  document.getElementById('ledger-group-title').textContent = group + ' 내역';
  renderLedgerGroupRows();
  document.getElementById('ledger-group-modal').classList.add('open');
}

function renderLedgerGroupRows() {
  renderLedgerRows('ledger-group-tbody', ledgerGroupItems(ledgerOpenGroup), '#2e7d32', '내역이 없습니다');
}

function renderLedgerRows(tbodyId, rows, color, emptyText) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!rows || !rows.length) { tbody.innerHTML = `<tr><td colspan="5" class="empty-state">${emptyText}</td></tr>`; return; }

  tbody.innerHTML = rows.map(r => {
    // 이름이 있는 건(회원권·환불 등)은 상세 앞에 붙여 누구 건인지 보이게 한다
    const detail = [r.name && r.name !== '-' ? r.name : '', r.detail].filter(Boolean).join(' · ');
    // 자동 집계 건은 가계부에서 지울 수 없다 (원본이 회원권·락커 기록이라 거기서 지워야 한다)
    const del = r.ledger_id
      ? `<button class="ledger-del" onclick="deleteLedgerEntry(${r.ledger_id})">삭제</button>`
      : '';
    return `<tr>
      <td style="white-space:nowrap;font-size:13px;color:#666">${escapeHtml(r.date) || '-'}</td>
      <td style="white-space:nowrap">${escapeHtml(r.category) || '-'}${r.fixed ? '<span class="ledger-tag">고정</span>' : ''}</td>
      <td style="font-size:13px;color:#888">${escapeHtml(detail) || '-'}</td>
      <td style="text-align:right;white-space:nowrap;font-weight:600;color:${color}">${won(r.amount)}</td>
      <td style="width:46px;text-align:right">${del}</td>
    </tr>`;
  }).join('');
}

// ─── 입력줄 ──────────────────────────────────────────

function pickLedgerKind(kind) {
  ledgerKind = kind;
  document.getElementById('ledger-kind-label').textContent = kind;
  document.getElementById('ledger-acc-kind').open = false;
  // 구분이 바뀌면 항목 목록도 바뀌므로 선택을 비운다
  document.getElementById('ledger-category-label').textContent = '항목 선택';
  document.getElementById('ledger-category-label').dataset.value = '';
  renderLedgerCategoryMenu();
}

function renderLedgerCategoryMenu() {
  const menu = document.getElementById('ledger-category-menu');
  if (!menu) return;
  menu.innerHTML = (ledgerCategories[ledgerKind] || [])
    .map(c => `<button type="button" onclick="pickLedgerCategory('${escapeJsAttr(c)}')">${escapeHtml(c)}</button>`)
    .join('');
}

function pickLedgerCategory(cat) {
  const label = document.getElementById('ledger-category-label');
  label.textContent = cat;
  label.dataset.value = cat;
  document.getElementById('ledger-acc-category').open = false;
}

// 등록할 날짜: 일별로 보고 있으면 그 날, 이번 달이면 오늘, 지난 달이면 그 달 1일
function ledgerEntryDate() {
  const today = todayKST();
  if (ledgerDate) return ledgerDate;
  if (!ledgerMonth || ledgerMonth === today.slice(0, 7)) return today;
  return ledgerMonth + '-01';
}

async function addLedgerEntry(btn) {
  const err = document.getElementById('ledger-form-error');
  const show = (msg) => { if (err) err.textContent = msg; };
  show('');

  const category = document.getElementById('ledger-category-label')?.dataset.value || '';
  const amount = Number(document.getElementById('ledger-amount')?.value || 0);
  const detail = document.getElementById('ledger-detail')?.value || '';
  const isFixed = document.getElementById('ledger-fixed')?.checked ? 1 : 0;

  if (!category) return show('항목을 선택해주세요');
  if (!Number.isFinite(amount) || amount <= 0) return show('금액을 0보다 큰 숫자로 입력해주세요');

  const original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '등록 중...'; }
  try {
    const res = await adminFetch(API + '/ledger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 보고 있는 기간에 그대로 남도록 날짜를 맞춘다 (이번 달을 보고 있으면 오늘)
      body: JSON.stringify({ kind: ledgerKind, category, amount, detail, is_fixed: isFixed, entry_date: ledgerEntryDate() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return show(data.error || '등록하지 못했습니다');

    document.getElementById('ledger-amount').value = '';
    document.getElementById('ledger-detail').value = '';
    document.getElementById('ledger-fixed').checked = false;
    await loadLedger();
    // 가계부 매출은 매출 내역에도 잡히므로 그쪽이 이미 떠 있으면 같이 갱신한다
    if (ledgerKind === '매출' && typeof loadRevenueAll === 'function') loadRevenueAll();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

async function deleteLedgerEntry(id) {
  if (!confirm('이 항목을 삭제하시겠습니까?\n(고정비는 등록된 모든 달에서 함께 사라집니다.)')) return;
  const res = await adminFetch(API + '/ledger/' + id, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return alert(data.error || '삭제하지 못했습니다');
  }
  await loadLedger();
  if (typeof loadRevenueAll === 'function') loadRevenueAll();
}

// 아코디언·달력 바깥을 누르면 닫는다
document.addEventListener('click', (e) => {
  document.querySelectorAll('details.ledger-acc[open]').forEach(d => {
    if (!d.contains(e.target)) d.open = false;
  });
  const period = document.querySelector('.ledger-period');
  const cal = document.getElementById('ledger-cal');
  if (cal && !cal.hidden && period && !period.contains(e.target)) cal.hidden = true;
});
