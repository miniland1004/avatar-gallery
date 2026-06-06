const MOVE_ACTIONS = [
  "stand1",
  "stand2",
  "walk1",
  "walk2",
  "jump",
  "sit",
  "ladder",
  "rope",
  "fly",
  "prone",
  "heal",
  "alert",
];

const ATTACK_ACTIONS = [
  "swingO1",
  "swingO2",
  "swingO3",
  "swingOF",
  "swingP1",
  "swingP2",
  "swingPF",
  "swingT1",
  "swingT2",
  "swingT3",
  "swingTF",
  "stabO1",
  "stabO2",
  "stabOF",
  "stabT1",
  "stabT2",
  "stabTF",
  "shoot1",
  "shoot2",
  "shootF",
  "proneStab",
];

const ACTION_LABELS = {
  stand1: "기본 자세 1",
  stand2: "기본 자세 2",
  walk1: "이동 1",
  walk2: "이동 2",
  jump: "점프",
  sit: "앉기",
  ladder: "사다리 타기",
  rope: "로프 타기",
  fly: "비행",
  prone: "엎드리기",
  heal: "회복 모션",
  alert: "전투 대기",
  swingO1: "한손무기 휘두르기 1",
  swingO2: "한손무기 휘두르기 2",
  swingO3: "한손무기 휘두르기 3",
  swingOF: "한손무기 빠른 휘두르기",
  swingP1: "폴암 휘두르기 1",
  swingP2: "폴암 휘두르기 2",
  swingPF: "폴암 빠른 휘두르기",
  swingT1: "두손무기 휘두르기 1",
  swingT2: "두손무기 휘두르기 2",
  swingT3: "두손무기 휘두르기 3",
  swingTF: "두손무기 빠른 휘두르기",
  stabO1: "한손무기 찌르기 1",
  stabO2: "한손무기 찌르기 2",
  stabOF: "한손무기 빠른 찌르기",
  stabT1: "두손무기 찌르기 1",
  stabT2: "두손무기 찌르기 2",
  stabTF: "두손무기 빠른 찌르기",
  shoot1: "사격 1",
  shoot2: "사격 2",
  shootF: "빠른 사격",
  proneStab: "엎드려 찌르기",
};

const KIND_LABELS = {
  all: "전체",
  outfit: "모자",
  weapon: "모자",
  cape: "모자",
  body: "모자",
};

const manifest = window.AVATAR_MANIFEST;
const itemNumbers = new Map(manifest.items.map((item, index) => [item.id, index + 1]));

const els = {
  itemCount: document.querySelector("#itemCount"),
  searchInput: document.querySelector("#searchInput"),
  selectedTitle: document.querySelector("#selectedTitle"),
  selectedKind: document.querySelector("#selectedKind"),
  spriteStage: document.querySelector("#spriteStage"),
  moveSelect: document.querySelector("#moveSelect"),
  attackSelect: document.querySelector("#attackSelect"),
  playButton: document.querySelector("#playButton"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  speedRange: document.querySelector("#speedRange"),
  frameLabel: document.querySelector("#frameLabel"),
  filterRow: document.querySelector("#filterRow"),
  galleryGrid: document.querySelector("#galleryGrid"),
  emptyState: document.querySelector("#emptyState"),
};

const state = {
  item: null,
  action: null,
  query: "",
  filter: "all",
  frame: 0,
  playing: true,
  delay: Number(els.speedRange.value),
  timer: null,
};

function byId(id) {
  return manifest.items.find((item) => item.id === id);
}

function byNo(no) {
  const index = Number(no) - 1;
  return Number.isInteger(index) ? manifest.items[index] : null;
}

function itemNo(item) {
  return itemNumbers.get(item.id) || 0;
}

function itemLabel(item) {
  return `미니랜드 No.${String(itemNo(item)).padStart(2, "0")}`;
}

function itemSearchText(item) {
  const no = itemNo(item);
  return `${item.id} ${no} ${String(no).padStart(2, "0")}`;
}

function orderedActions(item, actions) {
  return actions.filter((action) => item.actions[action]?.length);
}

function firstAction(item, preferred) {
  if (preferred && item.actions[preferred]?.length) {
    return preferred;
  }

  return orderedActions(item, MOVE_ACTIONS)[0] || orderedActions(item, ATTACK_ACTIONS)[0];
}

function actionLabel(action) {
  return ACTION_LABELS[action] || action;
}

function setItem(item, action = state.action) {
  state.item = item;
  state.action = firstAction(item, action);
  state.frame = 0;
  renderSelection();
  renderGallery();
  preloadAction();
  restartTimer();
  syncUrl();
}

function setAction(action) {
  if (!state.item?.actions[action]?.length) {
    return;
  }

  state.action = action;
  state.frame = 0;
  renderSelection();
  preloadAction();
  restartTimer();
  syncUrl();
}

function renderFilters() {
  const kinds = ["all"];
  els.filterRow.innerHTML = "";

  kinds.forEach((kind) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-chip${state.filter === kind ? " is-active" : ""}`;
    button.textContent = KIND_LABELS[kind] || kind;
    button.addEventListener("click", () => {
      state.filter = kind;
      renderFilters();
      renderGallery();
    });
    els.filterRow.appendChild(button);
  });
}

function renderGallery() {
  const query = state.query.trim();
  const items = manifest.items.filter((item) => {
    const matchesQuery = !query || itemSearchText(item).includes(query);
    return matchesQuery;
  });

  els.galleryGrid.innerHTML = "";
  els.emptyState.hidden = items.length > 0;

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const label = itemLabel(item);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `item-card${state.item?.id === item.id ? " is-active" : ""}`;
    button.setAttribute("aria-label", `${label} 선택`);
    button.innerHTML = `
      <img src="${item.icon}" alt="" loading="lazy">
      <span>${label}</span>
    `;
    button.addEventListener("click", () => setItem(item));
    fragment.appendChild(button);
  });

  els.galleryGrid.appendChild(fragment);
}

function fillSelect(select, item, actions, fallbackText) {
  const available = orderedActions(item, actions);
  select.innerHTML = "";

  if (!available.length) {
    const option = new Option(fallbackText, "");
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  available.forEach((action) => {
    const option = new Option(actionLabel(action), action);
    select.appendChild(option);
  });
}

function renderSelection() {
  const item = state.item;
  const frames = currentFrames();

  els.selectedTitle.textContent = itemLabel(item);
  els.selectedKind.textContent = "모자";

  fillSelect(els.moveSelect, item, MOVE_ACTIONS, "일반 모션 없음");
  fillSelect(els.attackSelect, item, ATTACK_ACTIONS, "공격 없음");
  els.moveSelect.value = MOVE_ACTIONS.includes(state.action) ? state.action : "";
  els.attackSelect.value = ATTACK_ACTIONS.includes(state.action) ? state.action : "";
  els.playButton.textContent = state.playing ? "||" : ">";
  els.frameLabel.textContent = `${frames.length ? state.frame + 1 : 0} / ${frames.length}`;

  renderFrame();
}

function currentFrames() {
  return state.item?.actions[state.action] || [];
}

function renderFrame() {
  const frames = currentFrames();
  const frame = frames[state.frame % Math.max(frames.length, 1)];
  els.spriteStage.innerHTML = "";

  if (!frame) {
    return;
  }

  const fragment = document.createDocumentFragment();
  frame.files.forEach((file) => {
    const img = document.createElement("img");
    img.className = "sprite-layer";
    img.src = `${state.item.dir}/${file}`;
    img.alt = "";
    fragment.appendChild(img);
  });

  els.spriteStage.appendChild(fragment);
  els.frameLabel.textContent = `${state.frame + 1} / ${frames.length}`;
}

function nextFrame() {
  const frames = currentFrames();
  if (!frames.length) {
    return;
  }

  state.frame = (state.frame + 1) % frames.length;
  renderFrame();
}

function prevFrame() {
  const frames = currentFrames();
  if (!frames.length) {
    return;
  }

  state.frame = (state.frame - 1 + frames.length) % frames.length;
  renderFrame();
}

function restartTimer() {
  window.clearInterval(state.timer);
  state.timer = null;

  if (state.playing && currentFrames().length > 1) {
    state.timer = window.setInterval(nextFrame, state.delay);
  }
}

function preloadAction() {
  currentFrames().forEach((frame) => {
    frame.files.forEach((file) => {
      const image = new Image();
      image.src = `${state.item.dir}/${file}`;
    });
  });
}

function syncUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("no", String(itemNo(state.item)).padStart(2, "0"));
    url.searchParams.delete("item");
    url.searchParams.delete("motion");
    window.history.replaceState(null, "", url);
  } catch {
    // Some browsers restrict history changes on local file URLs.
  }
}

function initFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const requestedNo = params.get("no");
  const requestedItem = params.get("item");
  const requestedMotion = params.get("motion");
  const item = byNo(requestedNo) || byId(requestedItem) || manifest.items[0];
  setItem(item, requestedMotion);
}

function bindEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.replace(/\D/g, "");
    event.target.value = state.query;
    renderGallery();
  });

  els.moveSelect.addEventListener("change", (event) => setAction(event.target.value));
  els.attackSelect.addEventListener("change", (event) => setAction(event.target.value));

  els.playButton.addEventListener("click", () => {
    state.playing = !state.playing;
    renderSelection();
    restartTimer();
  });

  els.prevButton.addEventListener("click", () => {
    state.playing = false;
    prevFrame();
    renderSelection();
    restartTimer();
  });

  els.nextButton.addEventListener("click", () => {
    state.playing = false;
    nextFrame();
    renderSelection();
    restartTimer();
  });

  els.speedRange.addEventListener("input", (event) => {
    state.delay = Number(event.target.value);
    restartTimer();
  });
}

function init() {
  if (!manifest?.items?.length) {
    els.itemCount.textContent = "아이템을 찾지 못했습니다.";
    return;
  }

  els.itemCount.textContent = `미니랜드 ${manifest.totalItems.toLocaleString("ko-KR")}종`;
  renderFilters();
  bindEvents();
  initFromUrl();
}

init();
