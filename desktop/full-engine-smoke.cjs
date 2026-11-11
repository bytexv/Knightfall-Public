const { Chess } = require("chess.js");
exports.verifyFullEngines = async (window) => {
  const results = await window.webContents.executeJavaScript(`(async () => {
    const profiles = ['stockfish-17.1-single-a496a04.js', 'stockfish-17.1-8e4d048.js'];
    if (!crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') throw new Error('Native full-engine test requires cross-origin isolation');
    const results = [];
    for (const [index, filename] of profiles.entries()) {
      const url = new URL('engine/full/'+filename, location.href);
      url.hash = encodeURIComponent(url.href.replace(/\\.js$/, '.wasm'));
      const worker = new Worker(url.href); const start = performance.now();
      try {
        results.push(await new Promise((resolve,reject) => {
          const messages=[]; const timer=setTimeout(()=>reject(new Error('Full engine timed out: '+filename+' '+JSON.stringify(messages.slice(-8)))),60000);
          worker.onerror=event=>{clearTimeout(timer);reject(new Error(event.message || 'Full worker failed'));};
          worker.onmessage=event=>{
            for (const message of String(event.data).split(/\\r?\\n/)) {
              messages.push(message);
              if(message==='uciok'){worker.postMessage('setoption name Hash value 32');worker.postMessage('setoption name Threads value '+(index ? 2 : 1));worker.postMessage('isready');}
              if(message==='readyok'){worker.postMessage('position fen 7k/5K2/6Q1/8/8/8/8/8 w - - 0 1');worker.postMessage('go depth 12 movetime 1500');}
              if(message.startsWith('bestmove ')){clearTimeout(timer);resolve({filename,cores:index?2:1,move:message.split(' ')[1],elapsedMs:Math.round(performance.now()-start),info:messages.filter(m=>m.startsWith('info ')).slice(-12)});}
            }
          };worker.postMessage('uci');
        }));
      } finally {worker.terminate();}
    }
    return results;
  })()`);
  for (const result of results) {
    const game = new Chess("7k/5K2/6Q1/8/8/8/8/8 w - - 0 1");
    const u = result.move;
    game.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    if (!game.isCheckmate()) throw new Error("Full NNUE failed mate-in-one");
  }
  console.log("KNIGHTFALL_FULL_ENGINE_SMOKE " + JSON.stringify(results));
  return results;
};
