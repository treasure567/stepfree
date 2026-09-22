"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  LayoutGrid,
  LoaderCircle,
  Mail,
  Radio,
  RefreshCw,
  ShieldCheck,
  Webhook,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { BrandMark } from "@/shared/ui/brand-mark";

type SectionId =
  | "overview"
  | "emergencies"
  | "review"
  | "alerts"
  | "activity"
  | "events"
  | "evidence"
  | "webhooks"
  | "inbox";

const PROVIDER_META: Record<string, { label: string; className: string }> = {
  convex: { label: "Convex", className: "is-convex" },
  openai: { label: "OpenAI", className: "is-openai" },
  firecrawl: { label: "Firecrawl", className: "is-firecrawl" },
  agentmail: { label: "AgentMail", className: "is-agentmail" },
  valhalla: { label: "Valhalla", className: "is-valhalla" },
  tfl: { label: "TfL", className: "is-tfl" },
  system: { label: "System", className: "is-system" },
};

function providerMeta(provider: string) {
  return PROVIDER_META[provider] ?? { label: provider, className: "is-system" };
}

type ProviderKey =
  | "convex"
  | "openai"
  | "firecrawl"
  | "agentmail"
  | "valhalla"
  | "tfl"
  | "system";

const PROVIDER_ORDER: ProviderKey[] = [
  "agentmail",
  "firecrawl",
  "openai",
  "tfl",
  "convex",
  "valhalla",
  "system",
];

function dayStart(value: string): number | undefined {
  if (!value) return undefined;
  const ms = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

function dayEnd(value: string): number | undefined {
  if (!value) return undefined;
  const ms = new Date(`${value}T23:59:59.999`).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

function clockAt(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(ts: number) {
  const diff = Date.now() - ts;
  const secs = Math.round(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function prettyJson(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function OpsConsole() {
  const profile = useQuery(api.users.current);
  const authed = profile !== null && profile !== undefined;
  const arg = authed ? {} : "skip";
  const [section, setSection] = useState<SectionId>("overview");
  const [openPayload, setOpenPayload] = useState<string | null>(null);
  const [actProvider, setActProvider] = useState<ProviderKey | "">("");
  const [actFrom, setActFrom] = useState("");
  const [actTo, setActTo] = useState("");
  const [hookFrom, setHookFrom] = useState("");
  const [hookTo, setHookTo] = useState("");

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
  const inbound = useQuery(api.webhooks.recentInbound, arg) ?? [];
  const activity = useQuery(api.activity.recent, authed ? { limit: 8 } : "skip") ?? [];
  const activityStats = useQuery(api.activity.stats, arg);

  const activityPage = usePaginatedQuery(
    api.activity.page,
    authed
      ? {
          provider: actProvider || undefined,
          from: dayStart(actFrom),
          to: dayEnd(actTo),
        }
      : "skip",
    { initialNumItems: 25 },
  );
  const webhookPage = usePaginatedQuery(
    api.webhooks.receiptsPage,
    authed ? { from: dayStart(hookFrom), to: dayEnd(hookTo) } : "skip",
    { initialNumItems: 12 },
  );

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
    desc: string;
  }> = [
    {
      id: "overview",
      label: "Overview",
      icon: LayoutGrid,
      desc: "Everything happening across StepFree, at a glance.",
    },
    {
      id: "emergencies",
      label: "Emergencies",
      icon: BellRing,
      badge: emergencies.length,
      desc: "Live SOS calls from travellers who are stuck. Acknowledge, then resolve.",
    },
    {
      id: "review",
      label: "Incident review",
      icon: ShieldCheck,
      badge: candidates.length,
      desc: "Machine-read incidents wait here for a human to accept or reject before they change any route.",
    },
    {
      id: "alerts",
      label: "Alerts",
      icon: RefreshCw,
      badge: failedAlerts.length,
      desc: "The email alert pipeline: queued, sending, sent, delivered — and any that need a retry.",
    },
    {
      id: "activity",
      label: "Activity log",
      icon: Activity,
      desc: "Every action, and which provider performed it — the system's telemetry stream.",
    },
    {
      id: "events",
      label: "Event bus",
      icon: AlertTriangle,
      badge: failedEvents.length,
      desc: "Internal events that fan work out to consumers. Failed ones can be retried.",
    },
    {
      id: "evidence",
      label: "Evidence & sources",
      icon: Radio,
      desc: "Run the Firecrawl + OpenAI evidence pipeline and sync the live TfL feed.",
    },
    {
      id: "webhooks",
      label: "Webhooks",
      icon: Webhook,
      desc: "Signed inbound webhooks from AgentMail and partners. Open any receipt to see its payload.",
    },
    {
      id: "inbox",
      label: "Inbox",
      icon: Mail,
      badge: inbound.length,
      desc: "Replies travellers send back to our alerts, parsed into an intent.",
    },
  ];
  const active = nav.find((n) => n.id === section) ?? nav[0];

  const emergenciesView = (
    <div className="ops-card">
      <h2>Active emergencies</h2>
      {emergencies.length === 0 ? (
        <p className="ops-empty">No active emergencies. Everyone is moving.</p>
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
        <p className="ops-empty">No failed alerts. The pipeline is healthy.</p>
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

  const activityFiltered = actProvider !== "" || actFrom !== "" || actTo !== "";
  const activityView = (
    <div className="ops-card">
      <h2>Activity &amp; provider telemetry</h2>
      <p className="ops-sub">
        Every meaningful action StepFree takes is logged with the provider that
        performed it. Filter by provider or date.
      </p>
      <div className="ops-chips">
        <button
          type="button"
          className={`ops-provider is-filter${actProvider === "" ? " is-on" : ""}`}
          onClick={() => setActProvider("")}
        >
          All{activityStats ? ` ${activityStats.total}` : ""}
        </button>
        {PROVIDER_ORDER.filter(
          (provider) => (activityStats?.byProvider[provider] ?? 0) > 0,
        ).map((provider) => (
          <button
            key={provider}
            type="button"
            className={`ops-provider ${providerMeta(provider).className}${
              actProvider === provider ? " is-on" : ""
            }`}
            onClick={() =>
              setActProvider(actProvider === provider ? "" : provider)
            }
          >
            {providerMeta(provider).label} {activityStats?.byProvider[provider] ?? 0}
          </button>
        ))}
      </div>
      <div className="ops-filters">
        <label>
          From
          <input
            type="date"
            value={actFrom}
            max={actTo || undefined}
            onChange={(e) => setActFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={actTo}
            min={actFrom || undefined}
            onChange={(e) => setActTo(e.target.value)}
          />
        </label>
        {activityFiltered ? (
          <button
            type="button"
            className="ops-filter-clear"
            onClick={() => {
              setActProvider("");
              setActFrom("");
              setActTo("");
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
      {activityPage.results.length === 0 ? (
        <p className="ops-empty">
          {activityFiltered
            ? "No activity matches these filters."
            : "No activity yet. Run the evidence pipeline or trigger a drill to see the stream fill up."}
        </p>
      ) : (
        <>
          <ul className="ops-feed">
            {activityPage.results.map((row) => (
              <li key={row._id} className={`ops-feed-row is-${row.level}`}>
                <span className={`ops-dot is-${row.level}`} aria-hidden="true" />
                <div className="ops-feed-body">
                  <p>{row.summary}</p>
                  <small>
                    <span
                      className={`ops-provider ${providerMeta(row.provider).className}`}
                    >
                      {providerMeta(row.provider).label}
                    </span>
                    <span className="ops-feed-action">{row.action}</span>
                    {row.actor ? <span>· {row.actor}</span> : null}
                    <span>· {relativeTime(row.createdAt)}</span>
                  </small>
                </div>
              </li>
            ))}
          </ul>
          {activityPage.status === "CanLoadMore" ||
          activityPage.status === "LoadingMore" ? (
            <button
              type="button"
              className="ops-loadmore"
              onClick={() => activityPage.loadMore(25)}
              disabled={activityPage.status === "LoadingMore"}
            >
              {activityPage.status === "LoadingMore" ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </>
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

  const hookFiltered = hookFrom !== "" || hookTo !== "";
  const webhooksView = (
    <div className="ops-card">
      <h2>Webhook receipts</h2>
      <p className="ops-sub">
        Signed, deduplicated and stored. Open a receipt to inspect the exact
        payload we received.
      </p>
      <div className="ops-filters">
        <label>
          From
          <input
            type="date"
            value={hookFrom}
            max={hookTo || undefined}
            onChange={(e) => setHookFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={hookTo}
            min={hookFrom || undefined}
            onChange={(e) => setHookTo(e.target.value)}
          />
        </label>
        {hookFiltered ? (
          <button
            type="button"
            className="ops-filter-clear"
            onClick={() => {
              setHookFrom("");
              setHookTo("");
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
      {webhookPage.results.length === 0 ? (
        <p className="ops-empty">
          {hookFiltered
            ? "No webhook traffic in this range."
            : "No webhook traffic yet."}
        </p>
      ) : (
        <ul className="ops-list">
          {webhookPage.results.map((rec) => {
            const isOpen = openPayload === rec._id;
            return (
              <li key={rec._id} className={`ops-row is-${rec.status}`}>
                <div className="ops-row-grow">
                  <strong>
                    {rec.source}
                    {rec.eventType ? (
                      <span className="ops-tag">{rec.eventType}</span>
                    ) : null}
                  </strong>
                  <small>
                    {rec.status}
                    {rec.signatureValid ? " · signed ✓" : " · unsigned"} ·{" "}
                    {rec.eventId} · {clockAt(rec.receivedAt)}
                  </small>
                  {rec.summary ? <p className="ops-note">{rec.summary}</p> : null}
                  {isOpen && rec.payload ? (
                    <pre className="ops-payload">{prettyJson(rec.payload)}</pre>
                  ) : null}
                </div>
                {rec.payload ? (
                  <div className="ops-rowactions">
                    <button
                      type="button"
                      className="is-ghost"
                      onClick={() => setOpenPayload(isOpen ? null : rec._id)}
                    >
                      {isOpen ? "Hide payload" : "View payload"}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {webhookPage.status === "CanLoadMore" ||
      webhookPage.status === "LoadingMore" ? (
        <button
          type="button"
          className="ops-loadmore"
          onClick={() => webhookPage.loadMore(12)}
          disabled={webhookPage.status === "LoadingMore"}
        >
          {webhookPage.status === "LoadingMore" ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );

  const inboxView = (
    <div className="ops-card">
      <h2>Inbound replies</h2>
      <p className="ops-sub">
        When a traveller replies to an alert, AgentMail posts it here and we
        parse the intent — no polling.
      </p>
      {inbound.length === 0 ? (
        <p className="ops-empty">No inbound replies yet.</p>
      ) : (
        <ul className="ops-list">
          {inbound.map((m) => (
            <li key={m._id} className="ops-row">
              <div className="ops-row-grow">
                <strong>
                  {m.fromEmail}
                  {m.parsedIntent ? (
                    <span className={`ops-tag is-intent-${m.parsedIntent}`}>
                      {m.parsedIntent}
                    </span>
                  ) : null}
                </strong>
                <small>
                  {m.watchId ? "matched an active watch" : "no matching watch"} ·{" "}
                  {clockAt(m.receivedAt)}
                </small>
                {m.subject ? <p className="ops-note">{m.subject}</p> : null}
                {m.text ? <p className="ops-note">“{m.text}”</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const metricTiles: Array<{
    key: string;
    value: number | string;
    label: string;
    to: SectionId;
    tone?: string;
  }> = [
    {
      key: "sos",
      value: metrics?.activeEmergencies ?? "—",
      label: "Active SOS",
      to: "emergencies",
      tone: (metrics?.activeEmergencies ?? 0) > 0 ? "alarm" : undefined,
    },
    {
      key: "review",
      value: metrics?.pendingCandidates ?? "—",
      label: "Pending review",
      to: "review",
    },
    {
      key: "inflight",
      value: metrics?.inflightAlerts ?? "—",
      label: "Alerts in flight",
      to: "alerts",
    },
    {
      key: "sent",
      value: metrics?.alertsSent ?? "—",
      label: "Alerts delivered",
      to: "alerts",
      tone: "good",
    },
    {
      key: "webhooks",
      value: metrics?.webhookEvents ?? "—",
      label: "Webhook events",
      to: "webhooks",
    },
    {
      key: "inbound",
      value: metrics?.inboundReplies ?? "—",
      label: "Inbound replies",
      to: "inbox",
    },
    {
      key: "events",
      value: metrics?.failedEvents ?? "—",
      label: "Failed events",
      to: "events",
      tone: (metrics?.failedEvents ?? 0) > 0 ? "alarm" : undefined,
    },
    {
      key: "activity",
      value: activityStats?.total ?? "—",
      label: "Logged actions",
      to: "activity",
    },
  ];

  const overviewView = (
    <>
      <div className="ops-metrics">
        {metricTiles.map((tile) => (
          <button
            key={tile.key}
            className={`ops-metric${tile.tone ? ` is-${tile.tone}` : ""}`}
            onClick={() => setSection(tile.to)}
          >
            <strong>{tile.value}</strong>
            <span>{tile.label}</span>
          </button>
        ))}
      </div>
      <div className="ops-two">
        {emergenciesView}
        <div className="ops-card">
          <div className="ops-card-head">
            <h2>Live activity</h2>
            <button
              type="button"
              className="ops-inline-action"
              onClick={() => setSection("activity")}
            >
              Open full log
            </button>
          </div>
          {activity.length === 0 ? (
            <p className="ops-empty">Nothing yet — trigger a drill to watch it move.</p>
          ) : (
            <ul className="ops-feed">
              {activity.slice(0, 7).map((row) => (
                <li key={row._id} className={`ops-feed-row is-${row.level}`}>
                  <span className={`ops-dot is-${row.level}`} aria-hidden="true" />
                  <div className="ops-feed-body">
                    <p>{row.summary}</p>
                    <small>
                      <span
                        className={`ops-provider ${providerMeta(row.provider).className}`}
                      >
                        {providerMeta(row.provider).label}
                      </span>
                      <span>· {relativeTime(row.createdAt)}</span>
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );

  const views: Record<SectionId, ReactNode> = {
    overview: overviewView,
    emergencies: emergenciesView,
    review: reviewView,
    alerts: alertsView,
    activity: activityView,
    events: eventsView,
    evidence: evidenceView,
    webhooks: webhooksView,
    inbox: inboxView,
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
            <h1>{active.label}</h1>
            <p className="ops-header-desc">{active.desc}</p>
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
