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
      })
      .catch((error) => {
        console.error("SW registration failed:", error);
      });
  });
}
