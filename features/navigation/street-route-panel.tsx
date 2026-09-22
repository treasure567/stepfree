"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import {
  ArrowRight,
  CircleDot,
  Clock3,
  Crosshair,
  Flag,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Navigation,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  coordinateLabel,
  formatDistance,
  formatDuration,
  remainingRouteDistance,
} from "@/features/navigation/geo";
import type {
  Coordinate,
  SelectionMode,
  StreetRoute,
} from "@/features/navigation/types";
import { getSessionId } from "@/shared/lib/session";

type StreetRoutePanelProps = {
  origin: Coordinate | null;
  destination: Coordinate | null;
  selectionMode: SelectionMode;
  route: StreetRoute | null;
  currentLocation: Coordinate | null;
  locationStatus: "idle" | "requesting" | "ready" | "denied";
  locationMessage: string;
  locationAccuracy: number | null;
  guidanceActive: boolean;
  onSelectionModeChange: (mode: SelectionMode) => void;
  onOriginChange: (coordinate: Coordinate) => void;
  onRouteChange: (route: StreetRoute | null) => void;
  onRequestLocation: (onSuccess?: (coordinate: Coordinate) => void) => void;
  onStartGuidance: () => void;
};

export function StreetRoutePanel({
  origin,
  destination,
  selectionMode,
  route,
  currentLocation,
  locationStatus,
  locationMessage,
  locationAccuracy,
  guidanceActive,
  onSelectionModeChange,
  onOriginChange,
  onRouteChange,
  onRequestLocation,
  onStartGuidance,
}: StreetRoutePanelProps) {
  const calculateStreetRoute = useAction(api.navigation.calculateStreetRoute);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const remainingDistance =
    guidanceActive && currentLocation && route
      ? remainingRouteDistance(currentLocation, route.geometry)
      : route?.distanceMeters ?? 0;

  async function calculateRoute() {
    if (!origin || !destination) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await calculateStreetRoute({
        origin,
        destination,
        sessionId: getSessionId(),
      });
      onRouteChange(result);
    } catch {
      onRouteChange(null);
      setError(
        "No wheelchair route was found between these points. Try a closer destination.",
      );
    } finally {
      setLoading(false);
    }
  }

  function useCurrentLocation() {
    onRequestLocation((coordinate) => {
      onOriginChange(coordinate);
      onSelectionModeChange("destination");
    });
  }

  return (
    <div className="street-route-panel">
      <div className="navigator-panel-title">
        <span>Street navigation</span>
        <h1>Where are you going?</h1>
        <p>Choose two points within 25 km. Routes avoid stairs where map data allows.</p>
      </div>

      <div className="street-location-fields">
        <button
          type="button"
          className={selectionMode === "origin" ? "is-active" : ""}
          onClick={() => onSelectionModeChange("origin")}
        >
          <CircleDot aria-hidden="true" />
          <span><small>Start</small><strong>{coordinateLabel(origin)}</strong></span>
        </button>
        <button
          type="button"
          className={selectionMode === "destination" ? "is-active" : ""}
          onClick={() => onSelectionModeChange("destination")}
        >
          <MapPin aria-hidden="true" />
          <span><small>Destination</small><strong>{coordinateLabel(destination)}</strong></span>
        </button>
      </div>

      <button
        type="button"
        className="use-location-button"
        onClick={useCurrentLocation}
        disabled={locationStatus === "requesting"}
      >
        {locationStatus === "requesting" ? (
          <LoaderCircle className="spin" aria-hidden="true" />
        ) : (
          <LocateFixed aria-hidden="true" />
        )}
        {locationStatus === "requesting" ? "Finding your location" : "Use my location as start"}
      </button>

      {locationMessage ? <p className="navigator-inline-message" role="status">{locationMessage}</p> : null}

      <button
        type="button"
        className="calculate-route-button"
        onClick={() => void calculateRoute()}
        disabled={!origin || !destination || loading}
      >
        {loading ? <LoaderCircle className="spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
        {loading ? "Calculating route" : "Find wheelchair route"}
      </button>

      {error ? <p className="navigator-error" role="alert">{error}</p> : null}

      {route ? (
        <section className="street-route-result" aria-live="polite">
          <div className="street-route-summary">
            <div>
              <small>{guidanceActive ? "Remaining" : "Route distance"}</small>
              <strong>{formatDistance(remainingDistance)}</strong>
            </div>
            <div>
              <small>Estimated time</small>
              <strong>{formatDuration(route.durationSeconds)}</strong>
            </div>
          </div>

          <div className="street-route-status">
            <ShieldCheck aria-hidden="true" />
            <span>
              <strong>Wheelchair route</strong>
              <small>
                {guidanceActive && locationAccuracy
                  ? `Live GPS · ±${Math.round(locationAccuracy)} m`
                  : "Stairs avoided from available OpenStreetMap data"}
              </small>
            </span>
          </div>

          <div className="street-directions" aria-label="Turn by turn directions">
            {route.maneuvers.map((maneuver, index) => (
              <div key={`${maneuver.type}-${index}`}>
                <span>{index === route.maneuvers.length - 1 ? <Flag aria-hidden="true" /> : index + 1}</span>
                <p><strong>{maneuver.instruction}</strong><small>{formatDistance(maneuver.distanceMeters)} · {formatDuration(maneuver.timeSeconds)}</small></p>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="start-guidance-button"
            onClick={onStartGuidance}
            disabled={guidanceActive}
          >
            {guidanceActive ? <Crosshair aria-hidden="true" /> : <Navigation aria-hidden="true" />}
            {guidanceActive ? "Live guidance active" : "Start live guidance"}
          </button>

          <div className="route-evidence-line">
            <Clock3 aria-hidden="true" /> Routing by Valhalla
            <span>GPS is processed in this browser</span>
          </div>
        </section>
      ) : null}
    </div>
  );
}
