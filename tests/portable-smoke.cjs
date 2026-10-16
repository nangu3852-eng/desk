// Runs the built single-file launcher in two isolated locations and checks that
// the selected character and settings travel with its sibling data directory.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const output = path.resolve(__dirname, "../out");
const artifact = path.resolve(__dirname, "../dist/Classic-Alice-0.4.4-win-x64-portable.exe");
const name = path.basename(artifact);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, { timeout: 1500 }, (response) => {
      let value = "";
      response.on("data", (chunk) => { value += chunk; });
      response.on("end", () => {
        try { resolve(JSON.parse(value)); } catch (error) { reject(error); }
      });
    }).on("error", reject);
  });
}

async function until(check, label, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const result = await check(); if (result) return result; } catch { /* Starting up. */ }
    await delay(250);
  }
  throw new Error(`Timed out: ${label}`);
}

async function connectDebugger(port) {
  const target = await until(async () => (await getJson(`http://127.0.0.1:${port}/json/list`))
    .find((item) => item.type === "page" && item.url.endsWith("/index.html")), "pet debugger");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return {
    async evaluate(expression) {
      const result = await command("Runtime.evaluate", { expression,
        awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    },
    close() { socket.close(); },
  };
}

async function runAt(directory, port, change) {
  const exe = path.join(directory, name);
  const child = spawn(exe, [`--remote-debugging-port=${port}`, "--disable-gpu"], {
    cwd: directory, windowsHide: true, stdio: "ignore",
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE")),
  });
  let debuggerSession;
  try {
    debuggerSession = await connectDebugger(port);
    const state = await until(() => debuggerSession.evaluate(
      "window.desktopPet?.getAppState().then(s => ({id:s.settings.characterId,walk:s.settings.autoWalk,sleep:s.settings.autoSleep,cross:s.settings.crossDisplays}))"), "app state");
    assert.equal(state.id, "classic-alice");
    assert.equal(state.walk, change);
    assert.equal(state.sleep, true);
    assert.equal(state.cross, true);
    if (change) {
      await debuggerSession.evaluate("window.desktopPet.setSettings({autoWalk:false})");
      await until(() => debuggerSession.evaluate("window.desktopPet.getAppState().then(s => s.settings.autoWalk === false)"), "saved walking toggle");
    }
    const data = path.join(directory, "data");
    await until(() => fs.existsSync(path.join(data, "settings.json"))
      && fs.existsSync(path.join(data, "characters-state.json")), "local data");
    assert.equal(JSON.parse(fs.readFileSync(path.join(data, "settings.json"))).characterId, "classic-alice");
    if (!change) assert.equal(JSON.parse(fs.readFileSync(path.join(data, "settings.json"))).autoWalk, false);
    console.log(`portable launch PASS: ${directory}, state=${JSON.stringify(state)}`);
  } finally {
    debuggerSession?.close();
    // taskkill /T targets only the launcher started by this test, including its
    // unpacked Electron child; never stop a user-owned executable by name.
    if (child.pid) {
      await new Promise((resolve) => {
        const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.on("exit", resolve); killer.on("error", resolve);
      });
    }
  }
}

async function main() {
  assert.ok(fs.existsSync(artifact), artifact);
  fs.mkdirSync(output, { recursive: true });
  const root = fs.mkdtempSync(path.join(output, "portable-smoke-"));
  const first = path.join(root, "first");
  const second = path.join(root, "relocated");
  assert.equal(fs.existsSync(first), false, "test folder must be fresh");
  assert.equal(fs.existsSync(second), false, "relocation folder must be fresh");
  fs.mkdirSync(first);
  fs.copyFileSync(artifact, path.join(first, name));
  await runAt(first, 19483, true);
  // Copying the complete folder models transferring it to another location;
  // Windows can briefly hold the original EXE open after the launcher exits.
  fs.cpSync(first, second, { recursive: true, errorOnExist: true });
  await runAt(second, 19484, false);
  console.log("portable relocation PASS: settings remain beside the EXE after moving the whole folder");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
