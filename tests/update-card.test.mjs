import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost:8786'});
for (const name of ['window','document','navigator','HTMLElement']) Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let emit, installs = 0, downloads = 0;
window.knightfall = {
  getUpdateStatus: async () => ({status:'idle',currentVersion:'1.3.0',automatic:true,message:'Automatic updates ready.'}),
  checkForUpdates: async () => ({status:'up-to-date',currentVersion:'1.3.0',message:'Latest.'}),
  onUpdateStatus: callback => { emit=callback; return ()=>{}; },
  installUpdate: async () => { installs++; }, openUpdate: async () => { downloads++; },
};
const {default:UpdateCard,UpdateIndicator} = await import('../src/components/UpdateCard.tsx');
const root = createRoot(document.getElementById('root'));
const publish = async state => act(async () => { emit({currentVersion:'1.3.0',releaseUrl:'https://github.com/bytexv/Knightfall-Public/releases',...state}); });
test('update UI shows download progress without offering early installation', async () => {
  await act(async () => root.render(React.createElement(React.Fragment,null,React.createElement(UpdateCard),React.createElement(UpdateIndicator,{onOpen:()=>{}}))));
  await publish({status:'downloading',automatic:true,progress:37,message:'Downloading…'});
  assert.equal(document.querySelector('progress').value,37);
  assert.equal(document.querySelector('.update-card button').disabled,true);
  assert.match(document.querySelector('.update-indicator').textContent,/Updating/);
  assert.equal(installs,0);
});
test('verified update offers restart through the narrow native bridge',async()=>{
  await publish({status:'ready',automatic:true,latestVersion:'1.4.0',message:'Ready to install.'});
  const button=document.querySelector('.update-card button');assert.match(button.textContent,/Restart and update/);
  await act(async()=>button.click());assert.equal(installs,1);
  assert.match(document.querySelector('.update-card small').textContent,/installs on exit/);
});
test('manual APK update offers download rather than automatic installation',async()=>{
  await publish({status:'available',latestVersion:'1.4.0',message:'APK available.'});
  const button=document.querySelector('.update-card button');assert.match(button.textContent,/Download 1.4.0/);
  await act(async()=>button.click());assert.equal(downloads,1);assert.equal(installs,1);
  await act(async()=>root.unmount());dom.window.close();
});
