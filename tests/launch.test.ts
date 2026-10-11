import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { launch, chatLink } from '../src/launch.ts';
import { AppServer, savedInputMatches } from '../src/appserver.ts';
import { loadConversation, writeConversation } from '../src/conversation.ts';

function setup(options: { wrongInput?: boolean; failSend?: boolean } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bridge-launch-'));
  const session = path.join(root, 'session.jsonl');
  const destination = path.join(root, 'destination.jsonl');
  writeFileSync(destination, JSON.stringify({ type: 'session_meta', payload: { id: 'destination-id' } }) + '\n' + JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Overdracht ontvangen' }] } }));
  writeFileSync(path.join(root, 'project.txt'), 'original');
  writeFileSync(session, [
    { type: 'session_meta', payload: { id: 'source-id' } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Neem de chat mee' }, { type: 'input_image', image_url: 'data:image/png;base64,aGVsbG8=' }] } }
  ].map(v => JSON.stringify(v)).join('\n'));
  const config = path.join(root, 'launcher.json');
  writeFileSync(config, JSON.stringify({ version: 1, sourceThreadId: 'source-id', projectRoot: root, transferRoot: path.join(root, 'transfers') }));
  const calls: string[] = []; const opened: string[] = [];
  let submitted: any;
  const server = {
    async initialize() { calls.push('initialize'); },
    async request(method: string, params: any) {
      calls.push(method);
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      if (method === 'thread/start') { assert.equal(params.cwd, root); assert.equal(params.model, undefined); return { thread: { id: 'destination-id' } }; }
      if (method === 'turn/start') {
        if (options.failSend) throw new Error('Send failed');
        submitted = params.input;
        return { turn: { id: 'turn-id' } };
      }
      if (method === 'thread/read') return { thread: { turns: [{ id: 'turn-id', items: [{ type: 'userMessage', content: options.wrongInput ? [{ type: 'text', text: 'wrong' }] : submitted }] }] } };
      return {};
    },
    async waitFor() { return { threadId: 'destination-id', turn: { id: 'turn-id', status: 'completed' } }; },
    close() { calls.push('close'); }
  };
  const deps = {
    server: () => server, open: (id: string) => { opened.push(id); }, discover: (id: string) => id === 'destination-id' ? destination : session,
    snapshot: async (_root: string, output: string, _goal: string, options: any) => {
      mkdirSync(output, { recursive: true }); writeConversation(loadConversation(options.session, options.expectedSessionId), output);
      writeFileSync(path.join(output, 'NEW-CHAT-PROMPT.txt'), 'Lees de overdracht.');
      writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ version: 1, files: [{ path: 'project.txt', sha256: createHash('sha256').update(readFileSync(path.join(root, 'project.txt'))).digest('hex') }] }));
      return {} as any;
    }
  };
  return { config, root, destination, calls, opened, deps, submitted: () => submitted };
}

test('launch creates, sends latest screenshot, verifies persistence, then reopens unchanged handoff', async () => {
  const s = setup();
  const result = await launch(s.config, undefined, s.deps);
  assert.equal(result.status, 'ready'); assert.equal(result.inputVerified, true);
  assert.equal(JSON.parse(readFileSync(s.config, 'utf8')).sourceThreadId, 'destination-id');
  assert.deepEqual(s.opened, ['destination-id']);
  assert.equal(s.submitted()[1].type, 'localImage');
  assert.ok(path.isAbsolute(s.submitted()[1].path));
  assert.ok(s.submitted()[0].text.includes('Neem de chat mee'));
  assert.deepEqual(s.calls, ['initialize','account/read','thread/start','thread/name/set','turn/start','thread/read','close']);
  const repeated = await launch(s.config, undefined, s.deps);
  assert.equal(repeated.reused, true);
  assert.equal(s.calls.filter(c => c === 'thread/start').length, 1);
});
test('a new user message in the continuation is imported on the next click', async () => {
  const s = setup(); await launch(s.config, undefined, s.deps);
  writeFileSync(s.destination, readFileSync(s.destination, 'utf8') + '\n' + JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Mijn nieuwste opdracht' }] } }));
  const next = await launch(s.config, undefined, s.deps);
  assert.equal(next.sourceThreadId, 'destination-id');
  assert.ok(s.submitted()[0].text.includes('Mijn nieuwste opdracht'));
  assert.equal(s.calls.filter(c => c === 'thread/start').length, 2);
});
test('a failed submit preserves the created thread and does not blindly create another', async () => {
  const s = setup({ failSend: true });
  await assert.rejects(launch(s.config, undefined, s.deps), /Send failed/);
  const config = JSON.parse(readFileSync(s.config, 'utf8'));
  const receipt = JSON.parse(readFileSync(config.pendingReceipt, 'utf8'));
  assert.equal(receipt.threadId, 'destination-id'); assert.equal(receipt.status, 'incomplete');
  await assert.rejects(launch(s.config, undefined, s.deps), /geen tweede chat/);
  assert.equal(s.calls.filter(c => c === 'thread/start').length, 1);
});
test('changed selected project files require a fresh handoff even if the chat is unchanged', async () => {
  const s = setup(); await launch(s.config, undefined, s.deps);
  writeFileSync(path.join(s.root, 'project.txt'), 'changed');
  const next = await launch(s.config, undefined, s.deps);
  assert.equal(next.reused, undefined);
  assert.equal(s.calls.filter(c => c === 'thread/start').length, 2);
});
test('a completed turn with missing stored handoff fails verification', async () => {
  const s = setup({ wrongInput: true });
  await assert.rejects(launch(s.config, undefined, s.deps), /opgeslagen chat/);
  const cfg = JSON.parse(readFileSync(s.config, 'utf8'));
  assert.ok(cfg.pendingReceipt); assert.equal(cfg.lastReceipt, undefined);
});
test('parallel launcher invocation is blocked before creating a chat', async () => {
  const s = setup(); writeFileSync(s.config + '.lock', 'running');
  await assert.rejects(launch(s.config, undefined, s.deps), /overdracht loopt al/);
  assert.equal(s.calls.length, 0);
});
test('deep links reject shell and URI injection; verification matches exact turn and text', () => {
  assert.equal(chatLink('a-b-c'), 'codex://threads/a-b-c');
  assert.throws(() => chatLink('abc?prompt=bad')); assert.throws(() => chatLink('abc;echo'));
  assert.equal(savedInputMatches({ turns: [{ id: 't', items: [{ type: 'userMessage', content: [{ type: 'text', text: 'x' }] }] }] }, 't', 'x'), true);
  assert.equal(savedInputMatches({ turns: [] }, 't', 'x'), false);
});
test('appserver handles JSONL handshake, early completion notification and RPC errors', async () => {
  const code = `const rl=require('node:readline').createInterface({input:process.stdin}); rl.on('line',l=>{const m=JSON.parse(l); if(!m.id)return; if(m.method==='bad')console.log(JSON.stringify({id:m.id,error:{message:'failed'}})); else {console.log(JSON.stringify({method:'turn/completed',params:{threadId:'d',turn:{id:'t',status:'completed'}}})); console.log(JSON.stringify({id:m.id,result:{ok:true}}));}});`;
  const client = new AppServer(spawn(process.execPath, ['-e', code], { stdio: ['pipe','pipe','pipe'], windowsHide: true }));
  try {
    await client.initialize();
    assert.equal((await client.waitFor('turn/completed', p => p.turn.id === 't', 1000)).turn.status, 'completed');
    await assert.rejects(client.request('bad'), /failed/);
  } finally { client.close(); }
});
