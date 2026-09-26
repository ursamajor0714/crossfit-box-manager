const express = require('express');
const router = express.Router();
const db = require('../db');
const {
  ADMIN_PASSWORD, adminTokens, loginAttempts, MAX_LOGIN_ATTEMPTS, LOGIN_LOCK_MS, ADMIN_TOKEN_TTL_MS,
  contractTokens, CONTRACT_TOKEN_TTL_MS, issueMemberToken, requireAdmin, getAdminSession,
} = require('../middleware/auth');
const { PERMISSION_TREE, ALL_KEYS } = require('../permissions');

// 저장된 권한 문자열을 배열로. 깨진 값이 들어 있으면 아무 권한도 없는 것으로 본다.
// 기본 비밀번호 = 전화번호 뒷 4자리 (회원 로그인과 같은 규칙)
function defaultPasswordOf(member) {
  return member.phone ? String(member.phone).replace(/[^0-9]/g, '').slice(-4) : '';
}

function parsePerms(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr.filter(k => ALL_KEYS.includes(k)) : [];
  } catch (e) { return []; }
}
const { hashPassword, verifyPassword, isHashed, safeCompare } = require('../utils/password');

router.post('/api/admin/login', async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = loginAttempts.get(ip) || { count: 0, lockUntil: 0 };

  // 잠금 중이면 차단
  if (rec.lockUntil && rec.lockUntil > now) {
    const mins = Math.ceil((rec.lockUntil - now) / 60000);
    return res.status(429).json({ error: `로그인 시도가 너무 많습니다. ${mins}분 후 다시 시도해주세요.` });
  }

  const { password } = req.body;

  const issue = (session) => {
    loginAttempts.delete(ip); // 성공 시 초기화
    const token = require('crypto').randomBytes(24).toString('hex');
    adminTokens.set(token, { exp: Date.now() + ADMIN_TOKEN_TTL_MS, ...session });
    res.cookie('adminToken', token, {
      maxAge: ADMIN_TOKEN_TTL_MS,
      httpOnly: true,
      sameSite: 'Strict',
      path: '/'
    });
    return token;
  };

  const fail = (msg) => {
    rec.count += 1;
    if (rec.count >= MAX_LOGIN_ATTEMPTS) {
      rec.lockUntil = now + LOGIN_LOCK_MS;
      rec.count = 0;
      loginAttempts.set(ip, rec);
      return res.status(429).json({ error: `비밀번호 ${MAX_LOGIN_ATTEMPTS}회 오류로 10분간 잠겼습니다.` });
    }
    loginAttempts.set(ip, rec);
    return res.status(401).json({ error: msg || `비밀번호가 일치하지 않습니다. (남은 시도: ${MAX_LOGIN_ATTEMPTS - rec.count}회)` });
  };

  if (!password) return fail('비밀번호를 입력해주세요.');

  // 1) 사장님 비밀번호
  if (ADMIN_PASSWORD && safeCompare(password, ADMIN_PASSWORD)) {
    const token = issue({ role: 'owner', perms: ALL_KEYS });
    return res.json({ ok: true, token, role: 'owner', name: '관리자' });
  }

  // 2) 코치(부운영자) 본인 비밀번호 — 이름 없이 비밀번호만으로 누구인지 가린다.
  //    비밀번호를 아직 안 바꾼 코치는 전화번호 뒷 4자리로 들어오되, 들어오자마자 변경창이 뜬다
  //    (must_change_password). 4자리 숫자는 약하므로 바꾸기 전까지 계속 뜬다.
  const staffs = await db.all("SELECT * FROM members WHERE is_staff=1");
  const matched = staffs.filter(m => m.password
    ? verifyPassword(password, m.password)
    : !!defaultPasswordOf(m) && safeCompare(password, defaultPasswordOf(m)));

  if (matched.length > 1) {
    // 두 사람이 같은 비밀번호를 쓰면 누구인지 정할 수 없다. 로그인시키지 않고 바꾸게 한다.
    return res.status(409).json({ error: '같은 비밀번호를 쓰는 계정이 둘 이상입니다. 관리자에게 비밀번호 변경을 요청해주세요.' });
  }

  if (matched.length === 1) {
    const staff = matched[0];
    // 예전에 평문으로 저장된 비밀번호였다면 이번 로그인에서 해시로 바꿔 둔다
    if (staff.password && !isHashed(staff.password)) {
      await db.run('UPDATE members SET password=? WHERE id=?', [hashPassword(password), staff.id]);
    }
    // 아직 기본 비밀번호(전화번호 뒷 4자리)를 쓰고 있으면 화면에서 변경창을 강제로 띄운다
    const mustChange = !staff.password || !!staff.must_change_password;
    const token = issue({ role: 'staff', member_id: staff.id, name: staff.name,
      perms: parsePerms(staff.permissions), must_change_password: mustChange });
    return res.json({ ok: true, token, role: 'staff', name: staff.name, must_change_password: mustChange });
  }

  return fail();
});

router.post('/api/admin/logout', (req, res) => {
  res.clearCookie('adminToken', { path: '/' });
  res.json({ ok: true });
});

router.post('/api/contract/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = loginAttempts.get('contract:'+ip) || { count: 0, lockUntil: 0 };
  if (rec.lockUntil && rec.lockUntil > now) {
    const mins = Math.ceil((rec.lockUntil - now) / 60000);
    return res.status(429).json({ error: `시도가 너무 많습니다. ${mins}분 후 다시 시도해주세요.` });
  }
  const { password } = req.body;
  if (ADMIN_PASSWORD && password && safeCompare(password, ADMIN_PASSWORD)) {
    loginAttempts.delete('contract:'+ip);
    const token = require('crypto').randomBytes(24).toString('hex');
    contractTokens.set(token, Date.now() + CONTRACT_TOKEN_TTL_MS);
    res.json({ ok: true, token });
  } else {
    rec.count += 1;
    if (rec.count >= MAX_LOGIN_ATTEMPTS) {
      rec.lockUntil = now + LOGIN_LOCK_MS; rec.count = 0;
      loginAttempts.set('contract:'+ip, rec);
      return res.status(429).json({ error: `비밀번호 ${MAX_LOGIN_ATTEMPTS}회 오류로 10분간 잠겼습니다.` });
    }
    loginAttempts.set('contract:'+ip, rec);
    res.status(401).json({ error: `비밀번호가 일치하지 않습니다. (남은 시도: ${MAX_LOGIN_ATTEMPTS - rec.count}회)` });
  }
});

router.post('/api/member/login', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const key = 'member:' + ip;
  const rec = loginAttempts.get(key) || { count: 0, lockUntil: 0 };

  // 잠금 중이면 차단 (전화번호 뒷 4자리 기본 비밀번호는 경우의 수가 적어 무차별 대입에 취약하므로 반드시 제한)
  if (rec.lockUntil && rec.lockUntil > now) {
    const mins = Math.ceil((rec.lockUntil - now) / 60000);
    return res.status(429).json({ error: `로그인 시도가 너무 많습니다. ${mins}분 후 다시 시도해주세요.` });
  }

  const fail = () => {
    rec.count += 1;
    if (rec.count >= MAX_LOGIN_ATTEMPTS) {
      rec.lockUntil = now + LOGIN_LOCK_MS;
      rec.count = 0;
      loginAttempts.set(key, rec);
      return res.status(429).json({ error: `비밀번호 ${MAX_LOGIN_ATTEMPTS}회 오류로 10분간 잠겼습니다.` });
    }
    loginAttempts.set(key, rec);
    return res.status(401).json({ error: '비밀번호가 일치하지 않습니다' });
  };

  const { name, password } = req.body;
  const member = await db.get('SELECT * FROM members WHERE name = ?', [name]);
  if (!member) return fail();

  // 기본 비밀번호: 전화번호 뒷 4자리 (password 컬럼이 비어있으면)
  const defaultPw = member.phone ? member.phone.replace(/[^0-9]/g, '').slice(-4) : '';

  let ok;
  if (member.password) {
    ok = verifyPassword(password, member.password);
    // 레거시 평문 비밀번호였다면 로그인 성공 시 해시로 자동 마이그레이션
    if (ok && !isHashed(member.password)) {
      await db.run('UPDATE members SET password=? WHERE id=?', [hashPassword(password), member.id]);
    }
  } else {
    ok = !!defaultPw && safeCompare(password || '', defaultPw);
  }

  if (!ok) return fail();

  loginAttempts.delete(key); // 성공 시 초기화
  const token = issueMemberToken(member.id);
  res.json({
    id: member.id, name: member.name, token, message: '로그인 성공',
    must_change_password: !!member.must_change_password,
  });
});

// 지금 로그인한 사람이 누구이고 어디까지 볼 수 있는지 — 관리자 화면이 탭을 그릴 때 쓴다
router.get('/api/admin/me', requireAdmin, (req, res) => {
  const s = getAdminSession(req);
  res.json({
    role: s.role,
    name: s.role === 'owner' ? '관리자' : s.name,
    member_id: s.member_id || null,
    perms: s.role === 'owner' ? ALL_KEYS : (s.perms || []),
    must_change_password: !!s.must_change_password,
    tree: PERMISSION_TREE,
  });
});

module.exports = router;
