const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

router.get('/api/calendar/events/:year/:month', async (req, res) => {
  const { year, month } = req.params;
  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const to   = `${year}-${String(month).padStart(2,'0')}-31`;
  res.json(await db.all('SELECT * FROM calendar_events WHERE event_date BETWEEN ? AND ? ORDER BY event_date', [from, to]));
});

router.post('/api/calendar/events', requireAdmin, async (req, res) => {
  const { event_date, title, type, color, memo } = req.body;
  if (!event_date || !title) return res.status(400).json({ error: '날짜와 제목은 필수입니다' });
  const r = await db.run('INSERT INTO calendar_events (event_date, title, type, color, memo) VALUES (?,?,?,?,?) RETURNING id',
    [event_date, title, type || '이벤트', color || '#e65100', memo || null]);
  res.json({ id: r.lastInsertRowid, message: '등록 완료' });
});

router.put('/api/calendar/events/:id', requireAdmin, async (req, res) => {
  const { event_date, title, type, color, memo } = req.body;
  await db.run('UPDATE calendar_events SET event_date=?, title=?, type=?, color=?, memo=? WHERE id=?',
    [event_date, title, type, color, memo, req.params.id]);
  res.json({ message: '수정 완료' });
});

router.delete('/api/calendar/events/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM calendar_events WHERE id=?', [req.params.id]);
  res.json({ message: '삭제 완료' });
});

module.exports = router;
