import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "studio.knightfall.chess",
  appName: "Knightfall",
  webDir: "dist",
  server: {
    androidScheme: "https",
    // Same-Wi-Fi games connect to an HTTP/WebSocket server on a player's computer.
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    // Android 15 enforces edge-to-edge windows; keep controls clear of system bars.
    adjustMarginsForEdgeToEdge: "auto",
    backgroundColor: "#171b19",
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#171b19",
    preferredContentMode: "mobile",
  },
};

export default config;
