const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { todayKST, expandLedgerRows } = require('../utils/ledger');

// 가계부에서 직접 등록할 수 있는 항목 (좌: 매출 / 우: 지출)
const LEDGER_CATEGORIES = {
  // 회원권·락커·드랍인 매출은 각자의 등록 화면에서 자동으로 잡히므로 여기서 직접 넣지 않는다.
  // (같은 돈을 두 번 세는 것을 막기 위해서다. 자동으로 안 잡히는 것만 여기에 남긴다.)
  '매출': ['물품판매', '기타'],  // 운동복·체험은 매출 집계에서 제외됨
  '지출': ['환불', '임대료', '관리비', '공과금', '세금', '인건비', '물품구입', '장비·수리', '보험·수수료', '광고비', '대출이자', '시설투자', '기타'],
};

// 'YYYY-MM' 이면서 월이 01~12 인지
function isValidMonth(v) {
  if (!/^\d{4}-\d{2}$/.test(v || '')) return false;
  const m = Number(String(v).slice(5, 7));
  return m >= 1 && m <= 12;
}

// 'YYYY-MM-DD' 이면서 달력에 실제로 있는 날인지 (2026-02-31 같은 값 차단)
function isValidDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return false;
  const [y, m, d] = String(v).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// 마지막 글자에 받침이 있으면 '은', 없으면 '는'
function josaEunNeun(word) {
  const code = word.charCodeAt(word.length - 1) - 0xAC00;
  if (code < 0 || code > 11171) return '는';
  return (code % 28) ? '은' : '는';
}


// 통합 매출 목록: 회원등록 + 드랍인 + 락커 + 운동복(과거분) (결제일시 기준)
// 결제일시 기준: 등록=created_at, 드랍인=preferred_date+class_time, 락커/운동복=이력 created_at
// 체험은 무료라 0원 행만 쌓여서 뺐다. 운동복은 서비스가 끝났지만 과거 기록은 그대로 둔다.
async function buildRevenueItems(uptoMonth) {
  const items = [];

  // 1) 회원 등록/재등록
  const regs = await db.all(`
    SELECT r.id, m.name as member_name, r.reg_type, r.plan, r.period,
           r.amount, r.payment_method, r.start_date, r.created_at
    FROM member_registrations r
    LEFT JOIN members m ON m.id = r.member_id
  `);
  regs.forEach(r => {
    // 금액이 음수면 환불 건 — 구분을 '환불'로 분리하고 원래 구분은 분류에 남긴다
    const isRefund = (r.amount || 0) < 0 || r.reg_type === '환불';
    items.push({
      source: isRefund ? '환불' : '회원등록',
      category: isRefund ? '회원등록' : (r.reg_type || '등록'),
      // 등록은 '결제일시'(created_at) 기준이다. 매출 내역·가계부가 전부 이 기준으로 맞춰져 있다.
      //
      // 환불만 다르다. 환불 창에서 **환불일을 직접 받기 때문이다.**
      // 전에는 그 날짜를 저장만 하고 집계는 입력 시각을 써서, 지난 달 환불을 오늘 처리하면
      // 이번 달 지출로 잡혔다 (사장님이 적은 날짜가 조용히 무시됐다).
      // 환불은 사장님이 적은 날짜(start_date)를 쓴다 — 안 적었으면 그때서야 입력 시각으로 돌아간다.
      paid_at: isRefund
        ? (r.start_date ? r.start_date + ' 00:00:00' : (r.created_at || ''))
        : (r.created_at || (r.start_date ? r.start_date + ' 00:00:00' : '')),
      name: r.member_name || '-',
      amount: r.amount || 0,
      // 환불은 결제수단을 기록하지 않아 '미지정'으로 묶이므로 '환불'로 라벨링 (기록돼 있으면 그대로 둔다)
      payment_method: r.payment_method || (isRefund ? '환불' : ''),
      detail: [r.plan, r.period ? r.period + (r.reg_type === '횟수권' ? '회' : '개월') : ''].filter(Boolean).join(' '),
    });
  });

  // 2) 드랍인 (applications) — amount 컬럼이 있을 때만. 체험은 무료라 매출에서 뺀다.
  try {
    const drops = await db.all(`
      SELECT id, type, name, preferred_date, class_time, class_name, amount, payment_method, status
      FROM applications WHERE type = '드랍인'
    `);
    const nowStr = new Date(Date.now() + 9*60*60*1000).toISOString().slice(0,19).replace('T',' ');
    drops.forEach(d => {
      const t = (d.class_time && /^\d{1,2}:\d{2}/.test(d.class_time)) ? d.class_time.slice(0,5) : '00:00';
      const paidAt = d.preferred_date ? `${d.preferred_date} ${t}:00` : '';
      // 아직 안 지난(미래) 건이면서 금액 0원이면 매출 목록에서 제외
      if ((d.amount || 0) === 0 && paidAt && paidAt > nowStr) return;
      items.push({
        source: '드랍인',
        category: '드랍인',
        paid_at: paidAt,
        name: d.name || '-',
        amount: d.amount || 0,
        payment_method: d.payment_method || '',
        detail: [d.class_time, d.class_name].filter(Boolean).join(' '),
      });
    });
  } catch (e) {}

  // 3) 락커 (locker_history: 배정/연장 등 결제 발생 이력)
  const lockers = await db.all(`
    SELECT locker_id, member_name, action, months, amount, payment_method, start_date, created_at
    FROM locker_history
  `);
  lockers.forEach(l => {
    const isRefund = (l.amount || 0) < 0;
    items.push({
      source: isRefund ? '환불' : '락커',
      category: isRefund ? '락커' : (l.action || '락커'),
      paid_at: l.created_at || (l.start_date ? l.start_date + ' 00:00:00' : ''),
      name: l.member_name || '-',
      amount: l.amount || 0,
      payment_method: l.payment_method || (isRefund ? '환불' : ''),
      detail: [`${l.locker_id}번`, l.months ? l.months + '개월' : ''].filter(Boolean).join(' '),
    });
  });

  // 4) 운동복 (uniform_history) — 서비스는 끝났지만 과거 매출 기록은 그대로 남긴다.
  //    등록 화면이 없어서 새로 쌓이지는 않는다.
  const uniforms = await db.all(`
    SELECT member_name, action, months, amount, payment_method, start_date, created_at
    FROM uniform_history
  `);
  uniforms.forEach(u => {
    const isRefund = (u.amount || 0) < 0;
    items.push({
      source: isRefund ? '환불' : '운동복',
      category: isRefund ? '운동복' : (u.action || '운동복'),
      paid_at: u.created_at || (u.start_date ? u.start_date + ' 00:00:00' : ''),
      name: u.member_name || '-',
      amount: u.amount || 0,
      payment_method: u.payment_method || (isRefund ? '환불' : ''),
      detail: u.months ? u.months + '개월' : '',
    });
  });

  // 5) 가계부에서 직접 등록한 매출 (물품판매·강습료 등) — 매출 내역/엑셀에도 그대로 잡히도록 여기서 합친다.
  //    고정수입은 한 건만 저장돼 있으므로 등록월부터 이번 달까지 매달 한 건씩 펼친다.
  const ledgerIncome = expandLedgerRows(
    await db.all(`SELECT id, category, amount, detail, entry_date, is_fixed FROM ledger_entries WHERE kind = '매출'`),
    uptoMonth || todayKST().slice(0, 7)
  );
  ledgerIncome.forEach(l => {
    items.push({
      source: l.category || '기타수입',
      category: l.is_fixed ? '고정수입' : '가계부',
      paid_at: (l.entry_date || '') + ' 00:00:00',
      name: '-',
      amount: l.amount || 0,
      payment_method: '',
      detail: l.detail || '',
      ledger_id: l.id,
      ledger_fixed: l.is_fixed ? 1 : 0,
    });
  });

  // 0원짜리 건은 매출 목록에 남기지 않는다 (서비스 배정·무료 건 — 합계에 영향이 없고 줄만 늘어난다)
  const paid = items.filter(x => (x.amount || 0) !== 0);

  // 결제일시 내림차순 기본 정렬 (프론트에서 토글 가능)
  paid.sort((a, b) => (a.paid_at < b.paid_at ? 1 : a.paid_at > b.paid_at ? -1 : 0));
  return paid;
}

router.get('/api/revenue/all', requireAdmin, async (req, res) => {
  const items = await buildRevenueItems();

  // 합계 요약
  const total = items.reduce((s, x) => s + (x.amount || 0), 0);
  const byMethod = {};
  items.forEach(x => { if (x.amount) { const k = x.payment_method || '미지정'; byMethod[k] = (byMethod[k] || 0) + x.amount; } });

  res.json({ items, total, count: items.length, by_method: byMethod });
});

// 매출 엑셀 다운로드 (탭 5개: 전체/월별/결제수단별/상세별/분류별)
// 화면의 필터(월·구분·결제수단·이름)를 그대로 반영해서 내려준다.
router.get('/api/revenue/export', requireAdmin, async (req, res) => {
  const { month = '', source = '', method = '', q = '' } = req.query;
  const keyword = String(q).toLowerCase().trim();

  const items = (await buildRevenueItems()).filter(x => {
    if (month && (x.paid_at || '').slice(0, 7) !== month) return false;
    if (source && x.source !== source) return false;
    if (method && (x.payment_method || '') !== method) return false;
    if (keyword && !(x.name || '').toLowerCase().includes(keyword)) return false;
    return true;
  });

  const totalAmount = items.reduce((s, x) => s + (x.amount || 0), 0);
  const SOURCES = ['회원등록', '드랍인', '락커', '운동복', '환불'];
  // 결제수단으로 인정하는 값 (프론트 admin-core.js의 PAYMENT_METHODS와 동일하게 유지)
  const PAYMENT_METHODS = ['카드', '계좌이체', '현금', '환불'];

  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CrossFit Box';
  wb.created = new Date();

  const WON = '#,##0';
  const PCT = '0.0"%"';

  // 시트 하나를 만들면서 헤더 스타일·열 너비·합계행까지 한 번에 처리
  function addSheet(name, columns, rows, totalRow) {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = columns;
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
    ws.getRow(1).alignment = { vertical: 'middle' };
    ws.getRow(1).height = 22;
    rows.forEach(r => ws.addRow(r));
    if (totalRow) {
      const row = ws.addRow(totalRow);
      row.font = { bold: true };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    return ws;
  }

  // ── 1. 전체 매출 ────────────────────────────────────
  addSheet('전체 매출', [
    { header: '결제일시', key: 'paid_at', width: 20 },
    { header: '구분', key: 'source', width: 12 },
    { header: '분류', key: 'category', width: 12 },
    { header: '이름', key: 'name', width: 14 },
    { header: '금액', key: 'amount', width: 14, style: { numFmt: WON } },
    { header: '결제수단', key: 'payment_method', width: 12 },
    { header: '상세', key: 'detail', width: 28 },
  ], items.map(x => ({
    paid_at: (x.paid_at || '').slice(0, 16).replace('T', ' '),
    source: x.source,
    category: x.category || '',
    name: x.name || '',
    amount: x.amount || 0,
    payment_method: x.payment_method || '-',
    detail: x.detail || '',
  })), { paid_at: '합계', source: '', category: '', name: `${items.length}건`, amount: totalAmount });

  // ── 2. 월별 매출 (구분별 금액까지 펼침) ──────────────
  const byMonth = {};
  items.forEach(x => {
    const mo = (x.paid_at || '').slice(0, 7) || '미상';
    if (!byMonth[mo]) { byMonth[mo] = { month: mo, cnt: 0, amount: 0 }; SOURCES.forEach(s => byMonth[mo][s] = 0); }
    byMonth[mo].cnt++;
    byMonth[mo].amount += x.amount || 0;
    if (SOURCES.includes(x.source)) byMonth[mo][x.source] += x.amount || 0;
  });
  const monthRows = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
  const monthTotal = { month: '합계', cnt: items.length, amount: totalAmount };
  SOURCES.forEach(s => monthTotal[s] = monthRows.reduce((sum, r) => sum + r[s], 0));
  addSheet('월별 매출', [
    { header: '월', key: 'month', width: 12 },
    { header: '건수', key: 'cnt', width: 10 },
    { header: '금액', key: 'amount', width: 16, style: { numFmt: WON } },
    ...SOURCES.map(s => ({ header: s, key: s, width: 14, style: { numFmt: WON } })),
  ], monthRows, monthTotal);

  // ── 3. 결제수단별 (카드·계좌이체·현금·환불만) ─────────
  // 그 외(결제수단 미입력, 서비스 등)는 집계에서 제외하므로 이 탭 합계는 전체 매출과 다를 수 있다.
  const byMethodX = {};
  items.forEach(x => {
    const k = x.payment_method;
    if (!PAYMENT_METHODS.includes(k)) return;
    if (!byMethodX[k]) byMethodX[k] = { method: k, cnt: 0, amount: 0 };
    byMethodX[k].cnt++;
    byMethodX[k].amount += x.amount || 0;
  });
  const methodRows = Object.values(byMethodX).sort((a, b) => b.amount - a.amount);
  const methodTotal = methodRows.reduce((s, r) => s + r.amount, 0);
  const methodCnt = methodRows.reduce((s, r) => s + r.cnt, 0);
  methodRows.forEach(r => { r.share = methodTotal ? (r.amount / methodTotal) * 100 : 0; });
  addSheet('결제수단별', [
    { header: '결제수단', key: 'method', width: 14 },
    { header: '건수', key: 'cnt', width: 10 },
    { header: '금액', key: 'amount', width: 16, style: { numFmt: WON } },
    { header: '비중', key: 'share', width: 10, style: { numFmt: PCT } },
  ], methodRows, { method: '합계', cnt: methodCnt, amount: methodTotal, share: methodTotal ? 100 : 0 });

  // ── 4. 상세별 (구분 + 상세 조합으로 묶음) ────────────
  const byDetail = {};
  items.forEach(x => {
    const d = x.detail || '(상세 없음)';
    const k = x.source + '|' + d;
    if (!byDetail[k]) byDetail[k] = { source: x.source, detail: d, cnt: 0, amount: 0 };
    byDetail[k].cnt++;
    byDetail[k].amount += x.amount || 0;
  });
  const detailRows = Object.values(byDetail).sort((a, b) => b.amount - a.amount || a.source.localeCompare(b.source));
  addSheet('상세별', [
    { header: '구분', key: 'source', width: 12 },
    { header: '상세', key: 'detail', width: 30 },
    { header: '건수', key: 'cnt', width: 10 },
    { header: '금액', key: 'amount', width: 16, style: { numFmt: WON } },
  ], detailRows, { source: '합계', detail: '', cnt: items.length, amount: totalAmount });

  // ── 5. 분류별 (회원등록/드랍인/락커/운동복/환불/가계부 항목) ──────
  const bySource = {};
  items.forEach(x => {
    if (!bySource[x.source]) bySource[x.source] = { source: x.source, cnt: 0, amount: 0 };
    bySource[x.source].cnt++;
    bySource[x.source].amount += x.amount || 0;
  });
  const sourceRows = Object.values(bySource)
    .sort((a, b) => b.amount - a.amount || b.cnt - a.cnt)
    .map(r => ({ ...r, share: totalAmount ? (r.amount / totalAmount) * 100 : 0 }));
  addSheet('분류별', [
    { header: '구분', key: 'source', width: 14 },
    { header: '건수', key: 'cnt', width: 10 },
    { header: '금액', key: 'amount', width: 16, style: { numFmt: WON } },
    { header: '비중', key: 'share', width: 10, style: { numFmt: PCT } },
  ], sourceRows, { source: '합계', cnt: items.length, amount: totalAmount, share: totalAmount ? 100 : 0 });

  const todayStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
  const fileName = `매출_${month || '전체'}_${todayStr}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  // 한글 파일명은 RFC 5987 형식으로 (구형 브라우저용 ASCII 폴백도 같이 지정)
  res.setHeader('Content-Disposition',
    `attachment; filename="revenue_${month || 'all'}_${todayStr}.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  await wb.xlsx.write(res);
  res.end();
});

// 향후 3개월 매출 예측 (현재 활성 등록의 만료월에 재계약 가정)

router.get('/api/stats', requireAdmin, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const in7   = new Date(Date.now()+7*86400000).toISOString().split('T')[0];
  const thisMonth = today.slice(0,7);

  // 코치(직원)도 members 테이블에 들어 있지만 회원권을 사는 사람이 아니므로 활성 회원 수에서 뺀다
  const activeMembers  = await db.get("SELECT COUNT(*) as cnt FROM members WHERE status='active' AND COALESCE(is_staff,0)=0");
  const expiringMembers = await db.all(`
    SELECT m.id, m.name, m.phone, r.end_date, r.plan, r.reg_type, r.remaining_count
    FROM members m
    JOIN member_registrations r ON r.member_id=m.id AND r.is_current=1
    WHERE m.status='active' AND r.end_date BETWEEN ? AND ?
    ORDER BY r.end_date
  `, [today, in7]);
  const lockerUsed    = await db.get("SELECT COUNT(*) as cnt FROM lockers WHERE status='active' OR status='staff'");
  const uniformActive = await db.get("SELECT COUNT(*) as cnt FROM uniforms WHERE status='active'");
  // 홈은 코치와 함께 보는 화면이라 매출·금액을 아예 담지 않는다.
  // 금액은 매출 관리·가계부에서만 보고, 그 탭들은 따로 열람 권한을 받아야 한다.

  // 7일 이내 생일 (연도 넘어가는 경우 포함)
  const todayD = new Date(today + 'T00:00:00');
  const in7D = new Date(in7 + 'T00:00:00');
  const toDateStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const birthdayMembers = await db.all("SELECT id, name, phone, birth_date FROM members WHERE status='active' AND birth_date IS NOT NULL AND birth_date != ''");
  const upcomingBirthdays = birthdayMembers
    .map(m => {
      const [, bm, bd] = m.birth_date.split('-').map(Number);
      let next = new Date(todayD.getFullYear(), bm - 1, bd);
      if (next < todayD) next = new Date(todayD.getFullYear() + 1, bm - 1, bd);
      return { ...m, next_birthday: next };
    })
    .filter(m => m.next_birthday <= in7D)
    .sort((a, b) => a.next_birthday - b.next_birthday)
    .map(m => ({ id: m.id, name: m.name, phone: m.phone, birth_date: m.birth_date, next_birthday: toDateStr(m.next_birthday) }));

  res.json({
    active_members: activeMembers.cnt,
    expiring_members: expiringMembers,
    upcoming_birthdays: upcomingBirthdays,
    locker_used: lockerUsed.cnt,
    uniform_active: uniformActive.cnt,
  });
});

// 여기 있던 GET /api/revenue/monthly 와 /api/revenue/forecast 는
// 홈의 '월별 매출 추이' 그래프만 쓰던 것이다. 홈은 코치와 함께 보는 화면이라
// 매출을 아예 빼기로 하면서 그래프를 지웠고, 이 둘을 부르는 곳이 없어졌다 (2026-09-19 삭제).

// ============================================================
// 가계부: 왼쪽은 매출(+), 오른쪽은 지출(-)
// 매출 쪽은 기존 매출 집계(회원권·락커·드랍인 + 가계부 수동 수입)를 그대로 쓰고,
// 지출 쪽은 기존 환불(매출의 마이너스 건) + 가계부에 직접 적은 지출을 합친다.
// ============================================================

router.get('/api/ledger/categories', requireAdmin, (req, res) => res.json(LEDGER_CATEGORIES));

router.get('/api/ledger', requireAdmin, async (req, res) => {
  // date가 오면 그 하루만, month만 오면 그 달, 둘 다 없으면 전체 기간
  const date = isValidDate(req.query.date) ? req.query.date : '';
  const month = date ? date.slice(0, 7) : (isValidMonth(req.query.month) ? req.query.month : '');
  const thisMonth = todayKST().slice(0, 7);
  // 고정비는 조회 기준월까지만 펼친다 (전체 기간이면 이번 달까지)
  const upto = month || thisMonth;
  const inRange = (d) => {
    const s = String(d || '');
    if (date) return s.slice(0, 10) === date;
    if (month) return s.slice(0, 7) === month;
    return true;
  };

  // 고정수입·고정지출을 같은 기준월까지 펼쳐야 순익이 맞는다
  const revItems = await buildRevenueItems(upto);
  const expenseRows = expandLedgerRows(
    await db.all(`SELECT id, category, amount, detail, entry_date, is_fixed FROM ledger_entries WHERE kind = '지출'`),
    upto
  );

  const income = revItems
    .filter(x => (x.amount || 0) > 0 && inRange(x.paid_at))
    .map(x => ({
      date: String(x.paid_at || '').slice(0, 10),
      category: x.source,
      name: x.name,
      amount: x.amount,
      detail: x.detail || '',
      fixed: !!x.ledger_fixed,
      ledger_id: x.ledger_id || null,
    }));

  const expense = revItems
    .filter(x => (x.amount || 0) < 0 && inRange(x.paid_at))
    .map(x => ({
      date: String(x.paid_at || '').slice(0, 10),
      category: '환불',
      name: x.name,
      amount: -x.amount,               // 화면에는 지출 금액을 양수로 보여준다
      detail: [x.category, x.detail].filter(Boolean).join(' '),
      fixed: false,
      ledger_id: null,
    }))
    .concat(expenseRows.filter(l => inRange(l.entry_date)).map(l => ({
      date: l.entry_date,
      category: l.category,
      name: '-',
      amount: l.amount || 0,
      detail: l.detail || '',
      fixed: !!l.is_fixed,
      ledger_id: l.id,
    })));

  const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  income.sort(byDateDesc);
  expense.sort(byDateDesc);

  const sum = (arr) => arr.reduce((s, x) => s + (x.amount || 0), 0);
  const incomeTotal = sum(income);
  const expenseTotal = sum(expense);
  res.json({
    month, date, income, expense,
    income_total: incomeTotal,
    expense_total: expenseTotal,
    net: incomeTotal - expenseTotal,
  });
});

router.post('/api/ledger', requireAdmin, async (req, res) => {
  const { kind, category, amount, detail = '', is_fixed = 0, entry_date } = req.body || {};
  if (!LEDGER_CATEGORIES[kind]) return res.status(400).json({ error: '구분은 매출 또는 지출만 선택할 수 있습니다' });
  // 목록에 없는 항목은 거부한다. 화면에서 막는 것만으로는 부족하고(오래된 탭·직접 호출),
  // 회원권처럼 자동으로 잡히는 매출이 여기로 또 들어오면 이중 계상이 된다.
  const cat = String(category || '').trim();
  if (!cat) return res.status(400).json({ error: '항목을 선택해주세요' });
  if (!LEDGER_CATEGORIES[kind].includes(cat)) {
    return res.status(400).json({ error: `'${cat}'${josaEunNeun(cat)} ${kind}에 쓸 수 없는 항목입니다` });
  }
  const amt = Math.round(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: '금액은 0보다 큰 숫자로 입력해주세요' });
  // 날짜를 비우면 오늘로 넣어 주는 것은 편의지만, **달력에 없는 날짜를 말없이 오늘로 바꾸는 것**은
  // 사장님이 적은 날과 다른 날에 들어가게 만든다. 잘못 친 것은 알려 주고 되돌려보낸다.
  if (entry_date && !isValidDate(entry_date)) {
    // 날짜 뒤에 조사를 붙이면 끝 숫자에 따라 은/는이 갈린다 (2026-02-31은 / 2026-02-22는).
    // 이 프로젝트는 날짜 뒤에 조사를 쓰지 않기로 했다.
    return res.status(400).json({ error: `달력에 없는 날짜입니다 — ${entry_date}. 날짜를 다시 확인해주세요.` });
  }
  const date = entry_date || todayKST();

  const r = await db.run(
    `INSERT INTO ledger_entries (kind, category, amount, detail, entry_date, is_fixed)
     VALUES (?,?,?,?,?,?) RETURNING id`,
    [kind, cat, amt, String(detail || '').slice(0, 500), date, is_fixed ? 1 : 0]
  );
  res.json({ ok: true, id: r.lastInsertRowid });
});

router.delete('/api/ledger/:id', requireAdmin, async (req, res) => {
  // 숫자가 아닌 id를 그대로 넘기면 DB가 오류를 내 500이 된다. 여기서 걸러 404로 돌려준다.
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: '항목을 찾을 수 없습니다' });
  const r = await db.run('DELETE FROM ledger_entries WHERE id = ?', [id]);
  if (!r.changes) return res.status(404).json({ error: '항목을 찾을 수 없습니다' });
  res.json({ ok: true });
});

module.exports = router;
