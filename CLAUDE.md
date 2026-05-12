# Cider Music

Apple Music CLI for power users and AI agents. Inspired by [Spogo](https://github.com/steipete/spogo) (Spotify CLI).

GitHub repo: `https://github.com/proxynico/cider-music`

## Stack

- **Runtime:** Bun
- **Language:** TypeScript (strict mode)
- **CLI framework:** Commander.js
- **macOS integration:** JXA (JavaScript for Automation) via `osascript`
- **Apple Music API:** Cookie-based auth against `amp-api.music.apple.com`
- **Secrets:** macOS Keychain via `security` CLI

## Architecture

Three engines behind one interface (`MusicEngine`):

| Engine | Purpose | Auth |
|--------|---------|------|
| **Native** (`engines/native.ts`) | Controls Music.app via JXA. Playback, library, playlists, shuffle, repeat, AirPlay. No network. Auto-launches Music.app silently if not running. | None |
| **API** (`engines/api.ts`) | Full Apple Music catalog + library via `amp-api.music.apple.com`. Search 100M+ tracks. | `media-user-token` in Keychain |
| **Auto** (`engines/auto.ts`) | Routes: native for playback, API for catalog/library when authenticated. If API auth fails, error propagates (no silent fallback). | Optional |

All engines implement `MusicEngine` (defined in `lib/types.ts`). Each engine declares `capabilities: EngineCapabilities`. The auto engine is the default.

## Project Structure

```
src/
  index.ts              Entry point. Commander setup, engine factory, config loading.
  engines/
    native.ts           Music.app control via JXA (osascript -l JavaScript)
    api.ts              amp-api.music.apple.com with cookie auth + JWT extraction
    auto.ts             Smart routing between native and API
  commands/
    playback.ts         play, pause, resume, next, prev, seek, status, volume, shuffle, repeat
    search.ts           search track|album|artist|playlist|all
    library.ts          library tracks|albums|playlists + playlist info|add|remove|tracks|list
    auth.ts             auth import|token|status|clear
    config.ts           config status|engine|storefront
    devices.ts          AirPlay device listing
    queue.ts            Queue add (fails explicitly — reliable queueing not implemented)
  lib/
    types.ts            Domain types, MusicEngine interface, EngineCapabilities, DeviceKind
    entities.ts         Entity identity system (source-qualified IDs, ref parsing, ID validation)
    errors.ts           Error hierarchy: CiderError > ValidationError, AuthError, ExternalServiceError, UnsupportedOperationError
    input.ts            Input parsing (parseInteger with bounds checking)
    output.ts           JSON/plain/human output formatting + outputKeyValue helper
    config.ts           ~/.config/cider-music/config.json management
    cookies.ts          Browser cookie extraction (Safari, Chrome, Firefox, Edge, Brave) with timeouts
    secrets.ts          macOS Keychain read/write/clear for media-user-token
tests/
  auto.test.ts          Auto engine routing logic
  entities.test.ts      Entity ref encoding/decoding
  native.test.ts        Native engine derive helpers
  input.test.ts         Integer parsing + validation
  validation.test.ts    Raw ID validation + entity ref parsing
  errors.test.ts        Error hierarchy + codes + hints
  api-parsing.test.ts   API response identity building
  output.test.ts        Output mode and plain TSV escaping
  config.test.ts        Config parsing and validation
  cli.test.ts           CLI behavior contracts
```

## Key Conventions

- Every command supports three output modes: `--json`, `--plain` (tab-separated), default (colorized human)
- Errors use the `CiderError` hierarchy with error codes and optional hints. Never raw `console.error()`.
- All output goes through `lib/output.ts` helpers (`outputMessage`, `outputKeyValue`, `outputErrorDetails`)
- Entity IDs are source-qualified: `native:persistent:ABC123`, `api:library:l.123`, `api:catalog:1234567`
- Raw IDs are validated against `[A-Za-z0-9._-]+` before embedding in JXA scripts
- JXA scripts run via `jxa()` and `jxaJson<T>()` helpers; all interpolated values use `JSON.stringify()`
- API engine developer token is extracted from web player JS with JWT validation (alg+typ check) and 30-min cache TTL
- Tokens stored in macOS Keychain (service: `cider-music`), not in config file
- Config lives at `~/.config/cider-music/config.json` (engine + storefront defaults only)
- Artwork exports to `/tmp/cider-music-artwork-{id}.png`
- Codex/cmux tool sessions can lack a usable HI Services connection even with
  Automation permission. For real Music.app native checks from that context,
  run the whole CLI inside the GUI user session:
  `launchctl asuser $(id -u) bun run src/index.ts status --json`

## Commands

```
Playback:    play [query] | pause | resume | next | prev | seek <s> | status
Volume:      volume [0-100]
Modes:       shuffle [on|off] | repeat [off|one|all]
Search:      search track|album|artist|playlist|all <query> [-l limit]
Library:     library tracks|albums|playlists | library playlist <id>
Playlists:   playlist info <id> | playlist add <id> <trackIds...> | playlist remove <id> <trackIds...>
Queue:       queue add <trackId>   (fails explicitly)
Devices:     devices
Auth:        auth import|token|status|clear
Config:      config status | config engine [native|api|auto] | config storefront [code|auto]
```

## Development

```bash
bun install
bun run src/index.ts status     # run directly
bun link                        # link globally as `cider-music`
bun run build                   # compile to dist/cider-music
bun run typecheck               # tsc --noEmit
bun test                        # 51 tests across 10 files
bun run check                   # typecheck + test
```

## Adding a New Command

1. Create handler in `src/commands/` following existing patterns
2. Accept `program: Command` and `getEngine: () => MusicEngine`
3. Handle all three output modes (`getOutputMode(program.opts())`)
4. Use `CiderError` subclasses for errors (never raw `throw new Error()`)
5. Register in `src/index.ts`

## Adding to the MusicEngine Interface

1. Add method signature to `MusicEngine` in `lib/types.ts`
2. Update `EngineCapabilities` if adding a new capability category
3. Implement in `native.ts` (JXA), `api.ts` (web API), and `auto.ts` (routing)
4. API engine throws `UnsupportedOperationError` for operations it can't support
5. Auto engine delegates playback to native, data queries to API when authenticated
6. Add tests in `tests/`
