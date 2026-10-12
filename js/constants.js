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

// 영양 균형 판단 임계값 — CLAUDE.md 5장 '초안'이라 여기 한 곳에서만 고친다
const BALANCE_RULES = {
  limitKeys: ['sodium', 'sugars', 'fat', 'sat_fat', 'cholesterol'], // 많이 먹을수록 주의하는 제한 영양소
  caution: 0.8, // 기준의 80% 이상 → '주의' (등급에는 세지 않음, 사용자 결정 2026-10-12)
  over: 1.0, // 100% 이상 → '넘었어요'
  severe: 1.5, // 제한 영양소 하나라도 150% 이상 → 바로 '불균형'
  caloriesOver: 1.1, // 열량은 권장량의 110% 초과부터 '넘었어요'
  mildMax: 2, // 걸리는 항목 1~2개 '약간 불균형', 3개 이상 '불균형'
};

const BALANCE_GRADES = {
  good: '균형',
  mild: '약간 불균형',
  bad: '불균형',
};

// 다음 끼니 제안 한 줄 — AI가 아니라 고정 문구. 처방처럼 들리지 않게 "~해 봐도 좋아요" 톤 (7장)
const NEXT_MEAL_TIPS = {
  sodium: '다음 끼니는 국물을 조금 남겨 봐도 좋아요.',
  sugars: '다음엔 단 음료 대신 물이나 차를 골라 봐도 좋아요.',
  fat: '다음 끼니는 튀김보다 구이·찜 메뉴도 괜찮아요.',
  sat_fat: '다음 끼니는 튀김보다 구이·찜 메뉴도 괜찮아요.',
  cholesterol: '다음 끼니엔 채소가 든 메뉴를 곁들여 봐도 좋아요.',
  calories: '다음 끼니는 가볍게 골라 봐도 좋아요.',
  protein: '다음 끼니에 달걀·두유·닭가슴살 같은 단백질을 곁들여 봐요.',
  none: '지금처럼 골고루 챙겨 먹어요.',
};

// ---------- 캐릭터 · 식사 알림 · 성장 (CLAUDE.md 8장) ----------
// 캐릭터는 '기록 습관'에만 반응한다 — 먹은 양으로 칭찬하거나 시무룩해지지 않는다
const MAIN_MEALS = ['breakfast', 'lunch', 'dinner']; // 알림·'세 끼 모두'는 이 셋만
const HABIT_MESSAGES = {
  none: '배고파요… 오늘 첫 기록을 기다리는 중',
  breakfast: '든든하게 시작했어요!',
  lunch: '점심도 챙겼네요',
  dinner: '저녁까지 챙겼네요',
  snack: '간식도 잊지 않고 기록했어요',
  drink: '음료도 잊지 않고 기록했어요',
  late_night: '야식도 잊지 않고 기록했어요',
  etc: '오늘도 차곡차곡 기록하고 있어요.',
  allThree: '오늘 세 끼 모두 기록 완료! 🎉',
};

// 식사 알림의 '○○ 기록하기'로 열 때 채울 시간 (지금 시각이면 아침 기록이 오후 시간으로 들어가므로)
const MEAL_DEFAULT_TIMES = { breakfast: '08:00', lunch: '12:30', dinner: '18:30' };

// '오늘은 안 먹었어요' 기록은 이보다 오래되면 지운다 (계속 쌓이지 않게)
const DISMISSED_KEEP_DAYS = 30;

// 성장 단계: 기록한 날 수 '누적' (하루 빠져도 내려가지 않음, 사용자 결정 2026-10-12)
const GROWTH_STAGES = [
  { days: 1, label: '씨앗', img: 'stage1-seed', grow: '씨앗이 생겨요' },
  { days: 3, label: '새싹', img: 'stage2-sprout', grow: '새싹이 돋아요' },
  { days: 7, label: '잎', img: 'stage3-leaf', grow: '잎이 자라요' },
  { days: 14, label: '꽃', img: 'stage4-flower', grow: '꽃이 펴요' },
  { days: 30, label: '열매', img: 'stage5-fruit', grow: '열매가 열려요' },
];

// 최근 음식 다시 담기: 최근 30일 안에 자주 먹은 순(같으면 최근 순)으로 최대 10개
const RECENT_FOODS = { limit: 10, days: 30 };

// 먹은 양 배수 허용 범위 — 성분표가 100g당일 때 큰 용량(예: 1.5L 음료 = 15배)도 담을 수 있게 20배까지
const MULTIPLIER_LIMITS = { min: 0.1, max: 20 };

// ---------- 사진 자동 분석 (Gemini, CLAUDE.md 6장) ----------
// 모델은 이 상수 하나만 바꾸면 된다 (2026-10-12 공식 문서에서 Stable 확인)
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// 보내기 전에 사진을 줄인다: 전송 시간·무료 한도를 아끼고, 성분표 숫자를 읽기엔 충분한 크기
const PHOTO_MAX_SIDE = 1280;
const PHOTO_JPEG_QUALITY = 0.85;

// 이보다 낮으면 '확신 낮음 · 꼭 확인해 주세요' 표시
const LOW_CONFIDENCE = 0.5;
