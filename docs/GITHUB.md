# GitHub source and releases

The public source repository is [bytexv/Knightfall-Public](https://github.com/bytexv/Knightfall-Public). The source includes CI, a tagged release workflow and a desktop update checker. Publishing source does not publish app downloads automatically.

`public/update-config.json` points to this public repository. Newly built apps can check its latest stable release without signing in. Previously distributed 1.2.0 binaries retain their original blank configuration and need a new build to gain this connection. Version 1.3 adds a Windows Setup edition that downloads updates automatically and installs on normal exit or a confirmed restart. Portable Windows and Android installs remain manual.

## Connect the repository

Keep an existing hosting remote and add GitHub separately:

```sh
git remote add github https://github.com/bytexv/Knightfall-Public.git
git push github main
```

If the `github` remote already exists, inspect it with `git remote -v`. Use your normal GitHub sign-in or credential helper; credentials do not belong in application files.

The connected GitHub integration currently cannot manage repository signing secrets. The 1.3 Android APK is built locally with the existing development key. Configure the five signing secrets below before automating Android releases. Without them, the workflow still publishes Windows/source/web assets, explicitly omitting Android. No key or password is in the source repository.

## What the workflows do

`Check source` runs on main/master pushes, pull requests, or a manual run. It installs the locked dependencies with Node.js 24, prepares the bundled engine, runs the tests, builds the web app, and checks that committed engine files match their preparation script.

`Build and publish release` runs when a `v*` tag is pushed, or manually for an existing tag. It requires a stable version such as `v1.3.1`, matching `package.json` and Android's `versionName`. It builds the web app once and gives both native jobs the same assets and tested source commit.

The release contains:

- The Windows x64 Setup installer, its blockmap and `latest.yml` updater feed, plus the portable EXE. GitHub supports these full files without splitting.
- An Android APK signed with the configured stable certificate, when all five signing secrets are present.
- Web and source ZIPs, including licenses and the bundled Stockfish corresponding source.
- Release instructions and `SHA256SUMS.txt` covering all download files.

The Windows build runs on a Windows runner and verifies the packaged files, runtime fuses, local server and engine assets. It remains unsigned; this workflow does not configure Windows publisher signing. Android builds with JDK 21 and SDK 35, runs native unit tests, verifies the configured certificate and checks every bundled web asset. These packaging checks do not substitute for target-device gameplay testing.

Only the final publishing job gets `contents: write`. The other jobs have read-only repository permissions. Publication uses the job's temporary `GITHUB_TOKEN`, not a personal token stored in the app. The workflow verifies that the tag still points to the tested commit and refuses to silently replace an existing release.

## Configure Android signing once

The earlier downloadable APKs used a local development signing key. That keystore is not in this repository and remains local; this scaffold does not upload it or configure repository secrets. Keep its backup if you need to sign compatible local updates.

Android only accepts an in-place update when the application ID and signing identity are compatible and the version code increases. A new publisher key cannot update an APK signed with the old development key. Export games and settings before moving to a differently signed installation, which may require uninstalling the old app. Choose the intended long-term signing identity before publishing automated APK releases.

For automation, provide a stable keystore through **Repository settings → Secrets and variables → Actions → New repository secret**. Do not generate a fresh key on each runner. Add these five secrets:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded bytes of the selected stable keystore. |
| `ANDROID_KEY_ALIAS` | Alias of the signing key inside that keystore. |
| `ANDROID_STORE_PASSWORD` | Keystore password. |
| `ANDROID_KEY_PASSWORD` | Password for the selected key, even if it matches the store password. |
| `ANDROID_CERT_SHA256` | Expected SHA-256 fingerprint of that signing certificate; colons and spaces are accepted. |

For a new signing identity, create its keystore in a private directory outside the checkout using Java's `keytool`. For example, the following command prompts for the password and certificate details:

```sh
keytool -genkeypair -keystore /private/path/knightfall-release.jks -alias knightfall -keyalg RSA -keysize 3072 -validity 10000
keytool -list -v -keystore /private/path/knightfall-release.jks -alias knightfall
```

Copy the certificate's SHA-256 fingerprint into `ANDROID_CERT_SHA256`. On Windows, base64 bytes can be copied directly to the clipboard for pasting into the secret field:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\private\knightfall-release.jks')) | Set-Clipboard
```

Only the signing step receives these secrets. It writes the keystore to the runner's temporary directory, supplies passwords through environment variables, verifies the resulting certificate against the expected fingerprint, and removes temporary signing material. If a secret is absent, the workflow requires a locally signed candidate pinned in `release/android-candidate.json`; see [BUILDING.md](BUILDING.md). A missing Android artifact now fails the release. If a configured certificate differs or signing fails, publication fails. No new development key is substituted.

Before signing secrets are configured, use `scripts/stage-android-release.py` to provide the existing signed APK to the automated workflow. Only the public APK is staged; CI verifies its signature, version, checksums and bundled assets before publication. Keep every keystore and password out of Git commits, source ZIPs, release attachments and logs.

## Publish the next stable version

1. Update `package.json` and the lockfile, Android `versionName` and increasing `versionCode`, and the iOS version fields if distributing that project. Update release notes and the confirmed repository configuration.
2. Run the source tests and builds. When signing secrets are unavailable, build and stage the compatible Android APK following BUILDING.md. Commit its manifest with the intended source and push.
3. Create and push the matching stable tag. For example:

```sh
git tag v1.3.1
git push github v1.3.1
```

Alternatively, choose **Actions → Build and publish release → Run workflow** and enter an existing stable tag. The workflow checks out `refs/tags/<tag>` and pins both native jobs to the commit that passed the source checks. A failed Windows/source build or failed configured Android signing does not publish a release. An unconfigured Android signing identity omits only the APK. Existing releases are retained without replacing their files. Use a new version for changed binaries.

The Windows Setup edition checks this repository's `releases/latest/download/latest.yml` at startup and every four hours. It accepts only a newer stable version, the exact versioned Setup filename, a bounded installer size and a SHA-512 digest. electron-updater verifies the downloaded installer before it can install. The app downloads in the background and installs on normal exit; **Restart and update** asks for confirmation first. The unsigned build relies on HTTPS, repository ownership and SHA-512 integrity, not a verified Windows publisher certificate. Protect repository write/release access.

The portable edition uses the bounded GitHub release API checker and opens the exact portable download after a click. Android performs startup/resume checks. Version 1.5 adds an in-app APK download into private cache, restricted HTTPS redirects, file-size/time limits, package/version/signing-certificate checks, and a system installer handoff. The user may need to allow installations from Knightfall once, then approve each in-place update. Saved games and preferences remain. The APK must use the same signing identity as the installed app; a signed candidate supports publication when repository signing secrets are unavailable. Neither platform silently restarts an active game. Native iOS requires a separately signed build.

Web updates use the existing service worker. New assets download in the background, and Settings can activate the waiting worker and reload after confirmation. Active games are never automatically reloaded. Native desktop/Capacitor builds do not register a service worker, preventing old web caches from hiding bundled native updates.

Offline connections, missing releases and rate limits do not prevent local chess. Windows code signing and physical-device acceptance remain separate release work.

A source push runs CI. Publish a matching stable version tag to deliver an app update; ordinary commits are not automatically installed on users' devices. Windows `Restart and update` now runs the verified installer silently after confirmation, so it no longer opens the setup wizard. Portable users must use Setup once to enable future background updates.
