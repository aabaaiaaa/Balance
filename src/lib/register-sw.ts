type SWUpdateCallback = (registration: ServiceWorkerRegistration) => void;

let onUpdateCallback: SWUpdateCallback | null = null;

/** Register a callback to be notified when a new service worker is waiting. */
export function onServiceWorkerUpdate(cb: SWUpdateCallback) {
  onUpdateCallback = cb;
}

/** Tell a waiting service worker to take over. Reloads the page afterwards. */
export function applyServiceWorkerUpdate(registration: ServiceWorkerRegistration) {
  const waiting = registration.waiting;
  if (!waiting) return;

  waiting.addEventListener("statechange", () => {
    if (waiting.state === "activated") {
      window.location.reload();
    }
  });

  waiting.postMessage({ type: "SKIP_WAITING" });
}

/**
 * Manually check for a service worker update.
 * Returns true if an update was found (waiting or installing), false otherwise.
 */
export async function checkForServiceWorkerUpdate(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;

  await registration.update();

  // An update may already be waiting from a previous check.
  if (registration.waiting) {
    onUpdateCallback?.(registration);
    return true;
  }

  // After registration.update(), the browser may still be downloading the
  // new SW.  `installing` might already be set, or the `updatefound` event
  // may fire shortly.  Wait for either case with a single helper.
  return waitForUpdate(registration);
}

/**
 * Wait for a service worker update to finish installing.
 * Handles both the case where `installing` is already set and the case
 * where `updatefound` hasn't fired yet (race after `registration.update()`).
 * Times out after 10 seconds and returns false if no update materialises.
 */
function waitForUpdate(registration: ServiceWorkerRegistration): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        registration.removeEventListener("updatefound", onUpdateFound);
        resolve(false);
      }
    }, 10_000);

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      registration.removeEventListener("updatefound", onUpdateFound);
      onUpdateCallback?.(registration);
      resolve(true);
    }

    function waitForInstalled(sw: ServiceWorker) {
      if (sw.state === "installed") {
        finish();
        return;
      }
      sw.addEventListener("statechange", () => {
        if (sw.state === "installed") {
          finish();
        }
      });
    }

    function onUpdateFound() {
      const installing = registration.installing;
      if (installing) {
        waitForInstalled(installing);
      }
    }

    // If already installing, wait for it directly.
    if (registration.installing) {
      waitForInstalled(registration.installing);
      return;
    }

    // Otherwise wait for the `updatefound` event — the browser fires this
    // asynchronously after `registration.update()` discovers a new SW.
    registration.addEventListener("updatefound", onUpdateFound);
  });
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${basePath}/sw.js`)
      .then((registration) => {
        console.log("SW registered:", registration.scope);

        // If a new SW is already waiting (e.g. page was loaded while an
        // update was pending), notify immediately.
        if (registration.waiting) {
          onUpdateCallback?.(registration);
          return;
        }

        // Listen for new service workers that finish installing while the
        // page is open.
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              // A new version is available but not yet active.
              onUpdateCallback?.(registration);
            }
          });
        });

        // Periodically check for updates (every 60 minutes).
        setInterval(() => {
          registration.update().catch(() => {
            // Silently ignore — we may be offline.
          });
        }, 60 * 60 * 1000);
      })
      .catch((error) => {
        console.error("SW registration failed:", error);
      });
  });
}
