import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface SBConfig {
  /** Absolute path to the KB repo. Default: "~/.second-brain" */
  kbPath: string;
}

const CONFIG_RELATIVE_PATH = path.join(".pi", "agent", "pi-second-brain.json");

/**
 * Returns the config file path.
 */
export function getConfigPath(): string {
  return path.join(os.homedir(), CONFIG_RELATIVE_PATH);
}

/**
 * Reads config file. Returns defaults if file doesn't exist or is invalid JSON.
 */
export async function loadConfig(): Promise<SBConfig> {
  const configPath = getConfigPath();

  try {
    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<SBConfig>;
    return {
      kbPath: parsed.kbPath ?? "~/.second-brain",
    };
  } catch {
    return { kbPath: "~/.second-brain" };
  }
}

/**
 * Writes config file atomically. Creates ~/.pi/agent/ directory if needed.
 */
export async function saveConfig(config: SBConfig): Promise<void> {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const tmpPath = configPath + ".tmp";
  await writeFile(tmpPath, JSON.stringify(config, null, 2), "utf-8");
  await rename(tmpPath, configPath);
}

/**
 * Resolves kbPath to an absolute path (expands ~ to os.homedir()).
 */
export function resolveKbPath(config: SBConfig): string {
  if (config.kbPath.startsWith("~")) {
    return path.join(os.homedir(), config.kbPath.slice(1));
  }
  return path.resolve(config.kbPath);
}

/**
 * Returns absolute path to today's inbox file: {resolvedKbPath}/00-Inbox/{YYYY-MM-DD}.md.
 */
export function getTodayInboxFile(config: SBConfig): string {
  const kbPath = resolveKbPath(config);
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return path.join(kbPath, "00-Inbox", `${yyyy}-${mm}-${dd}.md`);
}
