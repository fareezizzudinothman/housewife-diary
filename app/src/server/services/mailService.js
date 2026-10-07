import { config } from '../config/config.js';

// Email delivery abstraction. Phase 2 has no SMTP infrastructure: real
// delivery is a known limitation. In test mode the full message is captured
// in an in-memory outbox for assertions; otherwise only redacted metadata is
// logged (tokens must never appear in logs).
const outbox = [];

export function sendMail({ to, subject, text }) {
  if (config.env === 'test') {
    outbox.push({ to, subject, text, sentAt: new Date().toISOString() });
    return;
  }
  console.info(`[mail] queued email to ${to} — subject: "${subject}"`);
}

// Test-only helpers (in-memory; nothing is persisted or logged).
export function getOutbox() {
  return outbox;
}

export function clearOutbox() {
  outbox.length = 0;
}
