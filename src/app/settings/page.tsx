export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Configure your preferences.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="font-medium text-gray-900">Partner</h3>
        <p className="mt-1 text-sm text-gray-400">
          No partner linked. Sync with your partner to share data.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="font-medium text-gray-900">Sync</h3>
        <p className="mt-1 text-sm text-gray-400">
          Peer-to-peer sync options will appear here.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="font-medium text-gray-900">Data</h3>
        <p className="mt-1 text-sm text-gray-400">
          Export, import, and manage your local data.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="font-medium text-gray-900">About</h3>
        <p className="mt-1 text-sm text-gray-400">Balance v0.1.0</p>
      </section>
    </div>
  );
}
