"""Stage a locally signed APK for Actions without uploading private signing keys.
Usage: ANDROID_HOME=... python3 scripts/stage-android-release.py path/to.apk
Push the resulting source manifest with the release; Actions pins this exact commit.
"""
import hashlib, json, pathlib, subprocess, sys, tempfile
root = pathlib.Path(__file__).resolve().parent.parent
apk = pathlib.Path(sys.argv[1]).resolve()
metadata = json.loads(subprocess.check_output([sys.executable, str(root / 'scripts/verify-android-release.py'), str(apk)], text=True))
branch = f"android-candidate-v{metadata['version']}"
with tempfile.TemporaryDirectory(prefix='knightfall-android-') as tmp:
    stage = pathlib.Path(tmp)
    chunks = []
    with apk.open('rb') as stream:
        while data := stream.read(64 * 1024 * 1024):
            name = f'apk.part{len(chunks):02d}'
            (stage / name).write_bytes(data)
            chunks.append({'name': name, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    (stage / 'README.txt').write_text('Public signed Android release candidate. Contains no signing keys. Verified by the release workflow before publication.\n')
    def git(*args): return subprocess.check_output(['git', *args], cwd=stage, text=True).strip()
    git('init', '-b', branch)
    git('config', 'user.name', 'Knightfall Builder'); git('config', 'user.email', 'knightfall@local')
    git('add', '.'); git('commit', '-m', f"Stage signed Knightfall {metadata['version']} Android APK")
    metadata.update({'commit': git('rev-parse', 'HEAD'), 'branch': branch, 'chunks': chunks})
    git('-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'push', 'https://github.com/bytexv/Knightfall-Public.git', f'HEAD:refs/heads/{branch}')
(root / 'release').mkdir(exist_ok=True)
(root / 'release/android-candidate.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(f"Staged verified APK for {metadata['version']}; commit release/android-candidate.json with this release.")
