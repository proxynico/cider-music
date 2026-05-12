import type { OutputMode, Track, Album, Artist, Playlist, PlaylistDetails, PlaybackState, Device, SearchResults } from "./types";
import { isCiderError, ValidationError } from "./errors";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const WHITE = "\x1b[37m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";

let colorEnabled = true;

export function setColorEnabled(enabled: boolean) {
  colorEnabled = enabled;
}

function c(code: string, text: string): string {
  if (!colorEnabled) return text;
  return `${code}${text}${RESET}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function tsv(value: unknown): string {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\t", "\\t")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
}

// ── JSON output ──

export function outputJson(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

// ── Plain output (tab-separated, scriptable) ──

export function outputPlainTrack(t: Track) {
  console.log(`track\t${tsv(t.id)}\t${tsv(t.name)}\t${tsv(t.artist)}\t${tsv(t.album)}\t${formatDuration(t.duration)}\t${tsv(t.source)}`);
}

export function outputPlainAlbum(a: Album) {
  console.log(`album\t${tsv(a.id)}\t${tsv(a.name)}\t${tsv(a.artist)}\t${a.trackCount}\t${a.year ?? ""}\t${tsv(a.source)}`);
}

export function outputPlainArtist(a: Artist) {
  console.log(`artist\t${tsv(a.id)}\t${tsv(a.name)}\t${tsv(a.genre)}\t${tsv(a.source)}`);
}

export function outputPlainPlaylist(p: Playlist) {
  console.log(`playlist\t${tsv(p.id)}\t${tsv(p.name)}\t${p.trackCount}\t${tsv(p.source)}`);
}

export function outputPlainStatus(s: PlaybackState) {
  if (!s.track) {
    console.log(`stopped\t0\t0\t${s.volume}`);
    return;
  }
  console.log(`${tsv(s.state)}\t${tsv(s.track.name)}\t${tsv(s.track.artist)}\t${formatDuration(s.position)}/${formatDuration(s.track.duration)}\t${s.volume}`);
}

// ── Human output (colorized) ──

export function outputHumanTrack(t: Track, index?: number) {
  const prefix = index !== undefined ? c(DIM, `${(index + 1).toString().padStart(3)}.`) + " " : "";
  const duration = c(DIM, formatDuration(t.duration));
  console.log(`${prefix}${c(BOLD + WHITE, t.name)} ${c(DIM, "--")} ${c(CYAN, t.artist)} ${c(DIM, "/")} ${c(DIM, t.album)} ${duration}`);
}

export function outputHumanAlbum(a: Album, index?: number) {
  const prefix = index !== undefined ? c(DIM, `${(index + 1).toString().padStart(3)}.`) + " " : "";
  const year = a.year ? c(DIM, `(${a.year})`) : "";
  console.log(`${prefix}${c(BOLD + WHITE, a.name)} ${c(DIM, "--")} ${c(CYAN, a.artist)} ${year} ${c(DIM, `${a.trackCount} tracks`)}`);
}

export function outputHumanArtist(a: Artist, index?: number) {
  const prefix = index !== undefined ? c(DIM, `${(index + 1).toString().padStart(3)}.`) + " " : "";
  const genre = a.genre ? c(DIM, `(${a.genre})`) : "";
  console.log(`${prefix}${c(BOLD + WHITE, a.name)} ${genre}`);
}

export function outputHumanPlaylist(p: Playlist, index?: number) {
  const prefix = index !== undefined ? c(DIM, `${(index + 1).toString().padStart(3)}.`) + " " : "";
  console.log(`${prefix}${c(BOLD + WHITE, p.name)} ${c(DIM, `${p.trackCount} tracks`)}`);
}

export function outputHumanStatus(s: PlaybackState) {
  if (!s.track) {
    console.log(c(DIM, "Not playing"));
    return;
  }

  const stateIcon = s.state === "playing" ? c(GREEN, "playing") : c(YELLOW, "paused");
  const progress = `${formatDuration(s.position)} / ${formatDuration(s.track.duration)}`;
  const shuffle = s.shuffleEnabled ? c(MAGENTA, " [shuffle]") : "";
  const repeat = s.repeatMode !== "off" ? c(MAGENTA, ` [repeat ${s.repeatMode}]`) : "";

  console.log(`${stateIcon} ${c(DIM, "--")} ${c(DIM, progress)}${shuffle}${repeat}`);
  console.log(`${c(BOLD + WHITE, s.track.name)} ${c(DIM, "--")} ${c(CYAN, s.track.artist)}`);
  if (s.track.album) {
    console.log(c(DIM, s.track.album));
  }
}

export function outputHumanDevice(d: Device, index?: number) {
  const prefix = index !== undefined ? c(DIM, `${(index + 1).toString().padStart(3)}.`) + " " : "";
  const active = d.active ? c(GREEN, " (active)") : "";
  console.log(`${prefix}${c(BOLD + WHITE, d.name)} ${c(DIM, d.kind)}${active}`);
}

// ── Dispatcher ──

export function getOutputMode(opts: { json?: boolean; plain?: boolean }): OutputMode {
  if (opts.json && opts.plain) {
    throw new ValidationError("--json and --plain cannot be used together");
  }
  if (opts.json) return "json";
  if (opts.plain) return "plain";
  return "human";
}

export function outputTracks(tracks: Track[], mode: OutputMode) {
  if (mode === "json") return outputJson(tracks);
  if (mode === "plain") return tracks.forEach(outputPlainTrack);
  if (tracks.length === 0) return console.log(c(DIM, "No tracks found"));
  console.log(c(DIM, `${tracks.length} track${tracks.length === 1 ? "" : "s"}`));
  tracks.forEach((t, i) => outputHumanTrack(t, i));
}

export function outputAlbums(albums: Album[], mode: OutputMode) {
  if (mode === "json") return outputJson(albums);
  if (mode === "plain") return albums.forEach(outputPlainAlbum);
  if (albums.length === 0) return console.log(c(DIM, "No albums found"));
  console.log(c(DIM, `${albums.length} album${albums.length === 1 ? "" : "s"}`));
  albums.forEach((a, i) => outputHumanAlbum(a, i));
}

export function outputArtists(artists: Artist[], mode: OutputMode) {
  if (mode === "json") return outputJson(artists);
  if (mode === "plain") return artists.forEach(outputPlainArtist);
  if (artists.length === 0) return console.log(c(DIM, "No artists found"));
  console.log(c(DIM, `${artists.length} artist${artists.length === 1 ? "" : "s"}`));
  artists.forEach((a, i) => outputHumanArtist(a, i));
}

export function outputPlaylists(playlists: Playlist[], mode: OutputMode) {
  if (mode === "json") return outputJson(playlists);
  if (mode === "plain") return playlists.forEach(outputPlainPlaylist);
  if (playlists.length === 0) return console.log(c(DIM, "No playlists found"));
  console.log(c(DIM, `${playlists.length} playlist${playlists.length === 1 ? "" : "s"}`));
  playlists.forEach((p, i) => outputHumanPlaylist(p, i));
}

export function outputStatus(status: PlaybackState, mode: OutputMode) {
  if (mode === "json") return outputJson(status);
  if (mode === "plain") return outputPlainStatus(status);
  outputHumanStatus(status);
}

export function outputDevices(devices: Device[], mode: OutputMode) {
  if (mode === "json") return outputJson(devices);
  if (mode === "plain") return devices.forEach(d => console.log(`device\t${tsv(d.id)}\t${tsv(d.name)}\t${tsv(d.kind)}\t${d.active}`));
  if (devices.length === 0) return console.log(c(DIM, "No devices found"));
  devices.forEach((d, i) => outputHumanDevice(d, i));
}

export function outputSearchResults(results: SearchResults, mode: OutputMode) {
  if (mode === "json") return outputJson(results);

  const hasResults = results.tracks.length > 0
    || results.albums.length > 0
    || results.artists.length > 0
    || results.playlists.length > 0;

  if (!hasResults) {
    if (mode === "human") console.log(c(DIM, "No results found"));
    return;
  }

  if (results.tracks.length > 0) {
    if (mode !== "plain") console.log(c(BOLD + CYAN, "\nTracks"));
    outputTracks(results.tracks, mode);
  }
  if (results.albums.length > 0) {
    if (mode !== "plain") console.log(c(BOLD + CYAN, "\nAlbums"));
    outputAlbums(results.albums, mode);
  }
  if (results.artists.length > 0) {
    if (mode !== "plain") console.log(c(BOLD + CYAN, "\nArtists"));
    outputArtists(results.artists, mode);
  }
  if (results.playlists.length > 0) {
    if (mode !== "plain") console.log(c(BOLD + CYAN, "\nPlaylists"));
    outputPlaylists(results.playlists, mode);
  }
}

export function outputPlaylistDetails(details: PlaylistDetails, mode: OutputMode) {
  if (mode === "json") return outputJson(details);

  if (mode === "plain") {
    console.log(`playlist\t${tsv(details.id)}\t${tsv(details.name)}\t${details.trackCount}\t${details.totalDuration}\t${tsv(details.description)}`);
    if (details.artworkPath) console.log(`artwork\t${tsv(details.artworkPath)}`);
    if (details.artworkUrl) console.log(`artwork_url\t${tsv(details.artworkUrl)}`);
    details.topArtists.forEach(a => console.log(`artist\t${tsv(a.name)}\t${a.count}`));
    details.genres.forEach(g => console.log(`genre\t${tsv(g.name)}\t${g.count}`));
    return;
  }

  // Human output
  console.log(c(BOLD + WHITE, details.name));
  if (details.description) {
    console.log(c(DIM, details.description));
  }
  console.log();

  const hours = Math.floor(details.totalDuration / 3600);
  const mins = Math.floor((details.totalDuration % 3600) / 60);
  const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  console.log(`${c(CYAN, String(details.trackCount))} tracks ${c(DIM, "--")} ${c(CYAN, durationStr)}`);

  if (details.artworkPath) {
    console.log(`${c(DIM, "Artwork:")} ${details.artworkPath}`);
  }
  if (details.artworkUrl) {
    console.log(`${c(DIM, "Artwork:")} ${details.artworkUrl}`);
  }

  if (details.topArtists.length > 0) {
    console.log(c(BOLD + CYAN, "\nTop Artists"));
    for (const a of details.topArtists) {
      const bar = "=".repeat(Math.min(a.count, 40));
      console.log(`  ${c(WHITE, a.name.padEnd(25))} ${c(DIM, bar)} ${c(DIM, String(a.count))}`);
    }
  }

  if (details.genres.length > 0) {
    console.log(c(BOLD + CYAN, "\nGenres"));
    for (const g of details.genres) {
      const bar = "=".repeat(Math.min(g.count, 40));
      console.log(`  ${c(WHITE, g.name.padEnd(25))} ${c(DIM, bar)} ${c(DIM, String(g.count))}`);
    }
  }
}

export function outputKeyValue(key: string, value: string) {
  console.log(`${c(DIM, key + ":")} ${value}`);
}

export function outputMessage(msg: string) {
  console.log(c(GREEN, msg));
}

export function outputError(msg: string) {
  console.error(c(RED, `error: ${msg}`));
}

export function outputErrorDetails(error: unknown) {
  if (isCiderError(error)) {
    outputError(error.message);
    if (error.hint) {
      console.error(c(DIM, error.hint));
    }
    return;
  }

  if (error instanceof Error) {
    outputError(error.message);
    return;
  }

  outputError(String(error));
}
