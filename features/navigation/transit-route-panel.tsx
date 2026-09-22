"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  Check,
  Clock3,
  LoaderCircle,
  MapPin,
  Navigation,
  Route,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Station } from "@/features/navigation/types";
import {
  createIdempotencyKey,
  getSessionId,
} from "@/shared/lib/session";
import { formatCheckedAt } from "@/shared/lib/time";

function lineCode(line: string) {
  return line === "Hammersmith & City" ? "H" : line.slice(0, 1).toUpperCase();
}

export function TransitRoutePanel({
  stations,
  initialFromSlug,
  initialToSlug,
  onRouteChange,
}: {
  stations: Station[];
  initialFromSlug: string;
  initialToSlug: string;
  onRouteChange: (stations: Station[]) => void;
}) {
  const [fromSlug, setFromSlug] = useState(initialFromSlug);
  const [toSlug, setToSlug] = useState(initialToSlug);
  const [routeRequest, setRouteRequest] = useState({
    fromSlug: initialFromSlug,
    toSlug: initialToSlug,
  });
  const [sessionId] = useState<string | undefined>(() =>
    typeof window === "undefined" ? undefined : getSessionId(),
  );
  const [guidanceStarted, setGuidanceStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const savedFingerprint = useRef("");
  const saveJourney = useMutation(api.journeys.save);

  const routePlan = useQuery(api.routes.plan, {
    fromSlug: routeRequest.fromSlug,
    toSlug: routeRequest.toSlug,
    sessionId,
  });
  const stationBySlug = useMemo(
    () => new Map(stations.map((station) => [station.slug, station])),
    [stations],
  );
  const routeStations = useMemo(
    () =>
      routePlan?.status === "ready"
        ? routePlan.stations.map((station) => ({
            ...station,
            city: "London",
            stepFreeAccess: "street-to-train" as const,
          }))
        : [],
    [routePlan],
  );

  useEffect(() => {
    onRouteChange(routeStations);
  }, [onRouteChange, routeStations]);

  useEffect(() => {
    if (routePlan?.status !== "ready") {
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
      sessionId: getSessionId(),
      fromSlug: routeRequest.fromSlug,
      toSlug: routeRequest.toSlug,
      idempotencyKey: createIdempotencyKey(),
    }).catch(() => undefined);
  }, [routePlan, routeRequest.fromSlug, routeRequest.toSlug, saveJourney]);

  function plan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGuidanceStarted(false);
    setCurrentStep(0);
    setRouteRequest({ fromSlug, toSlug });
    window.history.replaceState(
      null,
      "",
      `/navigate?mode=transit&from=${encodeURIComponent(fromSlug)}&to=${encodeURIComponent(toSlug)}`,
    );
  }

  function swapStations() {
    setFromSlug(toSlug);
    setToSlug(fromSlug);
  }

  const fromStation = stationBySlug.get(routeRequest.fromSlug);
  const toStation = stationBySlug.get(routeRequest.toSlug);

  return (
    <div className="transit-route-panel">
      <div className="navigator-panel-title">
        <span>London transit pilot</span>
        <h1>Plan a step-free trip</h1>
        <p>Live lift incidents can change the selected route.</p>
      </div>

      <form className="navigator-form" onSubmit={plan}>
        <label>
          <span>Start station</span>
          <div>
            <span className="route-field-dot" />
            <select value={fromSlug} onChange={(event) => setFromSlug(event.target.value)}>
              {stations.map((station) => (
                <option key={station.id} value={station.slug}>{station.name}</option>
              ))}
            </select>
          </div>
        </label>
        <button
          type="button"
          className="route-swap"
          onClick={swapStations}
          aria-label="Swap start and destination"
        >
          <ArrowUpDown aria-hidden="true" />
        </button>
        <label>
          <span>Destination station</span>
          <div>
            <MapPin aria-hidden="true" />
            <select value={toSlug} onChange={(event) => setToSlug(event.target.value)}>
              {stations.map((station) => (
                <option key={station.id} value={station.slug}>{station.name}</option>
              ))}
            </select>
          </div>
        </label>
        <button type="submit" disabled={stations.length === 0 || fromSlug === toSlug}>
          Check route <ArrowRight aria-hidden="true" />
        </button>
      </form>

      {routePlan === undefined ? (
        <div className="navigator-result-loading">
          <LoaderCircle className="spin" aria-hidden="true" /> Checking live access
        </div>
      ) : routePlan.status === "ready" ? (
        <section className="navigator-route-result" aria-live="polite">
          <div className="navigator-route-status">
            <span className={routePlan.rerouted ? "is-rerouted" : ""}>
              {routePlan.rerouted ? <Route aria-hidden="true" /> : <Check aria-hidden="true" />}
            </span>
            <div>
              <strong>
                {routePlan.rerouted
                  ? "Rerouted around a lift outage"
                  : guidanceStarted
                    ? "Guidance active"
                    : "Step-free route ready"}
              </strong>
              <small>{fromStation?.name} to {toStation?.name}</small>
            </div>
          </div>

          <div className="navigator-metrics">
            <span><strong>{routePlan.durationMinutes}</strong><small>minutes</small></span>
            <span><strong>{routePlan.changes}</strong><small>{routePlan.changes === 1 ? "change" : "changes"}</small></span>
            <span><strong>{routePlan.workingLifts}</strong><small>working lifts</small></span>
          </div>

          {routePlan.incidents[0] ? (
            <div className={`navigator-incident ${routePlan.rerouted ? "is-blocking" : ""}`}>
              <AlertTriangle aria-hidden="true" />
              <div>
                <strong>{routePlan.incidents[0].title}</strong>
                <small>{routePlan.incidents[0].sourceName} · {Math.round(routePlan.incidents[0].confidence * 100)}% confidence</small>
              </div>
            </div>
          ) : null}

          {(() => {
            const total = routePlan.stations.length;
            const step = Math.min(currentStep, total - 1);
            const stepInstruction = (i: number): string => {
              const name = routePlan.stations[i]?.name ?? "";
              if (i === 0) {
                const board = routePlan.segments[1]?.line;
                return board
                  ? `Start at ${name}. Board the ${board} line.`
                  : `Start at ${name}.`;
              }
              if (i === total - 1) {
                return `Arrive at ${name} — step-free, you're there.`;
              }
              const arriving = routePlan.segments[i]?.line;
              const next = routePlan.segments[i + 1]?.line;
              if (arriving && next && arriving !== next) {
                return `At ${name}, change to the ${next} line.`;
              }
              return arriving
                ? `Continue through ${name} on the ${arriving} line.`
                : `Continue through ${name}.`;
            };
            return (
              <>
                <div className="navigator-stops">
                  {routePlan.stations.map((station, index) => {
                    const segment = routePlan.segments[index];
                    return (
                      <div
                        key={station.id}
                        className={guidanceStarted && index === step ? "is-current" : ""}
                        onClick={
                          guidanceStarted ? () => setCurrentStep(index) : undefined
                        }
                        role={guidanceStarted ? "button" : undefined}
                      >
                        <span>{index === 0 ? "A" : lineCode(segment?.line ?? "")}</span>
                        <p>
                          <strong>{station.name}</strong>
                          <small>{index === 0 ? "Start" : segment?.line}</small>
                        </p>
                        {index < routePlan.stations.length - 1 ? (
                          <ArrowRight aria-hidden="true" />
                        ) : (
                          <Navigation aria-hidden="true" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {guidanceStarted ? (
                  <div className="navigator-guidance">
                    <div className="navigator-guidance-head">
                      <span>Step {step + 1} of {total}</span>
                      <button
                        type="button"
                        className="navigator-guidance-stop"
                        onClick={() => {
                          setGuidanceStarted(false);
                          setCurrentStep(0);
                        }}
                      >
                        Stop
                      </button>
                    </div>
                    <p className="navigator-guidance-instruction">
                      {stepInstruction(step)}
                    </p>
                    <div className="navigator-guidance-controls">
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentStep((s) => Math.max(0, s - 1))
                        }
                        disabled={step === 0}
                      >
                        Back
                      </button>
                      {step < total - 1 ? (
                        <button
                          type="button"
                          className="is-primary"
                          onClick={() =>
                            setCurrentStep((s) => Math.min(total - 1, s + 1))
                          }
                        >
                          Next stop <ArrowRight aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="is-primary"
                          onClick={() => {
                            setGuidanceStarted(false);
                            setCurrentStep(0);
                          }}
                        >
                          Finish <Check aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="start-guidance-button"
                    onClick={() => {
                      setGuidanceStarted(true);
                      setCurrentStep(0);
                    }}
                  >
                    <Navigation aria-hidden="true" /> Start transit guidance
                  </button>
                )}
              </>
            );
          })()}
          <div className="route-evidence-line">
            <Clock3 aria-hidden="true" />
            {routePlan.lastCheckedAt
              ? `Checked at ${formatCheckedAt(routePlan.lastCheckedAt)}`
              : "No lift timestamp"}
            <span>Convex live updates</span>
          </div>
        </section>
      ) : (
        <div className="navigator-route-error" role="alert">
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>No verified step-free route</strong>
            <small>Choose another station while access conditions change.</small>
          </div>
        </div>
      )}
    </div>
  );
}
