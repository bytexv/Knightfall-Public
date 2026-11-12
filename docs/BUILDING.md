
### Android publication without repository signing secrets

Every stable release must include the Android APK. It is no longer silently omitted when signing secrets are unavailable. Retain the existing signing identity: a different key cannot update installed copies.

If signing secrets are unavailable, build the APK locally with the retained key, then run:

```
ANDROID_HOME=/path/to/android-sdk python3 scripts/stage-android-release.py artifacts/Knightfall-VERSION-android-debug.apk
```

This verifies the package, version, certificate and bundled web build, then pushes only the public signed APK in bounded chunks to a dedicated candidate branch. Commit `release/android-candidate.json` with the matching release source before tagging. Actions retrieves that exact commit and independently verifies its checksums, signature, package version and every web asset against its tested build before publishing. No private key is committed or uploaded. Keep the candidate branch while release reruns may be needed. Each new version needs a fresh candidate or configured stable signing secrets; missing Android artifacts now fail publication.
