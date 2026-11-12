import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {NewGamePanel} from '../src/components/GameControls.tsx';

test('bot picker filters all levels, keeps explicit selection, recommends by Elo and starts the chosen game',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});
 for(const name of ['window','document','navigator','HTMLElement'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const {createRoot}=await import('react-dom/client');
 const root=createRoot(document.getElementById('root'));let selected;
 const click=async selector=>act(async()=>document.querySelector(selector).click());
 const fill=async(selector,value)=>act(async()=>{
  const el=document.querySelector(selector);const prototype=el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));
 });
 try {
  await act(async()=>root.render(React.createElement(NewGamePanel,{playerRating:1680,initialBot:'scout',onStart:s=>selected=s,onWifi:()=>{}})));
  assert.equal(document.querySelectorAll('.bot-choice').length,6);
  assert.equal(document.querySelector('.bot-choice.selected').dataset.botChoice,'scout');
  await fill('[aria-label="Bot strength group"]','master');
  assert.equal(document.querySelectorAll('.bot-choice').length,6);assert.ok(document.querySelector('[data-bot-choice="stockfish"]'));
  await click('[data-bot-choice="nemesis"]');await click('.start-game');assert.equal(selected.botId,'nemesis');
  await fill('[aria-label="Search bots by name or Elo"]','1500');
  assert.equal(document.querySelectorAll('.bot-choice').length,1);assert.ok(document.querySelector('[data-bot-choice="flint"]'));
  await click('[data-bot-choice="flint"]');await click('.start-game');assert.equal(selected.botId,'flint');
  await fill('[aria-label="Search bots by name or Elo"]','no such bot');assert.ok(document.querySelector('.bot-empty'));
  await click('.bot-empty button');assert.equal(document.querySelectorAll('.bot-choice').length,30);
  await click('.bot-match-row button');assert.equal(document.querySelector('.bot-choice.selected').dataset.botChoice,'iris');
  assert.equal(document.querySelector('[aria-label="Bot strength group"]').value,'club');
  await click('[aria-label="Play black"]');await click('.start-game');assert.equal(selected.botId,'iris');assert.equal(selected.color,'b');
  await click('.custom-bot-picker>.button');await fill('[aria-label="Custom bot Elo"]','1750');await click('.start-game');assert.equal(selected.botId,'adaptive');assert.equal(selected.customBotElo,1750);
  await click('.mode-tabs button:nth-child(2)');assert.equal(document.querySelector('.bot-picker'),null);
  await click('.start-game');assert.equal(selected.mode,'local');
 } finally {await act(async()=>root.unmount());dom.window.close();}
});
