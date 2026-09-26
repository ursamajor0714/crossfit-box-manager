const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

router.get('/api/notices', async (req, res) => {
  res.json(await db.all('SELECT * FROM notices ORDER BY pinned DESC, created_at DESC'));
});

router.post('/api/notices', requireAdmin, async (req, res) => {
  const { title, content, pinned } = req.body;
  const r = await db.run('INSERT INTO notices (title, content, pinned) VALUES (?,?,?) RETURNING id', [title, content, pinned?1:0]);
  res.json({ id: r.lastInsertRowid, message: '등록 완료' });
});

router.put('/api/notices/:id', requireAdmin, async (req, res) => {
  const { title, content, pinned } = req.body;
  await db.run('UPDATE notices SET title=?, content=?, pinned=? WHERE id=?', [title, content, pinned?1:0, req.params.id]);
  res.json({ message: '수정 완료' });
});

router.delete('/api/notices/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM notices WHERE id=?', [req.params.id]);
  res.json({ message: '삭제 완료' });
});

module.exports = router;
