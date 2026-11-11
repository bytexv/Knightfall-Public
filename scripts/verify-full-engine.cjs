const { app, BrowserWindow } = require("electron");
const path = require("node:path");
app.setPath(
  "userData",
  require("node:fs").mkdtempSync(
    require("node:path").join(
      require("node:os").tmpdir(),
      "knightfall-web-engine-",
    ),
  ),
);
app.whenReady().then(async () => {
  const { startLanServer } = await import("../server/index.mjs");
  const host = await startLanServer({
    host: "127.0.0.1",
    port: 0,
    staticDir: path.join(__dirname, "..", "dist"),
  });
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  window.webContents.session.webRequest.onCompleted((details) => {
    if (details.url.includes("/engine/full/"))
      console.log("FETCH", details.url, details.statusCode);
  });
  window.webContents.session.webRequest.onErrorOccurred((details) =>
    console.log("NETWORK", details.url, details.error),
  );
  window.webContents.on(
    "console-message",
    (_event, level, message, line, source) =>
      console.log("RENDERER", message, line, source),
  );
  try {
    await window.loadURL("http://127.0.0.1:" + host.port);
    console.log(
      "SW",
      await window.webContents.executeJavaScript(
        "navigator.serviceWorker.getRegistrations().then(rs=>rs.map(r=>({scope:r.scope,active:r.active?.state,installing:r.installing?.state})))",
      ),
    );
    const result =
      await require("../desktop/full-engine-smoke.cjs").verifyFullEngines(
        window,
      );
    require("node:fs").mkdirSync("artifacts/qa/v1.4", { recursive: true });
    require("node:fs").writeFileSync(
      "artifacts/qa/v1.4/full-engines.json",
      JSON.stringify(result, null, 2),
    );
    window.destroy();
    await host.close();
    app.exit(0);
  } catch (error) {
    console.error(error);
    window.destroy();
    await host.close();
    app.exit(1);
  }
});
