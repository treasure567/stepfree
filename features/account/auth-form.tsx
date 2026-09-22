"use client";

import { FormEvent, useState } from "react";
import { useAction } from "convex/react";
import { useSignInWithPassword } from "@convex-dev/auth/providers/password/react";
import { useSignUpWithPassword } from "@convex-dev/auth/providers/password/react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";

type AuthError = {
  error: string;
  minimumLength?: number;
  maximumLength?: number;
  retryAfterMs?: number;
};

function authErrorMessage(error: AuthError) {
  const messages: Record<string, string> = {
    USERNAME_TAKEN: "That username is already taken.",
    USERNAME_HAS_SURROUNDING_WHITESPACE:
      "Remove spaces from the start or end of your username.",
    USERNAME_HAS_INVALID_CHARACTERS:
      "Use letters, numbers, hyphens, or underscores only.",
    PASSWORD_HAS_SURROUNDING_WHITESPACE:
      "Remove spaces from the start or end of your password.",
    PASSWORD_TOO_COMMON: "Choose a less predictable password.",
    USER_NOT_FOUND: "The username or password is incorrect.",
    INVALID_CREDENTIALS: "The username or password is incorrect.",
  };

  if (error.error === "USERNAME_TOO_SHORT") {
    return `Use at least ${error.minimumLength ?? 3} characters for your username.`;
  }

  if (error.error === "PASSWORD_TOO_SHORT") {
    return `Use at least ${error.minimumLength ?? 8} characters for your password.`;
  }

  if (error.error === "PASSWORD_TOO_LONG") {
    return `Use fewer than ${error.maximumLength ?? 128} characters for your password.`;
  }

  if (error.error === "RATE_LIMITED") {
    return `Too many attempts. Try again in ${Math.max(1, Math.ceil((error.retryAfterMs ?? 0) / 1_000))} seconds.`;
  }

  return messages[error.error] ?? "We could not complete that request. Try again.";
}

export function AuthForm() {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sendingVerification, setSendingVerification] = useState(false);
  const requestVerification = useAction(api.emailVerification.request);
  const { signUp, pending: signingUp } = useSignUpWithPassword(
    api.auth.signUpWithPassword,
  );
  const { signIn, pending: signingIn } = useSignInWithPassword(
    api.auth.signInWithPassword,
  );
  const pending = signingUp || signingIn || sendingVerification;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const result =
      mode === "signup"
        ? await signUp({ username, password })
        : await signIn({ username, password });

    if (!result.success) {
      setError(authErrorMessage(result.userError));
      return;
    }

    if (mode === "signup") {
      setSendingVerification(true);
      try {
        await requestVerification({
          email,
          idempotencyKey: crypto.randomUUID(),
        });
      } catch {
        setError("Account created. Add your email again from the profile page.");
      } finally {
        setSendingVerification(false);
      }
    }
  }

  function changeMode(nextMode: "signup" | "login") {
    setMode(nextMode);
    setError("");
  }

  return (
    <section className="account-auth-card" aria-labelledby="account-auth-title">
      <div className="account-auth-tabs" role="tablist" aria-label="Account action">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          className={mode === "signup" ? "is-active" : ""}
          onClick={() => changeMode("signup")}
        >
          Create account
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={mode === "login" ? "is-active" : ""}
          onClick={() => changeMode("login")}
        >
          Sign in
        </button>
      </div>

      <div className="account-auth-heading">
        <h1 id="account-auth-title">
          {mode === "signup" ? "Create your StepFree account" : "Sign in to StepFree"}
        </h1>
        <p>
          {mode === "signup"
            ? "Save mobility preferences and receive verified route alerts."
            : "Continue with your saved routes and access settings."}
        </p>
      </div>

      <form className="account-auth-form" onSubmit={submit}>
        <label>
          <span>Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            minLength={3}
            required
            disabled={pending}
            placeholder="Choose a username"
          />
        </label>
        {mode === "signup" ? (
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
        ) : null}
        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            disabled={pending}
            placeholder="8 characters or more"
          />
        </label>
        {error ? <p className="account-error" role="alert">{error}</p> : null}
        <button type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="spin" aria-hidden="true" /> : null}
          {sendingVerification
            ? "Sending verification code"
            : signingUp
              ? "Creating account"
              : signingIn
                ? "Signing in"
                : mode === "signup"
                  ? "Continue"
                  : "Sign in"}
          {!pending ? <ArrowRight aria-hidden="true" /> : null}
        </button>
      </form>

      <p className="account-privacy">
        Location access is optional. Live GPS coordinates are not saved to your account.
      </p>
    </section>
  );
}
