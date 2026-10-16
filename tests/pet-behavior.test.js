const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { PetBehavior, walkingArea, SLEEP_AFTER_MS } = require("../src/pet-behavior");
const { portableDataPath } = require("../src/portable-data");

const bounds = { x: -400, y: 300, width: 320, height: 340 };
const displays = [
  { workArea: { x: -1920, y: 0, width: 1920, height: 1040 } },
  { workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
];
const settings = { autoSleep: true, autoWalk: true, crossDisplays: true, scale: 1 };

test("five minutes without pet interaction sleeps even after automatic walking, then click wakes", () => {
  const pet = new PetBehavior(0, () => 0.75);
  pet.tick({ now: 18000, bounds, displays, settings });
  assert.equal(pet.mode, "walking");
  assert.equal(pet.tick({ now: SLEEP_AFTER_MS - 1, bounds, displays, settings }).mode, "idle");
  assert.equal(pet.tick({ now: SLEEP_AFTER_MS, bounds, displays, settings }).mode, "sleep");
  pet.interact(SLEEP_AFTER_MS + 1);
  assert.equal(pet.mode, "idle");
  assert.equal(pet.tick({ now: SLEEP_AFTER_MS + 1000, bounds, displays, settings }).mode, "idle");
});

test("conversation and drag hold movement and postpone automatic sleep", () => {
  const pet = new PetBehavior(0, () => 0.75);
  assert.equal(pet.tick({ now: SLEEP_AFTER_MS, bounds, displays, settings, blocked: true }).mode, "idle");
  assert.equal(pet.tick({ now: SLEEP_AFTER_MS + 1, bounds, displays, settings }).mode, "sleep");
  pet.interact(400000);
  pet.tick({ now: 420000, bounds, displays, settings });
  assert.equal(pet.mode, "walking");
  assert.equal(pet.tick({ now: 420033, bounds, displays, settings, blocked: true }).mode, "idle");
});

test("a rightward run crosses the seam of negative-origin monitors without reversing", () => {
  const pet = new PetBehavior(0, () => 0.75);
  let current = { ...bounds };
  for (let now = 18000; now <= 28000; now += 33) {
    const result = pet.tick({ now, bounds: current, displays, settings });
    if (result.position) current = { ...current, ...result.position };
    assert.equal(result.direction, 1);
  }
  assert.ok(current.x > 0, `Expected actual crossing: ${current.x}`);
  assert.ok(current.x < 1600);
});

test("outer edge bounces and disabling cross-screen keeps the entire window on one display", () => {
  const local = walkingArea(bounds, displays, false);
  assert.equal(local.maxX, -320);
  const pet = new PetBehavior(0, () => 0.75);
  const edge = { ...bounds, x: 1599 };
  const result = pet.tick({ now: 18000, bounds: edge, displays, settings });
  assert.equal(result.position.x, 1600);
  assert.equal(result.direction, -1);
  pet.interact(19000);
  assert.equal(pet.tick({ now: 40000, bounds, displays, settings: { ...settings, autoWalk: false } }).mode, "idle");
});

test("staggered screens share a safe vertical corridor; gaps and too-small overlap are excluded", () => {
  const offset = [displays[0], { workArea: { x: 0, y: 180, width: 2560, height: 1400 } }];
  assert.deepEqual(walkingArea(bounds, offset), { minX: -1920, maxX: 2240, minY: 180, maxY: 700 });
  assert.equal(walkingArea(bounds, [displays[0], { workArea: { x: 20, y: 0, width: 1920, height: 1040 } }]).maxX, -320);
  assert.equal(walkingArea(bounds, [displays[0], { workArea: { x: 0, y: 900, width: 1920, height: 1040 } }]).maxX, -320);
});

test("unsupported characters do not sleep, while manual sleep is independent of automatic sleep toggle", () => {
  const pet = new PetBehavior(0);
  assert.notEqual(pet.tick({ now: SLEEP_AFTER_MS, bounds, displays, settings, canSleep: false }).mode, "sleep");
  pet.sleep();
  assert.equal(pet.tick({ now: SLEEP_AFTER_MS + 1, bounds, displays, settings: { ...settings, autoSleep: false } }).mode, "sleep");
});

test("packaged portable data follows launcher directory rather than extracted temporary executable", () => {
  const common = { packaged: true, platform: "win32", executable: path.join("temporary", "pet.exe") };
  assert.equal(portableDataPath({ ...common, portableDirectory: "launcher-folder" }), path.join("launcher-folder", "data"));
  assert.equal(portableDataPath(common), path.join("temporary", "data"));
  assert.equal(portableDataPath({ ...common, packaged: false }), null);
});
