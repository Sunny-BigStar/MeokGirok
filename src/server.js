// `npm run start:mock` (또는 --mock): API 키 없이 가짜 분석 결과로 UI 확인
if (process.argv.includes('--mock')) process.env.ANALYZE_MOCK = '1';
const { app } = await import('./app.js');

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`먹기록 실행 중: http://localhost:${port}`));
