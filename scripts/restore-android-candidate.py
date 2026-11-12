"""Reassemble only the exact public signed APK pinned by the source manifest."""
import hashlib, json, pathlib, re, subprocess
root = pathlib.Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'release/android-candidate.json').read_text())
version = json.loads((root / 'package.json').read_text())['version']
if manifest['version'] != version or not re.fullmatch('[a-f0-9]{40}', manifest['commit']):
    raise SystemExit('No signed Android candidate for this version. Stage one before tagging a release.')
chunks = manifest['chunks']
if not 1 <= len(chunks) <= 8: raise SystemExit('Invalid APK chunk count')
subprocess.run(['git', 'fetch', '--no-tags', '--depth=1', 'origin', manifest['commit']], cwd=root, check=True)
output = root / 'artifacts' / f'Knightfall-{version}-Android.apk'
output.parent.mkdir(exist_ok=True)
with output.open('wb') as stream:
    for i, chunk in enumerate(chunks):
        if chunk['name'] != f'apk.part{i:02d}' or not 0 < chunk['size'] <= 64 * 1024 * 1024: raise SystemExit('Invalid APK chunk')
        data = subprocess.check_output(['git', 'show', f"{manifest['commit']}:{chunk['name']}"], cwd=root)
        if len(data) != chunk['size'] or hashlib.sha256(data).hexdigest() != chunk['sha256']: raise SystemExit('APK chunk checksum mismatch')
        stream.write(data)
if hashlib.file_digest(output.open('rb'), 'sha256').hexdigest() != manifest['sha256']: raise SystemExit('APK checksum mismatch')
print('Restored pinned Android candidate; signature and contents must pass verification next.')
