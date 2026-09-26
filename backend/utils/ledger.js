// 가계부 공용 로직: 고정비(월별 반복) 항목 펼치기
// 고정비는 DB에 한 건만 저장하고, 조회할 때 등록월부터 기준월까지 매달 한 건씩 만들어 보여준다.

// 한국시간(KST) 기준 오늘 날짜 (서버가 UTC로 돌아도 날짜가 하루 밀리지 않게)
function todayKST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function nextMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

// 'YYYY-MM' 에 'DD' 를 붙이되, 그 달에 없는 날이면 말일로 당긴다.
// (31일에 등록한 고정비가 2월에 2026-02-31 같은 없는 날짜로 나오던 문제)
function dayInMonth(month, day) {
  const [y, mo] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return `${month}-${String(Math.min(Number(day), last)).padStart(2, '0')}`;
}

// rows: ledger_entries 행들. uptoMonth: 'YYYY-MM' (고정비를 여기까지 반복)
// 반환 항목은 원본 행 + month(속한 월), entry_date(그 달의 날짜)로 덮어쓴 복사본.
function expandLedgerRows(rows, uptoMonth) {
  const out = [];
  for (const r of rows) {
    const startMonth = String(r.entry_date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(startMonth)) continue;
    if (!r.is_fixed) { out.push({ ...r, month: startMonth }); continue; }
    const day = String(r.entry_date).slice(8, 10) || '01';
    // ponytail: 잘못된 entry_date로 무한 루프가 나지 않게 50년(600개월)에서 자른다
    let m = startMonth;
    for (let i = 0; m <= uptoMonth && i < 600; i++, m = nextMonth(m)) {
      out.push({ ...r, month: m, entry_date: dayInMonth(m, day) });
    }
  }
  return out;
}

module.exports = { todayKST, nextMonth, dayInMonth, expandLedgerRows };

// 자체 점검: node backend/utils/ledger.js
if (require.main === module) {
  const assert = require('assert');

  assert.strictEqual(nextMonth('2025-11'), '2025-12');
  assert.strictEqual(nextMonth('2025-12'), '2026-01');

  // 일회성 항목은 그대로 한 건
  assert.deepStrictEqual(
    expandLedgerRows([{ id: 1, is_fixed: 0, entry_date: '2026-03-14' }], '2026-09').map(r => r.entry_date),
    ['2026-03-14']
  );

  // 고정비는 등록월부터 기준월까지 매달 (해가 넘어가도)
  assert.deepStrictEqual(
    expandLedgerRows([{ id: 2, is_fixed: 1, entry_date: '2025-11-05' }], '2026-02').map(r => r.entry_date),
    ['2025-11-05', '2025-12-05', '2026-01-05', '2026-02-05']
  );

  // 기준월보다 나중에 등록된 고정비는 그 달에 나오지 않는다
  assert.deepStrictEqual(expandLedgerRows([{ id: 3, is_fixed: 1, entry_date: '2026-05-01' }], '2026-01'), []);

  // 날짜가 깨진 행은 버린다 (무한 루프 방지)
  assert.deepStrictEqual(expandLedgerRows([{ id: 4, is_fixed: 1, entry_date: '' }], '2026-01'), []);

  // 말일 보정: 31일 고정비가 30일·28일뿐인 달에서 없는 날짜가 되면 안 된다
  assert.strictEqual(dayInMonth('2026-02', '31'), '2026-02-28');
  assert.strictEqual(dayInMonth('2028-02', '31'), '2028-02-29');   // 윤년
  assert.strictEqual(dayInMonth('2026-04', '31'), '2026-04-30');
  assert.strictEqual(dayInMonth('2026-01', '31'), '2026-01-31');
  assert.deepStrictEqual(
    expandLedgerRows([{ id: 5, is_fixed: 1, entry_date: '2026-01-31' }], '2026-04').map(r => r.entry_date),
    ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']
  );

  console.log('가계부 유틸 자체 점검 통과');
}
