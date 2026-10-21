// Media manifest: browser-safe half (no Node built-ins).
//
// Uploads are encoded once, at upload time, into an AVIF width ladder stored
// in the content repo's public/media/. public/media/manifest.json records,
// for each upload, its fingerprint, intrinsic size, focal point and which
// widths exist. The WebP fallback is the existing upload itself, copied into
// place at build time (never stored twice). See ../media.mjs for encoding.

/** Encoding settings. Changing any of them makes the backfill re-encode. */
export const MEDIA_SETTINGS = Object.freeze({
  ladder: Object.freeze([400, 800, 1200, 1600, 1920]),
  avifQuality: 50,
  version: 1,
});

/** Widths to encode for a master of `width` px: the ladder, capped at the master. */
export function ladderFor(width, ladder = MEDIA_SETTINGS.ladder) {
  if (!width) return [];
  const below = ladder.filter(w => w < width);
  return [...new Set([...below, Math.min(width, ladder[ladder.length - 1])])];
}

/** "1786441702486-deck.webp" -> "1786441702486-deck" */
export function uploadBase(uploadName) {
  return String(uploadName).replace(/\.[^.\/]+$/, '');
}

export function avifFileName(uploadName, hash, width) {
  return `${uploadBase(uploadName)}-${hash}-${width}.avif`;
}

/** The fallback keeps the upload's own extension (normally .webp). */
export function fallbackFileName(uploadName, hash) {
  const ext = /\.[^.\/]+$/.exec(uploadName)?.[0] || '.webp';
  return `${uploadBase(uploadName)}-${hash}${ext}`;
}

/** The upload file name an image field refers to ("../../assets/uploads/x.webp" -> "x.webp"). */
export function uploadNameFromSrc(src) {
  const value = typeof src === 'object' && src ? src.src : src;
  const match = /(?:^|\/)uploads\/([^/?#]+)$/.exec(String(value ?? ''));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * A host.resolveImage() for renderLayout, backed by a manifest.
 *   mediaBase    URL prefix for the AVIF files (default '/media/')
 *   fallbackUrl  (uploadName, entry) => URL of the fallback; defaults to the
 *                fingerprinted copy the build places next to the AVIF files.
 *                The admin preview passes its own upload route instead.
 */
export function mediaResolver(manifest, { mediaBase = '/media/', fallbackUrl } = {}) {
  const entries = manifest?.entries || {};
  return async function resolveImage(src) {
    const name = uploadNameFromSrc(src);
    const entry = name && entries[name];
    if (!entry) return null;
    return {
      width: entry.width,
      height: entry.height,
      focal: entry.focal || undefined,
      avif: entry.widths.map(width => ({ url: mediaBase + avifFileName(name, entry.hash, width), width })),
      fallback: { url: fallbackUrl ? fallbackUrl(name, entry) : mediaBase + fallbackFileName(name, entry.hash) },
    };
  };
}
