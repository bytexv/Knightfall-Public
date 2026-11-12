import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import { act,createElement } from 'react';
import { createRoot } from 'react-dom/client';
test('guided coach opens on older WebViews without crypto.randomUUID',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://localhost/'});
 dom.window.HTMLMediaElement.prototype.pause=()=>{};
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{}});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const hook=registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',source:'',shortCircuit:true}:next(url,context);}});
 const root=createRoot(document.getElementById('root'));
 try{
  const {CoachBoard}=await import('../src/components/LearningModes.tsx');
  await act(async()=>root.render(createElement(CoachBoard,{initialMode:'guided',onComplete(){},onRestart(){}})));
  assert.equal(document.querySelectorAll('.coach-game [data-square]').length,64);
  assert.match(document.querySelector('.coach-instructions').textContent,/STEP 1 OF 6/);
 }finally{
  await act(async()=>root.unmount());hook.deregister();dom.window.close();
  if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);else delete globalThis.crypto;
  for(const k of ['window','document','localStorage','HTMLElement','IS_REACT_ACT_ENVIRONMENT'])delete globalThis[k];
 }
});
