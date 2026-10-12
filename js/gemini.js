// Gemini 사진 분석 — 브라우저 fetch로 REST 직접 호출 (SDK 없음, CLAUDE.md 6장)
// 사진 1장 = 호출 1번. 성분표인지 음식인지 분류와 영양성분을 한 번에 받는다.

const NUTRIENT_KEYS = NUTRIENT_FIELDS.map((f) => f.key);
const BASIS_TYPES = ['total', 'per_100g', 'per_serving', 'estimate'];

// 응답 형식을 JSON 스키마로 강제 — 형식이 어긋난 답을 화면에 그대로 쓰지 않기 위해
const NUM_OR_NULL = { type: 'NUMBER', nullable: true };
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    kind: { type: 'STRING', enum: ['label', 'food', 'unknown'] },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          name_guessed: { type: 'BOOLEAN' }, // 성분표에 제품명이 없어 보이는 글자로 추정한 이름인지
          basis_type: { type: 'STRING', enum: BASIS_TYPES },
          basis_amount_g: NUM_OR_NULL,
          total_amount_g: NUM_OR_NULL,
          confidence: { type: 'NUMBER' },
          ...Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, NUM_OR_NULL])),
        },
        required: ['name', 'name_guessed', 'basis_type', 'confidence', ...NUTRIENT_KEYS],
      },
    },
  },
  required: ['kind', 'items'],
};

// 프롬프트: 성분표는 읽기만(추정 금지), 음식은 1인분 추정, 모르는 값은 null (6장)
function buildGeminiPrompt(forcedKind) {
  const force =
    forcedKind === 'label'
      ? '\n사용자가 이 사진은 "영양성분표"라고 알려줬다. kind는 반드시 "label"로 하고 표의 숫자를 읽어라.'
      : forcedKind === 'food'
        ? '\n사용자가 이 사진은 "음식 사진"이라고 알려줬다. kind는 반드시 "food"로 하고 음식을 추정하라.'
        : '';
  return `너는 한국 편의점 음식 기록 앱의 영양 분석기다. 사진을 보고 JSON으로만 답한다.

1) kind를 정한다.
- "label": 영양성분표(영양정보 표)가 보이는 사진
- "food": 음식·음료 자체가 보이는 사진
- "unknown": 둘 다 아닌 사진 (이때 items는 빈 배열)

2) kind가 "label"이면:
- 표에 인쇄된 숫자를 그대로 읽는다. 절대 추정하거나 계산해서 채우지 않는다.
- 읽을 수 없거나 표에 없는 항목은 null. 0으로 채우지 않는다.
- name: 사진에 제품명이 보이면 그 제품명 (name_guessed: false).
  제품명이 안 보이면(성분표는 보통 포장 뒷면) 원재료명·브랜드·제조사·총 내용량 등 보이는 글자로 어떤 음식인지 짧게 추정한다
  (예: 원재료에 면·스프·건더기 → "컵라면", 밥·김·참치마요 → "삼각김밥"). 이때 name_guessed: true.
  추정도 어려우면 빈 문자열 "" (name_guessed: false).
- basis_type: 표의 기준이 "총 내용량당"이면 "total", "100g당"(100ml당 포함)이면 "per_100g", "1회 제공량당"이면 "per_serving".
- basis_amount_g: 표의 기준량(g 또는 ml). 100g당이면 100. 모르면 null.
- total_amount_g: 총 내용량(g 또는 ml). 모르면 null.
- items는 보통 1개.

3) kind가 "food"이면:
- 어떤 음식인지 한국어 이름을 붙인다 (예: "삼각김밥(참치마요)", "컵라면(매운맛)"). name_guessed는 false.
- 일반적인 1인분 기준으로 영양성분을 추정한다. basis_type은 "estimate", basis_amount_g와 total_amount_g는 null.
- 한 사진에 음식이 여러 개면 items를 나눈다.

4) 단위: calories kcal, sodium·cholesterol mg, 나머지(carbs, sugars, protein, fat, sat_fat, trans_fat) g.
5) confidence: 0~1 사이로 얼마나 확실한지.${force}`;
}

// 사용자에게 보여줄 말로 바꾸기 위한 오류 종류
class GeminiError extends Error {
  constructor(code, detail) {
    super(code);
    this.code = code; // no_key | bad_key | quota | model | network | server | bad_response | blocked
    this.detail = detail || '';
  }
}

const GEMINI_ERROR_TEXT = {
  no_key: '음식 사진 분석에는 Gemini API 키가 필요해요. 내 정보에서 키를 넣거나 직접 입력해 주세요.',
  bad_key: 'API 키가 올바르지 않아요. 내 정보에서 다시 확인해 주세요.',
  quota: '오늘 무료 사용량을 다 썼거나 잠시 요청이 많아요. 잠시 후 다시 시도하거나 직접 입력해 주세요.',
  model: '분석 모델을 찾을 수 없어요. 잠시 후 다시 시도하거나 직접 입력해 주세요.',
  network: '인터넷 연결을 확인해 주세요. 연결되면 다시 시도할 수 있어요.',
  server: 'Gemini 쪽에 잠시 문제가 있어요. 잠시 후 다시 시도해 주세요.',
  bad_response: '분석 결과를 읽지 못했어요. 다시 시도하거나 직접 입력해 주세요.',
  blocked: '이 사진은 분석할 수 없어요. 다른 사진을 올리거나 직접 입력해 주세요.',
  image: '사진을 열 수 없어요. 다른 사진을 골라 주세요.',
};

function statusToErrorCode(status, message) {
  if (status === 400 && /api key/i.test(message)) return 'bad_key';
  if (status === 401 || status === 403) return 'bad_key';
  if (status === 404) return 'model';
  if (status === 429) return 'quota';
  if (status >= 500) return 'server';
  return 'bad_response';
}

// 숫자는 0 이상 유한수만, 아니면 null (모르는 값을 0으로 만들지 않음)
function cleanNumber(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

function cleanAmount(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

// 모델 답을 그대로 믿지 않고 앱에서 쓸 수 있는 형태로 정리한다
function normalizeAnalysis(raw, forcedKind) {
  let kind = ['label', 'food', 'unknown'].includes(raw && raw.kind) ? raw.kind : 'unknown';
  if (forcedKind && kind !== 'unknown') kind = forcedKind;
  const list = Array.isArray(raw && raw.items) ? raw.items : [];
  const items = list
    .filter((it) => it && typeof it === 'object')
    .map((it) => {
      const nutrients = {};
      for (const k of NUTRIENT_KEYS) nutrients[k] = cleanNumber(it[k]);
      let basisType = BASIS_TYPES.includes(it.basis_type) ? it.basis_type : kind === 'label' ? 'per_serving' : 'estimate';
      if (kind === 'food') basisType = 'estimate';
      let basisAmount = cleanAmount(it.basis_amount_g);
      const totalAmount = cleanAmount(it.total_amount_g);
      if (basisType === 'per_100g') basisAmount = 100;
      if (basisType === 'total') basisAmount = totalAmount || basisAmount;
      const conf = typeof it.confidence === 'number' && Number.isFinite(it.confidence) ? Math.min(Math.max(it.confidence, 0), 1) : 0.5;
      const name = typeof it.name === 'string' ? it.name.trim().slice(0, 40) : '';
      return {
        name,
        // 성분표에서 보이는 글자로 추정한 이름 → 화면에 '(추정)' 표시 (6장). 음식 사진은 원래 추정이라 따로 표시 안 함
        nameGuessed: kind === 'label' && it.name_guessed === true && name !== '',
        basisType,
        basisAmount: basisType === 'estimate' ? null : basisAmount,
        totalAmount: basisType === 'estimate' ? null : totalAmount,
        confidence: conf,
        nutrients,
      };
    })
    // 열량조차 없는 항목은 담을 수 없으므로 뺀다 (직접 입력으로 보완)
    .filter((it) => it.nutrients.calories !== null || kind === 'label');
  if (kind !== 'unknown' && items.length === 0) kind = 'unknown';
  return { kind, items: kind === 'unknown' ? [] : items };
}

/**
 * 사진 1장 분석. image: { base64, mimeType }, opts: { forcedKind?: 'label'|'food' }
 * 성공하면 { kind, items }, 실패하면 GeminiError를 던진다.
 */
async function analyzePhoto(image, opts = {}) {
  const key = loadApiKey();
  if (!key) throw new GeminiError('no_key');

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: buildGeminiPrompt(opts.forcedKind) }, { inline_data: { mime_type: image.mimeType, data: image.base64 } }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_SCHEMA,
      temperature: 0.2, // 성분표 숫자를 읽을 때 들쭉날쭉하지 않게
    },
  };

  let res;
  try {
    // 키는 URL이 아니라 헤더로 보낸다 (주소창·기록에 남지 않게)
    res = await fetch(`${GEMINI_ENDPOINT}/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new GeminiError('network', e.message);
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (!res.ok) {
    const message = (data && data.error && data.error.message) || '';
    throw new GeminiError(statusToErrorCode(res.status, message), message);
  }

  const candidate = data && data.candidates && data.candidates[0];
  if (!candidate) {
    if (data && data.promptFeedback && data.promptFeedback.blockReason) throw new GeminiError('blocked');
    throw new GeminiError('bad_response');
  }
  const text = ((candidate.content && candidate.content.parts) || []).map((p) => p.text || '').join('');
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new GeminiError('bad_response', text.slice(0, 200));
  }
  return normalizeAnalysis(raw, opts.forcedKind);
}
