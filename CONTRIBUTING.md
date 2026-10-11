# Contributing

Install with Node.js 24+, Git and Windows, then run the development checks in the README. Changes to source selection, transcript export or launch behavior should include a regression test using synthetic data.

Use fictional conversations and temporary test directories. Never commit actual Codex session files, personal paths, screenshots, credentials or transfer packets. Check `git diff --cached` and `git status` before submitting a change.

For a bug report, include the command, error text with private details removed, Node/Codex versions and reproduction steps. Replace any chat IDs with fictional values. Do not attach your real conversation history. If an error includes a sensitive value, remove it before posting publicly.

Keep changes small and explain their user-visible effect. Preserve upstream attribution and licenses. Update `UPSTREAM.json` and verify the relevant source/binary hashes when intentionally upgrading an integration.
