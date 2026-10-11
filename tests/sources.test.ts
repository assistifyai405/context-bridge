import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sourceId, sourceDetails, prepareSource, listChats } from '../src/sources.ts';

test('uses calling chat context and never falls back to a remembered or newest unrelated chat', () => {
  assert.equal(sourceId(undefined, { CODEX_THREAD_ID: 'current-id' }), 'current-id');
  assert.equal(sourceId('chosen-id', { CODEX_THREAD_ID: 'current-id' }), 'chosen-id');
  assert.throws(() => sourceId(undefined, {}), /kies een chat op naam/);
  assert.throws(() => sourceId('bad?uri', {}), /Ongeldige/);
});
test('resolves each chat workspace from exact metadata and preserves separate receipts', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bridge-source-'));
  const a = path.join(root, 'a'); const b = path.join(root, 'b');
  mkdirSync(a); mkdirSync(b);
  const files: Record<string, string> = {};
  for (const [id, cwd] of [['chat-a', a], ['chat-b', b]]) {
    files[id] = path.join(root, id + '.jsonl');
    writeFileSync(files[id], JSON.stringify({ type: 'session_meta', payload: { id, cwd } }));
  }
  const discover = (id: string) => files[id];
  const state = path.join(root, 'state');
  const selectedA = prepareSource('chat-a', state, discover);
  const prior = JSON.parse(readFileSync(selectedA.configFile, 'utf8'));
  prior.sourceThreadId = 'previous-continuation'; prior.lastReceipt = 'receipt-a';
  writeFileSync(selectedA.configFile, JSON.stringify(prior));
  const selectedB = prepareSource('chat-b', state, discover);
  assert.equal(selectedB.projectRoot, b);
  assert.notEqual(selectedA.configFile, selectedB.configFile);
  prepareSource('chat-a', state, discover);
  const current = JSON.parse(readFileSync(selectedA.configFile, 'utf8'));
  assert.equal(current.sourceThreadId, 'chat-a'); assert.equal(current.lastReceipt, 'receipt-a');
  writeFileSync(files['chat-a'], readFileSync(files['chat-a'], 'utf8') + '\n' + JSON.stringify({ type: 'turn_context', payload: { cwd: b } }));
  assert.equal(sourceDetails('chat-a', discover).projectRoot, b);
  assert.throws(() => sourceDetails('wrong', () => files['chat-a']), /betrouwbare/);
});
test('source configuration is not overwritten during an active handoff', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bridge-source-lock-'));
  const session = path.join(root, 'session.jsonl');
  writeFileSync(session, JSON.stringify({ type: 'session_meta', payload: { id: 'chat-id', cwd: root } }));
  const state = path.join(root, 'state');
  const selected = prepareSource('chat-id', state, () => session);
  writeFileSync(selected.configFile + '.lock', 'active');
  const before = readFileSync(selected.configFile, 'utf8');
  assert.throws(() => prepareSource('chat-id', state, () => session), /loopt al/);
  assert.equal(readFileSync(selected.configFile, 'utf8'), before);
});
test('chat picker enumerates all pages and retains migrated local chats and duplicate titles', async () => {
  let closed = false; const requests: any[] = [];
  const server = { initialize: async () => {}, close: () => { closed = true; }, request: async (_method: string, params: any) => {
    requests.push(params);
    return params.cursor ? { data: [{ id: 'chat-b', name: 'Same title', cwd: os.tmpdir(), historyMode: 'legacy' }, { id: 'unsupported', cwd: os.tmpdir(), historyMode: 'paginated' }], nextCursor: null } :
      { data: [{ id: 'chat-a', name: 'Same title', cwd: os.tmpdir() }], nextCursor: 'page-2' };
  } };
  const chats = await listChats(() => server);
  assert.deepEqual(chats.map(c => c.id), ['chat-a','chat-b','unsupported']);
  assert.equal(chats[0].title, chats[1].title);
  assert.equal(requests[1].cursor, 'page-2'); assert.ok(closed);
  assert.ok(requests[0].sourceKinds.includes('appServer'));
});
test('repeated pagination cursor fails cleanly without an endless listing loop', async () => {
  let closed = false;
  const server = { initialize: async () => {}, close: () => { closed = true; }, request: async () => ({ data: [], nextCursor: 'same' }) };
  await assert.rejects(listChats(() => server), /paginacursor/); assert.ok(closed);
});
