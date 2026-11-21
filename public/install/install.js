const button = document.getElementById("install");
const help = document.getElementById("help");
let installPrompt;

function showInstalled() {
  button.hidden = true;
  help.textContent = "Knightfall is installed. Open it from your home screen.";
}
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  button.hidden = false;
});
button.addEventListener("click", async () => {
  const prompt = installPrompt;
  if (!prompt) return;
  installPrompt = null;
  button.hidden = true;
  try {
    await prompt.prompt();
    await prompt.userChoice;
  } catch {
    help.textContent = "Use Chrome’s ⋮ menu and choose Add to Home screen.";
  }
});
window.addEventListener("appinstalled", showInstalled);
if (window.matchMedia("(display-mode: standalone)").matches) showInstalled();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("../sw.js", {scope: "../", updateViaCache: "none"}).catch(() => {
    help.textContent = "Open Knightfall in Chrome while online to install it. You can also open the chessboard here.";
  });
}
fetch("./version.json", {cache: "no-cache"}).then(response => response.json()).then(({version}) => {
  if (/^\d+\.\d+\.\d+$/.test(version)) document.getElementById("version").textContent = version;
}).catch(() => {});
