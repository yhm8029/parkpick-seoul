import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useGeolocation } from "@/hooks/use-geolocation";

afterEach(() => vi.restoreAllMocks());

it("keeps granted status after a successful position update", async () => {
  const permission = {
    state: "granted",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as PermissionStatus;
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: vi.fn(async () => permission) },
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success: PositionCallback) =>
        success({
          coords: { latitude: 37.5, longitude: 127, accuracy: 10 },
          timestamp: Date.now(),
        } as GeolocationPosition),
      ),
    },
  });

  const { result } = renderHook(() => useGeolocation());
  await waitFor(() => expect(result.current.status).toBe("idle"));
  act(() => result.current.requestPosition());
  await waitFor(() => expect(result.current.value?.accuracyMeters).toBe(10));

  expect(result.current.status).toBe("granted");
});
