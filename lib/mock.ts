import type { ParkingLot, Place } from "@/lib/types";

export const DEMO_PLACES: Place[] = [
  { id: "coex", name: "코엑스", address: "서울 강남구 영동대로 513", latitude: 37.5117, longitude: 127.0592, category: "문화·쇼핑", source: "DEMO" },
  { id: "gangnam", name: "강남역", address: "서울 강남구 강남대로 396", latitude: 37.4979, longitude: 127.0276, category: "교통", source: "DEMO" },
  { id: "seoul-station", name: "서울역", address: "서울 용산구 한강대로 405", latitude: 37.5547, longitude: 126.9707, category: "교통", source: "DEMO" },
  { id: "hyundai", name: "더현대 서울", address: "서울 영등포구 여의대로 108", latitude: 37.5259, longitude: 126.9284, category: "쇼핑", source: "DEMO" },
  { id: "national-theater", name: "국립극장", address: "서울 중구 장충단로 59", latitude: 37.5526, longitude: 127.0000, category: "공연장", source: "DEMO" },
  { id: "city-hall", name: "서울특별시청", address: "서울 중구 세종대로 110", latitude: 37.5665, longitude: 126.9780, category: "공공기관", source: "DEMO" }
];

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export function getDemoParkingLots(): ParkingLot[] {
  const fee = (baseFee: number, extraFee: number, dailyMaximumFee: number) => ({ isFree: false, baseMinutes: 10, baseFee, additionalMinutes: 10, additionalFee: extraFee, dailyMaximumFee });
  return [
    { id: "samseong-a", sourceId: "DEMO-001", source: "DEMO", name: "삼성동 공영주차장 A · 데모", address: "서울 강남구 삼성동", latitude: 37.5127, longitude: 127.0562, capacity: 180, occupiedSpaces: 142, availableSpaces: 38, realtimeUpdatedAt: ago(4), realtimeSupported: true, trendPer30Minutes: -7, feeRule: fee(800, 800, 28000), operatingLabel: "24시간 · 데모", isOpen: true },
    { id: "bongunsa", sourceId: "DEMO-002", source: "DEMO", name: "봉은사 인근 공영주차장 · 데모", address: "서울 강남구 봉은사로", latitude: 37.5144, longitude: 127.0608, capacity: 96, occupiedSpaces: 84, availableSpaces: 12, realtimeUpdatedAt: ago(8), realtimeSupported: true, trendPer30Minutes: -4, feeRule: fee(1000, 1000, 30000), operatingLabel: "06:00~24:00 · 데모", isOpen: true },
    { id: "yeongdong", sourceId: "DEMO-003", source: "DEMO", name: "영동대로 공영주차장 · 데모", address: "서울 강남구 영동대로", latitude: 37.5098, longitude: 127.0634, capacity: 240, occupiedSpaces: 191, availableSpaces: 49, realtimeUpdatedAt: ago(17), realtimeSupported: true, trendPer30Minutes: -9, feeRule: fee(800, 800, 24000), operatingLabel: "24시간 · 데모", isOpen: true },
    { id: "yeoksam", sourceId: "DEMO-004", source: "DEMO", name: "역삼문화공원 공영주차장 · 데모", address: "서울 강남구 역삼동", latitude: 37.5004, longitude: 127.0305, capacity: 247, occupiedSpaces: 207, availableSpaces: 40, realtimeUpdatedAt: ago(5), realtimeSupported: true, trendPer30Minutes: -5, feeRule: fee(600, 600, 26000), operatingLabel: "24시간 · 데모", isOpen: true },
    { id: "gangnam-road", sourceId: "DEMO-005", source: "DEMO", name: "강남대로 공영주차장 · 데모", address: "서울 강남구 강남대로", latitude: 37.4961, longitude: 127.0248, capacity: 110, occupiedSpaces: 104, availableSpaces: 6, realtimeUpdatedAt: ago(3), realtimeSupported: true, trendPer30Minutes: -3, feeRule: fee(1200, 1200, 36000), operatingLabel: "24시간 · 데모", isOpen: true },
    { id: "seoul-west", sourceId: "DEMO-006", source: "DEMO", name: "서울역 서부 공영주차장 · 데모", address: "서울 중구 봉래동", latitude: 37.5556, longitude: 126.9682, capacity: 202, occupiedSpaces: 166, availableSpaces: 36, realtimeUpdatedAt: ago(6), realtimeSupported: true, trendPer30Minutes: -2, feeRule: fee(1000, 1000, 30000), operatingLabel: "24시간 · 데모", isOpen: true },
    { id: "yeouido", sourceId: "DEMO-007", source: "DEMO", name: "여의도공원 공영주차장 · 데모", address: "서울 영등포구 여의도동", latitude: 37.5264, longitude: 126.9228, capacity: 320, occupiedSpaces: 248, availableSpaces: 72, realtimeUpdatedAt: ago(4), realtimeSupported: true, trendPer30Minutes: -6, feeRule: fee(1000, 1000, 25000), operatingLabel: "24시간 · 데모", isOpen: true },
    { id: "jangchung", sourceId: "DEMO-008", source: "DEMO", name: "장충동 공영주차장 · 데모", address: "서울 중구 장충동", latitude: 37.5541, longitude: 127.0035, capacity: 84, occupiedSpaces: 61, availableSpaces: 23, realtimeUpdatedAt: ago(7), realtimeSupported: true, trendPer30Minutes: -4, feeRule: fee(500, 500, 18000), operatingLabel: "07:00~23:00 · 데모", isOpen: true },
    { id: "cityhall", sourceId: "DEMO-009", source: "DEMO", name: "세종대로 공영주차장 · 데모", address: "서울 중구 세종대로", latitude: 37.5681, longitude: 126.9764, capacity: 260, occupiedSpaces: 205, availableSpaces: 55, realtimeUpdatedAt: ago(5), realtimeSupported: true, trendPer30Minutes: -8, feeRule: fee(860, 860, 30000), operatingLabel: "24시간 · 데모", isOpen: true }
  ];
}
