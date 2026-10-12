// 먹기록 상수 모음 — 기준값·계수는 여기 한 곳에서만 관리한다 (CLAUDE.md 5장)

const STORAGE_KEYS = {
  profile: 'meokgirok.profile',
  entries: 'meokgirok.entries',
  apiKey: 'meokgirok.apiKey',
  dismissed: 'meokgirok.dismissed',
};

// 활동계수 (Mifflin-St Jeor 결과에 곱함)
const ACTIVITY_LEVELS = [
  { key: 'sedentary', factor: 1.2, label: '거의 안 움직여요', desc: '앉아서 공부·생활이 대부분' },
  { key: 'light', factor: 1.375, label: '가볍게 움직여요', desc: '가벼운 운동 주 1~3회' },
  { key: 'moderate', factor: 1.55, label: '보통이에요', desc: '운동 주 3~5회' },
  { key: 'active', factor: 1.725, label: '활발해요', desc: '운동 주 6~7회' },
  { key: 'very_active', factor: 1.9, label: '매우 활발해요', desc: '매일 고강도 운동·육체노동' },
];

// 입력 허용 범위 — 계산식이 의미 있는 범위로 제한해 오타를 걸러낸다
const PROFILE_LIMITS = {
  age: { min: 10, max: 100, unit: '세' },
  height: { min: 100, max: 230, unit: 'cm' },
  weight: { min: 25, max: 250, unit: 'kg' },
};

// 1일 영양성분 기준치 — 「식품 등의 표시·광고에 관한 법률 시행규칙」 [별표 5] (2,000 kcal 기준)
// 열량은 프로필로 계산하므로 여기 없음. 트랜스지방은 기준치가 없어 null.
const NUTRITION_STANDARDS = {
  sugars: 100, // g
  sodium: 2000, // mg
  carbs: 324, // g
  fat: 54, // g
  sat_fat: 15, // g
  cholesterol: 300, // mg
  trans_fat: null, // g, 기준치 없음
  proteinPerKg: { min: 0.8, max: 1.2 }, // 단백질 목표범위 = 몸무게 × 배수
  source: '식품 등의 표시·광고에 관한 법률 시행규칙 [별표 5] 1일 영양성분 기준치',
};
