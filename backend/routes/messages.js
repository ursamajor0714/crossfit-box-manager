const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin, requireSelfOrAdmin } = require('../middleware/auth');

const MESSAGE_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48시간
// DB의 created_at(KST 문자열)과 비교 가능한 KST 문자열로 변환
function kstNowStr(offsetMs = 0) {
  return new Date(Date.now() + offsetMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

// 관리자: 회원에게 보낸 전체 메시지 이력 (읽음 여부 포함, 만료 여부 무관하게 전부)
router.get('/api/members/:id/messages', requireAdmin, async (req, res) => {
  const list = await db.all('SELECT * FROM member_messages WHERE member_id=? ORDER BY created_at DESC', [req.params.id]);
  res.json(list);
});

// 관리자: 메시지 발송
router.post('/api/members/:id/messages', requireAdmin, async (req, res) => {
  const content = (req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: '메시지 내용을 입력해주세요' });
  const member = await db.get('SELECT id FROM members WHERE id=?', [req.params.id]);
  if (!member) return res.status(404).json({ error: '회원을 찾을 수 없습니다' });
  const r = await db.run('INSERT INTO member_messages (member_id, content) VALUES (?, ?) RETURNING id', [req.params.id, content]);
  res.json({ id: r.lastInsertRowid, message: '메시지를 보냈습니다' });
});

// 회원: 아직 안 읽었고 발송 48시간 이내인 메시지 1건 (오래된 순으로 하나씩)
router.get('/api/member/:id/message', requireSelfOrAdmin, async (req, res) => {
  const cutoff = kstNowStr(-MESSAGE_EXPIRY_MS);
  const msg = await db.get(
    'SELECT * FROM member_messages WHERE member_id=? AND read_at IS NULL AND created_at >= ? ORDER BY created_at ASC LIMIT 1',
    [req.params.id, cutoff]
  );
  res.json({ message: msg || null });
});

// 회원: 메시지 확인(읽음) 처리 — 확인 즉시 다음 로그인부터 다시 안 뜸
router.post('/api/member/:id/message/:msgId/read', requireSelfOrAdmin, async (req, res) => {
  const msg = await db.get('SELECT * FROM member_messages WHERE id=? AND member_id=?', [req.params.msgId, req.params.id]);
  if (!msg) return res.status(404).json({ error: '메시지를 찾을 수 없습니다' });
  await db.run(`UPDATE member_messages SET read_at=to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') WHERE id=?`, [req.params.msgId]);
  res.json({ message: '확인 처리되었습니다' });
});

module.exports = router;
