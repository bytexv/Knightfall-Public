import { mkdir, readdir, copyFile, readFile, writeFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, 'node_modules', 'stockfish');
const output = path.join(root, 'public', 'engine');
const packageInfo = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
if (packageInfo.version !== '17.1.0') throw new Error('This source bundle matches Stockfish 17.1.0. Update its source archive and provenance before changing the engine version.');
const files = await readdir(path.join(source, 'src'));
const javascript = files.find(file => /^stockfish-17\.1-lite-single-[a-z0-9]+\.js$/.test(file));
if (!javascript) throw new Error('Stockfish 17.1 lite single-thread files are missing. Run npm install first.');
const wasm = javascript.replace(/\.js$/, '.wasm');
await mkdir(output, { recursive: true });
await Promise.all([
  copyFile(path.join(source, 'src', javascript), path.join(output, 'stockfish.js')),
  copyFile(path.join(source, 'src', wasm), path.join(output, 'stockfish.wasm')),
  copyFile(path.join(source, 'Copying.txt'), path.join(output, 'COPYING.txt')),
  copyFile(path.join(source, 'AUTHORS'), path.join(output, 'AUTHORS.txt')),
]);
await writeFile(path.join(output, 'SOURCE.txt'), `Stockfish.js ${packageInfo.version}\n\nCopyright (c) 2025 Chess.com, LLC and the Stockfish contributors.\nDistributed under GNU GPL version 3. See COPYING.txt and AUTHORS.txt.\n\nThis application bundles the unmodified lite, single-threaded build from the\nstockfish@${packageInfo.version} npm package. Its JavaScript and WASM files are\nrenamed together to stockfish.js and stockfish.wasm; their contents are unchanged.\nOriginal files: ${javascript}, ${wasm}\n\nA corresponding-source bundle is included beside this notice as:\nstockfish-source.tgz\nIt preserves the original source/build files and includes the lite NNUE network;\nonly prebuilt JavaScript/WASM outputs are excluded.\n\nComplete upstream source and build instructions at the exact npm gitHead:\nhttps://github.com/nmrugg/stockfish.js/tree/602fd7e1a571a2be71f242942db90483731f2a1f\nhttps://github.com/nmrugg/stockfish.js/archive/602fd7e1a571a2be71f242942db90483731f2a1f.tar.gz\n\nUpstream Stockfish: https://github.com/official-stockfish/Stockfish\nNNUE network: https://tests.stockfishchess.org/api/nn/nn-9067e33176e8.nnue\n\nNo connection to these services is needed to play or analyze games.\nKnightfall is an independent application; no endorsement is implied.\n`);
// npm tarballs can mark WASM executable. Keep copied web assets reproducible
// across fresh Linux CI checkouts without changing upstream engine bytes.
await Promise.all(['stockfish.js', 'stockfish.wasm', 'COPYING.txt', 'AUTHORS.txt', 'SOURCE.txt']
  .map(file => chmod(path.join(output, file), 0o644)));
console.log(`Prepared Stockfish ${packageInfo.version} lite single-thread engine in public/engine.`);

// Preserve upstream basenames: full builds assemble six WASM parts at runtime.
const full = files.filter(file => /^stockfish-17\.1-(?:single-)?(?:a496a04|8e4d048)(?:-part-\d)?\.(?:js|wasm)$/.test(file));
if (full.length !== 14) throw new Error('Expected both full NNUE builds and twelve WASM parts.');
await mkdir(path.join(output, 'full'), {recursive:true});
for (const file of full) {
  await copyFile(path.join(source, 'src', file), path.join(output, 'full', file));
  await chmod(path.join(output, 'full', file), 0o644);
}
await writeFile(path.join(output, 'FULL-SOURCE.txt'), `Full Stockfish.js 17.1, unchanged upstream single- and multi-threaded builds.\nUpstream gitHead: 602fd7e1a571a2be71f242942db90483731f2a1f\nCorresponding source, build scripts and both full NNUE networks are in vendor/stockfish-full-source.tgz in the matching Knightfall source release:\nhttps://github.com/bytexv/Knightfall-Public/releases\nBig network SHA256: 1c0000000000a67d629999d932d0c373f7450ce43cd12d0562868f4eaf9ae2ad\nSmall network SHA256: 37f18f62d772f3107e1d6aaca3898c130c3c86f2ab63e6555fbbca20635a899d\nLicense: GPL-3.0; see COPYING.txt and AUTHORS.txt.\n`);
await chmod(path.join(output, 'FULL-SOURCE.txt'), 0o644);
