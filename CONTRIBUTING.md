# Contributing

## What limbic refuses to become

Checked before building, not after. A PR adding any of these gets a kind no:

- **Not a transcript store.** The ledger caps stored text at 300 characters per prompt.
  Full-session recall is [claude-mem](https://github.com/thedotmack/claude-mem)'s job,
  done well — go there.
- **Not a server, ever.** No daemon, no cloud, no account. The core runs from files and
  exits.
- **No API key required in core.** The Claude Code adapter (v0.3+) uses `claude -p`
  under subscription auth; an API key is an optional upgrade, never a requirement.
- **Not a vector database, not a RAG framework.** If retrieval ever needs more than
  grep-shaped matching over the ledger, that pressure is a design smell, not a feature
  request.
- **No new dependencies in core.** Zero is the number. Adapters may take exactly the
  dependency their agent forces, and no more.
- **Not a framework.** NuPIC died when its platform outlived its research program;
  limbic stays a tool small enough to finish.

## Threat model

The dream pass (v0.2+) turns session events into rules injected into future agent
context. That path is the attack surface:

- **Prompt injection into memory.** A malicious or manipulated "correction" — pasted
  text, tool output echoed into a prompt, a compromised MCP result — must not be able to
  write itself into future sessions. Defenses, in order: only entries with
  `origin.kind === "human"` and no sidechain flag are ever classified; rules are
  *proposed*, never auto-activated — a human approves every promotion; proposed rules
  are plain text in a file you can read before accepting.
- **Where the model does not hold:** if an attacker already types into your terminal or
  edits your `~/.limbic` files, limbic adds nothing to what they can do — file
  permissions are the boundary, and they are the OS's, not ours.
- **The classifier is not a security control.** It gates signal quality. The propose
  gate is the security control.

## Ask first

- Any change to the ledger record shape (it is the API every benchmark reads).
- Any new label in the classifier (labels are load-bearing downstream).
- Anything that makes an LLM call.

## The usual rules

Tests are the spec — never weaken one to make it pass. Test names are sentences stating
the guarantee. Document in the same change as the code. `script/lint` and `script/test`
green before any PR.
