import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseConversation, writeConversation, discoverSession } from '../src/conversation.ts';
import { home, snapshot, validate } from '../src/bridge.ts';

const record = (type: string, payload: object) => JSON.stringify({ timestamp: '2026-10-11T10:00:00Z', type, payload });
const meta = record('session_meta', { id: 'test-chat', cwd: '/project' });
const message = (role: string, text: string, extra = {}) => record('response_item', { type: 'message', role, content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }], ...extra });
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kJ0AAAAASUVORK5CYII=';
function temp() {
  mkdirSync(path.join(home, '.test-work'), { recursive: true });
  return mkdtempSync(path.join(home, '.test-work', 'conversation-'));
}

test('preserves long visible dialogue and redacts secrets, without internal records or duplicate event messages', () => {
  const long = 'Nederlandse context '.repeat(12000);
  const secret = 'sk-' + 'a'.repeat(24);
  const log = [meta, message('developer', 'PRIVATE_SYSTEM'), record('response_item', { type: 'reasoning', summary: 'PRIVATE_REASONING' }), record('response_item', { type: 'function_call_output', output: 'PRIVATE_TOOL' }), message('user', long + secret), record('event_msg', { type: 'user_message', message: long }), message('assistant', 'Antwoord')].join('\n');
  const c = parseConversation(log, 'test-chat');
  assert.equal(c.messages.length, 2);
  assert.ok(c.messages[0].text.startsWith(long));
  assert.ok(c.messages[0].text.includes('[REDACTED:api-key]'));
  const serialized = JSON.stringify(c);
  assert.ok(!serialized.includes(secret));
  for (const forbidden of ['PRIVATE_SYSTEM', 'PRIVATE_REASONING', 'PRIVATE_TOOL']) assert.ok(!serialized.includes(forbidden));
});

test('copies embedded screenshots and marks unavailable remote images explicitly', () => {
  const c = parseConversation([meta, record('response_item', { type: 'message', role: 'user', content: [{ type: 'input_image', image_url: 'data:image/png;base64,' + png }, { type: 'input_image', image_url: 'https://example.com/image.png' }] })].join('\n'));
  const output = temp();
  writeConversation(c, output);
  assert.deepEqual(readFileSync(path.join(output, 'assets', c.messages[0].attachments[0].filename)), Buffer.from(png, 'base64'));
  assert.equal(c.messages[0].attachments[1].status, 'unavailable');
  assert.ok(c.warnings.length);
  assert.ok(readFileSync(path.join(output, 'CHAT-HANDOFF.md'), 'utf8').includes('assets/'));
  assert.ok(!readFileSync(path.join(output, 'conversation.json'), 'utf8').includes('base64'));
});

test('removes rolled-back turns and marks aborted turns without deleting their visible history', () => {
  const log = [meta, record('event_msg', { type: 'task_started', turn_id: 'one' }), message('user', 'Eerste keuze'), record('event_msg', { type: 'turn_aborted', turn_id: 'one' }), record('event_msg', { type: 'task_started', turn_id: 'two' }), message('user', 'Teruggedraaide keuze'), record('event_msg', { type: 'thread_rolled_back', num_turns: 1 })].join('\n');
  const c = parseConversation(log);
  assert.equal(c.messages.length, 1);
  assert.equal(c.messages[0].interrupted, true);
});

test('fails on corrupted interior records and incorrect chat identity, warns on partial tail', () => {
  assert.throws(() => parseConversation([meta, '{broken', message('user', 'Hoi')].join('\n')), /Beschadigde/);
  assert.throws(() => parseConversation([meta, message('user', 'Hoi')].join('\n'), 'wrong-chat'), /Sessie-ID/);
  const c = parseConversation([meta, message('user', 'Hoi'), '{partial'].join('\n'));
  assert.equal(c.messages.length, 1);
  assert.ok(c.warnings.some(w => w.includes('onvolledig')));
});

test('session discovery selects exact thread and never an unrelated latest chat', () => {
  const base = temp();
  writeFileSync(path.join(base, 'rollout-test-chat.jsonl'), meta);
  writeFileSync(path.join(base, 'rollout-other-chat.jsonl'), meta);
  assert.ok(discoverSession('test-chat', base).endsWith('rollout-test-chat.jsonl'));
  assert.throws(() => discoverSession('missing-chat', base), /eenduidig/);
});

test('automatic packet uses actual conversation instead of prewritten memory and validates with CHP', async () => {
  const base = temp();
  const root = path.join(base, 'project');
  const output = path.join(base, 'packet');
  mkdirSync(root);
  writeFileSync(path.join(root, 'README.md'), '# Project');
  writeFileSync(path.join(root, 'MEMORY.md'), 'HANDWRITTEN_MEMORY_MUST_NOT_BE_USED');
  const source = path.join(base, 'session.jsonl');
  writeFileSync(source, [meta, message('user', 'Nieuwe opdracht zonder vooraf geschreven geheugen'), message('assistant', 'Begrepen')].join('\n'));
  const result = await snapshot(root, output, 'Verder', { session: source });
  assert.equal(result.memory, 0);
  assert.equal(result.conversationMessages, 2);
  assert.equal(validate(output).valid, true);
  assert.ok(!readFileSync(path.join(output, 'HANDOFF.md'), 'utf8').includes('HANDWRITTEN_MEMORY_MUST_NOT_BE_USED'));
  assert.ok(readFileSync(path.join(output, 'CONVERSATION.md'), 'utf8').includes('Nieuwe opdracht'));
  assert.ok(readFileSync(path.join(output, 'NEW-CHAT-PROMPT.txt'), 'utf8').includes('CHAT-HANDOFF.md'));
});
