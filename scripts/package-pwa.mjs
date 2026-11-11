import { readdir, readFile, writeFile, stat, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
// Make the application license and attribution readable in every web/native build.
await mkdir(path.join(dist,'licenses'),{recursive:true});
await copyFile(path.join(root,'LICENSE'),path.join(dist,'licenses','KNIGHTFALL-GPL-3.0.txt'));
await writeFile(path.join(dist,'licenses','THIRD-PARTY.txt'),(await readFile(path.join(root,'docs','THIRD-PARTY.md'),'utf8')).replace('../LICENSE','./KNIGHTFALL-GPL-3.0.txt').replace('(ENGINE.md)','(../engine/SOURCE.txt)'));
const assets = [];
async function walk(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute);
    else {
      const relative = path.relative(dist, absolute).split(path.sep).join('/');
      if (relative === 'sw.js' || relative === 'sw-manifest.js' || relative.endsWith('.map') || relative.startsWith('downloads/') || relative.startsWith('engine/full/') || (relative.endsWith('-source.tar.gz') || relative.endsWith('-source.tgz'))) continue;
      const size = (await stat(absolute)).size;
      if (size > 64 * 1024 * 1024) throw new Error(`Offline asset exceeds 64 MiB: ${relative}`);
      assets.push({relative, absolute, size});
    }
  }
}
await walk(dist);
assets.sort((a, b) => a.relative.localeCompare(b.relative));
if (!assets.some(asset => asset.relative === 'index.html')) throw new Error('Build dist/index.html before packaging the PWA.');
const hash = createHash('sha256');
for (const asset of assets) {
  hash.update(asset.relative);
  hash.update(await readFile(asset.absolute));
}
const build = hash.digest('hex').slice(0, 16);
const manifest = `self.__KNIGHTFALL_BUILD__ = ${JSON.stringify(build)};\nself.__KNIGHTFALL_ASSETS__ = ${JSON.stringify(assets.map(asset => './' + asset.relative), null, 2)};\n`;
await writeFile(path.join(dist, 'sw-manifest.js'), manifest);
console.log(`Offline manifest: ${assets.length} assets, ${(assets.reduce((sum, asset) => sum + asset.size, 0) / 1024 / 1024).toFixed(1)} MiB, build ${build}`);
