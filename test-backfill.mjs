/**
 * chicheng-stats dry-run backfill: decode every session log under
 * $DSH_HOME/sessions with the plugin's own decoder and fold totals.
 * Read-only — never writes the store.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { _internals } from "./lib/index.js";

const { createFold, decodeSessionLog, parseEventLines, headerId } = _internals;

const root = join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "sessions");
const fold = createFold();

const started = Date.now();
let files = 0;
let usageSamples = 0;

const projects = await readdir(root, { withFileTypes: true }).catch(() => []);
for (const project of projects) {
  if (!project.isDirectory() || !project.name.startsWith("--")) continue;
  const projectDir = join(root, project.name);
  const sessionDirs = await readdir(projectDir, { withFileTypes: true }).catch(() => []);
  for (const entry of sessionDirs) {
    if (!entry.isDirectory()) continue;
    const dir = join(projectDir, entry.name);
    const zstdPath = join(dir, "session.jsonl.zstd");
    const rawPath = join(dir, "session.jsonl");
    let path = null;
    if (existsSync(zstdPath)) path = zstdPath;
    else if (existsSync(rawPath)) path = rawPath;
    if (path === null) continue;
    const info = await stat(path);
    const buffer = await readFile(path);
    const events = path.endsWith(".zstd") ? decodeSessionLog(buffer) : parseEventLines(buffer.toString("utf8"));
    const sessionId = headerId(events) ?? entry.name;
    let counted = 0;
    for (const event of events) {
      if (fold.ingest(sessionId, event)) counted += 1;
    }
    files += 1;
    usageSamples += counted;
    console.log(`  ${sessionId.slice(0, 8)}… ${counted} samples, file ${info.size} bytes`);
  }
}

const summary = fold.summary(Date.now());
console.log("\n=== dry-run result ===");
console.log(JSON.stringify({
  files,
  usageSamples,
  days: fold.daysCount,
  watermarks: fold.watermarksCount,
  today: summary.today,
  total: summary.total,
  todayKey: summary.todayKey,
  elapsedMs: Date.now() - started,
}, null, 2));
