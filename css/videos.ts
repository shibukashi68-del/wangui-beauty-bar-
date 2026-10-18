// Video catalogue for the gallery.
//
// Video files are served from the project-level /video URL by server.mjs.
// If you change the server's static routes, update VIDEO_DIR too.
//
// `file` must match the real filename exactly, including spaces and capitals.
// A file that is missing shows a graceful "unavailable" tile instead of a
// broken player, so typos are visible rather than silent.
//
// Videos are loaded dynamically from /api/videos so staff can add new clips
// through the admin panel without editing code. The static list below is used
// as a fallback until the API responds (or if the server is unavailable).

export type VideoDept = 'wigs-hair' | 'makeup' | 'nails' | 'brows-lashes';

export interface Video {
  /** Filename inside /video. */
  file: string;
  dept: VideoDept;
  /** Shown under the tile. Keep it short and client-facing. */
  caption: string;
}

/** URL prefix for the project's video files. */
export const VIDEO_DIR = '/video/';

/** Default catalogue shipped with the site. */
export const DEFAULT_VIDEOS: Video[] = [
  // ── Wigs & Hair ──────────────────
  { file: 'wig-install-hero.mp4',        dept: 'wigs-hair', caption: 'Wig installation' },
  { file: 'wig installation.mp4',        dept: 'wigs-hair', caption: 'Wig installation' },
  { file: 'wig install.mp4',             dept: 'wigs-hair', caption: 'Wig install' },
  { file: 'wig @install.mp4',            dept: 'wigs-hair', caption: 'Wig & install' },
  { file: 'wig @ 7k.mp4',                dept: 'wigs-hair', caption: 'Wig — KES 7,000' },
  { file: 'wig @18k.mp4',                dept: 'wigs-hair', caption: 'Wig — KES 18,000' },
  { file: 'wig.mp4',                     dept: 'wigs-hair', caption: 'Wig' },
  { file: 'install 1 k.mp4',             dept: 'wigs-hair', caption: 'Install — KES 1,000' },
  { file: 'colour ginger.mp4',           dept: 'wigs-hair', caption: 'Ginger colour' },
  { file: 'ginger wig.mp4',              dept: 'wigs-hair', caption: 'Ginger wig' },
  { file: 'frontal ponytail.mp4',        dept: 'wigs-hair', caption: 'Frontal ponytail' },
  { file: 'frontal-installation.mp4',    dept: 'wigs-hair', caption: 'Frontal installation' },
  { file: 'fringe human hair.mp4',       dept: 'wigs-hair', caption: 'Fringe human hair' },
  { file: 'human hair.mp4',              dept: 'wigs-hair', caption: 'Human hair' },
  { file: 'high quality human hair 32.mp4', dept: 'wigs-hair', caption: 'Human hair 32"' },
  { file: 'latisha wig dupe.mp4',        dept: 'wigs-hair', caption: 'Latisha wig dupe' },
  { file: 'pixie wig.mp4',               dept: 'wigs-hair', caption: 'Pixie wig' },

  // ── Makeup ───────────────────────
  { file: 'make up.mp4',                 dept: 'makeup', caption: 'Makeup' },
  { file: 'makeup 800.mp4',              dept: 'makeup', caption: 'Makeup — KES 800' },
  { file: 'makeup @2k.mp4',              dept: 'makeup', caption: 'Makeup — KES 2,000' },
];

/** Live catalogue — starts as the default, replaced by the API response. */
export let VIDEOS: Video[] = [...DEFAULT_VIDEOS];

/** Fetch the latest video list from the server (uploaded + default). */
export async function loadVideos(): Promise<Video[]> {
  try {
    const res = await fetch('/api/videos');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.videos)) {
        VIDEOS = data.videos;
      }
    }
  } catch {
    /* keep DEFAULT_VIDEOS as fallback */ }
  return VIDEOS;
}

export function videosByDept(dept: VideoDept): Video[] {
  return VIDEOS.filter(v => v.dept === dept);
}
