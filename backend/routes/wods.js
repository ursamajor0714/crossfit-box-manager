const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

router.get('/api/wods', requireAdmin, async (req, res) => {
  res.json(await db.all('SELECT * FROM wods ORDER BY wod_date DESC'));
});

// 특정 날짜의 WOD (공개시간 지난 것만 - 공개/회원용)
router.get('/api/wods/date/:date', async (req, res) => {
  const now = new Date(Date.now() + 9*60*60*1000).toISOString().slice(0, 19).replace('T', ' ');
  const wods = await db.all(`
    SELECT * FROM wods
    WHERE wod_date = ? AND (publish_at IS NULL OR publish_at <= ?)
    ORDER BY id DESC
  `, [req.params.date, now]);
  res.json(wods);
});

// 관리자용: 특정 날짜 WOD (공개시간 무관)
router.get('/api/wods/admin/:date', requireAdmin, async (req, res) => {
  res.json(await db.all('SELECT * FROM wods WHERE wod_date = ? ORDER BY id DESC', [req.params.date]));
});

// WOD 등록/수정 (날짜당 1개, 같은 날짜면 덮어쓰기)
router.post('/api/wods', requireAdmin, async (req, res) => {
  const { wod_date, title, content, publish_at } = req.body;
  if (!wod_date || !content) return res.status(400).json({ error: '날짜와 내용은 필수입니다' });
  const existing = await db.get('SELECT id FROM wods WHERE wod_date = ?', [wod_date]);
  if (existing) {
    await db.run('UPDATE wods SET title=?, content=?, publish_at=? WHERE id=?', [title, content, publish_at || null, existing.id]);
    res.json({ id: existing.id, message: '수정 완료' });
  } else {
    const r = await db.run("INSERT INTO wods (wod_date, wod_type, title, content, publish_at) VALUES (?, 'CrossFit', ?, ?, ?) RETURNING id",
      [wod_date, title, content, publish_at || null]);
    res.json({ id: r.lastInsertRowid, message: '등록 완료' });
  }
});

router.delete('/api/wods/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM wods WHERE id=?', [req.params.id]);
  res.json({ message: '삭제 완료' });
});

module.exports = router;
