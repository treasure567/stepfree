"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Inbox,
  LayoutGrid,
  LoaderCircle,
  RefreshCw,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { BrandMark } from "@/shared/ui/brand-mark";

type SectionId =
  | "overview"
  | "emergencies"
  | "review"
  | "alerts"
  | "events"
  | "evidence"
  | "webhooks";

function clockAt(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OpsConsole() {
  const profile = useQuery(api.users.current);
  const authed = profile !== null && profile !== undefined;
  const arg = authed ? {} : "skip";
  const [section, setSection] = useState<SectionId>("overview");

  const metrics = useQuery(api.ops.metrics, arg);
  const emergencies = useQuery(api.emergency.active, arg) ?? [];
  const candidates = useQuery(api.review.pendingCandidates, arg) ?? [];
  const alertStats = useQuery(api.alerts.opsStats, arg);
  const failedAlerts =
    useQuery(api.alerts.byStatus, authed ? { status: "failed" as const } : "skip") ??
    [];
  const failedEvents = useQuery(api.events.failed, arg) ?? [];
  const runs = useQuery(api.review.recentRuns, arg) ?? [];
  const syncStatus = useQuery(api.tfl.getSyncStatus, arg);
  const receipts = useQuery(api.webhooks.receipts, arg) ?? [];

  const acknowledge = useMutation(api.emergency.acknowledge);
  const resolveEmergency = useMutation(api.emergency.resolve);
  const accept = useMutation(api.review.acceptCandidate);
  const reject = useMutation(api.review.rejectCandidate);
  const retryAlert = useAction(api.alerts.retryFailed);
  const retryEvent = useMutation(api.ops.retryEvent);
  const retryFailedEvents = useMutation(api.ops.retryFailedEvents);
  const runEvidence = useMutation(api.ops.runEvidenceNow);
  const syncTfl = useMutation(api.ops.syncTflNow);

  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
    } catch {
      /* errors surface in the reactive data */
    } finally {
      setBusy(null);
    }
  }

  if (profile === undefined) {
    return (
      <main className="ops-page">
        <div className="ops-loading">
          <LoaderCircle className="spin" aria-hidden="true" /> Loading console…
        </div>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="ops-page">
        <div className="ops-signin">
          <BrandMark />
          <h1>Operations console</h1>
          <p>
            Sign in to triage emergencies, review incident evidence, manage
            alerts and watch the live sources.
          </p>
          <Link className="ops-button" href="/account">
            Sign in to continue
          </Link>
          <Link className="ops-textlink" href="/">
            Back to StepFree
          </Link>
        </div>
      </main>
    );
  }

  const nav: Array<{
    id: SectionId;
    label: string;
    icon: typeof LayoutGrid;
    badge?: number;
  }> = [
    { id: "overview", label: "Overview", icon: LayoutGrid },
    {
      id: "emergencies",
      label: "Emergencies",
      icon: BellRing,
      badge: emergencies.length,
    },
    {
      id: "review",
      label: "Incident review",
      icon: ShieldCheck,
      badge: candidates.length,
    },
    { id: "alerts", label: "Alerts", icon: RefreshCw, badge: failedAlerts.length },
    {
      id: "events",
      label: "Event bus",
      icon: AlertTriangle,
      badge: failedEvents.length,
    },
    { id: "evidence", label: "Evidence & sources", icon: Radio },
    { id: "webhooks", label: "Webhooks", icon: Inbox },
  ];
  const activeLabel = nav.find((n) => n.id === section)?.label ?? "Overview";

  const emergenciesView = (
    <div className="ops-card">
      <h2>Active emergencies</h2>
      {emergencies.length === 0 ? (
        <p className="ops-empty">No active emergencies.</p>
      ) : (
        <ul className="ops-list">
          {emergencies.map((e) => (
            <li key={e._id} className={`ops-row is-${e.status}`}>
              <div>
                <strong>{e.kind.replace(/-/g, " ")}</strong>
                <small>
                  {e.stationSlug ?? "unknown"} · {e.status} · {clockAt(e.createdAt)}
                </small>
                {e.note ? <p className="ops-note">“{e.note}”</p> : null}
              </div>
              <div className="ops-rowactions">
                <button
                  type="button"
                  onClick={() =>
                    run(`ack-${e._id}`, () => acknowledge({ emergencyId: e._id }))
                  }
                  disabled={busy !== null}
                >
                  Acknowledge
                </button>
                <button
                  type="button"
                  className="is-ghost"
                  onClick={() =>
                    run(`res-${e._id}`, () =>
                      resolveEmergency({ emergencyId: e._id }),
                    )
                  }
                  disabled={busy !== null}
                >
                  Resolve
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const reviewView = (
    <div className="ops-card">
      <h2>Candidates awaiting review</h2>
      {candidates.length === 0 ? (
        <p className="ops-empty">No candidates awaiting review.</p>
      ) : (
        <ul className="ops-list">
          {candidates.map((c) => (
            <li key={c.id} className="ops-row">
              <div>
                <strong>{c.title}</strong>
                <small>
                  {c.resolvedStation ?? c.stationName} ·{" "}
                  {Math.round(c.confidence * 100)}% ·{" "}
                  {c.excerptVerified ? "excerpt verified" : "unverified"}
                </small>
                <p className="ops-note">“{c.sourceExcerpt}”</p>
              </div>
              <div className="ops-rowactions">
                <button
                  type="button"
                  onClick={() =>
                    run(`acc-${c.id}`, () => accept({ candidateId: c.id }))
                  }
                  disabled={busy !== null || !c.acceptable}
                  title={c.acceptable ? "" : (c.blockedReason ?? "")}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="is-ghost"
                  onClick={() =>
                    run(`rej-${c.id}`, () => reject({ candidateId: c.id }))
                  }
                  disabled={busy !== null}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const alertsView = (
    <div className="ops-card">
      <h2>Alert state machine</h2>
      <div className="ops-chips">
        {alertStats
          ? Object.entries(alertStats).map(([status, count]) => (
              <span key={status} className={`ops-chip is-${status}`}>
                {status} {count}
              </span>
            ))
          : null}
      </div>
      {failedAlerts.length === 0 ? (
        <p className="ops-empty">No failed alerts.</p>
      ) : (
        <ul className="ops-list">
          {failedAlerts.map((a) => (
            <li key={a._id} className="ops-row is-fail">
              <div>
                <strong>{a.reason}</strong>
                <small>
                  {a.fromName} → {a.toName} · {a.recipientMasked}
                </small>
              </div>
              <div className="ops-rowactions">
                <button
                  type="button"
                  onClick={() =>
                    run(`ra-${a._id}`, () => retryAlert({ alertId: a._id }))
                  }
                  disabled={busy !== null}
                >
                  Retry
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const eventsView = (
    <div className="ops-card">
      <h2>Failed events</h2>
      {failedEvents.length === 0 ? (
        <p className="ops-empty">No failed events.</p>
      ) : (
        <>
          <button
            type="button"
            className="ops-inline-action"
            onClick={() => run("retry-events", () => retryFailedEvents({}))}
            disabled={busy !== null}
          >
            Retry all failed
          </button>
          <ul className="ops-list">
            {failedEvents.map((ev) => (
              <li key={ev._id} className="ops-row is-fail">
                <div>
                  <strong>{ev.type}</strong>
                  <small>
                    {ev.attempts} attempts · {ev.error ?? "dispatch failed"}
                  </small>
                </div>
                <div className="ops-rowactions">
                  <button
                    type="button"
                    onClick={() =>
                      run(`re-${ev._id}`, () => retryEvent({ eventId: ev._id }))
                    }
                    disabled={busy !== null}
                  >
                    Retry
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );

  const evidenceView = (
    <div className="ops-card">
      <h2>Evidence &amp; live sources</h2>
      <div className="ops-rowactions ops-rowactions-inline">
        <button
          type="button"
          onClick={() => run("evidence", () => runEvidence({}))}
          disabled={busy !== null}
        >
          Run evidence now
        </button>
        <button
          type="button"
          className="is-ghost"
          onClick={() => run("sync", () => syncTfl({}))}
          disabled={busy !== null}
        >
          Sync TfL now
        </button>
      </div>
      {syncStatus?.fetchedAt ? (
        <p className="ops-sub">Live feed synced · {clockAt(syncStatus.fetchedAt)}</p>
      ) : null}
      <ul className="ops-list">
        {runs.map((r) => (
          <li key={r._id} className="ops-row">
            <div>
              <strong>{r.status}</strong>
              <small>
                {r.candidateCount} candidates · {clockAt(r.startedAt)}
              </small>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );

  const webhooksView = (
    <div className="ops-card">
      <h2>Webhook receipts</h2>
      {receipts.length === 0 ? (
        <p className="ops-empty">No webhook traffic yet.</p>
      ) : (
        <ul className="ops-list">
          {receipts.map((rec) => (
            <li key={rec._id} className={`ops-row is-${rec.status}`}>
              <div>
                <strong>{rec.source}</strong>
                <small>
                  {rec.status} · {rec.eventId} · {clockAt(rec.receivedAt)}
                </small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const overviewView = (
    <>
      <div className="ops-metrics">
        <button className="ops-metric" onClick={() => setSection("emergencies")}>
          <strong>{metrics?.activeEmergencies ?? "—"}</strong>
          <span>Active SOS</span>
        </button>
        <button className="ops-metric" onClick={() => setSection("review")}>
          <strong>{metrics?.pendingCandidates ?? "—"}</strong>
          <span>Pending review</span>
        </button>
        <button className="ops-metric" onClick={() => setSection("alerts")}>
          <strong>{metrics?.inflightAlerts ?? "—"}</strong>
          <span>Alerts in flight</span>
        </button>
        <button className="ops-metric" onClick={() => setSection("events")}>
          <strong>{metrics?.failedEvents ?? "—"}</strong>
          <span>Failed events</span>
        </button>
      </div>
      <div className="ops-two">
        {emergenciesView}
        {alertsView}
      </div>
    </>
  );

  const views: Record<SectionId, ReactNode> = {
    overview: overviewView,
    emergencies: emergenciesView,
    review: reviewView,
    alerts: alertsView,
    events: eventsView,
    evidence: evidenceView,
    webhooks: webhooksView,
  };

  return (
    <div className="ops-shell">
      <aside className="ops-sidebar">
        <Link className="ops-brand" href="/">
          <BrandMark /> <span>StepFree</span>
        </Link>
        <span className="ops-sidebar-kicker">Operations</span>
        <nav className="ops-nav">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={section === item.id ? "is-active" : ""}
                onClick={() => setSection(item.id)}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
                {item.badge ? (
                  <span className="ops-nav-badge">{item.badge}</span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <Link className="ops-back" href="/">
          Back to site
        </Link>
      </aside>

      <main className="ops-main">
        <header className="ops-header">
          <div>
            <span className="ops-header-kicker">Operations console</span>
            <h1>{activeLabel}</h1>
          </div>
          <span className="ops-operator">
            <CheckCircle2 aria-hidden="true" /> {profile?.displayName ?? "Operator"}
          </span>
        </header>
        <div className="ops-content">{views[section]}</div>
      </main>
    </div>
  );
}
