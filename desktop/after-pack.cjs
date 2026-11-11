const fs = require('node:fs/promises');
const path = require('node:path');
// Generate an exact deletion inventory. Uninstall never recursively deletes an
// arbitrary chosen directory or the user's saved-game/profile directories.
module.exports = async context => {
  if (context.electronPlatformName !== 'win32') return;
  const files = [], directories = [];
  const walk = async relative => {
    for (const entry of await fs.readdir(path.join(context.appOutDir, relative), { withFileTypes: true })) {
      const item = path.join(relative, entry.name);
      if (entry.isDirectory()) { await walk(item); directories.push(item); }
      else files.push(item);
    }
  };
  await walk('');
  const escape = value => value.split(path.sep).join('\\').replaceAll('$', () => '$$').replaceAll('"', '$\\"');
  // Builder may inject its updater config after this hook.
  if (!files.includes(path.join('resources', 'app-update.yml'))) files.push(path.join('resources', 'app-update.yml'));
  const script = files.map(file => `Delete "$INSTDIR\\${escape(file)}"`).concat(directories.map(dir => `RMDir "$INSTDIR\\${escape(dir)}"`)).join('\n') + '\n';
  await fs.writeFile(path.join(context.outDir, 'knightfall-uninstall-files.nsh'), script);
};
