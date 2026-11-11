import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const platform = args.has('--ios') ? 'ios' : 'android';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(command, arguments_, cwd = root) {
  const result = spawnSync(command, arguments_, { cwd, stdio: 'inherit', env: process.env, shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command) });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!args.has('--skip-web-build')) run(npm, ['run', 'build']);
if (!existsSync(path.join(root, 'dist/index.html'))) throw new Error('Build the web app first: npm run build');
const capacitor = path.join(root, 'node_modules/@capacitor/cli/bin/capacitor');
if (platform === 'ios') {
  if (process.platform !== 'darwin') {
    run(process.execPath, [capacitor, 'copy', 'ios']);
    console.log('iOS web assets copied. Open ios/App/App.xcworkspace on macOS, run npx cap sync ios, choose a signing team, then archive with Xcode. Linux cannot build or sign an iOS IPA.');
    process.exit(0);
  }
  run(process.execPath, [capacitor, 'sync', 'ios']);
  run(process.execPath, [capacitor, 'open', 'ios']);
  process.exit(0);
}
run(process.execPath, [capacitor, 'sync', 'android']);
const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(gradle, ['--no-daemon', '--max-workers=2', 'assembleDebug'], path.join(root, 'android'));
const source = path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
if (!existsSync(source)) throw new Error('Gradle completed without producing the expected APK.');
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const destination = path.join(root, 'artifacts', `Knightfall-${version}-android-debug.apk`);
mkdirSync(path.dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log(`\nAndroid debug APK: ${destination}`);
const sha256 = createHash('sha256').update(readFileSync(destination)).digest('hex');
writeFileSync(`${destination}.sha256`, `${sha256}  ${path.basename(destination)}\n`);
writeFileSync(path.join(root, 'artifacts', 'android-build.json'), JSON.stringify({version, platform: 'android', signing: 'debug', builtAt: new Date().toISOString(), apk: path.basename(destination), sha256, webIndexSha256: createHash('sha256').update(readFileSync(path.join(root, 'dist/index.html'))).digest('hex')}, null, 2) + '\n');
console.log(`SHA-256: ${sha256}`);
console.log('This APK uses a development signing key. Use your own stable release key for Play Store distribution.');
