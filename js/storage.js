// localStorage 읽기/쓰기 — 서버 없이 기기에만 저장한다

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.profile);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    // 손상된 값이면 없는 것으로 보고 초기설정을 다시 받는다
    return null;
  }
}

function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
}
