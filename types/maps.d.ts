export {};

declare global {
  interface Window {
    kakao?: {
      maps?: {
        load: (callback: () => void) => void;
        LatLng: new (latitude: number, longitude: number) => unknown;
        LatLngBounds: new () => { extend: (coordinate: unknown) => void };
        Map: new (container: HTMLElement, options: Record<string, unknown>) => { setBounds: (bounds: unknown) => void; relayout: () => void };
        CustomOverlay: new (options: Record<string, unknown>) => { setMap: (map: unknown) => void };
      };
    };
    Kakao?: {
      init: (key: string) => void;
      isInitialized: () => boolean;
      Navi: { start: (options: { name: string; x: number; y: number; coordType: "wgs84" }) => void };
    };
    naver?: {
      maps: {
        LatLng: new (latitude: number, longitude: number) => unknown;
        LatLngBounds: new (southwest: unknown, northeast: unknown) => { extend: (coordinate: unknown) => void };
        Map: new (
          container: HTMLElement,
          options: Record<string, unknown>,
        ) => {
          fitBounds: (
            bounds: unknown,
            options?: {
              top?: number;
              right?: number;
              bottom?: number;
              left?: number;
              maxZoom?: number;
            },
          ) => void;
          setCenter: (coordinate: unknown) => void;
          setZoom: (zoom: number) => void;
        };
        Marker: new (options: Record<string, unknown>) => unknown;
        Event: { addListener: (target: unknown, event: string, listener: () => void) => void };
      };
    };
    navermap_authFailure?: () => void;
    __parkpickNaverReady?: () => void;
  }
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  }
}
