/**
 * media-compression.ts — Client-side media compression utilities
 *
 * Shrinks images before uploading to Supabase Storage, reducing bandwidth
 * costs and improving upload reliability on cellular connections.
 *
 * Uses the browser's native Canvas API (no extra dependencies) for images.
 * For video, returns the original File since video re-encoding requires
 * specialized WASM libraries (FFmpeg.wasm) beyond this scope; instead the
 * calling code should limit video capture duration at the UI level.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompressionOptions {
  /** Maximum output dimension (width or height) in pixels. Default: 1920 */
  maxDimension?: number;
  /** JPEG quality 0–1. Default: 0.82 */
  quality?: number;
  /** Target maximum file size in bytes. Compression iterates to stay under this. Default: 1.5 MB */
  maxSizeBytes?: number;
}

export interface CompressionResult {
  /** Compressed output File */
  file: File;
  /** Original file size in bytes */
  originalBytes: number;
  /** Compressed file size in bytes */
  compressedBytes: number;
  /** Whether the file was actually recompressed */
  wasCompressed: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_MAX_DIMENSION = 1920;
const DEFAULT_QUALITY = 0.82;
const DEFAULT_MAX_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB

/** Load a File into an HTMLImageElement. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image: ${file.name}`));
    };
    img.src = url;
  });
}

/**
 * Resize an image to fit within maxDimension while preserving aspect ratio.
 * Returns { width, height } ready for canvas.
 */
function calculateDimensions(
  srcWidth: number,
  srcHeight: number,
  maxDimension: number,
): { width: number; height: number } {
  if (srcWidth <= maxDimension && srcHeight <= maxDimension) {
    return { width: srcWidth, height: srcHeight };
  }
  const ratio = Math.min(maxDimension / srcWidth, maxDimension / srcHeight);
  return {
    width: Math.round(srcWidth * ratio),
    height: Math.round(srcHeight * ratio),
  };
}

/**
 * Draw an image onto a canvas at the given dimensions and export as a Blob.
 */
function canvasToBlob(
  img: HTMLImageElement,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Could not get canvas 2D context."));
      return;
    }
    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas toBlob returned null."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compress a single image File.
 *
 * - If the file is a video, it is returned as-is (no re-encoding).
 * - If the image is already small enough, it is returned as-is.
 * - Otherwise, it is resized and re-encoded as JPEG, iterating quality
 *   downward until the file fits within `maxSizeBytes`.
 */
export async function compressMedia(
  file: File,
  options: CompressionOptions = {},
): Promise<CompressionResult> {
  const originalBytes = file.size;

  // Pass through video files unchanged
  if (file.type.startsWith("video/")) {
    return {
      file,
      originalBytes,
      compressedBytes: originalBytes,
      wasCompressed: false,
    };
  }

  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const initialQuality = options.quality ?? DEFAULT_QUALITY;
  const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;

  // If already under limit, no compression needed
  if (originalBytes <= maxSizeBytes) {
    return {
      file,
      originalBytes,
      compressedBytes: originalBytes,
      wasCompressed: false,
    };
  }

  const img = await loadImage(file);
  const { width, height } = calculateDimensions(
    img.naturalWidth,
    img.naturalHeight,
    maxDimension,
  );

  let quality = initialQuality;
  let blob: Blob;

  // Iterate quality downward in 0.05 steps until the output is small enough
  do {
    blob = await canvasToBlob(img, width, height, quality);
    quality = Math.max(0.3, quality - 0.05);
  } while (blob.size > maxSizeBytes && quality > 0.3);

  const outputName = file.name.replace(/\.[^.]+$/, "") + "_compressed.jpg";
  const compressedFile = new File([blob], outputName, { type: "image/jpeg" });

  return {
    file: compressedFile,
    originalBytes,
    compressedBytes: compressedFile.size,
    wasCompressed: true,
  };
}

/**
 * Compress an array of media files concurrently.
 * Returns the compressed files in the same order as the input.
 */
export async function compressMediaFiles(
  files: File[],
  options: CompressionOptions = {},
): Promise<CompressionResult[]> {
  return Promise.all(files.map((f) => compressMedia(f, options)));
}

/**
 * Format bytes as a human-readable string (e.g. "1.4 MB").
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
