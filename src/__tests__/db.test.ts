import "fake-indexeddb/auto";
import { BalanceDatabase } from "@/lib/db";

let db: BalanceDatabase;

beforeEach(async () => {
  db = new BalanceDatabase();
  await db.open();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("BalanceDatabase", () => {
  it("opens successfully", () => {
    expect(db.isOpen()).toBe(true);
    expect(db.name).toBe("BalanceDB");
  });

  it("has version 1", () => {
    expect(db.verno).toBe(1);
  });

  it("has all expected tables", () => {
    const tableNames = db.tables.map((t) => t.name).sort();
    expect(tableNames).toEqual([
      "activities",
      "checkIns",
      "contacts",
      "dateNightIdeas",
      "dateNights",
      "goals",
      "householdTasks",
      "lifeAreas",
      "savedPlaces",
      "snoozedItems",
      "userPreferences",
    ]);
  });

  describe("contacts table", () => {
    it("adds and retrieves a contact", async () => {
      const id = await db.contacts.add({
        name: "Alice",
        tier: "close-family",
        checkInFrequencyDays: 7,
        updatedAt: Date.now(),
        deviceId: "device-1",
        deletedAt: null,
      });

      const contact = await db.contacts.get(id);
      expect(contact).toBeDefined();
      expect(contact.name).toBe("Alice");
      expect(contact.tier).toBe("close-family");
    });

    it("updates a contact", async () => {
      const id = await db.contacts.add({
        name: "Bob",
        tier: "wider-friends",
        updatedAt: Date.now(),
        deviceId: "device-1",
        deletedAt: null,
      });

      await db.contacts.update(id, { name: "Robert", updatedAt: Date.now() });

      const contact = await db.contacts.get(id);
      expect(contact.name).toBe("Robert");
    });

    it("queries by tier", async () => {
      await db.contacts.bulkAdd([
        {
          name: "Alice",
          tier: "close-family",
          updatedAt: Date.now(),
          deviceId: "d1",
          deletedAt: null,
        },
        {
          name: "Bob",
          tier: "wider-friends",
          updatedAt: Date.now(),
          deviceId: "d1",
          deletedAt: null,
        },
        {
          name: "Carol",
          tier: "close-family",
          updatedAt: Date.now(),
          deviceId: "d1",
          deletedAt: null,
        },
      ]);

      const closeFamily = await db.contacts
        .where("tier")
        .equals("close-family")
        .toArray();
      expect(closeFamily).toHaveLength(2);
      expect(closeFamily.map((c: { name: string }) => c.name).sort()).toEqual([
        "Alice",
        "Carol",
      ]);
    });

    it("supports soft delete via deletedAt", async () => {
      const id = await db.contacts.add({
        name: "Dave",
        tier: "partner",
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      });

      const deletedAt = Date.now();
      await db.contacts.update(id, { deletedAt });

      const contact = await db.contacts.get(id);
      expect(contact.deletedAt).toBe(deletedAt);

      // Filter active contacts (deletedAt is null) using collection filter
      const all = await db.contacts.toArray();
      const active = all.filter(
        (c: { deletedAt: number | null }) => c.deletedAt === null
      );
      expect(active).toHaveLength(0);
    });
  });

  describe("checkIns table", () => {
    it("adds a check-in linked to a contact", async () => {
      const contactId = await db.contacts.add({
        name: "Eve",
        tier: "close-friends",
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      });

      const checkInId = await db.checkIns.add({
        contactId,
        date: Date.now(),
        type: "called",
        notes: "Quick catch-up",
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      });

      const checkIn = await db.checkIns.get(checkInId);
      expect(checkIn.contactId).toBe(contactId);
      expect(checkIn.type).toBe("called");
    });

    it("queries check-ins by contactId", async () => {
      const contactId = 42;
      await db.checkIns.bulkAdd([
        {
          contactId,
          date: Date.now(),
          type: "texted",
          updatedAt: Date.now(),
          deviceId: "d1",
          deletedAt: null,
        },
        {
          contactId,
          date: Date.now(),
          type: "called",
          updatedAt: Date.now(),
          deviceId: "d1",
          deletedAt: null,
        },
        {
          contactId: 99,
          date: Date.now(),
          type: "met-up",
          updatedAt: Date.now(),
          deviceId: "d1",
          deletedAt: null,
        },
      ]);

      const results = await db.checkIns
        .where("contactId")
        .equals(contactId)
        .toArray();
      expect(results).toHaveLength(2);
    });
  });

  describe("lifeAreas table", () => {
    it("stores and retrieves life areas", async () => {
      const id = await db.lifeAreas.add({
        name: "Self-care",
        icon: "heart",
        targetHoursPerWeek: 5,
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      });

      const area = await db.lifeAreas.get(id);
      expect(area.name).toBe("Self-care");
      expect(area.targetHoursPerWeek).toBe(5);
    });
  });

  describe("userPreferences table", () => {
    it("stores preferences with explicit id", async () => {
      await db.userPreferences.put({
        id: "prefs",
        onboardingComplete: false,
        deviceId: "device-abc",
        weekStartDay: "monday",
        theme: "system",
      });

      const prefs = await db.userPreferences.get("prefs");
      expect(prefs.deviceId).toBe("device-abc");
      expect(prefs.theme).toBe("system");
    });

    it("upserts preferences with put", async () => {
      await db.userPreferences.put({
        id: "prefs",
        deviceId: "device-abc",
        theme: "light",
      });

      await db.userPreferences.put({
        id: "prefs",
        deviceId: "device-abc",
        theme: "dark",
      });

      const count = await db.userPreferences.count();
      expect(count).toBe(1);

      const prefs = await db.userPreferences.get("prefs");
      expect(prefs.theme).toBe("dark");
    });
  });

  describe("transactions", () => {
    it("supports multi-table transactions", async () => {
      await db.transaction("rw", db.contacts, db.checkIns, async () => {
        const contactId = await db.contacts.add({
          name: "Frank",
          tier: "partner",
          updatedAt: Date.now(),
          deviceId: "d1",
          deletedAt: null,
        });

        await db.checkIns.add({
          contactId,
          date: Date.now(),
          type: "met-up",
          updatedAt: Date.now(),
          deviceId: "d1",
          deletedAt: null,
        });
      });

      const contacts = await db.contacts.count();
      const checkIns = await db.checkIns.count();
      expect(contacts).toBe(1);
      expect(checkIns).toBe(1);
    });
  });

  describe("database lifecycle", () => {
    it("can close and reopen", async () => {
      db.close();
      expect(db.isOpen()).toBe(false);

      await db.open();
      expect(db.isOpen()).toBe(true);

      // Data should persist
      const id = await db.contacts.add({
        name: "Grace",
        tier: "extended-family",
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      });

      db.close();
      await db.open();

      const contact = await db.contacts.get(id);
      expect(contact.name).toBe("Grace");
    });
  });
});
