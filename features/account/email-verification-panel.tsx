"use client";

import { FormEvent, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { Check, LoaderCircle, Mail, RotateCw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { AccountProfile } from "@/features/account/types";

type EmailStep = "email" | "code";

function verificationErrorMessage(error: string, retryAfterMs?: number) {
  if (error === "CODE_INVALID") {
    return "That code is not correct.";
  }

  if (error === "CODE_EXPIRED") {
    return "That code expired. Request a new one.";
  }

  if (error === "CODE_LOCKED") {
    return "Too many incorrect attempts. Request a new code.";
  }

  if (error === "RATE_LIMITED") {
    return `Too many attempts. Try again in ${Math.max(1, Math.ceil((retryAfterMs ?? 0) / 1_000))} seconds.`;
  }

  return "Request a new code and try again.";
}

export function EmailVerificationPanel({ profile }: { profile: AccountProfile }) {
  const [step, setStep] = useState<EmailStep>(
    profile.pendingEmail ? "code" : "email",
  );
  const [email, setEmail] = useState(profile.pendingEmail ?? "");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const requestVerification = useAction(api.emailVerification.request);
  const verifyEmail = useMutation(api.emailVerification.verify);

  if (profile.email && profile.emailVerifiedAt) {
    return (
      <section className="email-status-card is-verified" aria-label="Verified email">
        <Check aria-hidden="true" />
        <div>
          <strong>Email verified</strong>
          <span>{profile.email}</span>
        </div>
      </section>
    );
  }

  async function sendCode() {
    setPending(true);
    setError("");
    setMessage("");

    try {
      const result = await requestVerification({
        email,
        idempotencyKey: crypto.randomUUID(),
      });
      setStep("code");
      setMessage(
        result.status === "already-verified"
          ? "This address is already verified."
          : `We sent a six-digit code to ${result.email}.`,
      );
    } catch {
      setError("We could not send the code. Check the address and try again.");
    } finally {
      setPending(false);
    }
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendCode();
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    try {
      const result = await verifyEmail({ email, code });

      if (!result.success) {
        setError(verificationErrorMessage(result.error, result.retryAfterMs));
        return;
      }

      setMessage("Email verified.");
    } catch {
      setError("We could not verify that code. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="email-verification-card" aria-labelledby="verify-email-title">
      <div className="email-verification-copy">
        <Mail aria-hidden="true" />
        <div>
          <h2 id="verify-email-title">Verify your email</h2>
          <p>Required for lift outage alerts and account recovery.</p>
        </div>
      </div>

      {step === "email" ? (
        <form onSubmit={submitEmail}>
          <label>
            <span>Email address</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              disabled={pending}
              placeholder="you@example.com"
            />
          </label>
          <button type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="spin" aria-hidden="true" /> : null}
            Send code
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode}>
          <label>
            <span>Six-digit code sent to {profile.pendingEmail ?? email}</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
              disabled={pending}
              placeholder="000000"
            />
          </label>
          <button type="submit" disabled={pending || code.length !== 6}>
            {pending ? <LoaderCircle className="spin" aria-hidden="true" /> : null}
            Verify email
          </button>
          <button
            type="button"
            className="email-resend-button"
            onClick={() => void sendCode()}
            disabled={pending}
          >
            <RotateCw aria-hidden="true" /> Send a new code
          </button>
        </form>
      )}

      {message ? <p className="account-success" role="status">{message}</p> : null}
      {error ? <p className="account-error" role="alert">{error}</p> : null}
    </section>
  );
}
