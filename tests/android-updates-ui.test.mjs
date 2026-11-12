import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';

test('Android downloads through the native bridge, retains progress, and confirms in-place installation',async()=>{
 const dom=new JSDOM('<!doctype html><body/>',{url:'https://localhost/'});
 const originalFetch=globalThis.fetch;
 Object.assign(globalThis,{window:dom.window,document:dom.window.document});
 let listener,downloaded,installs=0,confirm=false;
 globalThis.__nativeUpdates={
  async addListener(_name,callback){listener=callback;return {remove(){}};},
  async getStatus(){return {status:'idle',message:''};},
  async download(options){downloaded=options;listener({status:'downloading',progress:42,message:'Downloading…'});},
  async install(){installs++;},
 };
 const hook=registerHooks({load(url,context,next){if(url.includes('@capacitor/core/'))return {format:'module',source:'export const Capacitor={getPlatform:()=>"android",isNativePlatform:()=>true,isPluginAvailable:()=>true};export const registerPlugin=()=>globalThis.__nativeUpdates;',shortCircuit:true};return next(url,context);}});
 globalThis.fetch=async(url)=>String(url).includes('update-config.json')?new Response(JSON.stringify({owner:'bytexv',repo:'Knightfall-Public',visibility:'public'})):new Response(JSON.stringify({tag_name:'v99.0.0',html_url:'https://github.com/bytexv/Knightfall-Public/releases/tag/v99.0.0',draft:false,prerelease:false,assets:[{name:'Knightfall-99.0.0-Android.apk',size:100,state:'uploaded',browser_download_url:'https://github.com/bytexv/Knightfall-Public/releases/download/v99.0.0/Knightfall-99.0.0-Android.apk'}]}));
 let unsubscribe;
 try {
  const api=await import('../src/lib/app-updates.ts');
  unsubscribe=api.subscribeAppUpdates(()=>{});
  for(let i=0;i<100&&api.getAppUpdateStatus().status!=='available';i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(api.getAppUpdateStatus().status,'available');
  assert.equal(api.getAppUpdateStatus().android,true);
  const onlineFetch=globalThis.fetch;
  let attempts=0;
  globalThis.fetch=async()=>{attempts++;throw new TypeError('Failed to fetch');};
  await api.checkAppUpdates();
  assert.equal(attempts,1); assert.equal(api.getAppUpdateStatus().status,'unavailable');
  assert.equal(api.getAppUpdateStatus().downloadUrl,undefined);
  assert.match(api.getAppUpdateStatus().message,/Check your connection/);
  globalThis.fetch=onlineFetch;
  await api.checkAppUpdates();
  assert.equal(api.getAppUpdateStatus().status,'available');
  dom.window.open=()=>{throw new Error('Download must stay inside app');};
  await api.openAppUpdate();assert.equal(downloaded.version,'99.0.0');assert.equal(api.getAppUpdateStatus().progress,42);
  listener({status:'ready',latestVersion:'99.0.0',progress:100,message:'Ready'});
  dom.window.confirm=()=>confirm;
  await api.applyAppUpdate();assert.equal(installs,0);
  confirm=true;await api.applyAppUpdate();assert.equal(installs,1);
  assert.equal(api.getAppUpdateStatus().status,'ready');
 } finally {unsubscribe?.();hook.deregister();globalThis.fetch=originalFetch;dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.__nativeUpdates;}
});
