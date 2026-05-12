# Cider Music

Apple Music CLI for power users and AI agents.

Like [Spogo](https://github.com/steipete/spogo) for Spotify, but for Apple Music. Control playback, search the catalog, manage your library -- all from the terminal with JSON output for automation.

## Architecture

Three engine modes:

| Engine | What it does | Auth needed |
|--------|-------------|-------------|
| **Native** | Controls Music.app via JXA (JavaScript for Automation). Playback, library, playlists, shuffle, repeat, AirPlay. | None |
| **API** | Queries Apple Music catalog and library via `amp-api.music.apple.com`. 100M+ tracks. | Apple Music web token |
| **Auto** (default) | Native for playback, API for catalog/library when authenticated. Error propagates on API failure -- no silent fallback. | Optional |

The native engine works out of the box on macOS -- no API keys, no rate limits, no auth. The API engine adds full catalog search and richer library metadata using your browser's `media-user-token`. Tokens are stored in the macOS Keychain.

## Install

```bash
git clone https://github.com/proxynico/cider-music.git
cd cider-music
bun install
bun link
```

### Build single binary

```bash
bun run build
# Creates ./dist/cider-music
```

## Quick Start

```bash
# Check what's playing
cider-music status

# Play / pause / skip
cider-music play
cider-music pause
cider-music next
cider-music prev

# Search your library (or full catalog with API auth)
cider-music search track "radiohead"
cider-music search album "ok computer"
cider-music search artist "beatles"

# Volume
cider-music volume        # get current
cider-music volume 60     # set to 60

# Shuffle and repeat
cider-music shuffle on
cider-music repeat all

# Playlists
cider-music library playlists
cider-music library playlist <id>
cider-music playlist info <id>

# Defaults
cider-music config status
cider-music config engine auto
cider-music config storefront auto
```

## Output Modes

Every command supports three output modes:

```bash
# Human-readable (default) -- colorized, formatted
cider-music status

# JSON -- machine-readable, stable schema
cider-music status --json

# Plain -- tab-separated, pipe-friendly
cider-music status --plain
```

The `--json` flag makes Cider Music agent-friendly. AI agents can parse structured output without scraping terminal formatting.

## Entity IDs

All entities (tracks, albums, artists, playlists) carry source-qualified IDs:

| Format | Meaning |
|--------|---------|
| `native:persistent:ABC123` | Music.app persistent ID |
| `api:library:l.ABC123` | Apple Music library ID |
| `api:catalog:1234567` | Apple Music catalog ID |
| `native:derived:album:...` | Derived from track search (no direct ID) |

JSON output includes `id`, `source`, and explicit `persistentId`, `libraryId`, `catalogId` fields when available. Native-only mutation commands (playlist add/remove) require native persistent IDs.

If Cider Music cannot perform an operation safely, it fails explicitly rather than doing something surprising.

## Apple Music API Setup (Optional)

The native engine handles playback without any setup. To unlock **full catalog search**, set up the API engine:

```bash
# Auto-import from Safari (easiest)
cider-music auth import --browser safari

# Or from Chrome/Firefox/Edge/Brave
cider-music auth import --browser chrome

# Or paste the token manually
cider-music auth token <paste-here>

# Check status
cider-music auth status
```

Tokens are stored in the macOS Keychain (`cider-music` service), not in config files.

## Engine Selection

```bash
# Auto (default): native for playback, API for catalog/library when available
cider-music search track "new song"

# Force native: library-only search, no network
cider-music --engine native search track "radiohead"

# Force API: catalog search (requires auth)
cider-music --engine api search track "new release"
```

Persistent defaults:

```bash
cider-music config engine auto
cider-music config storefront auto
```

## All Commands

```
Playback:    play [query] | pause | resume | next | prev | seek <s> | status
Volume:      volume [0-100]
Modes:       shuffle [on|off] | repeat [off|one|all]
Search:      search track|album|artist|playlist|all <query> [-l limit]
Library:     library tracks|albums|playlists | library playlist <id>
Playlists:   playlist info <id> | playlist add <id> <trackIds...> | playlist remove <id> <trackIds...>
Queue:       queue add <trackId>   (fails explicitly; reliable Music.app queueing not implemented)
Devices:     devices
Auth:        auth import|token|status|clear
Config:      config status | config engine [native|api|auto] | config storefront [code|auto]
```

## Global Flags

```
--json         JSON output
--plain        Tab-separated output
--no-color     Disable colors
--engine <e>   native | api | auto
-v, --verbose  Verbose output
```

## Requirements

- macOS (native engine uses Music.app via JXA)
- [Bun](https://bun.sh) runtime
- Music.app (comes with macOS)
- Apple Music subscription (for API catalog search)

### Codex and GUI Automation

Music.app scripting requires a normal macOS GUI session plus Automation
permission for the calling app. If `cider-music status --json` works in your
terminal but fails inside a Codex/cmux tool session with a scripting-interface
error, run the whole command through the GUI user session:

```bash
launchctl asuser "$(id -u)" bun run src/index.ts status --json
```

Do not wrap only `osascript` inside `launchctl asuser` from an already-running
Codex-launched Bun process; launch the whole CLI command that way.

## How It Works

**Native engine**: Executes JXA scripts via `osascript` to control Music.app directly. No network, no rate limits, instant response. Supports playback, library search, playlist management, shuffle, repeat, and AirPlay device listing. All user inputs are validated and safely interpolated via `JSON.stringify()`.

**API engine**: Uses the `media-user-token` from your browser (set when you log into music.apple.com) with Apple's `amp-api.music.apple.com` endpoints. The developer token is extracted from the web player's JS bundle with JWT validation and a 30-minute cache. Storefront is configurable and defaults to auto-discovery. API responses are parsed through type-safe extraction helpers.

**Auto engine**: Combines both. Playback always goes through native. Search and library queries use API when authentication exists, otherwise native. If API auth exists but a request fails, the error surfaces immediately -- Cider Music never silently changes which engine handles a request.

## Error Handling

Cider Music uses a structured error hierarchy with error codes and actionable hints:

- **ValidationError** -- invalid user input (bad integer, unknown engine, etc.)
- **AuthError** -- missing or expired Apple Music token
- **ExternalServiceError** -- Music.app not running, API failure, cookie extraction failure
- **UnsupportedOperationError** -- operation not available on the selected engine

All errors print to stderr with a colored message and optional hint line.

## Development

```bash
bun install
bun run typecheck               # tsc --noEmit
bun test                        # 51 tests across 10 files
bun run check                   # typecheck + test
bun run src/index.ts status     # run without building
```

## License

MIT
