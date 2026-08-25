export const NAVER_READY_CALLBACK = "__parkpickNaverReady";

const NAVER_SCRIPT_ID = "naver-map-sdk";
const NAVER_SDK_SRC = "https://oapi.map.naver.com/openapi/v3/maps.js";
const DEFAULT_TIMEOUT_MS = 8_000;
const READINESS_POLL_MS = 10;

declare global {
  interface Window {
    __parkpickNaverReady?: () => void;
  }
}

// Shared module-level in-flight loader. The NAVER SDK script ID and the
// readiness/auth-failure callbacks are global singletons, so concurrent
// callers must share a single load regardless of the API key they pass;
// otherwise a second call with a different key would clobber the first
// caller's script and callbacks while the first load is still pending.
// Cleared on settle so a later retry can append a fresh script; successful
// loads remain reusable through the global `hasNaverMaps()` check at the
// top of `loadNaverMapSdk`.
let inFlight: Promise<void> | undefined;

function hasNaverMaps(): boolean {
  return Boolean(window.naver?.maps);
}

function removeStaleScript(): void {
  const existing = document.getElementById(NAVER_SCRIPT_ID);
  if (existing && existing.parentElement) {
    existing.parentElement.removeChild(existing);
  }
}

export function loadNaverMapSdk(key: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<void> {
  if (hasNaverMaps()) {
    return Promise.resolve();
  }

  const existing = inFlight;
  if (existing) {
    return existing;
  }

  removeStaleScript();

  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    let pollTimer: number | undefined;
    const cleanup = (): void => {
      if (pollTimer !== undefined) {
        clearTimeout(pollTimer);
        pollTimer = undefined;
      }
      if (window[NAVER_READY_CALLBACK] === onReady) {
        delete window[NAVER_READY_CALLBACK];
      }
      if (window.navermap_authFailure === onAuthFailure) {
        delete window.navermap_authFailure;
      }
    };
    const settle = (action: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      action();
    };

    const onReady = (): void => {
      if (hasNaverMaps()) {
        settle(resolve);
        return;
      }
      // The official NAVER SDK fires the readiness callback just before it
      // assigns `window.naver.maps`. Rejecting synchronously here would race
      // against the SDK's own assignment and put callers in error state
      // even though the global appears within milliseconds. Instead we
      // yield back to the SDK and poll for the global on a modest interval.
      // The poll is bounded solely by the existing 8s `timer` above, which
      // rejects if the global never appears; `cleanup` (called from
      // `settle`) clears `pollTimer` so we never leak intervals after the
      // promise has settled.
      const poll = (): void => {
        if (settled) return;
        if (hasNaverMaps()) {
          settle(resolve);
          return;
        }
        pollTimer = window.setTimeout(poll, READINESS_POLL_MS);
      };
      poll();
    };
    const onAuthFailure = (): void => {
      settle(() => reject(new Error("NAVER map SDK authentication failed")));
    };

    window[NAVER_READY_CALLBACK] = onReady;
    window.navermap_authFailure = onAuthFailure;

    const timer = window.setTimeout(() => {
      settle(() => reject(new Error(`NAVER map SDK load timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    const script = document.createElement("script");
    script.id = NAVER_SCRIPT_ID;
    script.async = true;
    script.src = `${NAVER_SDK_SRC}?ncpKeyId=${encodeURIComponent(key)}&callback=${NAVER_READY_CALLBACK}`;
    script.addEventListener("error", () => {
      settle(() => reject(new Error("NAVER map SDK script load failed")));
    });
    document.head.appendChild(script);
  });

  inFlight = promise;
  // Clear the cached promise once it settles. On rejection this lets a later
  // retry append a fresh script; on success the `hasNaverMaps()` global check
  // at the top of `loadNaverMapSdk` continues to handle reuse, so we do not
  // need to keep the resolved promise cached. Swallow the rejection here so
  // this internal observer does not surface as an unhandled rejection.
  promise.then(
    () => {
      if (inFlight === promise) {
        inFlight = undefined;
      }
    },
    () => {
      if (inFlight === promise) {
        inFlight = undefined;
      }
    }
  );

  return promise;
}
