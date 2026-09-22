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

          <div className="navigator-stops">
            {routePlan.stations.map((station, index) => {
              const segment = routePlan.segments[index];
              return (
                <div key={station.id} className={guidanceStarted && index === 0 ? "is-current" : ""}>
                  <span>{index === 0 ? "A" : lineCode(segment?.line ?? "")}</span>
                  <p><strong>{station.name}</strong><small>{index === 0 ? "Start" : segment?.line}</small></p>
                  {index < routePlan.stations.length - 1 ? <ArrowRight aria-hidden="true" /> : <Navigation aria-hidden="true" />}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="start-guidance-button"
            onClick={() => setGuidanceStarted(true)}
            disabled={guidanceStarted}
          >
            <Navigation aria-hidden="true" />
            {guidanceStarted ? "Guidance active" : "Start transit guidance"}
          </button>
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
