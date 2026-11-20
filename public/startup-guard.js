// Independent of the application bundle so a failed first load can be retried.
(() => {
  const screen = document.getElementById("knightfall-launch");
  if (!screen) return;
  const retry = screen.querySelector(".launch-retry");
  retry.addEventListener("click", event => {
    event.preventDefault();
    location.reload();
  });

  function onError(event) {
    if (!(event instanceof ErrorEvent || event.target instanceof HTMLScriptElement)) return;
    screen.dataset.state = "failed";
    screen.querySelector("#launch-status").textContent = "The board could not open.";
  }
  window.addEventListener("error", onError, true);
  window.addEventListener("knightfall:mounted", () => {
    window.removeEventListener("error", onError, true);
  }, { once: true });
})();
