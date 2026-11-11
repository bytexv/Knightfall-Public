import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { version } from "../../package.json";

type UpdateStatus = {
  status:
    | "idle"
    | "unconfigured"
    | "checking"
    | "up-to-date"
    | "available"
    | "unavailable";
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  downloadUrl?: string;
  checkedAt?: string;
  message: string;
};
type UpdateBridge = {
  getUpdateStatus: () => Promise<UpdateStatus>;
  checkForUpdates: () => Promise<UpdateStatus>;
  openUpdate: () => Promise<unknown>;
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
};

export default function UpdateCard() {
  const bridge = (window as Window & { knightfall?: UpdateBridge }).knightfall;
  const [state, setState] = useState<UpdateStatus>({
    status: "unconfigured",
    currentVersion: version,
    message:
      "Update downloads will appear when the release repository is connected.",
  });
  const [releaseLink, setReleaseLink] = useState("");
  useEffect(() => {
    let active = true;
    if (bridge?.getUpdateStatus) {
      let receivedUpdate = false;
      const unsubscribe = bridge.onUpdateStatus((status) => {
        receivedUpdate = true;
        if (active) setState(status);
      });
      void bridge
        .getUpdateStatus()
        .then((status) => {
          if (active && !receivedUpdate) setState(status);
        })
        .catch(() => {
          if (active && !receivedUpdate)
            setState((s) => ({
              ...s,
              status: "unavailable",
              message: "Could not check update settings. Try again later.",
            }));
        });
      return () => {
        active = false;
        unsubscribe();
      };
    }
    const controller = new AbortController();
    void fetch(new URL("update-config.json", document.baseURI), {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((config) => {
        if (
          !active ||
          !config ||
          !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(config.owner) ||
          !/^[a-zA-Z0-9_.-]{1,100}$/.test(config.repo)
        )
          return;
        setReleaseLink(
          `https://github.com/${config.owner}/${config.repo}/releases`,
        );
        setState((s) => ({
          ...s,
          status: "idle",
          message:
            "Open the release page for the newest app download. The web app updates on reload.",
        }));
      })
      .catch(() => {
        /* Offline use does not require update checks. */
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [bridge]);

  async function check() {
    if (!bridge?.checkForUpdates) return;
    setState((previous) => ({
      ...previous,
      status: "checking",
      message: "Checking for a newer release…",
    }));
    try {
      setState(await bridge.checkForUpdates());
    } catch {
      setState((previous) => ({
        ...previous,
        status: "unavailable",
        message:
          "Could not reach the update service. You can keep playing offline.",
      }));
    }
  }
  async function download() {
    try {
      await bridge?.openUpdate();
    } catch {
      setState((previous) => ({
        ...previous,
        message: "Could not open the download. Check again and retry.",
      }));
    }
  }
  return (
    <section className="card update-card">
      <div className="panel-heading">
        <h2>App updates</h2>
        <span className="version-chip">v{state.currentVersion || version}</span>
      </div>
      <p role="status">{state.message}</p>
      {state.status === "available" ? (
        <button className="button primary full" onClick={() => void download()}>
          <Download size={15} /> Download {state.latestVersion}
        </button>
      ) : releaseLink ? (
        <a
          className="button secondary full"
          href={releaseLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          View releases <Download size={15} />
        </a>
      ) : (
        <button
          className="button secondary full"
          disabled={
            state.status === "unconfigured" ||
            state.status === "checking" ||
            !bridge?.checkForUpdates
          }
          onClick={() => void check()}
        >
          <RefreshCw
            size={15}
            className={state.status === "checking" ? "spin" : ""}
          />
          {state.status === "checking" ? "Checking…" : "Check for updates"}
        </button>
      )}
      <small>
        {state.status === "unconfigured"
          ? "Update source not connected yet."
          : "Downloads open on GitHub. Installing an update is your choice."}
      </small>
    </section>
  );
}
