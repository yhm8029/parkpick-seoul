import type { Coordinate } from "@/lib/types";

const EARTH_RADIUS = 6_371_000;
const radians = (degrees: number) => degrees * Math.PI / 180;

export function haversineDistanceMeters(a: Coordinate, b: Coordinate): number {
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const latA = radians(a.latitude);
  const latB = radians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

export function estimateWalkDistanceMeters(a: Coordinate, b: Coordinate): number {
  return Math.round(haversineDistanceMeters(a, b) * 1.25);
}

export function estimateWalkMinutes(distanceMeters: number): number {
  return Math.max(1, Math.ceil(distanceMeters / 75));
}

export function estimateDriveDistanceMeters(a: Coordinate, b: Coordinate): number {
  return Math.round(haversineDistanceMeters(a, b) * 1.35);
}

export function estimateDriveMinutes(distanceMeters: number): number {
  return Math.max(4, Math.ceil(distanceMeters / 360 + 3));
}
