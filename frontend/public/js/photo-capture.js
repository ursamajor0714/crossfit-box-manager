// ============================================================
// 회원 사진 촬영 (계약서 화면 · 관리자 회원 정보 수정 화면 공용)
//
// 사진은 파일 업로드가 아니라 카메라로 직접 찍는다. 찍은 영상을 정사각형으로 가운데만 잘라
// 작은 jpeg 로 만들고, base64 문자열을 그대로 DB(members.photo / contracts.photo)에 넣는다.
// 규격을 두 화면이 각자 들고 있으면 저장 크기가 갈라지므로 여기 한 곳에서만 정한다.
// ============================================================

const PHOTO_SIZE = 320;        // 320x320 정사각형
const PHOTO_QUALITY = 0.7;     // jpeg 품질 — 한 장에 약 20~30KB

// 카메라를 켜서 미리보기 영역에 <video> 를 붙인다. 성공하면 stream 을 돌려준다.
// facing: 'user'(전면) | 'environment'(후면)
async function openSquareCamera(previewEl, facing) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
  previewEl.innerHTML = '';
  const video = document.createElement('video');
  video.autoplay = true; video.playsInline = true; video.muted = true; video.srcObject = stream;
  // 전면카메라는 거울처럼 보여주기 (보기 편함). 저장 시엔 정방향으로 되돌림
  if (facing === 'user') video.classList.add('mirror');
  previewEl.appendChild(video);
  previewEl._video = video;
  return stream;
}

// 지금 미리보기에 떠 있는 영상을 정사각형으로 잘라 base64 jpeg 로 만든다.
function captureSquarePhoto(previewEl, facing) {
  const video = previewEl._video;
  if (!video) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext('2d');
  const s = Math.min(video.videoWidth, video.videoHeight);          // 정사각 크롭
  const sx = (video.videoWidth - s) / 2, sy = (video.videoHeight - s) / 2;
  // 전면카메라는 미리보기를 거울로 보여줬으므로, 저장 시 좌우를 뒤집어 정방향으로 맞춤
  if (facing === 'user') { ctx.translate(PHOTO_SIZE, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, sx, sy, s, s, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  return canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
}

function stopStream(stream) {
  if (stream) stream.getTracks().forEach(t => t.stop());
  return null;
}
