import { Capacitor } from "@capacitor/core";
import {
  ArrowRight,
  Check,
  Copy,
  Globe2,
  Link2,
  LoaderCircle,
  Monitor,
  Radio,
  ShieldCheck,
  Smartphone,
  Users,
  Wifi,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { LanClient, type LanSnapshot } from "../lib/lan";
import "./NetworkPanel.css";

type HostInfo = { urls: string[]; port: number };
type NetworkPanelProps = {
  onGame: (snapshot: LanSnapshot, client: LanClient) => void;
};
const normaliseAddress = (value: string) => {
  const url = new URL(
    /^[a-z]+:\/\//i.test(value.trim())
      ? value.trim()
      : `http://${value.trim()}`,
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Enter a host address like http://192.168.1.20:8787.");
  return url.origin;
};
const isLoopback = (url: string) => {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};

export default function NetworkPanel({ onGame }: NetworkPanelProps) {
  const tabsId = useId();
  const desktop = (
    window as Window & { knightfall?: { hostLan?: () => Promise<HostInfo> } }
  ).knightfall;
  const native = Capacitor.isNativePlatform();
  const [tab, setTab] = useState<"create" | "join">(native ? "join" : "create");
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("knightfall.playerName") || "Player";
    } catch {
      return "Player";
    }
  });
  const [address, setAddress] = useState(() => {
    try {
      const previous = sessionStorage.getItem("knightfall.lan.lastHost");
      if (previous) return normaliseAddress(previous);
    } catch {
      /* storage unavailable */
    }
    return desktop ? window.location.origin : "";
  });
  const [code, setCode] = useState("");
  const [time, setTime] = useState("10+0");
  const [color, setColor] = useState<"w" | "b" | "random">("random");
  const [host, setHost] = useState<HostInfo | null>(null);
  const [hostChecked, setHostChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [room, setRoom] = useState<LanSnapshot | null>(null);
  const [savedRoom, setSavedRoom] = useState<string | null>(null);
  const clientRef = useRef<LanClient | null>(null);
  const callback = useRef(onGame);
  const mounted = useRef(true);
  callback.current = onGame;
  useEffect(() => {
    mounted.current = true;
    if (!native)
      fetch("/api/lan-info", { signal: AbortSignal.timeout(3000) })
        .then((response) => response.json())
        .then((data) => {
          if (Array.isArray(data.urls) && data.port) {
            setHost(data);
            if (!desktop) setAddress(window.location.origin);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (mounted.current) setHostChecked(true);
        });
    else setHostChecked(true);
    return () => {
      mounted.current = false;
    };
  }, [native]);

  useEffect(() => {
    try {
      setSavedRoom(
        address.trim()
          ? new LanClient(normaliseAddress(address)).savedRoom()
          : null,
      );
    } catch {
      setSavedRoom(null);
    }
  }, [address]);

  const connectClient = async (url: string) => {
    clientRef.current?.disconnect();
    const client = new LanClient(url);
    clientRef.current = client;
    client.on("snapshot", (snapshot) => {
      if (mounted.current) {
        setRoom(snapshot);
        setBusy(false);
        setError("");
      }
      callback.current(snapshot, client);
    });
    client.on("error", (message) => {
      if (mounted.current) {
        setError(message);
        setBusy(false);
        setSavedRoom(client.savedRoom());
      }
    });
    await client.connect();
    try {
      sessionStorage.setItem("knightfall.lan.lastHost", client.serverUrl);
    } catch {
      /* storage unavailable */
    }
    setAddress(client.serverUrl);
    return client;
  };
  const getHost = async () => {
    if (desktop?.hostLan) {
      const info = await desktop.hostLan();
      setHost(info);
      setAddress(info.urls[0]);
      return info.urls[0];
    }
    if (host) return address || window.location.origin;
    throw new Error(
      "Start the Windows host or run npm run lan on your computer, then open its local address.",
    );
  };
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const url = await getHost();
      const client = await connectClient(url);
      const [timeMinutes, incrementSeconds] = time.split("+").map(Number);
      try {
        localStorage.setItem("knightfall.playerName", name.trim() || "Player");
      } catch {
        /* storage unavailable */
      }
      client.create({
        name: name.trim() || "Player",
        color,
        timeMinutes,
        incrementSeconds,
      });
    } catch (issue) {
      setError(
        issue instanceof Error ? issue.message : "Could not start the room.",
      );
      setBusy(false);
    }
  };
  const join = async (resume = false) => {
    setBusy(true);
    setError("");
    try {
      const url = normaliseAddress(address);
      if (
        window.location.protocol === "https:" &&
        url.startsWith("http:") &&
        !native &&
        !desktop
      ) {
        throw new Error(
          "Open the host’s local address using the button below, then enter your room code there. Secure websites cannot connect directly to an HTTP Wi-Fi host.",
        );
      }
      const client = await connectClient(url);
      try {
        localStorage.setItem("knightfall.playerName", name.trim() || "Player");
      } catch {
        /* storage unavailable */
      }
      if (resume) {
        if (!client.resumeSaved())
          throw new Error(
            "No saved seat is available for this host. Enter the room code to join.",
          );
      } else client.join(code, name.trim() || "Player");
    } catch (issue) {
      setError(
        issue instanceof Error ? issue.message : "Could not join the room.",
      );
      setBusy(false);
    }
  };
  const copy = async (value: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext)
        await navigator.clipboard.writeText(value);
      else {
        const input = document.createElement("textarea");
        input.value = value;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        const success = document.execCommand("copy");
        input.remove();
        if (!success) throw new Error("Copy unavailable");
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(
        "Copy is unavailable here. Select and copy the address shown below.",
      );
    }
  };
  let localLink = "";
  try {
    localLink = normaliseAddress(address);
  } catch {
    /* wait until valid */
  }
  const canCreate = !!desktop?.hostLan || !!host;
  const shareAddress = host?.urls.find((url) => !isLoopback(url));

  return (
    <section className="network-view">
      <div className="network-intro">
        <span className="network-eyebrow">
          <Wifi size={15} /> SAME-WI-FI MULTIPLAYER
        </span>
        <h1>Play across the room.</h1>
        <p>
          Host a game on your computer, then join from another device on the
          same Wi-Fi. Share the address and six-character room code.
        </p>
      </div>
      <div className="network-layout">
        <div className="network-card">
          <div
            className="network-tabs"
            role="tablist"
            aria-label="Wi-Fi room action"
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              event.stopPropagation();
              const next =
                event.key === "Home"
                  ? "create"
                  : event.key === "End"
                    ? "join"
                    : tab === "create"
                      ? "join"
                      : "create";
              setTab(next);
              event.currentTarget
                .querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [next === "create" ? 0 : 1]?.focus();
            }}
          >
            <button
              id={`${tabsId}-create`}
              role="tab"
              aria-selected={tab === "create"}
              aria-controls={`${tabsId}-panel`}
              tabIndex={tab === "create" ? 0 : -1}
              className={tab === "create" ? "active" : ""}
              onClick={() => setTab("create")}
            >
              <Radio size={17} /> Create a room
            </button>
            <button
              id={`${tabsId}-join`}
              role="tab"
              aria-selected={tab === "join"}
              aria-controls={`${tabsId}-panel`}
              tabIndex={tab === "join" ? 0 : -1}
              className={tab === "join" ? "active" : ""}
              onClick={() => setTab("join")}
            >
              <Link2 size={17} /> Join a room
            </button>
          </div>
          {room ? (
            <div
              className="network-room"
              id={`${tabsId}-panel`}
              role="tabpanel"
              aria-labelledby={`${tabsId}-${tab}`}
            >
              <div className="network-live">
                <span />{" "}
                {room.status === "waiting" ? "Room is ready" : "Game connected"}
              </div>
              <h2>Invite your opponent</h2>
              <p>
                Ask them to open the host address on their device, then enter
                this code.
              </p>
              <button
                className="network-code"
                onClick={() => void copy(room.code)}
                aria-label={`Copy room code ${room.code}`}
              >
                {room.code}
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
              {shareAddress && (
                <div className="network-address">
                  <span>Host address</span>
                  <button onClick={() => void copy(shareAddress)}>
                    {shareAddress}
                    <Copy size={15} />
                  </button>
                </div>
              )}
              <p className="network-note">
                Keep the host computer awake and Knightfall open. Both devices
                must use the same Wi-Fi.
              </p>
            </div>
          ) : (
            <div
              className="network-form"
              id={`${tabsId}-panel`}
              role="tabpanel"
              aria-labelledby={`${tabsId}-${tab}`}
            >
              <label className="network-label">
                Your name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={24}
                  placeholder="Your name"
                  autoComplete="nickname"
                />
              </label>
              {tab === "create" ? (
                <>
                  {!canCreate && hostChecked && (
                    <div className="network-host-help">
                      <Monitor size={22} />
                      <div>
                        <strong>Host from your computer</strong>
                        <p>
                          Open the Windows app and choose Create a room, or run{" "}
                          <code>npm run lan</code> from the source folder. Open
                          the local address it shows to create your room.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="network-two">
                    <label className="network-label">
                      Time control
                      <select
                        value={time}
                        onChange={(event) => setTime(event.target.value)}
                      >
                        <option value="1+0">1 min · Bullet</option>
                        <option value="3+2">3 + 2 · Blitz</option>
                        <option value="5+0">5 min · Blitz</option>
                        <option value="10+0">10 min · Rapid</option>
                        <option value="15+10">15 + 10 · Rapid</option>
                        <option value="30+0">30 min · Classical</option>
                        <option value="0+0">Unlimited</option>
                      </select>
                    </label>
                    <label className="network-label">
                      Play as
                      <select
                        value={color}
                        onChange={(event) =>
                          setColor(event.target.value as typeof color)
                        }
                      >
                        <option value="random">Random side</option>
                        <option value="w">White</option>
                        <option value="b">Black</option>
                      </select>
                    </label>
                  </div>
                  <button
                    className="network-primary"
                    disabled={busy || !canCreate}
                    onClick={() => void create()}
                  >
                    {busy ? (
                      <LoaderCircle className="network-spin" size={18} />
                    ) : (
                      <Wifi size={18} />
                    )}
                    {busy ? "Starting your room…" : "Create Wi-Fi room"}
                    <ArrowRight size={18} />
                  </button>
                  <p className="network-note">
                    <ShieldCheck size={14} /> No account. No relay. The host
                    validates every move.
                  </p>
                </>
              ) : (
                <>
                  <label className="network-label">
                    Host address
                    <input
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      placeholder="http://192.168.1.20:8787"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <span>Shown on the computer hosting the game.</span>
                  </label>
                  <label className="network-label">
                    Room code
                    <input
                      className="network-code-input"
                      value={code}
                      onChange={(event) =>
                        setCode(
                          event.target.value
                            .replace(/[^a-z0-9]/gi, "")
                            .toUpperCase(),
                        )
                      }
                      maxLength={6}
                      placeholder="ABC234"
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <button
                    className="network-primary"
                    disabled={busy || code.length !== 6 || !address.trim()}
                    onClick={() => void join()}
                  >
                    {busy ? (
                      <LoaderCircle className="network-spin" size={18} />
                    ) : (
                      <Users size={18} />
                    )}
                    {busy ? "Connecting…" : "Join the game"}
                    <ArrowRight size={18} />
                  </button>
                  {savedRoom && (
                    <button
                      className="network-secondary"
                      disabled={busy}
                      onClick={() => void join(true)}
                    >
                      Resume saved seat · {savedRoom}
                    </button>
                  )}
                  {localLink.startsWith("http:") &&
                    window.location.protocol === "https:" &&
                    !native &&
                    !desktop && (
                      <a
                        className="network-secondary"
                        href={localLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open local host <ArrowRight size={15} />
                      </a>
                    )}
                </>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="network-error">
              {error}
            </p>
          )}
        </div>
        <aside className="network-guide">
          <div className="network-device-art" aria-hidden="true">
            <span className="network-device-main">
              <Monitor size={62} strokeWidth={1.3} />
              <span>♞</span>
            </span>
            <span className="network-device-signal">
              <Wifi size={34} strokeWidth={1.6} />
            </span>
            <span className="network-device-phone">
              <Smartphone size={48} strokeWidth={1.3} />
              <span>♟</span>
            </span>
          </div>
          <h2>Connect two devices</h2>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>One player hosts</strong>
                <p>
                  Start a room on your Windows computer or with the included
                  local server.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Share the local address</strong>
                <p>
                  Your opponent opens it on a phone, tablet, or computer
                  connected to the same Wi-Fi.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Enter the room code</strong>
                <p>
                  The board and clocks stay in sync. Reconnect to your seat if
                  the network drops.
                </p>
              </div>
            </li>
          </ol>
          <div className="network-guide-foot">
            <Globe2 size={16} />
            <span>
              Internet access is not required after installation. Guest Wi-Fi or
              device isolation may prevent local connections.
            </span>
          </div>
        </aside>
      </div>
    </section>
  );
}
