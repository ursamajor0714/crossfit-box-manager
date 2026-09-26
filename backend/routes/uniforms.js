const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

router.get('/api/uniforms', requireAdmin, async (req, res) => {
  res.json(await db.all('SELECT * FROM uniforms ORDER BY id'));
});

router.get('/api/uniforms/history', requireAdmin, async (req, res) => {
  res.json(await db.all('SELECT * FROM uniform_history ORDER BY created_at DESC LIMIT 200'));
});

// 운동복 이력 단건 삭제 (잘못 입력한 기록 정리용)
router.delete('/api/uniforms/history/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM uniform_history WHERE id=?', [req.params.id]);
  res.json({ message: '이력이 삭제되었습니다' });
});

router.post('/api/uniforms', requireAdmin, async (req, res) => {
  const { member_id,member_name,start_date,end_date,months,amount,payment_method } = req.body;
  const id = await db.withTransaction(async (tx) => {
    const r = await tx.run("INSERT INTO uniforms (member_id,member_name,start_date,end_date,months,amount,payment_method,status) VALUES (?,?,?,?,?,?,?,'active') RETURNING id",
      [member_id||null,member_name,start_date,end_date,months,amount,payment_method]);
    await tx.run("INSERT INTO uniform_history (uniform_id,member_id,member_name,action,start_date,end_date,months,amount,payment_method) VALUES (?,?,?,'등록',?,?,?,?,?)",
      [r.lastInsertRowid,member_id||null,member_name,start_date,end_date,months,amount,payment_method]);
    return r.lastInsertRowid;
  });
  res.json({ id, message: '등록 완료' });
});

router.post('/api/uniforms/:id/extend', requireAdmin, async (req, res) => {
  const { months,new_end_date,amount,payment_method } = req.body;
  const u = await db.get('SELECT * FROM uniforms WHERE id=?', [req.params.id]);
  if (!u) return res.status(404).json({ error: '운동복 정보를 찾을 수 없습니다' });
  await db.withTransaction(async (tx) => {
    await tx.run('UPDATE uniforms SET end_date=?, months=months+? WHERE id=?', [new_end_date,months,req.params.id]);
    await tx.run("INSERT INTO uniform_history (uniform_id,member_id,member_name,action,end_date,months,amount,payment_method) VALUES (?,?,?,'연장',?,?,?,?)",
      [u.id,u.member_id||null,u.member_name,new_end_date,months,amount,payment_method]);
  });
  res.json({ message: '연장 완료', new_end_date });
});

router.delete('/api/uniforms/:id', requireAdmin, async (req, res) => {
  const u = await db.get('SELECT * FROM uniforms WHERE id=?', [req.params.id]);
  const refund = parseInt(req.body?.refund_amount) || 0;
  await db.withTransaction(async (tx) => {
    if (u) {
      await tx.run("INSERT INTO uniform_history (uniform_id,member_id,member_name,action,amount) VALUES (?,?,?,'반납',?)",
        [u.id,u.member_id||null,u.member_name, refund ? -Math.abs(refund) : 0]);
    }
    await tx.run("UPDATE uniforms SET status='returned' WHERE id=?", [req.params.id]);
  });
  res.json({ message: '반납 완료' });
});

// 운동복 대여 현황에서 완전 삭제 (잘못 등록한 기록 정리용 - 행 자체를 제거)
router.delete('/api/uniforms/:id/purge', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM uniforms WHERE id=?', [req.params.id]);
  res.json({ message: '삭제되었습니다' });
});

module.exports = router;
