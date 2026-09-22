function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export async function hmacSha256Hex(
  secret: string,
  payload: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return bufferToHex(signature);
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function normalizeSignature(signature: string): string {
  const trimmed = signature.trim();
  const separator = trimmed.indexOf("=");
  const value =
    separator > 0 && separator <= 8 ? trimmed.slice(separator + 1) : trimmed;
  return value.toLowerCase();
}

export async function verifyHmacSignature(input: {
  secret: string;
  payload: string;
  signature: string | null;
}): Promise<boolean> {
  if (!input.secret || !input.signature) {
    return false;
  }
  const expected = await hmacSha256Hex(input.secret, input.payload);
  return timingSafeEqualHex(expected, normalizeSignature(input.signature));
}
