/* Native renderer accessibility audit. Install axe-core separately, then run:
 * npm install --no-save --package-lock=false axe-core
 * electron . --a11y-test --a11y-output=artifacts/qa/a11y
 * Override KNIGHTFALL_AXE_PATH to use another axe.min.js installation.
 */
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runAccessibility({ window, app, outputDir }) {
  const profile = app.getPath("userData");
  if (
    !process.argv.includes("--a11y-test") ||
    app.isPackaged ||
    !profile.startsWith(os.tmpdir() + path.sep) ||
    !path.basename(profile).startsWith("knightfall-desktop-smoke-")
  )
    throw new Error(
      "Accessibility audit requires the isolated source-only --a11y-test profile.",
    );
  await fs.mkdir(outputDir, { recursive: true });
  let axePath = process.env.KNIGHTFALL_AXE_PATH;
  if (!axePath) {
    try {
      axePath = require.resolve("axe-core/axe.min.js", {
        paths: [path.resolve(__dirname, "..")],
      });
    } catch {
      throw new Error(
        "Accessibility auditing requires axe-core. Install it locally with npm install --no-save --package-lock=false axe-core, or set KNIGHTFALL_AXE_PATH to an absolute path to axe.min.js.",
      );
    }
  }
  const axeSource = await fs.readFile(axePath, "utf8");
  const evaluate = (code) => window.webContents.executeJavaScript(code, true);
  const report = {
    startedAt: new Date().toISOString(),
    platform: process.platform,
    electron: process.versions.electron,
    scans: [],
    keyboard: [],
    layout: [],
    missingFeatures: [],
  };
  const poll = async (condition, description) => {
    const end = Date.now() + 20000;
    while (Date.now() < end) {
      const result = await evaluate(`!!(${condition})`);
      if (result) return result;
      await pause(100);
    }
    throw new Error("Timed out waiting for " + description);
  };
  const click = async (selector) => {
    await evaluate(
      `(()=>{const control=document.querySelector(${JSON.stringify(selector)});if(!control)throw new Error('Missing control '+${JSON.stringify(selector)});if(!document.querySelector('[role="dialog"]'))window.__a11yOpener=control;control.focus();control.click()})()`,
    );
    await pause(130);
  };
  const clickText = async (text, selector = "button") => {
    await evaluate(
      `(()=>{const control=[...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.textContent.trim()===${JSON.stringify(text)});if(!control)throw new Error('Missing button '+${JSON.stringify(text)});if(!document.querySelector('[role="dialog"]'))window.__a11yOpener=control;control.focus();control.click()})()`,
    );
    await pause(130);
  };
  const fill = async (selector, value) => {
    await evaluate(
      `(()=>{const input=document.querySelector(${JSON.stringify(selector)});const proto=input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
    await pause(100);
  };
  const navigate = async (label) => {
    await evaluate(
      `(()=>{const toggle=document.querySelector('[aria-label="Open navigation"]');if(toggle&&getComputedStyle(toggle).display!=='none'&&!document.querySelector('.sidebar.is-open'))toggle.click()})()`,
    );
    await pause(70);
    await evaluate(
      `(()=>{const item=[...document.querySelectorAll('.nav-item')].find(item=>(item.getAttribute('aria-label')||item.querySelector('span')?.textContent||'').trim()===${JSON.stringify(label)});if(!item)throw new Error('Missing nav '+${JSON.stringify(label)});item.click();window.scrollTo(0,0)})()`,
    );
    await pause(180);
  };
  const resize = async (width, height = 980) => {
    window.setContentSize(width, height);
    await pause(250);
    await poll(`innerWidth===${width}`, "native viewport resize");
  };
  const scan = async (name) => {
    await evaluate(
      "document.querySelector('[aria-label=\"Dismiss notification\"]')?.click()",
    );
    await pause(100);
    await evaluate(
      `Promise.race([Promise.all(document.getAnimations().filter(animation=>Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation=>animation.finished.catch(()=>{}))).then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),2000))])`,
    );
    const results = await evaluate(
      `axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']},resultTypes:['violations','incomplete']}).then(results=>({violations:results.violations,incomplete:results.incomplete.map(item=>({id:item.id,impact:item.impact,nodes:item.nodes.map(node=>({target:node.target,html:node.html,failureSummary:node.failureSummary}))}))}))`,
    );
    const layout = await evaluate(
      `(()=>{const dialog=document.querySelector('[role="dialog"]');return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,dialog:dialog?{width:dialog.getBoundingClientRect().width,scrollWidth:dialog.scrollWidth,clientWidth:dialog.clientWidth}:null}})()`,
    );
    report.layout.push({
      name,
      ...layout,
      passed:
        layout.scrollWidth <= layout.width + 1 &&
        (!layout.dialog ||
          layout.dialog.scrollWidth <= layout.dialog.clientWidth + 1),
    });
    report.scans.push({ name, ...results });
    process.stdout.write(
      `A11Y_SCAN ${name}: ${results.violations.map((item) => `${item.id}(${item.nodes.length})`).join(", ") || "no axe violations"}\n`,
    );
    if (results.violations.length)
      await fs.writeFile(
        path.join(outputDir, name + ".png"),
        (await window.webContents.capturePage()).toPNG(),
      );
  };
  const key = async (keyCode, modifiers = []) => {
    window.webContents.focus();
    window.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
    await pause(80);
  };
  const checkDialogKeyboard = async (name) => {
    const before = await evaluate(
      `(()=>{const dialog=document.querySelector('[role="dialog"]');if(!dialog)return null;const controls=[...dialog.querySelectorAll('button,a[href],input,textarea,select,[tabindex]')].filter(node=>node.tabIndex>=0&&!node.disabled&&node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden');window.__a11yFirst=controls[0];window.__a11yLast=controls.at(-1);return {initialInside:dialog.contains(document.activeElement),controls:controls.length,initial:document.activeElement.outerHTML.slice(0,200)}})()`,
    );
    if (!before || !before.controls) {
      report.keyboard.push({
        name,
        passed: false,
        error: "No focusable dialog controls",
      });
      return;
    }
    await evaluate("window.__a11yFirst.focus()");
    await key("Tab", ["shift"]);
    const shiftWrap = await evaluate(
      "document.activeElement===window.__a11yLast",
    );
    await evaluate("window.__a11yLast.focus()");
    await key("Tab");
    const forwardWrap = await evaluate(
      "document.activeElement===window.__a11yFirst",
    );
    report.keyboard.push({
      name,
      ...before,
      shiftWrap,
      forwardWrap,
      passed: before.initialInside && shiftWrap && forwardWrap,
    });
  };
  const closeDialog = async () => {
    const name = await evaluate(
      "document.querySelector('[role=\"dialog\"]')?.getAttribute('aria-label')||document.querySelector('[role=\"dialog\"]')?.className",
    );
    await key("Escape");
    await poll(
      "!document.querySelector('[role=\"dialog\"]')",
      "Escape dismisses dialog",
    );
    const focusRestored = await evaluate(
      "document.activeElement===window.__a11yOpener",
    );
    report.keyboard.push({
      name: name + "-dismissal",
      escapeDismissed: true,
      focusRestored,
      passed: focusRestored,
    });
  };
  const checkTabsKeyboard = async (name, selector) => {
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).querySelector('[role="tab"]').focus()`,
    );
    const steps = [];
    for (const [keyCode, selectedIndex] of [
      ["Right", 1],
      ["Right", 0],
      ["End", 1],
      ["Home", 0],
      ["Left", 1],
    ]) {
      await key(keyCode);
      const state = await evaluate(
        `(()=>{const tabs=[...document.querySelector(${JSON.stringify(selector)}).querySelectorAll('[role="tab"]')];const selected=tabs[${selectedIndex}];return {focus:document.activeElement===selected,selected:selected.getAttribute('aria-selected')==='true',tabStops:tabs.filter(tab=>tab.tabIndex===0).length,panelExists:!!document.getElementById(selected.getAttribute('aria-controls'))}})()`,
      );
      steps.push({
        keyCode,
        ...state,
        passed:
          state.focus &&
          state.selected &&
          state.tabStops === 1 &&
          state.panelExists,
      });
    }
    report.keyboard.push({
      name,
      steps,
      passed: steps.every((step) => step.passed),
    });
  };
  window.setMinimumSize(320, 280);
  window.showInactive();
  await resize(1440);
  await evaluate(
    "window.__a11yRendererErrors=[];window.addEventListener('error',event=>window.__a11yRendererErrors.push({message:event.message,stack:event.error?.stack,filename:event.filename,lineno:event.lineno,colno:event.colno}))",
  );
  await evaluate(axeSource);
  report.axeVersion = await evaluate("axe.version");
  await evaluate("document.fonts.ready");
  try {
    if (!process.argv.includes("--a11y-only=sprint")) {
      await scan("play-setup-desktop");
      await clickText("New game");
      await scan("new-game-dialog");
      await checkDialogKeyboard("new-game-dialog");
      await closeDialog();
      await resize(390, 844);
      await scan("play-setup-mobile");
      await resize(1440);

      await navigate("Analysis");
      await poll("document.querySelector('.analysis-card')", "analysis");
      await scan("analysis-desktop");
      await clickText("Import game");
      await scan("import-dialog");
      await checkDialogKeyboard("import-dialog");
      await fill("#import-text", "This is not a chess game");
      await clickText("Analyze game");
      await poll(
        "document.querySelector('[role=\"alert\"]')",
        "clear invalid PGN error",
      );
      await scan("import-error");
      await closeDialog();
      await click('[aria-label="Set up position"]');
      await scan("position-editor");
      await checkDialogKeyboard("position-editor");
      await clickText("Clear", ".board-editor button");
      await scan("position-editor-invalid");
      await resize(390, 844);
      await scan("position-editor-mobile");
      await closeDialog();
      await resize(1440);

      await navigate("Opening lab");
      await scan("openings-desktop");
      await checkTabsKeyboard("learning-tabs", ".lh-tabs");
      await click("#lh-lessons-tab");
      await scan("short-lessons");
      await click(".lh-lesson-card");
      await scan("lesson-dialog");
      await checkDialogKeyboard("lesson-dialog");
      await closeDialog();

      await navigate("Endgame school");
      await scan("endgames-desktop");
      await clickText("Start with the essentials");
      await scan("endgame-dialog");
      await checkDialogKeyboard("endgame-dialog");
      await resize(390, 844);
      await scan("endgame-dialog-mobile");
      await closeDialog();
      await resize(1440);

      await navigate("Play with friends");
      await scan("lan-create");
      await checkTabsKeyboard("lan-tabs", ".network-tabs");
      await clickText("Join a room");
      await scan("lan-join");
      await navigate("Settings");
      await scan("settings-desktop");
      await resize(390, 844);
      await scan("settings-mobile");
      await resize(1440);
    }

    if (
      await evaluate(
        "[...document.querySelectorAll('.nav-item')].some(item=>item.textContent.trim()==='Tactics Sprint')",
      )
    ) {
      await navigate("Tactics Sprint");
      await scan("sprint-setup");
      await clickText("Start 3-minute run");
      await poll(
        "document.querySelector('.rush-live-note')",
        "Sprint starts a playable run",
      );
      await scan("sprint-active");
      await resize(390, 844);
      await scan("sprint-mobile");
      await clickText("Finish run");
      await clickText("Finish");
      await scan("sprint-results-mobile");
    } else
      report.missingFeatures.push(
        "Tactics Sprint (rebuild latest source before final audit)",
      );
  } catch (error) {
    report.error = error.message;
    await fs.writeFile(
      path.join(outputDir, "failure.png"),
      (await window.webContents.capturePage()).toPNG(),
    );
    throw error;
  } finally {
    try {
      report.rendererErrors = await evaluate("window.__a11yRendererErrors");
    } catch {
      /* A crashed renderer is recorded by the surrounding hook. */
    }
    report.finishedAt = new Date().toISOString();
    report.summary = {
      scans: report.scans.length,
      violations: report.scans.reduce(
        (sum, scan) => sum + scan.violations.length,
        0,
      ),
      affectedElements: report.scans.reduce(
        (sum, scan) =>
          sum +
          scan.violations.reduce(
            (count, violation) => count + violation.nodes.length,
            0,
          ),
        0,
      ),
      keyboardFailures: report.keyboard.filter((item) => !item.passed),
      layoutFailures: report.layout.filter((item) => !item.passed),
      missingFeatures: report.missingFeatures,
      rendererErrors: report.rendererErrors,
    };
    await fs.writeFile(
      path.join(outputDir, "accessibility-report.json"),
      JSON.stringify(report, null, 2),
    );
  }
  return {
    ...report.summary,
    axeVersion: report.axeVersion,
    report: path.join(outputDir, "accessibility-report.json"),
  };
}
module.exports = { runAccessibility };
