import { generateSW } from "workbox-build";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

async function buildSW() {
  const { count, size } = await generateSW({
    swDest: resolve(rootDir, "out/sw.js"),
    globDirectory: resolve(rootDir, "out"),
    globPatterns: [
      // Precache all static assets EXCEPT .txt files. The .txt files are
      // Next.js RSC payloads fetched during client-side navigation. They
      // must NOT be precached because when a new SW installs, it overwrites
      // them in the shared cache with new content that the still-running
      // old JS cannot parse — breaking client-side navigation until the
      // tab is closed and reopened. Instead, .txt files use runtime caching
      // (see runtimeCaching below).
      "**/*.{html,js,css,png,jpg,jpeg,svg,gif,ico,woff,woff2,ttf,eot,json,webmanifest,wasm}",
    ],
    // Do NOT use skipWaiting — we handle updates gracefully via the UI
    // by prompting the user when a new version is available.
    // clientsClaim is still used so that on first install, the SW takes
    // control immediately.
    skipWaiting: false,
    clientsClaim: true,
    // Increase the size limit for precaching (default 2MB)
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    // Prefix precache URLs with basePath so the service worker intercepts
    // requests at the correct paths when deployed to a subdirectory
    modifyURLPrefix: basePath ? { "": `${basePath}/` } : {},
    // Do NOT use navigateFallback. This is a multi-page static export where
    // each route has its own precached HTML file. A catch-all fallback to
    // /index.html would serve the dashboard for any route whose URL doesn't
    // exactly match the precache (e.g. /people without trailing slash),
    // breaking navigation when Next.js falls back to a hard page load.
    //
    // Runtime-cache the RSC payload .txt files so client-side navigation
    // works offline after a route has been visited at least once.
    runtimeCaching: [
      {
        // Match Next.js RSC payload files (.txt) used for client-side nav
        urlPattern: /\.txt$/,
        handler: "NetworkFirst",
        options: {
          cacheName: "rsc-payloads",
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          },
        },
      },
    ],
  });

  console.log(
    `Generated service worker, precaching ${count} files (${(size / 1024).toFixed(1)} KB)`,
  );
}

buildSW().catch((err) => {
  console.error("Failed to generate service worker:", err);
  process.exit(1);
});
