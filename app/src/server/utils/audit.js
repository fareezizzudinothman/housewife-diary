// Auth event audit trail. Tokens and passwords must never appear in these
// logs — only identities, outcomes and coarse request metadata.
export function logAuthEvent(event, fields = {}) {
  const entry = { timestamp: new Date().toISOString(), event, ...fields };
  console.info(`[auth] ${JSON.stringify(entry)}`);
}
