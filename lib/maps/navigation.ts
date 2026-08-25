export interface NamedCoordinate {
  name: string;
  latitude: number;
  longitude: number;
}

const WEB_MERCATOR_LAT_LIMIT = 85.0511287798066;
const EARTH_RADIUS = 6_378_137;

export function clampLatitude(latitude: number): number {
  if (!Number.isFinite(latitude)) return 0;
  if (latitude > WEB_MERCATOR_LAT_LIMIT) return WEB_MERCATOR_LAT_LIMIT;
  if (latitude < -WEB_MERCATOR_LAT_LIMIT) return -WEB_MERCATOR_LAT_LIMIT;
  return latitude;
}

export function toWebMercator(point: NamedCoordinate): { x: number; y: number } {
  const latRad = (clampLatitude(point.latitude) * Math.PI) / 180;
  const x = EARTH_RADIUS * ((point.longitude * Math.PI) / 180);
  const y = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return { x, y };
}

export function buildNaverAppNavigationUrl(origin: NamedCoordinate, destination: NamedCoordinate, appName: string): string {
  const params = new URLSearchParams({
    slat: String(origin.latitude),
    slng: String(origin.longitude),
    sname: origin.name,
    dlat: String(destination.latitude),
    dlng: String(destination.longitude),
    dname: destination.name,
    appname: appName
  });
  return `nmap://route/car?${params.toString()}`;
}

export function buildNaverAndroidIntentUrl(origin: NamedCoordinate, destination: NamedCoordinate, appName: string): string {
  const params = new URLSearchParams({
    slat: String(origin.latitude),
    slng: String(origin.longitude),
    sname: origin.name,
    dlat: String(destination.latitude),
    dlng: String(destination.longitude),
    dname: destination.name,
    appname: appName
  });
  const query = params.toString();
  return `intent://route/car?${query}#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end`;
}

export function buildNaverWebDirectionsUrl(origin: NamedCoordinate, destination: NamedCoordinate): string {
  const originMercator = toWebMercator(origin);
  const destinationMercator = toWebMercator(destination);
  const originSegment = `${originMercator.x},${originMercator.y},${encodeURIComponent(origin.name)},PLACE_POI`;
  const destinationSegment = `${destinationMercator.x},${destinationMercator.y},${encodeURIComponent(destination.name)},PLACE_POI`;
  return `https://map.naver.com/p/directions/${originSegment}/${destinationSegment}/-/car`;
}
