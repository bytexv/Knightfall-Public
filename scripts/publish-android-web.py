"""Publish the newest released web ZIP and its Android install page to gh-pages."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile

repo = "bytexv/Knightfall-Public"
root = Path(__file__).resolve().parents[1]

def git(*args, env=None, cwd=root):
    return subprocess.check_output(["git", *args], cwd=cwd, env=env, text=True).strip()

def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def request_build(commit):
    if os.environ.get("GITHUB_ACTIONS") != "true":
        return
    latest = json.loads(subprocess.check_output(["gh", "api", f"repos/{repo}/pages/builds/latest"]))
    if latest.get("commit") == commit and latest.get("status") in {"built", "building", "queued"}:
        return
    subprocess.run(["gh", "api", "--method", "POST", f"repos/{repo}/pages/builds", "--silent"], check=True)

def main():
    rows = subprocess.check_output(["gh", "api", "--paginate", f"repos/{repo}/releases?per_page=100",
                                    "--jq", ".[] | @json"], text=True)
    candidates = []
    for row in rows.splitlines():
        release = json.loads(row)
        tag = release["tag_name"]
        if release["draft"] or not re.fullmatch(r"v(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2}", tag):
            continue
        version = tag[1:]
        name = f"Knightfall-{version}-web.zip"
        for asset in release["assets"]:
            if asset["name"] == name and asset["state"] == "uploaded":
                candidates.append((tuple(map(int, version.split("."))), version, asset, release["prerelease"]))
    if not candidates:
        raise SystemExit("No released Knightfall web ZIP found.")
    _, version, asset, preview = max(candidates, key=lambda item: item[0])
    url = f"https://github.com/{repo}/releases/download/v{version}/{asset['name']}"
    if asset["browser_download_url"] != url or not re.fullmatch(r"sha256:[a-f0-9]{64}", asset["digest"] or ""):
        raise SystemExit("Unverified web release asset.")
    install = root / "public/install"
    metadata = {"version": version, "preview": preview, "webSha256": asset["digest"][7:],
                "installerTree": git("rev-parse", "HEAD:public/install")}
    git("fetch", "--no-tags", "origin", "refs/heads/gh-pages")
    parent = git("rev-parse", "FETCH_HEAD")
    previous = subprocess.run(["git", "show", parent + ":install/version.json"], cwd=root,
                              capture_output=True, text=True)
    if previous.returncode == 0 and json.loads(previous.stdout) == metadata:
        request_build(parent)
        print(f"Knightfall {version} is already on the Android web channel.")
        return
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        archive = work / "web.zip"
        with urllib.request.urlopen(url, timeout=120) as src, archive.open("wb") as out:
            shutil.copyfileobj(src, out)
        if archive.stat().st_size != asset["size"] or sha256(archive) != metadata["webSha256"]:
            raise SystemExit("Web release ZIP checksum mismatch.")
        web = work / "site"
        with zipfile.ZipFile(archive) as bundle:
            for entry in bundle.infolist():
                path = Path(entry.filename)
                if path.is_absolute() or ".." in path.parts or ".git" in path.parts:
                    raise SystemExit("Unexpected path in web release.")
            bundle.extractall(web)
        for required in ["index.html", "manifest.webmanifest", "sw.js", "sw-manifest.js"]:
            if not (web / required).is_file():
                raise SystemExit(f"Missing required web asset: {required}")
        shutil.copytree(install, web / "install", dirs_exist_ok=True)
        (web / "install/version.json").write_text(json.dumps(metadata) + "\n")
        (web / ".nojekyll").touch()
        env = dict(os.environ, GIT_DIR=git("rev-parse", "--absolute-git-dir"),
                   GIT_INDEX_FILE=str(work / "index"), GIT_WORK_TREE=str(web))
        git("read-tree", "--empty", cwd=web, env=env)
        git("add", "--force", "--all", "--", ".", cwd=web, env=env)
        commit = git("commit-tree", git("write-tree", cwd=web, env=env), "-p", parent,
                     "-m", f"Publish Knightfall {version} for Android web installation")
        git("push", "origin", commit + ":refs/heads/gh-pages")
        request_build(commit)
        print(f"Published Knightfall {version} web release {metadata['webSha256']}.")

if __name__ == "__main__":
    main()
