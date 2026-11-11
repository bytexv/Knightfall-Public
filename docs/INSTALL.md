# Install Knightfall 1.3

Download from https://github.com/bytexv/Knightfall-Public/releases/latest.

**Windows:** Choose `Knightfall-1.3.0-Windows-Setup.exe` for the installed edition. Updates download automatically and install when you close the app; Settings also offers a confirmed restart. The app never restarts a live game automatically. Earlier portable versions need this one-time installation to gain automatic updates. Existing games and settings use the same local app profile. Keep the default user installation for consistent profile access.

The optional `Knightfall-1.3.0-Windows-x64.exe` runs without installation and updates through manual downloads. Both Windows editions are unsigned; no verified publisher certificate is claimed.

**Android:** Install `Knightfall-1.3.0-Android.apk` over the previous APK. Version code 4 and the same development signing key support an in-place update. The app checks GitHub for newer APKs; Android asks you to approve installation. This is a development APK, not an app-store release. Export your backup before uninstalling or changing signing identities.

**Web / iPhone:** Open the supplied hosted web app. On iPhone, Safari's Share → Add to Home Screen installs the web app. Web updates download in the background and appear in Settings; choose Reload to update after finishing your game. A signed native iOS IPA is not included.

**Source:** Unzip the source archive, install Node.js 24, run `npm ci`, `node scripts/prepare-engine.mjs`, then `npm run build`. Use `npm run lan` to serve a local Wi-Fi host. More details: [README](../README.md), [Packaging](PACKAGING.md), [Mobile](MOBILE.md), [GitHub](GITHUB.md).

Games, Local Elo and settings stay in the current app/browser profile. Settings → Download a backup exports games, ratings, settings and supported puzzle progress. Clearing app data or uninstalling can remove local data.
