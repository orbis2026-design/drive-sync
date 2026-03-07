export default function Home() {
  return (
    <div className="flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center gap-6 px-6 text-center">
      {/* Wrench / brand mark */}
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-500/10 ring-2 ring-orange-500/40">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#f97316"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-10 w-10"
          aria-hidden="true"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-50">
          Drive Sync
        </h1>
        <p className="max-w-xs text-sm leading-6 text-zinc-400">
          Mobile mechanic shop management. Clients, vehicles, and work orders —
          all in your pocket.
        </p>
      </div>

      <p className="text-xs text-zinc-600">
        Use the navigation below to get started.
      </p>
    </div>
  );
}

