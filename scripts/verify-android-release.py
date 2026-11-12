"""Verify APK identity, version, WebView settings and every bundled web asset."""
import hashlib, json, os, pathlib, re, subprocess, sys, zipfile
root = pathlib.Path(__file__).resolve().parent.parent
apk = pathlib.Path(sys.argv[1]).resolve()
version = json.loads((root / 'package.json').read_text())['version']
gradle = (root / 'android/app/build.gradle').read_text()
code = re.search(r'versionCode\s+(\d+)', gradle)[1]
cert = 'daeea1bb79058d62827b08f30423a2c244c4ca5a69dda1cfa91f22b314e2f616'
build_tools = pathlib.Path(os.environ['ANDROID_HOME']) / 'build-tools/35.0.0'
result = subprocess.check_output([str(build_tools / 'apksigner'), 'verify', '--print-certs', str(apk)], text=True)
actual = re.findall(r'Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]{64})', result)
if actual != [cert]: raise SystemExit('APK must retain the existing Knightfall signing identity.')
badging = subprocess.check_output([str(build_tools / 'aapt'), 'dump', 'badging', str(apk)], text=True)
if not re.search(r"package: name='studio.knightfall.chess' versionCode='" + code + "' versionName='" + re.escape(version) + "'", badging):
    raise SystemExit('APK package/version differs from the current source.')
with zipfile.ZipFile(apk) as archive:
    config = json.loads(archive.read('assets/capacitor.config.json'))
    if config.get('android', {}).get('webContentsDebuggingEnabled') is not False:
        raise SystemExit('WebView debugging must be disabled.')
    expected = {p.relative_to(root / 'dist').as_posix(): p for p in (root / 'dist').rglob('*') if p.is_file()}
    # Capacitor adds these two bridge stubs during sync; all other assets must match.
    actual = {name.removeprefix('assets/public/') for name in archive.namelist() if name.startswith('assets/public/') and not name.endswith('/')}
    extras = actual - expected.keys() - {'cordova.js', 'cordova_plugins.js'}
    if extras: raise SystemExit(f'Unexpected web assets: {sorted(extras)}')
    for name, path in expected.items():
        if archive.read('assets/public/' + name) != path.read_bytes(): raise SystemExit(f'APK asset mismatch: {name}')
if not expected: raise SystemExit("Build dist before verifying an APK.")
print(json.dumps({'version': version, 'versionCode': int(code), 'sha256': hashlib.file_digest(apk.open('rb'), 'sha256').hexdigest(), 'certificateSha256': cert}))
