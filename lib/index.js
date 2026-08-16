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

  /** @returns true when the event contributed a usage sample. */
  function ingest(sessionId, event) {
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
    let bucket = days.get(day);
    if (bucket === undefined) {
      bucket = { requests: 0, tokens: 0 };
      days.set(day, bucket);
    }
    const last = lastUsage.get(sessionId);
    if (last !== undefined && last.turn === turn && last.step === step) {
      // same request re-reported (usage chunk → final message): replace
      const previousDay = days.get(last.day);
      if (previousDay !== undefined) previousDay.tokens = Math.max(0, previousDay.tokens - last.tokens);
      bucket.tokens += tokens;
    } else {
      bucket.requests += 1;
      bucket.tokens += tokens;
    }
    lastUsage.set(sessionId, { turn, step, day, tokens });
    return true;
  }

  /** Today vs all-time totals at `nowMs` (local-time day boundary). */
  function summary(nowMs) {
    const todayKey = dayKey(nowMs);
    let totalRequests = 0;
    let totalTokens = 0;
    let todayRequests = 0;
    let todayTokens = 0;
    for (const [day, bucket] of days) {
      const requests = Math.max(0, bucket.requests);
      const tokens = Math.max(0, bucket.tokens);
      totalRequests += requests;
      totalTokens += tokens;
      if (day === todayKey) {
        todayRequests = requests;
        todayTokens = tokens;
      }
    }
    return { today: { requests: todayRequests, tokens: todayTokens }, total: { requests: totalRequests, tokens: totalTokens }, todayKey };
  }

  function snapshot() {
    return { days: Object.fromEntries(days), watermarks: Object.fromEntries(watermarks) };
  }

  return {
    ingest,
    summary,
    snapshot,
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
      scanning: scanInFlight,
      scan: store.scan,
    }),
  };
}

// ---------------------------------------------------------------- plugin body

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let sweepTimer = null;
let startupTimer = null;
let tornDown = false;

async function apply(ctx) {
  await loadStore();
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
      if (fold.ingest(sessionId, event)) scheduleSave();
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
  }, "chicheng-stats: teardown");

  // Backfill history shortly after startup, then sweep periodically for
  // sessions written by other processes (headless cron agents, etc.).
  startupTimer = setTimeout(() => {
    startupTimer = null;
    if (!tornDown) void scanOnce();
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
const _internals = { dayKey, usageOfEvent, usageTokens, createFold, scanZstdFrames, parseEventLines, decodeSessionLog, headerId, sessionsRoot };
