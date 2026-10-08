// Auth event audit trail. Tokens and passwords must never appear in these
// logs — only identities, outcomes and coarse request metadata.
export function logAuthEvent(event, fields = {}) {
  const entry = { timestamp: new Date().toISOString(), event, ...fields };
  console.info(`[auth] ${JSON.stringify(entry)}`);
}

// Financial audit trail. Never log receipt contents or file bytes — only
// identities, ids, amounts and outcomes (see docs/finance.md).
export function logFinanceEvent(event, fields = {}) {
  const entry = { timestamp: new Date().toISOString(), event, ...fields };
  console.info(`[finance] ${JSON.stringify(entry)}`);
}
