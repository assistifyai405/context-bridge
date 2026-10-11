---
name: context-bridge
description: Transfer the current local Codex conversation to a new chat when the user explicitly requests Context Bridge or asks to continue this conversation in a new chat. Includes available visible history, images and project context without a manually configured chat ID. Windows only.
---

# Context Bridge

Installed project directory: `{{CONTEXT_BRIDGE_ROOT}}`.

Run from that directory, only when the user explicitly requests a new chat:

```powershell
node --import tsx src/cli.ts continue
```

Keep the process alive until it reports `ready`. The command selects the calling chat using `CODEX_THREAD_ID`, reads its exact local session file and project directory, creates a destination chat, sends the handoff, opens its app link and verifies the saved initial input. It records a receipt and updates the continuation configuration after success.

Use `continue --dry-run` to check source selection without creating a chat. Without the calling chat environment, use `Verder met Context Bridge.lnk` so the user can select a conversation by name. Never guess the newest conversation or reuse an ID remembered from another chat.

Explain that the transfer uses the existing Codex account and normal usage limits. Visible conversation text and image assets are written locally; the destination receives the transfer prompt and latest user image and can read the local history. Best-effort text redaction cannot guarantee removal of secrets; images are unchanged.

This version supports local Windows Codex chats with an available original JSONL session file. It does not support remote chats or ChatGPT web conversations. Compacted or missing source history cannot be recovered by this tool.

If a transfer is incomplete, inspect its receipt instead of blindly creating another chat. Report any warning or failure accurately. After success, report the destination chat and receipt status; saved input verification does not prove that the model understood every detail. When available, use the app navigation tool with the returned thread ID to show the destination.
