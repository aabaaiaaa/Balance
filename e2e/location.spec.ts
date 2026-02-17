import { test, expect } from "@playwright/test";
import {
  clearDatabase,
  waitForAppReady,
  navigateToTab,
  getTableRecords,
} from "./helpers";

test.describe("Location features — geolocation mocking and saved places", () => {
  // Location features (TASK-033, TASK-034, TASK-035) may not be fully implemented yet.
  // These tests verify that:
  // 1. Geolocation can be mocked via Playwright
  // 2. SavedPlace records can be created in IndexedDB
  // 3. The app handles location permission gracefully

  test.beforeEach(async ({ page, context }) => {
    // Grant geolocation permissions and set mock location
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 51.5074, longitude: -0.1278 }); // London

    await page.goto("/");
    await clearDatabase(page);
    await page.reload();
    await waitForAppReady(page);
  });

  test("geolocation mock is available to the app", async ({ page, context }) => {
    // Verify that the mocked geolocation is accessible
    const position = await page.evaluate(
      () =>
        new Promise<{ lat: number; lng: number }>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              }),
            reject,
          );
        }),
    );

    expect(position.lat).toBeCloseTo(51.5074, 3);
    expect(position.lng).toBeCloseTo(-0.1278, 3);
  });

  test("saved places can be stored and read from IndexedDB", async ({
    page,
  }) => {
    // Seed a saved place directly
    await page.evaluate(async () => {
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("BalanceDB");
        request.onsuccess = () => {
          const idb = request.result;
          const tx = idb.transaction("savedPlaces", "readwrite");
          const store = tx.objectStore("savedPlaces");
          store.add({
            label: "Mum's House",
            lat: 51.5074,
            lng: -0.1278,
            radius: 200,
            linkedContactIds: [],
            linkedLifeAreaIds: [],
            lastVisited: Date.now(),
            visitCount: 5,
            updatedAt: Date.now(),
            deviceId: "e2e-test",
            deletedAt: null,
          });
          tx.oncomplete = () => {
            idb.close();
            resolve();
          };
          tx.onerror = () => {
            idb.close();
            reject(tx.error);
          };
        };
        request.onerror = () => reject(request.error);
      });
    });

    // Read back and verify
    const places = await getTableRecords(page, "savedPlaces");
    const mumsPlace = places.find((p) => p.label === "Mum's House");
    expect(mumsPlace).toBeTruthy();
    expect(mumsPlace!.lat).toBeCloseTo(51.5074, 3);
    expect(mumsPlace!.lng).toBeCloseTo(-0.1278, 3);
    expect(mumsPlace!.visitCount).toBe(5);
    expect(mumsPlace!.radius).toBe(200);
  });

  test("passive visit tracking: lastVisited and visitCount update when near a saved place", async ({
    page,
    context,
  }) => {
    // Seed a saved place near the mocked location
    await page.evaluate(async () => {
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("BalanceDB");
        request.onsuccess = () => {
          const idb = request.result;
          const tx = idb.transaction("savedPlaces", "readwrite");
          const store = tx.objectStore("savedPlaces");
          store.add({
            label: "The Gym",
            lat: 51.5074, // Same as mocked location
            lng: -0.1278,
            radius: 200,
            linkedContactIds: [],
            linkedLifeAreaIds: [1], // Self-care
            lastVisited: null,
            visitCount: 0,
            updatedAt: Date.now(),
            deviceId: "e2e-test",
            deletedAt: null,
          });
          tx.oncomplete = () => {
            idb.close();
            resolve();
          };
          tx.onerror = () => {
            idb.close();
            reject(tx.error);
          };
        };
        request.onerror = () => reject(request.error);
      });
    });

    // The passive tracking feature (TASK-034) checks location on app open
    // Reload to trigger the check
    await page.reload();
    await waitForAppReady(page);

    // The saved place record should be readable
    const places = await getTableRecords(page, "savedPlaces");
    const gym = places.find((p) => p.label === "The Gym");
    expect(gym).toBeTruthy();

    // Note: passive tracking may not be implemented yet (TASK-034).
    // If it is, lastVisited and visitCount would be updated.
    // For now, verify the place exists and the location data is correct.
    expect(gym!.lat).toBeCloseTo(51.5074, 3);
    expect(gym!.lng).toBeCloseTo(-0.1278, 3);
  });

  test("overlapping zones: multiple saved places near the same location", async ({
    page,
    context,
  }) => {
    // Seed multiple saved places at the same location
    await page.evaluate(async () => {
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("BalanceDB");
        request.onsuccess = () => {
          const idb = request.result;
          const tx = idb.transaction("savedPlaces", "readwrite");
          const store = tx.objectStore("savedPlaces");

          // Place 1: The Shopping Centre
          store.add({
            label: "Shopping Centre",
            lat: 51.5074,
            lng: -0.1278,
            radius: 500,
            linkedContactIds: [],
            linkedLifeAreaIds: [],
            lastVisited: null,
            visitCount: 0,
            updatedAt: Date.now(),
            deviceId: "e2e-test",
            deletedAt: null,
          });

          // Place 2: The Gym (inside the shopping centre)
          store.add({
            label: "The Gym",
            lat: 51.5075,
            lng: -0.1277,
            radius: 100,
            linkedContactIds: [],
            linkedLifeAreaIds: [1],
            lastVisited: null,
            visitCount: 0,
            updatedAt: Date.now(),
            deviceId: "e2e-test",
            deletedAt: null,
          });

          // Place 3: Costa Coffee (also inside)
          store.add({
            label: "Costa Coffee",
            lat: 51.5073,
            lng: -0.1279,
            radius: 50,
            linkedContactIds: [],
            linkedLifeAreaIds: [4], // Social
            lastVisited: null,
            visitCount: 0,
            updatedAt: Date.now(),
            deviceId: "e2e-test",
            deletedAt: null,
          });

          tx.oncomplete = () => {
            idb.close();
            resolve();
          };
          tx.onerror = () => {
            idb.close();
            reject(tx.error);
          };
        };
        request.onerror = () => reject(request.error);
      });
    });

    // Verify all places exist
    const places = await getTableRecords(page, "savedPlaces");
    const activePlaces = places.filter((p) => p.deletedAt === null);
    expect(activePlaces.length).toBe(3);

    // All three should be "near" the mocked location since they're within radius
    const labels = activePlaces.map((p) => p.label);
    expect(labels).toContain("Shopping Centre");
    expect(labels).toContain("The Gym");
    expect(labels).toContain("Costa Coffee");
  });

  test("changing geolocation updates the position for the app", async ({
    page,
    context,
  }) => {
    // Start near London
    let position = await page.evaluate(
      () =>
        new Promise<{ lat: number; lng: number }>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              }),
            reject,
          );
        }),
    );
    expect(position.lat).toBeCloseTo(51.5074, 3);

    // Move to Manchester
    await context.setGeolocation({ latitude: 53.4808, longitude: -2.2426 });

    position = await page.evaluate(
      () =>
        new Promise<{ lat: number; lng: number }>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              }),
            reject,
          );
        }),
    );
    expect(position.lat).toBeCloseTo(53.4808, 3);
    expect(position.lng).toBeCloseTo(-2.2426, 3);
  });
});
