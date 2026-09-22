"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Coordinate } from "@/features/navigation/types";

type LocationStatus = "idle" | "requesting" | "ready" | "denied";

export function useLiveLocation() {
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [tracking, setTracking] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const acceptPosition = useCallback((position: GeolocationPosition) => {
    setCoordinate({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
    setAccuracyMeters(position.coords.accuracy);
    setStatus("ready");
    setMessage("");
  }, []);

  const rejectPosition = useCallback((error: GeolocationPositionError) => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setTracking(false);
    }
    setStatus("denied");
    setMessage(
      error.code === error.PERMISSION_DENIED
        ? "Location permission is off. Choose a point on the map instead."
        : "Your location is unavailable. Choose a point on the map instead.",
    );
  }, []);

  const requestLocation = useCallback(
    (onSuccess?: (coordinate: Coordinate) => void) => {
      if (!("geolocation" in navigator)) {
        setStatus("denied");
        setMessage("This browser does not provide location access.");
        return;
      }

      setStatus("requesting");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          acceptPosition(position);
          onSuccess?.({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        rejectPosition,
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
      );
    },
    [acceptPosition, rejectPosition],
  );

  const startTracking = useCallback(() => {
    if (!("geolocation" in navigator) || watchIdRef.current !== null) {
      return;
    }

    setStatus("requesting");
    watchIdRef.current = navigator.geolocation.watchPosition(
      acceptPosition,
      rejectPosition,
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );
    setTracking(true);
  }, [acceptPosition, rejectPosition]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setTracking(false);
    }
  }, []);

  useEffect(() => stopTracking, [stopTracking]);

  return {
    status,
    coordinate,
    accuracyMeters,
    message,
    requestLocation,
    startTracking,
    stopTracking,
    tracking,
  };
}
