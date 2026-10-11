document.getElementById('f').onsubmit = async (e) => {
  e.preventDefault();
  const err = document.getElementById('err');
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: document.getElementById('pw').value }),
  });
  if (res.ok) return (location.href = '/');
  err.textContent = (await res.json().catch(() => ({}))).error || '로그인에 실패했습니다.';
  err.hidden = false;
};
