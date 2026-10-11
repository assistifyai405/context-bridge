import { snapshot, check, validate, handoffContract, inspectHandoff } from './bridge.ts';
import { discoverSession } from './conversation.ts';
import { launch } from './launch.ts';
import { listChats, prepareSource, sourceId, sourceDetails } from './sources.ts';
const [command, ...args] = process.argv.slice(2);
try {
  let result;
  if (command === 'chats' && args.length === 0) result = await listChats();
  else if (command === 'continue') {
    const dryRun = args.includes('--dry-run');
    const flags = args.filter(a => a !== '--dry-run');
    if (flags.length !== 0 && !(flags.length === 2 && flags[0] === '--thread')) throw new Error('Gebruik continue [--thread <chat-ID>] [--dry-run].');
    const id = sourceId(flags[1]);
    if (dryRun) result = sourceDetails(id);
    else { const selected = prepareSource(id); result = await launch(selected.configFile, text => console.error(text)); }
  }
  else if (command === 'launch' && args.length === 1) result = await launch(args[0], text => console.error(text));
  else if (command === 'chat' && args.length >= 2) {
    const [root, output, ...flags] = args;
    let session: string;
    let expectedSessionId: string | undefined;
    if (flags.length === 0) { expectedSessionId = process.env.CODEX_THREAD_ID; session = discoverSession(expectedSessionId); }
    else if (flags.length === 2 && flags[0] === '--session') session = flags[1];
    else if (flags.length === 2 && flags[0] === '--thread') { expectedSessionId = flags[1]; session = discoverSession(expectedSessionId); }
    else throw new Error('Gebruik chat <projectmap> <outputmap> [--session <bestand> | --thread <chat-ID>]');
    result = await snapshot(root, output, 'Ga verder vanuit het laatste gebruikersbericht in de automatisch geïmporteerde chat', { session, expectedSessionId });
  }
  else if (command === 'snapshot' && args.length === 3) result = await snapshot(args[0], args[1], args[2]);
  else if (command === 'check' && args.length === 2) {
    result = check(args[0], args[1]);
    if (result.some((r: { status: string }) => r.status !== 'unchanged')) process.exitCode = 2;
  }
  else if (command === 'validate' && args.length === 1) result = validate(args[0]);
  else if (command === 'inspect' && args.length === 1) result = JSON.parse(inspectHandoff(args[0]));
  else if (command === 'doctor') result = { handoff: !!handoffContract().inputSchema, ctxfile: 'source integration', mex: 'Markdown parser integration', chp: 'schema validator integration' };
  else {
    console.log('Context Bridge\n\nnpm run bridge -- continue [--dry-run]\nnpm run bridge -- chats\nnpm run bridge -- launch <launcher.json>\nnpm run bridge -- chat <projectmap> <outputmap> [--session <bestand> | --thread <chat-ID>]\nnpm run bridge -- snapshot <projectmap> <outputmap> "doel"\nnpm run bridge -- check <projectmap> <outputmap>\nnpm run bridge -- validate <outputmap>\nnpm run bridge -- inspect <outputmap>\nnpm run bridge -- doctor');
    process.exitCode = command ? 1 : 0;
  }
  if (result) console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
