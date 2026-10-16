const MAX_BYTES = 256 * 1024;

function decodeXml(value) {
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, entity) => {
      const key = entity.toLowerCase();
      if (key.startsWith("#")) {
        const code = key.startsWith("#x") ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
      }
      return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[key] || whole;
    }).replace(/\s+/g, " ").trim();
}

async function fetchBounded(url, type = "text") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, { redirect: "error", signal: controller.signal,
      headers: { Accept: type === "json" ? "application/json" : "application/rss+xml,application/xml,text/xml" } });
    if (!response.ok || Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("search_unavailable");
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_BYTES) { controller.abort(); throw new Error("search_too_large"); }
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks);
    return type === "json" ? JSON.parse(bytes.toString("utf8")) : bytes.toString("utf8");
  } finally { clearTimeout(timer); }
}

function wantsWeather(text) { return /天气|气温|温度|下雨|降雨|weather|temperature|forecast/i.test(text); }
function wantsLiveSearch(text) {
  return wantsWeather(text) || /搜索|搜一下|查一下|上网查|联网查|最新|新闻|实时|现在几点|今天几号|search (?:for|online)|look up|latest|current news/i.test(text)
    || /(?:是什么|是谁|在哪里|多少|哪一年|何时|为什么|怎么回事|有什么|哪些|who is|what is|when did|where is)/i.test(text);
}

function weatherPlace(text) {
  const input = String(text).trim();
  const match = /(?:请问|帮我查一下|帮我查|查一下|查询|看看|告诉我|今天|明天|后天|现在|这周)?\s*([\u3400-\u9fff]{2,15}(?:市|县|区)?)(?:今(?:天)?|明(?:天)?|后(?:天)?)?\s*(?:的)?(?:天气|气温|温度|降雨|下雨)/.exec(input);
  if (match) return match[1].replace(/^(?:请问|查询|看看|告诉我)/, "").replace(/(?:今天|明天|后天)$/, "");
  return /(?:weather|forecast|temperature)\s+(?:in|for|at)\s+([\p{L} .-]{2,60})/iu.exec(input)?.[1]?.trim() || "";
}

async function searchWeather(text) {
  const place = weatherPlace(text);
  if (!place) throw new Error("weather_place_missing");
  const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geoUrl.searchParams.set("name", place);
  geoUrl.searchParams.set("count", "1");
  geoUrl.searchParams.set("language", "zh");
  const location = (await fetchBounded(geoUrl, "json")).results?.[0];
  if (!location) throw new Error("weather_place_missing");
  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(location.latitude));
  forecastUrl.searchParams.set("longitude", String(location.longitude));
  forecastUrl.searchParams.set("current", "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m");
  forecastUrl.searchParams.set("timezone", "auto");
  const data = await fetchBounded(forecastUrl, "json");
  if (!data.current?.time) throw new Error("weather_unavailable");
  return [{ title: `${location.name}${location.admin1 ? `, ${location.admin1}` : ""} 当前天气`,
    url: forecastUrl.href, text: `观测时间 ${data.current.time}，气温 ${data.current.temperature_2m}°C，湿度 ${data.current.relative_humidity_2m}% ，降水 ${data.current.precipitation} mm，风速 ${data.current.wind_speed_10m} km/h，天气代码 ${data.current.weather_code}。` }];
}

function parseBingRss(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 5).map(([, item]) => {
    const field = (name) => decodeXml(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, "i").exec(item)?.[1] || "");
    const url = field("link");
    if (!/^https:\/\//i.test(url)) return null;
    return { title: field("title").slice(0, 180), url, text: field("description").slice(0, 750) };
  }).filter(Boolean);
}

async function searchWeb(query) {
  if (wantsWeather(query)) {
    try { return await searchWeather(query); } catch { /* General search is a fallback, not a fabricated forecast. */ }
  }
  const url = new URL("https://cn.bing.com/search");
  url.searchParams.set("q", String(query).slice(0, 240));
  url.searchParams.set("format", "rss");
  const results = parseBingRss(await fetchBounded(url));
  if (!results.length) throw new Error("search_no_results");
  return results;
}

module.exports = { wantsWeather, wantsLiveSearch, weatherPlace, parseBingRss, searchWeb };
