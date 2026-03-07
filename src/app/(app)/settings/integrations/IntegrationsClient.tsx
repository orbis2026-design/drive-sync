"use client";

import { useState, useTransition } from "react";
import { saveIntegrationSettings } from "./actions";
import type { IntegrationSettings } from "./actions";

interface Props {
  initialSettings: IntegrationSettings;
}

export default function IntegrationsClient({ initialSettings }: Props) {
  const [googlePlaceId, setGooglePlaceId] = useState(
    initialSettings.googlePlaceId ?? "",
  );
  const [reviewLink, setReviewLink] = useState(
    initialSettings.reviewLink ?? "",
  );
  const [ownerPhone, setOwnerPhone] = useState(
    initialSettings.ownerPhone ?? "",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await saveIntegrationSettings({
        googlePlaceId: googlePlaceId || null,
        reviewLink: reviewLink || null,
        ownerPhone: ownerPhone || null,
      });
      if ("error" in result) {
        setMessage(`Error: ${result.error}`);
      } else {
        setMessage("Saved successfully.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Google Business */}
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⭐</span>
          <div>
            <p className="font-semibold text-white">Google Business</p>
            <p className="text-xs text-gray-500">
              Automatically request reviews from satisfied customers.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label
              htmlFor="googlePlaceId"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Google Place ID
            </label>
            <input
              id="googlePlaceId"
              type="text"
              value={googlePlaceId}
              onChange={(e) => setGooglePlaceId(e.target.value)}
              placeholder="ChIJ..."
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label
              htmlFor="reviewLink"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Direct Review Link
            </label>
            <input
              id="reviewLink"
              type="url"
              value={reviewLink}
              onChange={(e) => setReviewLink(e.target.value)}
              placeholder="https://g.page/r/..."
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-xs text-gray-600 mt-1">
              Paste your Google Maps review shortlink. Customers receive this
              after every completed job.
            </p>
          </div>
        </div>
      </section>

      {/* Twilio Voice */}
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📞</span>
          <div>
            <p className="font-semibold text-white">Missed-Call Text-Back</p>
            <p className="text-xs text-gray-500">
              Forward calls to your cell and auto-text missed callers.
            </p>
          </div>
        </div>

        <div>
          <label
            htmlFor="ownerPhone"
            className="block text-xs font-medium text-gray-400 mb-1"
          >
            Your Cell Phone Number
          </label>
          <input
            id="ownerPhone"
            type="tel"
            value={ownerPhone}
            onChange={(e) => setOwnerPhone(e.target.value)}
            placeholder="+15555550100"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-xs text-gray-600 mt-1">
            Inbound calls to your Twilio number will ring your cell first.
          </p>
        </div>
      </section>

      {message && (
        <p
          className={`text-sm px-3 py-2 rounded-xl ${
            message.startsWith("Error")
              ? "bg-red-950 text-red-400"
              : "bg-emerald-950 text-emerald-400"
          }`}
        >
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-white text-black font-bold py-3 rounded-2xl disabled:opacity-50 transition-opacity"
      >
        {isPending ? "Saving…" : "Save Integrations"}
      </button>
    </form>
  );
}
