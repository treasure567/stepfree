const sessionKey = "stepfree-session-id";

export function getSessionId() {
  const existing = window.localStorage.getItem(sessionKey);

  if (existing) {
    return existing;
  }

  const sessionId = crypto.randomUUID();
  window.localStorage.setItem(sessionKey, sessionId);
  return sessionId;
}

export function createIdempotencyKey() {
  return crypto.randomUUID();
}
