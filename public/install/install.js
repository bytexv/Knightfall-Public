const button = document.getElementById("install");
const help = document.getElementById("help");
let installPrompt;
const manualSteps = help.innerHTML;
button.hidden = false;
help.hidden = true;

function showHelp() {
  help.innerHTML = manualSteps;
  help.hidden = false;
}

function showInstalled() {
  button.hidden = true;
  help.hidden = false;
  help.textContent = "Knightfall is installed. Open it from your home screen.";
}
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  button.hidden = false;
});
button.addEventListener("click", async () => {
  const prompt = installPrompt;
  if (!prompt) {
    showHelp();
    return;
  }
  installPrompt = null;
  try {
    await prompt.prompt();
    const {outcome} = await prompt.userChoice;
    if (outcome === "dismissed") showHelp();
  } catch {
    showHelp();
  }
});
window.addEventListener("appinstalled", showInstalled);
if (window.matchMedia("(display-mode: standalone)").matches) showInstalled();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("../sw.js", {scope: "../", updateViaCache: "none"}).catch(() => {
    help.hidden = false;
    help.textContent = "Open Knightfall in Chrome while online to install it. You can also open the chessboard here.";
  });
}
fetch("./version.json", {cache: "no-cache"}).then(response => response.json()).then(({version, preview}) => {
  if (/^\d+\.\d+\.\d+$/.test(version)) document.getElementById("version").textContent = preview ? version + " preview" : version;
}).catch(() => {});
