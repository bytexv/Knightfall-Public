import test, {beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {MoveList} from '../src/components/GameControls.tsx';
import {newSession,applyMove,importPgn,START_FEN} from '../src/lib/game.ts';

let dom,root,host,selections;
const rect=(top=0,bottom=0)=>({x:0,y:top,left:0,right:300,width:300,top,bottom,height:bottom-top,toJSON(){return this;}});
beforeEach(()=>{
 dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
  if(this.classList.contains('move-list'))return rect(100,200);
  if(this.classList.contains('move-pair')){const row=[...this.parentElement.children].indexOf(this);const top=100+row*30-this.parentElement.scrollTop;return rect(top,top+30);}
  return rect();
 };
 host=document.getElementById('root');root=createRoot(host);selections=[];
});
afterEach(async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.HTMLElement;delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
async function render(game,index){await act(async()=>root.render(createElement(MoveList,{game,index,onSelect:n=>selections.push(n)})));}
async function click(label){const button=host.querySelector(`button[aria-label="${label}"]`);assert.ok(button,`Missing ${label}`);await act(async()=>button.click());}
function fromFen(turn,number,moves){let game=newSession({mode:'analysis',started:true,startFen:START_FEN.replace(' w ',` ${turn} `).replace('0 1',`0 ${number}`)});for(const [from,to]of moves){const next=applyMove(game,from,to);assert.ok(next,`Illegal fixture move ${from}${to}`);game=next;}return game;}
function longGame(){return importPgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. Nc3 Bb7 13. a3 Qc7 14. Be3 Rfe8 15. Rc1 Bf8');}

test('black-to-move FEN retains actual move numbers and Black column alignment',async()=>{
 const game=fromFen('b',23,[['e7','e5'],['e2','e4'],['g8','f6']]);await render(game,0);
 const rows=host.querySelectorAll('.move-pair');assert.equal(rows.length,2);assert.equal(rows[0].children.length,3);assert.equal(rows[0].children[0].textContent,'23...');assert.equal(rows[0].children[1].getAttribute('aria-hidden'),'true');assert.equal(rows[0].children[2].textContent,'e5');assert.equal(rows[0].children[2].getAttribute('data-ply'),'0');
 assert.equal(rows[1].children[0].textContent,'24.');assert.equal(rows[1].children[1].textContent,'e4');assert.equal(rows[1].children[2].textContent,'Nf6');assert.equal(host.querySelector('.replay-controls>span').textContent,'Move 23 · Black');
 await click('Move 23, Black: e5');assert.deepEqual(selections,[0]);assert.equal(host.querySelector('[aria-current="step"]').textContent,'e5');
});

test('white-to-move custom FEN starts at its fullmove number and labels replay accurately',async()=>{
 const game=fromFen('w',17,[['e2','e4'],['e7','e5'],['g1','f3']]);await render(game,2);
 const rows=host.querySelectorAll('.move-pair');assert.equal(rows[0].children[0].textContent,'17.');assert.equal(rows[1].children[0].textContent,'18.');assert.equal(rows[1].children[1].textContent,'Nf3');assert.equal(rows[1].children[2].getAttribute('aria-hidden'),'true');assert.equal(host.querySelector('.replay-controls>span').textContent,'Move 18 · White');
 await click('First position');await click('Previous move');assert.deepEqual(selections,[-1,1]);assert.equal(host.querySelector('[aria-label="Latest position"]').disabled,true);
 await render(game,-1);assert.equal(host.querySelector('.replay-controls>span').textContent,'Starting position');assert.equal(host.querySelector('[aria-label="First position"]').disabled,true);await click('Next move');await click('Latest position');assert.deepEqual(selections,[-1,1,0,2]);
});

test('long histories keep the selected latest move visible and preserve manual scrolling on clock updates',async()=>{
 const game=longGame();await render(game,game.moves.length-1);const list=host.querySelector('.move-list');const latest=host.querySelector('.move-pair:last-child');assert.equal(list.scrollTop,350);assert.ok(latest.getBoundingClientRect().bottom<=list.getBoundingClientRect().bottom);
 list.scrollTop=50;await render({...game,clocks:{w:999,b:999}},game.moves.length-1);assert.equal(list.scrollTop,50,'A clock-only render must not reset the reader’s scroll position');
 const next=applyMove(game,'a3','a4');assert.ok(next);await render(next,next.moves.length-1);assert.equal(list.scrollTop,380);assert.ok(host.querySelector('.move-pair:last-child').getBoundingClientRect().bottom<=list.getBoundingClientRect().bottom);
 await render(next,0);assert.equal(list.scrollTop,0,'Replaying an early move brings it into view without scrolling the document');
});

test('an arriving move does not pull history away from an earlier selected move',async()=>{
 const game=longGame();await render(game,2);const list=host.querySelector('.move-list');assert.equal(list.scrollTop,0);const next=applyMove(game,'a3','a4');await render(next,2);assert.equal(list.scrollTop,0);assert.equal(host.querySelector('[aria-current="step"]').textContent,'Nf3');
});

test('empty move histories preserve replay bounds and starting-position guidance',async()=>{
 await render(newSession(),-1);assert.match(host.textContent,/Your story starts with a move/);assert.equal(host.querySelectorAll('.move-pair').length,0);assert.equal(host.querySelector('.move-list').hasAttribute('role'),false,'Empty guidance is not a malformed ARIA list');assert.equal(host.querySelector('.panel-heading h2').textContent,'Move history');for(const button of host.querySelectorAll('.replay-controls button'))assert.equal(button.disabled,true);
});
