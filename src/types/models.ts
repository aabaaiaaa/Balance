/** Common sync fields included on every entity to support peer-to-peer sync. */
export interface SyncFields {
  /** Timestamp of the last modification (milliseconds since epoch). */
  updatedAt: number;
  /** ID of the device that created or last modified this record. */
  deviceId: string;
  /** Timestamp when soft-deleted, or null if active. */
  deletedAt: number | null;
}

// ---------------------------------------------------------------------------
// Location types
// ---------------------------------------------------------------------------

export interface LocationWithLabel {
  lat: number;
  lng: number;
  label: string;
}

export interface Location {
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------------------
// Relationship tiers
// ---------------------------------------------------------------------------

export type ContactTier =
  | "partner"
  | "close-family"
  | "extended-family"
  | "close-friends"
  | "wider-friends";

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export interface Contact extends SyncFields {
  id?: number;
  name: string;
  tier: ContactTier;
  checkInFrequencyDays: number;
  lastCheckIn: number | null;
  notes: string;
  phoneNumber: string;
  location: LocationWithLabel | null;
}

export type CheckInType = "called" | "texted" | "met-up" | "video-call" | "other";

export interface CheckIn extends SyncFields {
  id?: number;
  contactId: number;
  date: number;
  type: CheckInType;
  notes: string;
  location: Location | null;
}

export interface LifeArea extends SyncFields {
  id?: number;
  name: string;
  icon: string;
  targetHoursPerWeek: number;
}

export interface Activity extends SyncFields {
  id?: number;
  lifeAreaId: number;
  description: string;
  durationMinutes: number;
  date: number;
  notes: string;
  location: Location | null;
}

export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus = "pending" | "in-progress" | "done";

export interface HouseholdTask extends SyncFields {
  id?: number;
  lifeAreaId: number;
  title: string;
  estimatedMinutes: number;
  priority: TaskPriority;
  status: TaskStatus;
  completedAt: number | null;
}

export interface Milestone {
  title: string;
  done: boolean;
}

export interface Goal extends SyncFields {
  id?: number;
  lifeAreaId: number;
  title: string;
  description: string;
  targetDate: number | null;
  milestones: Milestone[];
  progressPercent: number;
}

export interface DateNight extends SyncFields {
  id?: number;
  date: number;
  notes: string;
  ideaUsed: string | null;
}

export interface DateNightIdea extends SyncFields {
  id?: number;
  title: string;
}

export interface SavedPlace extends SyncFields {
  id?: number;
  label: string;
  lat: number;
  lng: number;
  radius: number;
  linkedContactIds: string[];
  linkedLifeAreaIds: string[];
  lastVisited: number | null;
  visitCount: number;
}

export type SnoozedItemType = "contact" | "task" | "goal" | "date-night";

export interface SnoozedItem extends SyncFields {
  id?: number;
  itemType: SnoozedItemType;
  itemId: number;
  snoozedUntil: number;
}

export type WeekStartDay = "monday" | "sunday";
export type EnergyLevel = "energetic" | "normal" | "low";
export type Theme = "light" | "dark" | "system";

/** Per-type notification preferences — each maps to a scored item type. */
export interface NotificationTypePreferences {
  /** Show reminders for overdue contact check-ins. */
  contactCheckIns: boolean;
  /** Show reminders when life areas are below target. */
  lifeAreaImbalance: boolean;
  /** Show reminders for pending household tasks. */
  taskReminders: boolean;
}

export interface UserPreferences {
  id: string;
  onboardingComplete: boolean;
  deviceId: string;
  householdId: string | null;
  partnerDeviceId: string | null;
  lastSyncTimestamp: number | null;
  weekStartDay: WeekStartDay;
  dateNightFrequencyDays: number;
  theme: Theme;
  /** Whether the user has granted or been asked about notification permission. */
  notificationsEnabled: boolean;
  /** Per-type notification preferences (which types of reminders to receive). */
  notificationTypes: NotificationTypePreferences;
  /** Timestamp of the last time the app was opened (for "welcome back" detection). */
  lastAppOpenTimestamp: number | null;
  /** Map of item keys to last notification timestamp to avoid repeat notifications within 24h. */
  lastNotificationTimestamps: Record<string, number>;
  /** History of past sync timestamps (most recent first, capped at 20 entries). */
  syncHistory: number[];
}
