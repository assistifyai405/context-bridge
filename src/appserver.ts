import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';

/** JSONL app-server transport. No credential files or internal app endpoints. */
export class AppServer extends EventEmitter {
  private nextId = 0;
  private closed = false;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private notifications: any[] = [];
  constructor(private child: ChildProcessWithoutNullStreams) {
    super();
    createInterface({ input: child.stdout }).on('line', line => {
      let msg: any;
      try { msg = JSON.parse(line); } catch { return this.fail(new Error('Ongeldige app-serveruitvoer.')); }
      if (msg.id != null && !msg.method) {
        const item = this.pending.get(msg.id);
        if (!item) return;
        clearTimeout(item.timer); this.pending.delete(msg.id);
        if (msg.error) item.reject(new Error(msg.error.message)); else item.resolve(msg.result);
      } else if (msg.id != null && msg.method) {
        // This transport cannot approve actions or impersonate user input.
        child.stdin.write(JSON.stringify({ id: msg.id, error: { code: -32601, message: 'Context Bridge ondersteunt geen interactieve goedkeuring. Open de chat in de app.' } }) + '\n');
      } else {
        this.notifications.push(msg);
        if (this.notifications.length > 256) this.notifications.shift();
        this.emit('notification', msg);
      }
    });
    // Runtime diagnostics can contain private paths; do not copy them into logs.
    child.stderr.resume();
    child.on('error', () => this.fail(new Error('Codex kon niet worden gestart. Controleer of codex op PATH staat.')));
    child.on('exit', () => this.fail(new Error('De lokale Codex-server is afgesloten.')));
    child.stdin.on('error', () => this.fail(new Error('De verbinding met Codex is gesloten.')));
  }
  static start(binary = 'codex') {
    return new AppServer(spawn(binary, ['app-server', '--stdio'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }));
  }
  private fail(error: Error) {
    this.closed = true;
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); }
    this.pending.clear(); this.emit('closed', error);
  }
  request(method: string, params: any = {}, timeout = 30000): Promise<any> {
    if (this.closed) return Promise.reject(new Error('Codex-verbinding is gesloten.'));
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Geen antwoord op ${method}; er is niet automatisch opnieuw geprobeerd.`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  async initialize() {
    await this.request('initialize', { clientInfo: { name: 'context_bridge', title: 'Context Bridge', version: '0.1.0' } });
    this.child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
  }
  waitFor(method: string, matches: (params: any) => boolean, timeout = 240000): Promise<any> {
    const existing = this.notifications.find(n => n.method === method && matches(n.params));
    if (existing) return Promise.resolve(existing.params);
    if (this.closed) return Promise.reject(new Error('Codex-verbinding is gesloten.'));
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.off('notification', listener); this.off('closed', onClose); };
      const listener = (n: any) => { if (n.method === method && matches(n.params)) { cleanup(); resolve(n.params); } };
      const onClose = (e: Error) => { cleanup(); reject(e); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('De ontvangende chat was niet binnen vier minuten klaar. De chat-ID staat in het ontvangstbewijs.')); }, timeout);
      this.on('notification', listener); this.on('closed', onClose);
    });
  }
  close() { this.child.kill(); }
}

export function savedInputMatches(thread: any, turnId: string, text: string) {
  const turn = thread.turns?.find((t: any) => t.id === turnId);
  return turn?.items?.some((item: any) => item.type === 'userMessage' && item.content?.some((part: any) => part.type === 'text' && part.text === text)) === true;
}
