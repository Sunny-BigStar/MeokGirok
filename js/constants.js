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

// 식사 종류 — 저장은 key로, 화면엔 label로
const MEAL_TYPES = [
  { key: 'breakfast', label: '아침', icon: 'sunrise' },
  { key: 'lunch', label: '점심', icon: 'sun' },
  { key: 'dinner', label: '저녁', icon: 'sunset' },
  { key: 'snack', label: '간식', icon: 'cookie' },
  { key: 'late_night', label: '야식', icon: 'moon' },
  { key: 'drink', label: '음료', icon: 'cup' },
  { key: 'etc', label: '기타', icon: 'dish' },
];

// 식사 시간대 (기기 현지 시각, 시 단위·끝 시각 포함). 간식·음료·기타는 시간대 없음
// 야식은 자정을 넘기므로 start > end
const MEAL_TIME_SLOTS = {
  breakfast: { start: 5, end: 10 },
  lunch: { start: 11, end: 15 },
  dinner: { start: 16, end: 20 },
  late_night: { start: 21, end: 4 },
};

// 영양소 9개 — 입력 폼·환산·표시가 모두 이 목록을 따른다
// decimals: 저장 시 반올림 자릿수 (kcal·mg은 정수, g은 소수 첫째 자리)
const NUTRIENT_FIELDS = [
  { key: 'calories', label: '열량', unit: 'kcal', decimals: 0 },
  { key: 'carbs', label: '탄수화물', unit: 'g', decimals: 1 },
  { key: 'sugars', label: '당류', unit: 'g', decimals: 1 },
  { key: 'protein', label: '단백질', unit: 'g', decimals: 1 },
  { key: 'fat', label: '지방', unit: 'g', decimals: 1 },
  { key: 'sat_fat', label: '포화지방', unit: 'g', decimals: 1 },
  { key: 'trans_fat', label: '트랜스지방', unit: 'g', decimals: 1 },
  { key: 'cholesterol', label: '콜레스테롤', unit: 'mg', decimals: 0 },
  { key: 'sodium', label: '나트륨', unit: 'mg', decimals: 0 },
];

// 입력 방식 — 저장은 key(source), 식사 기록 줄에는 아이콘으로 표시 (사진은 저장하지 않으므로 썸네일 대신)
const INPUT_SOURCES = {
  label: { label: '성분표', icon: 'label' },
  photo: { label: '음식 사진', icon: 'camera' },
  manual: { label: '직접 입력', icon: 'pencil' },
  relog: { label: '최근 음식', icon: 'clock' },
};

// 영양소별 색 — 막대·타일 공통 (시안 ui-final.png와 같게, CLAUDE.md 8-1)
const NUTRIENT_COLORS = {
  carbs: '#5b8def', // 파랑
  protein: '#f2994a', // 주황
  fat: '#eb6b5e', // 빨강
  sugars: '#a78bda', // 보라
  sodium: '#8ea64f', // 초록
};

// 내 정보 '나의 영양 기준'·오늘 영양 요약 막대에 보이는 5개 (나머지는 펼쳐보기)
const MAIN_NUTRIENTS = ['carbs', 'protein', 'fat', 'sugars', 'sodium'];

// 먹은 양 배수 허용 범위
const MULTIPLIER_LIMITS = { min: 0.1, max: 10 };
