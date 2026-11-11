/* Native desktop acceptance checks. Used only with the explicit --smoke-test flag. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { Chess } = require('chess.js');
const wait = milliseconds => new Promise(resolve => setTimeout(resolve,milliseconds));

async function runSmoke(window) {
  const evaluate = async code => {
    try {return await window.webContents.executeJavaScript(code);}
    catch(error){throw new Error(`Native smoke evaluation failed (${code.slice(0,100)}): ${error.message}`);}
  };
  let report;
  for (let attempt=0;attempt<25;attempt++) {
    report=await evaluate("({title:document.title,rendered:!!document.querySelector('#root > *'),desktopBridge:window.knightfall?.platform === 'desktop',nodeExposed:typeof window.require !== 'undefined'})");
    if(report.rendered) break;
    await wait(100);
  }
  if(!report.rendered || !report.desktopBridge || report.nodeExposed) throw new Error(`Desktop smoke check failed: ${JSON.stringify(report)}`);
  const boardGeometry=await evaluate("(() => {const cells=[...document.querySelectorAll('.chessboard .square')].map(cell=>cell.getBoundingClientRect());return {cells:cells.length,nonSquare:cells.filter(cell=>Math.abs(cell.width-cell.height)>1.1).length,minHeight:Math.min(...cells.map(cell=>cell.height)),maxHeight:Math.max(...cells.map(cell=>cell.height))};})()");
  if(boardGeometry.cells!==64 || boardGeometry.nonSquare || boardGeometry.maxHeight-boardGeometry.minHeight>1.1) throw new Error(`Chessboard layout smoke check failed: ${JSON.stringify(boardGeometry)}`);
  report.boardGeometry=boardGeometry;
  const hosted=await evaluate('window.knightfall.hostLan()');
  if(!hosted.port || !Array.isArray(hosted.urls)) throw new Error('Desktop LAN IPC check failed');
  report.lanPort=hosted.port;

  if(process.argv.includes('--smoke-game')) {
    // Observe the actual Stockfish worker while the normal app plays a game.
    await evaluate(`(() => {
      const NativeWorker=window.Worker;
      window.__knightfallSmokeEngine=[];
      window.Worker=class extends NativeWorker {
        constructor(...args) {
          super(...args);
          if(String(args[0]).includes('/engine/stockfish.js')) this.addEventListener('message',event=>{
            if(typeof event.data==='string' && /^(uciok|readyok|bestmove )/.test(event.data)) window.__knightfallSmokeEngine.push(event.data);
          });
        }
      };
      const button=document.querySelector('button.start-game');
      if(!button)throw new Error('Start-bot button unavailable');
      button.click();
    })()`);
    await wait(150);
    await evaluate("document.querySelector('[data-square=\"e2\"]').click()");
    await wait(60);
    await evaluate("document.querySelector('[data-square=\"e4\"]').click()");
    let game;
    for(let attempt=0;attempt<200;attempt++) {
      game=await evaluate("JSON.parse(localStorage.getItem('knightfall:current') || 'null')");
      if(game?.moves?.length>=2)break;
      await wait(100);
    }
    if(!game || game.moves.length<2 || game.moves[0].from!=='e2' || game.moves[0].to!=='e4' || game.moves[1].color!=='b') throw new Error('The native bot did not reply to 1.e4 within 20 seconds');
    const chess=new Chess(game.startFen);
    for(const move of game.moves)chess.move({from:move.from,to:move.to,promotion:move.promotion});
    if(chess.fen()!==game.fen)throw new Error('Native board state differs from legal move history');
    const engine=await evaluate('window.__knightfallSmokeEngine');
    if(!engine.some(message=>message.startsWith('bestmove ')))throw new Error('Bot replied without a confirmed local Stockfish worker result');
    report.nativeGame={moves:game.moves.map(move=>move.san),engine:'Stockfish WASM worker',fen:game.fen};
  }

  const galleryArg=process.argv.find(argument=>argument.startsWith('--smoke-gallery='));
  if(galleryArg) {
    const directory=path.resolve(galleryArg.slice('--smoke-gallery='.length));
    await fs.mkdir(directory,{recursive:true});
    window.showInactive();
    report.gallery=[];
    for(const [label,filename] of [['Play chess','play'],['Analysis','analysis'],['Puzzles','puzzles'],['Opening lab','openings'],['Endgame school','endgames'],['My games','games'],['Play with friends','wifi'],['Settings','settings']]) {
      await evaluate(`(() => {const menu=document.querySelector('[aria-label="Open navigation"]');if(menu && getComputedStyle(menu).display!=='none')menu.click();})()`);
      await wait(80);
      await evaluate(`(() => {const label=${JSON.stringify(label)};const button=[...document.querySelectorAll('.nav-item')].find(button=>(button.getAttribute('aria-label')||button.querySelector('span')?.textContent||button.textContent).trim()===label);if(!button)throw new Error('Navigation item unavailable: '+label);button.click();})()`);
      await wait(label==='Analysis'?1000:400);
      const dimensions=await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})');
      if(dimensions.scrollWidth>dimensions.width+1) throw new Error(`Horizontal overflow on ${label}: ${JSON.stringify(dimensions)}`);
      const screenshot=path.join(directory,filename+'.png');
      await fs.writeFile(screenshot,(await window.webContents.capturePage()).toPNG());
      report.gallery.push({page:label,screenshot});
    }
  }

  const screenshotArg=process.argv.find(argument=>argument.startsWith('--smoke-screenshot='));
  if(screenshotArg) {
    const screenshot=path.resolve(screenshotArg.slice('--smoke-screenshot='.length));
    await fs.mkdir(path.dirname(screenshot),{recursive:true});
    window.showInactive();
    await wait(300);
    await fs.writeFile(screenshot,(await window.webContents.capturePage()).toPNG());
    report.screenshot=screenshot;
  }
  return report;
}
module.exports={runSmoke};
