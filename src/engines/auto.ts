import type {
  EngineCapabilities,
  MusicEngine,
  Track,
  Album,
  Playlist,
  PlaylistDetails,
  SearchResults,
  SearchType,
} from "../lib/types";
import { NativeEngine } from "./native";
import { ApiEngine } from "./api";
import { getMediaUserToken } from "../lib/config";

/**
 * Auto engine — uses native for playback, API for catalog/library when available.
 * If no API auth is configured, everything routes through native.
 * If API auth exists but a request fails, the error propagates — no silent fallback.
 */
export class AutoEngine implements MusicEngine {
  name = "auto";
  capabilities: EngineCapabilities = {
    playback: true,
    queue: false,
    playlistMutation: true,
    devices: true,
    catalogSearch: true,
    libraryRead: true,
    shuffle: true,
    repeat: true,
  };

  private apiAvailable: boolean | null = null;

  constructor(
    private native: MusicEngine = new NativeEngine(),
    private api: MusicEngine = new ApiEngine(),
    private tokenLoader: () => Promise<string | undefined> = getMediaUserToken,
  ) {}

  private async hasApi(): Promise<boolean> {
    if (this.apiAvailable !== null) return this.apiAvailable;
    const token = await this.tokenLoader();
    this.apiAvailable = !!token;
    return this.apiAvailable;
  }

  // Playback always goes through native
  play(query?: string) {
    return this.native.play(query);
  }
  pause() {
    return this.native.pause();
  }
  resume() {
    return this.native.resume();
  }
  next() {
    return this.native.next();
  }
  previous() {
    return this.native.previous();
  }
  seek(seconds: number) {
    return this.native.seek(seconds);
  }
  setVolume(level: number) {
    return this.native.setVolume(level);
  }
  getVolume() {
    return this.native.getVolume();
  }
  setShuffle(enabled: boolean) {
    return this.native.setShuffle(enabled);
  }
  getShuffle() {
    return this.native.getShuffle();
  }
  setRepeat(mode: "off" | "one" | "all") {
    return this.native.setRepeat(mode);
  }
  getRepeat() {
    return this.native.getRepeat();
  }
  getStatus() {
    return this.native.getStatus();
  }
  getDevices() {
    return this.native.getDevices();
  }
  addToQueue(trackId: string) {
    return this.native.addToQueue(trackId);
  }
  addToPlaylist(playlistId: string, trackIds: string[]) {
    return this.native.addToPlaylist(playlistId, trackIds);
  }
  removeFromPlaylist(playlistId: string, trackIds: string[]) {
    return this.native.removeFromPlaylist(playlistId, trackIds);
  }

  // Search: use API for catalog search when authenticated, otherwise use native library search.
  async search(query: string, types: SearchType[], limit?: number): Promise<SearchResults> {
    if (await this.hasApi()) {
      return this.api.search(query, types, limit);
    }
    return this.native.search(query, types, limit);
  }

  // Library: prefer API when authenticated for richer metadata; otherwise use native.
  async getPlaylists(): Promise<Playlist[]> {
    if (await this.hasApi()) return this.api.getPlaylists();
    return this.native.getPlaylists();
  }

  async getPlaylistTracks(playlistId: string): Promise<Track[]> {
    if (await this.hasApi()) return this.api.getPlaylistTracks(playlistId);
    return this.native.getPlaylistTracks(playlistId);
  }

  async getPlaylistInfo(playlistId: string): Promise<PlaylistDetails> {
    if (await this.hasApi()) return this.api.getPlaylistInfo(playlistId);
    return this.native.getPlaylistInfo(playlistId);
  }

  async getLibraryTracks(limit?: number, offset?: number): Promise<Track[]> {
    if (await this.hasApi()) return this.api.getLibraryTracks(limit, offset);
    return this.native.getLibraryTracks(limit, offset);
  }

  async getLibraryAlbums(limit?: number, offset?: number): Promise<Album[]> {
    if (await this.hasApi()) return this.api.getLibraryAlbums(limit, offset);
    return this.native.getLibraryAlbums(limit, offset);
  }
}
