export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold text-gray-900">
          Welcome to Balance
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Your priority dashboard will appear here.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium text-gray-500">Top Priorities</h3>
        <p className="mt-2 text-sm text-gray-400">
          No priorities yet. Add some contacts and life areas to get started.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium text-gray-500">Balance Overview</h3>
        <p className="mt-2 text-sm text-gray-400">
          Your weekly balance chart will appear here.
        </p>
      </section>
    </div>
  );
}
