import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate} from 'node:timers/promises';
import {JSDOM} from 'jsdom';

const [html, script] = await Promise.all(['index.html', 'install.js'].map(file =>
  readFile(new URL('../public/install/' + file, import.meta.url), 'utf8')));

async function openInstaller() {
  const {window} = new JSDOM(html, {runScripts: 'outside-only'});
  window.matchMedia = () => ({matches: false});
  window.fetch = async () => ({json: async () => ({version: '2.3.0', preview: true})});
  window.eval(script);
  await setImmediate();
  return {window, button: window.document.querySelector('#install'), help: window.document.querySelector('#help')};
}

test('an Android visitor without a browser prompt gets a visible action and menu instructions', async () => {
  const {window, button, help} = await openInstaller();
  assert.equal(window.document.querySelector('#version').textContent, '2.3.0 preview');
  assert.equal(button.hidden, false);
  button.click();
  assert.equal(help.hidden, false);
  assert.match(help.textContent, /Add to Home screen/);
  window.close();
});

test('an available prompt is used once and installing updates the button and status', async () => {
  const {window, button, help} = await openInstaller();
  let prompts = 0;
  const event = new window.Event('beforeinstallprompt', {cancelable: true});
  event.prompt = async () => { prompts++; };
  event.userChoice = Promise.resolve({outcome: 'dismissed'});
  window.dispatchEvent(event);
  button.click();
  await setImmediate();
  assert.equal(event.defaultPrevented, true);
  assert.equal(help.hidden, false);
  button.click();
  assert.equal(prompts, 1);
  window.dispatchEvent(new window.Event('appinstalled'));
  assert.equal(button.hidden, true);
  assert.match(help.textContent, /is installed/);
  window.close();
});
