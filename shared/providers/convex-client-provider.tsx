"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";

function getConvexUrl() {
  const value = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!value) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");
  }

  return value;
}

const convexUrl = getConvexUrl();

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new ConvexReactClient(convexUrl));

  return (
    <ConvexAuthProvider
      client={client}
      api={{
        refreshSession: api.auth.refreshSession,
        signOut: api.auth.signOut,
      }}
      ambientSignIns={[]}
    >
      {children}
    </ConvexAuthProvider>
  );
}
