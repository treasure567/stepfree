"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";

export type RoutePoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type ProofMapProps = {
  baseline: RoutePoint[];
  active: RoutePoint[];
  affected: string | null;
  rerouted: boolean;
  journeying: boolean;
  speed: number;
  immersive: boolean;
  onJourneyProgress?: (fraction: number) => void;
  onJourneyEnd?: () => void;
};

type Geo = { coords: Array<[number, number]>; cum: number[]; total: number };

const BASE_SECONDS = 32;
const FOLLOW_ZOOM = 14.2;
const FOLLOW_PITCH = 0;
const IMMERSIVE_PITCH = 68;
const IMMERSIVE_ZOOM = 16.9;
const IMMERSIVE_LOOKAHEAD = 0.04;
const CAMERA_EASE = 0.1;

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function lineData(points: RoutePoint[]) {
  if (points.length < 2) {
    return { type: "FeatureCollection" as const, features: [] };
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: points.map((p) => [p.longitude, p.latitude]),
    },
  };
}

function haversine(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function buildGeo(points: RoutePoint[]): Geo {
  const coords = points.map((p) => [p.longitude, p.latitude] as [number, number]);
  const cum = [0];
  for (let i = 1; i < coords.length; i += 1) {
    cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  }
  return { coords, cum, total: cum[cum.length - 1] ?? 0 };
}

function segmentAt(geo: Geo, t: number) {
  const d = Math.min(Math.max(t, 0), 1) * geo.total;
  let i = 1;
  while (i < geo.cum.length && geo.cum[i] < d) i += 1;
  if (i >= geo.coords.length) i = geo.coords.length - 1;
  const segStart = geo.cum[i - 1];
  const segEnd = geo.cum[i];
  const f = segEnd > segStart ? (d - segStart) / (segEnd - segStart) : 0;
  return { a: geo.coords[i - 1], b: geo.coords[i], f };
}

function positionAt(geo: Geo, t: number): [number, number] {
  if (geo.coords.length === 1) return geo.coords[0];
  const { a, b, f } = segmentAt(geo, t);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

function bearingAt(geo: Geo, t: number) {
  if (geo.coords.length < 2) return 0;
  const { a, b } = segmentAt(geo, t);
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) -
    Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

function angleDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

function stationMarker(index: number, name: string, variant: string) {
  const el = document.createElement("div");
  el.className = `proof-map-marker ${variant}`;
  el.setAttribute("aria-label", name);
  const dot = document.createElement("span");
  dot.textContent = variant.includes("affected") ? "!" : String(index + 1);
  const label = document.createElement("strong");
  label.textContent = name;
  el.append(dot, label);
  return el;
}

function wheelchairElement() {
  const el = document.createElement("div");
  el.className = "proof-wheelchair";
  const ring = document.createElement("span");
  ring.className = "proof-wheelchair-ring";
  const dot = document.createElement("span");
  dot.className = "proof-wheelchair-dot";
  dot.textContent = "♿";
  el.append(ring, dot);
  return el;
}

export function ProofMap({
  baseline,
  active,
  affected,
  rerouted,
  journeying,
  speed,
  immersive,
  onJourneyProgress,
  onJourneyEnd,
}: ProofMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const wheelchairRef = useRef<Marker | null>(null);
  const animRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const lastTsRef = useRef(0);
  const camZoomRef = useRef(FOLLOW_ZOOM);
  const camPitchRef = useRef(FOLLOW_PITCH);
  const camBearingRef = useRef(0);
  const propsRef = useRef({ baseline, active, rerouted, speed, journeying, immersive });
  const cbRef = useRef({ onJourneyProgress, onJourneyEnd });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    propsRef.current = { baseline, active, rerouted, speed, journeying, immersive };
    cbRef.current = { onJourneyProgress, onJourneyEnd };
  }, [
    baseline,
    active,
    rerouted,
    speed,
    journeying,
    immersive,
    onJourneyProgress,
    onJourneyEnd,
  ]);

  function setLines() {
    const map = mapRef.current;
    if (!map || !map.getSource("active-route")) return;
    const { baseline: bl, active: ac, rerouted: rr } = propsRef.current;
    (map.getSource("baseline-route") as GeoJSONSource).setData(
      lineData(rr ? bl : []),
    );
    (map.getSource("active-route") as GeoJSONSource).setData(lineData(ac));
  }

  function fitRoute() {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre) return;
    const { active: ac, baseline: bl, rerouted: rr } = propsRef.current;
    const all = [...ac, ...(rr ? bl : [])];
    if (all.length < 2) return;
    const bounds = new maplibre.LngLatBounds(
      [all[0].longitude, all[0].latitude],
      [all[0].longitude, all[0].latitude],
    );
    for (const p of all.slice(1)) bounds.extend([p.longitude, p.latitude]);
    const narrow = window.innerWidth < 900;
    map.jumpTo({ pitch: 0, bearing: 0 });
    camPitchRef.current = FOLLOW_PITCH;
    camBearingRef.current = 0;
    camZoomRef.current = FOLLOW_ZOOM;
    map.fitBounds(bounds, {
      padding: narrow
        ? { top: 70, right: 48, bottom: 70, left: 48 }
        : { top: 96, right: 96, bottom: 96, left: 96 },
      duration: 800,
      maxZoom: 14.5,
    });
  }

  useEffect(() => {
    let disposed = false;

    async function create() {
      if (!containerRef.current || mapRef.current) return;
      try {
        const maplibre = await import("maplibre-gl");
        if (disposed || !containerRef.current) return;
        maplibre.setWorkerUrl("/maplibre-gl-worker.mjs");
        maplibreRef.current = maplibre;
        const tileUrl =
          process.env.NEXT_PUBLIC_MAP_TILE_URL ??
          "https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png";
        const map = new maplibre.Map({
          container: containerRef.current,
          center: [-0.1, 51.508],
          zoom: 11.5,
          maxPitch: 80,
          attributionControl: false,
          style: {
            version: 8,
            sources: {
              streets: {
                type: "raster",
                tiles: [tileUrl],
                tileSize: 256,
                minzoom: 0,
                maxzoom: 19,
              },
            },
            layers: [{ id: "streets", type: "raster", source: "streets" }],
          },
        });
        map.addControl(
          new maplibre.NavigationControl({ showCompass: false }),
          "top-right",
        );
        map.addControl(
          new maplibre.AttributionControl({
            compact: true,
            customAttribution:
              '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a> · HOT',
          }),
          "bottom-right",
        );
        map.on("load", () => {
          map.addSource("baseline-route", {
            type: "geojson",
            data: lineData([]),
          });
          map.addLayer({
            id: "baseline-line",
            type: "line",
            source: "baseline-route",
            paint: {
              "line-color": "#6f7a76",
              "line-width": 4,
              "line-opacity": 0.85,
              "line-dasharray": [1.5, 1.8],
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          map.addSource("active-route", {
            type: "geojson",
            data: lineData([]),
          });
          map.addLayer({
            id: "active-casing",
            type: "line",
            source: "active-route",
            paint: { "line-color": "#ffffff", "line-width": 11, "line-opacity": 0.95 },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          map.addLayer({
            id: "active-line",
            type: "line",
            source: "active-route",
            paint: { "line-color": "#1a73e8", "line-width": 6.5 },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          setReady(true);
          setLines();
        });
        mapRef.current = map;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Map failed to load.");
      }
    }

    void create();
    return () => {
      disposed = true;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      wheelchairRef.current?.remove();
      wheelchairRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !containerRef.current) return;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!ready || !map || !maplibre) return;

    setLines();
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    active.forEach((point, index) => {
      const variant =
        index === 0
          ? "is-start"
          : index === active.length - 1
            ? "is-end"
            : "is-mid";
      markersRef.current.push(
        new maplibre.Marker({
          element: stationMarker(index, point.name, variant),
          anchor: "center",
        })
          .setLngLat([point.longitude, point.latitude])
          .addTo(map),
      );
    });

    if (rerouted && affected) {
      const hit = baseline.find(
        (p) => p.name.toLowerCase() === affected.toLowerCase(),
      );
      if (hit) {
        markersRef.current.push(
          new maplibre.Marker({
            element: stationMarker(0, `${hit.name} · lift down`, "is-affected"),
            anchor: "center",
          })
            .setLngLat([hit.longitude, hit.latitude])
            .addTo(map),
        );
      }
    }

    if (!propsRef.current.journeying) fitRoute();
  }, [ready, active, baseline, affected, rerouted]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!ready || !map || !maplibre) return;

    if (!journeying) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = null;
      progressRef.current = 0;
      wheelchairRef.current?.remove();
      wheelchairRef.current = null;
      fitRoute();
      return;
    }

    const geo = buildGeo(propsRef.current.active);
    if (geo.coords.length < 2) return;
    progressRef.current = 0;
    lastTsRef.current = 0;
    camZoomRef.current = map.getZoom();
    camPitchRef.current = map.getPitch();
    camBearingRef.current = map.getBearing();
    const marker = new maplibre.Marker({
      element: wheelchairElement(),
      anchor: "center",
    })
      .setLngLat(geo.coords[0])
      .addTo(map);
    wheelchairRef.current = marker;

    const step = (ts: number) => {
      if (!propsRef.current.journeying) return;
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = Math.min(ts - lastTsRef.current, 64);
      lastTsRef.current = ts;
      progressRef.current = Math.min(
        1,
        progressRef.current + (dt / 1000 / BASE_SECONDS) * propsRef.current.speed,
      );

      const t = progressRef.current;
      const pos = positionAt(geo, t);
      marker.setLngLat(pos);

      const immersive = propsRef.current.immersive;
      const targetBearing = immersive ? bearingAt(geo, t) : 0;
      const targetPitch = immersive ? IMMERSIVE_PITCH : FOLLOW_PITCH;
      const targetZoom = immersive ? IMMERSIVE_ZOOM : FOLLOW_ZOOM;

      camPitchRef.current = lerp(camPitchRef.current, targetPitch, CAMERA_EASE);
      camZoomRef.current = lerp(camZoomRef.current, targetZoom, CAMERA_EASE);
      camBearingRef.current =
        (camBearingRef.current +
          angleDelta(camBearingRef.current, targetBearing) * CAMERA_EASE +
          360) %
        360;

      const center = immersive
        ? positionAt(geo, Math.min(1, t + IMMERSIVE_LOOKAHEAD))
        : pos;
      map.jumpTo({
        center,
        bearing: camBearingRef.current,
        pitch: camPitchRef.current,
        zoom: camZoomRef.current,
      });

      cbRef.current.onJourneyProgress?.(t);
      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        animRef.current = null;
        cbRef.current.onJourneyEnd?.();
      }
    };
    animRef.current = requestAnimationFrame(step);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = null;
    };
  }, [ready, journeying]);

  return (
    <div className="proof-map-shell">
      <div ref={containerRef} className="proof-map" aria-label="Live route map" />
      {!ready && !error ? (
        <div className="proof-map-status" role="status">
          Loading live map…
        </div>
      ) : null}
      {error ? (
        <div className="proof-map-status is-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
