export function normalizeStationName(value: string) {
  return value
    .toLowerCase()
    .replace(/underground station|rail station|station/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
