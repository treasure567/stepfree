import type { Coordinate } from "@/features/navigation/types";

export function distanceInMeters(left: Coordinate, right: Coordinate) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(left.latitude)) *
      Math.cos(radians(right.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function remainingRouteDistance(
  current: Coordinate,
  geometry: Coordinate[],
) {
  if (geometry.length === 0) {
    return 0;
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < geometry.length; index += 1) {
    const distance = distanceInMeters(current, geometry[index]);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  let routeDistance = nearestDistance;

  for (let index = nearestIndex; index < geometry.length - 1; index += 1) {
    routeDistance += distanceInMeters(geometry[index], geometry[index + 1]);
  }

  return Math.round(routeDistance);
}

export function formatDistance(meters: number) {
  if (meters < 1_000) {
    return `${Math.max(0, Math.round(meters / 10) * 10)} m`;
  }

  return `${(meters / 1_000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

export function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `${hours} hr ${remainingMinutes} min`
    : `${hours} hr`;
}

export function coordinateLabel(coordinate: Coordinate | null) {
  if (!coordinate) {
    return "Choose on map";
  }

  return `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
}
