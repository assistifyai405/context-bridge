import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { snapshot, check, validate, home } from '../src/bridge.ts';

function fixture() {
  mkdirSync(path.join(home, '.test-work'), { recursive: true });
  const base = mkdtempSync(path.join(home, '.test-work', 'case-'));
  const root = path.join(base, 'project');
  const packet = path.join(base, 'packet');
  mkdirSync(root);
  writeFileSync(path.join(root, 'README.md'), '# Demo\nMaak een zoekveld.');
  writeFileSync(path.join(root, 'MEMORY.md'), '---\nstatus: draft\n---\n\n# Keuzes\nGebruik lokale opslag.');
  return { root, packet };
}

test('four upstream integrations produce a validated, explicitly partial handoff', async () => {
  const { root, packet } = fixture();
  const result = await snapshot(root, packet, 'Verder werken');
  assert.equal(result.memory, 1);
  assert.equal(validate(packet).valid, true);
  const pkg = JSON.parse(readFileSync(path.join(packet, 'context.json'), 'utf8'));
  assert.equal(pkg.quality.completeness, 'partial');
  assert.equal(pkg.claims[0].status, 'unverified');
  assert.equal(pkg.extensions['x-bridge-memory'][0].structure.headings[0].title, 'Keuzes');
  const inspection = JSON.parse(readFileSync(path.join(packet, 'handoff-inspection.json'), 'utf8'));
  assert.equal(inspection.dry_run, true);
  assert.deepEqual(inspection.repository, {}, 'Handoff must not collect metadata from a parent repository');
  assert.ok(check(root, packet).every((f: { status: string }) => f.status === 'unchanged'));
});

test('changed and deleted sources invalidate stored file evidence', async () => {
  const { root, packet } = fixture();
  await snapshot(root, packet, 'Verder');
  writeFileSync(path.join(root, 'README.md'), 'Een andere opdracht');
  unlinkSync(path.join(root, 'MEMORY.md'));
  const statuses = check(root, packet);
  assert.ok(statuses.some((f: { status: string }) => f.status === 'changed'));
  assert.ok(statuses.some((f: { status: string }) => f.status === 'missing'));
});

test('denied secret files and a previous output nested in the project are excluded', async () => {
  const { root } = fixture();
  const packet = path.join(root, '.context-bridge');
  mkdirSync(packet);
  writeFileSync(path.join(root, '.env'), 'PRIVATE_VALUE=do-not-export');
  writeFileSync(path.join(packet, 'old.md'), 'OLD_CONTEXT_MUST_NOT_RECURSE');
  await snapshot(root, packet, 'Verder');
  const output = readFileSync(path.join(packet, 'context.json'), 'utf8');
  assert.ok(!output.includes('do-not-export'));
  assert.ok(!output.includes('OLD_CONTEXT_MUST_NOT_RECURSE'));
});

test('rejects malicious manifest traversal and malformed CHP packages', async () => {
  const { root, packet } = fixture();
  await snapshot(root, packet, 'Verder');
  writeFileSync(path.join(packet, 'manifest.json'), JSON.stringify({ version: 1, files: [{ path: '../outside.txt', sha256: 'x' }] }));
  assert.throws(() => check(root, packet), /Onveilig/);
  writeFileSync(path.join(packet, 'context.json'), '{}');
  assert.throws(() => validate(packet), /required/);
});
