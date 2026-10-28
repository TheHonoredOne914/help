/**
 * Email login is implemented in src/lib/server/store.ts.
 * Codes are stored as HMAC-SHA256, not a fast hash. The dev mailbox and SMTP
 * are the only senders. This module is not a second login implementation.
 */
