// 단색 선 아이콘 — assets/에 아이콘 PNG가 없어 인라인 SVG로 그린다 (사용자 승인, 캐릭터는 계속 assets/ PNG)
// stroke="currentColor"라 글자색을 따라가므로 CSS 한 곳에서 색을 바꿀 수 있다

const ICON_PATHS = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  label: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  pencil: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  // 식사 종류
  sunrise: '<path d="M4 18h16M7 18a5 5 0 0 1 10 0"/><path d="M12 6v3M5.6 10.6l1.8 1.4M18.4 10.6l-1.8 1.4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  sunset: '<path d="M4 16h16M7 16a5 5 0 0 1 10 0"/><path d="M12 4v5M9.5 6.5L12 9l2.5-2.5M8 20h8"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  cookie: '<circle cx="12" cy="12" r="8"/><circle cx="9" cy="10" r="1"/><circle cx="14.5" cy="9" r="1"/><circle cx="13" cy="14.5" r="1"/>',
  cup: '<path d="M6 8h12l-1.5 12h-9z"/><path d="M5 8h14M12 8l1-5h3"/>',
  dish: '<path d="M4 14h16a8 8 0 0 1-16 0z"/><path d="M12 6v2M3 18h18"/>',
};

function iconSvg(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

// HTML에 data-icon="이름"만 적어 두면 시작할 때 아이콘을 채운다
function fillStaticIcons() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    el.insertAdjacentHTML('afterbegin', iconSvg(el.dataset.icon));
  });
}
