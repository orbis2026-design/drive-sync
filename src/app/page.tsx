export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white">
          Drive<span className="text-brand-400">Sync</span>
        </h1>
        <p className="text-gray-400 text-lg">
          Mobile-first work order management for mechanic shops.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-3">
          <a
            href="/intake"
            className="flex min-h-[48px] items-center justify-center rounded-lg bg-brand-400 px-6 py-3 text-sm font-bold text-gray-900 hover:bg-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
          >
            New Intake
          </a>
          <a
            href="/jobs"
            className="flex min-h-[48px] items-center justify-center rounded-lg bg-gray-800 px-6 py-3 text-sm font-bold text-white hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
          >
            Active Jobs
          </a>
        </div>
      </div>
    </div>
  );
}
