"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Check,
  ChevronRight,
  Clock3,
  DatabaseZap,
  LoaderCircle,
  MapPin,
  Navigation,
  Radio,
  Route,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  createIdempotencyKey,
  getSessionId,
} from "@/shared/lib/session";
import { formatCheckedAt } from "@/shared/lib/time";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function lineCode(line: string) {
  if (line === "Hammersmith & City") {
    return "H";
  }

  return line.slice(0, 1).toUpperCase();
}

export function RoutePlanner() {
  const stations = useQuery(api.routes.listStations);
  const [from, setFrom] = useState("Waterloo");
  const [to, setTo] = useState("Barbican");
  const [submittedRoute, setSubmittedRoute] = useState<{
    fromSlug: string;
    toSlug: string;
  } | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [isToggling, setIsToggling] = useState(false);
  const [demoError, setDemoError] = useState("");
  const [reportState, setReportState] = useState<
    "idle" | "sending" | "sent" | "duplicate" | "error"
  >("idle");
  const savedFingerprint = useRef("");
  const routePlan = useQuery(
    api.routes.plan,
    submittedRoute ?? "skip",
  );
  const bondStreetStatus = useQuery(api.incidents.getBondStreetStatus);
  const tflSyncStatus = useQuery(api.tfl.getSyncStatus);
  const latestEvidence = useQuery(api.monitoringData.latestEvidence);
  const setBondStreetLiftStatus = useMutation(
    api.incidents.setBondStreetLiftStatus,
  );
  const saveJourney = useMutation(api.journeys.save);
  const submitReport = useMutation(api.reports.submit);
  const stationSlugByName = useMemo(
    () =>
      new Map(
        (stations ?? []).map((station) => [
          station.name.toLowerCase(),
          station.slug,
        ]),
      ),
    [stations],
  );

  useEffect(() => {
    if (!sessionId || !submittedRoute || routePlan?.status !== "ready") {
      return;
    }

    const fingerprint = [
      routePlan.fromId,
      routePlan.toId,
      routePlan.routeStationIds.join(","),
      routePlan.incidentIds.join(","),
    ].join("|");

    if (savedFingerprint.current === fingerprint) {
      return;
    }

    savedFingerprint.current = fingerprint;
    void saveJourney({
      sessionId,
      fromSlug: submittedRoute.fromSlug,
      toSlug: submittedRoute.toSlug,
      idempotencyKey: createIdempotencyKey(),
    }).catch(() => undefined);
  }, [routePlan, saveJourney, sessionId, submittedRoute]);

  function planRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fromSlug = stationSlugByName.get(from.trim().toLowerCase()) ?? slugify(from);
    const toSlug = stationSlugByName.get(to.trim().toLowerCase()) ?? slugify(to);

    setSessionId(getSessionId());
    setSubmittedRoute({ fromSlug, toSlug });
    setReportState("idle");
  }

  async function toggleIncident() {
    setIsToggling(true);
    setDemoError("");

    try {
      await setBondStreetLiftStatus({
        status: isOut ? "working" : "out-of-service",
        sessionId: sessionId || getSessionId(),
      });
    } catch {
      setDemoError("The demo state could not be changed. Try again.");
    } finally {
      setIsToggling(false);
    }
  }

  async function reportBondStreetLift() {
    if (!bondStreetStatus?.stationId) {
      return;
    }

    setReportState("sending");
    try {
      const result = await submitReport({
        stationId: bondStreetStatus.stationId,
        liftId: bondStreetStatus.liftId,
        sessionId: sessionId || getSessionId(),
        idempotencyKey: createIdempotencyKey(),
        observation:
          bondStreetStatus.liftStatus === "out-of-service"
            ? "not-working"
            : "working",
      });
      setReportState(result.accepted ? "sent" : "duplicate");
    } catch {
      setReportState("error");
    }
  }

  const isPlanning = submittedRoute !== null && routePlan === undefined;
  const isOut = bondStreetStatus?.liftStatus === "out-of-service";
  const tflCheckedAt = tflSyncStatus?.fetchedAt ?? null;
  const routeCheckedAt =
    routePlan?.status === "ready" ? routePlan.lastCheckedAt : null;

  return (
    <div className={`planner-card ${routePlan?.status === "ready" ? "is-planned" : ""}`}>
      <form onSubmit={planRoute}>
        <label>
          <span>From</span>
          <div className="input-shell">
            <MapPin aria-hidden="true" />
            <input
              name="from"
              list="stepfree-stations"
              autoComplete="off"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              placeholder="Station or place"
              required
            />
          </div>
        </label>
        <div className="form-connector" aria-hidden="true">
          <ArrowRight />
        </div>
        <label>
          <span>To</span>
          <div className="input-shell">
            <MapPin aria-hidden="true" />
            <input
              name="to"
              list="stepfree-stations"
              autoComplete="off"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="Station or place"
              required
            />
          </div>
        </label>
        <datalist id="stepfree-stations">
          {(stations ?? []).map((station) => (
            <option value={station.name} key={station.id} />
          ))}
        </datalist>
        <button type="submit" disabled={!stations || isPlanning}>
          {isPlanning ? (
            <>
              Checking live access
              <LoaderCircle className="spin" aria-hidden="true" />
            </>
          ) : (
            <>
              Check step-free route
              <ChevronRight aria-hidden="true" />
            </>
          )}
        </button>
      </form>

      <div className="planner-trust" aria-label="Route checking criteria">
        <span>
          <ShieldCheck aria-hidden="true" />
          {latestEvidence
            ? `${latestEvidence.candidateCount} official works candidates · checked ${formatCheckedAt(latestEvidence.checkedAt)}`
            : "Official works watch connecting"}
        </span>
        <span>
          <Clock3 aria-hidden="true" />
          {tflCheckedAt === null
            ? "Official feed connecting"
            : `${tflSyncStatus?.itemCount ?? 0} TfL lift notices · checked ${formatCheckedAt(tflCheckedAt)}`}
        </span>
        <span><Route aria-hidden="true" /> Mobility-first routing</span>
        <span className="convex-live"><DatabaseZap aria-hidden="true" /> Convex connected</span>
      </div>

      {routePlan?.status === "ready" ? (
        <div className="route-result" aria-live="polite">
          <div className="result-status">
            <span className={routePlan.rerouted ? "is-rerouted" : ""}>
              {routePlan.rerouted ? (
                <Route aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
            </span>
            <div>
              <strong>
                {routePlan.rerouted ? "Route changed around a barrier" : "Step-free route ready"}
              </strong>
              <p>{routePlan.fromName} to {routePlan.toName}</p>
            </div>
          </div>
          <div className="result-metrics">
            <span><strong>{routePlan.durationMinutes}</strong> min</span>
            <span>
              <strong>{routePlan.changes}</strong>{" "}
              {routePlan.changes === 1 ? "change" : "changes"}
            </span>
            <span><strong>{routePlan.workingLifts}</strong> lifts</span>
            <span>
              <strong>
                {routeCheckedAt === null ? "n/a" : formatCheckedAt(routeCheckedAt)}
              </strong>{" "}
              checked
            </span>
          </div>
          {routePlan.rerouted ? (
            <div className="route-alert">
              <BellRing aria-hidden="true" />
              <div>
                <strong>Bond Street avoided</strong>
                <span>
                  A verified lift outage adds {routePlan.delayMinutes} minutes. This route updates live when the lift status changes.
                </span>
              </div>
              <span>{Math.round((routePlan.incidents[0]?.confidence ?? 0) * 100)}% confidence</span>
            </div>
          ) : null}
          {!routePlan.rerouted && routePlan.incidents.length > 0 ? (
            <div className="route-alert is-advisory">
              <AlertTriangle aria-hidden="true" />
              <div>
                <strong>Alternate step-free entrance required</strong>
                <span>{routePlan.incidents[0]?.description}</span>
              </div>
              <span>{routePlan.incidents[0]?.sourceName}</span>
            </div>
          ) : null}
          <div className="result-route">
            {routePlan.stations.map((station, index) => {
              const segment = routePlan.segments[index];
              return (
                <div className="route-station" key={station.id}>
                  {index > 0 ? <ArrowRight aria-hidden="true" /> : null}
                  {segment ? (
                    <span className="line" data-line={segment.line.toLowerCase()}>
                      {lineCode(segment.line)}
                    </span>
                  ) : null}
                  <span>{station.name}</span>
                </div>
              );
            })}
          </div>
          <Link
            className="open-navigator-link"
            href={`/navigate?mode=transit&from=${submittedRoute?.fromSlug ?? "waterloo"}&to=${submittedRoute?.toSlug ?? "barbican"}`}
          >
            <Navigation aria-hidden="true" />
            Open live map navigator
            <ArrowRight aria-hidden="true" />
          </Link>
          {bondStreetStatus?.demoControlsEnabled ? (
            <div className="live-demo-control">
              <div>
                <Radio aria-hidden="true" />
                <span>
                  <strong>Realtime judge demo</strong>
                  Change Bond Street’s lift state. This open route will react without refreshing.
                </span>
              </div>
              <button type="button" onClick={toggleIncident} disabled={isToggling}>
                {isToggling
                  ? "Updating"
                  : isOut
                    ? "Mark lift working"
                    : "Simulate lift failure"}
              </button>
              {demoError ? <p className="route-demo-error" role="alert">{demoError}</p> : null}
            </div>
          ) : null}
          <div className="community-proof">
            <div>
              <ShieldCheck aria-hidden="true" />
              <span>
                <strong>
                  Bond Street · {bondStreetStatus?.communityReports ?? 0} community confirmations
                </strong>
                Reports are stored for verification and never overwrite official state alone.
              </span>
            </div>
            <button
              type="button"
              onClick={reportBondStreetLift}
              disabled={reportState === "sending" || reportState === "sent"}
            >
              {reportState === "sending"
                ? "Sending"
                : reportState === "sent"
                  ? "Report recorded"
                : reportState === "duplicate"
                  ? "Already recorded"
                  : reportState === "error"
                    ? "Try report again"
                    : isOut
                      ? "Confirm lift is down"
                      : "Confirm lift is working"}
            </button>
          </div>
        </div>
      ) : null}

      {routePlan?.status === "station-not-found" ? (
        <div className="route-error" role="alert">
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>That station is outside the pilot network.</strong>
            <span>Choose a London station shown in the suggestions.</span>
          </div>
        </div>
      ) : null}

      {routePlan?.status === "same-station" ? (
        <div className="route-error" role="alert">
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>Choose two different stations.</strong>
            <span>Your starting point and destination are both {routePlan.stationName}.</span>
          </div>
        </div>
      ) : null}

      {routePlan?.status === "blocked" || routePlan?.status === "no-network-route" ? (
        <div className="route-error" role="alert">
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>No verified step-free route is available.</strong>
            <span>StepFree will not label an uncertain journey as accessible.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
