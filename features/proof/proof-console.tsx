"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BellRing,
  CheckCircle2,
  CircleSlash,
  Hash,
  LoaderCircle,
  MailCheck,
  Orbit,
  Play,
  RotateCcw,
  Radio,
  ShieldCheck,
  Sparkles,
  Square,
  TriangleAlert,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ProofMap, type RoutePoint } from "@/features/proof/proof-map";
import { BrandMark } from "@/shared/ui/brand-mark";
import { getSessionId } from "@/shared/lib/session";

type AttackResult = {
  key: string;
  label: string;
  held: boolean;
  detail: string;
  ms: number;
};

const sponsorChain = ["Firecrawl", "OpenAI", "Human review", "Convex", "AgentMail"];

function lineCode(line: string) {
  if (!line) return "•";
  if (line === "Hammersmith & City") return "H";
  return line.slice(0, 1).toUpperCase();
}

function toPoints(
  stations: Array<{ id: string; name: string; latitude: number; longitude: number }>,
): RoutePoint[] {
  return stations.map((s) => ({
    id: s.id,
    name: s.name,
    latitude: s.latitude,
    longitude: s.longitude,
  }));
}

export function ProofConsole() {
  const [sessionId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : getSessionId(),
  );
  const [from, setFrom] = useState("waterloo");
  const [to, setTo] = useState("barbican");
  const [attacks, setAttacks] = useState<{
    results: AttackResult[];
    held: number;
    total: number;
  } | null>(null);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [journeying, setJourneying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [progress, setProgress] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);
  const [sosKind, setSosKind] = useState<
    "stuck-no-lift" | "trapped-in-lift" | "needs-assistance"
  >("stuck-no-lift");
  const [sosNote, setSosNote] = useState("");
  const [sosEmail, setSosEmail] = useState("");

  const stations = useQuery(api.routes.listStations) ?? [];
  const drill = useQuery(api.drill.state, sessionId ? { sessionId } : "skip");
  const baseline = useQuery(api.routes.plan, { fromSlug: from, toSlug: to });
  const live = useQuery(
    api.routes.plan,
    sessionId ? { fromSlug: from, toSlug: to, sessionId } : "skip",
  );
  const alerts = useQuery(
    api.alerts.drillAlerts,
    sessionId ? { sessionId } : "skip",
  );

  const simulateOutage = useMutation(api.drill.simulateOutage);
  const resolveOutage = useMutation(api.drill.resolveOutage);
  const resetDrill = useMutation(api.drill.reset);
  const runAttacksMutation = useMutation(api.drill.runAttacks);
  const mintReceipt = useMutation(api.drill.mintReceipt);
  const networkStatus =
    useQuery(api.drill.networkStatus, sessionId ? { sessionId } : "skip") ?? [];
  const searchParams = useSearchParams();
  const runCode = searchParams.get("run");
  const receipt = useQuery(
    api.drill.getReceipt,
    runCode ? { code: runCode } : "skip",
  );
  const requestAlert = useMutation(api.alerts.requestDrillAlert);
  const raiseEmergency = useMutation(api.emergency.raise);
  const cancelEmergency = useMutation(api.emergency.cancel);
  const emergencies =
    useQuery(api.emergency.forSession, sessionId ? { sessionId } : "skip") ?? [];

  const outageActive = drill?.outageActive ?? false;
  const rerouted = live?.status === "ready" ? live.rerouted : false;
  const liveReady = live?.status === "ready" ? live : null;
  const baselineReady = baseline?.status === "ready" ? baseline : null;
  const blocked = live?.status === "blocked";
  const liveDuration = liveReady?.durationMinutes ?? null;
  const baselineDuration = baselineReady?.durationMinutes ?? null;
  const delay = liveReady?.delayMinutes ?? null;
  const affectedStation = drill?.incident?.stationName ?? null;
  const fromName = baselineReady?.fromName ?? liveReady?.fromName ?? "Start";
  const toName = baselineReady?.toName ?? liveReady?.toName ?? "Destination";
  const activeEmergency =
    emergencies.find(
      (e) =>
        e.status === "raised" ||
        e.status === "escalated" ||
        e.status === "acknowledged",
    ) ?? null;

  const reroutedVia = useMemo(() => {
    if (!rerouted || !liveReady || !baselineReady) return null;
    const extra = liveReady.stations.find(
      (as) =>
        as.id !== liveReady.fromId &&
        as.id !== liveReady.toId &&
        !baselineReady.stations.some((bs) => bs.id === as.id),
    );
    return extra?.name ?? null;
  }, [rerouted, liveReady, baselineReady]);

  const disruptionTarget = useMemo(() => {
    if (!baselineReady) return null;
    const intermediate = baselineReady.stations.slice(1, -1);
    if (intermediate.length === 0) return null;
    const bond = intermediate.find((s) => s.slug === "bond-street");
    return (bond ?? intermediate[Math.floor(intermediate.length / 2)]).slug;
  }, [baselineReady]);

  const directions = useMemo(() => {
    if (!liveReady) return [] as Array<{ kind: string; line: string; name: string }>;
    return liveReady.stations.map((station, index) => {
      if (index === 0) return { kind: "start", line: "", name: station.name };
      const segment = liveReady.segments[index - 1];
      return {
        kind:
          index === liveReady.stations.length - 1
            ? "arrive"
            : segment?.includesTransfer
              ? "change"
              : "ride",
        line: segment?.line ?? "",
        name: station.name,
      };
    });
  }, [liveReady]);

  const stopJourney = () => {
    setJourneying(false);
    setArrived(false);
    setProgress(0);
  };

  const onStartJourney = () => {
    if (!liveReady) return;
    setArrived(false);
    setProgress(0);
    setJourneying(true);
  };

  const onJourneyProgress = useCallback((fraction: number) => {
    setProgress(fraction);
  }, []);

  const onJourneyEnd = useCallback(() => {
    setArrived(true);
  }, []);

  const submitSos = async () => {
    if (!sessionId) return;
    setBusy("sos");
    try {
      await raiseEmergency({
        sessionId,
        kind: sosKind,
        stationSlug: disruptionTarget ?? to,
        ...(sosNote.trim() ? { note: sosNote.trim() } : {}),
        ...(sosEmail.trim() ? { contactEmail: sosEmail.trim() } : {}),
      });
      setSosOpen(false);
      setSosNote("");
    } finally {
      setBusy(null);
    }
  };

  const onCancelSos = async () => {
    if (!sessionId || !activeEmergency) return;
    setBusy("sos");
    try {
      await cancelEmergency({ emergencyId: activeEmergency._id, sessionId });
    } finally {
      setBusy(null);
    }
  };

  const runAttacks = useCallback(async () => {
    if (!sessionId) return;
    setBusy("attacks");
    try {
      const outcome = await runAttacksMutation({ sessionId });
      setAttacks(outcome);
    } catch {
      setAttacks({ results: [], held: 0, total: 0 });
    } finally {
      setBusy(null);
    }
  }, [sessionId, runAttacksMutation]);

  const onShareRescue = async () => {
    if (!sessionId) return;
    setBusy("share");
    try {
      const { code } = await mintReceipt({ sessionId, fromSlug: from, toSlug: to });
      setShareCode(code);
      try {
        await navigator.clipboard.writeText(
          `${window.location.origin}/proof?run=${code}`,
        );
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        /* clipboard blocked; the link is still shown */
      }
    } finally {
      setBusy(null);
    }
  };

  const changeJourney = async (nextFrom: string, nextTo: string) => {
    stopJourney();
    setFrom(nextFrom);
    setTo(nextTo);
    setAttacks(null);
    if (sessionId && outageActive) {
      await resetDrill({ sessionId }).catch(() => undefined);
    }
  };

  const onSimulate = async () => {
    if (!sessionId || !disruptionTarget) return;
    stopJourney();
    setBusy("simulate");
    try {
      await simulateOutage({ sessionId, stationSlug: disruptionTarget });
    } finally {
      setBusy(null);
    }
  };

  const onResolve = async () => {
    if (!sessionId) return;
    stopJourney();
    setBusy("resolve");
    try {
      await resolveOutage({ sessionId });
    } finally {
      setBusy(null);
    }
  };

  const onReset = async () => {
    if (!sessionId) return;
    stopJourney();
    setBusy("reset");
    try {
      await resetDrill({ sessionId });
      setAttacks(null);
    } finally {
      setBusy(null);
    }
  };

  const onSendAlert = async () => {
    if (!sessionId) return;
    setBusy("alert");
    try {
      await requestAlert({ sessionId, fromSlug: from, toSlug: to });
    } catch {
      /* status surfaces in the alert log */
    } finally {
      setBusy(null);
    }
  };

  const latestAlert = alerts?.[0] ?? null;
  const shownDuration =
    (outageActive && liveDuration ? liveDuration : baselineDuration) ?? null;

  return (
    <div className="proof-shell">
      <aside className="proof-panel">
        <nav className="proof-panel-top">
          <Link className="brand" href="/">
            <BrandMark /> <span>StepFree</span>
          </Link>
          <Link className="app-back-link" href="/navigate">
            Live map
          </Link>
        </nav>

        <span className="section-kicker">Live proof · no login</span>
        <h1 className="proof-panel-title">Break a lift. Watch the route survive.</h1>
        <p className="proof-panel-lede">
          Pick a journey, break a lift on it, and the map reroutes live on the
          real production backend.
        </p>

        <div className="proof-selectors">
          <label>
            <span>From</span>
            <select value={from} onChange={(e) => changeJourney(e.target.value, to)}>
              {stations
                .filter((s) => s.slug !== to)
                .map((s) => (
                  <option key={s.id} value={s.slug}>{s.name}</option>
                ))}
            </select>
          </label>
          <ArrowRight aria-hidden="true" />
          <label>
            <span>To</span>
            <select value={to} onChange={(e) => changeJourney(from, e.target.value)}>
              {stations
                .filter((s) => s.slug !== from)
                .map((s) => (
                  <option key={s.id} value={s.slug}>{s.name}</option>
                ))}
            </select>
          </label>
        </div>

        <div className={`proof-status-strip ${rerouted ? "is-rerouted" : ""}`}>
          <div>
            <small>Before</small>
            <strong>{baselineDuration ?? "—"}<span>min</span></strong>
          </div>
          <ArrowRight aria-hidden="true" />
          <div>
            <small>After</small>
            <strong>{shownDuration ?? "—"}<span>min</span></strong>
          </div>
          <div className="proof-status-delta">
            <small>Added</small>
            <strong>{rerouted && delay ? `+${delay}` : "0"}<span>min</span></strong>
          </div>
        </div>

        <div className="proof-controls">
          {!outageActive ? (
            <button
              type="button"
              className="proof-button is-danger"
              onClick={onSimulate}
              disabled={busy !== null || !sessionId || !disruptionTarget}
            >
              <TriangleAlert aria-hidden="true" />
              {busy === "simulate" ? "Breaking a lift…" : "Break a lift on this route"}
            </button>
          ) : (
            <button
              type="button"
              className="proof-button"
              onClick={onResolve}
              disabled={busy !== null}
            >
              <CheckCircle2 aria-hidden="true" />
              {busy === "resolve" ? "Restoring…" : "Restore the lift"}
            </button>
          )}
          <button
            type="button"
            className="proof-button is-ghost"
            onClick={onReset}
            disabled={busy !== null}
          >
            <RotateCcw aria-hidden="true" /> Reset
          </button>
        </div>

        <div className="proof-journey">
          <div className="proof-journey-head">
            <span>Wheelchair journey simulation</span>
            {journeying ? (
              <span className="proof-journey-progress">
                {arrived ? "Arrived ✓" : `en route · ${Math.round(progress * 100)}%`}
              </span>
            ) : null}
          </div>
          <div className="proof-journey-controls">
            {!journeying ? (
              <button
                type="button"
                className="proof-button is-slim"
                onClick={onStartJourney}
                disabled={!liveReady}
              >
                <Play aria-hidden="true" /> Start journey
              </button>
            ) : (
              <button
                type="button"
                className="proof-button is-slim is-ghost"
                onClick={stopJourney}
              >
                <Square aria-hidden="true" /> Stop
              </button>
            )}
            <label className="proof-speed">
              <span>{speed}× speed</span>
              <input
                type="range"
                min={1}
                max={6}
                step={0.5}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                aria-label="Journey speed"
              />
            </label>
          </div>
          <button
            type="button"
            className={`proof-toggle ${immersive ? "is-on" : ""}`}
            onClick={() => setImmersive((v) => !v)}
            aria-pressed={immersive}
          >
            <Orbit aria-hidden="true" />
            Immersive third-person view
            <span className="proof-toggle-state">{immersive ? "On" : "Off"}</span>
          </button>

          {activeEmergency ? (
            <div className={`proof-sos-card is-${activeEmergency.status}`}>
              <div className="proof-sos-head">
                <span className="proof-sos-dot" aria-hidden="true" />
                SOS · {activeEmergency.status}
              </div>
              <p>
                {activeEmergency.status === "escalated"
                  ? "No response in time — escalated to station staff."
                  : activeEmergency.status === "acknowledged"
                    ? "Acknowledged — help is on the way."
                    : "Raised. Auto-escalates if no one responds shortly."}
              </p>
              <button
                type="button"
                className="proof-button is-slim is-ghost"
                onClick={onCancelSos}
                disabled={busy !== null}
              >
                I&rsquo;m OK — cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="proof-sos"
              onClick={() => setSosOpen(true)}
              disabled={!sessionId}
            >
              <BellRing aria-hidden="true" />
              I&rsquo;m stuck — send SOS
            </button>
          )}
        </div>

        {directions.length > 0 ? (
          <section className="proof-block">
            <div className="proof-block-head">
              <h2>Directions</h2>
            </div>
            <ol className="proof-directions">
              {directions.map((step, index) => (
                <li key={`${step.name}-${index}`} className={`is-${step.kind}`}>
                  <span className="proof-dir-icon">
                    {step.kind === "start"
                      ? "A"
                      : step.kind === "arrive"
                        ? "B"
                        : step.kind === "change"
                          ? "⇄"
                          : lineCode(step.line)}
                  </span>
                  <div>
                    <strong>{step.name}</strong>
                    <small>
                      {step.kind === "start"
                        ? "Start"
                        : step.kind === "arrive"
                          ? `Arrive${step.line ? ` · ${step.line}` : ""}`
                          : step.kind === "change"
                            ? `Change to ${step.line}`
                            : `Ride ${step.line}`}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <ol className="proof-chain" aria-label="Sponsor chain">
          {sponsorChain.map((label, index) => (
            <li key={label}>
              {label}
              {index < sponsorChain.length - 1 ? <span>›</span> : null}
            </li>
          ))}
        </ol>

        <section className="proof-block">
          <div className="proof-block-head">
            <h2>Evidence behind the reroute</h2>
            {drill?.candidate.excerptVerified ? (
              <span className="proof-tag is-verified">
                <BadgeCheck aria-hidden="true" /> Verified
              </span>
            ) : null}
          </div>
          {drill ? (
            <dl className="proof-kv">
              <div>
                <dt><Sparkles aria-hidden="true" /> Source · model</dt>
                <dd>
                  <a href={drill.candidate.sourceUrl} target="_blank" rel="noreferrer">
                    TfL works page
                  </a>{" · "}{drill.candidate.model}
                </dd>
              </div>
              <div>
                <dt><Hash aria-hidden="true" /> Content hash</dt>
                <dd className="proof-mono">{drill.candidate.sourceHash.slice(0, 18)}…</dd>
              </div>
              <div className="proof-kv-excerpt">
                <dt>Verbatim excerpt (Bond Street)</dt>
                <dd>“{drill.candidate.sourceExcerpt}”</dd>
              </div>
              <div>
                <dt>Review state</dt>
                <dd>
                  <span className={`proof-pill ${outageActive ? "is-accepted" : ""}`}>
                    {outageActive
                      ? "Accepted by reviewer"
                      : "Pending — cannot reroute"}
                  </span>
                </dd>
              </div>
            </dl>
          ) : (
            <div className="proof-loading">
              <LoaderCircle className="spin" aria-hidden="true" /> Loading
            </div>
          )}
        </section>

        <section className="proof-block">
          <div className="proof-block-head">
            <h2>Traveller alert</h2>
          </div>
          <button
            type="button"
            className="proof-button is-slim"
            onClick={onSendAlert}
            disabled={busy !== null || !outageActive}
          >
            <MailCheck aria-hidden="true" />
            {busy === "alert" ? "Queuing…" : "Send the reroute alert"}
          </button>
          {!outageActive ? (
            <p className="proof-hint">Break a lift first to arm an alert.</p>
          ) : null}
          {latestAlert ? (
            <div className="proof-receipt">
              <span>
                Status{" "}
                <b className={`proof-alert-status is-${latestAlert.status}`}>
                  {latestAlert.status}
                </b>
              </span>
              <span>To {latestAlert.recipientMasked}</span>
              <span className="proof-mono">
                {latestAlert.providerMessageId
                  ? `msg ${latestAlert.providerMessageId.slice(0, 16)}…`
                  : "msg —"}
              </span>
              {latestAlert.status === "failed" ? (
                <p className="proof-hint">
                  Send blocked upstream — the AgentMail key needs
                  <code> message_send</code>. Queue, idempotency and status are intact.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="proof-block">
          <div className="proof-block-head">
            <h2>Attack the reroute</h2>
            {attacks ? (
              <span
                className={`proof-tag ${attacks.held === attacks.total ? "is-verified" : ""}`}
              >
                <BadgeCheck aria-hidden="true" /> {attacks.held}/{attacks.total} held
              </span>
            ) : null}
          </div>
          <p className="proof-hint">
            A wrong reroute strands a real person. Each attack runs the live
            production code for this session, then reports whether the guardrail
            held.
          </p>
          <button
            type="button"
            className="proof-button is-slim is-danger"
            onClick={runAttacks}
            disabled={busy !== null || !sessionId}
          >
            <TriangleAlert aria-hidden="true" />
            {busy === "attacks" ? "Running attacks…" : "Run the attacks"}
          </button>
          {attacks && attacks.results.length > 0 ? (
            <ul className="proof-attack-list">
              {attacks.results.map((a) => (
                <li key={a.key}>
                  {a.held ? (
                    <ShieldCheck className="is-held" aria-hidden="true" />
                  ) : (
                    <CircleSlash className="is-broken" aria-hidden="true" />
                  )}
                  <div>
                    <strong>
                      {a.label}
                      <span className="proof-attack-ms">{a.ms} ms</span>
                    </strong>
                    <small>{a.detail}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {networkStatus.length > 0 ? (
          <section className="proof-block">
            <div className="proof-block-head">
              <h2>Network status</h2>
              <span className="proof-network-count">
                {networkStatus.filter((s) => s.status === "operating").length}/
                {networkStatus.length} step-free
              </span>
            </div>
            <ul className="proof-network">
              {networkStatus.map((s) => (
                <li key={s.slug} className={`is-${s.status}`}>
                  <span className="proof-network-dot" aria-hidden="true" />
                  <span className="proof-network-name">{s.name}</span>
                  <span className="proof-network-state">
                    {s.status === "lift-down"
                      ? "lift down"
                      : s.status === "advisory"
                        ? "advisory"
                        : "operating"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="proof-limits">
          Honest limits: a curated 9-station London pilot. Live TfL data is real
          context; the incident you trigger is a labelled controlled drill. The
          Bond Street excerpt is the real verified-evidence example.
        </p>
        <div className="proof-panel-links">
          <a href="https://github.com/treasure567/stepfree" target="_blank" rel="noreferrer">
            Repository
          </a>
          <Link href="/navigate">Live navigator</Link>
        </div>
      </aside>

      <div className="proof-stage">
        {receipt ? (
          <div className="proof-receipt-banner">
            <div className="proof-receipt-head">
              <BadgeCheck aria-hidden="true" /> Verified reroute receipt ·{" "}
              <span className="proof-mono">{receipt.code}</span>
            </div>
            <strong>
              {receipt.fromName} → {receipt.toName}
            </strong>
            <div className="proof-receipt-metrics">
              <span>
                {receipt.baselineMinutes} → {receipt.reroutedMinutes} min
              </span>
              {receipt.delayMinutes ? <span>+{receipt.delayMinutes} min</span> : null}
              {receipt.via ? <span>via {receipt.via}</span> : null}
              {receipt.affectedStation ? (
                <span>{receipt.affectedStation} lift down</span>
              ) : null}
              <span>
                {receipt.guardsHeld}/{receipt.guardsTotal} guards held
              </span>
            </div>
            {receipt.sourceExcerpt ? (
              <p className="proof-receipt-excerpt">“{receipt.sourceExcerpt}”</p>
            ) : null}
            {receipt.sourceHash ? (
              <span className="proof-mono proof-receipt-hash">
                hash {receipt.sourceHash.slice(0, 18)}… · {receipt.model ?? "model"}
              </span>
            ) : null}
          </div>
        ) : null}
        <ProofMap
          baseline={baselineReady ? toPoints(baselineReady.stations) : []}
          active={liveReady ? toPoints(liveReady.stations) : []}
          affected={affectedStation}
          rerouted={rerouted}
          journeying={journeying}
          speed={speed}
          immersive={immersive}
          onJourneyProgress={onJourneyProgress}
          onJourneyEnd={onJourneyEnd}
        />
        <div className={`proof-trip ${rerouted ? "is-rerouted" : ""}`}>
          <div className="proof-trip-head">
            {rerouted ? <BellRing aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            {rerouted ? "Rerouted, still step-free" : "Step-free route"}
          </div>
          <strong>{fromName} → {toName}</strong>
          {liveReady ? (
            <div className="proof-trip-metrics">
              <span>{liveReady.durationMinutes} min</span>
              <span>{liveReady.changes} {liveReady.changes === 1 ? "change" : "changes"}</span>
              {reroutedVia ? <span>via {reroutedVia}</span> : null}
              <span className="proof-trip-live"><Radio aria-hidden="true" /> live · no refresh</span>
            </div>
          ) : blocked ? (
            <div className="proof-trip-metrics is-blocked">
              <AlertTriangle aria-hidden="true" /> No verified step-free route with this lift down
            </div>
          ) : (
            <div className="proof-trip-metrics">
              <LoaderCircle className="spin" aria-hidden="true" /> Solving route…
            </div>
          )}
          {journeying ? (
            <div className="proof-trip-journey">
              <div className="proof-trip-bar">
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <small>
                {arrived
                  ? "Arrived · step-free the whole way"
                  : `Wheelchair en route · ${Math.round(progress * 100)}% · ${speed}×`}
              </small>
            </div>
          ) : null}
          {rerouted && !journeying ? (
            <div className="proof-trip-share">
              <button
                type="button"
                className="proof-button is-slim is-ghost"
                onClick={onShareRescue}
                disabled={busy !== null}
              >
                <BadgeCheck aria-hidden="true" />
                {busy === "share"
                  ? "Minting…"
                  : copied
                    ? "Link copied ✓"
                    : "Share this rescue"}
              </button>
              {shareCode ? (
                <a
                  className="proof-trip-sharelink"
                  href={`/proof?run=${shareCode}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  /proof?run={shareCode}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {sosOpen ? (
        <div
          className="proof-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Send an SOS"
          onClick={(e) => {
            if (e.target === e.currentTarget && busy !== "sos") setSosOpen(false);
          }}
        >
          <div className="proof-modal">
            <h2 className="proof-modal-title">
              <BellRing aria-hidden="true" /> Send an SOS
            </h2>
            <p className="proof-modal-lede">
              This pages station staff and auto-escalates if no one responds.
              Share anything that helps them reach you.
            </p>
            <label className="proof-field">
              <span>What&rsquo;s happening?</span>
              <select
                value={sosKind}
                onChange={(e) =>
                  setSosKind(e.target.value as typeof sosKind)
                }
              >
                <option value="stuck-no-lift">Stuck — no working lift</option>
                <option value="trapped-in-lift">Trapped in a lift</option>
                <option value="needs-assistance">Need assistance</option>
              </select>
            </label>
            <label className="proof-field">
              <span>Details (optional)</span>
              <textarea
                value={sosNote}
                onChange={(e) => setSosNote(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="e.g. On the eastbound platform; the lift by exit 3 is dark."
              />
            </label>
            <label className="proof-field">
              <span>Email for updates (optional)</span>
              <input
                type="email"
                value={sosEmail}
                onChange={(e) => setSosEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <div className="proof-modal-actions">
              <button
                type="button"
                className="proof-button is-slim is-ghost"
                onClick={() => setSosOpen(false)}
                disabled={busy === "sos"}
              >
                Cancel
              </button>
              <button
                type="button"
                className="proof-sos is-inline"
                onClick={submitSos}
                disabled={busy === "sos" || !sessionId}
              >
                <BellRing aria-hidden="true" />
                {busy === "sos" ? "Sending…" : "Send SOS"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
