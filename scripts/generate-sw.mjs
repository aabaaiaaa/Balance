import { generateSW } from "workbox-build";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

async function buildSW() {
  const { count, size } = await generateSW({
    swDest: resolve(rootDir, "out/sw.js"),
    globDirectory: resolve(rootDir, "out"),
    globPatterns: [
      "**/*.{html,js,css,png,jpg,jpeg,svg,gif,ico,woff,woff2,ttf,eot,json}",
    ],
    skipWaiting: true,
    clientsClaim: true,
    // Increase the size limit for precaching (default 2MB)
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    // Navigation fallback for SPA-style routing
    navigateFallback: "/index.html",
  });

  console.log(
    `Generated service worker, precaching ${count} files (${(size / 1024).toFixed(1)} KB)`,
  );
}

buildSW().catch((err) => {
  console.error("Failed to generate service worker:", err);
  process.exit(1);
});
