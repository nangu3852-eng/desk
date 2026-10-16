const fs = require("node:fs");
const path = require("node:path");

function portableDataPath({ packaged, platform, executable, portableDirectory }) {
  if (!packaged || platform !== "win32") return null;
  // The single EXE extracts into TEMP so its launcher directory takes priority.
  return path.join(portableDirectory || path.dirname(executable), "data");
}

function configurePortableData(app, env = process.env) {
  const data = portableDataPath({ packaged: app.isPackaged, platform: process.platform,
    executable: process.execPath, portableDirectory: env.PORTABLE_EXECUTABLE_DIR });
  if (!data) return;
  fs.mkdirSync(data, { recursive: true });
  fs.mkdirSync(path.join(data, "browser"), { recursive: true });
  app.setPath("userData", data);
  app.setPath("sessionData", path.join(data, "browser"));
  app.setAppLogsPath(path.join(data, "logs"));
}

module.exports = { portableDataPath, configurePortableData };
