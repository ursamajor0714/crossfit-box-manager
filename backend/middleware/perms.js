const { getAdminSession } = require('./auth');
const { requiredPerms } = require('../permissions');

// 직원(코치) 세션일 때만 동작하는 열람 권한 검사.
// 화면에서 탭을 숨기는 것만으로는 주소창이나 API 직접 호출을 막지 못하므로 서버에서도 한 번 더 본다.
// 사장님(owner)과 비로그인 요청은 그대로 통과시킨다 — 비로그인은 각 라우트의 requireAdmin이 막는다.
function permissionGate(req, res, next) {
  const s = getAdminSession(req);
  if (!s || s.role !== 'staff') return next();

  const need = requiredPerms(req.method, req.path);
  if (need === undefined || need === null) return next();

  const perms = s.perms || [];
  if (need.some(k => perms.includes(k))) return next();
  return res.status(403).json({ error: '열람 권한이 없습니다.' });
}

module.exports = { permissionGate };
