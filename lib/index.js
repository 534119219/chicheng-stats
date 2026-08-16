/**
 * chicheng-stats — host half
 *
 * Global usage statistics for the dsh web profile: today's / total request
 * counts and billed token totals across ALL sessions (including sessions
 * written by other processes, e.g. headless cron-agent runs).
 *
 *   - live: subscribes to `session/event` (the same seam dsh-session-telemetry
 *     uses) and folds provider-reported usage samples as they arrive;
 *   - backfill / sweep: scans the session logs under $DSH_HOME/sessions
 *     (session.jsonl.zstd — concatenated Zstandard frames; split by frame,
 *     then decoded with
 *     node:zlib.zstdDecompressSync per frame, mirroring the harness's own
 *     decoder) and folds only events past each session's persisted seq
 *     watermark, so live counting and scanning never double-count;
 *   - persist: $DSH_HOME/stats/store.json (debounced atomic tmp+rename);
 *   - API: fenced POST /stats/api/summary and /stats/api/status for the
 *     client half.
 *
 * Counting semantics match @deepseek-ai/dsh-token-meter's fold:
 *   - one request = one provider usage sample per (turn, step);
 *   - billed tokens = inputTokens + cacheReadTokens + cacheWriteTokens +
 *     outputTokens (reasoning is a breakdown of output, never added again);
 *   - a later usage sample for the same (turn, step) replaces the earlier
 *     one instead of double-counting the request.
 * "Today" buckets by the local-time calendar date of the event timestamp.
 *
 * No third-party runtime dependencies: Node built-ins only.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, rename, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import zlib from "node:zlib";

// ---------------------------------------------------------------- identity

const name = "chicheng-stats";
const inject = ["webServer", "webRuntime"];

// ---------------------------------------------------------------- paths

const DATA_ROOT = process.env.DSH_HOME
  ? join(process.env.DSH_HOME, "stats")
  : join(homedir(), ".dsh", "stats");
const STORE_PATH = join(DATA_ROOT, "store.json");

function sessionsRoot() {
  return join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "sessions");
}

// ---------------------------------------------------------------- counting fold

/** Local-time calendar day key `YYYY-MM-DD`. */
function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local-time hour key `HH:00`. */
function hourKey(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:00`;
}

/** Accepted detail-query time ranges. */
const RANGE_KEYS = ["today", "7d", "30d", "month", "all"];

function normalizeRange(value) {
  return RANGE_KEYS.includes(value) ? value : "today";
}

/** Inclusive lower bound (ms) for a range at `now`. */
function rangeFromMs(range, now) {
  const d = new Date(now);
  switch (range) {
    case "7d":
      return now - 7 * 86400000;
    case "30d":
      return now - 30 * 86400000;
    case "month":
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    case "all":
      return 0;
    default: // today
      d.setHours(0, 0, 0, 0);
      return d.getTime();
  }
}

/** Extract the provider usage sample an event carries, if any. */
function usageOfEvent(event) {
  if (event?.type === "assistant/message" && event.data?.usage != null) return event.data.usage;
  if (event?.type === "assistant/chunk" && event.data?.chunk?.type === "usage") return event.data.chunk.usage;
  return undefined;
}

/** Billed tokens: disjoint provider buckets, reasoning stays inside output. */
function usageTokens(usage) {
  return (usage.inputTokens ?? 0)
    + (usage.cacheReadTokens ?? 0)
    + (usage.cacheWriteTokens ?? 0)
    + (usage.outputTokens ?? 0);
}

/** Provider model a request/header snapshot was built under, or null. */
function modelOfEvent(event) {
  if (event?.type !== "request/header") return null;
  const config = event?.data?.header?.config;
  if (config === null || typeof config !== "object") return null;
  if (typeof config.model === "string" && config.model !== "") return config.model;
  return null;
}

/** Max detail records kept in memory / on disk (oldest dropped beyond this). */
const MAX_RECORDS = 30000;

/**
 * The counting engine. Events must be fed in ascending seq order per session
 * (live events arrive in order; scans replay logs in order); the fold is
 * synchronous, so live and scan ingestion share one instance without races.
 */
function createFold(initial = {}) {
  const days = new Map(Object.entries(initial.days ?? {}));
  const watermarks = new Map(Object.entries(initial.watermarks ?? {}));
  // In-memory only: a replace (same turn/step re-report) is always adjacent
  // in seq order, and the watermark makes replay impossible after restart.
  const lastUsage = new Map();
  // Provider model in force per session (from request/header snapshots).
  const sessionModels = new Map();
  // Per-request detail records (bounded ring; persisted to a separate file).
  const records = [];

  /** @returns true when the event contributed a usage sample. */
  function ingest(sessionId, event) {
    // Track the model each request was built under.
    if (event?.type === "request/header") {
      const model = modelOfEvent(event);
      if (model !== null) sessionModels.set(sessionId, model);
    }
    const usage = usageOfEvent(event);
    if (usage === undefined) return false;
    const seq = event?.seq;
    if (Number.isFinite(seq)) {
      const seen = watermarks.get(sessionId) ?? -1;
      if (seq <= seen) return false;
      watermarks.set(sessionId, seq);
      if (watermarks.size > 5000) {
        // prune oldest-inserted watermarks; lost entries only risk re-counting
        // after a restart, and their sessions are re-scanned from scratch
        const firstKey = watermarks.keys().next().value;
        if (firstKey !== undefined) watermarks.delete(firstKey);
      }
    }
    const turn = event?.data?.turn;
    const step = event?.data?.step;
    const ts = Number.isFinite(event?.time) ? event.time : Date.now();
    const day = dayKey(ts);
    const tokens = usageTokens(usage);
    const input = usage.inputTokens ?? 0;
    const cacheRead = usage.cacheReadTokens ?? 0;
    const cacheWrite = usage.cacheWriteTokens ?? 0;
    const output = usage.outputTokens ?? 0;
    const model = sessionModels.get(sessionId) ?? "unknown";
    let bucket = days.get(day);
    if (bucket === undefined) {
      bucket = { requests: 0, tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
      days.set(day, bucket);
    }
    const last = lastUsage.get(sessionId);
    if (last !== undefined && last.turn === turn && last.step === step) {
      // same request re-reported (usage chunk → final message): replace
      const previousDay = days.get(last.day);
      if (previousDay !== undefined) {
        previousDay.tokens = Math.max(0, previousDay.tokens - last.tokens);
        previousDay.input = Math.max(0, (previousDay.input ?? 0) - last.input);
        previousDay.output = Math.max(0, (previousDay.output ?? 0) - last.output);
        previousDay.cacheRead = Math.max(0, (previousDay.cacheRead ?? 0) - last.cacheRead);
        previousDay.cacheWrite = Math.max(0, (previousDay.cacheWrite ?? 0) - last.cacheWrite);
      }
      bucket.tokens += tokens;
      bucket.input = (bucket.input ?? 0) + input;
      bucket.output = (bucket.output ?? 0) + output;
      bucket.cacheRead = (bucket.cacheRead ?? 0) + cacheRead;
      bucket.cacheWrite = (bucket.cacheWrite ?? 0) + cacheWrite;
      const record = records[last.recordIndex];
      if (record !== undefined) {
        record.t = ts;
        record.model = model;
        record.input = input;
        record.cacheRead = cacheRead;
        record.cacheWrite = cacheWrite;
        record.output = output;
      }
    } else {
      bucket.requests += 1;
      bucket.tokens += tokens;
      bucket.input = (bucket.input ?? 0) + input;
      bucket.output = (bucket.output ?? 0) + output;
      bucket.cacheRead = (bucket.cacheRead ?? 0) + cacheRead;
      bucket.cacheWrite = (bucket.cacheWrite ?? 0) + cacheWrite;
      records.push({ t: ts, model, session: sessionId, turn, step, input, cacheRead, cacheWrite, output });
      while (records.length > MAX_RECORDS) records.shift();
    }
    lastUsage.set(sessionId, { turn, step, day, tokens, input, output, cacheRead, cacheWrite, recordIndex: records.length - 1 });
    return true;
  }

  /** Legacy day buckets lack the split fields; backfill them from records. */
  function ensureSplits(day, bucket) {
    if (typeof bucket.input === "number") return;
    let input = 0;
    let output = 0;
    let cacheRead = 0;
    let cacheWrite = 0;
    for (const record of records) {
      if (dayKey(record.t) === day) {
        input += record.input;
        output += record.output;
        cacheRead += record.cacheRead;
        cacheWrite += record.cacheWrite;
      }
    }
    bucket.input = input;
    bucket.output = output;
    bucket.cacheRead = cacheRead;
    bucket.cacheWrite = cacheWrite;
  }

  /** Today vs all-time totals at `nowMs` (local-time day boundary). */
  function summary(nowMs) {
    const todayKey = dayKey(nowMs);
    let totalRequests = 0;
    let totalTokens = 0;
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;
    let totalCacheWrite = 0;
    let todayRequests = 0;
    let todayTokens = 0;
    let todayInput = 0;
    let todayOutput = 0;
    let todayCacheRead = 0;
    let todayCacheWrite = 0;
    for (const [day, bucket] of days) {
      ensureSplits(day, bucket);
      const requests = Math.max(0, bucket.requests);
      const tokens = Math.max(0, bucket.tokens);
      const input = Math.max(0, bucket.input ?? 0);
      const output = Math.max(0, bucket.output ?? 0);
      const cacheRead = Math.max(0, bucket.cacheRead ?? 0);
      const cacheWrite = Math.max(0, bucket.cacheWrite ?? 0);
      totalRequests += requests;
      totalTokens += tokens;
      totalInput += input;
      totalOutput += output;
      totalCacheRead += cacheRead;
      totalCacheWrite += cacheWrite;
      if (day === todayKey) {
        todayRequests = requests;
        todayTokens = tokens;
        todayInput = input;
        todayOutput = output;
        todayCacheRead = cacheRead;
        todayCacheWrite = cacheWrite;
      }
    }
    return {
      today: { requests: todayRequests, tokens: todayTokens, input: todayInput, output: todayOutput, cacheRead: todayCacheRead, cacheWrite: todayCacheWrite },
      total: { requests: totalRequests, tokens: totalTokens, input: totalInput, output: totalOutput, cacheRead: totalCacheRead, cacheWrite: totalCacheWrite },
      todayKey,
    };
  }

  function snapshot() {
    return { days: Object.fromEntries(days), watermarks: Object.fromEntries(watermarks) };
  }

  function seedRecords(list) {
    for (const record of list) {
      if (record && typeof record.t === "number" && typeof record.input === "number") records.push(record);
    }
    while (records.length > MAX_RECORDS) records.shift();
  }

  /**
   * Adopt historical records (from a records rebuild) without duplicating
   * records already collected live after startup: existing records win, new
   * ones are appended (indices of existing records stay valid for replaces).
   */
  function mergeRecords(list) {
    const seen = new Set();
    for (const record of records) {
      seen.add(`${record.session}|${record.turn}|${record.step}`);
    }
    for (const record of list) {
      const key = `${record.session}|${record.turn}|${record.step}`;
      if (!seen.has(key)) {
        seen.add(key);
        records.push(record);
      }
    }
    while (records.length > MAX_RECORDS) records.shift();
  }

  /** All detail records (for persistence). */
  function allRecords() {
    return records;
  }

  /** Detail records at or after `fromMs` (unsorted). */
  function queryRecords(fromMs) {
    const out = [];
    for (const record of records) {
      if (record.t >= fromMs) out.push(record);
    }
    return out;
  }

  return {
    ingest,
    summary,
    snapshot,
    seedRecords,
    mergeRecords,
    allRecords,
    queryRecords,
    get daysCount() { return days.size; },
    get watermarksCount() { return watermarks.size; },
  };
}

// ---------------------------------------------------------------- zstd frames

const ZSTD_MAGIC = 4247762216; // 0xFD2FB528

/**
 * Locate complete Zstandard frames without decompressing their blocks
 * (same algorithm the harness's JSONL persistence backend uses). EOF inside
 * a frame returns its start as `tornStart` (an incomplete append tail that
 * crash recovery would truncate); callers stop there.
 */
function scanZstdFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) return { frames, tornStart: start };
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) throw new Error(`corrupt Zstandard session log: invalid frame magic at byte ${offset}`);
    offset += 4;
    if (offset === buffer.length) return { frames, tornStart: start };
    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    if ((descriptor & 24) !== 0) throw new Error(`corrupt Zstandard session log: reserved frame-header bit at byte ${offset - 1}`);
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dictionaryFlag = descriptor & 3;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag;
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start };
    offset += remainingHeaderBytes;
    for (;;) {
      if (buffer.length - offset < 3) return { frames, tornStart: start };
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = (blockHeader >>> 1) & 3;
      const blockSize = blockHeader >>> 3;
      if (blockType === 3) throw new Error(`corrupt Zstandard session log: reserved block type at byte ${offset - 3}`);
      const payloadBytes = blockType === 1 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start };
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start };
      offset += 4;
    }
    frames.push({ start, end: offset });
  }
  return { frames, tornStart: null };
}

/** Split text into session-event objects; packed chunk rows are skipped. */
function parseEventLines(text) {
  const events = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const parsed = JSON.parse(trimmed);
      // Packed rows (text-chunks / reasoning-chunks / tool-call-chunks) are
      // plain JSON but never carry usage samples; non-JSON lines are skipped.
      if (parsed && typeof parsed === "object" && typeof parsed.type === "string") events.push(parsed);
    } catch {
      // skip
    }
  }
  return events;
}

/** Decode a concatenated-frame `.jsonl.zstd` artifact into event objects. */
function decodeSessionLog(buffer) {
  const { frames, tornStart } = scanZstdFrames(buffer);
  const parts = [];
  for (const frame of frames) {
    parts.push(zlib.zstdDecompressSync(buffer.subarray(frame.start, frame.end)));
  }
  return parseEventLines(Buffer.concat(parts).toString("utf8"));
}

/** Session id from the immutable header line, or null. */
function headerId(events) {
  const header = events.find((event) => event.type === "session");
  return header && typeof header.id === "string" && header.id !== "" ? header.id : null;
}

// ---------------------------------------------------------------- store

const EMPTY_SCAN = {
  startedAt: null,
  finishedAt: null,
  scannedSessions: 0,
  scannedEvents: 0,
  lastScanAt: null,
};

let store = {
  version: 1,
  installedAt: new Date().toISOString(),
  scanMeta: {},
  scan: { ...EMPTY_SCAN },
};
let fold = createFold();
let storeDirtyTimer = null;
let currentCtx = null;

async function loadStore() {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      store = {
        version: 1,
        installedAt: typeof parsed.installedAt === "string" ? parsed.installedAt : new Date().toISOString(),
        scanMeta: parsed.scanMeta && typeof parsed.scanMeta === "object" ? parsed.scanMeta : {},
        scan: { ...EMPTY_SCAN, ...(parsed.scan ?? {}) },
      };
      fold = createFold({ days: parsed.days, watermarks: parsed.watermarks });
    }
  } catch {
    // first run (or corrupt store): fresh state
  }
}

/** Debounced atomic persist (tolerates crashes: tmp + rename). */
function scheduleSave() {
  if (storeDirtyTimer !== null) return;
  storeDirtyTimer = setTimeout(() => {
    storeDirtyTimer = null;
    void flushStore();
  }, 150);
}

async function flushStore() {
  try {
    await mkdir(DATA_ROOT, { recursive: true });
    const payload = {
      version: 1,
      installedAt: store.installedAt,
      days: fold.snapshot().days,
      watermarks: fold.snapshot().watermarks,
      scanMeta: store.scanMeta,
      scan: store.scan,
    };
    const tmp = `${STORE_PATH}.tmp`;
    await writeFile(tmp, JSON.stringify(payload), "utf8");
    await rename(tmp, STORE_PATH);
  } catch (error) {
    console.error(`[chicheng-stats] store flush failed:`, error);
  }
}

// ---------------------------------------------------------------- detail records

const RECORDS_PATH = join(DATA_ROOT, "requests.json");
let recordsDirtyTimer = null;

/** Load persisted detail records into the fold (bounded). */
async function loadRecords() {
  try {
    const raw = await readFile(RECORDS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed?.records;
    if (Array.isArray(list)) fold.seedRecords(list);
  } catch {
    // first run
  }
}

/** Debounced atomic persist for the detail log (30s; separate from store.json). */
function scheduleRecordsSave() {
  if (recordsDirtyTimer !== null) return;
  recordsDirtyTimer = setTimeout(() => {
    recordsDirtyTimer = null;
    void flushRecords();
  }, 30000);
}

async function flushRecords() {
  try {
    await mkdir(DATA_ROOT, { recursive: true });
    const payload = JSON.stringify({ version: 1, records: fold.allRecords() });
    const tmp = `${RECORDS_PATH}.tmp`;
    await writeFile(tmp, payload, "utf8");
    await rename(tmp, RECORDS_PATH);
  } catch (error) {
    console.error(`[chicheng-stats] records flush failed:`, error);
  }
}

// ---------------------------------------------------------------- widget settings

const SETTINGS_PATH = join(DATA_ROOT, "settings.json");

/** Default sidebar-widget settings (the user can change them in Settings). */
const DEFAULT_SETTINGS = Object.freeze({
  version: 2,
  mode: "text",
  position: "below",
  text: {
    template: "今日请求：{todayRequests} | 总请求：{totalRequests} | 今日Token：{todayTokens} | 总Token：{totalTokens}",
    fontSize: 11,
    color: null,       // hex color, or null = theme default
    weight: "normal",  // normal | medium | bold
    align: "left",     // left | center | right
    background: false, // subtle fill behind the line
    bgColor: null,     // fill color when background is on, or null = theme fill
    radius: 8,         // 0-16
    padding: 4,        // 0-16
  },
  card: {
    size: "small",     // small | medium | large (padding preset)
    columns: 2,        // 1 | 2 | 4
    items: ["todayRequests", "todayTokens", "totalRequests", "totalTokens"],
    titleSize: 11,
    valueSize: 15,
    gap: 8,
    bg: "#43454a",     // default card background: rgb(67,69,74)
    border: 1,         // 0-3 px
    borderColor: null,
    radius: 10,        // 0-24
    titleColor: null,
    valueColor: null,
  },
});

const CARD_ITEM_KEYS = ["todayRequests", "todayTokens", "totalRequests", "totalTokens"];
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

let widgetSettings = structuredClone(DEFAULT_SETTINGS);
let settingsDirtyTimer = null;

function clampNumber(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
}

/** Accept only hex colors (or null = theme default); anything else → null. */
function sanitizeColor(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && HEX_COLOR_RE.test(value.trim())) return value.trim().toLowerCase();
  return null;
}

/** Validate/normalize a user settings object against the defaults. */
function sanitizeSettings(input) {
  const out = structuredClone(DEFAULT_SETTINGS);
  if (input === null || typeof input !== "object") return out;
  if (input.mode === "card" || input.mode === "text") out.mode = input.mode;
  if (input.position === "above" || input.position === "below") out.position = input.position;
  if (input.text && typeof input.text === "object") {
    const tx = input.text;
    if (typeof tx.template === "string" && tx.template.trim() !== "") out.text.template = tx.template.slice(0, 1000);
    const fontSize = clampNumber(tx.fontSize, 8, 24);
    if (fontSize !== null) out.text.fontSize = fontSize;
    const color = sanitizeColor(tx.color);
    if (color !== null) out.text.color = color;
    if (tx.weight === "normal" || tx.weight === "medium" || tx.weight === "bold") out.text.weight = tx.weight;
    if (tx.align === "left" || tx.align === "center" || tx.align === "right") out.text.align = tx.align;
    if (typeof tx.background === "boolean") out.text.background = tx.background;
    const bgColor = sanitizeColor(tx.bgColor);
    if (bgColor !== null) out.text.bgColor = bgColor;
    const radius = clampNumber(tx.radius, 0, 16);
    if (radius !== null) out.text.radius = radius;
    const padding = clampNumber(tx.padding, 0, 16);
    if (padding !== null) out.text.padding = padding;
  }
  if (input.card && typeof input.card === "object") {
    const cd = input.card;
    if (cd.size === "small" || cd.size === "medium" || cd.size === "large") out.card.size = cd.size;
    if (cd.columns === 1 || cd.columns === 2 || cd.columns === 4) out.card.columns = cd.columns;
    if (Array.isArray(cd.items)) {
      const items = cd.items.filter((key) => CARD_ITEM_KEYS.includes(key));
      if (items.length > 0) out.card.items = items;
    }
    const titleSize = clampNumber(cd.titleSize, 8, 24);
    if (titleSize !== null) out.card.titleSize = titleSize;
    const valueSize = clampNumber(cd.valueSize, 10, 32);
    if (valueSize !== null) out.card.valueSize = valueSize;
    const gap = clampNumber(cd.gap, 0, 24);
    if (gap !== null) out.card.gap = gap;
    const bg = sanitizeColor(cd.bg);
    if (bg !== null) out.card.bg = bg;
    const border = clampNumber(cd.border, 0, 3);
    if (border !== null) out.card.border = border;
    const borderColor = sanitizeColor(cd.borderColor);
    if (borderColor !== null) out.card.borderColor = borderColor;
    const radius = clampNumber(cd.radius, 0, 24);
    if (radius !== null) out.card.radius = radius;
    const titleColor = sanitizeColor(cd.titleColor);
    if (titleColor !== null) out.card.titleColor = titleColor;
    const valueColor = sanitizeColor(cd.valueColor);
    if (valueColor !== null) out.card.valueColor = valueColor;
  }
  return out;
}

async function loadSettings() {
  try {
    const raw = await readFile(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") widgetSettings = sanitizeSettings(parsed);
  } catch {
    // first run: defaults
  }
}

/** Debounced atomic persist for widget settings. */
function scheduleSettingsSave() {
  if (settingsDirtyTimer !== null) return;
  settingsDirtyTimer = setTimeout(() => {
    settingsDirtyTimer = null;
    void flushSettings();
  }, 300);
}

async function flushSettings() {
  try {
    await mkdir(DATA_ROOT, { recursive: true });
    const tmp = `${SETTINGS_PATH}.tmp`;
    await writeFile(tmp, JSON.stringify(widgetSettings), "utf8");
    await rename(tmp, SETTINGS_PATH);
  } catch (error) {
    console.error(`[chicheng-stats] settings flush failed:`, error);
  }
}

// ---------------------------------------------------------------- scan

let scanning = false;
let scanInFlight = false;

/**
 * Incremental scan of the shared sessions root. Skips sessions whose file
 * identity (mtime:size) is unchanged since the last sweep; replays only
 * events past each session's seq watermark, so it is safe to run while live
 * counting is active and to run repeatedly (every sweep + once at startup
 * for backfill).
 */
async function scanOnce() {
  if (scanInFlight) return;
  scanInFlight = true;
  if (store.scan.startedAt === null) store.scan.startedAt = new Date().toISOString();
  try {
    const root = sessionsRoot();
    const projects = await readdir(root, { withFileTypes: true }).catch(() => []);
    let scanned = 0;
    let counted = 0;
    for (const project of projects) {
      if (!project.isDirectory() || !project.name.startsWith("--")) continue;
      const projectDir = join(root, project.name);
      const sessionDirs = await readdir(projectDir, { withFileTypes: true }).catch(() => []);
      for (const entry of sessionDirs) {
        if (!entry.isDirectory()) continue;
        const sessionDir = join(projectDir, entry.name);
        const zstdPath = join(sessionDir, "session.jsonl.zstd");
        const rawPath = join(sessionDir, "session.jsonl");
        let path = null;
        try {
          if (existsSync(zstdPath)) path = zstdPath;
          else if (existsSync(rawPath)) path = rawPath;
        } catch {
          // fall through
        }
        if (path === null) continue;
        let info;
        try {
          info = await stat(path);
        } catch {
          continue;
        }
        const metaKey = `${info.mtimeMs}:${info.size}`;
        if (store.scanMeta[entry.name] === metaKey) continue;
        try {
          const buffer = await readFile(path);
          const events = path.endsWith(".zstd") ? decodeSessionLog(buffer) : parseEventLines(buffer.toString("utf8"));
          const sessionId = headerId(events) ?? entry.name;
          for (const event of events) {
            if (fold.ingest(sessionId, event)) counted += 1;
          }
          store.scanMeta[entry.name] = metaKey;
          scanned += 1;
        } catch (error) {
          console.warn(`[chicheng-stats] scan failed for ${path}:`, error instanceof Error ? error.message : String(error));
          // scanMeta intentionally not recorded → retried on the next sweep
        }
        if (scanned % 20 === 0) scheduleSave();
        // yield to the event loop between sessions so startup is not blocked
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    if (store.scan.finishedAt === null) store.scan.finishedAt = new Date().toISOString();
    store.scan.scannedSessions += scanned;
    store.scan.scannedEvents += counted;
    store.scan.lastScanAt = new Date().toISOString();
    if (counted > 0) scheduleRecordsSave();
    if (scanned > 0 || counted > 0) {
      console.info(`[chicheng-stats] scan: ${scanned} session(s), ${counted} usage sample(s) ingested`);
    }
    scheduleSave();
  } catch (error) {
    console.warn(`[chicheng-stats] scan failed:`, error instanceof Error ? error.message : String(error));
  } finally {
    scanInFlight = false;
  }
}

// ---------------------------------------------------------------- records rebuild

/**
 * Upgrade path: after an upgrade from a version without detail records,
 * requests.json does not exist and the incremental scan skips every session
 * (watermarks/scanMeta already cover them), so historical records would be
 * missing forever. Detect that case and fold ALL session logs once with a
 * throwaway fold, then merge its records into the live fold.
 */
async function rebuildRecordsIfNeeded() {
  if (fold.allRecords().length > 0) return;
  if (store.scan.finishedAt === null) return; // no history yet; the normal scan covers it
  console.info("[chicheng-stats] rebuilding detail records from session logs…");
  const tmp = createFold();
  let sessions = 0;
  try {
    const root = sessionsRoot();
    const projects = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const project of projects) {
      if (!project.isDirectory() || !project.name.startsWith("--")) continue;
      const projectDir = join(root, project.name);
      const sessionDirs = await readdir(projectDir, { withFileTypes: true }).catch(() => []);
      for (const entry of sessionDirs) {
        if (!entry.isDirectory()) continue;
        const sessionDir = join(projectDir, entry.name);
        const zstdPath = join(sessionDir, "session.jsonl.zstd");
        const rawPath = join(sessionDir, "session.jsonl");
        let path = null;
        try {
          if (existsSync(zstdPath)) path = zstdPath;
          else if (existsSync(rawPath)) path = rawPath;
        } catch {
          // fall through
        }
        if (path === null) continue;
        try {
          const buffer = await readFile(path);
          const events = path.endsWith(".zstd") ? decodeSessionLog(buffer) : parseEventLines(buffer.toString("utf8"));
          const sessionId = headerId(events) ?? entry.name;
          for (const event of events) tmp.ingest(sessionId, event);
          sessions += 1;
        } catch (error) {
          console.warn(`[chicheng-stats] records rebuild failed for ${path}:`, error instanceof Error ? error.message : String(error));
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    fold.mergeRecords(tmp.allRecords());
    scheduleRecordsSave();
    console.info(`[chicheng-stats] records rebuilt: ${fold.allRecords().length} record(s) from ${sessions} session(s)`);
  } catch (error) {
    console.warn(`[chicheng-stats] records rebuild failed:`, error instanceof Error ? error.message : String(error));
  }
}

// ---------------------------------------------------------------- API wire

const MAX_BODY_BYTES = 1 << 20;

class StatsError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw new StatsError("bad-request", "request body too large", 413);
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new StatsError("bad-request", "request body is not valid JSON");
  }
}

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" });
  res.end(payload);
}

function writeOk(res, value) {
  writeJson(res, 200, { ok: true, value });
}

function writeError(res, error) {
  if (error instanceof StatsError) {
    writeJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  writeJson(res, 500, { ok: false, error: { code: "internal", message } });
}

function header(headers, key) {
  const value = headers[key];
  return typeof value === "string" ? value : undefined;
}

function parseAuthority(authority) {
  try {
    return new URL(`http://${authority}`);
  } catch {
    return undefined;
  }
}

function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function isTrustedApiRequest(request, trustedHosts) {
  const host = header(request.headers, "host");
  if (host === undefined) return false;
  const hostUrl = parseAuthority(host);
  if (hostUrl === undefined) return false;
  const hosts = Array.isArray(trustedHosts) ? trustedHosts : [];
  const trusted = hosts.some((entry) => {
    const entryUrl = parseAuthority(entry);
    if (entryUrl === undefined) return false;
    return entryUrl.hostname === hostUrl.hostname && (entryUrl.port === "" || entryUrl.port === hostUrl.port);
  });
  if (!isLoopbackHostname(hostUrl.hostname) && !trusted) return false;
  if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
  const origin = header(request.headers, "origin");
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

function buildApi() {
  return {
    summary: async () => {
      const now = Date.now();
      const s = fold.summary(now);
      return {
        today: s.today,
        total: s.total,
        todayKey: s.todayKey,
        since: store.installedAt,
        backfill: {
          done: store.scan.finishedAt !== null,
          scannedSessions: store.scan.scannedSessions,
          scannedEvents: store.scan.scannedEvents,
          lastScanAt: store.scan.lastScanAt,
        },
      };
    },

    status: async () => ({
      storePath: STORE_PATH,
      installedAt: store.installedAt,
      days: fold.daysCount,
      watermarks: fold.watermarksCount,
      records: fold.allRecords().length,
      scanning: scanInFlight,
      scan: store.scan,
    }),

    /** Current sidebar-widget settings. */
    settings: async () => ({ settings: widgetSettings }),

    /** Validate + persist sidebar-widget settings. */
    saveSettings: async (payload) => {
      widgetSettings = sanitizeSettings(payload?.settings);
      scheduleSettingsSave();
      return { settings: widgetSettings };
    },

    /** Detailed usage query for the stats dialog: totals, models, trend, rows. */
    usage: async (payload) => {
      const now = Date.now();
      const range = normalizeRange(payload?.range);
      const from = rangeFromMs(range, now);
      const rows = fold.queryRecords(from);
      let requests = rows.length;
      let input = 0;
      let cacheRead = 0;
      let cacheWrite = 0;
      let output = 0;
      const modelMap = new Map();
      for (const record of rows) {
        input += record.input;
        cacheRead += record.cacheRead;
        cacheWrite += record.cacheWrite;
        output += record.output;
        let entry = modelMap.get(record.model);
        if (entry === undefined) {
          entry = { requests: 0, tokens: 0 };
          modelMap.set(record.model, entry);
        }
        entry.requests += 1;
        entry.tokens += record.input + record.cacheRead + record.cacheWrite + record.output;
      }
      const tokens = input + cacheRead + cacheWrite + output;
      const models = [...modelMap.entries()]
        .map(([model, entry]) => ({ model, requests: entry.requests, tokens: entry.tokens }))
        .sort((a, b) => b.tokens - a.tokens);
      const hourly = range === "today";
      const trendMap = new Map();
      for (const record of rows) {
        const key = hourly ? hourKey(record.t) : dayKey(record.t);
        let bucket = trendMap.get(key);
        if (bucket === undefined) {
          bucket = { requests: 0, tokens: 0 };
          trendMap.set(key, bucket);
        }
        bucket.requests += 1;
        bucket.tokens += record.input + record.cacheRead + record.cacheWrite + record.output;
      }
      const trend = [...trendMap.entries()]
        .map(([key, bucket]) => ({ key, requests: bucket.requests, tokens: bucket.tokens }))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      const details = rows
        .slice()
        .sort((a, b) => b.t - a.t)
        .slice(0, 300)
        .map((record) => ({
          t: record.t,
          model: record.model,
          session: record.session,
          input: record.input,
          cacheRead: record.cacheRead,
          cacheWrite: record.cacheWrite,
          output: record.output,
        }));
      return {
        range,
        from: new Date(from).toISOString(),
        to: new Date(now).toISOString(),
        totals: { requests, tokens, input, cacheRead, cacheWrite, output },
        models,
        trend,
        details,
      };
    },
  };
}

// ---------------------------------------------------------------- plugin body

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let sweepTimer = null;
let startupTimer = null;
let tornDown = false;

async function apply(ctx) {
  await loadStore();
  await loadRecords();
  await loadSettings();
  currentCtx = ctx;
  const fence = (req) => {
    try {
      return isTrustedApiRequest(req, ctx.webRuntime?.trustedHosts ?? []);
    } catch {
      return false;
    }
  };
  const api = buildApi();

  // Live counting: every session event in this process (web-profile sessions;
  // headless sessions are covered by the periodic sweep instead).
  ctx.on("session/event", (session, event) => {
    const sessionId = session?.id ?? "?";
    try {
      if (fold.ingest(sessionId, event)) {
        scheduleSave();
        scheduleRecordsSave();
      }
    } catch (error) {
      console.warn(`[chicheng-stats] live ingest failed:`, error instanceof Error ? error.message : String(error));
    }
  });

  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/stats/api",
    handler: async (req, res) => {
      if (!fence(req)) {
        writeJson(res, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } });
        return;
      }
      if (req.method !== "POST") {
        writeJson(res, 405, { ok: false, error: { code: "method-error", message: "method not allowed" } });
        return;
      }
      const pathname = new URL(req.url ?? "/", "http://stats.invalid").pathname;
      const method = pathname.startsWith("/stats/api/") ? pathname.slice(11) : undefined;
      if (method === undefined || method.includes("/") || method === "") {
        writeError(res, new StatsError("not-found", "unknown stats API method", 404));
        return;
      }
      try {
        const payload = await readJsonBody(req);
        const handler = api[method];
        if (typeof handler !== "function") throw new StatsError("not-found", `unknown stats API method "${method}"`, 404);
        writeOk(res, await handler(payload));
      } catch (error) {
        writeError(res, error);
      }
    },
  }), "chicheng-stats: /stats/api routes");

  ctx.effect(() => () => {
    tornDown = true;
    currentCtx = null;
    if (sweepTimer !== null) clearInterval(sweepTimer);
    sweepTimer = null;
    if (startupTimer !== null) clearTimeout(startupTimer);
    startupTimer = null;
    void flushStore();
    void flushRecords();
    void flushSettings();
  }, "chicheng-stats: teardown");

  // Backfill history shortly after startup, then sweep periodically for
  // sessions written by other processes (headless cron agents, etc.).
  startupTimer = setTimeout(() => {
    startupTimer = null;
    if (tornDown) return;
    void (async () => {
      await rebuildRecordsIfNeeded();
      if (!tornDown) await scanOnce();
    })();
  }, 1500);
  startupTimer.unref?.();
  sweepTimer = setInterval(() => {
    if (!tornDown) void scanOnce();
  }, SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();

  ctx.logger?.info?.("[chicheng-stats] started, store: " + STORE_PATH);
}

export { apply, inject, name, _internals };

/** Testability surface for the counting primitives (stable within this version). */
const _internals = { dayKey, hourKey, normalizeRange, rangeFromMs, modelOfEvent, usageOfEvent, usageTokens, createFold, sanitizeSettings, scanZstdFrames, parseEventLines, decodeSessionLog, headerId, sessionsRoot, rebuildRecordsIfNeeded };
