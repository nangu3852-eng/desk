const test = require("node:test");
const assert = require("node:assert/strict");
const { wantsLiveSearch, weatherPlace, parseBingRss } = require("../src/live-search");

test("detects weather and explicit search while leaving casual chat alone", () => {
  assert.equal(wantsLiveSearch("北京今天天气怎么样"), true);
  assert.equal(weatherPlace("北京今天天气怎么样"), "北京");
  assert.equal(weatherPlace("帮我查一下成都天气"), "成都");
  assert.equal(wantsLiveSearch("帮我搜索一下相关新闻"), true);
  assert.equal(wantsLiveSearch("你今天过得怎么样"), false);
});

test("extracts bounded HTTPS result snippets", () => {
  const hits = parseBingRss("<rss><item><title>A &amp; B</title><link>https://example.com/a</link><description><![CDATA[Some <b>text</b>]]></description></item><item><title>bad</title><link>http://example.com</link></item></rss>");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].title, "A & B");
  assert.equal(hits[0].text, "Some text");
});
