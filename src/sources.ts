import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AppServer } from './appserver.ts';
import { home } from './bridge.ts';
import { discoverSession } from './conversation.ts';

export function sourceId(explicit?: string, environment: NodeJS.ProcessEnv = process.env) {
  const id = explicit || environment.CODEX_THREAD_ID;
  if (!id) throw new Error('Geen chatcontext beschikbaar. Open de snelkoppeling en kies een chat op naam.');
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Ongeldige chatcontext.');
  return id;
}
export function sourceDetails(id: string, discover = discoverSession) {
  const session = discover(sourceId(id, {}));
  const lines = readFileSync(session, 'utf8').replace(/^\uFEFF/, '').split('\n');
  const meta = JSON.parse(lines[0]);
  if (meta.type !== 'session_meta' || meta.payload?.id !== id || !path.isAbsolute(meta.payload?.cwd || '')) throw new Error('Geen betrouwbare lokale projectmap bij deze chat gevonden.');
  let cwd = meta.payload.cwd;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    let record;
    try { record = JSON.parse(lines[i]); } catch {
      if (i === lines.length - 1) break;
      throw new Error('Beschadigde sessie; bronselectie afgebroken.');
    }
    if (record.type === 'turn_context' && path.isAbsolute(record.payload?.cwd || '')) cwd = record.payload.cwd;
  }
  return { sourceThreadId: id, projectRoot: realpathSync(cwd), session };
}
export function prepareSource(id: string, stateRoot = path.join(home, 'runtime'), discover = discoverSession) {
  const details = sourceDetails(id, discover);
  mkdirSync(stateRoot, { recursive: true });
  const configFile = path.join(stateRoot, `${id}.json`);
  if (existsSync(configFile + '.lock')) throw new Error('Voor deze chat loopt al een overdracht.');
  const prior = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {};
  // The caller's actual chat always wins over a remembered continuation.
  const config = { ...prior, version: 1, sourceThreadId: id, projectRoot: details.projectRoot,
    transferRoot: path.join(home, 'transfers'), title: 'Context Bridge — verder werken' };
  writeFileSync(configFile, JSON.stringify(config, null, 2));
  return { ...details, configFile };
}
export async function listChats(factory: () => any = AppServer.start) {
  const server = factory(); const chats: any[] = [];
  const seen = new Set<string>(); const cursors = new Set<string>();
  try {
    await server.initialize(); let cursor: string | undefined;
    do {
      const page = await server.request('thread/list', { limit: 100, sortKey: 'updated_at', archived: false,
        sourceKinds: ['cli', 'vscode', 'appServer', 'exec'], ...(cursor ? { cursor } : {}) });
      for (const chat of page.data || []) {
        if (!/^[a-zA-Z0-9-]+$/.test(chat.id) || !path.isAbsolute(chat.cwd || '') || seen.has(chat.id)) continue;
        // The desktop may migrate its history mode while retaining native JSONL.
        // Verify the exact session on selection, not by this metadata flag.
        seen.add(chat.id);
        chats.push({ id: chat.id, title: chat.name || chat.preview?.replaceAll('\n', ' ').slice(0, 100) || 'Naamloos gesprek',
          projectRoot: chat.cwd, updatedAt: chat.updatedAt, status: chat.status?.type || 'unknown' });
      }
      cursor = page.nextCursor || undefined;
      if (cursor && cursors.has(cursor)) throw new Error('Codex gaf een herhaalde paginacursor terug.');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return chats;
  } finally { server.close(); }
}
