import { afterEach, describe, expect, it } from "vitest";
import { loadNaverMapSdk, NAVER_READY_CALLBACK } from "@/lib/maps/naver-sdk";

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
  delete window.naver;
  delete window.navermap_authFailure;
  delete (window as unknown as Record<string, unknown>)[NAVER_READY_CALLBACK];
});

function getAppendedScript(): HTMLScriptElement {
  const script = document.getElementById("naver-map-sdk");
  if (!(script instanceof HTMLScriptElement)) {
    throw new Error("naver-map-sdk script element was not appended");
  }
  return script;
}

describe("loadNaverMapSdk", () => {
  it("resolves after the callback fires and rejects on auth failure", async () => {
    const first = loadNaverMapSdk("test-key", 100);

    const script = getAppendedScript();
    expect(script.src).toContain("ncpKeyId=test-key");
    expect(script.src).toContain(`callback=${NAVER_READY_CALLBACK}`);

    window.naver = { maps: {} } as unknown as typeof window.naver;
    const callback = (window as unknown as Record<string, unknown>)[NAVER_READY_CALLBACK];
    expect(typeof callback).toBe("function");
    (callback as () => void)();

    await expect(first).resolves.toBeUndefined();

    document.head.replaceChildren();
    delete window.naver;
    delete window.navermap_authFailure;
    delete (window as unknown as Record<string, unknown>)[NAVER_READY_CALLBACK];

    const second = loadNaverMapSdk("test-key", 100);
    getAppendedScript();

    expect(typeof window.navermap_authFailure).toBe("function");
    window.navermap_authFailure!();

    await expect(second).rejects.toBeInstanceOf(Error);
  });

  it("shares one in-flight load across keys and waits for the SDK global after the callback", async () => {
    // The NAVER SDK script ID and the readiness/auth-failure callbacks are
    // global singletons, so concurrent callers must share a single load
    // regardless of the API key they pass. Otherwise a second call with a
    // different key would clobber the first caller's script and callbacks
    // while the first load is still pending.
    const first = loadNaverMapSdk("share-key", 1000);
    const second = loadNaverMapSdk("other-key", 1000);

    // Concurrent calls with different keys must still share a single Promise
    // and a single appended script; no first caller should be orphaned.
    expect(second).toBe(first);
    const script = getAppendedScript();
    expect(document.querySelectorAll(`#${"naver-map-sdk"}`).length).toBe(1);

    // The real NAVER SDK fires the readiness callback just before it
    // assigns `window.naver.maps`. We simulate that race here: the callback
    // runs first, the global is populated on a later timer tick. The
    // loader must NOT reject on the synchronous callback; it must yield
    // back to the SDK so window.naver.maps can be wired, and then resolve
    // both shared callers from a single script load.
    const callback = (window as unknown as Record<string, unknown>)[NAVER_READY_CALLBACK];
    expect(typeof callback).toBe("function");
    (callback as () => void)();

    // At this point the SDK has not yet assigned window.naver.maps, but
    // neither caller should be settled yet (the loader yields to a later
    // tick to give the SDK a chance to wire the global).
    let firstSettled = false;
    let secondSettled = false;
    void first.then(
      () => {
        firstSettled = true;
      },
      () => {
        firstSettled = true;
      }
    );
    void second.then(
      () => {
        secondSettled = true;
      },
      () => {
        secondSettled = true;
      }
    );
    await new Promise<void>((resolve) => window.setTimeout(resolve, 10));
    expect(firstSettled).toBe(false);
    expect(secondSettled).toBe(false);

    // Now the SDK assigns window.naver.maps on a later tick; both shared
    // callers must resolve from the single in-flight Promise.
    window.naver = { maps: {} } as unknown as typeof window.naver;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 10));
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();

    document.head.replaceChildren();
    delete window.naver;

    const rejected = loadNaverMapSdk("share-key", 100);
    const rejectedScript = getAppendedScript();
    expect(rejectedScript).not.toBe(script);
    expect(typeof window.navermap_authFailure).toBe("function");
    window.navermap_authFailure!();
    await expect(rejected).rejects.toBeInstanceOf(Error);

    document.head.replaceChildren();

    // After rejection the cached in-flight promise is cleared, so a later
    // retry for the same key appends a fresh script.
    const retry = loadNaverMapSdk("share-key", 100);
    const retryScript = getAppendedScript();
    expect(retryScript).not.toBe(rejectedScript);
    expect(retryScript.src).toContain("ncpKeyId=share-key");
    expect(retry).not.toBe(rejected);
    window.naver = { maps: {} } as unknown as typeof window.naver;
    ((window as unknown as Record<string, unknown>)[NAVER_READY_CALLBACK] as () => void)();
    await expect(retry).resolves.toBeUndefined();
  });
});
