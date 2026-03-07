import { fetchCalendarData } from "./actions";
import { CalendarClient } from "./CalendarClient";

export const metadata = {
  title: "Calendar — DriveSync",
  description: "Drag-and-drop driveway scheduling with drive-time padding.",
};

export default async function CalendarPage() {
  const result = await fetchCalendarData();

  const data =
    "data" in result
      ? result.data
      : { scheduled: [], backlog: [] };

  const error = "error" in result ? result.error : undefined;

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {error && (
        <div
          role="alert"
          className="mx-4 mt-4 rounded-2xl bg-red-950 border border-red-700 px-4 py-3 text-sm text-red-400"
        >
          Could not load calendar: {error}
        </div>
      )}
      <CalendarClient initial={data} />
    </div>
  );
}
