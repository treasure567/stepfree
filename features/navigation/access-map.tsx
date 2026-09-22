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
};

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
}: AccessMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const lastMapPickAtRef = useRef(0);
  const selectionModeRef = useRef(selectionMode);
  const onMapPickRef = useRef(onMapPick);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    selectionModeRef.current = selectionMode;
    onMapPickRef.current = onMapPick;
  }, [onMapPick, selectionMode]);

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
