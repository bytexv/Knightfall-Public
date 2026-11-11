import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import { version } from "../../package.json";

export type UpdateStatus = {
  status:
    | "idle"
    | "unconfigured"
    | "checking"
    | "up-to-date"
    | "available"
    | "unavailable"
    | "downloading"
    | "ready";
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  downloadUrl?: string;
  checkedAt?: string;
  message: string;
  automatic?: boolean;
  progress?: number;
  web?: boolean;
  android?: boolean;
};
type NativeStatus = Pick<
  UpdateStatus,
  "status" | "latestVersion" | "progress" | "message"
>;
const androidUpdates = registerPlugin<{
  getStatus: () => Promise<NativeStatus>;
  download: (options: {
    url: string;
    version: string;
  }) => Promise<NativeStatus>;
  install: () => Promise<NativeStatus>;
  addListener: (
    event: "status",
    listener: (status: NativeStatus) => void,
  ) => Promise<PluginListenerHandle>;
}>("KnightfallUpdates");
let nativeUpdater = false;
type Bridge = {
  getUpdateStatus: () => Promise<UpdateStatus>;
  checkForUpdates: () => Promise<UpdateStatus>;
  openUpdate: () => Promise<unknown>;
  installUpdate?: () => Promise<unknown>;
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
};
export type ReleaseConfig = { owner: string; repo: string; visibility: string };
export function validReleaseConfig(value: unknown): value is ReleaseConfig {
  const c = value as ReleaseConfig | null;
  return (
    !!c &&
    typeof c.owner === "string" &&
    typeof c.repo === "string" &&
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(c.owner) &&
    /^[a-zA-Z0-9_.-]{1,100}$/.test(c.repo) &&
    ![".", ".."].includes(c.repo) &&
    c.visibility === "public"
  );
}
function parts(value: string) {
  if (!/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.test(value))
    return null;
  return value.split(".").map(Number);
}
export function newerVersion(next: string, current: string) {
  const a = parts(next),
    b = parts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
export async function fetchAndroidRelease(
  config: ReleaseConfig,
  current: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 10000,
): Promise<UpdateStatus> {
  if (!validReleaseConfig(config)) throw new Error("Invalid release source");
  const releaseUrl = `https://github.com/${config.owner}/${config.repo}/releases`;
  const endpoint = `https://api.github.com/repos/${config.owner}/${config.repo}/releases/latest`;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Update check timed out"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      timeout,
      (async (): Promise<UpdateStatus> => {
        const response = await fetcher(endpoint, {
          signal: controller.signal,
          credentials: "omit",
          redirect: "error",
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!response.ok || (response.url && response.url !== endpoint))
          throw new Error("Release unavailable");
        if (
          Number(response.headers.get("content-length")) > 1024 * 1024 ||
          !response.body
        ) {
          await response.body?.cancel();
          throw new Error("Invalid release");
        }
        const reader = response.body.getReader(),
          decoder = new TextDecoder();
        let text = "",
          bytes = 0;
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > 1024 * 1024) throw new Error("Release too large");
            text += decoder.decode(value, { stream: true });
          }
          text += decoder.decode();
        } catch (error) {
          void reader.cancel();
          throw error;
        } finally {
          reader.releaseLock();
        }
        const release = JSON.parse(text);
        const tag = release.tag_name;
        const latest =
          typeof tag === "string" && tag.startsWith("v") ? tag.slice(1) : tag;
        if (
          typeof latest !== "string" ||
          !parts(latest) ||
          release.draft !== false ||
          release.prerelease !== false ||
          release.html_url !== `${releaseUrl}/tag/${encodeURIComponent(tag)}` ||
          !Array.isArray(release.assets) ||
          release.assets.length > 200
        )
          throw new Error("Invalid release");
        const base = {
          android: true,
          currentVersion: current,
          latestVersion: latest,
          releaseUrl,
          checkedAt: new Date().toISOString(),
        };
        if (!newerVersion(latest, current))
          return {
            ...base,
            status: "up-to-date",
            message: "You have the latest stable Android release.",
          };
        const filename = `Knightfall-${latest}-Android.apk`;
        const matches = release.assets.filter(
          (asset: { name?: string }) => asset?.name === filename,
        );
        if (
          matches.length !== 1 ||
          matches[0].state !== "uploaded" ||
          !Number.isSafeInteger(matches[0].size) ||
          matches[0].size <= 0 ||
          matches[0].size > 512 * 1024 ** 2 ||
          matches[0].browser_download_url !==
            `${releaseUrl}/download/${encodeURIComponent(tag)}/${filename}`
        )
          throw new Error("Android download unavailable");
        return {
          ...base,
          status: "available",
          downloadUrl: matches[0].browser_download_url,
          message: `Version ${latest} is available. Download it here, then approve Android’s in-place update. Your games and settings stay.`,
          android: true,
        };
      })(),
    ]);
  } finally {
    clearTimeout(timer!);
    controller.abort();
  }
}

const releasePage = "https://github.com/bytexv/Knightfall-Public/releases";
let state: UpdateStatus = {
  status: "idle",
  currentVersion: version,
  releaseUrl: releasePage,
  message: "Checking update settings…",
};
const listeners = new Set<() => void>();
let started = false,
  bridge: Bridge | undefined,
  native = false,
  config: ReleaseConfig | null = null;
let registration: ServiceWorkerRegistration | undefined,
  lastCheck = 0,
  inFlight: Promise<void> | null = null;
const watchedRegistrations = new WeakSet<ServiceWorkerRegistration>();
let revision = 0;
function publish(value: UpdateStatus) {
  revision++;
  state = value;
  listeners.forEach((fn) => fn());
}
function watchRegistration(reg: ServiceWorkerRegistration) {
  registration = reg;
  const ready = () => {
    if (reg.waiting && navigator.serviceWorker.controller)
      publish({
        status: "ready",
        currentVersion: version,
        web: true,
        releaseUrl: releasePage,
        message:
          "A new web version is ready. Reload when you have finished playing.",
      });
  };
  ready();
  if (watchedRegistrations.has(reg)) return;
  watchedRegistrations.add(reg);
  reg.addEventListener("updatefound", () =>
    reg.installing?.addEventListener("statechange", ready),
  );
}
async function initialize() {
  bridge = (window as Window & { knightfall?: Bridge }).knightfall;
  native = Capacitor.getPlatform() === "android";
  if (Capacitor.isNativePlatform() && !native && !bridge) {
    publish({
      ...state,
      status: "unconfigured",
      message:
        "Native iOS updates require a new signed build. See releases for the web app and source.",
    });
    return;
  }
  if (bridge?.getUpdateStatus) {
    let received = false;
    bridge.onUpdateStatus((value) => {
      received = true;
      publish(value);
    });
    try {
      const value = await bridge.getUpdateStatus();
      if (!received) publish(value);
    } catch {
      publish({
        ...state,
        status: "unavailable",
        message: "Update service unavailable. You can keep playing offline.",
      });
    }
    return;
  }
  if (!native) {
    publish({
      ...state,
      status: "idle",
      web: true,
      message:
        "Web updates download in the background. You choose when to reload.",
    });
    if ("serviceWorker" in navigator) {
      window.addEventListener("knightfall:service-worker", (event) =>
        watchRegistration(
          (event as CustomEvent<ServiceWorkerRegistration>).detail,
        ),
      );
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) watchRegistration(reg);
      } catch {
        /* offline or unsupported */
      }
    }
  } else {
    publish({ ...state, android: true });
    nativeUpdater = Capacitor.isPluginAvailable("KnightfallUpdates");
    if (nativeUpdater) {
      try {
        await androidUpdates.addListener("status", (value) =>
          publish({ ...state, ...value, android: true }),
        );
        const cached = await androidUpdates.getStatus();
        if (["ready", "downloading"].includes(cached.status))
          publish({ ...state, ...cached, android: true });
      } catch {
        nativeUpdater = false;
      }
    }
    try {
      const response = await fetch(
        new URL("update-config.json", document.baseURI),
      );
      const value: unknown = await response.json();
      if (response.ok && validReleaseConfig(value)) config = value;
    } catch {
      /* Bundled configuration may be unavailable. */
    }
    if (!config) {
      publish({
        ...state,
        status: "unconfigured",
        message: "No public update source is configured.",
      });
      return;
    }
    await checkAppUpdates();
  }
  // Recheck on returning to the app, at most once per four hours.
  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      Date.now() - lastCheck > 4 * 60 * 60 * 1000
    )
      void checkAppUpdates();
  });
}
export function subscribeAppUpdates(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    void initialize();
  }
  return () => {
    listeners.delete(listener);
  };
}
export const getAppUpdateStatus = () => state;
export async function checkAppUpdates() {
  if (inFlight) return inFlight;
  if (state.status === "ready" || state.status === "downloading") return;
  if (Date.now() - lastCheck < 60000) return;
  lastCheck = Date.now();
  inFlight = (async () => {
    publish({ ...state, status: "checking", message: "Checking for updates…" });
    try {
      if (bridge) {
        const before = revision;
        const next = await bridge.checkForUpdates();
        if (revision === before) publish(next);
        return;
      }
      if (native && config) {
        publish(await fetchAndroidRelease(config, version));
        return;
      }
      if ("serviceWorker" in navigator) {
        const reg =
          registration || (await navigator.serviceWorker.getRegistration());
        if (reg) {
          watchRegistration(reg);
          await reg.update();
          if (state.status !== "ready")
            publish({
              ...state,
              status: "up-to-date",
              message:
                "Update check complete. A new version will appear here after it finishes downloading.",
            });
          return;
        }
      }
      publish({
        ...state,
        status: "idle",
        message: "Reload the page while online to get the current web app.",
      });
    } catch {
      publish({
        ...state,
        status: "unavailable",
        message:
          "Could not check for updates. You can keep playing offline; try again later.",
      });
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
export async function openAppUpdate() {
  if (nativeUpdater && state.downloadUrl && state.latestVersion) {
    const url = state.downloadUrl,
      latest = state.latestVersion;
    publish({
      ...state,
      status: "downloading",
      android: true,
      progress: 0,
      message: "Starting update download…",
    });
    try {
      await androidUpdates.download({ url, version: latest });
    } catch {
      publish({
        ...state,
        status: "available",
        message: "Could not start the download. Tap Download to retry.",
      });
    }
    return;
  }
  if (bridge) {
    try {
      return await bridge.openUpdate();
    } catch {
      publish({
        ...state,
        message: "Could not open the download. Please try again.",
      });
      return;
    }
  }
  window.open(
    state.downloadUrl || state.releaseUrl || releasePage,
    "_blank",
    "noopener,noreferrer",
  );
}
export async function applyAppUpdate() {
  if (nativeUpdater && state.status === "ready") {
    if (
      !window.confirm(
        "Install the update now? Finish any live game first. Android will confirm the update; your saved games and settings stay.",
      )
    )
      return;
    try {
      await androidUpdates.install();
    } catch {
      publish({
        ...state,
        status: "unavailable",
        message:
          "Could not open this update. Check for updates and download it again.",
      });
    }
    return;
  }
  if (bridge) {
    try {
      return await bridge.installUpdate?.();
    } catch {
      publish({
        ...state,
        message:
          "Could not start the update. Close the app normally or try again.",
      });
      return;
    }
  }
  if (!registration?.waiting || state.status !== "ready") return;
  if (
    !window.confirm(
      "Reload Knightfall to apply the update? Finish any live game first. Saved games and settings will stay on this device.",
    )
  )
    return;
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => window.location.reload(),
    { once: true },
  );
  registration.waiting.postMessage({ type: "SKIP_WAITING" });
}
