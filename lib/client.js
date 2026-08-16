/**
 * chicheng-stats — client half
 *
 * Renders a one-line usage summary below the shell sidebar's Settings seat:
 *   今日请求：N | 总请求：N | 今日Token：N | 总Token：N
 * Clicking the line opens a detail dialog (Sub2API-style usage records):
 * time-range selector, overview chips, model distribution, token usage trend
 * chart and a per-request usage table. Data comes from the fenced /stats/api
 * JSON API; the summary line polls every 5 seconds.
 *
 * Deliberately dependency-light: only `react` + `react-dom/client` from the
 * shell's static module map; charts are hand-rolled SVG, all visuals are
 * self-contained CSS on the app's theme variables.
 */
window.__ModuleLoader__.load({
	id: "chicheng-stats",
	factory: (require) => {
		const React = require("react");
		const ReactDOM = require("react-dom/client");
		const { useState, useEffect, useRef, useCallback } = React;
		const h = React.createElement;

		// ------------------------------------------------------------ api

		async function call(method, payload) {
			const response = await fetch(`/stats/api/${method}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload ?? {}),
			});
			const parsed = await response.json().catch(() => null);
			if (!response.ok || parsed === null || parsed.ok !== true) {
				throw new Error(parsed?.error?.message ?? `HTTP ${response.status}`);
			}
			return parsed.value;
		}

		// ------------------------------------------------------------ copy

		function zhCopy() {
			return typeof document !== "undefined" && document.documentElement?.lang?.toLowerCase().startsWith("zh");
		}
		const t = (key) => {
			const zh = {
				cardLabel: "用量统计",
				todayRequests: "今日请求",
				totalRequests: "总请求",
				todayTokens: "今日Token",
				totalTokens: "总Token",
				dialogTitle: "用量统计",
				rangeToday: "今日",
				range7d: "近7天",
				range30d: "近30天",
				rangeMonth: "本月",
				rangeAll: "全部",
				overview: "概览",
				modelDist: "模型分布",
				trend: "Token 使用趋势",
				details: "用量明细",
				requests: "请求",
				tokens: "Token",
				colTime: "时间",
				colModel: "模型",
				colSession: "会话",
				colInput: "输入",
				colCacheRead: "缓存读",
				colCacheWrite: "缓存写",
				colOutput: "输出",
				colTotal: "合计",
				noData: "暂无数据",
				loading: "加载中…",
				error: "错误",
				close: "关闭",
				unavailable: "统计服务不可用",
				backfilling: "正在回填历史数据…",
			};
			const en = {
				cardLabel: "Usage",
				todayRequests: "Requests today",
				totalRequests: "Total requests",
				todayTokens: "Tokens today",
				totalTokens: "Total tokens",
				dialogTitle: "Usage",
				rangeToday: "Today",
				range7d: "7 days",
				range30d: "30 days",
				rangeMonth: "Month",
				rangeAll: "All",
				overview: "Overview",
				modelDist: "By model",
				trend: "Token trend",
				details: "Usage details",
				requests: "req",
				tokens: "tok",
				colTime: "Time",
				colModel: "Model",
				colSession: "Session",
				colInput: "Input",
				colCacheRead: "Cache R",
				colCacheWrite: "Cache W",
				colOutput: "Output",
				colTotal: "Total",
				noData: "No data",
				loading: "Loading…",
				error: "Error",
				close: "Close",
				unavailable: "stats service unavailable",
				backfilling: "Backfilling history…",
			};
			return (zhCopy() ? zh : en)[key] ?? key;
		};

		// ------------------------------------------------------------ format

		function formatTokens(n) {
			if (!Number.isFinite(n)) return "—";
			if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
			if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
			if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
			return String(n);
		}

		function formatRequests(n) {
			return Number.isFinite(n) ? n.toLocaleString() : "—";
		}

		function dayKeyOf(ms) {
			const d = new Date(ms);
			return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
		}

		function formatTime(t, nowMs) {
			const d = new Date(t);
			const sameDay = dayKeyOf(t) === dayKeyOf(nowMs);
			const hh = String(d.getHours()).padStart(2, "0");
			const mm = String(d.getMinutes()).padStart(2, "0");
			const ss = String(d.getSeconds()).padStart(2, "0");
			if (sameDay) return `${hh}:${mm}:${ss}`;
			return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hh}:${mm}`;
		}

		function shortSession(id) {
			return typeof id === "string" && id.length > 8 ? id.slice(0, 8) : (id ?? "—");
		}

		// ------------------------------------------------------------ icons

		const svg = (path, size = 16, extra) =>
			h("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true,
				style: { flex: "none" },
				...extra,
			}, h("path", { d: path, fill: "currentColor" }));

		const iconChart = (size = 16, extra) => svg("M1.5 13.5h13v1.5h-13zm1-2h2v-5h-2zm4 0h2v-8h-2zm4 0h2v-3h-2z", size, extra);
		const iconClose = (size = 16, extra) => svg("M8 6.586l4.293-4.293 1.414 1.414L9.414 8l4.293 4.293-1.414 1.414L8 9.414l-4.293 4.293-1.414-1.414L6.586 8 2.293 3.707l1.414-1.414L8 6.586z", size, extra);

		// ------------------------------------------------------------ css

		const CSS = `
.dshs-host{margin:0 2px 8px}
.dshs-line{box-sizing:border-box;width:calc(100% - 4px);display:block;text-align:left;padding:4px 8px;margin:0 2px 8px;
  border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#9aa3b2);
  font-size:11px;line-height:16px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshs-line:hover{background:var(--dsw-alias-interactive-bg-hover,#2a3140);color:var(--dsw-alias-label-primary,#e6e9ef)}
.dshs-rail{box-sizing:border-box;width:36px;height:36px;display:flex;align-items:center;justify-content:center;
  margin:0 2px 8px;border:1px solid transparent;border-radius:10px;color:var(--dsw-alias-label-secondary,#9aa3b2);
  background:transparent;cursor:pointer}
.dshs-rail:hover{background:var(--dsw-alias-interactive-bg-hover,#2a3140)}
.dshs-mask{position:fixed;inset:0;z-index:2147482000;background:rgba(8,10,14,.55);backdrop-filter:blur(2px);
  display:flex;align-items:center;justify-content:center;padding:24px}
.dshs-panel{box-sizing:border-box;width:min(880px,96vw);height:min(700px,92vh);display:flex;flex-direction:column;
  background:var(--dsw-alias-bg-base,#141822);color:var(--dsw-alias-label-primary,#e6e9ef);
  border:1px solid var(--dsw-alias-border-l2,#3a3f4b);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.45);
  overflow:hidden;font-size:14px}
.dshs-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;flex:none;
  border-bottom:1px solid var(--dsw-alias-border-l1,#262b36)}
.dshs-head h2{margin:0;font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px;white-space:nowrap}
.dshs-seg{display:flex;gap:4px;padding:3px;border:1px solid var(--dsw-alias-border-l2,#3a3f4b);border-radius:10px;
  background:var(--dsw-alias-bg-l2,#1b202b)}
.dshs-seg button{border:none;background:transparent;color:var(--dsw-alias-label-secondary,#9aa3b2);font-size:12px;
  padding:3px 10px;border-radius:7px;cursor:pointer;white-space:nowrap}
.dshs-seg button:hover{color:var(--dsw-alias-label-primary,#e6e9ef)}
.dshs-seg button[data-active="true"]{background:#3964fe;color:#fff}
.dshs-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2,#3a3f4b);
  background:var(--dsw-alias-button-elevated-fill,#1f2430);color:var(--dsw-alias-label-primary,#e6e9ef);font-size:12px;cursor:pointer}
.dshs-btn:hover{background:var(--dsw-alias-button-floating-hover,#262c3a)}
.dshs-body{flex:1;min-height:0;overflow:auto;padding:14px 16px 18px;display:flex;flex-direction:column;gap:18px}
.dshs-section h3{margin:0 0 8px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#e6e9ef)}
.dshs-chips{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
.dshs-chip{box-sizing:border-box;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1,#262b36);border-radius:10px;
  background:var(--dsw-alias-bg-l2,#1b202b);min-width:0}
.dshs-chip .dshs-chip-label{font-size:11px;color:var(--dsw-alias-label-secondary,#9aa3b2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshs-chip .dshs-chip-value{font-size:16px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshs-models{display:flex;flex-direction:column;gap:8px}
.dshs-model-meta{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:3px}
.dshs-model-name{font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshs-model-nums{font-size:11px;color:var(--dsw-alias-label-secondary,#9aa3b2);white-space:nowrap;flex:none}
.dshs-model-bar{height:6px;border-radius:99px;background:var(--dsw-alias-bg-l2,#1b202b);overflow:hidden}
.dshs-model-bar-fill{height:100%;border-radius:99px;background:#3964fe}
.dshs-chart{border:1px solid var(--dsw-alias-border-l1,#262b36);border-radius:10px;background:var(--dsw-alias-bg-l2,#1b202b);padding:8px}
.dshs-table-wrap{max-height:280px;overflow:auto;border:1px solid var(--dsw-alias-border-l1,#262b36);border-radius:10px}
.dshs-table{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}
.dshs-table th{position:sticky;top:0;background:var(--dsw-alias-bg-l2,#1b202b);color:var(--dsw-alias-label-secondary,#9aa3b2);
  font-weight:500;text-align:left;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,#262b36);white-space:nowrap;z-index:1}
.dshs-table td{padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,#262b36);white-space:nowrap;color:var(--dsw-alias-label-primary,#e6e9ef)}
.dshs-table tr:last-child td{border-bottom:none}
.dshs-table tr:hover td{background:var(--dsw-alias-interactive-bg-hover,#232936)}
.dshs-td-model{max-width:220px;overflow:hidden;text-overflow:ellipsis}
.dshs-td-total{font-weight:600}
.dshs-empty{color:var(--dsw-alias-label-secondary,#9aa3b2);font-size:12px;padding:18px;text-align:center}
.dshs-error{color:#f45d5d;font-size:12px;padding:12px;text-align:center}
@media (max-width: 720px){
  .dshs-mask{padding:0;align-items:stretch}
  .dshs-panel{width:100vw;width:100dvw;height:100vh;height:100dvh;max-height:none;border-radius:0;border-left:none;border-right:none;border-bottom:none}
  .dshs-head{min-height:52px;padding:10px 12px}
  .dshs-chips{grid-template-columns:repeat(2,1fr)}
  .dshs-body{padding:12px 12px 16px}
  .dshs-table{font-size:11px}
  .dshs-td-model{max-width:120px}
}
`;

		const CSS_TAG = "chicheng-stats/styles";

		// ------------------------------------------------------------ mounting

		/** The Settings seat at the sidebar bottom (last of the candidates). */
		function findSettingsButton() {
			const selectors = 'button[aria-label="设置"], button[aria-label="Settings"], button[aria-label="打开设置"], button[aria-label="Open settings"]';
			const found = document.querySelectorAll(selectors);
			if (found.length > 0) return found[found.length - 1];
			const candidates = document.querySelectorAll("button");
			for (const button of candidates) {
				const text = button.textContent ?? "";
				if (text.includes("设置") || text.includes("Settings")) return button;
			}
			return null;
		}

		/** New Session button finder (fallback anchor). */
		function findNewSessionButton() {
			const selectors = 'button[aria-label="新建会话"], button[aria-label="New session"], button[aria-label="New Session"]';
			const found = document.querySelectorAll(selectors);
			if (found.length > 0) return found[found.length - 1];
			const candidates = document.querySelectorAll("button");
			for (const button of candidates) {
				if (button.textContent?.includes("新会话") || button.textContent?.includes("New Session")) {
					return button;
				}
			}
			return null;
		}

		/**
		 * Resolve {anchor, before} for the one-line summary; null when the
		 * sidebar is not ready. The line sits BELOW the Settings seat (the
		 * shell's sidebar.settings slot host), at the very bottom of the left
		 * sidebar, on every viewport (desktop, collapsed rail, mobile drawer).
		 */
		function findMountPoint() {
			const seat = document.querySelector('[data-slot="sidebar.settings"]');
			if (seat !== null && seat.parentNode !== null) {
				return { anchor: seat, before: false };
			}
			const settings = findSettingsButton();
			if (settings !== null && settings.parentNode !== null) {
				return { anchor: settings, before: false };
			}
			const fresh = findNewSessionButton();
			if (fresh !== null && fresh.parentNode !== null) {
				return { anchor: fresh, before: false };
			}
			return null;
		}

		function isCollapsed(button) {
			let node = button?.parentElement;
			let depth = 0;
			while (node && depth < 6) {
				const cls = typeof node.className === "string" ? node.className : "";
				if (cls.includes("collapsed")) return true;
				const w = node.getBoundingClientRect?.().width;
				if (w !== undefined && w > 0 && w < 100 && cls !== "") return true;
				node = node.parentElement;
				depth += 1;
			}
			return false;
		}

		// ------------------------------------------------------------ summary line

		function SummaryLine({ data, error, onOpen }) {
			const today = data?.today ?? {};
			const total = data?.total ?? {};
			const backfill = data?.backfill ?? null;
			const line = `${t("todayRequests")}：${formatRequests(today.requests)} | ${t("totalRequests")}：${formatRequests(total.requests)} | ${t("todayTokens")}：${formatTokens(today.tokens)} | ${t("totalTokens")}：${formatTokens(total.tokens)}`;
			const title = error !== null
				? t("unavailable")
				: backfill !== null && backfill.done === false
					? `${line}（${t("backfilling")}）`
					: line;
			return h("button", {
				type: "button",
				className: "dshs-line",
				title,
				"aria-label": t("cardLabel"),
				onClick: onOpen,
			}, line);
		}

		function StatsWidget({ collapsed, onOpen }) {
			const [data, setData] = useState(null);
			const [error, setError] = useState(null);
			const timerRef = useRef(null);
			const mountedRef = useRef(true);

			const refresh = useCallback(async () => {
				try {
					const value = await call("summary");
					if (mountedRef.current) {
						setData(value);
						setError(null);
					}
				} catch (e) {
					if (mountedRef.current) setError(e.message);
				}
			}, []);

			useEffect(() => {
				mountedRef.current = true;
				void refresh();
				timerRef.current = setInterval(() => void refresh(), 5000);
				const onVisible = () => {
					if (document.visibilityState === "visible") void refresh();
				};
				document.addEventListener("visibilitychange", onVisible);
				return () => {
					mountedRef.current = false;
					if (timerRef.current !== null) clearInterval(timerRef.current);
					timerRef.current = null;
					document.removeEventListener("visibilitychange", onVisible);
				};
			}, [refresh]);

			if (collapsed) {
				return h("button", {
					type: "button",
					className: "dshs-rail",
					"aria-label": t("cardLabel"),
					title: t("cardLabel"),
					onClick: onOpen,
				}, iconChart(16));
			}
			return h(SummaryLine, { data, error, onOpen });
		}

		// ------------------------------------------------------------ dialog

		const RANGES = [
			{ id: "today", label: t("rangeToday") },
			{ id: "7d", label: t("range7d") },
			{ id: "30d", label: t("range30d") },
			{ id: "month", label: t("rangeMonth") },
			{ id: "all", label: t("rangeAll") },
		];

		function OverviewChips({ totals }) {
			const items = [
				{ label: t("requests"), value: formatRequests(totals?.requests) },
				{ label: t("tokens"), value: formatTokens(totals?.tokens) },
				{ label: t("colInput"), value: formatTokens(totals?.input) },
				{ label: t("colOutput"), value: formatTokens(totals?.output) },
				{ label: t("colCacheRead"), value: formatTokens(totals?.cacheRead) },
				{ label: t("colCacheWrite"), value: formatTokens(totals?.cacheWrite) },
			];
			return h("div", { className: "dshs-chips" },
				items.map((item) => h("div", { key: item.label, className: "dshs-chip" },
					h("div", { className: "dshs-chip-label" }, item.label),
					h("div", { className: "dshs-chip-value" }, item.value),
				)),
			);
		}

		function ModelRows({ models }) {
			if (models.length === 0) return h("div", { className: "dshs-empty" }, t("noData"));
			const max = Math.max(...models.map((m) => m.tokens), 1);
			const totalTokens = models.reduce((sum, m) => sum + m.tokens, 0);
			return h("div", { className: "dshs-models" },
				models.map((m) => h("div", { key: m.model, className: "dshs-model" },
					h("div", { className: "dshs-model-meta" },
						h("span", { className: "dshs-model-name" }, m.model),
						h("span", { className: "dshs-model-nums" },
							`${m.requests} ${t("requests")} · ${formatTokens(m.tokens)} ${t("tokens")}${totalTokens > 0 ? ` (${((m.tokens / totalTokens) * 100).toFixed(1)}%)` : ""}`),
					),
					h("div", { className: "dshs-model-bar" },
						h("div", { className: "dshs-model-bar-fill", style: { width: `${Math.max(1, (m.tokens / max) * 100)}%` } }),
					),
				)),
			);
		}

		function TrendChart({ trend }) {
			const n = trend.length;
			if (n === 0) return h("div", { className: "dshs-empty" }, t("noData"));
			const W = 640;
			const H = 150;
			const padT = 18;
			const plotH = 110;
			const max = Math.max(...trend.map((b) => b.tokens), 1);
			const slot = (W - 8) / n;
			const barW = Math.max(2, Math.min(26, slot - 3));
			const step = Math.max(1, Math.ceil(n / 12));
			const bars = trend.map((b, i) => {
				const x = 4 + i * slot;
				const height = Math.max(1, (b.tokens / max) * plotH);
				return h("rect", {
					key: `${b.key}-${i}`,
					x,
					y: padT + plotH - height,
					width: barW,
					height,
					rx: 1.5,
					fill: "#3964fe",
					opacity: 0.85,
				}, h("title", {}, `${b.key} · ${b.requests} ${t("requests")} · ${formatTokens(b.tokens)} ${t("tokens")}`));
			});
			const labels = trend.map((b, i) =>
				i % step === 0
					? h("text", {
						key: `l-${b.key}`,
						x: 4 + i * slot + barW / 2,
						y: H - 6,
						fontSize: 9,
						fill: "var(--dsw-alias-label-secondary,#9aa3b2)",
						textAnchor: "middle",
					}, b.key)
					: null);
			return h("div", { className: "dshs-chart" },
				h("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": t("trend") },
					h("text", { x: 4, y: 12, fontSize: 10, fill: "var(--dsw-alias-label-tertiary,#6b7280)" }, `max ${formatTokens(max)}`),
					bars,
					labels,
				),
			);
		}

		function DetailTable({ details }) {
			if (details.length === 0) return h("div", { className: "dshs-empty" }, t("noData"));
			const nowMs = Date.now();
			const columns = [t("colTime"), t("colModel"), t("colSession"), t("colInput"), t("colCacheRead"), t("colCacheWrite"), t("colOutput"), t("colTotal")];
			return h("div", { className: "dshs-table-wrap" },
				h("table", { className: "dshs-table" },
					h("thead", null, h("tr", null, columns.map((c) => h("th", { key: c }, c)))),
					h("tbody", null, details.map((d) => {
						const total = d.input + d.cacheRead + d.cacheWrite + d.output;
						return h("tr", { key: `${d.t}-${d.session}-${d.model}-${total}` },
							h("td", {}, formatTime(d.t, nowMs)),
							h("td", { className: "dshs-td-model", title: d.model }, d.model),
							h("td", {}, shortSession(d.session)),
							h("td", {}, formatTokens(d.input)),
							h("td", {}, formatTokens(d.cacheRead)),
							h("td", {}, formatTokens(d.cacheWrite)),
							h("td", {}, formatTokens(d.output)),
							h("td", { className: "dshs-td-total" }, formatTokens(total)),
						);
					})),
				),
			);
		}

		function StatsDialog({ onClose }) {
			const [range, setRange] = useState("today");
			const [data, setData] = useState(null);
			const [error, setError] = useState(null);
			const [loading, setLoading] = useState(true);

			// Escape closes the dialog.
			useEffect(() => {
				const onKey = (event) => {
					if (event.key === "Escape") onClose();
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [onClose]);

			// Lock background scroll while the dialog is open.
			useEffect(() => {
				const previous = document.body.style.overflow;
				document.body.style.overflow = "hidden";
				return () => { document.body.style.overflow = previous; };
			}, []);

			useEffect(() => {
				let cancelled = false;
				setLoading(true);
				setError(null);
				call("usage", { range })
					.then((value) => {
						if (!cancelled) {
							setData(value);
							setLoading(false);
						}
					})
					.catch((e) => {
						if (!cancelled) {
							setError(e.message);
							setLoading(false);
						}
					});
				return () => { cancelled = true; };
			}, [range]);

			const body = loading
				? h("div", { className: "dshs-empty" }, t("loading"))
				: error !== null
					? h("div", { className: "dshs-error" }, `${t("error")}: ${error}`)
					: h(React.Fragment, null,
						h("section", { className: "dshs-section" },
							h("h3", null, t("overview")),
							h(OverviewChips, { totals: data?.totals }),
						),
						h("section", { className: "dshs-section" },
							h("h3", null, t("modelDist")),
							h(ModelRows, { models: data?.models ?? [] }),
						),
						h("section", { className: "dshs-section" },
							h("h3", null, t("trend")),
							h(TrendChart, { trend: data?.trend ?? [] }),
						),
						h("section", { className: "dshs-section" },
							h("h3", null, `${t("details")} (${(data?.details ?? []).length})`),
							h(DetailTable, { details: data?.details ?? [] }),
						),
					);

			return h("div", { className: "dshs-mask", onMouseDown: (e) => { if (e.target === e.currentTarget) onClose(); } },
				h("div", { className: "dshs-panel", role: "dialog", "aria-modal": "true", "aria-label": t("dialogTitle") },
					h("div", { className: "dshs-head" },
						h("h2", null, iconChart(18), t("dialogTitle")),
						h("div", { className: "dshs-seg", role: "group" },
							RANGES.map((r) => h("button", {
								key: r.id,
								type: "button",
								"data-active": String(r.id === range),
								onClick: () => setRange(r.id),
							}, r.label)),
						),
						h("button", { type: "button", className: "dshs-btn", onClick: onClose, "aria-label": t("close") }, iconClose(14)),
					),
					h("div", { className: "dshs-body" }, body),
				),
			);
		}

		// ------------------------------------------------------------ apply

		const inject = [];

		function apply(ctx) {
			// CSS (tag-guarded, same pattern as first-party client plugins)
			if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${CSS_TAG}"]`) === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = "chicheng-stats";
				tag.dataset.pluginCss = CSS_TAG;
				tag.textContent = CSS;
				document.head.appendChild(tag);
			}

			ctx.effect(() => {
				let disposed = false;
				let root = null;
				let host = null;
				let probeTimer = null;
				let collapseObserver = null;
				let dialogRoot = null;

				const closeDialog = () => {
					if (dialogRoot !== null) {
						dialogRoot.unmount();
						dialogRoot = null;
						const leftover = document.querySelector('[data-dsh-stats-dialog]');
						if (leftover !== null) leftover.remove();
					}
				};

				const openDialog = () => {
					if (disposed) return;
					if (dialogRoot === null) {
						const wrap = document.createElement("div");
						wrap.setAttribute("data-dsh-stats-dialog", "");
						document.body.appendChild(wrap);
						dialogRoot = ReactDOM.createRoot(wrap);
					}
					dialogRoot.render(h(StatsDialog, { onClose: closeDialog }));
				};

				const teardown = () => {
					disposed = true;
					closeDialog();
					if (probeTimer !== null) clearInterval(probeTimer);
					probeTimer = null;
					if (collapseObserver !== null) {
						collapseObserver.disconnect();
						collapseObserver = null;
					}
					if (root !== null) {
						root.unmount();
						root = null;
					}
					if (host !== null && host.parentNode !== null) host.parentNode.removeChild(host);
					host = null;
				};

				const mountLine = () => {
					if (host !== null) return;
					const point = findMountPoint();
					if (point === null) return;
					host = document.createElement("div");
					host.setAttribute("data-dsh-stats-host", "");
					host.className = "dshs-host";
					if (point.before) {
						point.anchor.parentNode.insertBefore(host, point.anchor);
					} else {
						point.anchor.parentNode.insertBefore(host, point.anchor.nextSibling);
					}
					root = ReactDOM.createRoot(host);
					let collapsed = isCollapsed(point.anchor);
					const render = () => {
						if (root === null || host === null) return;
						root.render(h(StatsWidget, { collapsed, onOpen: openDialog }));
					};
					render();
					// Track the shell's wide/rail flip by watching class changes on
					// the sidebar column (MutationObserver, not polling).
					const rootEl = host.parentElement;
					if (rootEl !== null && rootEl !== undefined && typeof MutationObserver !== "undefined") {
						collapseObserver = new MutationObserver(() => {
							if (disposed || host === null) return;
							const next = isCollapsed(point.anchor);
							if (next !== collapsed) {
								collapsed = next;
								render();
							}
						});
						collapseObserver.observe(rootEl, { attributes: true, attributeFilter: ["class"], subtree: true });
					}
				};

				probeTimer = setInterval(() => {
					if (disposed) return;
					if (host === null) mountLine();
				}, 400);

				return teardown;
			}, "chicheng-stats: sidebar mount");
		}

		return { apply, inject };
	}
});
