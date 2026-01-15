const input = document.getElementById("q");
const goBtn = document.getElementById("go");
const openSettingsBtn = document.getElementById("openSettings");
const suggestEl = document.getElementById("suggest");
const suggestListEl = document.getElementById("suggestList");
const clearHistoryBtn = document.getElementById("clearHistory");
const goLabel = goBtn.textContent;

const HISTORY_KEY = "searchHistory";
const HISTORY_LIMIT = 20;

function normalizeHistoryEntry(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  if (text.length > 200) return text.slice(0, 200).trim();
  return text;
}

async function loadHistory() {
  const data = await chrome.storage.local.get(HISTORY_KEY);
  const list = Array.isArray(data?.[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
  return list.map(normalizeHistoryEntry).filter(Boolean);
}

async function saveHistory(raw) {
  const text = normalizeHistoryEntry(raw);
  if (!text) return;
  const list = await loadHistory();
  const next = [text, ...list.filter((x) => x !== text)].slice(0, HISTORY_LIMIT);
  await chrome.storage.local.set({ [HISTORY_KEY]: next });
}

async function clearHistory() {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}

function showSuggest() {
  suggestEl.classList.remove("hidden");
}

function hideSuggest() {
  suggestEl.classList.add("hidden");
}

function createSuggestItem(text, meta) {
  const item = document.createElement("div");
  item.className = "suggest-item";
  item.setAttribute("role", "option");

  const left = document.createElement("div");
  left.className = "suggest-item-text";
  left.textContent = text;

  const right = document.createElement("div");
  right.className = "suggest-item-meta";
  right.textContent = meta || "";

  item.appendChild(left);
  item.appendChild(right);

  item.addEventListener("mousedown", (e) => e.preventDefault());
  item.addEventListener("click", () => {
    input.value = text;
    input.focus();
    input.setSelectionRange(text.length, text.length);
    hideSuggest();
  });

  return item;
}

async function renderSuggest() {
  const q = input.value.trim().toLowerCase();
  const all = await loadHistory();
  const list = q ? all.filter((x) => x.toLowerCase().includes(q)) : all;
  suggestListEl.innerHTML = "";
  const visible = list.slice(0, 10);
  for (let i = 0; i < visible.length; i++) {
    suggestListEl.appendChild(createSuggestItem(visible[i], i === 0 ? "Enter" : ""));
  }
  if (visible.length) showSuggest();
  else hideSuggest();
}

function setLoading(loading) {
  goBtn.disabled = !!loading;
  input.disabled = !!loading;
  goBtn.textContent = loading ? "路由中…" : goLabel;
}

function fillTemplate(tpl, q) {
  const raw = String(tpl || "");
  if (!raw.includes("{q}")) return raw;
  return raw.replaceAll("{q}", String(q || "").trim());
}

async function runQuery(raw) {
  const text = String(raw || "").trim();
  if (!text) return;
  await saveHistory(text);
  setLoading(true);
  try {
    await chrome.runtime.sendMessage({ type: "routeQuery", text });
  } finally {
    setLoading(false);
  }
}

goBtn.addEventListener("click", () => runQuery(input.value));

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runQuery(input.value);
  if (e.key === "Escape") {
    input.value = "";
    hideSuggest();
  }
});

openSettingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

input.addEventListener("focus", () => {
  renderSuggest();
});

input.addEventListener("input", () => {
  renderSuggest();
});

input.addEventListener("blur", () => {
  setTimeout(() => hideSuggest(), 140);
});

clearHistoryBtn.addEventListener("click", async () => {
  await clearHistory();
  await renderSuggest();
});

setTimeout(() => {
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}, 40);
