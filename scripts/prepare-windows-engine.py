"""Fetch the pinned upstream engine for both x64 Windows packages."""
import hashlib
from pathlib import Path
import shutil
import tempfile
import urllib.request
import zipfile

root = Path(__file__).resolve().parents[1]
name = 'stockfish-windows-x86-64-universal'
url = f'https://github.com/official-stockfish/Stockfish/releases/download/sf_19/{name}.zip'
archive_hash = '3c8bf1f9ea66a09350a40df4f632288285ac206d99f33ab5842c408fc30b48a7'
binary_hash = '45bc8e4969147db9c2eb533810637994619bff0eacc81ccfd9854394901bcbd0'
destination = root / 'artifacts/native-engine'
destination.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory() as temp:
    archive = Path(temp) / 'stockfish.zip'
    with urllib.request.urlopen(url, timeout=180) as response, archive.open('wb') as target:
        shutil.copyfileobj(response, target)
    with archive.open('rb') as source:
        if hashlib.file_digest(source, 'sha256').hexdigest() != archive_hash:
            raise SystemExit('Upstream archive digest mismatch')
    with zipfile.ZipFile(archive) as zip_file:
        binary = zip_file.read(f'stockfish/{name}.exe')
        if hashlib.sha256(binary).hexdigest() != binary_hash:
            raise SystemExit('Upstream engine digest mismatch')
        (destination / 'stockfish.exe').write_bytes(binary)
        for notice in ['Copying.txt', 'AUTHORS']:
            (destination / notice).write_bytes(zip_file.read('stockfish/' + notice))
(destination / 'SOURCE.txt').write_text(
    'Official Stockfish 19 (sf_19), GPLv3. Source commit edb0d9db6731067ec50ce619ff372b463bc4dd5d.\n'
    'Matching source and network: vendor/stockfish-native-source.tgz and vendor/stockfish-full-source.tgz\n'
    'in the Knightfall source release at https://github.com/bytexv/Knightfall-Public/releases\n' + url + '\n'
)
