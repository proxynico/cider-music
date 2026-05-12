import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import type { CiderConfig } from "./types";
import { ExternalServiceError, ValidationError } from "./errors";
import { getMediaUserTokenSecret, setMediaUserTokenSecret, clearMediaUserTokenSecret } from "./secrets";

const CONFIG_DIR = join(homedir(), ".config", "cider-music");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const LEGACY_CONFIG_FILE = join(homedir(), ".config", "aria", "config.json");

const DEFAULT_CONFIG: CiderConfig = {
  defaultEngine: "auto",
  storefront: "auto",
};
const VALID_ENGINES = new Set<CiderConfig["defaultEngine"]>(["native", "api", "auto"]);

export async function getConfigDir(): Promise<string> {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
  return CONFIG_DIR;
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export function parseConfig(raw: string, path: string): CiderConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ValidationError(`Config file is invalid JSON: ${path}`, (err as Error).message);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ValidationError(`Config file must contain a JSON object: ${path}`);
  }

  const config = { ...DEFAULT_CONFIG, ...parsed } as CiderConfig;
  if (!VALID_ENGINES.has(config.defaultEngine)) {
    throw new ValidationError(`Invalid default engine in config: ${config.defaultEngine}`);
  }
  if (typeof config.storefront !== "string") {
    throw new ValidationError("Invalid storefront in config: expected a string");
  }

  return config;
}

async function readConfig(path: string): Promise<CiderConfig | undefined> {
  try {
    return parseConfig(await readFile(path, "utf-8"), path);
  } catch (err) {
    if (isMissingFile(err)) return undefined;
    if (err instanceof ValidationError) throw err;
    throw new ExternalServiceError(`Failed to read config from ${path}`, undefined, err);
  }
}

export async function loadConfig(): Promise<CiderConfig> {
  return (await readConfig(CONFIG_FILE))
    ?? (await readConfig(LEGACY_CONFIG_FILE))
    ?? { ...DEFAULT_CONFIG };
}

export async function saveConfig(config: CiderConfig): Promise<void> {
  await getConfigDir();
  try {
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
  } catch (err) {
    throw new ExternalServiceError(`Failed to save config to ${CONFIG_FILE}`, undefined, err);
  }
}

export async function getMediaUserToken(): Promise<string | undefined> {
  return getMediaUserTokenSecret();
}

export async function setMediaUserToken(token: string): Promise<void> {
  await setMediaUserTokenSecret(token);
}

export async function clearMediaUserToken(): Promise<void> {
  await clearMediaUserTokenSecret();
}

export async function setDefaultEngine(defaultEngine: CiderConfig["defaultEngine"]): Promise<void> {
  const config = await loadConfig();
  config.defaultEngine = defaultEngine;
  await saveConfig(config);
}

export async function setStorefront(storefront: string): Promise<void> {
  const config = await loadConfig();
  config.storefront = storefront;
  await saveConfig(config);
}
