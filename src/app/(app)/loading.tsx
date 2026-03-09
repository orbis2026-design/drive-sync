export default function AppLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6">
      <div className="w-10 h-10 rounded-full border-2 border-gray-700 border-t-amber-500 animate-spin mb-4" />
      <p className="text-gray-600 text-sm">Loading…</p>
    </div>
  );
}
