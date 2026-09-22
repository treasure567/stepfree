export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function hashVerificationCode(
  idempotencyKey: string,
  code: string,
) {
  const pepper = process.env.OTP_PEPPER?.trim() ?? "";
  return sha256(`${pepper}:${idempotencyKey}:${code}`);
}

export function createNumericCode() {
  const values = new Uint32Array(1);
  const ceiling = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;

  do {
    crypto.getRandomValues(values);
  } while (values[0] >= ceiling);

  return String(values[0] % 1_000_000).padStart(6, "0");
}
