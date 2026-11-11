import { Capacitor } from "@capacitor/core";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./lib/compat";
import "./styles.css";
import "./club.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
if (
  import.meta.env.PROD &&
  "serviceWorker" in navigator &&
  !Capacitor.isNativePlatform()
) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .catch(() => {
        /* Offline installation is optional. */
      });
  });
}
