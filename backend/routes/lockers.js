const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

router.get('/api/lockers', requireAdmin, async (req, res) => {
  res.json(await db.all('SELECT * FROM lockers ORDER BY id'));
});

router.get('/api/lockers/history', requireAdmin, async (req, res) => {
  res.json(await db.all('SELECT * FROM locker_history ORDER BY created_at DESC LIMIT 200'));
});

// 락커 이력 단건 삭제 (잘못 입력한 기록 정리용)
router.delete('/api/lockers/history/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM locker_history WHERE id=?', [req.params.id]);
  res.json({ message: '이력이 삭제되었습니다' });
});

// 락커 이력 수정 (잘못 입력한 회원명/날짜/금액 정정)
router.put('/api/lockers/history/:id', requireAdmin, async (req, res) => {
  const { member_name, start_date, end_date, amount } = req.body;
  await db.run('UPDATE locker_history SET member_name=?, start_date=?, end_date=?, amount=? WHERE id=?',
    [member_name||null, start_date||null, end_date||null, amount||0, req.params.id]);
  res.json({ message: '이력이 수정되었습니다' });
});

router.put('/api/lockers/:id', requireAdmin, async (req, res) => {
  const { member_id,member_name,start_date,end_date,months,amount,payment_method,status } = req.body;
  try {
    await db.withTransaction(async (tx) => {
      // 이미 쓰는 사람이 있으면 배정하지 않는다.
      // FOR UPDATE 로 행을 잠가, 두 요청이 동시에 들어와도 하나만 통과한다
      // (안 막으면 배정 이력이 두 번 남아 매출이 이중으로 잡힌다).
      const cur = await tx.get('SELECT member_name, status FROM lockers WHERE id=? FOR UPDATE', [req.params.id]);
      if (!cur) throw Object.assign(new Error('락커를 찾을 수 없습니다'), { status: 404 });
      if (cur.member_name) {
        throw Object.assign(new Error(`${req.params.id}번 락커는 이미 ${cur.member_name} 님이 사용 중입니다`), { status: 409 });
      }
      await tx.run("UPDATE lockers SET member_id=?,member_name=?,start_date=?,end_date=?,months=?,amount=?,payment_method=?,status=? WHERE id=?",
        [member_id||null,member_name,start_date,end_date,months,amount,payment_method,status||'active',req.params.id]);
      await tx.run("INSERT INTO locker_history (locker_id,member_id,member_name,action,start_date,end_date,months,amount,payment_method) VALUES (?,?,?,'배정',?,?,?,?,?)",
        [req.params.id,member_id||null,member_name,start_date,end_date,months,amount,payment_method]);
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }
  res.json({ message: '배정 완료' });
});

// 락커 기간(등록일~마감일)만 정정. 배정/연장과 달리 결제가 발생하지 않는 단순 날짜
// 수정이라 locker_history에는 남기지 않는다 (남기면 매출 목록에 0원짜리 락커 항목이
// 잡히고, 관리 화면 배지가 '배정'이 아닌 모든 action을 '반납'으로 표시해 오해를 준다).
router.patch('/api/lockers/:id/dates', requireAdmin, async (req, res) => {
  const { start_date, end_date } = req.body;
  const locker = await db.get('SELECT * FROM lockers WHERE id=?', [req.params.id]);
  if (!locker) return res.status(404).json({ error: '락커를 찾을 수 없습니다' });
  if (locker.status !== 'active' || !locker.member_id) {
    return res.status(400).json({ error: '배정된 락커가 아닙니다' });
  }
  if (!start_date || !end_date || !/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
    return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)' });
  }
  if (end_date < start_date) {
    return res.status(400).json({ error: '마감일은 등록일 이후여야 합니다' });
  }
  await db.run('UPDATE lockers SET start_date=?, end_date=? WHERE id=?', [start_date, end_date, req.params.id]);
  res.json({ message: '락커 기간이 수정되었습니다' });
});

router.post('/api/lockers/:id/extend', requireAdmin, async (req, res) => {
  const { months,new_end_date,amount,payment_method } = req.body;
  const locker = await db.get('SELECT * FROM lockers WHERE id=?', [req.params.id]);
  if (!locker) return res.status(404).json({ error: '락커를 찾을 수 없습니다' });
  await db.withTransaction(async (tx) => {
    await tx.run('UPDATE lockers SET end_date=?, months=months+? WHERE id=?', [new_end_date,months,req.params.id]);
    await tx.run("INSERT INTO locker_history (locker_id,member_id,member_name,action,end_date,months,amount,payment_method) VALUES (?,?,?,'연장',?,?,?,?)",
      [req.params.id,locker.member_id||null,locker.member_name,new_end_date,months,amount,payment_method]);
  });
  res.json({ message: '연장 완료', new_end_date });
});

router.delete('/api/lockers/:id', requireAdmin, async (req, res) => {
  const locker = await db.get('SELECT * FROM lockers WHERE id=?', [req.params.id]);
  const refund = parseInt(req.body?.refund_amount) || 0;
  await db.withTransaction(async (tx) => {
    if (locker?.member_name) {
      await tx.run("INSERT INTO locker_history (locker_id,member_id,member_name,action,amount) VALUES (?,?,?,'반납',?)",
        [req.params.id,locker.member_id||null,locker.member_name, refund ? -Math.abs(refund) : 0]);
    }
    await tx.run("UPDATE lockers SET member_id=NULL,member_name=NULL,start_date=NULL,end_date=NULL,months=NULL,amount=NULL,payment_method=NULL,status='empty' WHERE id=?",
      [req.params.id]);
  });
  res.json({ message: '반납 완료' });
});

module.exports = router;
