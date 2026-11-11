# GitHub source and releases

The public source repository is [bytexv/Knightfall-Public](https://github.com/bytexv/Knightfall-Public). The source includes CI, a tagged release workflow and a desktop update checker. Publishing source does not publish app downloads automatically.

`public/update-config.json` points to this public repository. Newly built apps can check its latest stable release without signing in. Previously distributed 1.2.0 binaries retain their original blank configuration and need a new build to gain this connection. Update downloads remain manual; the app does not install or execute replacements automatically.

## Connect the repository

Keep an existing hosting remote and add GitHub separately:

```sh
git remote add github https://github.com/bytexv/Knightfall-Public.git
git push github main
```

If the `github` remote already exists, inspect it with `git remote -v`. Use your normal GitHub sign-in or credential helper; credentials do not belong in application files.

Before the first automated Android release, configure the signing secrets described below. No signing keys or passwords are supplied by this source push. Until a stable release is published, update checks report that no release is available.

## What the workflows do

`Check source` runs on main/master pushes, pull requests, or a manual run. It installs the locked dependencies with Node.js 24, prepares the bundled engine, runs the tests, builds the web app, and checks that committed engine files match their preparation script.

`Build and publish release` runs when a `v*` tag is pushed, or manually for an existing tag. It requires a stable version such as `v1.2.0`, matching `package.json` and Android's `versionName`. It builds the web app once and gives both native jobs the same assets and tested source commit.

The release contains:

- The full Windows x64 portable EXE; no split download is needed on GitHub.
- An Android APK signed with the explicitly configured stable certificate.
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

Only the signing step receives these secrets. It writes the keystore to the runner's temporary directory, supplies passwords through environment variables, verifies the resulting certificate against the expected fingerprint, and removes temporary signing material. If a secret is absent or the certificate differs, Android release publication fails. No new development key is substituted.

Before signing secrets are configured, a maintainer can publish locally verified binaries through GitHub's release interface. That is separate from running this automated release workflow. Keep every keystore and password out of Git commits, source ZIPs, release attachments and logs.

## Publish the next stable version

1. Update `package.json` and the lockfile, Android `versionName` and increasing `versionCode`, and the iOS version fields if distributing that project. Update release notes and the confirmed repository configuration.
2. Run the source tests and builds, then commit and push the intended source.
3. Create and push the matching stable tag. For example:

```sh
git tag v1.2.0
git push github v1.2.0
```

Alternatively, choose **Actions → Build and publish release → Run workflow** and enter an existing stable tag. The workflow checks out `refs/tags/<tag>` and pins both native jobs to the commit that passed the source checks. A failed or incomplete build does not publish a release. Use a new version for changed binaries instead of replacing an already released version's files.

The desktop app checks the configured repository's latest published stable release at launch and can check again from Settings. It compares versions, validates repository-specific HTTPS links, and never offers a downgrade. Opening the download requires a user action. The app does not install or execute the unsigned replacement automatically: close the old portable app and open the downloaded version yourself. Local analysis continues to use the bundled engine.

GitHub API rate limits, offline connections, missing releases and private repositories can make a check unavailable. They do not prevent local chess play. Automatic installation and Windows code signing are separate future release work.
