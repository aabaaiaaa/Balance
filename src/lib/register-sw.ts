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

  if (registration.waiting) {
    onUpdateCallback?.(registration);
    return true;
  }

  // An update may still be installing — wait briefly for it to finish.
  if (registration.installing) {
    return new Promise<boolean>((resolve) => {
      const installing = registration.installing!;
      const timeout = setTimeout(() => resolve(false), 10_000);
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed") {
          clearTimeout(timeout);
          onUpdateCallback?.(registration);
          resolve(true);
        }
      });
    });
  }

  return false;
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
