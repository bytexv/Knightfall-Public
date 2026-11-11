import { spawn } from 'node:child_process';
import { access, readdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
await access(path.join(root, 'dist', 'index.html')).catch(() => {throw new Error('Run npm run build before packaging Windows.');});
const executable = path.join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
const args = [executable, '--config', 'desktop/electron-builder.yml', '--win', 'portable', '--x64'];
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, {cwd: root, stdio: 'inherit', env: {...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false'}});
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Windows packaging failed (${code})`)));
});
const output = path.join(root, 'artifacts', 'windows');
const files = (await readdir(output)).filter(file => file.endsWith('.exe'));
if (!files.length) throw new Error('No Windows .exe was produced.');
const checksums = [];
for (const file of files) checksums.push(`${createHash('sha256').update(await readFile(path.join(output,file))).digest('hex')}  ${file}`);
await writeFile(path.join(output, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
const packageJson = JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const electronJson = JSON.parse(await readFile(path.join(root,'node_modules/electron/package.json'),'utf8'));
const digest = data => createHash('sha256').update(data).digest('hex');
await writeFile(path.join(output,'windows-build.json'),JSON.stringify({
  app:'Knightfall', version:packageJson.version, platform:'win32', arch:'x64', electron:electronJson.version,
  signed:false, builtAt:new Date().toISOString(),
  indexSha256:digest(await readFile(path.join(root,'dist/index.html'))),
  offlineManifestSha256:digest(await readFile(path.join(root,'dist/sw-manifest.js'))),
  checksums,
},null,2)+'\n');
console.log(`Windows build ready: ${files.join(', ')}`);
