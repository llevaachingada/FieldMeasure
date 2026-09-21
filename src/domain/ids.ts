// IDs — §6.4 of docs/preflight-handoff-v0.3-hardened.md (copied verbatim).
// `crypto.randomUUID()` — no `uuid` package (runtime dependency list is closed, spec §2.2).

export const newId = (): string => crypto.randomUUID();
