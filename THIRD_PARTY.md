# Third-party components

Context Bridge's own integration code is licensed under MIT. That license does not relicense the components below. Setup downloads unmodified source at the commits recorded in `UPSTREAM.json`; each checkout retains its license files.

- [Handoff](https://github.com/open-grove/handoff): Apache-2.0. Provides the handoff contract and executable. Setup downloads Windows AMD64 release v0.17.0 and verifies both archive and executable SHA-256 values. Its source license is copied to `licenses/handoff/LICENSE`.
- [ctxfile](https://github.com/ctxfile/ctxfile): Apache-2.0. Supplies project context selection, building, export and text redaction. License: `licenses/ctxfile/LICENSE`.
- [Mex](https://github.com/mex-memory/mex): MIT. Supplies Markdown parsing. License: `licenses/mex/LICENSE`.
- [Context Handoff Protocol](https://github.com/yufuche1/Context-Handoff-Protocol): Apache-2.0. Supplies schema validation. License: `licenses/context-handoff-protocol/LICENSE`.

Runtime npm dependencies are pinned in `package-lock.json`. Their distributions include their own license notices. This source package does not redistribute installed `node_modules`, the Handoff binary, or upstream checkouts.
