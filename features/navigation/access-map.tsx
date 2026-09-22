"use client";

import { useEffect, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker,
} from "maplibre-gl";
import type {
  Coordinate,
  Incident,
  SelectionMode,
  Station,
  StreetRoute,
} from "@/features/navigation/types";

type AccessMapProps = {
  mode: "street" | "transit";
  stations: Station[];
  incidents: Incident[];
  transitRoute: Station[];
  streetRoute: StreetRoute | null;
  origin: Coordinate | null;
  destination: Coordinate | null;
  userLocation: Coordinate | null;
  selectionMode: SelectionMode;
  onMapPick: (coordinate: Coordinate) => void;
  journeying?: boolean;
  speed?: number;
  immersive?: boolean;
  onJourneyProgress?: (fraction: number) => void;
  onJourneyEnd?: () => void;
  guidanceFocus?: Coordinate | null;
};

const JOURNEY_BASE_SECONDS = 32;
const JOURNEY_FOLLOW_ZOOM = 15;
const JOURNEY_IMMERSIVE_PITCH = 68;
const JOURNEY_IMMERSIVE_ZOOM = 17;
const JOURNEY_LOOKAHEAD = 0.04;
const JOURNEY_EASE = 0.1;

type JourneyGeo = {
  coords: Array<[number, number]>;
  cum: number[];
  total: number;
};

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
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

function buildJourneyGeo(coords: Array<[number, number]>): JourneyGeo {
  const cum = [0];
  for (let i = 1; i < coords.length; i += 1) {
    cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  }
  return { coords, cum, total: cum[cum.length - 1] ?? 0 };
}

function journeySegment(geo: JourneyGeo, t: number) {
  const d = Math.min(Math.max(t, 0), 1) * geo.total;
  let i = 1;
  while (i < geo.cum.length && geo.cum[i] < d) i += 1;
  if (i >= geo.coords.length) i = geo.coords.length - 1;
  const segStart = geo.cum[i - 1];
  const segEnd = geo.cum[i];
  const f = segEnd > segStart ? (d - segStart) / (segEnd - segStart) : 0;
  return { a: geo.coords[i - 1], b: geo.coords[i], f };
}

function journeyPosition(geo: JourneyGeo, t: number): [number, number] {
  if (geo.coords.length === 1) return geo.coords[0];
  const { a, b, f } = journeySegment(geo, t);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

function journeyBearing(geo: JourneyGeo, t: number) {
  if (geo.coords.length < 2) return 0;
  const { a, b } = journeySegment(geo, t);
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

function wheelchairElement() {
  const el = document.createElement("div");
  el.className = "nav-wheelchair";
  const ring = document.createElement("span");
  ring.className = "nav-wheelchair-ring";
  const dot = document.createElement("span");
  dot.className = "nav-wheelchair-dot";
  dot.textContent = "♿";
  el.append(ring, dot);
  return el;
}

function routeData(coordinates: Coordinate[]) {
  if (coordinates.length < 2) {
    return {
      type: "FeatureCollection" as const,
      features: [],
    };
  }

  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: coordinates.map((coordinate) => [
        coordinate.longitude,
        coordinate.latitude,
      ]),
    },
  };
}

function createMarkerElement(className: string, label: string, text?: string) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.setAttribute("aria-label", label);
  const dot = document.createElement("span");
  element.append(dot);

  if (text) {
    const strong = document.createElement("strong");
    strong.textContent = text;
    element.append(strong);
  }

  return element;
}

function createPopupContent(title: string, description: string) {
  const content = document.createElement("div");
  content.className = "map-popup";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const detail = document.createElement("span");
  detail.textContent = description;
  content.append(heading, detail);
  return content;
}

export function AccessMap({
  mode,
  stations,
  incidents,
  transitRoute,
  streetRoute,
  origin,
  destination,
  userLocation,
  selectionMode,
  onMapPick,
  journeying = false,
  speed = 2,
  immersive = false,
  onJourneyProgress,
  onJourneyEnd,
  guidanceFocus = null,
}: AccessMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const lastMapPickAtRef = useRef(0);
  const selectionModeRef = useRef(selectionMode);
  const onMapPickRef = useRef(onMapPick);
  const animRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const lastTsRef = useRef(0);
  const camZoomRef = useRef(JOURNEY_FOLLOW_ZOOM);
  const camPitchRef = useRef(0);
  const camBearingRef = useRef(0);
  const wheelchairRef = useRef<Marker | null>(null);
  const guidanceMarkerRef = useRef<Marker | null>(null);
  const journeyRef = useRef({ mode, transitRoute, streetRoute, speed, immersive });
  const journeyCbRef = useRef({ onJourneyProgress, onJourneyEnd });
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    selectionModeRef.current = selectionMode;
    onMapPickRef.current = onMapPick;
  }, [onMapPick, selectionMode]);

  useEffect(() => {
    journeyRef.current = { mode, transitRoute, streetRoute, speed, immersive };
    journeyCbRef.current = { onJourneyProgress, onJourneyEnd };
  }, [
    mode,
    transitRoute,
    streetRoute,
    speed,
    immersive,
    onJourneyProgress,
    onJourneyEnd,
  ]);

  useEffect(() => {
    let disposed = false;

    async function createMap() {
      if (!containerRef.current || mapRef.current) {
        return;
      }

      try {
        const maplibre = await import("maplibre-gl");

        if (disposed || !containerRef.current) {
          return;
        }

        maplibre.setWorkerUrl("/maplibre-gl-worker.mjs");
        maplibreRef.current = maplibre;
        const tileUrl =
          process.env.NEXT_PUBLIC_MAP_TILE_URL ??
          "https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png";
        const map = new maplibre.Map({
          container: containerRef.current,
          center: [-0.116, 51.51],
          zoom: 12.3,
          pitch: 0,
          bearing: 0,
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
            layers: [
              {
                id: "streets",
                type: "raster",
                source: "streets",
              },
            ],
          },
        });

        map.addControl(
          new maplibre.NavigationControl({ showCompass: false }),
          "bottom-right",
        );
        map.addControl(new maplibre.ScaleControl({ unit: "metric" }), "bottom-left");
        map.addControl(
          new maplibre.AttributionControl({
            compact: false,
            customAttribution:
              '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a> · <a href="https://www.hotosm.org/" target="_blank">HOT tiles</a>',
          }),
          "bottom-right",
        );
        map.on("click", (event) => {
          if (!selectionModeRef.current) {
            return;
          }

          const now = performance.now();

          if (now - lastMapPickAtRef.current < 500) {
            return;
          }

          lastMapPickAtRef.current = now;

          onMapPickRef.current({
            latitude: event.lngLat.lat,
            longitude: event.lngLat.lng,
          });
        });
        map.on("load", () => {
          map.addSource("street-route", {
            type: "geojson",
            data: routeData([]),
          });
          map.addLayer({
            id: "street-route-halo",
            type: "line",
            source: "street-route",
            paint: {
              "line-color": "#111111",
              "line-width": 9,
              "line-opacity": 0.92,
            },
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
          });
          map.addLayer({
            id: "street-route-line",
            type: "line",
            source: "street-route",
            paint: {
              "line-color": "#b9f227",
              "line-width": 5,
            },
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
          });
          map.addSource("transit-route", {
            type: "geojson",
            data: routeData([]),
          });
          map.addLayer({
            id: "transit-route-halo",
            type: "line",
            source: "transit-route",
            paint: {
              "line-color": "#111111",
              "line-width": 9,
              "line-opacity": 0.92,
            },
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
          });
          map.addLayer({
            id: "transit-route-line",
            type: "line",
            source: "transit-route",
            paint: {
              "line-color": "#b9f227",
              "line-width": 5,
            },
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
          });
          setMapReady(true);
        });
        mapRef.current = map;
      } catch (caught) {
        setMapError(
          caught instanceof Error ? caught.message : "The map could not load.",
        );
      }
    }

    void createMap();

    return () => {
      disposed = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      maplibreRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !containerRef.current) return;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    map.resize();
    return () => observer.disconnect();
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!mapReady || !map || !maplibre) return;

    if (!guidanceFocus || journeying) {
      guidanceMarkerRef.current?.remove();
      guidanceMarkerRef.current = null;
      return;
    }

    const lngLat: [number, number] = [
      guidanceFocus.longitude,
      guidanceFocus.latitude,
    ];
    if (!guidanceMarkerRef.current) {
      const element = document.createElement("div");
      element.className = "nav-guidance-focus";
      guidanceMarkerRef.current = new maplibre.Marker({
        element,
        anchor: "center",
      })
        .setLngLat(lngLat)
        .addTo(map);
    } else {
      guidanceMarkerRef.current.setLngLat(lngLat);
    }

    map.easeTo({
      center: lngLat,
      zoom: Math.max(map.getZoom(), 14.5),
      pitch: 0,
      bearing: 0,
      duration: 700,
    });
  }, [mapReady, guidanceFocus, journeying]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    map.getCanvas().style.cursor = selectionMode ? "crosshair" : "grab";
  }, [mapReady, selectionMode]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    const streetSource = map.getSource("street-route") as GeoJSONSource;
    const transitSource = map.getSource("transit-route") as GeoJSONSource;
    streetSource.setData(
      routeData(mode === "street" ? streetRoute?.geometry ?? [] : []),
    );
    transitSource.setData(
      routeData(mode === "transit" ? transitRoute : []),
    );
  }, [mapReady, mode, streetRoute, transitRoute]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;

    if (!mapReady || !map || !maplibre) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (mode === "transit") {
      const routeStationIds = new Set(transitRoute.map((station) => station.id));
      const incidentByStation = new Map(
        incidents.map((incident) => [incident.stationId, incident]),
      );

      for (const station of stations) {
        const incident = incidentByStation.get(station.id);
        const classes = [
          "station-map-marker",
          routeStationIds.has(station.id) ? "is-route" : "",
          incident ? "has-incident" : "",
          incident?.severity === "route-blocking" ? "is-blocking" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const element = createMarkerElement(
          classes,
          incident ? `${station.name}: ${incident.title}` : station.name,
          station.name,
        );
        const popup = new maplibre.Popup({
          offset: 18,
          closeButton: false,
        }).setDOMContent(
          createPopupContent(
            station.name,
            incident?.title ?? "Step-free station",
          ),
        );
        markersRef.current.push(
          new maplibre.Marker({ element, anchor: "center" })
            .setLngLat([station.longitude, station.latitude])
            .setPopup(popup)
            .addTo(map),
        );
      }
    }

    const locationMarkers: Array<{
      coordinate: Coordinate | null;
      className: string;
      label: string;
    }> = [
      { coordinate: origin, className: "map-point-marker is-origin", label: "Route start" },
      {
        coordinate: destination,
        className: "map-point-marker is-destination",
        label: "Route destination",
      },
      {
        coordinate: userLocation,
        className: "user-map-marker",
        label: "Your current location",
      },
    ];

    for (const item of locationMarkers) {
      if (!item.coordinate) {
        continue;
      }

      const element = createMarkerElement(item.className, item.label);
      markersRef.current.push(
        new maplibre.Marker({ element, anchor: "center" })
          .setLngLat([item.coordinate.longitude, item.coordinate.latitude])
          .addTo(map),
      );
    }
  }, [
    destination,
    incidents,
    mapReady,
    mode,
    origin,
    stations,
    transitRoute,
    userLocation,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;

    if (!mapReady || !map || !maplibre) {
      return;
    }

    const activeCoordinates =
      mode === "street" && streetRoute?.geometry.length
        ? streetRoute.geometry
        : mode === "transit" && transitRoute.length
          ? transitRoute
          : [origin, destination].filter(
              (coordinate): coordinate is Coordinate => coordinate !== null,
            );

    if (activeCoordinates.length > 1) {
      const first = activeCoordinates[0];
      const bounds = new maplibre.LngLatBounds(
        [first.longitude, first.latitude],
        [first.longitude, first.latitude],
      );

      for (const coordinate of activeCoordinates.slice(1)) {
        bounds.extend([coordinate.longitude, coordinate.latitude]);
      }

      map.fitBounds(bounds, {
        padding:
          window.innerWidth < 760
            ? { top: 110, right: 36, bottom: 390, left: 36 }
            : { top: 100, right: 70, bottom: 70, left: 470 },
        duration: 700,
        maxZoom: 17,
      });
      return;
    }

    const focus = activeCoordinates[0] ?? userLocation;

    if (focus) {
      map.easeTo({
        center: [focus.longitude, focus.latitude],
        zoom: 15,
        duration: 700,
      });
    }
  }, [
    destination,
    mapReady,
    mode,
    origin,
    streetRoute,
    transitRoute,
    userLocation,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!mapReady || !map || !maplibre) return;

    const activeCoords: Array<[number, number]> =
      journeyRef.current.mode === "transit"
        ? journeyRef.current.transitRoute.map(
            (s) => [s.longitude, s.latitude] as [number, number],
          )
        : (journeyRef.current.streetRoute?.geometry ?? []).map(
            (c) => [c.longitude, c.latitude] as [number, number],
          );

    if (!journeying) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = null;
      progressRef.current = 0;
      wheelchairRef.current?.remove();
      wheelchairRef.current = null;
      if (activeCoords.length > 1) {
        map.jumpTo({ pitch: 0, bearing: 0 });
        const bounds = new maplibre.LngLatBounds(
          activeCoords[0],
          activeCoords[0],
        );
        for (const c of activeCoords.slice(1)) bounds.extend(c);
        map.fitBounds(bounds, {
          padding:
            window.innerWidth < 760
              ? { top: 110, right: 36, bottom: 390, left: 36 }
              : { top: 100, right: 70, bottom: 70, left: 470 },
          duration: 700,
          maxZoom: 16,
        });
      }
      return;
    }

    if (activeCoords.length < 2) return;
    const geo = buildJourneyGeo(activeCoords);
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
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = Math.min(ts - lastTsRef.current, 64);
      lastTsRef.current = ts;
      progressRef.current = Math.min(
        1,
        progressRef.current +
          (dt / 1000 / JOURNEY_BASE_SECONDS) * journeyRef.current.speed,
      );
      const t = progressRef.current;
      const pos = journeyPosition(geo, t);
      marker.setLngLat(pos);

      const imm = journeyRef.current.immersive;
      const targetBearing = imm ? journeyBearing(geo, t) : 0;
      const targetPitch = imm ? JOURNEY_IMMERSIVE_PITCH : 0;
      const targetZoom = imm ? JOURNEY_IMMERSIVE_ZOOM : JOURNEY_FOLLOW_ZOOM;
      camPitchRef.current = lerp(camPitchRef.current, targetPitch, JOURNEY_EASE);
      camZoomRef.current = lerp(camZoomRef.current, targetZoom, JOURNEY_EASE);
      camBearingRef.current =
        (camBearingRef.current +
          angleDelta(camBearingRef.current, targetBearing) * JOURNEY_EASE +
          360) %
        360;
      const center = imm
        ? journeyPosition(geo, Math.min(1, t + JOURNEY_LOOKAHEAD))
        : pos;
      map.jumpTo({
        center,
        bearing: camBearingRef.current,
        pitch: camPitchRef.current,
        zoom: camZoomRef.current,
      });

      journeyCbRef.current.onJourneyProgress?.(t);
      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        animRef.current = null;
        journeyCbRef.current.onJourneyEnd?.();
      }
    };
    animRef.current = requestAnimationFrame(step);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = null;
    };
  }, [mapReady, journeying]);

  return (
    <div className="access-map-shell">
      <div
        ref={containerRef}
        className="access-map"
        aria-label="Interactive route map"
      />
      {selectionMode ? (
        <div className="map-selection-prompt" role="status">
          Click the map to set your {selectionMode === "origin" ? "start" : "destination"}
        </div>
      ) : null}
      {!mapReady && !mapError ? (
        <div className="map-loading" role="status">Loading map</div>
      ) : null}
      {mapError ? <div className="map-error" role="alert">{mapError}</div> : null}
    </div>
  );
}
