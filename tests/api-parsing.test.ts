import { describe, expect, test } from "bun:test";

// We can't import the private parse functions directly, so we test the
// exported helpers they depend on and verify the contract via the entity system.
import { buildIdentity } from "../src/lib/entities";
import { ApiEngine } from "../src/engines/api";
import { AuthError, UnsupportedOperationError, ValidationError } from "../src/lib/errors";

describe("API response field extraction contract", () => {
  test("buildIdentity prefers libraryId for API library entities", () => {
    const identity = buildIdentity({
      source: "api",
      libraryId: "l.ABC123",
      catalogId: "1234567",
    });
    expect(identity.id).toBe("api:library:l.ABC123");
    expect(identity.libraryId).toBe("l.ABC123");
    expect(identity.catalogId).toBe("1234567");
    expect(identity.source).toBe("api");
  });

  test("buildIdentity uses catalogId when no libraryId", () => {
    const identity = buildIdentity({
      source: "api",
      catalogId: "1234567",
    });
    expect(identity.id).toBe("api:catalog:1234567");
    expect(identity.catalogId).toBe("1234567");
    expect(identity.libraryId).toBeUndefined();
  });

  test("buildIdentity throws when no IDs provided", () => {
    expect(() => buildIdentity({ source: "api" })).toThrow("Entity identity requires at least one ID");
  });

  test("buildIdentity handles native derived IDs", () => {
    const identity = buildIdentity({
      source: "native",
      derivedId: "album:OK Computer::Radiohead",
    });
    expect(identity.id).toBe("native:derived:album:OK Computer::Radiohead");
    expect(identity.source).toBe("native");
  });
});

describe("API playlist ID validation", () => {
  test("rejects native playlist refs before making network requests", async () => {
    const engine = new ApiEngine();
    await expect(engine.getPlaylistTracks("native:persistent:ABC123")).rejects.toBeInstanceOf(
      UnsupportedOperationError,
    );
  });

  test("rejects unsafe raw playlist IDs before making network requests", async () => {
    const engine = new ApiEngine();
    await expect(engine.getPlaylistTracks("abc/../def")).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("API storefront discovery", () => {
  test("propagates auth failures instead of silently falling back to us", async () => {
    const engine = new ApiEngine({
      request: async (path: string) => {
        if (path === "/me/storefront") {
          throw new AuthError("expired token");
        }
        throw new Error(`unexpected request: ${path}`);
      },
      configLoader: async () => ({ defaultEngine: "api", storefront: "auto" }),
    });

    await expect(engine.search("radiohead", ["track"], 1)).rejects.toThrow("expired token");
  });
});

describe("API pagination", () => {
  test("follows next links for library tracks", async () => {
    const calls: { path: string; params?: Record<string, string> }[] = [];
    const engine = new ApiEngine({
      request: async <T>(path: string, params?: Record<string, string>): Promise<T> => {
        calls.push({ path, params });
        if (path === "/me/library/songs" && params?.offset === "0") {
          return {
            data: [
              {
                id: "l.one",
                type: "library-songs",
                attributes: { name: "One", artistName: "A", albumName: "First", durationInMillis: 1000 },
              },
            ],
            next: "/v1/me/library/songs?offset=1&limit=1",
          } as T;
        }
        if (path === "/me/library/songs" && params?.offset === "1") {
          return {
            data: [
              {
                id: "l.two",
                type: "library-songs",
                attributes: { name: "Two", artistName: "B", albumName: "Second", durationInMillis: 2000 },
              },
            ],
          } as T;
        }
        throw new Error(`unexpected request: ${path}`);
      },
    });

    const tracks = await engine.getLibraryTracks(2, 0);

    expect(tracks.map((t) => t.libraryId)).toEqual(["l.one", "l.two"]);
    expect(calls).toEqual([
      { path: "/me/library/songs", params: { limit: "2", offset: "0" } },
      { path: "/me/library/songs", params: { offset: "1", limit: "1" } },
    ]);
  });

  test("follows next links for playlist tracks", async () => {
    const calls: string[] = [];
    const engine = new ApiEngine({
      request: async <T>(path: string, params?: Record<string, string>): Promise<T> => {
        calls.push(`${path}?${new URLSearchParams(params).toString()}`);
        if (path === "/me/library/playlists/l.playlist/tracks" && params?.limit === "100" && !params?.offset) {
          return {
            data: [
              {
                id: "l.one",
                type: "library-songs",
                attributes: { name: "One", artistName: "A", albumName: "First", durationInMillis: 1000 },
              },
            ],
            next: "https://amp-api.music.apple.com/v1/me/library/playlists/l.playlist/tracks?offset=100&limit=100",
          } as T;
        }
        if (path === "/me/library/playlists/l.playlist/tracks" && params?.offset === "100") {
          return {
            data: [
              {
                id: "l.two",
                type: "library-songs",
                attributes: { name: "Two", artistName: "B", albumName: "Second", durationInMillis: 2000 },
              },
            ],
          } as T;
        }
        throw new Error(`unexpected request: ${path}`);
      },
    });

    const tracks = await engine.getPlaylistTracks("api:library:l.playlist");

    expect(tracks.map((t) => t.libraryId)).toEqual(["l.one", "l.two"]);
    expect(calls).toEqual([
      "/me/library/playlists/l.playlist/tracks?limit=100",
      "/me/library/playlists/l.playlist/tracks?offset=100&limit=100",
    ]);
  });
});
