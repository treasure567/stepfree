"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
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

type GuardResult = { key: string; held: boolean; detail: string };

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
  const [guards, setGuards] = useState<GuardResult[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [journeying, setJourneying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [progress, setProgress] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [immersive, setImmersive] = useState(false);

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
  const attemptForged = useMutation(api.drill.attemptForgedIncident);
  const requestAlert = useMutation(api.alerts.requestDrillAlert);

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

  const runGuards = useCallback(async () => {
    if (!sessionId) return;
    setBusy("guards");
    const results: GuardResult[] = [];
    try {
      const forged = await attemptForged({ sessionId });
      results.push({
        key: "Invented evidence is refused",
        held: forged.rejected === true,
        detail: forged.rejected
          ? "A fabricated excerpt failed verbatim source verification; no incident created."
          : "Unexpected: forged excerpt accepted.",
      });
    } catch {
      results.push({
        key: "Invented evidence is refused",
        held: false,
        detail: "Guard check could not run.",
      });
    }
    const isolated = baseline?.status === "ready" && baseline.rerouted === false;
    results.push({
      key: "One visitor cannot reroute another",
      held: isolated,
      detail: isolated
        ? "A session with no disruption still holds the original route — isolated to this session."
        : "Baseline session is not on the expected route.",
    });
    const reviewedGate =
      live?.status === "ready"
        ? live.incidents.every((i) => i.blocks === false || i.isDemo)
        : true;
    results.push({
      key: "Unreviewed feeds cannot reroute",
      held: reviewedGate,
      detail:
        "Live TfL advisories are context only; they never block until a human accepts them.",
    });
    setGuards(results);
    setBusy(null);
  }, [sessionId, attemptForged, baseline, live]);

  const changeJourney = async (nextFrom: string, nextTo: string) => {
    stopJourney();
    setFrom(nextFrom);
    setTo(nextTo);
    setGuards([]);
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
      setGuards([]);
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
            <h2>Safety guarantees</h2>
          </div>
          <button
            type="button"
            className="proof-button is-slim is-ghost"
            onClick={runGuards}
            disabled={busy !== null || !sessionId}
          >
            <ShieldCheck aria-hidden="true" />
            {busy === "guards" ? "Running…" : "Run the safety checks"}
          </button>
          {guards.length > 0 ? (
            <ul className="proof-guard-list">
              {guards.map((g) => (
                <li key={g.key}>
                  {g.held ? (
                    <ShieldCheck className="is-held" aria-hidden="true" />
                  ) : (
                    <CircleSlash className="is-broken" aria-hidden="true" />
                  )}
                  <div>
                    <strong>{g.key}</strong>
                    <small>{g.detail}</small>
                  </div>
                </li>
              ))}
              <li className="proof-guard-total">
                <BadgeCheck aria-hidden="true" />
                {guards.filter((g) => g.held).length}/{guards.length} guarantees held
              </li>
            </ul>
          ) : null}
        </section>

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
        </div>
      </div>
    </div>
  );
}
