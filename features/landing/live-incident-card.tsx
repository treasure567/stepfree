"use client";

import { useQuery } from "convex/react";
import { BellRing, Check } from "lucide-react";
import { api } from "@/convex/_generated/api";

export function LiveIncidentCard() {
  const status = useQuery(api.incidents.getBondStreetStatus);
  const isOut = status?.liftStatus === "out-of-service";
  const updatedAt = status?.incident?.updatedAt;
  const updatedTime = updatedAt
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(updatedAt)
    : "Live";

  return (
    <aside className="incident-card" aria-label="Live route incident">
      <div className="incident-topline">
        <span className={`status-dot ${isOut ? "" : "is-clear"}`} />
        {status ? "Convex live state" : "Connecting"}
        <span>{updatedTime}</span>
      </div>
      <div className="incident-place">
        <div className="line-symbol">C</div>
        <div>
          <strong>Bond Street</strong>
          <span>Central line · Primary lift</span>
        </div>
      </div>
      <div className={`incident-message ${isOut ? "" : "is-clear"}`}>
        {isOut ? <BellRing aria-hidden="true" /> : <Check aria-hidden="true" />}
        <div>
          <strong>{isOut ? "Lift unavailable" : "Lift operating"}</strong>
          <span>
            {isOut
              ? "StepFree is routing around it."
              : "The shortest step-free route is open."}
          </span>
        </div>
      </div>
      <div className="incident-footer">
        <span>{isOut ? "Rerouting via London Bridge" : "Route via Bond Street"}</span>
        <span>{isOut ? "+5 min" : "Clear"}</span>
      </div>
    </aside>
  );
}
