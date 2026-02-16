export default function PeoplePage() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold text-gray-900">People</h2>
        <p className="mt-1 text-sm text-gray-500">
          Manage your contacts and relationship tiers.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-400">
          No contacts yet. Tap the button below to add someone.
        </p>
      </section>

      <button
        type="button"
        className="fixed bottom-20 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label="Add contact"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}
