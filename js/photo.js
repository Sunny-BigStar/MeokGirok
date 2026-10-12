// 기록하기 화면의 사진 업로드 + AI 분석 카드 (CLAUDE.md 4-2, 6장)
// 사진은 이 화면에서만 미리보기로 보여주고 어디에도 저장하지 않는다

let photos = []; // { id, previewUrl, image, status: loading|done|error, kind, items, results, errorCode, forcedKind }
let photoGeneration = 0; // 끼니 화면을 새로 열면 늘어남 → 늦게 도착한 분석 결과를 버리기 위해
let reanalyzeTarget = null; // '다른 사진으로 재분석'을 누른 카드

function isAnalyzing() {
  return photos.some((p) => p.status === 'loading');
}

// 새 끼니를 열 때 이전 카드·미리보기 정리 (미리보기 URL도 메모리에서 해제)
function resetPhotos() {
  photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
  photos = [];
  photoGeneration++;
  renderPhotoCards();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// 긴 변 PHOTO_MAX_SIDE로 줄여 JPEG base64로 — 전송 시간·무료 한도 절약
async function prepareImage(url) {
  const img = await loadImage(url);
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // 투명 PNG도 JPEG로 바꿀 때 검게 나오지 않게
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY);
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/jpeg', width: w, height: h };
}

// 사진 여러 장을 받으면 장마다 따로(동시에) 분석한다
function addPhotoFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('image/'));
  for (const file of files) {
    const photo = { id: newEntryId(), previewUrl: URL.createObjectURL(file), image: null, status: 'loading', forcedKind: null };
    photos.push(photo);
    runAnalysis(photo);
  }
  renderPhotoCards();
}

async function runAnalysis(photo) {
  const generation = photoGeneration;
  photo.status = 'loading';
  photo.errorCode = null;
  renderPhotoCards();
  updateSaveState();
  try {
    if (!photo.image) {
      try {
        photo.image = await prepareImage(photo.previewUrl);
      } catch (e) {
        throw new GeminiError('image');
      }
    }
    const result = await analyzePhoto(photo.image, { forcedKind: photo.forcedKind });
    if (generation !== photoGeneration) return; // 그새 다른 끼니로 넘어감
    photo.kind = result.kind;
    photo.items = result.items;
    if (result.kind === 'unknown') photo.results = [];
    else {
      const { results, replaced } = addAnalyzedItems(photo.id, result.kind, result.items);
      photo.results = results;
      // 성분표 값으로 바뀐 '사진 추정' 쪽 카드에도 알려 준다
      for (const r of replaced) {
        const other = photos.find((p) => p.id === r.photoId);
        if (other && other.results) other.results[r.index] = 'superseded';
      }
    }
    photo.status = 'done';
  } catch (e) {
    if (generation !== photoGeneration) return;
    photo.status = 'error';
    photo.errorCode = e instanceof GeminiError ? e.code : 'bad_response';
  }
  renderPhotoCards();
  updateSaveState();
}

// ---------- 카드 그리기 ----------

function photoBadge(p) {
  if (p.status === 'loading') return `<span class="badge badge-loading"><span class="spinner"></span>분석 중이에요…</span>`;
  if (p.status === 'error') return `<span class="badge badge-warn">${iconSvg('alert')}분석하지 못했어요</span>`;
  if (p.kind === 'label') return `<span class="badge badge-ok">${iconSvg('check')}영양성분표로 인식했어요!</span>`;
  if (p.kind === 'food') {
    const names = p.items.map((it) => it.name).filter(Boolean).join(', ');
    return `<span class="badge badge-ok">${iconSvg('check')}음식 사진으로 보여요${names ? `: ${escapeHtml(names)}` : ''}</span>`;
  }
  return `<span class="badge badge-warn">${iconSvg('alert')}인식하지 못했어요</span>`;
}

// 영양소 표: 성분표는 읽은 그대로, 음식 사진은 '약'을 붙여 추정임을 드러낸다 (6장)
function nutrientTableHtml(item, estimated) {
  return `<dl class="nutri-table">${NUTRIENT_FIELDS.map((f) => {
    const v = item.nutrients[f.key];
    const text = v === null ? '<span class="muted">–</span>' : `${estimated ? '약 ' : ''}${formatNumber(Math.round(v * 10) / 10)} ${f.unit}`;
    return `<div><dt>${f.label}</dt><dd>${text}</dd></div>`;
  }).join('')}</dl>`;
}

function analyzedItemHtml(p, item, i) {
  const estimated = p.kind === 'food';
  const status = p.results && p.results[i];
  const STATUS = {
    added: '<span class="item-status ok">끼니에 담았어요</span>',
    replaced: '<span class="item-status ok">사진 추정 대신 성분표 값으로 담았어요</span>',
    duplicate: '<span class="item-status dup">이미 담겨 있어요</span>',
    superseded: '<span class="item-status dup">성분표 값으로 바뀌었어요</span>',
  };
  const statusText = STATUS[status] || '';
  // 제품명이 없으면 Gemini가 보이는 글자로 추정한 이름에 '(추정)' (6장). 추정도 못 했으면 안내
  const name = !item.name
    ? '<em class="need">제품명이 안 보여요 · 아래에서 고르거나 직접 입력해 주세요</em>'
    : item.nameGuessed
      ? `${escapeHtml(item.name)}? <small class="guess">(추정)</small>`
      : escapeHtml(item.name);
  // 성분표 카드는 이름 아래에 항상 빠른 선택 칩 — 끼니에 담긴 음식일 때만 (눌러서 그 음식 이름을 바꿈)
  const inBasketNow = status === 'added' || status === 'replaced';
  const chips =
    p.kind === 'label' && inBasketNow
      ? `<div class="name-chips">${nameChipsHtml(`data-action="rename" data-photo="${p.id}" data-index="${i}"`, item.nameGuessed ? '' : item.name)}</div>`
      : '';
  const basis = estimated ? '예상 · 일반적인 1인분 기준 · 참고용' : basisText(item);
  const low = item.confidence < LOW_CONFIDENCE ? '<span class="low-conf">확신 낮음 · 꼭 확인해 주세요</span>' : '';
  // 이름(✏️)을 누르면 그 자리에서 입력칸으로 — 이름만 바뀌고 영양소는 그대로 (다시 분석하지 않음, 6장)
  const head =
    p.editingIndex === i
      ? `<div class="name-edit">
           <input type="text" maxlength="40" value="${escapeHtml(item.name)}" placeholder="음식 이름" data-name-input data-photo="${p.id}" data-index="${i}" aria-label="음식 이름 고치기" />
           <button type="button" class="btn-small" data-action="name-save" data-photo="${p.id}" data-index="${i}">저장</button>
           <button type="button" class="link-btn" data-action="name-cancel" data-photo="${p.id}" data-index="${i}">취소</button>
         </div>`
      : `<button type="button" class="name-edit-btn" data-action="name-edit" data-photo="${p.id}" data-index="${i}" title="이름 고치기"><strong>${name}</strong><span class="pencil" aria-label="이름 고치기">${iconSvg('pencil')}</span></button>`;
  return `
    <div class="analyzed-item">
      <div class="analyzed-head">${head}${statusText}</div>
      ${chips}
      <p class="analyzed-basis">${basis} ${low}</p>
      ${nutrientTableHtml(item, estimated)}
    </div>`;
}

function photoActionsHtml(p) {
  const btn = (action, label, extra = '') =>
    `<button type="button" class="chip-btn" data-action="${action}" data-photo="${p.id}" ${extra}>${label}</button>`;
  if (p.status === 'loading') return '';
  const reanalyze = btn('reanalyze', `${iconSvg('refresh')}다른 사진으로 재분석`);
  if (p.status === 'error') {
    const code = p.errorCode;
    const parts = [];
    if (code === 'no_key' || code === 'bad_key') parts.push(btn('go-key', '내 정보에서 키 입력'));
    else if (code === 'image') parts.push(reanalyze);
    else parts.push(btn('retry', `${iconSvg('refresh')}다시 시도`));
    parts.push(btn('manual', '직접 입력'));
    return parts.join('');
  }
  // 분류가 틀렸으면 사용자가 바꿔서 다시 분석 (6장)
  if (p.kind === 'unknown') {
    return [btn('manual', '직접 입력'), btn('switch', '성분표로 다시 분석', 'data-kind="label"'), btn('switch', '음식 사진으로 다시 분석', 'data-kind="food"'), reanalyze].join('');
  }
  const other = p.kind === 'label' ? 'food' : 'label';
  // '분류 바꾸기'처럼 모호한 말 대신 무엇으로 다시 분석하는지 그대로 (6장)
  return [reanalyze, btn('switch', other === 'label' ? '성분표로 다시 분석' : '음식 사진으로 다시 분석', `data-kind="${other}"`)].join('');
}

function photoCardHtml(p) {
  let body = '';
  if (p.status === 'error') body = `<p class="card-msg">${GEMINI_ERROR_TEXT[p.errorCode] || GEMINI_ERROR_TEXT.bad_response}</p>`;
  else if (p.status === 'done' && p.kind === 'unknown') body = '<p class="card-msg">음식이나 영양성분표가 보이지 않아요. 다시 찍거나 직접 입력해 주세요.</p>';
  else if (p.status === 'done') body = p.items.map((it, i) => analyzedItemHtml(p, it, i)).join('');
  return `
    <article class="photo-card status-${p.status} kind-${p.kind || 'none'}" data-photo="${p.id}">
      <header>${photoBadge(p)}</header>
      <div class="photo-card-body">
        <img class="photo-preview" src="${p.previewUrl}" alt="올린 사진 미리보기" />
        <div class="photo-result">${body}</div>
      </div>
      <div class="photo-actions">${photoActionsHtml(p)}</div>
    </article>`;
}

function renderPhotoCards() {
  const section = document.getElementById('analysis');
  section.hidden = photos.length === 0;
  document.getElementById('analysis-cards').innerHTML = photos.map(photoCardHtml).join('');
}

// ---------- 이벤트 ----------

function onPhotoCardClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const photo = photos.find((p) => p.id === btn.dataset.photo);
  if (!photo) return;
  const action = btn.dataset.action;
  if (action === 'name-edit') {
    photos.forEach((x) => (x.editingIndex = null)); // 한 번에 하나만 고치기
    photo.editingIndex = Number(btn.dataset.index);
    renderPhotoCards();
    const input = document.querySelector(`[data-name-input][data-photo="${photo.id}"]`);
    input.focus();
    input.select();
  } else if (action === 'name-save') {
    saveCardName(photo, Number(btn.dataset.index));
  } else if (action === 'name-cancel') {
    photo.editingIndex = null;
    renderPhotoCards();
  } else if (action === 'rename') {
    // 칩으로 이름 확정: 담긴 음식 이름을 바꾸고 카드에도 반영 ('(추정)' 표시 없어짐)
    const index = Number(btn.dataset.index);
    if (renameItemFromPhoto(photo.id, index, btn.dataset.quickName)) {
      photo.items[index].name = btn.dataset.quickName;
      photo.items[index].nameGuessed = false;
      renderPhotoCards();
    }
  } else if (action === 'retry') {
    runAnalysis(photo);
  } else if (action === 'switch') {
    removeItemsFromPhoto(photo.id);
    photo.forcedKind = btn.dataset.kind;
    runAnalysis(photo);
  } else if (action === 'reanalyze') {
    reanalyzeTarget = photo;
    document.getElementById('reanalyze-input').click();
  } else if (action === 'manual') {
    openFoodEditor();
    foodForm().scrollIntoView({ behavior: 'smooth', block: 'center' });
    foodForm().foodName.focus();
  } else if (action === 'go-key') {
    navigate('me');
  }
}

// 카드에서 고친 이름 저장: 카드와 담긴 음식 목록 이름을 함께 바꾸고 '(추정)' 표시를 없앤다. 영양소는 그대로
function saveCardName(photo, index) {
  const input = document.querySelector(`[data-name-input][data-photo="${photo.id}"]`);
  const name = input ? input.value.trim() : '';
  if (!name) {
    input.focus();
    return; // 빈 이름은 저장하지 않음
  }
  photo.items[index].name = name;
  photo.items[index].nameGuessed = false;
  photo.editingIndex = null;
  renameItemFromPhoto(photo.id, index, name); // 담긴 음식이 있으면 그 이름도 (없으면 카드만)
  renderPhotoCards();
}
// 같은 카드에서 다른 사진으로 바꿔 다시 분석 — 이 카드로 담았던 음식은 빼고 다시 담는다
function onReanalyzeFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  const photo = reanalyzeTarget;
  reanalyzeTarget = null;
  if (!file || !photo || !file.type.startsWith('image/')) return;
  removeItemsFromPhoto(photo.id);
  URL.revokeObjectURL(photo.previewUrl);
  photo.previewUrl = URL.createObjectURL(file);
  photo.image = null;
  photo.forcedKind = null;
  runAnalysis(photo);
}

function initPhotoUpload() {
  const box = document.getElementById('upload-box');
  const input = document.getElementById('photo-input');
  // 클릭·키보드(Enter/Space)·끌어다 놓기 모두 같은 처리
  box.addEventListener('click', () => input.click());
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  box.addEventListener('dragover', (e) => {
    e.preventDefault();
    box.classList.add('dragging');
  });
  box.addEventListener('dragleave', () => box.classList.remove('dragging'));
  box.addEventListener('drop', (e) => {
    e.preventDefault();
    box.classList.remove('dragging');
    addPhotoFiles(e.dataTransfer.files);
  });
  input.addEventListener('change', () => {
    addPhotoFiles(input.files);
    input.value = ''; // 같은 사진을 다시 골라도 change가 일어나게
  });
  document.getElementById('reanalyze-input').addEventListener('change', onReanalyzeFile);
  document.getElementById('analysis-cards').addEventListener('click', onPhotoCardClick);
  // 이름 입력칸: Enter = 저장, Esc = 취소
  document.getElementById('analysis-cards').addEventListener('keydown', (e) => {
    if (!e.target.matches('[data-name-input]')) return;
    const photo = photos.find((x) => x.id === e.target.dataset.photo);
    if (!photo) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      saveCardName(photo, Number(e.target.dataset.index));
    } else if (e.key === 'Escape') {
      photo.editingIndex = null;
      renderPhotoCards();
    }
  });
}
