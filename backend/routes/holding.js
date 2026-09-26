const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin, isSelfOrAdminForId, isValidAdminToken } = require('../middleware/auth');

const KST_NOW_SQL = `to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS')`;

// 락커·운동복은 회원권과 수명이 따로 논다.
// **홀딩 신청일보다 나중에 시작하는 락커는 이 홀딩과 상관이 없다** — 아직 쓰기 시작도 안 했으므로
// 밀어 줄 것이 없다. 거는 쪽과 푸는 쪽이 반드시 같은 기준을 써야 한다.
//
// 전에는 거는 쪽이 활성 락커를 무조건 늘리고, 푸는 쪽만 이 조건을 봤다.
// 그래서 시작일이 미래인 락커(재등록 회원이 흔하다)는 홀딩을 걸었다 풀 때마다
// 기간이 며칠씩 공짜로 늘어난 채 남았다.
function isAffectedByHolding(item, requestDate) {
  if (!item || !item.end_date) return false;
  if (!item.start_date || !requestDate) return true;
  return item.start_date <= requestDate;
}

const todayKST = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

router.get('/api/holding-requests', requireAdmin, async (req, res) => {
  res.json(await db.all('SELECT * FROM holding_requests ORDER BY status ASC, created_at DESC'));
});

// 회원 홀딩 신청 (하루 단위로 각각 등록, 자동 반영)
router.post('/api/holding-requests', async (req, res) => {
  const { member_id, days, reason, start_date } = req.body;
  if (!isSelfOrAdminForId(req, member_id)) return res.status(401).json({ error: '본인 인증이 필요합니다' });
  const member = await db.get('SELECT * FROM members WHERE id=?', [member_id]);
  if (!member) return res.status(404).json({ error: '회원을 찾을 수 없습니다' });

  const reg = await db.get("SELECT * FROM member_registrations WHERE member_id=? AND is_current=1 AND (reg_type IS NULL OR reg_type != '횟수권')", [member_id]);
  if (!reg) return res.status(400).json({ error: '활성 회원권이 없습니다' });

  const todayStr = todayKST();
  if (!start_date || start_date < todayStr) {
    return res.status(400).json({ error: '홀딩 시작일은 오늘 이후만 가능합니다' });
  }

  const used = reg.holding_days || 0;
  const total = reg.holding_total || 0;
  const remaining = total - used;
  if (days > remaining) {
    return res.status(400).json({ error: `신청 가능한 홀딩이 부족합니다 (잔여 ${remaining}일)` });
  }

  // 신청 구간의 날짜 목록 (하루 단위로 각각 등록되므로 미리 계산)
  const dates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start_date);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  // 같은 날짜에 이미 홀딩이 있으면 차단 (중복 홀딩 방지)
  const placeholders = dates.map(() => '?').join(',');
  const dup = await db.get(
    `SELECT start_date FROM holding_requests WHERE member_id=? AND status <> 'rejected' AND start_date IN (${placeholders}) ORDER BY start_date LIMIT 1`,
    [member_id, ...dates]
  );
  if (dup) {
    return res.status(400).json({ error: `이미 홀딩한 날짜입니다 (${dup.start_date})` });
  }

  const newEnd = new Date(reg.end_date);
  newEnd.setDate(newEnd.getDate() + parseInt(days));
  const newEndStr = newEnd.toISOString().split('T')[0];

  const locker = await db.get("SELECT * FROM lockers WHERE member_id=? AND status='active'", [member_id]);
  const uniform = await db.get("SELECT * FROM uniforms WHERE member_id=? AND status='active'", [member_id]);

  await db.withTransaction(async (tx) => {
    // 하루 단위로 각각 등록
    for (const dStr of dates) {
      await tx.run(`INSERT INTO holding_requests (member_id, member_name, days, reason, start_date, end_date, status, processed_at) VALUES (?,?,1,?,?,?,'approved',${KST_NOW_SQL})`,
        [member_id, member.name, reason, dStr, dStr]);
    }

    // 회원권 만료일 연장 + 사용 홀딩 증가
    await tx.run('UPDATE member_registrations SET end_date=?, holding_days=holding_days+? WHERE id=?',
      [newEndStr, days, reg.id]);

    // 락커 자동 연장 — 취소할 때와 같은 기준으로 판단한다 (isAffectedByHolding)
    const reqDate = todayKST();
    if (isAffectedByHolding(locker, reqDate)) {
      const lockerNewEnd = new Date(locker.end_date);
      lockerNewEnd.setDate(lockerNewEnd.getDate() + parseInt(days));
      await tx.run('UPDATE lockers SET end_date=? WHERE id=?', [lockerNewEnd.toISOString().split('T')[0], locker.id]);
    }

    // 운동복 자동 연장 — 같은 기준
    if (isAffectedByHolding(uniform, reqDate)) {
      const uniNewEnd = new Date(uniform.end_date);
      uniNewEnd.setDate(uniNewEnd.getDate() + parseInt(days));
      await tx.run('UPDATE uniforms SET end_date=? WHERE id=?', [uniNewEnd.toISOString().split('T')[0], uniform.id]);
    }
  });

  res.json({ message: '홀딩이 적용되었습니다', new_end_date: newEndStr });
});

// 홀딩 단일 일자 취소 (회원은 미래만 / 관리자는 지난 날짜·당일 포함 전부 가능)
router.delete('/api/holding-requests/:id', async (req, res) => {
  const hr = await db.get('SELECT * FROM holding_requests WHERE id=?', [req.params.id]);
  if (!hr) return res.status(404).json({ error: '신청을 찾을 수 없습니다' });
  if (!isSelfOrAdminForId(req, hr.member_id)) return res.status(401).json({ error: '본인 인증이 필요합니다' });

  const todayStr = todayKST();
  if (!isValidAdminToken(req) && hr.start_date && hr.start_date <= todayStr) {
    return res.status(400).json({ error: '당일 및 지난 홀딩은 취소할 수 없습니다' });
  }

  // 하루치(1일) 되돌리기
  const reg = await db.get("SELECT * FROM member_registrations WHERE member_id=? AND is_current=1 AND (reg_type IS NULL OR reg_type != '횟수권')", [hr.member_id]);
  const locker = await db.get("SELECT * FROM lockers WHERE member_id=? AND status='active'", [hr.member_id]);
  const uniform = await db.get("SELECT * FROM uniforms WHERE member_id=? AND status='active'", [hr.member_id]);

  // 홀딩은 "신청 당시 is_current였던 회원권"에 기록된다.
  // 그 사이 재등록이 있었다면 이 홀딩은 이전 회원권 소속이고, 이전 회원권의 홀딩은 현재 회원권으로 이월되지 않는다.
  // 따라서 지울 때도 현재 회원권의 만료일/홀딩 일수를 깎으면 안 된다 (행만 삭제).
  const belongsToCurrentReg = !!reg && !!hr.created_at && !!reg.created_at && hr.created_at >= reg.created_at;

  // 거는 쪽과 같은 기준을 쓴다 (isAffectedByHolding). 신청일은 그 홀딩을 만든 날이다.
  const reqDate = (hr.created_at || '').slice(0, 10);
  const wasExtendedByThisHolding = (item) => isAffectedByHolding(item, reqDate);

  await db.withTransaction(async (tx) => {
    if (belongsToCurrentReg && reg.end_date) {
      const newEnd = new Date(reg.end_date);
      newEnd.setDate(newEnd.getDate() - hr.days);
      // 사용 홀딩 일수는 0 밑으로 내려가지 않도록 방어 (내려가면 잔여가 총량보다 많아짐)
      await tx.run('UPDATE member_registrations SET end_date=?, holding_days=GREATEST(holding_days-?, 0) WHERE id=?',
        [newEnd.toISOString().split('T')[0], hr.days, reg.id]);
    }
    if (belongsToCurrentReg && wasExtendedByThisHolding(locker)) {
      const ln = new Date(locker.end_date);
      ln.setDate(ln.getDate() - hr.days);
      await tx.run('UPDATE lockers SET end_date=? WHERE id=?', [ln.toISOString().split('T')[0], locker.id]);
    }
    if (belongsToCurrentReg && wasExtendedByThisHolding(uniform)) {
      const un = new Date(uniform.end_date);
      un.setDate(un.getDate() - hr.days);
      await tx.run('UPDATE uniforms SET end_date=? WHERE id=?', [un.toISOString().split('T')[0], uniform.id]);
    }

    await tx.run('DELETE FROM holding_requests WHERE id=?', [req.params.id]);
  });

  res.json({
    message: belongsToCurrentReg
      ? '취소되었습니다'
      : '삭제되었습니다 (이전 회원권의 홀딩이라 현재 회원권 만료일·홀딩 일수는 변경되지 않았습니다)',
    reverted: belongsToCurrentReg,
  });
});

// 홀딩 날짜 수정 (관리자 전용)
// 일수는 그대로이므로 회원권/락커/운동복 만료일은 변하지 않고, 홀딩이 걸린 날짜만 옮긴다.
router.put('/api/holding-requests/:id/date', requireAdmin, async (req, res) => {
  const { start_date } = req.body;
  if (!start_date || !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
    return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)' });
  }

  const hr = await db.get('SELECT * FROM holding_requests WHERE id=?', [req.params.id]);
  if (!hr) return res.status(404).json({ error: '신청을 찾을 수 없습니다' });
  if (hr.start_date === start_date) return res.json({ message: '변경된 내용이 없습니다', start_date });

  // 같은 회원이 이미 홀딩한 날짜로는 옮길 수 없음
  const dup = await db.get(
    "SELECT id FROM holding_requests WHERE member_id=? AND status <> 'rejected' AND start_date=? AND id<>?",
    [hr.member_id, start_date, req.params.id]
  );
  if (dup) return res.status(400).json({ error: `이미 홀딩한 날짜입니다 (${start_date})` });

  // 하루 단위 등록이 기본이지만, 과거에 등록된 여러 날짜짜리 건도 기간 길이를 유지하도록 종료일을 계산
  const span = Math.max(1, hr.days || 1);
  const newEnd = new Date(start_date);
  newEnd.setDate(newEnd.getDate() + span - 1);

  await db.run('UPDATE holding_requests SET start_date=?, end_date=? WHERE id=?',
    [start_date, newEnd.toISOString().split('T')[0], req.params.id]);

  res.json({ message: '홀딩 날짜가 수정되었습니다', start_date });
});

// 홀딩 승인 (관리자 - 이제 자동이므로 거의 안 쓰이지만 유지)
router.post('/api/holding-requests/:id/approve', requireAdmin, async (req, res) => {
  await db.run(`UPDATE holding_requests SET status='approved', processed_at=${KST_NOW_SQL} WHERE id=?`, [req.params.id]);
  res.json({ message: '승인 완료' });
});

router.post('/api/holding-requests/:id/reject', requireAdmin, async (req, res) => {
  await db.run(`UPDATE holding_requests SET status='rejected', processed_at=${KST_NOW_SQL} WHERE id=?`, [req.params.id]);
  res.json({ message: '거절 완료' });
});

module.exports = router;
