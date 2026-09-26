// ─── 관리자 인증 ─────────────────────────────────────

// 관리자 비밀번호: 반드시 환경변수 ADMIN_PASSWORD로 설정 (코드에 하드코딩 금지)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (!ADMIN_PASSWORD) {
  console.warn('[보안 경고] ADMIN_PASSWORD 환경변수가 설정되지 않았습니다. 관리자 로그인이 비활성화됩니다. 서버 실행 전 ADMIN_PASSWORD를 설정하세요.');
}
const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
// token -> { exp, role: 'owner'|'staff', member_id, name, perms[] }
// owner = 사장님(ADMIN_PASSWORD 로 로그인), staff = 코치(부운영자, 본인 이름+비밀번호로 로그인)
const adminTokens = new Map();

// 로그인 시도 제한 (IP별, 메모리 기반)
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 10 * 60 * 1000; // 5회 실패 시 10분 잠금
const loginAttempts = new Map(); // ip -> { count, lockUntil }

function getCookie(req, name) {
  const rc = req.headers.cookie;
  if (!rc) return null;
  const cookies = rc.split(';');
  for (let i = 0; i < cookies.length; i++) {
    const parts = cookies[i].split('=');
    const key = parts[0].trim();
    if (key === name) {
      return decodeURIComponent(parts.slice(1).join('='));
    }
  }
  return null;
}

function getAdminSession(req) {
  let token = null;
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    token = auth.slice(7);
  } else {
    token = getCookie(req, 'adminToken');
  }
  if (!token) return null;
  const rec = adminTokens.get(token);
  if (!rec || rec.exp < Date.now()) {
    if (token) adminTokens.delete(token);
    return null;
  }
  return rec;
}

function isValidAdminToken(req) {
  return !!getAdminSession(req);
}

function requireAdmin(req, res, next) {
  const s = getAdminSession(req);
  if (!s) return res.status(401).json({ error: '관리자 인증이 필요합니다' });
  req.adminSession = s;
  next();
}

// 사장님 전용 — 코치의 열람 권한을 정하는 것처럼 코치 본인이 건드리면 안 되는 작업에 쓴다
function requireOwner(req, res, next) {
  const s = getAdminSession(req);
  if (!s) return res.status(401).json({ error: '관리자 인증이 필요합니다' });
  if (s.role !== 'owner') return res.status(403).json({ error: '열람 권한이 없습니다.' });
  req.adminSession = s;
  next();
}

// ─── 회원 인증 토큰 ──────────────────────────────────
// 회원 로그인 시 토큰 발급 → 회원 전용 API는 본인 토큰이 있어야 하고,
// 요청한 :id가 토큰 주인과 일치해야만 접근 허용 (남의 id 조회 차단)
const MEMBER_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const memberTokens = new Map(); // token -> { member_id, exp }

function issueMemberToken(memberId) {
  const token = require('crypto').randomBytes(24).toString('hex');
  memberTokens.set(token, { member_id: Number(memberId), exp: Date.now() + MEMBER_TOKEN_TTL_MS });
  return token;
}

function getMemberFromToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const rec = memberTokens.get(token);
  if (!rec || rec.exp < Date.now()) { memberTokens.delete(token); return null; }
  return rec.member_id;
}

// 회원 본인 확인: 유효한 회원 토큰이 있고, URL의 :id가 토큰 주인과 같아야 통과.
// (관리자 토큰이 있으면 관리자도 접근 허용 — 관리 페이지에서 회원 정보를 봐야 하므로)
function requireSelfOrAdmin(req, res, next) {
  const admin = getAdminSession(req);
  // 사장님은 회원 관리를 해야 하므로 모두 접근 가능.
  // 코치(staff)는 관리자 토큰을 갖고 있어도 남의 회원 정보까지 건드리면 안 되므로 본인 것만 허용한다.
  if (admin) {
    if (admin.role !== 'staff') return next();
    if (String(admin.member_id) === String(req.params.id)) return next();
    return res.status(403).json({ error: '본인 정보만 볼 수 있습니다' });
  }
  const memberId = getMemberFromToken(req);
  if (memberId && String(memberId) === String(req.params.id)) return next();
  return res.status(401).json({ error: '본인 인증이 필요합니다' });
}

// 특정 member_id 값에 대해 본인(또는 관리자)인지 확인 (:id가 URL에 없는 경우용)
function isSelfOrAdminForId(req, memberId) {
  if (isValidAdminToken(req)) return true;
  const tokenMemberId = getMemberFromToken(req);
  return tokenMemberId && String(tokenMemberId) === String(memberId);
}

const contractTokens = new Map(); // token -> expiry
const CONTRACT_TOKEN_TTL_MS = 14 * 60 * 60 * 1000; // 14시간 (영업일 단위)
function requireContract(req, res, next) {
  const token = req.headers['x-contract-token'];
  if (token && contractTokens.has(token) && contractTokens.get(token) > Date.now()) return next();
  return res.status(401).json({ error: '계약서 접근 인증이 필요합니다' });
}

module.exports = {
  requireAdmin, requireOwner, requireSelfOrAdmin, requireContract, isSelfOrAdminForId, issueMemberToken,
  getAdminSession,
  ADMIN_PASSWORD, adminTokens, loginAttempts, MAX_LOGIN_ATTEMPTS, LOGIN_LOCK_MS, ADMIN_TOKEN_TTL_MS,
  contractTokens, CONTRACT_TOKEN_TTL_MS, isValidAdminToken, getCookie,
};
