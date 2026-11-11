/* Standalone source-only acceptance for the real board renderer.
 * npx electron scripts/native-board-motion.cjs --ozone-platform=headless --disable-gpu
 * This bundles an isolated fixture, never reads or writes a player profile, and does not change dist/.
 */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { build } = require("esbuild");
const project = path.resolve(__dirname, "..");
const output = path.join(project, "artifacts/qa/board-motion");
app.setPath(
  "userData",
  path.join(os.tmpdir(), `knightfall-board-motion-profile-${process.pid}`),
);
app.disableHardwareAcceleration();
// The final report/cleanup decides the exit status, including after a failed check.
app.on("window-all-closed", () => {});
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = {
  startedAt: new Date().toISOString(),
  electron: process.versions.electron,
  platform: process.platform,
  checks: [],
  rendererErrors: [],
};
const check = (condition, label) => {
  if (!condition) throw new Error(label);
  report.checks.push(label);
};
let server, window, temp;
async function run() {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "knightfall-board-motion-"));
  await build({
    stdin: {
      contents: `
    import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {flushSync} from 'react-dom';
    import {Chess} from 'chess.js';
    import ChessBoard from './src/components/ChessBoard';
    function Fixture(){
      const [state,setState]=useState({fen:new Chess().fen(),orientation:'w'});
      window.motionTest={
        set(fen,orientation='w'){flushSync(()=>setState({fen,orientation}))},
        move(san){const game=new Chess(state.fen);game.move(san);flushSync(()=>setState({...state,fen:game.fen()}))},
        resize(width){document.getElementById('root').style.width=width+'px'},
        fen:state.fen,
      };
      return <ChessBoard {...state} onMove={(from,to,promotion)=>{const game=new Chess(state.fen);game.move({from,to,promotion});setState({...state,fen:game.fen()})}}/>;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `,
      loader: "tsx",
      sourcefile: "board-motion-fixture.tsx",
      resolveDir: project,
    },
    bundle: true,
    outfile: path.join(temp, "fixture.js"),
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
  });
  server = http.createServer(async (req, res) => {
    try {
      let file;
      if (req.url === "/") {
        res.setHeader("Content-Type", "text/html");
        return res.end(
          '<!doctype html><html><head><link rel="stylesheet" href="/fixture.css"><style>body{margin:16px;background:#f8f8ef}#root{width:min(640px,calc(100vw - 32px))}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
        );
      }
      if (req.url === "/fixture.js" || req.url === "/fixture.css")
        file = path.join(temp, req.url.slice(1));
      else if (/^\/pieces\/[wb][KQRBNP]\.svg$/.test(req.url))
        file = path.join(project, "public", req.url.slice(1));
      if (!file) {
        res.statusCode = 404;
        return res.end();
      }
      res.setHeader(
        "Content-Type",
        file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : "image/svg+xml",
      );
      res.end(await fs.readFile(file));
    } catch (error) {
      res.statusCode = 500;
      res.end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  window = new BrowserWindow({
    width: 900,
    height: 900,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  window.webContents.on("console-message", (event) => {
    if (event.level === "error") report.rendererErrors.push(event.message);
  });
  await window.loadURL(`http://127.0.0.1:${server.address().port}`);
  window.showInactive();
  const evaluate = (source) =>
    window.webContents.executeJavaScript(source, true);
  await pause(150);
  const initial = await evaluate("window.motionTest.fen");
  const set = async (fen, orientation = "w") =>
    evaluate(
      `window.motionTest.set(${JSON.stringify(fen)},${JSON.stringify(orientation)})`,
    );
  const move = async (san) =>
    evaluate(`window.motionTest.move(${JSON.stringify(san)})`);
  const state = () =>
    evaluate(
      `(()=>{const board=document.querySelector('.chessboard').getBoundingClientRect();return {width:board.width,ghosts:[...document.querySelectorAll('.board-motion-piece')].map(p=>{const r=p.getBoundingClientRect();return {square:p.dataset.motionSquare,x:r.left-board.left,y:r.top-board.top,width:r.width,images:p.querySelectorAll('img').length,capture:p.classList.contains('is-capture'),drag:p.classList.contains('is-dragging'),src:p.querySelector('img').getAttribute('src')}}),hidden:document.querySelectorAll('.square img[style*="hidden"]').length}})()`,
    );
  const center = async (square) =>
    evaluate(
      `(()=>{const r=document.querySelector('[data-square="${square}"]').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`,
    );
  const mouse = async (type, point) =>
    window.webContents.sendInputEvent({
      type,
      ...point,
      button: "left",
      clickCount: 1,
    });

  await move("e4");
  const start = await state();
  await pause(60);
  const middle = await state();
  check(
    start.ghosts.some((p) => p.square === "e4"),
    "a legal move creates a piece-specific animation",
  );
  check(
    middle.ghosts[0]?.y > 320 && middle.ghosts[0]?.y < 480,
    "a real animation frame lies between source and destination",
  );
  const e7 = await center("e7");
  await mouse("mouseDown", e7);
  await mouse("mouseUp", e7);
  await pause(25);
  check(
    await evaluate('document.querySelectorAll(".legal-dot").length===2'),
    "legal input remains available during motion",
  );
  await pause(220);
  check(
    (await state()).ghosts.length === 0 && (await state()).hidden === 0,
    "finished animation restores the ordinary piece without ghosts",
  );

  await set(initial);
  await pause(220);
  await move("e4");
  await pause(35);
  const continuity = await evaluate(
    `(()=>{const board=document.querySelector('.chessboard').getBoundingClientRect();const before=document.querySelector('[data-motion-square="e4"]').getBoundingClientRect().top-board.top;motionTest.set(${JSON.stringify(initial)});const after=document.querySelector('[data-motion-square="e2"]').getBoundingClientRect().top-board.top;return Math.abs(before-after)})()`,
  );
  check(
    continuity < 2,
    "rapid reverse replay rebases from the current visual location",
  );
  await set(initial, "b");
  check(
    (await state()).ghosts.length === 0,
    "orientation changes cancel motion without a displaced ghost",
  );

  await set("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  await move("O-O");
  check(
    (await state()).ghosts.filter((p) => ["g1", "f1"].includes(p.square))
      .length === 2,
    "castling animates both king and rook",
  );
  await set("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1");
  await move("exd5");
  check(
    (await state()).ghosts.some((p) => p.capture && p.src.endsWith("bP.svg")),
    "captures fade the captured piece separately",
  );
  await set("8/P7/8/8/8/6k1/8/6K1 w - - 0 1");
  await move("a8=N");
  check(
    (await state()).ghosts.some((p) => p.square === "a8" && p.images === 2),
    "underpromotion crossfades the travelling pawn into a knight",
  );

  await set(initial);
  await move("e4");
  await pause(35);
  const resized = await evaluate(
    `(()=>{const get=()=>{const b=document.querySelector('.chessboard').getBoundingClientRect(),p=document.querySelector('[data-motion-square="e4"]').getBoundingClientRect();return {width:b.width,y:(p.top-b.top)/b.height}};const before=get();motionTest.resize(320);return {before,after:get()}})()`,
  );
  check(
    resized.before.width === 640 &&
      resized.after.width === 320 &&
      Math.abs(resized.before.y - resized.after.y) < 0.01,
    "resizing preserves the animated position in board-relative coordinates",
  );
  await evaluate("motionTest.resize(640)");

  await set(initial);
  await pause(220);
  const e2 = await center("e2"),
    e4 = await center("e4");
  await mouse("mouseMove", e2);
  await mouse("mouseDown", e2);
  await mouse("mouseMove", e4);
  await pause(30);
  check(
    (await state()).ghosts.some((p) => p.drag && Math.abs(p.y - 320) < 2),
    "native pointer dragging follows the piece to the destination",
  );
  await mouse("mouseUp", e4);
  await pause(20);
  const dropped = await state();
  check(
    dropped.ghosts.every((p) => !p.drag) &&
      dropped.ghosts.some((p) => p.square === "e4" && Math.abs(p.y - 320) < 2),
    "native drop settles from the pointer without a source-square snapback",
  );

  window.webContents.debugger.attach("1.3");
  await window.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await pause(40);
  await set(initial);
  await move("e4");
  check(
    (await state()).ghosts.length === 0 && (await state()).hidden === 0,
    "reduced-motion preference renders the committed position immediately",
  );
  window.webContents.debugger.detach();
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(
    path.join(output, "board-final.png"),
    (await window.webContents.capturePage()).toPNG(),
  );
  report.finishedAt = new Date().toISOString();
  report.success = true;
}
app
  .whenReady()
  .then(run)
  .catch((error) => {
    report.success = false;
    report.error = error.stack;
    console.error(error);
  })
  .finally(async () => {
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
    if (window && !window.isDestroyed()) window.destroy();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (temp) await fs.rm(temp, { recursive: true, force: true });
    app.exit(report.success ? 0 : 1);
  });
