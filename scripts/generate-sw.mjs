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
      "**/*.{html,js,css,png,jpg,jpeg,svg,gif,ico,woff,woff2,ttf,eot,json,webmanifest,txt,wasm}",
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
    // Navigation fallback for SPA-style routing
    navigateFallback: `${basePath}/index.html`,
    // Don't use the navigation fallback for non-page requests
    navigateFallbackDenylist: [/^\/_next\//, /\/sw\.js$/],
  });

  console.log(
    `Generated service worker, precaching ${count} files (${(size / 1024).toFixed(1)} KB)`,
  );
}

buildSW().catch((err) => {
  console.error("Failed to generate service worker:", err);
  process.exit(1);
});
