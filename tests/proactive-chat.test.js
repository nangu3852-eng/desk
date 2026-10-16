const test = require("node:test");
const assert = require("node:assert/strict");
const { canProactivelyChat, nextProactiveState, localDay } = require("../src/proactive-chat");

test("proactive chat requires opt-in, a configured model and suitable daytime", () => {
  const now = new Date(2026, 9, 16, 14).getTime();
  const base = { now, lastActivity: now - 30 * 60000, enabled: true, configured: true };
  assert.equal(canProactivelyChat(base), true);
  assert.equal(canProactivelyChat({ ...base, enabled: false }), false);
  assert.equal(canProactivelyChat({ ...base, configured: false }), false);
  assert.equal(canProactivelyChat({ ...base, busy: true }), false);
  assert.equal(canProactivelyChat({ ...base, lastActivity: now - 5 * 60000 }), false);
  assert.equal(canProactivelyChat({ ...base, now: new Date(2026, 9, 16, 23).getTime() }), false);
});

test("proactive chat has a two-hour cooldown and two per local day", () => {
  const now = new Date(2026, 9, 16, 14).getTime();
  const base = { now, lastActivity: now - 30 * 60000, enabled: true, configured: true, day: localDay(now) };
  assert.equal(canProactivelyChat({ ...base, lastSent: now - 60000 }), false);
  assert.equal(canProactivelyChat({ ...base, count: 2 }), false);
  assert.deepEqual(nextProactiveState({ day: localDay(now), count: 1 }, now), { day: localDay(now), count: 2, lastSent: now });
});
