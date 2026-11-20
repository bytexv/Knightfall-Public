const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { validateFen } = require('chess.js');

// Accept only the bounded UCI operations used by LocalEngine. The executable
// and its working directory are fixed by the package, never by the renderer.
function validCommand(command) {
  if (typeof command !== 'string' || command.length > 180 || /[\r\n\0]/.test(command)) return false;
  if (['uci', 'isready', 'stop'].includes(command)) return true;
  if (command.startsWith('position fen ')) return validateFen(command.slice(13)).ok;
  const go = /^go depth (\d{1,2}) movetime (\d{1,5})$/.exec(command);
  if (go) return +go[1] >= 1 && +go[1] <= 30 && +go[2] >= 50 && +go[2] <= 30000;
  if (/^setoption name UCI_LimitStrength value (true|false)$/.test(command)) return true;
  const option = /^setoption name (Hash|Threads|Skill Level|MultiPV|UCI_Elo) value (\d{1,4})$/.exec(command);
  if (!option) return false;
  const [min, max] = {Hash:[4,64], Threads:[1,4], 'Skill Level':[0,20], MultiPV:[1,5], UCI_Elo:[1320,3190]}[option[1]];
  return +option[2] >= min && +option[2] <= max;
}

function registerNativeEngine(ipc, window, trusted, binary, observe) {
  const sessions = new Map();
  function stop(id) {
    const proc = sessions.get(id);
    sessions.delete(id);
    proc?.kill();
  }
  function stopAll() { for (const id of sessions.keys()) stop(id); }
  window.webContents.on('did-start-navigation', (_event, url, inPlace, mainFrame) => {
    if (mainFrame && !inPlace) stopAll();
  });
  window.webContents.on('render-process-gone', stopAll);
  window.on('closed', stopAll);
  function handle(event, id, op, value) {
    if (!trusted(event) || typeof id !== 'string' || !/^[a-f\d-]{36}$/.test(id)) return;
    const send = (line) => {
      if (!event.sender.isDestroyed()) event.sender.send('knightfall:engine-output', id, line);
    };
    if (op === 'close') return stop(id);
    if (op === 'open') {
      if (sessions.has(id) || sessions.size >= 4) return send(null);
      const proc = spawn(binary, [], {windowsHide:true, stdio:['pipe','pipe','ignore']});
      sessions.set(id, proc);
      const failed = () => {
        if (sessions.get(id) === proc) { stop(id); send(null); }
      };
      proc.on('error', failed);
      proc.on('exit', failed);
      proc.stdin.on('error', failed);
      const lines = createInterface({input:proc.stdout, crlfDelay:Infinity});
      lines.on('line', line => { if (sessions.get(id) === proc && line.length <= 8192) { observe?.(line); send(line); } });
      return;
    }
    const proc = sessions.get(id);
    if (proc && op === 'command' && validCommand(value) && proc.stdin.writable && proc.stdin.writableLength < 4096)
      proc.stdin.write(value + '\n');
  }
  ipc.on('knightfall:engine', handle);
  window.once('closed', () => ipc.removeListener('knightfall:engine', handle));
}
module.exports = {registerNativeEngine, validCommand};
