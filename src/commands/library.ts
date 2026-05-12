import type { Command } from "commander";
import type { MusicEngine } from "../lib/types";
import { parseInteger } from "../lib/input";
import { analyzeLibrarySnapshot, collectLibrarySnapshot } from "../lib/library-audit";
import {
  getOutputMode,
  outputTracks,
  outputAlbums,
  outputPlaylists,
  outputPlaylistDetails,
  outputJson,
  outputMessage,
  outputLibraryAudit,
  outputLibraryDuplicates,
  outputLibraryOrphans,
  outputLibraryThemes,
} from "../lib/output";

export function registerLibraryCommands(program: Command, getEngine: () => MusicEngine) {
  const library = program.command("library").alias("lib").description("Browse your music library");

  async function buildAudit(opts: { pageSize?: string; maxItems?: string; suggestions?: string } = {}) {
    const engine = getEngine();
    const snapshot = await collectLibrarySnapshot(engine, {
      pageSize: parseInteger("page size", opts.pageSize ?? "100", { min: 1, max: 100 }),
      maxItems: parseInteger("max items", opts.maxItems ?? "20000", { min: 1 }),
    });
    return analyzeLibrarySnapshot(snapshot, {
      suggestionsPerTheme: parseInteger("suggestions", opts.suggestions ?? "20", { min: 1 }),
    });
  }

  library
    .command("tracks")
    .alias("songs")
    .description("List library tracks")
    .option("-l, --limit <n>", "Max results", "50")
    .option("-o, --offset <n>", "Offset", "0")
    .action(async (opts) => {
      const engine = getEngine();
      const tracks = await engine.getLibraryTracks(
        parseInteger("limit", opts.limit, { min: 1 }),
        parseInteger("offset", opts.offset, { min: 0 }),
      );
      const mode = getOutputMode(program.opts());
      outputTracks(tracks, mode);
    });

  library
    .command("albums")
    .description("List library albums")
    .option("-l, --limit <n>", "Max results", "50")
    .option("-o, --offset <n>", "Offset", "0")
    .action(async (opts) => {
      const engine = getEngine();
      const albums = await engine.getLibraryAlbums(
        parseInteger("limit", opts.limit, { min: 1 }),
        parseInteger("offset", opts.offset, { min: 0 }),
      );
      const mode = getOutputMode(program.opts());
      outputAlbums(albums, mode);
    });

  library
    .command("playlists")
    .description("List your playlists")
    .action(async () => {
      const engine = getEngine();
      const playlists = await engine.getPlaylists();
      const mode = getOutputMode(program.opts());
      outputPlaylists(playlists, mode);
    });

  library
    .command("playlist <id>")
    .description("Show tracks in a playlist")
    .action(async (id: string) => {
      const engine = getEngine();
      const tracks = await engine.getPlaylistTracks(id);
      const mode = getOutputMode(program.opts());
      outputTracks(tracks, mode);
    });

  library
    .command("audit")
    .description("Read-only library audit: counts, genres, playlists, duplicates, orphans, and theme suggestions")
    .option("--page-size <n>", "Library page size", "100")
    .option("--max-items <n>", "Max library tracks/albums to scan", "20000")
    .option("--suggestions <n>", "Theme suggestions per playlist", "20")
    .action(async (opts) => {
      const audit = await buildAudit(opts);
      const mode = getOutputMode(program.opts());
      outputLibraryAudit(audit, mode);
    });

  library
    .command("duplicates")
    .description("Show read-only duplicate candidates")
    .option("-l, --limit <n>", "Max duplicate buckets per type", "25")
    .option("--page-size <n>", "Library page size", "100")
    .option("--max-items <n>", "Max library tracks/albums to scan", "20000")
    .action(async (opts) => {
      const audit = await buildAudit(opts);
      const mode = getOutputMode(program.opts());
      outputLibraryDuplicates(audit, mode, parseInteger("limit", opts.limit, { min: 1 }));
    });

  library
    .command("orphans")
    .description("Show tracks that are not represented in any normal playlist")
    .option("-l, --limit <n>", "Max tracks to output", "100")
    .option("--page-size <n>", "Library page size", "100")
    .option("--max-items <n>", "Max library tracks/albums to scan", "20000")
    .action(async (opts) => {
      const audit = await buildAudit(opts);
      const mode = getOutputMode(program.opts());
      outputLibraryOrphans(audit, mode, parseInteger("limit", opts.limit, { min: 1 }));
    });

  library
    .command("themes")
    .description("Suggest orphan tracks that fit existing playlist themes")
    .option("-l, --limit <n>", "Max suggestions per playlist to output", "20")
    .option("--page-size <n>", "Library page size", "100")
    .option("--max-items <n>", "Max library tracks/albums to scan", "20000")
    .option("--suggestions <n>", "Candidates to compute per playlist", "50")
    .action(async (opts) => {
      const audit = await buildAudit(opts);
      const mode = getOutputMode(program.opts());
      outputLibraryThemes(audit, mode, parseInteger("limit", opts.limit, { min: 1 }));
    });

  // ── Playlist info (details, artwork, description, stats) ──

  const pl = program.command("playlist").alias("pl").description("Playlist management");

  pl
    .command("info <id>")
    .description("Show playlist details: description, artwork, top artists, genres")
    .action(async (id: string) => {
      const engine = getEngine();
      const details = await engine.getPlaylistInfo(id);
      const mode = getOutputMode(program.opts());
      outputPlaylistDetails(details, mode);
    });

  // ── Playlist editing ──

  pl
    .command("add <playlistId> <trackIds...>")
    .description("Add one or more tracks to a playlist by their persistent IDs")
    .action(async (playlistId: string, trackIds: string[]) => {
      const engine = getEngine();
      const mode = getOutputMode(program.opts());
      await engine.addToPlaylist(playlistId, trackIds);
      if (mode === "json") {
        outputJson({ action: "playlist_add", playlistId, trackIds, count: trackIds.length });
      } else if (mode !== "plain") {
        outputMessage(`Added ${trackIds.length} track${trackIds.length === 1 ? "" : "s"} to playlist`);
      }
    });

  pl
    .command("remove <playlistId> <trackIds...>")
    .alias("rm")
    .description("Remove one or more tracks from a playlist by their persistent IDs")
    .action(async (playlistId: string, trackIds: string[]) => {
      const engine = getEngine();
      const mode = getOutputMode(program.opts());
      await engine.removeFromPlaylist(playlistId, trackIds);
      if (mode === "json") {
        outputJson({ action: "playlist_remove", playlistId, trackIds, count: trackIds.length });
      } else if (mode !== "plain") {
        outputMessage(`Removed ${trackIds.length} track${trackIds.length === 1 ? "" : "s"} from playlist`);
      }
    });

  pl
    .command("tracks <id>")
    .description("List tracks in a playlist (alias for library playlist)")
    .action(async (id: string) => {
      const engine = getEngine();
      const tracks = await engine.getPlaylistTracks(id);
      const mode = getOutputMode(program.opts());
      outputTracks(tracks, mode);
    });

  pl
    .command("list")
    .alias("ls")
    .description("List all playlists")
    .action(async () => {
      const engine = getEngine();
      const playlists = await engine.getPlaylists();
      const mode = getOutputMode(program.opts());
      outputPlaylists(playlists, mode);
    });
}
