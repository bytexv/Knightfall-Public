import { Capacitor } from "@capacitor/core";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./lib/compat";
import "./styles.css";
import "./club.css";
import "./polish.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
if (
  import.meta.env.PROD &&
  "serviceWorker" in navigator &&
  !Capacitor.isNativePlatform() &&
  !(window as Window & { knightfall?: unknown }).knightfall
) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then((registration) =>
        window.dispatchEvent(
          new CustomEvent("knightfall:service-worker", {
            detail: registration,
          }),
        ),
      )
      .catch(() => {
        /* Offline installation is optional. */
      });
  });
}

// Older desktop builds registered the web cache on their loopback origin.
// Retire only this app's worker/cache; native updates must use the bundled files.
if (
  (window as Window & { knightfall?: unknown }).knightfall &&
  "serviceWorker" in navigator
) {
  void navigator.serviceWorker
    .getRegistrations()
    .then(async (registrations) => {
      const base = new URL("./", document.baseURI).href;
      await Promise.all(
        registrations
          .filter((reg) => reg.scope === base)
          .map((reg) => reg.unregister()),
      );
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => name.startsWith("knightfall-shell-"))
            .map((name) => caches.delete(name)),
        );
      }
    })
    .catch(() => {
      /* Native app remains usable if web cache cleanup is unavailable. */
    });
}
