"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const KNOWN_PREFIXES = ["/account", "/navigate", "/proof", "/ops"];

function isKnownRoute(path: string) {
  return KNOWN_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function SpaFallbackRedirect() {
  const router = useRouter();

  useEffect(() => {
    let target: string | null = null;
    try {
      target = sessionStorage.getItem("__stepfree_spa_path");
      if (target) {
        sessionStorage.removeItem("__stepfree_spa_path");
      }
    } catch {
      target = null;
    }

    if (!target) {
      return;
    }

    const path = target.split("?")[0].split("#")[0];
    if (isKnownRoute(path)) {
      router.replace(target);
    }
  }, [router]);

  return null;
}
