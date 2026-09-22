"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { getSessionId } from "@/shared/lib/session";
import { CircleUserRound, Radio, Route, ScanLine } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AccessMap } from "@/features/navigation/access-map";
import { StreetRoutePanel } from "@/features/navigation/street-route-panel";
import { TransitRoutePanel } from "@/features/navigation/transit-route-panel";
import type {
  Coordinate,
  SelectionMode,
  Station,
  StreetRoute,
} from "@/features/navigation/types";
import { useLiveLocation } from "@/features/navigation/use-live-location";
import { BrandMark } from "@/shared/ui/brand-mark";

export function NavigatorScreen() {
  const searchParams = useSearchParams();
  const initialFromSlug = searchParams.get("from")?.trim() || "waterloo";
  const initialToSlug = searchParams.get("to")?.trim() || "barbican";
  const initialMode: "street" | "transit" =
    searchParams.get("mode") === "transit" ? "transit" : "street";
  const [sessionId] = useState<string | undefined>(() =>
    typeof window === "undefined" ? undefined : getSessionId(),
  );

  const stations = useQuery(api.routes.listStations) ?? [];
  const incidents = useQuery(api.incidents.listMapIncidents, { sessionId }) ?? [];
  const profile = useQuery(api.users.current);
  const [mode, setMode] = useState(initialMode);
  const [origin, setOrigin] = useState<Coordinate | null>(null);
  const [destination, setDestination] = useState<Coordinate | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("origin");
  const [streetRoute, setStreetRoute] = useState<StreetRoute | null>(null);
  const [transitRoute, setTransitRoute] = useState<Station[]>([]);
  const [guidanceActive, setGuidanceActive] = useState(false);
  const location = useLiveLocation();

  const changeStreetRoute = useCallback((route: StreetRoute | null) => {
    setStreetRoute(route);
    setSelectionMode(null);
    setGuidanceActive(false);
  }, []);

  const changeTransitRoute = useCallback((route: Station[]) => {
    setTransitRoute(route);
  }, []);

  function changeMode(nextMode: "street" | "transit") {
    setMode(nextMode);
    setSelectionMode(nextMode === "street" ? "origin" : null);
    window.history.replaceState(
      null,
      "",
      nextMode === "transit"
        ? `/navigate?mode=transit&from=${encodeURIComponent(initialFromSlug)}&to=${encodeURIComponent(initialToSlug)}`
        : "/navigate?mode=street",
    );
  }

  function pickMapPoint(coordinate: Coordinate) {
    if (selectionMode === "origin") {
      setOrigin(coordinate);
      setSelectionMode("destination");
    } else if (selectionMode === "destination") {
      setDestination(coordinate);
      setSelectionMode(null);
    }

    setStreetRoute(null);
    setGuidanceActive(false);
  }

  function changeOrigin(coordinate: Coordinate) {
    setOrigin(coordinate);
    setStreetRoute(null);
    setGuidanceActive(false);
  }

  function startGuidance() {
    if (location.coordinate) {
      location.startTracking();
      setGuidanceActive(true);
      return;
    }

    location.requestLocation(() => {
      location.startTracking();
      setGuidanceActive(true);
    });
  }

  return (
    <main className="navigator-page">
      <AccessMap
        mode={mode}
        stations={stations}
        incidents={incidents}
        transitRoute={transitRoute}
        streetRoute={streetRoute}
        origin={mode === "street" ? origin : null}
        destination={mode === "street" ? destination : null}
        userLocation={location.coordinate}
        selectionMode={mode === "street" ? selectionMode : null}
        onMapPick={pickMapPoint}
      />

      <header className="navigator-topbar">
        <Link className="brand" href="/">
          <BrandMark /> <span>StepFree</span>
        </Link>
        <div className="navigator-live-pill">
          <Radio aria-hidden="true" /> Live access
        </div>
        <Link className="navigator-account-link" href="/account">
          <CircleUserRound aria-hidden="true" />
          {profile?.displayName ?? "Account"}
        </Link>
      </header>

      <section className="navigator-panel" aria-label="Route planner">
        <div className="navigator-mode-tabs" role="tablist" aria-label="Route type">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "street"}
            className={mode === "street" ? "is-active" : ""}
            onClick={() => changeMode("street")}
          >
            <ScanLine aria-hidden="true" /> Street
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "transit"}
            className={mode === "transit" ? "is-active" : ""}
            onClick={() => changeMode("transit")}
          >
            <Route aria-hidden="true" /> Transit
          </button>
        </div>

        {mode === "street" ? (
          <StreetRoutePanel
            origin={origin}
            destination={destination}
            selectionMode={selectionMode}
            route={streetRoute}
            currentLocation={location.coordinate}
            locationStatus={location.status}
            locationMessage={location.message}
            locationAccuracy={location.accuracyMeters}
            guidanceActive={guidanceActive}
            onSelectionModeChange={setSelectionMode}
            onOriginChange={changeOrigin}
            onRouteChange={changeStreetRoute}
            onRequestLocation={location.requestLocation}
            onStartGuidance={startGuidance}
          />
        ) : (
          <TransitRoutePanel
            stations={stations}
            initialFromSlug={initialFromSlug}
            initialToSlug={initialToSlug}
            onRouteChange={changeTransitRoute}
          />
        )}
      </section>
    </main>
  );
}
