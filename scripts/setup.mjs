import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = data => createHash('sha256').update(data).digest('hex');
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', timeout: 60000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
async function setup() {
  if (process.platform !== 'win32') throw new Error('This release supports Windows only.');
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Install Node.js 24 or later first.');
  git(['--version']);
  const manifest = JSON.parse(readFileSync(path.join(root, 'UPSTREAM.json'), 'utf8'));
  const upstream = path.join(root, 'upstream');
  const staging = path.join(root, 'runtime', 'setup-' + randomUUID());
  mkdirSync(upstream, { recursive: true }); mkdirSync(staging, { recursive: true });
  for (const repo of manifest.repositories) {
    if (!/^[a-z0-9-]+$/.test(repo.name) || !/^[a-f0-9]{40}$/.test(repo.commit) || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo.url)) throw new Error('Invalid upstream manifest.');
    const target = path.join(upstream, repo.name);
    if (existsSync(target)) {
      if (git(['-C', target, 'rev-parse', 'HEAD']) !== repo.commit || git(['-C', target, 'status', '--porcelain'])) throw new Error(`Existing upstream/${repo.name} differs from the pinned source. Move it aside before setup; it will not be overwritten.`);
      console.log(`Verified ${repo.name}`); continue;
    }
    console.log(`Installing ${repo.name} at ${repo.commit.slice(0, 12)}`);
    const temporary = path.join(staging, repo.name);
    git(['init', '--quiet', temporary]);
    git(['-C', temporary, 'remote', 'add', 'origin', repo.url]);
    git(['-C', temporary, 'fetch', '--quiet', '--depth', '1', 'origin', repo.commit]);
    git(['-C', temporary, 'checkout', '--quiet', '--detach', 'FETCH_HEAD']);
    if (git(['-C', temporary, 'rev-parse', 'HEAD']) !== repo.commit) throw new Error('Upstream commit verification failed.');
    renameSync(temporary, target);
  }
  const binary = path.join(root, 'bin', 'handoff.exe');
  const spec = manifest.handoffBinary;
  if (existsSync(binary)) {
    if (sha(readFileSync(binary)) !== spec.binary_sha256) throw new Error('Existing Handoff binary has a different hash. Move it aside; it will not be overwritten.');
  } else {
    if (!/^https:\/\/github\.com\/open-grove\/handoff\/releases\/download\//.test(spec.source)) throw new Error('Invalid Handoff download source.');
    console.log(`Downloading Handoff ${spec.version} (Windows AMD64; ARM64 requires Windows emulation)`);
    const response = await fetch(spec.source, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Handoff download failed: HTTP ${response.status}`);
    const archive = Buffer.from(await response.arrayBuffer());
    if (sha(archive) !== spec.archive_sha256) throw new Error('Handoff archive SHA-256 does not match the pinned release.');
    const zip = path.join(staging, 'handoff.zip'); const extracted = path.join(staging, 'handoff');
    writeFileSync(zip, archive);
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:CONTEXT_BRIDGE_SETUP_ZIP -DestinationPath $env:CONTEXT_BRIDGE_SETUP_EXTRACTED'], {
      windowsHide: true, timeout: 30000, stdio: 'pipe', env: { ...process.env, CONTEXT_BRIDGE_SETUP_ZIP: zip, CONTEXT_BRIDGE_SETUP_EXTRACTED: extracted }
    });
    const downloaded = path.join(extracted, 'handoff.exe');
    if (sha(readFileSync(downloaded)) !== spec.binary_sha256) throw new Error('Handoff executable SHA-256 does not match the pinned release.');
    mkdirSync(path.dirname(binary), { recursive: true }); renameSync(downloaded, binary);
  }
  console.log('Setup complete. Run npm test or npm run bridge -- doctor.');
}
setup().catch(error => { console.error(error.message); process.exitCode = 1; });
