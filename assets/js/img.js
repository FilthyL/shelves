// Cover image links. Open Library and the Cover Art Archive answer through two redirects and a zip extraction at
// archive.org, 1 to 3 seconds for every image, every time. They are served through the wsrv.nl image CDN instead:
// resized to the size shown, as WebP, cached at its edge and in the browser for a year. tools/warm.mjs asks for each
// of these links after a deploy so the CDN's cache is already warm when a visitor arrives. Anything else (AniList,
// Wikipedia, Amazon, Deezer) is already behind a CDN and is used as it is.
const SLOW = /^https:\/\/(?:covers\.openlibrary\.org|coverartarchive\.org|archive\.org|[a-z0-9]+\.us\.archive\.org)\//;

/** widths in CSS pixels: sm for shelf faces, thumbnails and palette sampling; lg for the inspector */
export const SIZES = { sm: 200, lg: 480 };

export function coverSrc(src, size = 'lg') {
  if (!src || !SLOW.test(src)) return src;
  return `https://wsrv.nl/?url=${encodeURIComponent(src.replace(/\?default=false$/, ''))}&w=${SIZES[size] || SIZES.lg}&we&output=webp&q=82`;
}
