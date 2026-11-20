import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { bots } from '../src/lib/bots.ts';

test('all local bot identities including Dial ship distinct offline WebP portraits', async () => {
  const ids = [...bots.map(bot => bot.id), 'adaptive'];
  const hashes = await Promise.all(ids.map(async id => {
    const file = await readFile(new URL(`../public/images/bots/${id}.webp`, import.meta.url));
    assert.equal(file.toString('ascii', 0, 4), 'RIFF', id);
    assert.equal(file.toString('ascii', 8, 12), 'WEBP', id);
    return createHash('sha256').update(file).digest('hex');
  }));
  assert.equal(new Set(hashes).size, ids.length);
});
