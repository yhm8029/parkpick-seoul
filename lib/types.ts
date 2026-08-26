export type MapProvider = "KAKAO" | "NAVER" | "PREVIEW";
export type RecommendationProfile = "BALANCED" | "CHEAP" | "NEAR" | "CERTAIN";
export type DataMode = "LIVE" | "FALLBACK" | "DEMO";
export type RealtimeStatus = "LIVE" | "DELAYED" | "STALE" | "OFFLINE" | "UNKNOWN";
export type AvailabilityRisk = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface Place extends Coordinate {
  id: string;
  name: string;
  address: string;
  category?: string;
  source: "KAKAO" | "NAVER" | "DEMO" | "GPS" | "MANUAL";
}

export interface FeeRule {
  isFree: boolean;
  baseMinutes?: number | null;
  baseFee?: number | null;
  additionalMinutes?: number | null;
  additionalFee?: number | null;
  dailyMaximumFee?: number | null;
}

export interface ParkingLot extends Coordinate {
  id: string;
  sourceId: string;
  source: "SEOUL_OPEN_DATA" | "SEOUL_PARKING_PORTAL" | "DEMO";
  name: string;
  address: string;
  capacity: number;
  occupiedSpaces?: number | null;
  availableSpaces?: number | null;
  realtimeUpdatedAt?: string | null;
  realtimeSupported: boolean;
  feeRule: FeeRule;
  phone?: string | null;
  operatingLabel?: string | null;
  isOpen?: boolean | null;
  trendPer30Minutes?: number;
}

export interface RouteCongestionSection {
  pointIndex: number;
  pointCount: number;
  congestion: 0 | 1 | 2 | 3;
}

export interface RouteEstimate {
  parkingId: string;
  driveMinutes: number;
  driveDistanceMeters: number;
  source: "NAVER_DIRECTIONS" | "KAKAO_MOBILITY" | "ESTIMATE";
  path?: Coordinate[];
  congestionSections?: RouteCongestionSection[];
}

export interface RecommendationRequestBase {
  origin: Coordinate;
  destination: Place;
  arrivalAt: string;
  durationMinutes: number;
  profile: RecommendationProfile;
}

export type DistanceSelection =
  | { distanceMode: "AUTO" }
  | { distanceMode: "MANUAL"; maxDistanceMeters: number };

export type RecommendationRequest = RecommendationRequestBase & DistanceSelection;

export interface ParkingRecommendation extends ParkingLot {
  rank: number;
  score: number;
  driveMinutes: number;
  driveDistanceMeters: number;
  routeSource: RouteEstimate["source"];
  routePath?: Coordinate[];
  routeCongestionSections?: RouteCongestionSection[];
  walkMinutes: number;
  walkDistanceMeters: number;
  estimatedFee: number | null;
  predictedAvailable: { min: number; max: number; confidence: ConfidenceLevel } | null;
  availabilityRisk: AvailabilityRisk;
  realtimeStatus: RealtimeStatus;
  dataAgeMinutes: number | null;
  reasons: string[];
  warnings: string[];
  scoreBreakdown: {
    availability: number;
    walk: number;
    cost: number;
    drive: number;
    reliability: number;
  };
}

export interface RecommendationResponse {
  generatedAt: string;
  dataMode: DataMode;
  dataNotice: string;
  destination: Place;
  distanceMode: "AUTO" | "MANUAL";
  effectiveDistanceMeters: number | null;
  recommendations: ParkingRecommendation[];
}
