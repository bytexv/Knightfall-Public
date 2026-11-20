import { readFile, copyFile, mkdir, chmod, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'node_modules/stockfish');
const output = path.join(root, 'public/engine');
const {version} = JSON.parse(await readFile(path.join(source, 'package.json')));
if (version !== '19.0.1') throw new Error('Expected the pinned stockfish@19.0.1 browser port.');
await mkdir(path.join(output, 'full'), {recursive: true});
const files = [
  ['Copying.txt', 'COPYING.txt'],
  ['bin/stockfish-19-lite-single.js', 'stockfish.js'],
  ['bin/stockfish-19-lite-single.wasm', 'stockfish.wasm'],
];
for (const profile of ['stockfish-19', 'stockfish-19-single']) {
  for (const extension of ['js', 'wasm']) files.push([`bin/${profile}.${extension}`, `full/${profile}.${extension}`]);
}
for (const [from, to] of files) {
  await copyFile(path.join(source, from), path.join(output, to));
  await chmod(path.join(output, to), 0o644);
}
const attribution = `Stockfish.js 19.0.1, based on official Stockfish 19.
Copyright 2026 Chess.com, LLC and the Stockfish contributors. GPLv3.
Port source: https://github.com/nmrugg/stockfish.js/tree/0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6
Official engine: https://github.com/official-stockfish/Stockfish/releases/tag/sf_19
See COPYING.txt and AUTHORS.txt. The port's JS and WASM bytes are unchanged.
`;
await writeFile(path.join(output, 'SOURCE.txt'), attribution + `Lite uses stockfish-19-lite-single.{js,wasm}, renamed together.
Corresponding source, build scripts, and lite NNUE data are in stockfish-source.tgz.
Lite NNUE SHA-256: 61e7af4bb97d51eeeb25d322916f86513b5cd3a827ce189c98c6e31946f99e5b
`);
await writeFile(path.join(output, 'FULL-SOURCE.txt'), attribution + `Full uses stockfish-19-single or stockfish-19 with shared memory.
Corresponding source, build scripts and the original networks are in vendor/stockfish-full-source.tgz in the matching source release:
https://github.com/bytexv/Knightfall-Public/releases
Full NNUE SHA-256: 1a298aa575a085434d29027978dc36867fe9c5bcea9376654b7a8eba1e52dfc2
`);
