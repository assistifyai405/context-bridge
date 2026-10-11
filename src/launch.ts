import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { AppServer, savedInputMatches } from './appserver.ts';
import { snapshot, check } from './bridge.ts';
import { discoverSession, loadConversation } from './conversation.ts';

export function chatLink(threadId: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(threadId)) throw new Error('Ongeldige chat-ID.');
  return `codex://threads/${threadId}`;
}
export function openChat(threadId: string) {
  if (process.platform !== 'win32') throw new Error('De app-launcher is voor Windows.');
  // URI is passed as an environment value, never interpolated into shell code.
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:CONTEXT_BRIDGE_OPEN_URI'], {
    windowsHide: true, timeout: 15000, env: { ...process.env, CONTEXT_BRIDGE_OPEN_URI: chatLink(threadId) }, stdio: 'pipe'
  });
}
export function buildInput(packet: string) {
  const conversation = JSON.parse(readFileSync(path.join(packet, 'conversation.json'), 'utf8'));
  const latest = conversation.messages.filter((m: any) => m.role === 'user').at(-1);
  const text = readFileSync(path.join(packet, 'NEW-CHAT-PROMPT.txt'), 'utf8') +
    '\nDit is een automatische overdracht met Context Bridge. Lees de lokale overdracht, bevestig in maximaal vijf zinnen dat je verder kunt en wacht op de volgende gebruikersopdracht. Start geen nieuwe chats en bouw de laatste historische opdracht niet opnieuw.\n\n' +
    readFileSync(path.join(packet, 'CHAT-HANDOFF.md'), 'utf8');
  const input: any[] = [{ type: 'text', text, text_elements: [] }];
  for (const attachment of latest?.attachments || []) if (attachment.status === 'included') {
    if (path.basename(attachment.filename) !== attachment.filename) throw new Error('Ongeldig bijlagepad.');
    input.push({ type: 'localImage', path: realpathSync(path.join(packet, 'assets', attachment.filename)) });
  }
  return { text, input };
}
function save(file: string, value: any) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  writeFileSync(temporary, JSON.stringify(value, null, 2)); renameSync(temporary, file);
}
function visibleDigest(conversation: ReturnType<typeof loadConversation>) {
  return createHash('sha256').update(JSON.stringify(conversation.messages.map(m => ({ ...m, attachments: m.attachments.map(({ bytes, ...a }) => a) })))).digest('hex');
}
export async function launch(configFile: string, progress: (text: string) => void = () => {}, deps: {
  server?: () => any; open?: (id: string) => void; snapshot?: typeof snapshot; discover?: typeof discoverSession
} = {}) {
  const configPath = path.resolve(configFile);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  if (config.version !== 1 || !config.sourceThreadId || !config.projectRoot || !config.transferRoot) throw new Error('Ongeldige launcher-configuratie.');
  const root = realpathSync(config.projectRoot);
  const transferRoot = path.resolve(config.transferRoot);
  mkdirSync(transferRoot, { recursive: true });
  const lock = configPath + '.lock';
  let fd: number;
  try { fd = openSync(lock, 'wx'); writeFileSync(fd, String(process.pid)); }
  catch { throw new Error('Een overdracht loopt al. Sluit die af voordat je opnieuw klikt. Bij een crash: controleer het proces en verwijder alleen de .lock naast de configuratie.'); }
  let server: any;
  let receipt: any;
  let receiptFile: string | undefined;
  const open = deps.open || openChat;
  try {
    if (config.pendingReceipt) {
      receiptFile = config.pendingReceipt;
      receipt = JSON.parse(readFileSync(receiptFile!, 'utf8'));
      if (receipt.threadId) {
        open(receipt.threadId);
        throw new Error(`De vorige overdracht was onvolledig. Bestaande chat ${receipt.threadId} is opnieuw geopend; er is geen tweede chat aangemaakt. Zie ${receiptFile}.`);
      }
      throw new Error(`De vorige aanmaak had een onbekende uitkomst. Controleer ${receiptFile} en de app voordat je pendingReceipt uit de configuratie verwijdert.`);
    }
    progress('Gesprek en project verzamelen…');
    const session = (deps.discover || discoverSession)(config.sourceThreadId);
    const conversation = loadConversation(session, config.sourceThreadId);
    const visibleHash = visibleDigest(conversation);
    if (config.lastReceipt && existsSync(config.lastReceipt)) {
      const last = JSON.parse(readFileSync(config.lastReceipt, 'utf8'));
      let selectedFilesUnchanged = false;
      if (last.projectRoot === root) {
        try { selectedFilesUnchanged = check(root, last.packet).every((file: any) => file.status === 'unchanged'); } catch { /* Collect a fresh packet when evidence is unavailable. */ }
      }
      const sameSource = last.sourceThreadId === config.sourceThreadId && last.visibleHash === visibleHash;
      const unchangedContinuation = last.threadId === config.sourceThreadId && last.destinationHash === visibleHash;
      if (selectedFilesUnchanged && (sameSource || unchangedContinuation) && last.status === 'ready') {
        open(last.threadId); progress('Dezelfde overdracht opnieuw geopend.'); return { ...last, reused: true };
      }
    }
    const packet = path.join(transferRoot, new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8));
    await (deps.snapshot || snapshot)(root, packet, 'Verder vanuit de automatisch geïmporteerde chat', { session, expectedSessionId: config.sourceThreadId });
    const { text, input } = buildInput(packet);
    server = (deps.server || AppServer.start)();
    await server.initialize();
    const account = await server.request('account/read', { refreshToken: false });
    if (!account.account && account.requiresOpenaiAuth) throw new Error('Log eerst in bij Codex; de overdracht staat lokaal klaar.');
    // Keep account defaults; no hardcoded model or changed permission policy.
    receiptFile = path.join(packet, 'LAUNCH-RECEIPT.json');
    receipt = { version: 1, sourceThreadId: config.sourceThreadId, projectRoot: root, visibleHash, packet, status: 'creating', generatedAt: new Date().toISOString() };
    save(receiptFile, receipt);
    config.pendingReceipt = receiptFile; save(configPath, config);
    progress('Nieuwe chat aanmaken…');
    const started = await server.request('thread/start', { cwd: root, ephemeral: false });
    receipt.threadId = started.thread.id;
    receipt.deepLink = chatLink(receipt.threadId); receipt.status = 'created'; save(receiptFile, receipt);
    await server.request('thread/name/set', { threadId: receipt.threadId, name: config.title || 'Context Bridge — verder werken' });
    const turn = await server.request('turn/start', { threadId: receipt.threadId, input });
    receipt.turnId = turn.turn.id; receipt.status = 'submitted'; save(receiptFile, receipt);
    try { open(receipt.threadId); receipt.openRequested = true; } catch { receipt.openRequested = false; }
    save(receiptFile, receipt);
    progress('Overdracht verzonden; de nieuwe chat leest de context…');
    const finished = await server.waitFor('turn/completed', (p: any) => p.threadId === receipt.threadId && p.turn.id === receipt.turnId);
    if (finished.turn.status !== 'completed') throw new Error(`De ontvangende chat eindigde met status ${finished.turn.status}.`);
    const stored = await server.request('thread/read', { threadId: receipt.threadId, includeTurns: true });
    if (!savedInputMatches(stored.thread, receipt.turnId, text)) throw new Error('De overdracht kon niet in de opgeslagen chat worden bevestigd.');
    receipt.destinationHash = visibleDigest(loadConversation((deps.discover || discoverSession)(receipt.threadId), receipt.threadId));
    receipt.status = 'ready'; receipt.inputVerified = true; receipt.completedAt = new Date().toISOString(); save(receiptFile, receipt);
    delete config.pendingReceipt; config.lastReceipt = receiptFile; config.sourceThreadId = receipt.threadId; save(configPath, config);
    progress(receipt.openRequested ? 'Nieuwe chat staat klaar.' : 'Chat staat klaar; open de deepLink uit het ontvangstbewijs.');
    return receipt;
  } catch (error) {
    if (receipt && receiptFile && receipt.status !== 'ready') {
      receipt.status = 'incomplete'; receipt.error = error instanceof Error ? error.message : String(error); save(receiptFile, receipt);
    }
    throw error;
  } finally { server?.close(); closeSync(fd!); unlinkSync(lock); }
}
