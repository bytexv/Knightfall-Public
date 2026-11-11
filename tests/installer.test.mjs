import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const afterPack = createRequire(import.meta.url)('../desktop/after-pack.cjs');
test('uninstaller inventory deletes only shipped files and preserves unrelated files/profile data', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'knightfall-installer-'));
  try {
    const app = path.join(root,'win-unpacked'); await fs.mkdir(path.join(app,'resources'),{recursive:true});
    await fs.writeFile(path.join(app,'Knightfall.exe'),'app');await fs.writeFile(path.join(app,'resources','app.asar'),'source');
    await fs.writeFile(path.join(app,'cost$1.txt'),'quoted name');
    await afterPack({electronPlatformName:'win32',appOutDir:app,outDir:root});
    const script=await fs.readFile(path.join(root,'knightfall-uninstall-files.nsh'),'utf8');
    assert.match(script,/Delete "\$INSTDIR\\Knightfall.exe"/);
    assert.match(script,/Delete "\$INSTDIR\\resources\\app-update.yml"/);
    assert.match(script,/cost\$\$1.txt/);
    assert.doesNotMatch(script,/RMDir \/r|\$APPDATA|\$LOCALAPPDATA|Delete [^\n]*\*/i);
    assert.ok(script.indexOf('Delete "$INSTDIR\\resources\\app.asar"') < script.indexOf('RMDir "$INSTDIR\\resources"'));
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});
