const { app, BrowserWindow, screen, Menu } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const data = fs.mkdtempSync(path.join(os.tmpdir(), "classic-alice-behavior-"));
const output = path.join(__dirname, "../out/behavior-smoke");
app.setPath("userData", data);
app.disableHardwareAcceleration();
fs.writeFileSync(path.join(data, "settings.json"), JSON.stringify({
  language: "zh-CN", persona: { setupDone: true }, interactionResponses: false,
}));

// The test controls elapsed idle time without adding a production debug API.
const behaviorModule = require("../src/pet-behavior");
let behavior;
const OriginalBehavior = behaviorModule.PetBehavior;
behaviorModule.PetBehavior = class extends OriginalBehavior {
  constructor(...args) { super(...args); behavior = this; }
};
let menuTemplate;
const originalBuild = Menu.buildFromTemplate;
Menu.buildFromTemplate = function(template) {
  if (template.some((item) => ["桌面行为", "Desktop Behavior"].includes(item.label))) menuTemplate = template;
  const menu = originalBuild.call(Menu, template);
  menu.popup = (options) => options.callback?.();
  return menu;
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(40);
  }
  throw new Error(`Timed out: ${label}`);
}
const evaluate = (pet, code) => pet.webContents.executeJavaScript(code, true);
async function capture(pet, name) {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, name + ".png"), (await pet.webContents.capturePage()).toPNG());
}

async function run() {
  require("../src/main");
  await app.whenReady();
  await until(() => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().endsWith("/index.html") && !w.webContents.isLoading()), "pet loaded");
  const pet = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith("/index.html"));
  await until(() => evaluate(pet, "Boolean(spriteImage)"), "classic image loaded");
  const initial = await evaluate(pet, "window.desktopPet.getAppState()");
  assert.equal(initial.activeCharacter.id, "classic-alice");
  assert.equal(initial.activeCharacter.frame.width, 192);
  assert.equal(initial.settings.autoSleep, true);
  assert.equal(initial.settings.proactiveChat, false);
  // A greeting timer is scheduled during renderer startup; let it finish first.
  await delay(3300);
  await evaluate(pet, "dismissBubble()");
  await delay(150);
  await capture(pet, "idle");

  behavior.lastInteraction = Date.now() - 5 * 60 * 1000;
  await until(() => evaluate(pet, "state === 'sleep' && !document.querySelector('#sleep-indicator').hidden"), "automatic sleep and Z");
  await capture(pet, "sleep");
  await evaluate(pet, "document.querySelector('#pet').dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true,clientX:150,clientY:200})); window.dispatchEvent(new PointerEvent('pointerup',{button:0,bubbles:true,clientX:150,clientY:200}))");
  await until(() => evaluate(pet, "petBehavior.mode === 'idle' && document.querySelector('#sleep-indicator').hidden"), "click wakes");
  await delay(700); // Let the normal delayed single-click interaction finish.
  await evaluate(pet, "dismissBubble()");
  await delay(150);

  const displays = screen.getAllDisplays();
  let crossing = null;
  for (const a of displays) for (const b of displays) {
    const left = a.workArea;
    const right = b.workArea;
    const bounds = pet.getBounds();
    const top = Math.max(left.y, right.y);
    const bottom = Math.min(left.y + left.height, right.y + right.height);
    if (a.id === b.id || Math.abs(left.x + left.width - right.x) > 2 || bottom - top < bounds.height) continue;
    crossing = { seam: right.x, top: Math.round(top + (bottom - top - bounds.height) / 2) };
  }
  const start = pet.getBounds();
  pet.setPosition(crossing ? crossing.seam - start.width / 2 - 45 : start.x - 100,
    crossing ? crossing.top : start.y);
  behavior.interact();
  behavior.mode = "walking";
  behavior.direction = 1;
  behavior.x = pet.getBounds().x;
  behavior.walkUntil = Date.now() + 10000;
  const runStart = pet.getBounds();
  await until(() => evaluate(pet, "state === 'runningRight'"), "right running row");
  await until(() => pet.getBounds().x > runStart.x + 65, "native automatic movement");
  if (crossing) assert.ok(pet.getBounds().x + start.width / 2 > crossing.seam, "native window crossed monitor seam");
  await capture(pet, "walking-right");
  behavior.direction = -1;
  await until(() => evaluate(pet, "state === 'runningLeft'"), "left running row");
  await capture(pet, "walking-left");

  await evaluate(pet, "window.desktopPet.setSettings({autoWalk:false,crossDisplays:false})");
  await until(() => behavior.mode === "idle", "walk toggle stops movement");
  const stopped = pet.getBounds();
  await delay(250);
  assert.deepEqual(pet.getBounds(), stopped);
  await evaluate(pet, "window.desktopPet.showContextMenu()");
  await delay(300);
  await until(() => menuTemplate?.some((item) => ["桌面行为", "Desktop Behavior"].includes(item.label)), "behavior menu");
  const desktopMenu = menuTemplate.find((item) => ["桌面行为", "Desktop Behavior"].includes(item.label));
  assert.equal(desktopMenu.submenu.find((item) => item.label === "自动行走").checked, false);
  desktopMenu.submenu.find((item) => item.label.startsWith("主动聊天")).click({ checked: true });
  await until(() => evaluate(pet, "window.desktopPet.getAppState().then(s => s.settings.proactiveChat)"), "proactive chat opt-in");
  desktopMenu.submenu.find((item) => item.label === "立即睡觉").click();
  await until(() => evaluate(pet, "state === 'sleep'"), "manual menu sleep");
  await evaluate(pet, "window.desktopPet.recordPetActivity()");
  await until(() => evaluate(pet, "state === 'idle'"), "manual wake");
  const saved = JSON.parse(fs.readFileSync(path.join(data, "settings.json"), "utf8"));
  assert.equal(saved.characterId, "classic-alice");
  assert.equal(saved.autoWalk, false);
  assert.equal(saved.crossDisplays, false);
  assert.equal(saved.proactiveChat, true);
  const report = { passed: true, classic: true, automaticSleep: true, clickWake: true,
    nativeMovement: true, nativeCrossDisplay: Boolean(crossing), manualSleep: true,
    displays: displays.map(({ bounds, workArea, scaleFactor }) => ({ bounds, workArea, scaleFactor })) };
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(report, null, 2));
  console.log("Behavior smoke PASS", JSON.stringify(report));
}
const watchdog = setTimeout(() => { console.error("Behavior smoke timed out"); finish(1); }, 45000);
run().then(() => finish(0), (error) => { console.error(error); finish(1); });
function finish(code) {
  clearTimeout(watchdog);
  // Keep only screenshots/report, never include isolated settings in releases.
  app.once("will-quit", () => { try { fs.rmSync(data, { recursive: true, force: true }); } catch {} });
  app.exit(code);
}
