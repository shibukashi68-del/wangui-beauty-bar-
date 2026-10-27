// Video catalogue for the gallery.
//
// Video files are served from the project-level /video URL by server.mjs.
// If you change the server's static routes, update VIDEO_DIR too.
//
// `file` must match the real filename exactly, including spaces and capitals.
// A file that is missing shows a graceful "unavailable" tile instead of a
// broken player, so typos are visible rather than silent.
//
// Videos are loaded dynamically from /api/videos. The static list below is
// used as a fallback until the API responds (or if the server is unavailable).

export type VideoDept = 'wigs-hair' | 'makeup' | 'nails' | 'brows-lashes';

export interface Video {
  /** Filename inside /video. */
  file: string;
  /** Absolute URL for owner-uploaded clips stored outside the app host. */
  url?: string;
  title?: string;
  id?: string;
  published?: boolean;
  dept: VideoDept;
  /** Shown under the tile. Keep it short and client-facing. */
  caption: string;
  /** Filename-based category; review before treating it as an owner-approved description. */
  category?: string;
  /** Null means no verified advertised price is available for this clip. */
  priceKes?: number | null;
  reviewRequired?: boolean;
}

/** URL prefix for the project's video files. */
export const VIDEO_DIR = '/video/';

/** Default catalogue shipped with the site. */
export const DEFAULT_VIDEOS: Video[] = [
  // ── Wigs & Hair ──────────────────
  { file: 'wig-install-hero.mp4', dept: 'wigs-hair', caption: 'Wig installation', category: 'Wig installation', priceKes: null, reviewRequired: true },
  { file: 'wig installation.mp4', dept: 'wigs-hair', caption: 'Wig installation', category: 'Wig installation', priceKes: null, reviewRequired: true },
  { file: 'wig install.mp4', dept: 'wigs-hair', caption: 'Wig install', category: 'Wig installation', priceKes: null, reviewRequired: true },
  { file: 'wig @install.mp4', dept: 'wigs-hair', caption: 'Wig and installation', category: 'Wig installation', priceKes: null, reviewRequired: true },
  { file: 'wig @ 7k.mp4', dept: 'wigs-hair', caption: 'Wig style', category: 'Wig sales enquiry', priceKes: null, reviewRequired: true },
  { file: 'wig @18k.mp4', dept: 'wigs-hair', caption: 'Wig style', category: 'Wig sales enquiry', priceKes: null, reviewRequired: true },
  { file: 'wig.mp4', dept: 'wigs-hair', caption: 'Wig style', category: 'Wig style', priceKes: null, reviewRequired: true },
  { file: 'install 1 k.mp4', dept: 'wigs-hair', caption: 'Installation style', category: 'Wig installation', priceKes: null, reviewRequired: true },
  { file: 'colour ginger.mp4', dept: 'wigs-hair', caption: 'Ginger colour', category: 'Coloured wig or hair', priceKes: null, reviewRequired: true },
  { file: 'ginger wig.mp4', dept: 'wigs-hair', caption: 'Ginger wig', category: 'Coloured wig', priceKes: null, reviewRequired: true },
  { file: 'frontal ponytail.mp4', dept: 'wigs-hair', caption: 'Frontal ponytail', category: 'Frontal style', priceKes: null, reviewRequired: true },
  { file: 'frontal-installation.mp4', dept: 'wigs-hair', caption: 'Frontal installation', category: 'Frontal installation', priceKes: null, reviewRequired: true },
  { file: 'fringe human hair.mp4', dept: 'wigs-hair', caption: 'Fringe human hair', category: 'Human hair wig', priceKes: null, reviewRequired: true },
  { file: 'human hair.mp4', dept: 'wigs-hair', caption: 'Human hair', category: 'Human hair wig', priceKes: null, reviewRequired: true },
  { file: 'high quality human hair 32.mp4', dept: 'wigs-hair', caption: 'Human hair, 32-inch (filename)', category: 'Human hair wig', priceKes: null, reviewRequired: true },
  { file: 'latisha wig dupe.mp4', dept: 'wigs-hair', caption: 'Latisha-inspired wig (filename)', category: 'Wig style', priceKes: null, reviewRequired: true },
  { file: 'pixie wig.mp4', dept: 'wigs-hair', caption: 'Pixie wig', category: 'Pixie wig', priceKes: null, reviewRequired: true },

  // ── Makeup ───────────────────────
  { file: 'make up.mp4', dept: 'makeup', caption: 'Makeup look', category: 'Makeup', priceKes: null, reviewRequired: true },
  { file: 'makeup 800.mp4', dept: 'makeup', caption: 'Makeup look', category: 'Makeup', priceKes: null, reviewRequired: true },
  { file: 'makeup @2k.mp4', dept: 'makeup', caption: 'Makeup look', category: 'Makeup', priceKes: null, reviewRequired: true },
];

const DEPT_CATEGORIES: Record<VideoDept, string> = {
  'wigs-hair': 'Wigs & Hair',
  makeup: 'Makeup',
  nails: 'Nails',
  'brows-lashes': 'Brows & Lashes',
};

/** Live catalogue — starts as the default, replaced by the API response. */
export let VIDEOS: Video[] = [...DEFAULT_VIDEOS];

/** Fetch the current public video catalogue from the server. */
export async function loadVideos(): Promise<Video[]> {
  try {
    const res = await fetch('/api/videos');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.videos)) {
        const known = new Map(DEFAULT_VIDEOS.map((video) => [video.file, video]));
        VIDEOS = data.videos.filter((video: Video) => video.published !== false).map((video: Video) => ({
          ...known.get(video.file),
          ...video,
          caption: video.caption || video.title || known.get(video.file)?.caption || video.file,
          category: video.category || known.get(video.file)?.category || DEPT_CATEGORIES[video.dept],
          priceKes: video.priceKes ?? known.get(video.file)?.priceKes ?? null,
          reviewRequired: video.reviewRequired ?? known.get(video.file)?.reviewRequired ?? true,
        }));
      }
    }
  } catch {
    /* keep DEFAULT_VIDEOS as fallback */ }
  return VIDEOS;
}

export function videosByDept(dept: VideoDept): Video[] {
  return VIDEOS.filter(v => v.dept === dept);
}
