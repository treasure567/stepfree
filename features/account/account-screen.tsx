"use client";

import Link from "next/link";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ArrowLeft, Check, LoaderCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AuthForm } from "@/features/account/auth-form";
import { ProfileEditor } from "@/features/account/profile-editor";
import { BrandMark } from "@/shared/ui/brand-mark";

function ProfileContent() {
  const profile = useQuery(api.users.current);

  if (!profile) {
    return (
      <div className="account-loading">
        <LoaderCircle className="spin" aria-hidden="true" />
        Loading account
      </div>
    );
  }

  return <ProfileEditor profile={profile} />;
}

export function AccountScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  return (
    <main className="account-page">
      <nav className="app-topbar" aria-label="Account navigation">
        <Link className="brand" href="/">
          <BrandMark /> <span>StepFree</span>
        </Link>
        <Link className="app-back-link" href="/">
          <ArrowLeft aria-hidden="true" /> Home
        </Link>
      </nav>

      {isLoading ? (
        <div className="account-loading">
          <LoaderCircle className="spin" aria-hidden="true" />
          Checking session
        </div>
      ) : isAuthenticated ? (
        <ProfileContent />
      ) : (
        <div className="account-entry-layout">
          <section className="account-entry-copy">
            <span>StepFree account</span>
            <h2>One mobility profile for every route.</h2>
            <p>
              Your route settings should travel with you, without storing where
              you are.
            </p>
            <div className="account-proof-list">
              <span><Check aria-hidden="true" /> Saved accessibility preferences</span>
              <span><Check aria-hidden="true" /> Verified disruption alerts</span>
              <span><Check aria-hidden="true" /> No stored GPS history</span>
            </div>
          </section>
          <AuthForm />
        </div>
      )}
    </main>
  );
}
