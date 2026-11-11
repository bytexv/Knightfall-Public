import { useSyncExternalStore } from "react";
import { Download, RefreshCw } from "lucide-react";
import {
  subscribeAppUpdates,
  getAppUpdateStatus,
  checkAppUpdates,
  openAppUpdate,
  applyAppUpdate,
} from "../lib/app-updates";

export function UpdateIndicator({ onOpen }: { onOpen: () => void }) {
  const state = useSyncExternalStore(subscribeAppUpdates, getAppUpdateStatus);
  if (!["ready", "available", "downloading"].includes(state.status))
    return null;
  return (
    <button
      className="update-indicator"
      onClick={onOpen}
      title={state.message}
      aria-label="App update available — open settings"
    >
      <Download size={16} />
      <span>
        {state.status === "downloading" ? "Updating…" : "Update ready"}
      </span>
    </button>
  );
}
export default function UpdateCard() {
  const state = useSyncExternalStore(subscribeAppUpdates, getAppUpdateStatus);
  const busy = state.status === "checking" || state.status === "downloading";
  return (
    <section className="card update-card">
      <div className="panel-heading">
        <h2>App updates</h2>
        <span className="version-chip">v{state.currentVersion}</span>
      </div>
      <p role="status">{state.message}</p>
      {state.status === "downloading" && (
        <progress
          aria-label="Update download progress"
          value={state.progress || 0}
          max={100}
        />
      )}
      {state.status === "ready" ? (
        <button
          className="button primary full"
          onClick={() => void applyAppUpdate()}
        >
          <RefreshCw size={15} />
          {state.web ? "Reload to update" : "Restart and update"}
        </button>
      ) : state.status === "available" ? (
        <button
          className="button primary full"
          onClick={() => void openAppUpdate()}
        >
          <Download size={15} />
          Download {state.latestVersion}
        </button>
      ) : (
        <button
          className="button secondary full"
          disabled={busy || state.status === "unconfigured"}
          onClick={() => void checkAppUpdates()}
        >
          <RefreshCw
            size={15}
            className={state.status === "checking" ? "spin" : ""}
          />
          {state.status === "checking"
            ? "Checking…"
            : state.status === "downloading"
              ? "Downloading…"
              : "Check for updates"}
        </button>
      )}
      <small>
        {state.automatic
          ? "Automatic downloads · installs on exit · games and settings stay on this device."
          : state.web
            ? "Updates never reload a live game automatically."
            : "Portable and Android downloads open on GitHub. Android asks you to approve installation."}
      </small>
      {state.releaseUrl && (
        <a
          className="update-release-link"
          href={state.releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Release notes & all downloads ↗
        </a>
      )}
    </section>
  );
}
