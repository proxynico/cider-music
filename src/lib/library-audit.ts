import type { Album, MusicEngine, Playlist, Track } from "./types";

export interface PlaylistTrackSnapshot {
  playlist: Playlist;
  tracks: Track[];
  error?: string;
}

export interface LibrarySnapshot {
  tracks: Track[];
  albums: Album[];
  playlists: Playlist[];
  playlistTracks: PlaylistTrackSnapshot[];
}

export interface CountSummary {
  tracks: number;
  albums: number;
  artists: number;
  albumArtists: number;
  playlists: number;
  playlistTracksFetched: number;
  tracksNotFoundInAnyPlaylist: number;
  duplicateNameArtistBuckets: number;
  exactCatalogDuplicateBuckets: number;
}

export interface CountedValue {
  name: string;
  count: number;
}

export interface DuplicateCandidate {
  key: string;
  count: number;
  tracks: Track[];
}

export interface ExactCatalogDuplicate {
  catalogId: string;
  count: number;
  tracks: Track[];
}

export interface PlaylistAuditSummary {
  name: string;
  id: string;
  reportedTrackCount: number;
  fetchedTrackCount: number;
  durationHours: number;
  topGenres: CountedValue[];
  topArtists: CountedValue[];
  decades: CountedValue[];
  error?: string;
}

export interface ThemeSuggestion {
  playlistName: string;
  playlistId: string;
  candidates: Array<{
    track: Track;
    score: number;
    reasons: string[];
  }>;
}

export interface LibraryAudit {
  generatedAt: string;
  counts: CountSummary;
  topArtists: CountedValue[];
  topAlbumArtists: CountedValue[];
  topGenres: CountedValue[];
  topDecades: CountedValue[];
  topYears: CountedValue[];
  largestAlbums: CountedValue[];
  playlists: {
    largest: PlaylistAuditSummary[];
    smallest: PlaylistAuditSummary[];
    empty: PlaylistAuditSummary[];
    errors: PlaylistAuditSummary[];
  };
  duplicateCandidates: DuplicateCandidate[];
  exactCatalogDuplicates: ExactCatalogDuplicate[];
  orphanTracks: Track[];
  themeSuggestions: ThemeSuggestion[];
}

interface AnalyzeOptions {
  generatedAt?: string;
  suggestionsPerTheme?: number;
  topLimit?: number;
}

interface SnapshotOptions {
  pageSize?: number;
  maxItems?: number;
}

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_ITEMS = 20_000;

function increment(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) || 0) + by);
}

function top(map: Map<string, number>, limit: number): CountedValue[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)|\[[^\]]*]/g, "")
    .replace(
      /\b(remaster(?:ed)?|explicit|clean|deluxe|bonus track|single version|album version|radio edit|mono|stereo)\b/g,
      "",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function trackKey(track: Track): string {
  return `${normalizeText(track.name)}::${normalizeText(track.artist)}`;
}

function decade(year?: number): string {
  if (!year) return "Unknown";
  return `${Math.floor(year / 10) * 10}s`;
}

function sortedPlaylistSummaries(playlistTracks: PlaylistTrackSnapshot[], topLimit: number): PlaylistAuditSummary[] {
  return playlistTracks
    .map(({ playlist, tracks, error }) => {
      const genres = new Map<string, number>();
      const artists = new Map<string, number>();
      const years = new Map<string, number>();

      for (const track of tracks) {
        increment(genres, track.genre || "Unknown");
        increment(artists, track.artist || "Unknown");
        increment(years, decade(track.year));
      }

      return {
        name: playlist.name,
        id: playlist.id,
        reportedTrackCount: playlist.trackCount,
        fetchedTrackCount: tracks.length,
        durationHours: Math.round(tracks.reduce((sum, track) => sum + (track.duration || 0), 0) / 360) / 10,
        topGenres: top(genres, topLimit),
        topArtists: top(artists, topLimit),
        decades: top(years, topLimit),
        error,
      };
    })
    .sort((a, b) => b.fetchedTrackCount - a.fetchedTrackCount || a.name.localeCompare(b.name));
}

function findOrphanTracks(tracks: Track[], playlistTracks: PlaylistTrackSnapshot[]): Track[] {
  const libraryIds = new Set<string>();
  const catalogIds = new Set<string>();
  const keys = new Set<string>();

  for (const snapshot of playlistTracks) {
    for (const track of snapshot.tracks) {
      if (track.libraryId) libraryIds.add(track.libraryId);
      if (track.catalogId) catalogIds.add(track.catalogId);
      keys.add(trackKey(track));
    }
  }

  return tracks.filter(
    (track) =>
      !(track.libraryId && libraryIds.has(track.libraryId)) &&
      !(track.catalogId && catalogIds.has(track.catalogId)) &&
      !keys.has(trackKey(track)),
  );
}

function findDuplicateCandidates(tracks: Track[]): DuplicateCandidate[] {
  const buckets = new Map<string, Track[]>();
  for (const track of tracks) {
    const key = trackKey(track);
    if (!key.startsWith("::")) {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)?.push(track);
    }
  }

  return Array.from(buckets.entries())
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({
      key,
      count: items.length,
      tracks: items,
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function findExactCatalogDuplicates(tracks: Track[]): ExactCatalogDuplicate[] {
  const buckets = new Map<string, Track[]>();
  for (const track of tracks) {
    if (!track.catalogId) continue;
    if (!buckets.has(track.catalogId)) buckets.set(track.catalogId, []);
    buckets.get(track.catalogId)?.push(track);
  }

  return Array.from(buckets.entries())
    .filter(([, items]) => items.length > 1)
    .map(([catalogId, items]) => ({
      catalogId,
      count: items.length,
      tracks: items,
    }))
    .sort((a, b) => b.count - a.count || a.catalogId.localeCompare(b.catalogId));
}

function buildThemeSuggestions(
  playlistTracks: PlaylistTrackSnapshot[],
  orphanTracks: Track[],
  suggestionsPerTheme: number,
): ThemeSuggestion[] {
  const suggestions: ThemeSuggestion[] = [];

  for (const snapshot of playlistTracks) {
    if (snapshot.error || snapshot.tracks.length === 0) continue;

    const genreCounts = new Map<string, number>();
    const artistCounts = new Map<string, number>();
    const decadeCounts = new Map<string, number>();
    for (const track of snapshot.tracks) {
      increment(genreCounts, track.genre || "Unknown");
      increment(artistCounts, track.artist || "Unknown");
      increment(decadeCounts, decade(track.year));
    }

    const topGenres = new Set(top(genreCounts, 8).map((item) => item.name));
    const topArtists = new Set(top(artistCounts, 12).map((item) => item.name));
    const topDecades = new Set(top(decadeCounts, 4).map((item) => item.name));

    const candidates = orphanTracks
      .map((track) => {
        const reasons: string[] = [];
        let score = 0;
        if (track.genre && topGenres.has(track.genre)) {
          score += 5;
          reasons.push(`genre:${track.genre}`);
        }
        if (topArtists.has(track.artist)) {
          score += 4;
          reasons.push(`artist:${track.artist}`);
        }
        const trackDecade = decade(track.year);
        if (trackDecade !== "Unknown" && topDecades.has(trackDecade)) {
          score += 1;
          reasons.push(`decade:${trackDecade}`);
        }
        return { track, score, reasons };
      })
      .filter((candidate) => candidate.score >= 5)
      .sort((a, b) => b.score - a.score || a.track.name.localeCompare(b.track.name))
      .slice(0, suggestionsPerTheme);

    if (candidates.length > 0) {
      suggestions.push({
        playlistName: snapshot.playlist.name,
        playlistId: snapshot.playlist.id,
        candidates,
      });
    }
  }

  return suggestions.sort(
    (a, b) => b.candidates.length - a.candidates.length || a.playlistName.localeCompare(b.playlistName),
  );
}

export function analyzeLibrarySnapshot(snapshot: LibrarySnapshot, options: AnalyzeOptions = {}): LibraryAudit {
  const topLimit = options.topLimit ?? 25;
  const suggestionsPerTheme = options.suggestionsPerTheme ?? 20;
  const artistCounts = new Map<string, number>();
  const albumArtistCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();
  const yearCounts = new Map<string, number>();
  const decadeCounts = new Map<string, number>();
  const albumCounts = new Map<string, number>();

  for (const track of snapshot.tracks) {
    increment(artistCounts, track.artist || "Unknown");
    increment(genreCounts, track.genre || "Unknown");
    increment(yearCounts, track.year ? String(track.year) : "Unknown");
    increment(decadeCounts, decade(track.year));
    increment(albumCounts, `${track.album || "Unknown"} - ${track.artist || "Unknown"}`);
  }
  for (const album of snapshot.albums) {
    increment(albumArtistCounts, album.artist || "Unknown");
  }

  const duplicateCandidates = findDuplicateCandidates(snapshot.tracks);
  const exactCatalogDuplicates = findExactCatalogDuplicates(snapshot.tracks);
  const orphanTracks = findOrphanTracks(snapshot.tracks, snapshot.playlistTracks);
  const playlistSummaries = sortedPlaylistSummaries(snapshot.playlistTracks, 5);

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    counts: {
      tracks: snapshot.tracks.length,
      albums: snapshot.albums.length,
      artists: artistCounts.size,
      albumArtists: albumArtistCounts.size,
      playlists: snapshot.playlists.length,
      playlistTracksFetched: snapshot.playlistTracks.reduce((sum, item) => sum + item.tracks.length, 0),
      tracksNotFoundInAnyPlaylist: orphanTracks.length,
      duplicateNameArtistBuckets: duplicateCandidates.length,
      exactCatalogDuplicateBuckets: exactCatalogDuplicates.length,
    },
    topArtists: top(artistCounts, topLimit),
    topAlbumArtists: top(albumArtistCounts, topLimit),
    topGenres: top(genreCounts, topLimit),
    topDecades: top(decadeCounts, topLimit),
    topYears: top(yearCounts, topLimit),
    largestAlbums: top(albumCounts, topLimit),
    playlists: {
      largest: playlistSummaries.slice(0, topLimit),
      smallest: playlistSummaries
        .slice()
        .sort((a, b) => a.fetchedTrackCount - b.fetchedTrackCount || a.name.localeCompare(b.name))
        .slice(0, topLimit),
      empty: playlistSummaries.filter((playlist) => playlist.fetchedTrackCount === 0),
      errors: playlistSummaries.filter((playlist) => playlist.error),
    },
    duplicateCandidates,
    exactCatalogDuplicates,
    orphanTracks,
    themeSuggestions: buildThemeSuggestions(snapshot.playlistTracks, orphanTracks, suggestionsPerTheme),
  };
}

async function pageAll<T>(
  fetchPage: (limit: number, offset: number) => Promise<T[]>,
  options: Required<SnapshotOptions>,
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < options.maxItems; offset += options.pageSize) {
    const page = await fetchPage(options.pageSize, offset);
    out.push(...page);
    if (page.length < options.pageSize) break;
  }
  return out.slice(0, options.maxItems);
}

export async function collectLibrarySnapshot(
  engine: MusicEngine,
  options: SnapshotOptions = {},
): Promise<LibrarySnapshot> {
  const resolved = {
    pageSize: options.pageSize ?? DEFAULT_PAGE_SIZE,
    maxItems: options.maxItems ?? DEFAULT_MAX_ITEMS,
  };

  // Albums are fetched in a single call rather than paged: the native engine
  // rebuilds the full album set from every library track on each call, so paging
  // it would re-scan the whole library once per page. One call with maxItems
  // returns everything for both engines.
  const [tracks, albums, playlists] = await Promise.all([
    pageAll((limit, offset) => engine.getLibraryTracks(limit, offset), resolved),
    engine.getLibraryAlbums(resolved.maxItems, 0),
    engine.getPlaylists(),
  ]);

  const playlistTracks: PlaylistTrackSnapshot[] = [];
  for (const playlist of playlists) {
    try {
      playlistTracks.push({
        playlist,
        tracks: await engine.getPlaylistTracks(playlist.id),
      });
    } catch (error) {
      playlistTracks.push({
        playlist,
        tracks: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { tracks, albums, playlists, playlistTracks };
}
