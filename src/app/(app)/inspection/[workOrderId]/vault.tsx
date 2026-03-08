"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface ScanResult {
  type: "VIN" | "PLATE" | "NONE";
  value: string;
  confidence: number;
  state?: string;
}

interface VaultMedia {
  url: string;
  filename: string;
  type: "image" | "video";
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const cls =
    confidence >= 0.8
      ? "bg-green-700 text-green-200"
      : confidence >= 0.5
        ? "bg-yellow-800 text-yellow-200"
        : "bg-red-800 text-red-300";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>
      {pct}% confidence
    </span>
  );
}

function ScanResultDisplay({ result }: { result: ScanResult }) {
  if (result.type === "VIN") {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-green-400 font-bold text-sm">
          ✅ VIN Detected: <span className="font-mono">{result.value}</span>
        </p>
        <ConfidenceBadge confidence={result.confidence} />
      </div>
    );
  }
  if (result.type === "PLATE") {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-blue-400 font-bold text-sm">
          🪪 Plate Detected: {result.value}
          {result.state ? ` (${result.state})` : ""}
        </p>
        <ConfidenceBadge confidence={result.confidence} />
      </div>
    );
  }
  return (
    <p className="text-gray-400 text-sm">No VIN/Plate found in this image.</p>
  );
}

export function MediaVault({ workOrderId }: { workOrderId: string }) {
  const r2Base =
    typeof window !== "undefined"
      ? (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "")
      : "";

  // ---------- Scanner state ----------
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // ---------- Vault state ----------
  const [vault, setVault] = useState<VaultMedia[]>([]);
  const [loadingVault, setLoadingVault] = useState(true);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // ------------------------------------------------------------------
  // Load existing media from the work order
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!workOrderId) return;
    (async () => {
      setLoadingVault(true);
      try {
        const res = await fetch(`/api/work-orders/${workOrderId}/media`);
        if (res.ok) {
          const data = (await res.json()) as VaultMedia[];
          setVault(data);
        }
      } catch {
        // silently ignore — vault may simply be empty
      } finally {
        setLoadingVault(false);
      }
    })();
  }, [workOrderId]);

  // ------------------------------------------------------------------
  // Universal Scanner — capture + analyse
  // ------------------------------------------------------------------
  const handleScanCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setScanning(true);
      setScanResult(null);
      setScanError(null);

      try {
        const base64 = await fileToBase64(file);
        const res = await fetch("/api/lexicon/universal-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64 }),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? "Scan failed");
        }
        const result = (await res.json()) as ScanResult;
        setScanResult(result);
      } catch (err) {
        setScanError(
          err instanceof Error ? err.message : "Unknown scan error",
        );
      } finally {
        setScanning(false);
        // reset input so the same file can be re-selected
        if (scanInputRef.current) scanInputRef.current.value = "";
      }
    },
    [],
  );

  // ------------------------------------------------------------------
  // Upload to Vault
  // ------------------------------------------------------------------
  const handleVaultUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      try {
        // 1. Get a short-lived (60-second) pre-signed upload URL
        const presignRes = await fetch("/api/upload/presigned", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            workOrderId,
            contentLength: file.size,
          }),
        });
        if (!presignRes.ok) throw new Error("Failed to get upload URL");
        const { uploadUrl, publicUrl } = (await presignRes.json()) as {
          uploadUrl: string;
          publicUrl: string;
        };

        // 2. PUT file directly to R2
        await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        // 3. Add to local vault list
        const mediaType: "image" | "video" = file.type.startsWith("video/")
          ? "video"
          : "image";
        setVault((prev) => [
          ...prev,
          { url: publicUrl, filename: file.name, type: mediaType },
        ]);
      } catch (err) {
        console.error("Vault upload error:", err);
      } finally {
        setUploading(false);
        if (uploadInputRef.current) uploadInputRef.current.value = "";
      }
    },
    [workOrderId],
  );

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6">
      {/* ── Universal Scanner ─────────────────────────────────────── */}
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">
          Universal Scanner
        </h2>

        {/* Camera button */}
        <label className="cursor-pointer">
          <input
            ref={scanInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={handleScanCapture}
          />
          <span className="inline-flex items-center gap-2 bg-red-600 text-white font-black uppercase tracking-wide rounded-xl px-5 py-3 hover:bg-red-500 active:scale-95 transition-transform text-sm select-none">
            📷 {scanning ? "Scanning…" : "Scan VIN / Plate"}
          </span>
        </label>

        {/* Result */}
        {scanning && (
          <p className="text-gray-400 text-sm animate-pulse">
            Analysing image with AI…
          </p>
        )}
        {scanError && (
          <p className="text-red-400 text-sm">⚠️ {scanError}</p>
        )}
        {scanResult && !scanning && (
          <ScanResultDisplay result={scanResult} />
        )}
      </section>

      {/* ── Media Vault ───────────────────────────────────────────── */}
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">
            Media Vault
          </h2>

          {/* Upload button */}
          <label className="cursor-pointer">
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*,video/*"
              capture="environment"
              className="sr-only"
              onChange={handleVaultUpload}
            />
            <span className="inline-flex items-center gap-1 bg-gray-800 text-gray-300 text-xs font-bold uppercase tracking-wide rounded-xl px-3 py-2 hover:bg-gray-700 active:scale-95 transition-transform select-none border border-gray-700">
              {uploading ? "Uploading…" : "+ Upload to Vault"}
            </span>
          </label>
        </div>

        {/* Grid */}
        {loadingVault ? (
          <p className="text-gray-500 text-sm animate-pulse">
            Loading media…
          </p>
        ) : vault.length === 0 ? (
          <p className="text-gray-600 text-sm">
            No media yet. Capture photos or videos to fill the vault.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {vault.map((item, idx) => (
              <MediaTile key={idx} item={item} r2Base={r2Base} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Media tile
// ---------------------------------------------------------------------------
function MediaTile({
  item,
  r2Base,
}: {
  item: VaultMedia;
  r2Base: string;
}) {
  const url = item.url.startsWith("http")
    ? item.url
    : `${r2Base}/${item.url}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="rounded-xl overflow-hidden bg-gray-800 aspect-square flex items-center justify-center">
        {item.type === "video" ? (
          <video
            src={url}
            className="w-full h-full object-cover"
            preload="metadata"
            muted
            playsInline
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={item.filename}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
      </div>
      <p
        className="text-xs text-gray-500 truncate"
        title={item.filename}
      >
        {item.filename}
      </p>
    </div>
  );
}
