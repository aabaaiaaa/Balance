export default function LifeAreasPage() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold text-gray-900">Life Areas</h2>
        <p className="mt-1 text-sm text-gray-500">
          Track and balance the areas that matter to you.
        </p>
      </section>

      {["Self-care", "DIY/Household", "Partner Time", "Social", "Personal Goals"].map(
        (area) => (
          <section
            key={area}
            className="rounded-xl border border-gray-200 bg-white p-4"
          >
            <h3 className="font-medium text-gray-900">{area}</h3>
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>0h this week</span>
                <span>Target: --h</span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                <div className="h-2 rounded-full bg-indigo-400" style={{ width: "0%" }} />
              </div>
            </div>
          </section>
        ),
      )}
    </div>
  );
}
