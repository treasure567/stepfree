import { ConvexError } from "convex/values";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase().normalize("NFC");
}

export function validateEmail(email: string) {
  const normalized = normalizeEmail(email);

  if (normalized.length > 254 || !emailPattern.test(normalized)) {
    throw new ConvexError({ code: "INVALID_EMAIL" });
  }

  return normalized;
}

export function validateIdempotencyKey(value: string) {
  const key = value.trim();

  if (key.length < 16 || key.length > 100) {
    throw new ConvexError({ code: "INVALID_IDEMPOTENCY_KEY" });
  }

  return key;
}

export function validateSessionId(value: string) {
  const sessionId = value.trim();

  if (sessionId.length < 16 || sessionId.length > 100) {
    throw new ConvexError({ code: "INVALID_SESSION" });
  }

  return sessionId;
}

export function validateCoordinates(latitude: number, longitude: number) {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new ConvexError({ code: "INVALID_COORDINATES" });
  }
}
