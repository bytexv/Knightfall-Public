import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
import {applyMove,newSession} from '../src/lib/game.ts';
registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',source:'',shortCircuit:true}:next(url,context);}});
const {default:GameNotes}=await import('../src/components/GameNotes.tsx');
let dom,host,root,changes;
beforeEach(async()=>{
 dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const {createRoot}=await import('react-dom/client');host=document.getElementById('root');root=createRoot(host);changes=[];
});
afterEach(async()=>{await act(async()=>root.unmount());dom.window.close();for(const key of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT'])delete globalThis[key];});
const render=(game,index=-1,onChange=(...args)=>changes.push(args))=>act(async()=>root.render(createElement(GameNotes,{game,index,onChange})));
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes(text)||b.getAttribute('aria-label')===text);
const click=element=>act(async()=>element.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
async function type(text){const textarea=host.querySelector('textarea');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(textarea,text);textarea.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});}

test('notes have an accessible position label, explicit save and clear actions',async()=>{
 const game=newSession();await render(game);const input=host.querySelector('textarea');assert.ok(document.querySelector(`label[for="${input.id}"]`));assert.match(host.textContent,/Starting position/);assert.equal(button('Save note').disabled,true);
 await type('  Plan {one} and {two}.  ');assert.match(host.textContent,/Unsaved changes/);assert.equal(changes.length,0);await click(button('Save note'));assert.deepEqual(changes,[[-1,'Plan [one] and [two].']]);assert.equal(input.value,'Plan [one] and [two].');
 await render({...game,initialComment:changes[0][1]});assert.equal(button('Save note').disabled,true);await click(button('Clear'));assert.deepEqual(changes.at(-1),[-1,'']);assert.equal(input.value,'');
});

test('notes follow the selected move and never leak a draft into another position',async()=>{
 let game=applyMove(newSession({initialComment:'Initial plan.'}),'e2','e4');game={...game,moves:game.moves.map(m=>({...m,comment:'After e4.'}))};await render(game,0);assert.match(host.textContent,/After 1\. e4/);assert.equal(host.querySelector('textarea').value,'After e4.');
 await type('An unsaved idea.');await render(game,-1);assert.equal(host.querySelector('textarea').value,'Initial plan.');assert.equal(changes.length,0);await render(game,0);assert.equal(host.querySelector('textarea').value,'After e4.');
});

test('annotation buttons insert ordinary text and remain unsaved until Save note',async()=>{
 await render(newSession());await type('Develop');await click(button('Insert !: Good move'));assert.equal(host.querySelector('textarea').value,'Develop !');assert.equal(changes.length,0);await click(button('Save note'));assert.deepEqual(changes,[[-1,'Develop !']]);assert.match(host.textContent,/plain text/);
});

test('note length is bounded and an update failure preserves the draft for retry',async()=>{
 await render(newSession(),-1,()=>{throw new Error('storage failed');});await type('x'.repeat(2100));assert.equal(host.querySelector('textarea').value.length,2000);assert.equal(host.querySelector('textarea').maxLength,2000);await click(button('Save note'));assert.match(host.querySelector('[role="status"]').textContent,/Could not update/);assert.equal(host.querySelector('textarea').value.length,2000);
});
