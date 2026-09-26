const crypto = require('crypto');

const SCRYPT_PREFIX = 'scrypt$';

// 비밀번호 해싱 (salt:hash를 scrypt$ 접두사로 저장 → 평문과 구분)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${SCRYPT_PREFIX}${salt}:${hash}`;
}

// 저장된 값이 이미 해시인지 확인 (평문 레거시 비밀번호와 구분용)
function isHashed(stored) {
  return typeof stored === 'string' && stored.startsWith(SCRYPT_PREFIX);
}

// 타이밍 공격 방지 비교 (길이가 달라도 안전하게 false 반환)
function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // 타이밍 노이즈 감소용 더미 비교
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// 비밀번호 검증: 해시면 scrypt 비교, 레거시 평문이면 safeCompare로 비교
function verifyPassword(password, stored) {
  if (!stored) return false;
  if (isHashed(stored)) {
    const [, rest] = stored.split(SCRYPT_PREFIX);
    const [salt, hash] = rest.split(':');
    const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return safeCompare(candidate, hash);
  }
  // 레거시 평문 비밀번호 (기존 데이터 호환)
  return safeCompare(String(password), stored);
}

// 비밀번호 정책: 8자 이상, 영소문자와 숫자 필수 포함 (대문자/특수문자는 사용 가능하나 필수 아님)
const PASSWORD_POLICY_HINT = '8자 이상, 영소문자와 숫자를 포함해야 합니다 (대문자·특수문자 사용 가능)';
function isValidPassword(password) {
  return typeof password === 'string' && /^(?=.*[a-z])(?=.*[0-9]).{8,}$/.test(password);
}

module.exports = { hashPassword, verifyPassword, isHashed, safeCompare, isValidPassword, PASSWORD_POLICY_HINT };
