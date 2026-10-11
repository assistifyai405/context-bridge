# Context Bridge

Continue a local Codex conversation in a new chat without rewriting project memory or finding a chat ID yourself.

Context Bridge packages the available visible conversation, image assets and selected project context. It creates a new Codex chat, submits a handoff prompt, opens the chat and checks that its initial input was saved. The full transcript stays in local files that the destination agent can read.

**Experimental, Windows only.** This is an independent community project.

## Install

1. Install [Node.js 24 or newer](https://nodejs.org/) and [Git for Windows](https://git-scm.com/downloads/win).
2. Install and sign in to Codex. Its `codex` command must be available in your terminal before using chat transfers.
3. Download this repository's source ZIP and extract it into a permanent folder, or clone it with Git. Open PowerShell in that folder.
4. Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

The installer installs locked npm dependencies, downloads the four pinned upstream repositories and a hash-verified Handoff executable, checks the integrations, creates `Verder met Context Bridge.lnk` in this folder, and installs the `context-bridge` skill in your Codex skills directory. The execution policy option applies only to that PowerShell process.

Restart Codex if the new skill is not visible. Keep this folder in place: the shortcut and installed skill reference it. After moving the folder, rerun the installer. To keep your existing skill unchanged, pass `-SkipSkill` to the installer.

## Use

In the conversation you want to transfer, ask:

> Use Context Bridge to continue this conversation in a new chat.

The skill uses the calling chat's environment to select the source. Outside a Codex chat, double-click `Verder met Context Bridge.lnk` and choose a conversation by name. No chat ID needs to be typed. The picker does not guess which desktop tab is active.

For terminal use inside a Codex chat:

```powershell
npm run bridge -- continue --dry-run
npm run bridge -- continue
```

`--dry-run` checks which local conversation would be selected without creating a destination. A terminal without a calling chat environment should use the shortcut or explicitly select a source.

## Privacy and local files

The source release contains code and fictional examples only. Conversation exports, runtime receipts, logs, downloaded binaries, dependencies and personal project memory are excluded from version control.

The running tool reads local Codex sessions and creates local transfer files. Those files can contain personal conversation text, project paths and images. When you launch a destination, its prompt and latest user image are submitted through your existing Codex account; reading the local history also uses that account and its normal limits. There is no separate Context Bridge analytics service or public upload link. Installation downloads dependencies from npm and GitHub.

Text redaction is best effort. Images are copied unchanged. Review a local export before sharing it, and never upload `runtime/`, `transfers/`, session JSONL files or real handoff packets to a public repository. Git ignore rules protect common locations, not every arbitrary file you might add.

## Scope and limitations

- Supports local Windows Codex conversations with an available original JSONL session file; remote sessions and ChatGPT web chats are unsupported.
- Includes available user and assistant messages; excludes system, developer, analysis and tool messages. A compacted or incomplete source produces a warning, not recovered history.
- The new chat receives a prompt pointing to the full local transcript. It does not replay every original turn or automatically attach every image. The latest user image is attached; other images are available as local assets.
- Selected project context has a 10,000-token budget and a 1,000-token per-file budget. Manifest checks cover selected files, not every file or newly added files.
- A saved-input check confirms the initial input was stored. It cannot guarantee that the model read or understood every part of the history.
- The app-server integration and desktop links may need updates when Codex changes. An incomplete attempt is retained in a receipt to avoid blind duplicate creation.
- Handoff uses its Windows AMD64 executable; ARM64 requires Windows x64 emulation.

## Development and local checks

```powershell
npm ci --ignore-scripts
npm run setup
npm test
npm run bridge -- doctor
```

These checks do not create chats or require model calls. A fictional project is included in `examples/project`. Try a local snapshot without accessing conversation history:

```powershell
npm run bridge -- snapshot examples/project runtime/example-packet "Continue the fictional book collection project"
npm run bridge -- validate runtime/example-packet
npm run bridge -- check examples/project runtime/example-packet
```

The Windows GitHub Actions workflow runs setup, tests and integration checks. See [CONTRIBUTING.md](CONTRIBUTING.md) for safe issue reports and changes.

## Uninstall

Remove the `context-bridge` folder from your Codex skills directory (normally `%USERPROFILE%\.codex\skills`, or the skills directory under your configured `CODEX_HOME`). Remove the shortcut. Keep any private transfers you want before deleting this project folder. No global execution-policy setting is changed.

## License and credits

Context Bridge's integration code is MIT licensed. The four upstream projects retain their own licenses and are downloaded at fixed commits rather than included as a merged codebase. See [THIRD_PARTY.md](THIRD_PARTY.md), [UPSTREAM.json](UPSTREAM.json) and the copied notices in `licenses/`. npm dependencies also retain their own licenses.
