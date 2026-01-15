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
    "wikipedia.org"
  ],
  keywords: {}
};

function normalizeEndpoint(raw) {
  const value = (raw || "").trim().replace(/\/+$/, "");
  if (!value) return DEFAULT_SETTINGS.apiEndpoint;
  return value;
}

function buildChatCompletionsUrl(endpoint) {
  const normalized = normalizeEndpoint(endpoint);
  if (normalized.endsWith("/v1")) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function stripCodeFences(text) {
  const trimmed = (text || "").trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
}

function encodeQuery(q) {
  return encodeURIComponent((q || "").trim());
}

let debugLogsEnabled = false;
let debugLogFlushScheduled = false;
let debugLogQueue = [];

function debugLog(event, data) {
  try {
    if (!debugLogsEnabled) return;
    const entry = { t: Date.now(), event: String(event || ""), data: data ?? null };
    debugLogQueue.push(entry);
    if (typeof console !== "undefined" && console.log) console.log("[DirectGO]", entry);

    if (debugLogFlushScheduled) return;
    debugLogFlushScheduled = true;
    setTimeout(() => {
      flushDebugLogs().catch(() => {});
    }, 0);
  } catch (e) {}
}

async function flushDebugLogs() {
  debugLogFlushScheduled = false;
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
  const pending = debugLogQueue;
  debugLogQueue = [];
  if (!pending.length) return;
  try {
    const { debugLogs } = await chrome.storage.local.get("debugLogs");
    const existing = Array.isArray(debugLogs) ? debugLogs : [];
    const merged = existing.concat(pending).slice(-200);
    await chrome.storage.local.set({ debugLogs: merged });
  } catch (e) {}
}

function isDisallowedAiDecisionUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl));
    const host = u.hostname.toLowerCase();
    if (
      host === "google.com" ||
      host.endsWith(".google.com") ||
      host.startsWith("google.") ||
      host.startsWith("www.google.") ||
      host.includes(".google.")
    )
      return true;
    if (host === "bing.com" || host.endsWith(".bing.com")) return true;
    return false;
  } catch (e) {
    return false;
  }
}

function applyTemplate(urlTemplate, query) {
  if (!urlTemplate) return null;
  if (urlTemplate.includes("{q}")) return urlTemplate.replaceAll("{q}", encodeQuery(query));
  return urlTemplate;
}

function appendFromParam(rawUrl) {
  try {
    const url = new URL(String(rawUrl));
    if (url.protocol !== "http:" && url.protocol !== "https:") return String(rawUrl);
    if (!url.searchParams.get("from")) url.searchParams.set("from", "DirectGO");
    return url.toString();
  } catch (e) {
    return String(rawUrl);
  }
}

function normalizeAllowedDomains(value) {
  const list = Array.isArray(value) ? value : DEFAULT_SETTINGS.allowedDomains;
  const unique = [];
  const seen = new Set();
  for (const raw of list) {
    const domain = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");
    if (!domain) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    unique.push(domain);
  }
  return unique;
}

function isHostAllowed(hostname, settings) {
  const host = String(hostname || "").toLowerCase();
  if (!host) return false;
  const domains = normalizeAllowedDomains(settings?.allowedDomains);
  for (const d of domains) {
    if (host === d) return true;
    if (host.endsWith(`.${d}`)) return true;
  }
  return false;
}

function isSearchUrlEligible(rawUrl, settings) {
  try {
    const url = new URL(String(rawUrl));
    if (!isHostAllowed(url.hostname, settings)) return false;
    const host = url.hostname.toLowerCase();
    const path = url.pathname || "";
    return (
      (host === "search.bilibili.com" && (path.startsWith("/all") || path.startsWith("/video"))) ||
      (host.endsWith("reddit.com") && path.startsWith("/search")) ||
      (host.endsWith("youtube.com") && path.startsWith("/results")) ||
      (host.endsWith("tiktok.com") && path.startsWith("/search")) ||
      (host.endsWith("douyin.com") && path.startsWith("/search")) ||
      (host.endsWith("xiaohongshu.com") && path.startsWith("/search_result"))
    );
  } catch (e) {
    return false;
  }
}

function extractSearchKeyword(rawUrl) {
  try {
    const url = new URL(String(rawUrl));
    const host = url.hostname.toLowerCase();
    if (host === "search.bilibili.com") return (url.searchParams.get("keyword") || "").trim();
    if (host.endsWith("reddit.com")) return (url.searchParams.get("q") || "").trim();
    if (host.endsWith("youtube.com")) return (url.searchParams.get("search_query") || "").trim();
    if (host.endsWith("tiktok.com")) return (url.searchParams.get("q") || "").trim();
    if (host.endsWith("x.com")) return (url.searchParams.get("q") || "").trim();
    if (host.endsWith("xiaohongshu.com")) return (url.searchParams.get("keyword") || "").trim();
    if (host.endsWith("douyin.com")) {
      const params = (url.searchParams.get("keyword") || url.searchParams.get("q") || "").trim();
      if (params) return params;
      const path = url.pathname || "";
      const marker = "/search/";
      const idx = path.indexOf(marker);
      if (idx >= 0) {
        const rest = path.slice(idx + marker.length).split("/")[0];
        return decodeURIComponent(rest || "").trim();
      }
      return "";
    }
    return "";
  } catch (e) {
    return "";
  }
}

function optimizeSearchKeyword(rawKeyword) {
  const original = String(rawKeyword || "").trim();
  if (!original) return "";

  let q = original;
  q = q.replace(/[“”"']/g, "").trim();
  q = q.replace(
    /^(在)?(b站|B站|哔哩哔哩|bilibili|Bilibili|reddit|Reddit|youtube|YouTube|tiktok|TikTok|x|X|twitter|Twitter|推特|抖音|小红书)(上|里)?\s*/u,
    ""
  );
  q = q.replace(
    /^(?:on|in|at)\s+(bilibili|reddit|youtube|tiktok|x|twitter|douyin|xiaohongshu)\s*/i,
    ""
  );
  q = q.replace(/^(bilibili|reddit|youtube|tiktok|x|twitter|douyin|xiaohongshu)\s*[:：]\s*/i, "");

  const capturePatterns = [
    /^(.+?)的(最新|最近)?(视频|作品|动态|帖子|笔记)\s*$/u,
    /^(.+?)(最新|最近)(视频|作品|动态|帖子|笔记)\s*$/u,
    /^(.+?)的(视频|作品|动态|帖子|笔记)\s*$/u,
    /^(.+?)\s+(latest|newest|most\s+recent)\s+(video|videos|post|posts|note|notes)\s*$/i,
    /^(.+?)\s+(latest|newest|most\s+recent)\s+(upload|uploads)\s*$/i,
    /^(.+?)\s+(latest|newest|most\s+recent)\s*$/i,
    /^(.+?)\s+s\s+(latest|newest|most\s+recent)\s+(video|videos|post|posts|note|notes)\s*$/i,
    /^(?:the\s+)?(latest|newest|most\s+recent)\s+(video|videos|post|posts|note|notes)\s+of\s+(.+?)\s*$/i,
    /^(?:the\s+)?(latest|newest|most\s+recent)\s+(video|videos|post|posts|note|notes)\s+from\s+(.+?)\s*$/i
  ];
  for (const re of capturePatterns) {
    const m = q.match(re);
    const g1 = m?.[1] ? String(m[1]).trim() : "";
    const g3 = m?.[3] ? String(m[3]).trim() : "";
    const candidateFromGroup = g3 && /latest|newest|most\s+recent/i.test(g1) ? g3 : g1 || g3;
    if (candidateFromGroup) {
      const candidate = String(candidateFromGroup).trim();
      if (candidate.length >= 2) q = candidate;
      break;
    }
  }

  q = q.replace(
    /\s*(最新|最近|新|热门|完整版|高清|合集|教程|下载|官网|入口|地址|video|videos|post|posts)\s*$/iu,
    ""
  ).trim();

  if (q.length < 2) return original;
  return q;
}

function wantsLatest(rawKeyword) {
  const q = String(rawKeyword || "");
  return /最新|最近|latest|newest/i.test(q);
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const id = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(null);
    }, timeoutMs);

    Promise.resolve(promise)
      .then((v) => {
        if (done) return;
        done = true;
        clearTimeout(id);
        resolve(v);
      })
      .catch(() => {
        if (done) return;
        done = true;
        clearTimeout(id);
        resolve(null);
      });
  });
}

async function resolveBilibiliLatestVideoFromUser(keyword) {
  const q = (keyword || "").trim();
  if (!q) return null;

  const userApiUrl = `https://api.bilibili.com/x/web-interface/search/type?search_type=bili_user&keyword=${encodeQuery(
    q
  )}&order=totalrank`;
  const userResp = await fetch(userApiUrl, { method: "GET" });
  if (!userResp.ok) return null;
  const userData = await userResp.json();
  const users = Array.isArray(userData?.data?.result) ? userData.data.result.slice(0, 5) : [];
  let best = null;
  for (const u of users) {
    const name = stripHtml(u?.uname || u?.name || u?.title || "").trim();
    const fans = Number(u?.fans || 0);
    let score = 0;
    if (name === q) score += 120;
    else if (name.includes(q) || q.includes(name)) score += 80;
    else if (name) score += 10;
    score += Math.min(20, Math.max(0, Math.floor(Math.log10(Math.max(1, fans))) * 5));
    const candidate = { mid: u?.mid, score };
    if (!best) best = candidate;
    else if (candidate.score > best.score) best = candidate;
  }
  const mid = best?.mid;
  if (!mid) return null;

  const latestApiUrl = `https://api.bilibili.com/x/space/arc/search?mid=${encodeQuery(
    String(mid)
  )}&ps=1&pn=1&order=pubdate`;
  const latestResp = await fetch(latestApiUrl, { method: "GET" });
  if (!latestResp.ok) return null;
  const latestData = await latestResp.json();
  const v = latestData?.data?.list?.vlist?.[0];
  const bvid = typeof v?.bvid === "string" ? v.bvid.trim() : "";
  if (!bvid) return null;
  return `https://www.bilibili.com/video/${bvid}`;
}

function stripHtml(text) {
  return String(text || "").replace(/<[^>]*>/g, "");
}

function extractCreatorName(rawKeyword, fallback) {
  const q = String(rawKeyword || "").trim();
  const patterns = [
    /^(.+?)的(最新|最近)?(视频|作品|动态|投稿)\s*$/u,
    /^(.+?)(最新|最近)(视频|作品|动态|投稿)\s*$/u,
    /^(.+?)\s+(latest|newest)\s+(video|videos)\s*$/i
  ];
  for (const re of patterns) {
    const m = q.match(re);
    if (m && m[1]) return String(m[1]).trim();
  }
  return String(fallback || "").trim();
}

function isCreatorIntent(rawKeyword) {
  const q = String(rawKeyword || "").trim();
  return /^(.+?)的(最新|最近)?(视频|作品|动态|投稿)\s*$/u.test(q) || /^(.+?)(最新|最近)(视频|作品|动态|投稿)\s*$/u.test(q);
}

function scoreBilibiliResult({ rawKeyword, optimizedKeyword, creatorName, item }) {
  const title = stripHtml(item?.title || "");
  const author = String(item?.author || item?.owner?.name || "").trim();

  let score = 0;
  if (creatorName) {
    if (author === creatorName) score += 140;
    else if (author.includes(creatorName)) score += 110;
    if (title.includes(creatorName)) score += 35;
  }

  if (optimizedKeyword) {
    if (author.includes(optimizedKeyword)) score += 55;
    if (title.includes(optimizedKeyword)) score += 20;
  }

  if (isCreatorIntent(rawKeyword)) {
    if (!creatorName) score -= 10;
    if (creatorName && !author.includes(creatorName)) score -= 25;
  }

  const pubdate = Number(item?.pubdate || 0);
  score += Math.min(20, Math.max(0, Math.floor(pubdate / (60 * 60 * 24)) % 20));

  return { score, pubdate, author, title };
}

function extractFirstBvidFromBilibiliSearchHtml(html) {
  const content = String(html || "");
  const patterns = [
    /"bvid"\s*:\s*"(BV[a-zA-Z0-9]+)"/,
    /https:\/\/www\.bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/,
    /\/\/www\.bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/
  ];
  for (const re of patterns) {
    const m = content.match(re);
    if (m && m[1]) return m[1];
  }
  return "";
}

async function resolveBilibiliFirstVideoUrlFromSearchHtml(keyword) {
  const q = (keyword || "").trim();
  if (!q) return null;
  const searchUrl = `https://search.bilibili.com/all?keyword=${encodeQuery(q)}`;
  try {
    const resp = await fetch(searchUrl, { method: "GET" });
    if (!resp.ok) return null;
    const html = await resp.text();
    const bvid = extractFirstBvidFromBilibiliSearchHtml(html);
    if (!bvid) return null;
    return `https://www.bilibili.com/video/${bvid}`;
  } catch (e) {
    return null;
  }
}

async function fetchBilibiliSearchApiResults(keyword) {
  const q = (keyword || "").trim();
  if (!q) return null;
  const apiUrl = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeQuery(
    q
  )}`;
  try {
    const resp = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: "https://www.bilibili.com/"
      },
      referrer: "https://www.bilibili.com/"
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const results = Array.isArray(data?.data?.result) ? data.data.result.slice(0, 5) : [];
    return results.length ? results : null;
  } catch (e) {
    return null;
  }
}

async function resolveBilibiliBestVideoUrl(rawKeyword, optimizedKeyword) {
  const q = (optimizedKeyword || "").trim();
  if (!q) return null;

  const results = await fetchBilibiliSearchApiResults(q);

  const creatorNameRaw = extractCreatorName(rawKeyword, optimizedKeyword);
  const creatorName = optimizeSearchKeyword(creatorNameRaw) || creatorNameRaw;
  const wantLatestMode = wantsLatest(rawKeyword) && isCreatorIntent(rawKeyword);
  debugLog("bilibili.resolve.start", { rawKeyword: String(rawKeyword || ""), optimizedKeyword: q, creatorName, wantLatestMode });

  if (!results) {
    debugLog("bilibili.resolve.apiEmptyFallbackHtml", { optimizedKeyword: q });
    return resolveBilibiliFirstVideoUrlFromSearchHtml(q);
  }

  if (wantLatestMode && creatorName) {
    const latest = await resolveBilibiliLatestVideoFromUser(creatorName);
    if (latest) {
      debugLog("bilibili.resolve.latestFromUser", { creatorName, latest });
      return latest;
    }
  }

  if (!wantLatestMode) {
    const first = results[0];
    const url = typeof first?.arcurl === "string" ? first.arcurl.trim() : "";
    const bvid = typeof first?.bvid === "string" ? first.bvid.trim() : "";
    if (url.startsWith("http://") || url.startsWith("https://")) {
      debugLog("bilibili.resolve.firstResult", { mode: "normal", url });
      return url;
    }
    if (bvid) {
      const resolved = `https://www.bilibili.com/video/${bvid}`;
      debugLog("bilibili.resolve.firstResult", { mode: "normal", url: resolved });
      return resolved;
    }
    return null;
  }

  let best = null;
  const candidates = [];
  for (const item of results) {
    const meta = scoreBilibiliResult({ rawKeyword, optimizedKeyword, creatorName, item });
    const url = typeof item?.arcurl === "string" ? item.arcurl.trim() : "";
    const bvid = typeof item?.bvid === "string" ? item.bvid.trim() : "";
    const resolvedUrl =
      url.startsWith("http://") || url.startsWith("https://") ? url : bvid ? `https://www.bilibili.com/video/${bvid}` : "";
    if (!resolvedUrl) continue;

    const candidate = { item, meta, resolvedUrl };
    candidates.push({ author: meta.author, title: meta.title, pubdate: meta.pubdate, score: meta.score, url: resolvedUrl });
    if (!best) {
      best = candidate;
      continue;
    }

    if (wantLatestMode) {
      const aAuthor = String(best.item?.author || best.item?.owner?.name || "");
      const bAuthor = String(item?.author || item?.owner?.name || "");
      const aOk = creatorName && aAuthor.includes(creatorName);
      const bOk = creatorName && bAuthor.includes(creatorName);
      if (bOk && !aOk) {
        best = candidate;
        continue;
      }
      if (bOk && aOk && meta.pubdate > best.meta.pubdate) {
        best = candidate;
        continue;
      }
    }

    if (meta.score > best.meta.score) best = candidate;
    else if (meta.score === best.meta.score && meta.pubdate > best.meta.pubdate) best = candidate;
  }

  debugLog("bilibili.resolve.scored", {
    creatorName,
    optimizedKeyword: q,
    wantLatestMode,
    chosen: best ? { author: best.meta.author, title: best.meta.title, pubdate: best.meta.pubdate, score: best.meta.score, url: best.resolvedUrl } : null,
    candidates
  });
  return best ? best.resolvedUrl : null;
}

async function resolveRedditFirstPostUrl(keyword, latestMode) {
  const q = (keyword || "").trim();
  if (!q) return null;
  const apiUrl = `https://www.reddit.com/search.json?q=${encodeQuery(
    q
  )}&limit=1&type=link${latestMode ? "&sort=new" : ""}`;
  const resp = await fetch(apiUrl, {
    method: "GET",
    headers: { "User-Agent": "DirectGO/0.1" }
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const first = data?.data?.children?.[0]?.data;
  const permalink = typeof first?.permalink === "string" ? first.permalink.trim() : "";
  if (!permalink) return null;
  if (permalink.startsWith("http://") || permalink.startsWith("https://")) return permalink;
  return `https://www.reddit.com${permalink.startsWith("/") ? "" : "/"}${permalink}`;
}

function extractFirstMatch(text, patterns) {
  const content = String(text || "");
  for (const re of patterns) {
    const m = content.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

async function resolveYouTubeFirstVideoUrl(keyword) {
  const q = (keyword || "").trim();
  if (!q) return null;
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeQuery(q)}`;
  const resp = await fetch(searchUrl, { method: "GET" });
  if (!resp.ok) return null;
  const html = await resp.text();
  const videoId = extractFirstMatch(html, [/"videoId":"([a-zA-Z0-9_-]{11})"/]);
  if (!videoId) return null;
  return `https://www.youtube.com/watch?v=${videoId}`;
}

async function resolveYouTubeFirstVideoUrlLatest(keyword) {
  const q = (keyword || "").trim();
  if (!q) return null;
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeQuery(q)}&sp=CAI%253D`;
  const resp = await fetch(searchUrl, { method: "GET" });
  if (!resp.ok) return null;
  const html = await resp.text();
  const videoId = extractFirstMatch(html, [/"videoId":"([a-zA-Z0-9_-]{11})"/]);
  if (!videoId) return null;
  return `https://www.youtube.com/watch?v=${videoId}`;
}

async function resolveTikTokFirstVideoUrl(keyword) {
  const q = (keyword || "").trim();
  if (!q) return null;
  const searchUrl = `https://www.tiktok.com/search?q=${encodeQuery(q)}`;
  const resp = await fetch(searchUrl, { method: "GET" });
  if (!resp.ok) return null;
  const html = await resp.text();
  const full = extractFirstMatch(html, [
    /(https:\/\/www\.tiktok\.com\/@[^"\\]+\/video\/\d+)/,
    /(\/@[^"\\]+\/video\/\d+)/
  ]);
  if (!full) return null;
  if (full.startsWith("http://") || full.startsWith("https://")) return full;
  return `https://www.tiktok.com${full}`;
}

async function resolveDouyinFirstVideoUrl(keyword) {
  const q = (keyword || "").trim();
  if (!q) return null;
  const searchUrl = `https://www.douyin.com/search/${encodeQuery(q)}`;
  const resp = await fetch(searchUrl, { method: "GET" });
  if (!resp.ok) return null;
  const html = await resp.text();
  const full = extractFirstMatch(html, [
    /(https:\/\/www\.douyin\.com\/video\/\d+)/,
    /(\/video\/\d+)/
  ]);
  if (!full) return null;
  if (full.startsWith("http://") || full.startsWith("https://")) return full;
  return `https://www.douyin.com${full}`;
}

async function resolveXhsFirstNoteUrl(keyword) {
  const q = (keyword || "").trim();
  if (!q) return null;
  const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeQuery(q)}`;
  const resp = await fetch(searchUrl, { method: "GET" });
  if (!resp.ok) return null;
  const html = await resp.text();
  const full = extractFirstMatch(html, [
    /(https:\/\/www\.xiaohongshu\.com\/explore\/[0-9a-fA-F]+)/,
    /(https:\/\/www\.xiaohongshu\.com\/discovery\/item\/[0-9a-fA-F]+)/,
    /(\/explore\/[0-9a-fA-F]+)/,
    /(\/discovery\/item\/[0-9a-fA-F]+)/
  ]);
  if (!full) return null;
  if (full.startsWith("http://") || full.startsWith("https://")) return full;
  return `https://www.xiaohongshu.com${full}`;
}

async function resolveFirstResultFromSearchUrl(searchUrl, settings, rawInputText) {
  if (!isSearchUrlEligible(searchUrl, settings)) return null;
  const keyword = extractSearchKeyword(searchUrl);

  try {
    const url = new URL(String(searchUrl));
    const host = url.hostname.toLowerCase();
    const rawForIntent = String(rawInputText || keyword || "").trim();
    const latestMode = wantsLatest(rawForIntent);
    const optimizedKeyword = optimizeSearchKeyword(rawForIntent);
    if (!optimizedKeyword) return null;
    let resolved = null;

    if (host === "search.bilibili.com") {
      debugLog("bilibili.firstResult.start", { rawForIntent, keyword, optimizedKeyword, searchUrl });
      resolved = await withTimeout(resolveBilibiliBestVideoUrl(rawForIntent, optimizedKeyword), 4500);
      debugLog("bilibili.firstResult.done", { resolved: resolved || "", rawForIntent, keyword, optimizedKeyword });
    } else if (host.endsWith("reddit.com")) {
      resolved = await withTimeout(resolveRedditFirstPostUrl(optimizedKeyword, latestMode), 4500);
    } else if (host.endsWith("youtube.com")) {
      resolved = await withTimeout(
        latestMode ? resolveYouTubeFirstVideoUrlLatest(optimizedKeyword) : resolveYouTubeFirstVideoUrl(optimizedKeyword),
        4500
      );
    } else if (host.endsWith("tiktok.com")) {
      resolved = await withTimeout(resolveTikTokFirstVideoUrl(optimizedKeyword), 4500);
    } else if (host.endsWith("douyin.com")) {
      resolved = await withTimeout(resolveDouyinFirstVideoUrl(optimizedKeyword), 4500);
    } else if (host.endsWith("xiaohongshu.com")) {
      resolved = await withTimeout(resolveXhsFirstNoteUrl(optimizedKeyword), 4500);
    }

    if (!resolved) return null;
    try {
      const target = new URL(String(resolved));
      if (!isHostAllowed(target.hostname, settings)) return null;
    } catch (e) {
      return null;
    }
    return resolved;
  } catch (e) {
    return null;
  }
}

function normalizeFallbackSearchEngine(value) {
  return value === "bing" ? "bing" : "google";
}

async function getSettings() {
  const { settings } = await chrome.storage.sync.get("settings");
  const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  merged.apiEndpoint = normalizeEndpoint(merged.apiEndpoint);
  merged.fallbackSearchEngine = normalizeFallbackSearchEngine(merged.fallbackSearchEngine);
  merged.openFirstResultOnSupportedSearch = !!merged.openFirstResultOnSupportedSearch;
  merged.enableDebugLogs = !!merged.enableDebugLogs;
  merged.allowedDomains = normalizeAllowedDomains(merged.allowedDomains);
  merged.keywords = merged.keywords && typeof merged.keywords === "object" ? merged.keywords : {};
  debugLogsEnabled = merged.enableDebugLogs;
  return merged;
}

async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  return (apiKey || "").trim();
}

async function decideByAi({ text, settings, apiKey }) {
  const prompt = `用户输入: "${text}"。
判断用户意图并只返回 JSON（不要包含多余文字、不要代码块）：
- 如果是直达某个站点或服务，返回 {"type":"direct","url":"https://..."}
- 如果是站内搜索或内容检索，返回 {"type":"search","url":"https://..."}
要求：
1) url 必须是可直接打开的完整链接
2) url 必须使用 https（不要输出 http）
3) 如果无法确定，返回 {"type":"unknown"}`;

  const url = buildChatCompletionsUrl(settings.apiEndpoint);
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const body = {
    model: settings.model,
    messages: [
      { role: "system", content: "你是一个浏览器搜索意图路由器。输出必须是严格 JSON。" },
      { role: "user", content: prompt }
    ],
    temperature: 0.2
  };

  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`AI 请求失败: ${resp.status}`);
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  const parsed = safeJsonParse(stripCodeFences(String(content)));
  if (!parsed.ok) return { type: "unknown" };

  const type = parsed.value?.type;
  const decisionUrl = parsed.value?.url;
  if ((type === "direct" || type === "search") && typeof decisionUrl === "string") {
    const normalized = normalizeAiDecisionUrl(decisionUrl);
    if (normalized && !isDisallowedAiDecisionUrl(normalized)) return { type, url: normalized };
  }

  return { type: "unknown" };
}

function resolveBuiltInPlatformSearch(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const m = raw.match(
    /^(?:在)?\s*(b站|B站|哔哩哔哩|bilibili|Bilibili|reddit|Reddit|youtube|YouTube|yt|tiktok|TikTok|x|X|twitter|Twitter|推特|抖音|douyin|Douyin|小红书|xiaohongshu|Xiaohongshu)(?:上|里)?\s*[:：]?\s*(.*)$/u
  );
  if (!m) return null;

  const platform = String(m[1] || "");
  const q = String(m[2] || "").trim();
  if (!q) return null;

  if (/(b站|B站|哔哩哔哩|bilibili|Bilibili)/u.test(platform)) {
    return `https://search.bilibili.com/all?keyword=${encodeQuery(q)}`;
  }
  if (/(reddit|Reddit)/u.test(platform)) {
    return `https://www.reddit.com/search/?q=${encodeQuery(q)}`;
  }
  if (/(youtube|YouTube|yt)/u.test(platform)) {
    return `https://www.youtube.com/results?search_query=${encodeQuery(q)}`;
  }
  if (/(tiktok|TikTok)/u.test(platform)) {
    return `https://www.tiktok.com/search?q=${encodeQuery(q)}`;
  }
  if (/(x|X|twitter|Twitter|推特)/u.test(platform)) {
    return `https://x.com/search?q=${encodeQuery(q)}`;
  }
  if (/(抖音|douyin|Douyin)/u.test(platform)) {
    return `https://www.douyin.com/search/${encodeQuery(q)}`;
  }
  if (/(小红书|xiaohongshu|Xiaohongshu)/u.test(platform)) {
    return `https://www.xiaohongshu.com/search_result?keyword=${encodeQuery(q)}`;
  }

  return null;
}

function resolveKeyword(text, settings) {
  const raw = (text || "").trim();
  if (!raw) return null;

  const parts = raw.split(/\s+/);
  const keyword = parts[0].toLowerCase();
  const template = settings.keywords?.[keyword];
  if (!template) return null;

  const rest = parts.slice(1).join(" ");
  if (settings.preferExactKeywordJump && parts.length === 1) {
    return applyTemplate(template, "");
  }

  return applyTemplate(template, rest);
}

function fallbackUrl(text, settings) {
  const engine = normalizeFallbackSearchEngine(settings?.fallbackSearchEngine);
  if (engine === "bing") return `https://www.bing.com/search?q=${encodeQuery(text)}`;
  return `https://www.google.com/search?q=${encodeQuery(text)}`;
}

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.sync.get("settings");
  if (!settings) await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
});

try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (!changes?.settings) return;
    const next = changes.settings.newValue;
    debugLogsEnabled = !!next?.enableDebugLogs;
    if (!debugLogsEnabled) {
      debugLogQueue = [];
      debugLogFlushScheduled = false;
    }
  });
} catch (e) {}

async function updateTabOrActive(tabId, url) {
  if (typeof tabId === "number") return chrome.tabs.update(tabId, { url });
  return chrome.tabs.update({ url });
}

function isLocalHostname(hostname) {
  const h = String(hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

function normalizeNavigableUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || "").trim());
    if (u.protocol === "https:") return u.toString();
    if (u.protocol === "http:" && isLocalHostname(u.hostname)) return u.toString();
    return null;
  } catch (e) {
    return null;
  }
}

function normalizeAiDecisionUrl(rawUrl) {
  const raw = String(rawUrl || "").trim();
  if (!raw) return null;

  try {
    const direct = new URL(raw);
    if (direct.protocol === "https:") return direct.toString();
    if (direct.protocol === "http:" && isLocalHostname(direct.hostname)) return direct.toString();
    if (direct.protocol === "http:" && direct.hostname) {
      const upgraded = new URL(direct.toString());
      upgraded.protocol = "https:";
      return upgraded.toString();
    }
  } catch (e) {}

  const looksLikeHost =
    raw.startsWith("www.") || /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:[/:?#].*)?$/.test(raw);
  if (!looksLikeHost) return null;

  try {
    const u = new URL(`https://${raw}`);
    if (u.protocol !== "https:") return null;
    return u.toString();
  } catch (e) {
    return null;
  }
}

function shouldSkipAiSearchOverride({ existingUrl, aiUrl }) {
  try {
    const a = new URL(String(existingUrl));
    const b = new URL(String(aiUrl));
    if (a.hostname.toLowerCase() !== b.hostname.toLowerCase()) return false;
    const ap = a.pathname || "";
    const bp = b.pathname || "";
    if (a.hostname.toLowerCase() === "search.bilibili.com") {
      const aOk = ap.startsWith("/all") || ap.startsWith("/video");
      const bOk = bp.startsWith("/all") || bp.startsWith("/video");
      return aOk && bOk;
    }
    return ap === bp;
  } catch (e) {
    return false;
  }
}

async function routeQuery(text, tabId) {
  const settings = await getSettings();
  const fallback = fallbackUrl(text, settings);
  debugLog("routeQuery.start", { text: String(text || ""), tabId: typeof tabId === "number" ? tabId : null });
  const stageRank = { none: 0, fallback: 1, nonAi: 2, ai: 3, direct: 4 };
  let stage = "none";
  let currentUrl = "";
  let timeoutId = null;
  const navigate = async (url, nextStage) => {
    let effectiveStage = nextStage;
    let safeUrl = normalizeNavigableUrl(url);
    if (!safeUrl) {
      if (nextStage === "direct") return;
      safeUrl = normalizeNavigableUrl(fallback);
      effectiveStage = "fallback";
    }
    if ((stageRank[effectiveStage] || 0) < (stageRank[stage] || 0)) return;
    const finalUrl = appendFromParam(safeUrl);
    if (finalUrl === currentUrl && effectiveStage === stage) return;
    stage = effectiveStage;
    currentUrl = finalUrl;
    if (timeoutId && stage === "ai") clearTimeout(timeoutId);
    await updateTabOrActive(tabId, finalUrl);
  };

  try {
    const direct = String(text || "").trim();
    if (direct.startsWith("https://")) {
      const safeDirect = normalizeNavigableUrl(direct);
      if (safeDirect) {
        debugLog("routeQuery.directUrl", { url: safeDirect });
        await navigate(safeDirect, "direct");
        return;
      }
      debugLog("routeQuery.directUrlBlocked", { url: direct });
      await navigate(fallback, "fallback");
      return;
    }
    if (direct.startsWith("http://")) {
      const safeDirect = normalizeNavigableUrl(direct);
      if (safeDirect) {
        debugLog("routeQuery.directUrl", { url: safeDirect });
        await navigate(safeDirect, "direct");
        return;
      }
      debugLog("routeQuery.directUrlBlocked", { url: direct });
      await navigate(fallback, "fallback");
      return;
    }
  } catch (e) {}

  timeoutId = setTimeout(() => {
    debugLog("routeQuery.timeoutFallback", { fallback });
    navigate(fallback, "fallback");
  }, 10000);

  const keywordUrl = resolveKeyword(text, settings);
  if (keywordUrl) {
    debugLog("routeQuery.keyword", { keywordUrl });
    navigate(keywordUrl, "nonAi");
  }

  const builtInUrl = resolveBuiltInPlatformSearch(text);
  if (builtInUrl) {
    debugLog("routeQuery.builtIn", { builtInUrl });
    navigate(builtInUrl, "nonAi");
  }

  const apiKey = await getApiKey();
  if (apiKey) {
    Promise.resolve()
      .then(async () => {
        const decision = await decideByAi({ text, settings, apiKey });
        debugLog("routeQuery.aiDecision", { decision });
        if (decision?.type !== "direct" && decision?.type !== "search") return null;
        if (decision.type === "search" && stage === "nonAi" && currentUrl) {
          const skip = shouldSkipAiSearchOverride({ existingUrl: currentUrl, aiUrl: decision.url });
          if (skip) {
            debugLog("routeQuery.aiSkip", { reason: "sameSearchPage", existing: currentUrl, aiUrl: decision.url });
            return decision.url;
          }
        }
        navigate(decision.url, "ai");
        return decision.url;
      })
      .then((target) => {
        if (target) {
          debugLog("routeQuery.aiNavigate", { target });
          return;
        }
        if (!keywordUrl && !builtInUrl) navigate(fallback, "fallback");
      })
      .catch(() => {
        if (!keywordUrl && !builtInUrl) navigate(fallback, "fallback");
      });
  }

  if (!apiKey && !keywordUrl && !builtInUrl) {
    await navigate(fallback, "fallback");
  }
}

chrome.omnibox.onInputEntered.addListener(async (text) => {
  await routeQuery(text);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "routeQuery") return;
  routeQuery(String(message?.text || ""), sender?.tab?.id)
    .then(() => sendResponse({ ok: true }))
    .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true;
});
