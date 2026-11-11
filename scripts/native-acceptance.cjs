/* Detailed acceptance against the real, sandboxed Electron renderer.
 * Run only through: electron . --acceptance-test --acceptance-output=artifacts/qa/acceptance
 * The main-process hook creates a fresh temporary userData directory; no existing user profile is used.
 */
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { Chess } = require("chess.js");
const { WebSocket } = require("ws");
const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const fixtureRoot = path.resolve(__dirname, "..");

async function dataFixture(relativePath, marker) {
  const source = await fs.readFile(
    path.join(fixtureRoot, relativePath),
    "utf8",
  );
  const start = source.indexOf(marker);
  if (start < 0)
    throw new Error(`Missing acceptance fixture marker in ${relativePath}`);
  const text = source.slice(start + marker.length);
  // These are repository-owned JavaScript array literals; allow ordinary source
  // formatting (single quotes/trailing commas) without importing TypeScript.
  const literal = text.slice(0, text.lastIndexOf("];") + 1).trim();
  return vm.runInNewContext(`(${literal})`, Object.create(null), {
    timeout: 1000,
  });
}

async function runAcceptance({ window, app, outputDir }) {
  if (!process.argv.includes("--acceptance-test") || app.isPackaged)
    throw new Error(
      "Detailed acceptance is source-only and requires --acceptance-test.",
    );
  const profile = app.getPath("userData");
  if (
    !path.resolve(profile).startsWith(path.resolve(os.tmpdir()) + path.sep) ||
    !path.basename(profile).startsWith("knightfall-desktop-smoke-")
  )
    throw new Error(
      "Acceptance requires an isolated temporary Knightfall profile.",
    );
  outputDir = path.resolve(outputDir);
  const exportsDir = path.join(outputDir, "exports");
  await fs.mkdir(exportsDir, { recursive: true });
  const report = {
    startedAt: new Date().toISOString(),
    platform: process.platform,
    electron: process.versions.electron,
    isolatedProfile: profile,
    steps: [],
    screenshots: [],
    downloads: [],
    blockedExternalRequests: [],
    rendererErrors: [],
  };
  const session = window.webContents.session;
  const origin = new URL(window.webContents.getURL()).origin;
  const localOrigins = new Set([origin]);
  let currentStep = "initialization";
  let downloadNumber = 0;
  const evaluate = async (code) => {
    try {
      return await window.webContents.executeJavaScript(code, true);
    } catch (error) {
      throw new Error(
        `${currentStep}: renderer evaluation failed: ${error.message}`,
      );
    }
  };
  const check = (condition, message) => {
    if (!condition) throw new Error(`${currentStep}: ${message}`);
  };
  const poll = async (expression, label, timeout = 15000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const result = await evaluate(expression);
      if (result) return result;
      await wait(80);
    }
    throw new Error(`${currentStep}: timed out waiting for ${label}`);
  };
  const click = async (selector) => {
    await evaluate(
      `(() => { const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw new Error('Missing control: '+${JSON.stringify(selector)});if(element.disabled)throw new Error('Disabled control: '+${JSON.stringify(selector)});element.click(); })()`,
    );
    await wait(45);
  };
  const clickText = async (text, selector = "button") => {
    await evaluate(
      `(() => { const text=${JSON.stringify(text)};const element=[...document.querySelectorAll(${JSON.stringify(selector)})].find(element=>element.textContent.trim()===text);if(!element)throw new Error('Missing button: '+text);if(element.disabled)throw new Error('Disabled button: '+text);element.click(); })()`,
    );
    await wait(60);
  };
  const fill = async (selector, value) => {
    await evaluate(
      `(() => {const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw new Error('Missing field: '+${JSON.stringify(selector)});const prototype=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await wait(60);
  };
  const navigate = async (label) => {
    await evaluate(
      `(() => {const menu=document.querySelector('[aria-label="Open navigation"]');if(menu&&getComputedStyle(menu).display!=='none'&&!document.querySelector('.sidebar.is-open'))menu.click();})()`,
    );
    await wait(50);
    await evaluate(
      `(() => {const label=${JSON.stringify(label)};const item=[...document.querySelectorAll('.nav-item')].find(item=>(item.getAttribute('aria-label')||item.querySelector('span')?.textContent||'').trim()===label);if(!item)throw new Error('Missing navigation: '+label);item.click();})()`,
    );
    await wait(120);
  };
  const game = () =>
    evaluate("JSON.parse(localStorage.getItem('knightfall:current')||'null')");
  const boardMove = async (from, to, promotion) => {
    await click(`[data-square="${from}"]`);
    await click(`[data-square="${to}"]`);
    if (promotion) {
      const names = { q: "queen", r: "rook", b: "bishop", n: "knight" };
      await click(`[aria-label="Promote to ${names[promotion]}"]`);
    }
  };
  const inspectLayout = async () => {
    const geometry = await evaluate(
      `(() => {const viewport={width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth};const cells=[...document.querySelectorAll('.chessboard .square')].map(cell=>cell.getBoundingClientRect());return {...viewport,boardCells:cells.length,nonSquareCells:cells.filter(cell=>Math.abs(cell.width-cell.height)>1.1).length,brokenImages:[...document.images].filter(image=>image.complete&&image.naturalWidth===0).map(image=>image.getAttribute('src'))};})()`,
    );
    check(
      geometry.scrollWidth <= geometry.width + 1,
      `Horizontal overflow: ${JSON.stringify(geometry)}`,
    );
    check(
      geometry.nonSquareCells === 0,
      `Board cells are not square: ${JSON.stringify(geometry)}`,
    );
    check(
      geometry.brokenImages.length === 0,
      `Broken local image assets: ${JSON.stringify(geometry.brokenImages)}`,
    );
    return geometry;
  };
  const captureResponsive = async (name) => {
    window.setMinimumSize(320, 280);
    window.showInactive();
    await evaluate(
      "document.querySelector('[aria-label=\"Dismiss notification\"]')?.click()",
    );
    for (const [width, height] of [
      [1440, 980],
      [390, 844],
      [844, 390],
    ]) {
      window.setContentSize(width, height);
      await wait(250);
      await poll(`innerWidth===${width}`, `viewport width ${width}`, 4000);
      await evaluate("window.scrollTo(0,0)");
      await wait(120);
      const geometry = await inspectLayout();
      const screenshot = path.join(outputDir, `${name}-${width}.png`);
      await fs.writeFile(
        screenshot,
        (await window.webContents.capturePage()).toPNG(),
      );
      report.screenshots.push({
        page: name,
        width,
        height,
        screenshot,
        geometry,
      });
      if (name === "analysis" && width === 390) {
        await evaluate(
          "document.querySelector('.analysis-card')?.scrollIntoView({block:'start'})",
        );
        await wait(120);
        const detail = path.join(outputDir, "analysis-detail-390.png");
        await fs.writeFile(
          detail,
          (await window.webContents.capturePage()).toPNG(),
        );
        report.screenshots.push({
          page: "analysis-detail",
          width,
          height,
          screenshot: detail,
        });
      }
    }
    window.setContentSize(1440, 980);
    await wait(180);
    await evaluate("window.scrollTo(0,0)");
  };
  const observeEngine = () =>
    evaluate(`(() => {
    if(window.__knightfallAcceptanceObserved)return;
    window.__knightfallAcceptanceObserved=true;
    window.__knightfallAcceptanceEngine=[];
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker {
      constructor(...args){super(...args);if(String(args[0]).includes('stockfish.js'))this.addEventListener('message',event=>{if(typeof event.data==='string'&&/^(uciok|readyok|bestmove )/.test(event.data)){window.__knightfallAcceptanceEngine.push({message:event.data,time:performance.now()});if(window.__knightfallAcceptanceEngine.length>200)window.__knightfallAcceptanceEngine.shift();}});}
    };
  })()`);
  const consoleListener = (event) => {
    if (event.level === "error" || event.level === 3)
      report.rendererErrors.push(event.message);
  };
  window.webContents.on("console-message", consoleListener);
  // Simulate unavailable internet while preserving the app's own loopback HTTP transport.
  session.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
    (details, callback) => {
      const allowed = [...localOrigins].some((local) =>
        details.url.startsWith(local + "/"),
      );
      if (!allowed) report.blockedExternalRequests.push(details.url);
      callback({ cancel: !allowed });
    },
  );
  const downloadListener = (_event, item, contents) => {
    if (contents !== window.webContents) return;
    const filename = `${String(++downloadNumber).padStart(2, "0")}-${path.basename(item.getFilename()).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const destination = path.join(exportsDir, filename);
    const record = {
      path: destination,
      state: "progressing",
      filename: item.getFilename(),
    };
    report.downloads.push(record);
    item.setSavePath(destination);
    item.once("done", (_event, state) => {
      record.state = state;
    });
  };
  session.on("will-download", downloadListener);
  const exportCurrent = async () => {
    const before = report.downloads.length;
    await click('[aria-label="Export PGN game"]');
    const end = Date.now() + 10000;
    while (
      Date.now() < end &&
      (report.downloads.length === before ||
        report.downloads.at(-1).state === "progressing")
    )
      await wait(60);
    const download = report.downloads.at(-1);
    check(
      report.downloads.length === before + 1 && download.state === "completed",
      "PGN download did not complete",
    );
    const pgn = await fs.readFile(download.path, "utf8");
    const chess = new Chess();
    chess.loadPgn(pgn);
    return { pgn, chess, path: download.path };
  };
  const step = async (name, action) => {
    currentStep = name;
    const started = Date.now();
    const detail = await action();
    report.steps.push({ name, durationMs: Date.now() - started, detail });
    process.stdout.write(`ACCEPTANCE_STEP ${name} passed\n`);
  };
  const reloadLocalApp = async () => {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Offline reload timed out")),
        15000,
      );
      window.webContents.once("did-finish-load", () => {
        clearTimeout(timer);
        resolve();
      });
      window.webContents.reload();
    });
    await poll("!!document.querySelector('.chessboard')", "reloaded local app");
    await observeEngine();
  };

  try {
    await poll("!!document.querySelector('.chessboard')", "initial board");
    await observeEngine();
    if (
      await evaluate("!!document.querySelector('[aria-label=\"Mute sounds\"]')")
    )
      await click('[aria-label="Mute sounds"]');

    await step("personalized-heading-and-recent-game-resume", async () => {
      await click('[aria-label="Your profile"]');
      await fill("#player-name", "Alex");
      await navigate("Play chess");
      check(
        await evaluate(
          "document.querySelector('.page-heading h1')?.textContent==='Alex’s board'&&document.querySelector('.profile-avatar')?.textContent.trim()==='AL'",
        ),
        "The board heading and profile initials did not follow the saved name",
      );
      await clickText("Pass & play");
      await evaluate(
        "(() => {const unlimited=[...document.querySelectorAll('.time-picker button')].find(button=>button.textContent.includes('∞'));if(!unlimited)throw new Error('Untimed option unavailable');unlimited.click();})()",
      );
      await clickText("Start local game");
      await boardMove("d2", "d4");
      await boardMove("d7", "d5");
      await poll(
        "JSON.parse(localStorage.getItem('knightfall:current')||'null')?.moves.length===2",
        "two-ply game for the recent-games sidebar",
      );
      const saved = await game();
      await navigate("Settings");
      const archived = await evaluate(
        `JSON.parse(localStorage.getItem('knightfall:games')||'[]').find(game=>game.id===${JSON.stringify(saved.id)})`,
      );
      check(
        archived?.fen === saved.fen && archived.moves.length === 2 &&
          archived.mode === "local" && !archived.started,
        "Leaving the board did not save the paused local game",
      );
      await reloadLocalApp();
      check(
        await evaluate(
          "document.querySelector('.page-heading h1')?.textContent==='Alex’s board'&&document.querySelector('.profile-avatar')?.textContent.trim()==='AL'",
        ),
        "The personalized board heading did not survive an offline reload",
      );
      check(
        await evaluate(
          "document.querySelector('.sidebar-recent .recent-game > span')?.textContent==='Pass & play'&&document.querySelector('.sidebar-recent .recent-game > small')?.textContent.includes('Continue')",
        ),
        "The saved unfinished game is missing from the recent-games sidebar",
      );
      window.setMinimumSize(320, 280);
      window.setContentSize(390, 844);
      await poll("innerWidth===390", "phone viewport for the recent-game menu");
      await click('[aria-label="Open navigation"]');
      await poll(
        "!!document.querySelector('.sidebar.is-open')",
        "phone navigation opened",
      );
      await click(".sidebar-recent .recent-game");
      await poll(
        "JSON.parse(localStorage.getItem('knightfall:current')||'null')?.started===true&&!document.querySelector('.sidebar.is-open')&&!document.querySelector('.nav-scrim')",
        "recent game resumed and phone navigation closed",
      );
      const resumed = await game();
      check(
        resumed.id === saved.id && resumed.fen === saved.fen &&
          resumed.mode === "local" && resumed.moves.length === 2,
        "The sidebar resumed a different game, position, or mode",
      );
      check(
        await evaluate(
          "document.querySelector('.page-heading h1')?.textContent==='Alex’s board'&&document.querySelector('[data-square=\"d4\"] img')?.getAttribute('src').endsWith('wP.svg')&&document.querySelector('[data-square=\"d5\"] img')?.getAttribute('src').endsWith('bP.svg')&&JSON.parse(localStorage.getItem('knightfall:settings')||'null')?.name==='Alex'",
        ),
        "The resumed board or saved profile does not match the prior game",
      );
      await captureResponsive("personal-board");
      return {
        persistedName: "Alex",
        heading: "Alex’s board",
        resumedGameId: resumed.id,
        moves: resumed.moves.map(move => move.san),
        fen: resumed.fen,
        resumedVia: "Recent games sidebar after offline reload",
        phoneNavigationClosed: true,
      };
    });

    await step("complete-local-game", async () => {
      await clickText("New game", ".page-heading button");
      await clickText("Pass & play");
      await evaluate(
        "(() => {const unlimited=[...document.querySelectorAll('.time-picker button')].find(button=>button.textContent.includes('∞'));if(!unlimited)throw new Error('Untimed option unavailable');unlimited.click();})()",
      );
      await clickText("Start local game");
      const line = [
        ["e2", "e4"],
        ["e7", "e5"],
        ["f1", "c4"],
        ["b8", "c6"],
        ["d1", "h5"],
        ["g8", "f6"],
        ["h5", "f7"],
      ];
      for (let index = 0; index < line.length; index++) {
        await boardMove(...line[index]);
        await poll(
          `JSON.parse(localStorage.getItem('knightfall:current')||'null')?.moves.length===${index + 1}`,
          `played half-move ${index + 1}`,
        );
      }
      const played = await game();
      const chess = new Chess(played.startFen);
      for (const move of played.moves) chess.move(move);
      check(
        chess.isCheckmate() && played.result?.winner === "w",
        "The seven-ply game did not finish in White checkmate",
      );
      check(
        await evaluate(
          "document.querySelector('.game-result')?.textContent.includes('Checkmate')",
        ),
        "Checkmate is not visible",
      );
      return {
        moves: played.moves.map((move) => move.san),
        result: played.result,
        fen: played.fen,
      };
    });

    await step("real-local-analysis-and-review", async () => {
      await navigate("Analysis");
      await click('.move-list button[data-ply="0"]');
      await poll(
        "document.querySelectorAll('.engine-line').length>0&&document.querySelector('.evaluation-summary strong')?.textContent!=='—'",
        "Stockfish principal variations",
        25000,
      );
      const indicator = await evaluate(
        "document.querySelector('.engine-indicator')?.textContent",
      );
      check(
        /Stockfish/i.test(indicator),
        `The rendered engine is not Stockfish: ${indicator}`,
      );
      await clickText("Review this game");
      await poll(
        "document.querySelectorAll('.eval-chart button').length===7&&!document.querySelector('[aria-label=\"Game review progress\"]')",
        "all seven reviewed moves",
        45000,
      );
      const messages = await evaluate("window.__knightfallAcceptanceEngine");
      check(
        messages.some((entry) => entry.message.startsWith("bestmove ")),
        "No actual Stockfish worker bestmove was observed",
      );
      if (await evaluate("!!document.querySelector('.game-notes textarea')")) {
        await fill(
          ".game-notes textarea",
          "Claim the center and develop with tempo. !",
        );
        await clickText("Save note", ".game-notes button");
      }
      const download = await exportCurrent();
      check(
        download.chess.history().length === 7 && download.chess.isCheckmate(),
        "Export does not contain the complete legal game",
      );
      await captureResponsive("analysis");
      return {
        engine: indicator,
        reviewMoves: 7,
        quality: await evaluate(
          "document.querySelector('.review-card .soft-badge')?.textContent",
        ),
        workerBestmoves: messages.filter((entry) =>
          entry.message.startsWith("bestmove "),
        ).length,
        exportedPgn: download.path,
        comments: download.chess.getComments(),
      };
    });

    await step("pgn-import-and-native-export", async () => {
      await clickText("Import game");
      const pgn =
        '[Event "Native acceptance study"]\n[White "Ada Lovelace"]\n[Black "Grace Hopper"]\n[Result "*"]\n\n{Challenge the center.} 1. d4 d5 2. c4 {The Queen’s Gambit.} e6 *';
      await fill("#import-text", pgn);
      await clickText("Analyze game");
      await poll(
        "!document.querySelector('[role=\"dialog\"]')&&JSON.parse(localStorage.getItem('knightfall:current')||'null')?.moves.length===4",
        "imported four-ply game",
      );
      const imported = await game();
      check(
        imported.moves[0].san === "d4" &&
          imported.initialComment === "Challenge the center.",
        "Imported PGN moves/comments were not preserved",
      );
      const exported = await exportCurrent();
      check(
        exported.chess.getHeaders().White === "Ada Lovelace" &&
          exported.chess.getHeaders().Black === "Grace Hopper",
        "Player names did not survive native export",
      );
      check(
        exported.chess.getComments().length === 2,
        "Imported comments did not survive native export",
      );
      return {
        moves: imported.moves.map((move) => move.san),
        white: exported.chess.getHeaders().White,
        black: exported.chess.getHeaders().Black,
        exportedPgn: exported.path,
      };
    });

    await step("position-editor-invalid-and-valid", async () => {
      await click('[aria-label="Set up position"]');
      await clickText("Clear", ".board-editor button");
      check(
        await evaluate(
          "document.querySelector('.be-primary').disabled&&document.querySelector('.be-invalid').textContent.includes('white king')",
        ),
        "Empty position should be rejected",
      );
      await click('[data-editor-square="e1"]');
      await click('[aria-label="Black king"]');
      await click('[data-editor-square="e2"]');
      check(
        await evaluate("document.querySelector('.be-primary').disabled"),
        "Adjacent kings should be rejected",
      );
      await click('[data-editor-square="e8"]');
      await click('[aria-label="White queen"]');
      await click('[data-editor-square="d1"]');
      await fill(".be-counters label:last-child input", "23");
      const fen = await evaluate("document.querySelector('.be-fen').value");
      check(
        fen === "4k3/8/8/8/8/8/8/3QK3 w - - 0 23",
        `Unexpected edited FEN: ${fen}`,
      );
      await clickText("Analyze position", ".board-editor button");
      await poll(
        "!document.querySelector('.board-editor')&&JSON.parse(localStorage.getItem('knightfall:current')||'null')?.startFen.endsWith('0 23')",
        "edited position in analysis",
      );
      return { invalidEmpty: true, invalidAdjacentKings: true, validFen: fen };
    });

    await step("opening-replay-and-rehearsal", async () => {
      await navigate("Opening lab");
      await poll(
        "document.querySelectorAll('.lh-opening-card').length>0",
        "opening cards",
      );
      await captureResponsive("openings");
      await clickText("Meet the Stafford");
      await poll(
        "document.querySelector('.opening-detail h2')?.textContent==='Stafford Gambit'",
        "Stafford detail",
      );
      check(
        await evaluate(
          "document.querySelector('.replay-controls>span').textContent==='Starting position'",
        ),
        "Opening replay should start at the initial position",
      );
      await click('[aria-label="Next move"]');
      check(
        await evaluate(
          "document.querySelector('[data-square=\"e4\"] img')?.getAttribute('src').endsWith('wP.svg')",
        ),
        "Opening replay did not advance to e4",
      );
      await clickText("Rehearse line");
      await boardMove("d2", "d4");
      check(
        (await game()).moves.length === 0,
        "Rehearsal accepted an incorrect opening move",
      );
      const expected = [
        "e4",
        "e5",
        "Nf3",
        "Nf6",
        "Nxe5",
        "Nc6",
        "Nxc6",
        "dxc6",
        "d3",
        "Bc5",
      ];
      const chess = new Chess();
      for (let index = 0; index < expected.length; index++) {
        const move = chess.move(expected[index]);
        await boardMove(move.from, move.to, move.promotion);
        await poll(
          `JSON.parse(localStorage.getItem('knightfall:current')||'null')?.moves.length===${index + 1}`,
          `rehearsal half-move ${index + 1}`,
        );
      }
      check(
        (await game()).fen === chess.fen(),
        "Rehearsal ended on the wrong board",
      );
      check(
        await evaluate(
          "document.querySelector('.toast')?.textContent.includes('Opening line complete')",
        ),
        "Rehearsal completion was not acknowledged",
      );
      return {
        name: "Stafford Gambit",
        rehearsedPlies: expected.length,
        wrongMoveRejected: true,
        finalFen: chess.fen(),
      };
    });

    await step("endgame-drill-real-bot-response", async () => {
      const drills = await dataFixture(
        "src/data/endgames.ts",
        "export const endgames: EndgameDrill[] = ",
      );
      const drill = drills[0];
      await navigate("Endgame school");
      await clickText("Start with the essentials");
      await poll(
        "!!document.querySelector('.eg-start-button')",
        "endgame lesson dialog",
      );
      await click(".eg-start-button");
      await poll(
        "JSON.parse(localStorage.getItem('knightfall:current')||'null')?.title.startsWith('Endgame ·')",
        "endgame practice board",
      );
      const started = await game();
      check(
        started.startFen === drill.fen && started.botId === "stockfish",
        "The selected endgame did not start against the maximum local bot",
      );
      const before = await evaluate(
        'window.__knightfallAcceptanceEngine.filter(entry=>entry.message.startsWith("bestmove ")).length',
      );
      const uci = drill.verification.bestMove;
      await boardMove(uci.slice(0, 2), uci.slice(2, 4), uci[4]);
      await poll(
        "JSON.parse(localStorage.getItem('knightfall:current')||'null')?.moves.length>=2",
        "endgame bot response",
        30000,
      );
      const played = await game();
      const chess = new Chess(drill.fen);
      for (const move of played.moves) chess.move(move);
      check(
        chess.fen() === played.fen &&
          played.moves[1].color !== drill.playerColor,
        "Endgame reply was not a legal opponent move",
      );
      const after = await evaluate(
        'window.__knightfallAcceptanceEngine.filter(entry=>entry.message.startsWith("bestmove ")).length',
      );
      check(
        after > before,
        "Endgame reply did not produce a real Stockfish bestmove",
      );
      await clickText("Resign", ".game-actions button");
      await clickText("Resign", '[role="dialog"] button');
      await poll(
        "JSON.parse(localStorage.getItem('knightfall:current')||'null')?.result?.reason==='Resignation'",
        "finished bot game",
      );
      return {
        drill: drill.title,
        startFen: drill.fen,
        moves: played.moves.map((move) => move.san),
        finish: "User resignation after a verified local Stockfish response",
      };
    });

    await step("puzzle-solve-and-next", async () => {
      const puzzles = await dataFixture(
        "src/data/puzzles.ts",
        "export const puzzles: Puzzle[] = ",
      );
      const puzzle = puzzles[0];
      await navigate("Puzzles");
      await poll("!!document.querySelector('.puzzle-card')", "puzzle board");
      check(
        await evaluate(
          `document.querySelector('.puzzle-card h2')?.textContent===${JSON.stringify(puzzle.title)}`,
        ),
        "Built app and first puzzle fixture differ",
      );
      for (let index = 0; index < puzzle.solution.length; index += 2) {
        const uci = puzzle.solution[index];
        await boardMove(uci.slice(0, 2), uci.slice(2, 4), uci[4]);
        if (index + 1 < puzzle.solution.length) await wait(550);
      }
      await poll(
        "document.querySelector('.puzzle-feedback')?.classList.contains('solved')",
        "solved puzzle feedback",
      );
      check(
        await evaluate(
          `JSON.parse(localStorage.getItem('knightfall:solved')||'[]').includes(${JSON.stringify(puzzle.id)})`,
        ),
        "Unassisted puzzle completion was not persisted",
      );
      await clickText("Next puzzle");
      await poll(
        `document.querySelector('.puzzle-card h2')?.textContent===${JSON.stringify(puzzles[1].title)}`,
        "next puzzle",
      );
      return {
        solved: puzzle.id,
        solution: puzzle.solution,
        next: puzzles[1].id,
      };
    });

    await step("tactics-sprint-play-score-and-finish", async () => {
      const course = (
        await dataFixture(
          "src/data/puzzles.ts",
          "export const puzzles: Puzzle[] = ",
        )
      ).sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id));
      await navigate("Tactics Sprint");
      await clickText("Start 3-minute run");
      await poll(
        "!!document.querySelector('.rush-live-note')",
        "a playable timed Sprint run",
      );
      const first = course[0];
      for (let index = 0; index < first.solution.length; index += 2) {
        const uci = first.solution[index];
        await boardMove(uci.slice(0, 2), uci.slice(2, 4), uci[4]);
        if (index + 1 < first.solution.length) await wait(550);
      }
      await poll(
        "document.querySelector('.rush-score strong')?.textContent==='1'",
        "one full-sequence Sprint point",
      );
      await poll(
        "document.querySelector('.rush-board-meta')?.textContent.includes('Position 2 of')",
        "automatic next Sprint position",
      );
      await captureResponsive("sprint");
      await clickText("Finish run");
      await clickText("Finish");
      await poll(
        "!!document.querySelector('.rush-score-card.is-finished')",
        "completed Sprint recap",
      );
      const best = await evaluate(
        "JSON.parse(localStorage.getItem('knightfall:rush-bests-v1')||'null')?.three",
      );
      check(
        best === 1,
        "The scored Sprint result did not persist as a personal best",
      );
      return {
        solved: first.id,
        score: 1,
        nextPosition: 2,
        persistedBest: best,
        finishedBy: "Finish run confirmation",
      };
    });

    await step("production-lan-moves-rematch-and-leave", async () => {
      const host = await evaluate("window.knightfall.hostLan()");
      const hostOrigin = `http://127.0.0.1:${host.port}`;
      localOrigins.add(hostOrigin);
      localOrigins.add(hostOrigin.replace("http:", "ws:"));
      await navigate("Play with friends");
      await fill(".network-form input", "Native Host");
      await fill(".network-two label:first-child select", "0+0");
      await fill(".network-two label:last-child select", "w");
      await clickText("Create Wi-Fi room");
      const roomCode = await poll(
        "document.querySelector('.room-code')?.textContent.trim()",
        "created native Wi-Fi room",
      );
      let snapshot = null;
      const socket = new WebSocket(hostOrigin.replace("http:", "ws:") + "/ws", {
        origin: hostOrigin,
      });
      const peerWait = async (predicate) => {
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          if (snapshot && predicate(snapshot)) return snapshot;
          await wait(30);
        }
        throw new Error(
          "Native LAN peer timed out: " + JSON.stringify(snapshot),
        );
      };
      socket.on("message", (bytes) => {
        const message = JSON.parse(bytes);
        if (message.type === "snapshot") snapshot = message.snapshot;
      });
      try {
        await new Promise((resolve, reject) => {
          socket.once("open", resolve);
          socket.once("error", reject);
        });
        socket.send(
          JSON.stringify({
            type: "join",
            code: roomCode,
            name: "Native Guest",
          }),
        );
        await peerWait((state) => state.status === "playing");
        const firstId = snapshot.gameId;
        await poll(
          "document.querySelector('.status-message')?.textContent.includes('Native Host to move')",
          "joined native game",
        );
        await boardMove("e2", "e4");
        await peerWait((state) => state.history.length === 1);
        socket.send(JSON.stringify({ type: "move", from: "e7", to: "e5" }));
        await peerWait((state) => state.history.length === 2);
        await poll(
          "document.querySelector('[data-square=\"e5\"] img')?.getAttribute('src').endsWith('bP.svg')",
          "opponent move rendered",
        );
        check(
          snapshot.history.join(" ") === "e4 e5",
          "Native LAN moves were not authoritative",
        );
        await clickText("Resign", ".game-actions button");
        await clickText("Resign", '[role="dialog"] button');
        await peerWait((state) => state.status === "finished");
        check(
          snapshot.result.winner === "b",
          "Native resignation did not award the opponent",
        );
        await poll(
          "!!document.querySelector('.game-result')",
          "native room result",
        );
        await clickText("Rematch");
        await peerWait((state) => state.rematchVotes.includes("w"));
        socket.send(JSON.stringify({ type: "rematch" }));
        await peerWait(
          (state) => state.status === "playing" && state.gameId !== firstId,
        );
        const secondId = snapshot.gameId;
        await poll(
          "document.querySelector('[data-square]')?.getAttribute('data-square')==='h1'",
          "rematch swaps native board orientation",
        );
        socket.send(JSON.stringify({ type: "move", from: "d2", to: "d4" }));
        await peerWait((state) => state.history.length === 1);
        await poll(
          "document.querySelector('[data-square=\"d7\"]')?.getAttribute('aria-disabled')==='false'",
          "Black host turn",
        );
        await boardMove("d7", "d5");
        await peerWait((state) => state.history.length === 2);
        await navigate("Puzzles");
        await poll(
          '!!document.querySelector(\'[role="dialog"][aria-label="Leave your Wi-Fi game?"]\')',
          "confirm leaving live rematch",
        );
        await clickText("Leave game");
        await peerWait((state) => state.status === "finished");
        check(
          snapshot.result.winner === "w" &&
            snapshot.result.reason === "Opponent left the room",
          "Native leave did not finish authoritative rematch",
        );
        const archive = await evaluate(
          "JSON.parse(localStorage.getItem('knightfall:games')||'[]')",
        );
        check(
          archive.some(
            (game) =>
              game.id === "lan-" + firstId &&
              game.result?.reason === "Resignation",
          ) &&
            archive.some(
              (game) =>
                game.id === "lan-" + secondId &&
                game.result?.reason === "Left game",
            ),
          "Native rematch overwrote its prior archive",
        );
        return {
          hostPort: host.port,
          firstGame: firstId,
          rematch: secondId,
          firstMoves: ["e4", "e5"],
          rematchMoves: snapshot.history,
          archivedRounds: 2,
          confirmedLeave: true,
        };
      } finally {
        socket.terminate();
      }
    });

    await step("settings-responsive-and-offline-reload", async () => {
      await navigate("Settings");
      await fill("#player-name", "Native QA");
      await clickText("Walnut", ".theme-option");
      await captureResponsive("settings");
      const settings = await evaluate(
        "JSON.parse(localStorage.getItem('knightfall:settings')||'null')",
      );
      check(
        settings.name === "Native QA" && settings.boardTheme === "walnut",
        "Settings did not persist before reload",
      );
      const archiveBefore = await evaluate(
        "JSON.parse(localStorage.getItem('knightfall:games')||'[]').length",
      );
      await reloadLocalApp();
      await navigate("Settings");
      check(
        await evaluate(
          "document.querySelector('#player-name').value==='Native QA'&&document.querySelector('.theme-option.selected strong')?.textContent==='Walnut'",
        ),
        "Settings were lost on reload",
      );
      const archiveAfter = await evaluate(
        "JSON.parse(localStorage.getItem('knightfall:games')||'[]').length",
      );
      check(archiveAfter >= archiveBefore, "Saved games were lost on reload");
      await navigate("Analysis");
      await poll(
        "document.querySelectorAll('.engine-line').length>0&&document.querySelector('.engine-indicator')?.textContent.includes('Stockfish')",
        "real engine after offline reload",
        25000,
      );
      check(
        await evaluate(
          "window.__knightfallAcceptanceEngine.some(entry=>entry.message.startsWith('bestmove '))",
        ),
        "No local engine response after reload",
      );
      return {
        internetBlocked: true,
        persistedName: settings.name,
        boardTheme: settings.boardTheme,
        archiveBefore,
        archiveAfter,
        realEngineAfterReload: true,
      };
    });

    report.finishedAt = new Date().toISOString();
    report.status = "passed";
    await fs.writeFile(
      path.join(outputDir, "acceptance-report.json"),
      JSON.stringify(report, null, 2),
    );
    return report;
  } catch (error) {
    report.status = "failed";
    report.failedStep = currentStep;
    report.error = error.message;
    report.finishedAt = new Date().toISOString();
    try {
      window.showInactive();
      await fs.writeFile(
        path.join(outputDir, "failure.png"),
        (await window.webContents.capturePage()).toPNG(),
      );
    } catch {}
    try {
      report.visibleText = await evaluate(
        "document.body.innerText.slice(-6000)",
      );
    } catch {}
    await fs.writeFile(
      path.join(outputDir, "acceptance-report.json"),
      JSON.stringify(report, null, 2),
    );
    throw error;
  } finally {
    window.webContents.off("console-message", consoleListener);
    session.off("will-download", downloadListener);
    session.webRequest.onBeforeRequest(null);
  }
}
module.exports = { runAcceptance };
