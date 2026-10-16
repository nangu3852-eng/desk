const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMain } = require("./helpers");

test("user profile persists globally and enters every character prompt", () => {
  const app = loadMain();
  app.run('applyChatConfigPatch({userProfile:"我是 C++ 软件工程师，喜欢科幻小说。"})');
  assert.equal(app.run("settingsForStorage().userProfile"), "我是 C++ 软件工程师，喜欢科幻小说。");
  assert.match(app.run("personaInstruction()"), /C\+\+ 软件工程师/);
  app.run('updateSettings({characterId:"luna"})');
  assert.match(app.run("personaInstruction()"), /C\+\+ 软件工程师/);
  app.run('applyChatConfigPatch({userProfile:""})');
  assert.doesNotMatch(app.run("personaInstruction()"), /C\+\+ 软件工程师/);
});

test("overlong profile is rejected", () => {
  const app = loadMain();
  assert.throws(() => app.run('applyChatConfigPatch({userProfile:"x".repeat(3001)})'));
});

test("book questions without imported books do not call a model or pretend to remember", async () => {
  const app = loadMain();
  const result = await app.run('sendChatMessage(null,"这本书主角是谁？")');
  assert.equal(result.ok, false);
  assert.match(result.message.content, /No books are imported yet/);
});
