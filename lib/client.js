/**
 * chicheng-stats — client half
 *
 * Renders a compact usage card at the bottom of the sidebar (above the
 * Settings seat): today's / total requests and today's / total tokens,
 * polled from the host's fenced /stats/api JSON API every 5 seconds.
 * In the collapsed rail the card shrinks to a small icon button.
 *
 * Deliberately dependency-light: only `react` + `react-dom/client` from the
 * shell's static module map; all visuals are self-contained CSS on the
 * app's theme variables.
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
				todayTokens: "今日Token",
				totalRequests: "总请求",
				totalTokens: "总Token",
				backfilling: "正在回填历史数据…",
				unavailable: "统计服务不可用",
			};
			const en = {
				cardLabel: "Usage",
				todayRequests: "Requests today",
				todayTokens: "Tokens today",
				totalRequests: "Total requests",
				totalTokens: "Total tokens",
				backfilling: "Backfilling history…",
				unavailable: "stats service unavailable",
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

		// ------------------------------------------------------------ css

		const CSS = `
.dshs-host{margin:0 2px 8px}
.dshs-card{box-sizing:border-box;padding:9px 12px 8px;border:1px solid var(--dsw-alias-border-l2,#3a3f4b);
  background:var(--dsw-alias-bg-l2,#1b202b);border-radius:12px;color:var(--dsw-alias-label-primary,#e6e9ef)}
.dshs-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px 14px}
.dshs-item{min-width:0}
.dshs-item .dshs-label{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary,#9aa3b2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshs-item .dshs-value{font-size:15px;line-height:20px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshs-hint{margin-top:5px;font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary,#6b7280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshs-rail{box-sizing:border-box;width:36px;height:36px;display:flex;align-items:center;justify-content:center;
  margin:0 2px 8px;border:1px solid transparent;border-radius:10px;color:var(--dsw-alias-label-secondary,#9aa3b2);
  background:transparent;cursor:default}
.dshs-rail:hover{background:var(--dsw-alias-interactive-bg-hover,#2a3140)}
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

		/** Resolve {anchor, before} for the card; null when the sidebar is not ready. */
		function findMountPoint() {
			// Primary anchor: the shell's settings-seat slot host — exact and
			// label-independent, so the card always lands at the very bottom of
			// the LEFT sidebar, directly above the Settings seat, on every
			// viewport (desktop, collapsed rail, mobile drawer alike).
			const seat = document.querySelector('[data-slot="sidebar.settings"]');
			if (seat !== null && seat.parentNode !== null) {
				return { anchor: seat, before: true };
			}
			// Fallbacks for shells without the slot wrapper: the settings button
			// (last match), then the New Session button.
			const settings = findSettingsButton();
			if (settings !== null && settings.parentNode !== null) {
				return { anchor: settings, before: true };
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

		// ------------------------------------------------------------ diagnostics

		/**
		 * Compact outline of the shell left sidebar, annotated with where the
		 * card host mounted (<<CARD-HOST) and the settings seat (<<SETTINGS).
		 * Posted to the host's /stats/api/diag so the DOM order can be
		 * inspected from the server side.
		 */
		function sidebarOutline() {
			const out = [];
			const cardHost = document.querySelector('[data-dsh-stats-host]');
			const desc = (node, prefix, deep) => {
				if (!node || node.nodeType !== 1) return;
				const cls = typeof node.className === "string" ? node.className : "";
				const slot = node.getAttribute?.("data-slot") ?? "";
				const label = node.getAttribute?.("aria-label") ?? "";
				const text = (node.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 36);
				let line = `${prefix}<${node.tagName.toLowerCase()}${cls ? ` class="${cls.slice(0, 60)}"` : ""}${slot ? ` data-slot="${slot}"` : ""}${label ? ` aria-label="${label}"` : ""}${text ? ` text="${text}"` : ""}`;
				if (node === cardHost) line += " <<CARD-HOST";
				if (slot === "sidebar.settings") line += " <<SETTINGS";
				out.push(`${line}>`);
				if (deep) {
					for (const child of node.children) {
						desc(child, `${prefix}  `, child.querySelector?.('[data-dsh-stats-host]') !== null || child.querySelector?.('[data-slot="sidebar.settings"]') !== null);
					}
				}
			};
			const sidebar = document.querySelector('[data-slot="sidebar"]');
			if (sidebar === null) {
				out.push("no [data-slot=sidebar] in document");
				out.push(`settingsSlot=${document.querySelector('[data-slot="sidebar.settings"]') !== null ? "found" : "MISSING"} newSessionBtn=${findNewSessionButton() !== null ? "found" : "MISSING"}`);
				return out.join("\n");
			}
			desc(sidebar, "", true);
			return out.join("\n");
		}

		// ------------------------------------------------------------ widget

		function UsageCard({ data, error }) {
			const today = data?.today ?? {};
			const total = data?.total ?? {};
			const backfill = data?.backfill ?? null;
			const items = [
				{ label: t("todayRequests"), value: formatRequests(today.requests) },
				{ label: t("todayTokens"), value: formatTokens(today.tokens) },
				{ label: t("totalRequests"), value: formatRequests(total.requests) },
				{ label: t("totalTokens"), value: formatTokens(total.tokens) },
			];
			const hint = error !== null
				? t("unavailable")
				: backfill !== null && backfill.done === false
					? t("backfilling")
					: "";
			return h("div", { className: "dshs-card" },
				h("div", { className: "dshs-grid" },
					items.map((item) => h("div", { key: item.label, className: "dshs-item" },
						h("div", { className: "dshs-label" }, item.label),
						h("div", { className: "dshs-value" }, item.value),
					)),
				),
				hint !== "" && h("div", { className: "dshs-hint" }, hint),
			);
		}

		function UsageWidget({ onMount }) {
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
				onMount?.(refresh);
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
			}, [refresh, onMount]);

			return h(UsageCard, { data, error });
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
				let refreshFn = null;
				let collapsed = false;

				const render = () => {
					if (root === null || host === null) return;
					if (collapsed) {
						root.render(h("div", {
							className: "dshs-rail",
							"data-collapsed": "true",
							title: t("cardLabel"),
						}, iconChart(16)));
					} else {
						root.render(h(UsageWidget, {
							onMount: (fn) => { refreshFn = fn; },
						}));
					}
				};

				const teardown = () => {
					disposed = true;
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
					refreshFn = null;
				};

				const mountCard = () => {
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
					collapsed = isCollapsed(point.anchor);
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

				// Diagnostic reporter: posts the sidebar outline whenever it
				// changes (mount position included), read via /stats/api/status.
				let lastSentOutline = null;
				const sendDiag = () => {
					if (disposed) return;
					const outline = sidebarOutline();
					if (outline === lastSentOutline) return;
					lastSentOutline = outline;
					void call("diag", { dom: outline }).catch(() => {});
				};

				probeTimer = setInterval(() => {
					if (disposed) return;
					if (host === null) mountCard();
					sendDiag();
				}, 400);
				sendDiag();

				return teardown;
			}, "chicheng-stats: sidebar mount");
		}

		return { apply, inject };
	}
});
