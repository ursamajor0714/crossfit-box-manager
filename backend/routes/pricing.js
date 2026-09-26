const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

router.get('/api/pricing', async (req, res) => {
  res.json(await db.all('SELECT * FROM pricing ORDER BY plan, period'));
});

router.put('/api/pricing/:id', requireAdmin, async (req, res) => {
  const { amount, label } = req.body;
  await db.run(`UPDATE pricing SET amount=?, label=?, updated_at=to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') WHERE id=?`,
    [amount, label, req.params.id]);
  res.json({ message: '가격 수정 완료' });
});

router.post('/api/pricing', requireAdmin, async (req, res) => {
  const { plan, period, amount, label } = req.body;
  const r = await db.run('INSERT INTO pricing (plan, period, amount, label) VALUES (?,?,?,?) RETURNING id', [plan, period, amount||0, label||'']);
  res.json({ id: r.lastInsertRowid, message: '추가 완료' });
});

router.delete('/api/pricing/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM pricing WHERE id=?', [req.params.id]);
  res.json({ message: '삭제 완료' });
});

module.exports = router;
