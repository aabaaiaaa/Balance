import "fake-indexeddb/auto";
import { BalanceDatabase } from "@/lib/db";
import type {
  Contact,
  CheckIn,
  LifeArea,
  Activity,
  HouseholdTask,
  Goal,
  DateNight,
  DateNightIdea,
  SavedPlace,
  SnoozedItem,
  UserPreferences,
} from "@/types/models";

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
      const contact: Omit<Contact, "id"> = {
        name: "Alice",
        tier: "close-family",
        checkInFrequencyDays: 7,
        lastCheckIn: null,
        notes: "",
        phoneNumber: "",
        location: null,
        updatedAt: Date.now(),
        deviceId: "device-1",
        deletedAt: null,
      };
      const id = await db.contacts.add(contact);

      const retrieved = await db.contacts.get(id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe("Alice");
      expect(retrieved!.tier).toBe("close-family");
      expect(retrieved!.checkInFrequencyDays).toBe(7);
    });

    it("updates a contact", async () => {
      const id = await db.contacts.add({
        name: "Bob",
        tier: "wider-friends",
        checkInFrequencyDays: 30,
        lastCheckIn: null,
        notes: "",
        phoneNumber: "",
        location: null,
        updatedAt: Date.now(),
        deviceId: "device-1",
        deletedAt: null,
      });

      await db.contacts.update(id, { name: "Robert", updatedAt: Date.now() });

      const contact = await db.contacts.get(id);
      expect(contact!.name).toBe("Robert");
    });

    it("queries by tier", async () => {
      const now = Date.now();
      const base: Omit<Contact, "id" | "name" | "tier"> = {
        checkInFrequencyDays: 7,
        lastCheckIn: null,
        notes: "",
        phoneNumber: "",
        location: null,
        updatedAt: now,
        deviceId: "d1",
        deletedAt: null,
      };

      await db.contacts.bulkAdd([
        { ...base, name: "Alice", tier: "close-family" },
        { ...base, name: "Bob", tier: "wider-friends" },
        { ...base, name: "Carol", tier: "close-family" },
      ]);

      const closeFamily = await db.contacts
        .where("tier")
        .equals("close-family")
        .toArray();
      expect(closeFamily).toHaveLength(2);
      expect(closeFamily.map((c) => c.name).sort()).toEqual(["Alice", "Carol"]);
    });

    it("supports soft delete via deletedAt", async () => {
      const id = await db.contacts.add({
        name: "Dave",
        tier: "partner",
        checkInFrequencyDays: 1,
        lastCheckIn: null,
        notes: "",
        phoneNumber: "",
        location: null,
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      });

      const deletedAt = Date.now();
      await db.contacts.update(id, { deletedAt });

      const contact = await db.contacts.get(id);
      expect(contact!.deletedAt).toBe(deletedAt);

      const all = await db.contacts.toArray();
      const active = all.filter((c) => c.deletedAt === null);
      expect(active).toHaveLength(0);
    });

    it("stores location data on a contact", async () => {
      const id = await db.contacts.add({
        name: "Eve",
        tier: "close-friends",
        checkInFrequencyDays: 14,
        lastCheckIn: null,
        notes: "",
        phoneNumber: "07700 900000",
        location: { lat: 51.5074, lng: -0.1278, label: "London" },
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      });

      const contact = await db.contacts.get(id);
      expect(contact!.location).toEqual({
        lat: 51.5074,
        lng: -0.1278,
        label: "London",
      });
    });
  });

  describe("checkIns table", () => {
    it("adds a check-in linked to a contact", async () => {
      const contactId = await db.contacts.add({
        name: "Eve",
        tier: "close-friends",
        checkInFrequencyDays: 14,
        lastCheckIn: null,
        notes: "",
        phoneNumber: "",
        location: null,
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      });

      const checkIn: Omit<CheckIn, "id"> = {
        contactId,
        date: Date.now(),
        type: "called",
        notes: "Quick catch-up",
        location: null,
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      };
      const checkInId = await db.checkIns.add(checkIn);

      const retrieved = await db.checkIns.get(checkInId);
      expect(retrieved!.contactId).toBe(contactId);
      expect(retrieved!.type).toBe("called");
    });

    it("queries check-ins by contactId", async () => {
      const contactId = 42;
      const now = Date.now();
      const base: Omit<CheckIn, "id" | "contactId" | "type"> = {
        date: now,
        notes: "",
        location: null,
        updatedAt: now,
        deviceId: "d1",
        deletedAt: null,
      };

      await db.checkIns.bulkAdd([
        { ...base, contactId, type: "texted" },
        { ...base, contactId, type: "called" },
        { ...base, contactId: 99, type: "met-up" },
      ]);

      const results = await db.checkIns
        .where("contactId")
        .equals(contactId)
        .toArray();
      expect(results).toHaveLength(2);
    });

    it("stores location on a check-in", async () => {
      const id = await db.checkIns.add({
        contactId: 1,
        date: Date.now(),
        type: "met-up",
        notes: "Coffee",
        location: { lat: 51.5, lng: -0.1 },
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      });

      const checkIn = await db.checkIns.get(id);
      expect(checkIn!.location).toEqual({ lat: 51.5, lng: -0.1 });
    });
  });

  describe("lifeAreas table", () => {
    it("stores and retrieves life areas", async () => {
      const area: Omit<LifeArea, "id"> = {
        name: "Self-care",
        icon: "heart",
        targetHoursPerWeek: 5,
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      };
      const id = await db.lifeAreas.add(area);

      const retrieved = await db.lifeAreas.get(id);
      expect(retrieved!.name).toBe("Self-care");
      expect(retrieved!.targetHoursPerWeek).toBe(5);
      expect(retrieved!.icon).toBe("heart");
    });
  });

  describe("activities table", () => {
    it("stores an activity with location", async () => {
      const activity: Omit<Activity, "id"> = {
        lifeAreaId: 1,
        description: "Morning run",
        durationMinutes: 30,
        date: Date.now(),
        notes: "Felt great",
        location: { lat: 51.5, lng: -0.1 },
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      };
      const id = await db.activities.add(activity);

      const retrieved = await db.activities.get(id);
      expect(retrieved!.description).toBe("Morning run");
      expect(retrieved!.durationMinutes).toBe(30);
      expect(retrieved!.location).toEqual({ lat: 51.5, lng: -0.1 });
    });
  });

  describe("householdTasks table", () => {
    it("stores a household task with priority and status", async () => {
      const task: Omit<HouseholdTask, "id"> = {
        lifeAreaId: 2,
        title: "Fix leaky tap",
        estimatedMinutes: 45,
        priority: "high",
        status: "pending",
        completedAt: null,
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      };
      const id = await db.householdTasks.add(task);

      const retrieved = await db.householdTasks.get(id);
      expect(retrieved!.title).toBe("Fix leaky tap");
      expect(retrieved!.priority).toBe("high");
      expect(retrieved!.status).toBe("pending");
      expect(retrieved!.completedAt).toBeNull();
    });

    it("queries by status", async () => {
      const now = Date.now();
      const base: Omit<HouseholdTask, "id" | "title" | "status"> = {
        lifeAreaId: 2,
        estimatedMinutes: 30,
        priority: "medium",
        completedAt: null,
        updatedAt: now,
        deviceId: "d1",
        deletedAt: null,
      };

      await db.householdTasks.bulkAdd([
        { ...base, title: "Task A", status: "pending" },
        { ...base, title: "Task B", status: "done" },
        { ...base, title: "Task C", status: "pending" },
      ]);

      const pending = await db.householdTasks
        .where("status")
        .equals("pending")
        .toArray();
      expect(pending).toHaveLength(2);
    });
  });

  describe("goals table", () => {
    it("stores a goal with milestones", async () => {
      const goal: Omit<Goal, "id"> = {
        lifeAreaId: 5,
        title: "Learn Spanish",
        description: "Basic conversational level",
        targetDate: Date.now() + 90 * 24 * 60 * 60 * 1000,
        milestones: [
          { title: "Complete beginner course", done: true },
          { title: "Hold 5-minute conversation", done: false },
        ],
        progressPercent: 50,
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      };
      const id = await db.goals.add(goal);

      const retrieved = await db.goals.get(id);
      expect(retrieved!.title).toBe("Learn Spanish");
      expect(retrieved!.milestones).toHaveLength(2);
      expect(retrieved!.milestones[0].done).toBe(true);
      expect(retrieved!.progressPercent).toBe(50);
    });
  });

  describe("dateNights table", () => {
    it("stores a date night", async () => {
      const dateNight: Omit<DateNight, "id"> = {
        date: Date.now(),
        notes: "Italian restaurant",
        ideaUsed: "Try that new pizza place",
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      };
      const id = await db.dateNights.add(dateNight);

      const retrieved = await db.dateNights.get(id);
      expect(retrieved!.notes).toBe("Italian restaurant");
      expect(retrieved!.ideaUsed).toBe("Try that new pizza place");
    });
  });

  describe("dateNightIdeas table", () => {
    it("stores a date night idea", async () => {
      const idea: Omit<DateNightIdea, "id"> = {
        title: "Cooking class together",
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      };
      const id = await db.dateNightIdeas.add(idea);

      const retrieved = await db.dateNightIdeas.get(id);
      expect(retrieved!.title).toBe("Cooking class together");
    });
  });

  describe("savedPlaces table", () => {
    it("stores a saved place with linked contacts and life areas", async () => {
      const place: Omit<SavedPlace, "id"> = {
        label: "Mum's house",
        lat: 51.5074,
        lng: -0.1278,
        radius: 200,
        linkedContactIds: ["1", "2"],
        linkedLifeAreaIds: ["4"],
        lastVisited: Date.now(),
        visitCount: 5,
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      };
      const id = await db.savedPlaces.add(place);

      const retrieved = await db.savedPlaces.get(id);
      expect(retrieved!.label).toBe("Mum's house");
      expect(retrieved!.linkedContactIds).toEqual(["1", "2"]);
      expect(retrieved!.linkedLifeAreaIds).toEqual(["4"]);
      expect(retrieved!.visitCount).toBe(5);
    });
  });

  describe("snoozedItems table", () => {
    it("stores a snoozed item", async () => {
      const snoozed: Omit<SnoozedItem, "id"> = {
        itemType: "contact",
        itemId: 42,
        snoozedUntil: Date.now() + 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      };
      const id = await db.snoozedItems.add(snoozed);

      const retrieved = await db.snoozedItems.get(id);
      expect(retrieved!.itemType).toBe("contact");
      expect(retrieved!.itemId).toBe(42);
    });

    it("queries by itemType", async () => {
      const now = Date.now();
      const base: Omit<SnoozedItem, "id" | "itemType" | "itemId"> = {
        snoozedUntil: now + 86400000,
        updatedAt: now,
        deviceId: "d1",
        deletedAt: null,
      };

      await db.snoozedItems.bulkAdd([
        { ...base, itemType: "contact", itemId: 1 },
        { ...base, itemType: "task", itemId: 2 },
        { ...base, itemType: "contact", itemId: 3 },
      ]);

      const snoozedContacts = await db.snoozedItems
        .where("itemType")
        .equals("contact")
        .toArray();
      expect(snoozedContacts).toHaveLength(2);
    });
  });

  describe("userPreferences table", () => {
    it("stores preferences with explicit id", async () => {
      const prefs: UserPreferences = {
        id: "prefs",
        onboardingComplete: false,
        deviceId: "device-abc",
        householdId: null,
        partnerDeviceId: null,
        lastSyncTimestamp: null,
        weekStartDay: "monday",
        dateNightFrequencyDays: 14,
        theme: "system",
        notificationsEnabled: false,
        notificationTypes: { contactCheckIns: true, lifeAreaImbalance: true, taskReminders: true },
        lastAppOpenTimestamp: null,
        lastNotificationTimestamps: {},
      };
      await db.userPreferences.put(prefs);

      const retrieved = await db.userPreferences.get("prefs");
      expect(retrieved!.deviceId).toBe("device-abc");
      expect(retrieved!.theme).toBe("system");
      expect(retrieved!.weekStartDay).toBe("monday");
      expect(retrieved!.dateNightFrequencyDays).toBe(14);
    });

    it("upserts preferences with put", async () => {
      const prefs: UserPreferences = {
        id: "prefs",
        onboardingComplete: false,
        deviceId: "device-abc",
        householdId: null,
        partnerDeviceId: null,
        lastSyncTimestamp: null,
        weekStartDay: "monday",
        dateNightFrequencyDays: 14,
        theme: "light",
        notificationsEnabled: false,
        notificationTypes: { contactCheckIns: true, lifeAreaImbalance: true, taskReminders: true },
        lastAppOpenTimestamp: null,
        lastNotificationTimestamps: {},
      };
      await db.userPreferences.put(prefs);
      await db.userPreferences.put({ ...prefs, theme: "dark" });

      const count = await db.userPreferences.count();
      expect(count).toBe(1);

      const retrieved = await db.userPreferences.get("prefs");
      expect(retrieved!.theme).toBe("dark");
    });
  });

  describe("transactions", () => {
    it("supports multi-table transactions", async () => {
      await db.transaction("rw", db.contacts, db.checkIns, async () => {
        const contactId = await db.contacts.add({
          name: "Frank",
          tier: "partner",
          checkInFrequencyDays: 1,
          lastCheckIn: null,
          notes: "",
          phoneNumber: "",
          location: null,
          updatedAt: Date.now(),
          deviceId: "d1",
          deletedAt: null,
        });

        await db.checkIns.add({
          contactId,
          date: Date.now(),
          type: "met-up",
          notes: "",
          location: null,
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

      const id = await db.contacts.add({
        name: "Grace",
        tier: "extended-family",
        checkInFrequencyDays: 21,
        lastCheckIn: null,
        notes: "",
        phoneNumber: "",
        location: null,
        updatedAt: Date.now(),
        deviceId: "d1",
        deletedAt: null,
      });

      db.close();
      await db.open();

      const contact = await db.contacts.get(id);
      expect(contact!.name).toBe("Grace");
    });
  });
});
