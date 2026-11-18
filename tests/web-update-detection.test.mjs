import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

test('PWA observes an update that started before the UI subscribed',async()=>{
  const dom=new JSDOM('',{url:'https://knightfall.example/'});
  const worker=new EventTarget(), registration=new EventTarget();
  registration.installing=worker; registration.waiting=null;
  registration.update=async()=>registration;
  Object.defineProperty(dom.window.navigator,'serviceWorker',{value:{controller:{},getRegistration:async()=>registration}});
  for(const key of ['window','document','navigator'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
  const api=await import('../src/lib/app-updates.ts');
  const off=api.subscribeAppUpdates(()=>{});
  await new Promise(r=>setImmediate(r));
  await api.checkAppUpdates();
  assert.equal(api.getAppUpdateStatus().status,'checking');
  registration.waiting=worker;registration.installing=null;worker.dispatchEvent(new Event('statechange'));
  assert.equal(api.getAppUpdateStatus().status,'ready');
  off();dom.window.close();
});
