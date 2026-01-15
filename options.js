const DEFAULT_SETTINGS = {
  apiEndpoint: "https://api.deepseek.com",
  model: "deepseek-chat",
  preferExactKeywordJump: true,
  openFirstResultOnSupportedSearch: true,
  enableDebugLogs: false,
  fallbackSearchEngine: "google",
  uiLanguage: "en",
  allowedDomains: [
    "bilibili.com",
    "reddit.com",
    "youtube.com",
    "tiktok.com",
    "x.com",
    "twitter.com",
    "douyin.com",
    "xiaohongshu.com",
    "kuaishou.com",
    "zhihu.com",
    "weibo.com",
    "douban.com",
    "github.com",
    "stackoverflow.com",
    "wikipedia.org",
  ],
  keywords: {}
};

const I18N = {
  en: {
    pageTitle: "DirectGO Settings",
    labelApiEndpoint: "API Endpoint",
    hintApiEndpoint: "Auto appends /v1/chat/completions",
    labelModel: "Model",
    labelApiKey: "API Key",
    hintApiKey: "Stored locally (chrome.storage.local), not synced",
    hintApiKeyPrivacy: "Your search text will be sent to the model provider. If you mind, do not enter it.",
    labelPreferExactKeywordJump: "Force jump on exact keyword only",
    labelOpenFirstResultOnSupportedSearch: "Open first result on supported platforms",
    labelAllowedDomains: "result allowlist domains (one per line)",
    hintAllowedDomains: "Only tries “open first result” on these domains",
    labelFallbackSearchEngine: "Fallback search engine",
    labelKeywords: "Keywords (one per line)",
    hintKeywords: "Format: keyword=url; supports {q}",
    labelDebugLogs: "Debug logs (local)",
    labelDebugEnabled: "Enable debug logs",
    refreshLogs: "Refresh logs",
    clearLogs: "Clear logs",
    save: "Save",
    reset: "Reset",
    saved: "Saved",
    resetDone: "Reset to defaults"
  },
  zh: {
    pageTitle: "DirectGO 设置",
    labelApiEndpoint: "API Endpoint",
    hintApiEndpoint: "将自动拼接 /v1/chat/completions",
    labelModel: "模型",
    labelApiKey: "API Key",
    hintApiKey: "Key 存在本地（chrome.storage.local），不会同步到其它设备",
    hintApiKeyPrivacy: "您的搜索词会发给大模型厂商，介意者请勿填写。",
    labelPreferExactKeywordJump: "唯一词命中时强制跳转（仅输入关键词时）",
    labelOpenFirstResultOnSupportedSearch: "站内搜索自动打开首条结果（大平台白名单）",
    labelAllowedDomains: "直达白名单域名（每行一个）",
    hintAllowedDomains: "仅对这些域名的“搜索页”尝试抓取首条结果并直达",
    labelFallbackSearchEngine: "兜底搜索引擎",
    labelKeywords: "唯一词（每行一条）",
    hintKeywords: "格式：keyword=url；支持 {q} 占位符",
    labelDebugLogs: "调试日志（本地）",
    labelDebugEnabled: "开启调试日志",
    refreshLogs: "刷新日志",
    clearLogs: "清空日志",
    save: "保存",
    reset: "恢复默认",
    saved: "已保存",
    resetDone: "已恢复默认"
  }
};

function normalizeUiLanguage(value) {
  return value === "zh" ? "zh" : "en";
}

function applyI18n(lang) {
  const l = normalizeUiLanguage(lang);
  const t = I18N[l] || I18N.en;
  document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
  document.title = t.pageTitle;
  document.getElementById("pageTitle").textContent = t.pageTitle;
  document.getElementById("labelApiEndpoint").textContent = t.labelApiEndpoint;
  document.getElementById("hintApiEndpoint").textContent = t.hintApiEndpoint;
  document.getElementById("labelModel").textContent = t.labelModel;
  document.getElementById("labelApiKey").textContent = t.labelApiKey;
  document.getElementById("hintApiKey").textContent = t.hintApiKey;
  document.getElementById("hintApiKeyPrivacy").textContent = t.hintApiKeyPrivacy;
  document.getElementById("labelPreferExactKeywordJump").textContent = t.labelPreferExactKeywordJump;
  document.getElementById("labelOpenFirstResultOnSupportedSearch").textContent =
    t.labelOpenFirstResultOnSupportedSearch;
  document.getElementById("labelAllowedDomains").textContent = t.labelAllowedDomains;
  document.getElementById("hintAllowedDomains").textContent = t.hintAllowedDomains;
  document.getElementById("labelFallbackSearchEngine").textContent = t.labelFallbackSearchEngine;
  document.getElementById("labelKeywords").textContent = t.labelKeywords;
  document.getElementById("hintKeywords").textContent = t.hintKeywords;
  document.getElementById("labelDebugLogs").textContent = t.labelDebugLogs;
  document.getElementById("labelDebugEnabled").textContent = t.labelDebugEnabled;
  document.getElementById("refreshLogs").textContent = t.refreshLogs;
  document.getElementById("clearLogs").textContent = t.clearLogs;
  document.getElementById("save").textContent = t.save;
  document.getElementById("reset").textContent = t.reset;
}

function setDebugLogsUiEnabled(enabled) {
  const on = !!enabled;
  document.getElementById("debugLogs").disabled = !on;
  document.getElementById("refreshLogs").disabled = !on;
  document.getElementById("clearLogs").disabled = !on;
  const container = document.getElementById("debugLogsContainer");
  if (container) container.style.display = on ? "block" : "none";
}

function formatDebugLogs(logs) {
  const list = Array.isArray(logs) ? logs : [];
  const lines = [];
  for (const it of list.slice(-200)) {
    const t = Number(it?.t || 0);
    const when = t ? new Date(t).toISOString() : "";
    const event = String(it?.event || "");
    const data = it?.data ?? null;
    let payload = "";
    try {
      payload = JSON.stringify(data);
    } catch (e) {
      payload = String(data);
    }
    lines.push(`${when} ${event} ${payload}`.trim());
  }
  return lines.join("\n");
}

async function loadDebugLogs() {
  const { debugLogs } = await chrome.storage.local.get("debugLogs");
  document.getElementById("debugLogs").value = formatDebugLogs(debugLogs);
}

async function clearDebugLogs() {
  await chrome.storage.local.remove("debugLogs");
  await loadDebugLogs();
}

function parseKeywords(text) {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const keywords = {};
  for (const line of lines) {
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const url = line.slice(idx + 1).trim();
    if (!key || !url) continue;
    keywords[key] = url;
  }
  return keywords;
}

function formatKeywords(keywords) {
  const entries = Object.entries(keywords || {});
  entries.sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${v}`).join("\n");
}

function parseDomains(text) {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);

  const unique = [];
  const seen = new Set();
  for (const d of lines) {
    const normalized = d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}

function formatDomains(domains) {
  const list = Array.isArray(domains) ? domains : [];
  return list.join("\n");
}

async function load() {
  const { settings } = await chrome.storage.sync.get("settings");
  const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };

  const { apiKey } = await chrome.storage.local.get("apiKey");

  const uiLanguage = normalizeUiLanguage(merged.uiLanguage);
  document.getElementById("uiLanguage").value = uiLanguage;
  applyI18n(uiLanguage);

  document.getElementById("apiEndpoint").value = merged.apiEndpoint || "";
  document.getElementById("model").value = merged.model || "";
  document.getElementById("preferExactKeywordJump").checked = !!merged.preferExactKeywordJump;
  document.getElementById("openFirstResultOnSupportedSearch").checked =
    merged.openFirstResultOnSupportedSearch !== false;
  const debugEnabled = !!merged.enableDebugLogs;
  document.getElementById("debugEnabled").checked = debugEnabled;
  setDebugLogsUiEnabled(debugEnabled);
  document.getElementById("allowedDomains").value = formatDomains(
    Array.isArray(merged.allowedDomains) ? merged.allowedDomains : DEFAULT_SETTINGS.allowedDomains
  );
  document.getElementById("fallbackSearchEngine").value =
    merged.fallbackSearchEngine === "bing" ? "bing" : "google";
  document.getElementById("keywords").value = formatKeywords(merged.keywords);
  document.getElementById("apiKey").value = apiKey || "";
  if (debugEnabled) await loadDebugLogs();
}

async function save() {
  const apiEndpoint = document.getElementById("apiEndpoint").value.trim();
  const model = document.getElementById("model").value.trim();
  const preferExactKeywordJump = document.getElementById("preferExactKeywordJump").checked;
  const openFirstResultOnSupportedSearch = document.getElementById(
    "openFirstResultOnSupportedSearch"
  ).checked;
  const enableDebugLogs = document.getElementById("debugEnabled").checked;
  const allowedDomainsText = document.getElementById("allowedDomains").value;
  const fallbackSearchEngine =
    document.getElementById("fallbackSearchEngine").value === "bing" ? "bing" : "google";
  const keywordsText = document.getElementById("keywords").value;
  const apiKey = document.getElementById("apiKey").value.trim();
  const uiLanguage = normalizeUiLanguage(document.getElementById("uiLanguage").value);

  const nextSettings = {
    apiEndpoint: apiEndpoint || DEFAULT_SETTINGS.apiEndpoint,
    model: model || DEFAULT_SETTINGS.model,
    preferExactKeywordJump,
    openFirstResultOnSupportedSearch,
    enableDebugLogs,
    allowedDomains: parseDomains(allowedDomainsText),
    fallbackSearchEngine,
    uiLanguage,
    keywords: parseKeywords(keywordsText)
  };

  await chrome.storage.sync.set({ settings: nextSettings });
  await chrome.storage.local.set({ apiKey });

  setStatus(I18N[uiLanguage]?.saved || I18N.en.saved);
}

async function resetDefaults() {
  await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  await chrome.storage.local.set({ apiKey: "" });
  await load();
  setStatus(I18N[DEFAULT_SETTINGS.uiLanguage]?.resetDone || I18N.en.resetDone);
}

let statusTimer = null;
function setStatus(text) {
  const el = document.getElementById("status");
  el.textContent = text;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    el.textContent = "";
  }, 1200);
}

document.getElementById("save").addEventListener("click", () => {
  save();
});

document.getElementById("reset").addEventListener("click", () => {
  resetDefaults();
});

document.getElementById("uiLanguage").addEventListener("change", async (e) => {
  const lang = normalizeUiLanguage(e.target.value);
  applyI18n(lang);
  const { settings } = await chrome.storage.sync.get("settings");
  const next = { ...(settings || DEFAULT_SETTINGS), uiLanguage: lang };
  await chrome.storage.sync.set({ settings: next });
});

document.getElementById("refreshLogs").addEventListener("click", () => {
  loadDebugLogs();
});

document.getElementById("clearLogs").addEventListener("click", () => {
  clearDebugLogs();
});

document.getElementById("debugEnabled").addEventListener("change", (e) => {
  const enabled = !!e.target.checked;
  setDebugLogsUiEnabled(enabled);
  if (enabled) loadDebugLogs();
});

load();
