const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

router.get('/api/counts', requireAdmin, async (req, res) => {
  const counts = await db.all(`
    SELECT m.id as member_id, m.name, m.phone,
      r.id as reg_id, r.remaining_count, r.amount, r.start_date,
      (SELECT COUNT(*) FROM count_usage u WHERE u.registration_id = r.id) as used_count
    FROM members m
    JOIN member_registrations r ON r.member_id = m.id
    WHERE r.reg_type = '횟수권'
    ORDER BY r.remaining_count DESC, m.name
  `);
  res.json(counts);
});

// 횟수권 사용 이력
router.get('/api/counts/:reg_id/usage', requireAdmin, async (req, res) => {
  const usage = await db.all(
    'SELECT * FROM count_usage WHERE registration_id = ? ORDER BY used_date DESC, id DESC',
    [req.params.reg_id]
  );
  res.json(usage);
});

// 횟수권 사용 추가
router.post('/api/counts/:reg_id/use', requireAdmin, async (req, res) => {
  const { used_date, memo } = req.body;
  const reg = await db.get('SELECT * FROM member_registrations WHERE id = ?', [req.params.reg_id]);
  if (!reg) return res.status(404).json({ error: '횟수권 정보를 찾을 수 없습니다' });
  if ((reg.remaining_count || 0) <= 0) return res.status(400).json({ error: '잔여 횟수가 없습니다' });

  const member = await db.get('SELECT * FROM members WHERE id = ?', [reg.member_id]);

  const newCount = reg.remaining_count - 1;

  await db.withTransaction(async (tx) => {
    await tx.run('INSERT INTO count_usage (member_id, registration_id, member_name, used_date, memo) VALUES (?,?,?,?,?)',
      [reg.member_id, reg.id, member?.name||'', used_date, memo||null]);

    await tx.run('UPDATE member_registrations SET remaining_count=? WHERE id=?', [newCount, reg.id]);

    if (newCount <= 0) {
      await tx.run('UPDATE member_registrations SET is_current=0 WHERE id=?', [reg.id]);
      await tx.run("UPDATE members SET status='inactive' WHERE id=?", [reg.member_id]);
    }
  });

  res.json({ message: '사용 처리 완료', remaining: newCount });
});

// 횟수권 사용 취소
router.delete('/api/counts/usage/:usage_id', requireAdmin, async (req, res) => {
  const usage = await db.get('SELECT * FROM count_usage WHERE id = ?', [req.params.usage_id]);
  if (!usage) return res.status(404).json({ error: '사용 이력을 찾을 수 없습니다' });

  await db.withTransaction(async (tx) => {
    await tx.run('DELETE FROM count_usage WHERE id = ?', [req.params.usage_id]);
    await tx.run('UPDATE member_registrations SET remaining_count=remaining_count+1 WHERE id=?', [usage.registration_id]);
    await tx.run('UPDATE member_registrations SET is_current=1 WHERE id=?', [usage.registration_id]);
    await tx.run("UPDATE members SET status='active' WHERE id=?", [usage.member_id]);
  });

  res.json({ message: '취소 완료' });
});

module.exports = router;
