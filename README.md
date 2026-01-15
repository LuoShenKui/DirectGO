# 目的：
    实现一个“直达搜索”的 谷歌浏览器插件MVP（最小可行性产品），其核心逻辑是将**“搜索框”变成一个“意图路由器”**。

# 功能：
    1. 当用户在搜索框中输入查询时，插件会根据查询内容判断用户的意图。
    2. 插件会将用户的意图路由到相应的搜索引擎或服务。
    3. 插件会在搜索结果页面显示路由后的结果。

# 核心架构设计 (The "Direct-Go" Logic)
你的 MVP 只需要三个组件：
- 输入端 (Omnibox)：一个简单的网页搜索框或浏览器地址栏拦截。
- 大脑 (Intent Router)：利用用户自己填的AI API Key，也支持轻量级 LLM（如 DeepSeek-7B 或 GPT-4o-mini）等本地大模型，判断用户是想“看网页”还是“搜信息”。默认是让用户自己填写API Key。要安全地存储用户输入的 API Key。
- 执行端 (Action Executer)：直接触发 window.location.href 跳转。    


# 技术实现方案：浏览器插件版 (最推荐)
这是最符合你“直达”理念的形式，因为它直接接管了用户的浏览入口。

## 第一步：编写 manifest.json (声明权限)
```
JSON

{
  "manifest_version": 3,
  "name": "Direct-Link AI",
  "version": "1.0",
  "permissions": ["storage", "tabs", "webRequest"],
  "background": { "service_worker": "background.js" },
  "omnibox": { "keyword": "dg" } 
}
```

注：用户在地址栏输入 dg + 空格 即可唤起你的 AI。

## 第二步：编写 background.js (意图路由)
这里是关键。当用户输入内容时，调用 AI 接口判断目的地。

```
JavaScript

chrome.omnibox.onInputEntered.addListener(async (text) => {
  // 1. 调用轻量级 AI 接口判断意图
  const prompt = `用户输入: "${text}"。
  如果是搜索具体品牌或站名(如:Steam, Reddit)，输出 {"type": "direct", "url": "对应的官网URL"}。
  如果是搜新闻/内容(如:B站新闻)，输出 {"type": "search", "url": "站内搜索结果页URL"}。
  只返回 JSON。`;

  const response = await fetch('你的AI接口API', { ... });
  const decision = await response.json();

  // 2. 命中唯一词或明确意图，直接“闪现”
  if (decision.type === 'direct' || decision.type === 'search') {
    chrome.tabs.update({ url: decision.url });
  } else {
    // 3. 模糊意图，退回到你自己的 AI 结果页
    chrome.tabs.update({ url: `https://direct-go.com/ai-search?q=${text}` });
  }
});
```

### MVP 插件的配置页面设计

可以仿照 **"ChatGPT Sidebar"** 或一些开源项目的逻辑，在插件的 `options.html`（设置页）里这样写：

> **配置您的 AI 大脑**
>
> 1. **选择模型**：[DeepSeek-V3 / GPT-4o-mini]
> 2. **API Endpoint**：`https://api.deepseek.com` (默认)
> 3. **API Key**：`sk-xxxxxxxxxxxx`
> 4. **直达偏好**：[X] 命中唯一词时强制跳转  [X] 模糊意图时打开 B 站/知乎/Reddit 搜索

## 其他

### 可以支持 **Ollama**：

- 用户如果在本地跑了一个 Llama 3 或 DeepSeek 的本地版，插件直接调用 `localhost:11434`。

### “唯一词”的私有化（MVP 的杀手锏）

可以加一个功能：**允许用户自己定义唯一词。**

- 用户设置：输入 `reddit` 直接跳转到 `reddit.com` 的 Reddit 搜索结果页。