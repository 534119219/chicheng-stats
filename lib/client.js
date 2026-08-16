/**
 * chicheng-stats — client half
 *
 * Sidebar usage widget, configurable from Settings → 用量统计:
 *   - mode: one-line text (custom template with {placeholders}) or a card
 *     (adjustable title/value sizes, spacing, card size);
 *   - position: above or below the shell sidebar's Settings seat.
 * Clicking the widget opens a detail dialog (Sub2API-style usage records):
 * time-range selector, overview chips, model distribution, token usage trend
 * chart and a per-request usage table.
 *
 * Data comes from the fenced /stats/api JSON API; the widget polls
 * settings + summary every 5 seconds. Charts are hand-rolled SVG; all
 * visuals are self-contained CSS on the app's theme variables.
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
				todayInput: "今日输入",
				totalInput: "总输入",
				todayOutput: "今日输出",
				totalOutput: "总输出",
				todayCacheRead: "今日缓存读",
				totalCacheRead: "总缓存读",
				todayCacheWrite: "今日缓存写",
				totalCacheWrite: "总缓存写",
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
				cacheHit: "缓存命中",
				colOutput: "输出",
				colTotal: "合计",
				noData: "暂无数据",
				loading: "加载中…",
				error: "错误",
				close: "关闭",
				unavailable: "统计服务不可用",
				backfilling: "正在回填历史数据…",
				settingsNav: "用量统计",
				setIntro: "自定义主界面侧边栏中用量统计的显示方式（文字模板 / 卡片样式 / 位置）。",
				setMode: "显示模式",
				modeText: "文字",
				modeCard: "卡片",
				setPosition: "位置",
				posAbove: "设置上方",
				posBelow: "设置下方",
				template: "显示格式（支持占位符）",
				templateHint: "点击下方占位符插入到光标处；可直接在文本框里按回车换行；也可手输中文占位符（如 {总Token}）；未识别的会原样保留。",
				fontSize: "文字大小",
				cardSize: "卡片大小",
				cardSizeSmall: "小",
				cardSizeMedium: "中",
				cardSizeLarge: "大",
				titleSize: "标题大小",
				valueSize: "数值大小",
				gap: "间隔",
				preview: "预览",
				reset: "恢复默认",
				saved: "已保存",
				textColor: "文字颜色",
				colorDefault: "默认",
				weight: "文字粗细",
				weightNormal: "常规",
				weightMedium: "中等",
				weightBold: "加粗",
				align: "对齐",
				alignLeft: "左",
				alignCenter: "中",
				alignRight: "右",
				bgFill: "背景填充",
				bgColor: "背景颜色",
				radius: "圆角",
				padding: "内边距",
				columns: "每行列数",
				col1: "1列",
				col2: "2列",
				col4: "4列",
				showItems: "显示项目",
				cardBg: "背景颜色",
				border: "边框粗细",
				borderColor: "边框颜色",
				titleColor: "标题颜色",
				valueColor: "数值颜色",
				setBase: "基础设置",
				setFormat: "显示格式",
				setStyle: "样式",
				setAppearance: "外观",
				setLayout: "布局",
				setCardText: "文字样式",
			};
			const en = {
				cardLabel: "Usage",
				todayRequests: "Requests today",
				totalRequests: "Total requests",
				todayTokens: "Tokens today",
				totalTokens: "Total tokens",
				todayInput: "Input today",
				totalInput: "Total input",
				todayOutput: "Output today",
				totalOutput: "Total output",
				todayCacheRead: "Cache read today",
				totalCacheRead: "Total cache read",
				todayCacheWrite: "Cache write today",
				totalCacheWrite: "Total cache write",
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
				cacheHit: "Cache hit",
				colOutput: "Output",
				colTotal: "Total",
				noData: "No data",
				loading: "Loading…",
				error: "Error",
				close: "Close",
				unavailable: "stats service unavailable",
				backfilling: "Backfilling history…",
				settingsNav: "Usage stats",
				setIntro: "Customize how the usage widget is shown in the main sidebar.",
				setMode: "Display mode",
				modeText: "Text",
				modeCard: "Card",
				setPosition: "Position",
				posAbove: "Above Settings",
				posBelow: "Below Settings",
				template: "Display format (placeholders)",
				templateHint: "Click a placeholder to insert it at the cursor; press Enter in the box to add line breaks; Chinese names (e.g. {总Token}) also work; unknown tokens stay as-is.",
				fontSize: "Font size",
				cardSize: "Card size",
				cardSizeSmall: "Small",
				cardSizeMedium: "Medium",
				cardSizeLarge: "Large",
				titleSize: "Title size",
				valueSize: "Value size",
				gap: "Spacing",
				preview: "Preview",
				reset: "Reset to defaults",
				saved: "Saved",
				textColor: "Text color",
				colorDefault: "Default",
				weight: "Font weight",
				weightNormal: "Normal",
				weightMedium: "Medium",
				weightBold: "Bold",
				align: "Align",
				alignLeft: "Left",
				alignCenter: "Center",
				alignRight: "Right",
				bgFill: "Background fill",
				bgColor: "Background",
				radius: "Radius",
				padding: "Padding",
				columns: "Columns",
				col1: "1",
				col2: "2",
				col4: "4",
				showItems: "Items",
				cardBg: "Background",
				border: "Border width",
				borderColor: "Border color",
				titleColor: "Title color",
				valueColor: "Value color",
				setBase: "Basic",
				setFormat: "Format",
				setStyle: "Style",
				setAppearance: "Appearance",
				setLayout: "Layout",
				setCardText: "Text",
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
.dshs-host{box-sizing:border-box;width:calc(100% - 4px);margin:0 2px 8px}
.dshs-host[data-collapsed="true"]{width:36px;height:36px;align-self:flex-start;margin:0 0 8px;
  display:flex;align-items:center;justify-content:center}
.dshs-host[data-collapsed="true"] .dshs-rail{margin:0}
.dshs-line{box-sizing:border-box;width:100%;display:block;text-align:left;padding:4px 8px;margin:0;
  border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#9aa3b2);
  line-height:1.5;cursor:pointer;white-space:pre-line;overflow-wrap:anywhere}
.dshs-line:hover{background:var(--dsw-alias-interactive-bg-hover,#2a3140);color:var(--dsw-alias-label-primary,#e6e9ef)}
.dshs-setcard{box-sizing:border-box;width:100%;margin:0;display:block;text-align:left;
  border:1px solid var(--dsw-alias-border-l2,#3a3f4b);background:#43454a;
  color:var(--dsw-alias-label-primary,#e6e9ef);cursor:pointer}
.dshs-setcard:hover{background:var(--dsw-alias-interactive-bg-hover,#262c3a)}
.dshs-setcard-grid{display:grid;grid-template-columns:1fr 1fr}
.dshs-setcard-item{min-width:0}
.dshs-setcard-label{color:var(--dsw-alias-label-secondary,#9aa3b2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshs-setcard-value{font-weight:600;font-variant-numeric:tabular-nums;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshs-rail{box-sizing:border-box;width:36px;height:36px;display:flex;align-items:center;justify-content:center;
  margin:0;border:1px solid transparent;border-radius:10px;color:var(--dsw-alias-label-secondary,#9aa3b2);
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
.dshs-chips{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
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
/* settings page */
.dshs-set{display:flex;flex-direction:column;gap:16px;max-width:720px}
.dshs-set-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dshs-set-title{font-size:15px;font-weight:600}
.dshs-set-intro{font-size:12px;color:var(--dsw-alias-label-secondary,#9aa3b2);margin-top:3px}
.dshs-set-actions{display:flex;align-items:center;gap:10px;flex:none}
.dshs-set-saved{font-size:12px;color:#3ddc84}
.dshs-set-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.dshs-set-label{font-size:12px;color:var(--dsw-alias-label-secondary,#9aa3b2);width:96px;flex:none}
.dshs-set-block{display:flex;flex-direction:column;gap:8px}
.dshs-set-hint{font-size:11px;color:var(--dsw-alias-label-tertiary,#6b7280)}
.dshs-set-textarea{box-sizing:border-box;width:100%;padding:8px 10px;font-size:13px;color:inherit;
  background:var(--dsw-alias-input-fill,#10141d);border:1px solid var(--dsw-alias-border-l2,#3a3f4b);border-radius:9px;outline:none;font-family:inherit;resize:vertical}
.dshs-set-textarea:focus{border-color:#639efe}
.dshs-set-ph{display:flex;gap:6px;flex-wrap:wrap}
.dshs-set-ph-chip{border:1px solid var(--dsw-alias-border-l2,#3a3f4b);background:var(--dsw-alias-bg-l2,#1b202b);
  color:var(--dsw-alias-label-secondary,#9aa3b2);font-size:11px;padding:3px 9px;border-radius:99px;cursor:pointer}
.dshs-set-ph-chip:hover{border-color:#639efe;color:var(--dsw-alias-label-primary,#e6e9ef)}
.dshs-set-input{box-sizing:border-box;width:80px;padding:5px 8px;font-size:13px;color:inherit;
  background:var(--dsw-alias-input-fill,#10141d);border:1px solid var(--dsw-alias-border-l2,#3a3f4b);border-radius:8px;outline:none;font-family:inherit}
.dshs-set-input:focus{border-color:#639efe}
.dshs-set-color{box-sizing:border-box;width:38px;height:28px;padding:2px;border:1px solid var(--dsw-alias-border-l2,#3a3f4b);
  border-radius:8px;background:var(--dsw-alias-input-fill,#10141d);cursor:pointer}
.dshs-set-checks{display:flex;gap:12px;flex-wrap:wrap}
.dshs-set-check{display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;font-size:12px;color:var(--dsw-alias-label-secondary,#9aa3b2)}
.dshs-set-check input{accent-color:#639efe}
.dshs-set-unit{font-size:12px;color:var(--dsw-alias-label-tertiary,#6b7280)}
.dshs-set-preview{border:1px dashed var(--dsw-alias-border-l2,#3a3f4b);border-radius:10px;padding:10px;background:var(--dsw-alias-bg-l2,#1b202b)}
.dshs-set-section{border:1px solid var(--dsw-alias-border-l2);border-radius:16px;
  background:var(--dsw-alias-bg-layer-3);padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.dshs-set-section-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#e6e9ef)}
@media (max-width: 720px){
  .dshs-mask{padding:0;align-items:stretch}
  .dshs-panel{width:100vw;width:100dvw;height:100vh;height:100dvh;max-height:none;border-radius:0;border-left:none;border-right:none;border-bottom:none}
  .dshs-head{min-height:52px;padding:10px 12px}
  .dshs-chips{grid-template-columns:repeat(2,1fr)}
  .dshs-body{padding:12px 12px 16px}
  .dshs-table{font-size:11px}
  .dshs-td-model{max-width:120px}
  .dshs-set-label{width:auto;min-width:72px}
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
		 * Resolve the mount point for the widget. The widget mounts as a
		 * DIRECT child of the sidebar ROOT (the same flex column that holds
		 * 新会话 / 定时任务 / the settings foot area), right above or below
		 * the foot area that contains the Settings seat — exactly like
		 * chicheng-cron's trigger and the shell's own buttons, so the rail
		 * icon aligns pixel-perfectly without any compensation.
		 * Returns {root, anchor, before} or null when the sidebar is not ready.
		 */
		function findMountPoint(position) {
			const above = position === "above";
			const seat = document.querySelector('[data-slot="sidebar.settings"]');
			const fresh = findNewSessionButton();
			const root = fresh !== null && fresh.parentElement !== null ? fresh.parentElement : null;
			if (seat !== null && root !== null && root.contains(seat)) {
				// seat → settingsArea → footArea → root
				const footArea = seat.parentElement !== null && seat.parentElement.parentElement !== null
					? seat.parentElement.parentElement
					: seat;
				return { root, anchor: footArea, before: above };
			}
			if (seat !== null && seat.parentNode !== null) {
				return { root: seat.parentNode, anchor: seat, before: above };
			}
			const settings = findSettingsButton();
			if (settings !== null && settings.parentNode !== null) {
				return { root: settings.parentNode, anchor: settings, before: above };
			}
			if (fresh !== null && fresh.parentNode !== null) {
				return { root: fresh.parentNode, anchor: fresh, before: above };
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

		// ------------------------------------------------------------ widget

		const DEFAULT_TEMPLATE = "今日请求：{todayRequests} | 总请求：{totalRequests} | 今日Token：{todayTokens} | 总Token：{totalTokens}";

		/** Substitute {placeholders} in a user template; unknown tokens stay. */
		function renderTemplate(template, values) {
			return String(template ?? "").replace(/\{(\w+)\}/g, (match, key) => (values[key] !== undefined ? values[key] : match));
		}

		/** Placeholder → formatted value map from a summary payload. */
		function summaryValues(data) {
			const today = data?.today ?? {};
			const total = data?.total ?? {};
			const values = {
				todayRequests: formatRequests(today.requests),
				totalRequests: formatRequests(total.requests),
				todayTokens: formatTokens(today.tokens),
				totalTokens: formatTokens(total.tokens),
				todayInput: formatTokens(today.input),
				totalInput: formatTokens(total.input),
				todayOutput: formatTokens(today.output),
				totalOutput: formatTokens(total.output),
				todayCacheRead: formatTokens(today.cacheRead),
				totalCacheRead: formatTokens(total.cacheRead),
				todayCacheWrite: formatTokens(today.cacheWrite),
				totalCacheWrite: formatTokens(total.cacheWrite),
			};
			// Chinese names work as template tokens too: {总Token} ≡ {totalTokens}.
			for (const [key, label] of Object.entries(ZH_PLACEHOLDER_LABELS)) {
				values[label] = values[key];
			}
			return values;
		}

		function TextLine({ textSettings, data, error, onOpen }) {
			const ts = textSettings ?? {};
			const template = ts.template && ts.template.trim() !== ""
				? ts.template
				: DEFAULT_TEMPLATE;
			const line = renderTemplate(template, summaryValues(data));
			const title = error !== null ? t("unavailable") : line;
			const style = {
				fontSize: `${ts.fontSize ?? 11}px`,
				fontWeight: ts.weight === "bold" ? 700 : ts.weight === "medium" ? 500 : 400,
				textAlign: ts.align ?? "left",
			};
			if (ts.color) style.color = ts.color;
			if (ts.background) {
				style.background = ts.bgColor ?? "var(--dsw-alias-bg-l2,#1b202b)";
				style.border = "1px solid var(--dsw-alias-border-l2,#3a3f4b)";
				style.padding = `${ts.padding ?? 4}px 8px`;
				style.borderRadius = `${ts.radius ?? 8}px`;
			}
			return h("button", {
				type: "button",
				className: "dshs-line",
				style,
				title,
				"aria-label": t("cardLabel"),
				onClick: onOpen,
			}, line);
		}

		const ALL_CARD_ITEMS = ["todayRequests", "todayTokens", "totalRequests", "totalTokens"];
		/** Fixed display order for 4-column cards: 今日请求、总请求、今日Token、总Token. */
		const FOUR_COL_ORDER = ["todayRequests", "totalRequests", "todayTokens", "totalTokens"];

		function SettingsCard({ cardSettings, data, error, onOpen }) {
			const today = data?.today ?? {};
			const total = data?.total ?? {};
			const card = cardSettings ?? {};
			const columns = card.columns === 1 || card.columns === 4 ? card.columns : 2;
			// 4 columns share the row with three gaps and a narrower sidebar, so
			// tighten the horizontal spacing (padding + column gap) to give each
			// column more width — labels like 今日Token then fit without truncation.
			const verticalPad = card.size === "large" ? 12 : card.size === "medium" ? 10 : 8;
			const horizontalPad = columns === 4
				? (card.size === "large" ? 10 : card.size === "medium" ? 8 : 6)
				: (card.size === "large" ? 14 : card.size === "medium" ? 12 : 10);
			const padding = `${verticalPad}px ${horizontalPad}px`;
			const columnGap = columns === 4 ? Math.max(4, card.gap ?? 8) : (card.gap ?? 8) * 2;
			const titleSize = card.titleSize ?? 11;
			const valueSize = card.valueSize ?? 15;
			const gap = card.gap ?? 8;
			const itemValues = {
				todayRequests: [t("todayRequests"), formatRequests(today.requests)],
				todayTokens: [t("todayTokens"), formatTokens(today.tokens)],
				totalRequests: [t("totalRequests"), formatRequests(total.requests)],
				totalTokens: [t("totalTokens"), formatTokens(total.tokens)],
			};
			let keys = (card.items && card.items.length > 0 ? card.items : ALL_CARD_ITEMS)
				.filter((key) => itemValues[key] !== undefined);
			if (columns === 4) {
				// 4 columns always read left-to-right as 今日请求、总请求、今日Token、总Token.
				keys = FOUR_COL_ORDER.filter((key) => keys.includes(key));
			}
			const items = keys.map((key) => ({ key, label: itemValues[key][0], value: itemValues[key][1] }));
			const style = {
				padding,
				borderRadius: `${card.radius ?? 10}px`,
				borderWidth: `${card.border ?? 1}px`,
			};
			if (card.bg) style.background = card.bg;
			if (card.borderColor) style.borderColor = card.borderColor;
			const title = error !== null ? t("unavailable") : t("cardLabel");
			const labelStyle = {};
			const valueStyle = {};
			if (card.titleColor) labelStyle.color = card.titleColor;
			if (card.valueColor) valueStyle.color = card.valueColor;
			return h("button", {
				type: "button",
				className: "dshs-setcard",
				style,
				title,
				"aria-label": t("cardLabel"),
				onClick: onOpen,
			}, h("div", {
				className: "dshs-setcard-grid",
				style: { gridTemplateColumns: `repeat(${columns}, 1fr)`, rowGap: `${gap}px`, columnGap: `${columnGap}px` },
			},
				items.map((item) => h("div", { key: item.key, className: "dshs-setcard-item" },
					h("div", { className: "dshs-setcard-label", style: { fontSize: `${titleSize}px`, ...labelStyle } }, item.label),
					h("div", { className: "dshs-setcard-value", style: { fontSize: `${valueSize}px`, ...valueStyle } }, item.value),
				)),
			));
		}

		function StatsWidget({ settings, collapsed, data, error, onOpen }) {
			if (collapsed) {
				return h("button", {
					type: "button",
					className: "dshs-rail",
					"aria-label": t("cardLabel"),
					title: t("cardLabel"),
					onClick: onOpen,
				}, iconChart(16));
			}
			const mode = settings?.mode ?? "text";
			if (mode === "card") {
				return h(SettingsCard, { cardSettings: settings?.card, data, error, onOpen });
			}
			return h(TextLine, { textSettings: settings?.text, data, error, onOpen });
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
			const inputTotal = (totals?.input ?? 0) + (totals?.cacheRead ?? 0) + (totals?.cacheWrite ?? 0);
			const hitRate = inputTotal > 0
				? `${(((totals?.cacheRead ?? 0) / inputTotal) * 100).toFixed(1)}%`
				: "—";
			const items = [
				{ label: t("requests"), value: formatRequests(totals?.requests) },
				{ label: t("tokens"), value: formatTokens(totals?.tokens) },
				{ label: t("colInput"), value: formatTokens(totals?.input) },
				{ label: t("cacheHit"), value: hitRate },
				{ label: t("colOutput"), value: formatTokens(totals?.output) },
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
			const columns = [t("colTime"), t("colModel"), t("colSession"), t("colInput"), t("cacheHit"), t("colOutput"), t("colTotal")];
			return h("div", { className: "dshs-table-wrap" },
				h("table", { className: "dshs-table" },
					h("thead", null, h("tr", null, columns.map((c) => h("th", { key: c }, c)))),
					h("tbody", null, details.map((d) => {
						const total = d.input + d.cacheRead + d.cacheWrite + d.output;
						const inputTotal = d.input + d.cacheRead + d.cacheWrite;
						const hit = inputTotal > 0 ? `${((d.cacheRead / inputTotal) * 100).toFixed(0)}%` : "—";
						return h("tr", { key: `${d.t}-${d.session}-${d.model}-${total}` },
							h("td", {}, formatTime(d.t, nowMs)),
							h("td", { className: "dshs-td-model", title: d.model }, d.model),
							h("td", {}, shortSession(d.session)),
							h("td", {}, formatTokens(d.input)),
							h("td", {}, hit),
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

			useEffect(() => {
				const onKey = (event) => {
					if (event.key === "Escape") onClose();
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [onClose]);

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

		// ------------------------------------------------------------ settings page

		const PLACEHOLDER_KEYS = [
			"todayRequests",
			"totalRequests",
			"todayTokens",
			"totalTokens",
			"todayInput",
			"totalInput",
			"todayOutput",
			"totalOutput",
			"todayCacheRead",
			"totalCacheRead",
			"todayCacheWrite",
			"totalCacheWrite",
		];

		/** Chinese display names; also accepted as template tokens (e.g. {总Token}). */
		const ZH_PLACEHOLDER_LABELS = {
			todayRequests: "今日请求",
			totalRequests: "总请求",
			todayTokens: "今日Token",
			totalTokens: "总Token",
			todayInput: "今日输入",
			totalInput: "总输入",
			todayOutput: "今日输出",
			totalOutput: "总输出",
			todayCacheRead: "今日缓存读",
			totalCacheRead: "总缓存读",
			todayCacheWrite: "今日缓存写",
			totalCacheWrite: "总缓存写",
		};

		/** Color picker row: color input + "default" reset (null = theme). */
		function ColorRow({ labelKey, value, onChange }) {
			return h("div", { className: "dshs-set-row" },
				h("div", { className: "dshs-set-label" }, t(labelKey)),
				h("input", {
					type: "color",
					className: "dshs-set-color",
					value: value ?? "#e6e9ef",
					onChange: (e) => onChange(e.target.value),
				}),
				value !== null && value !== undefined
					? h("button", { type: "button", className: "dshs-btn", onClick: () => onChange(null) }, t("colorDefault"))
					: h("span", { className: "dshs-set-hint" }, t("colorDefault")),
			);
		}

		function StatsSettingsSection() {
			const [settings, setSettings] = useState(null);
			const [summary, setSummary] = useState(null);
			const [savedTick, setSavedTick] = useState(0);
			const textareaRef = useRef(null);
			const saveTimerRef = useRef(null);

			useEffect(() => {
				let cancelled = false;
				Promise.all([call("settings"), call("summary")])
					.then(([st, sum]) => {
						if (!cancelled) {
							setSettings(st.settings);
							setSummary(sum);
						}
					})
					.catch(() => {});
				return () => { cancelled = true; };
			}, []);

			const scheduleSave = (next) => {
				if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
				saveTimerRef.current = setTimeout(() => {
					saveTimerRef.current = null;
					call("saveSettings", { settings: next })
						.then((result) => {
							setSettings(result.settings);
							setSavedTick((x) => x + 1);
						})
						.catch(() => {});
				}, 800);
			};

			const patch = (updater) => {
				setSettings((prev) => {
					const next = updater(prev);
					scheduleSave(next);
					return next;
				});
			};

			const insertToken = (token) => {
				const el = textareaRef.current;
				const template = settings?.text?.template ?? "";
				if (el !== null && el !== undefined) {
					const start = el.selectionStart ?? template.length;
					const end = el.selectionEnd ?? template.length;
					const next = template.slice(0, start) + token + template.slice(end);
					patch((prev) => ({ ...prev, text: { ...prev.text, template: next } }));
					requestAnimationFrame(() => {
						el.focus();
						el.selectionStart = el.selectionEnd = start + token.length;
					});
				} else {
					patch((prev) => ({ ...prev, text: { ...prev.text, template: template + token } }));
				}
			};

			const insertPlaceholder = (key) => insertToken(`{${key}}`);

			const reset = () => {
				call("saveSettings", { settings: null })
					.then((result) => {
						setSettings(result.settings);
						setSavedTick((x) => x + 1);
					})
					.catch(() => {});
			};

			if (settings === null) {
				return h("div", { style: { padding: "18px 2px", fontSize: 13, color: "var(--dsw-alias-label-tertiary,#6b7280)" } }, t("loading"));
			}
			const s = settings;
			const numberRow = (labelKey, value, onValue, min, max) =>
				h("div", { className: "dshs-set-row" },
					h("div", { className: "dshs-set-label" }, t(labelKey)),
					h("input", {
						type: "number",
						min,
						max,
						className: "dshs-set-input",
						value,
						onChange: (e) => onValue(Number(e.target.value)),
					}),
					h("span", { className: "dshs-set-unit" }, "px"),
				);
			const section = (titleKey, ...children) =>
				h("div", { className: "dshs-set-section" },
					h("div", { className: "dshs-set-section-title" }, t(titleKey)),
					children,
				);

			return h("div", { className: "dshs-set" },
				h("div", { className: "dshs-set-head" },
					h("div", { style: { flex: 1, minWidth: 0 } },
						h("div", { className: "dshs-set-title" }, t("settingsNav")),
						h("div", { className: "dshs-set-intro" }, t("setIntro")),
					),
					h("div", { className: "dshs-set-actions" },
						savedTick > 0 && h("span", { className: "dshs-set-saved" }, t("saved")),
						h("button", { type: "button", className: "dshs-btn", onClick: reset }, t("reset")),
					),
				),

				section("setBase",
					h("div", { className: "dshs-set-row" },
						h("div", { className: "dshs-set-label" }, t("setMode")),
						h("div", { className: "dshs-seg", role: "group" },
							h("button", { type: "button", "data-active": String(s.mode === "text"), onClick: () => patch((p) => ({ ...p, mode: "text" })) }, t("modeText")),
							h("button", { type: "button", "data-active": String(s.mode === "card"), onClick: () => patch((p) => ({ ...p, mode: "card" })) }, t("modeCard")),
						),
					),
					h("div", { className: "dshs-set-row" },
						h("div", { className: "dshs-set-label" }, t("setPosition")),
						h("div", { className: "dshs-seg", role: "group" },
							h("button", { type: "button", "data-active": String(s.position === "above"), onClick: () => patch((p) => ({ ...p, position: "above" })) }, t("posAbove")),
							h("button", { type: "button", "data-active": String(s.position === "below"), onClick: () => patch((p) => ({ ...p, position: "below" })) }, t("posBelow")),
						),
					),
				),

				s.mode === "text"
					? h(React.Fragment, null,
						section("setFormat",
							h("div", { className: "dshs-set-label" }, t("template")),
							h("textarea", {
								ref: textareaRef,
								className: "dshs-set-textarea",
								rows: 3,
								value: s.text.template,
								spellCheck: false,
								onChange: (e) => patch((p) => ({ ...p, text: { ...p.text, template: e.target.value } })),
							}),
							h("div", { className: "dshs-set-hint" }, t("templateHint")),
							h("div", { className: "dshs-set-ph" },
								PLACEHOLDER_KEYS.map((key) => h("button", {
									key,
									type: "button",
									className: "dshs-set-ph-chip",
									title: `{${key}}`,
									onClick: () => insertPlaceholder(key),
								}, t(key))),
							),
						),
						section("setStyle",
							numberRow("fontSize", s.text.fontSize, (v) => patch((p) => ({ ...p, text: { ...p.text, fontSize: v } })), 8, 24),
							h(ColorRow, {
								labelKey: "textColor",
								value: s.text.color,
								onChange: (v) => patch((p) => ({ ...p, text: { ...p.text, color: v } })),
							}),
							h("div", { className: "dshs-set-row" },
								h("div", { className: "dshs-set-label" }, t("weight")),
								h("div", { className: "dshs-seg", role: "group" },
									["normal", "medium", "bold"].map((w) => h("button", {
										key: w,
										type: "button",
										"data-active": String(s.text.weight === w),
										onClick: () => patch((p) => ({ ...p, text: { ...p.text, weight: w } })),
									}, t(`weight${w[0].toUpperCase()}${w.slice(1)}`))),
								),
							),
							h("div", { className: "dshs-set-row" },
								h("div", { className: "dshs-set-label" }, t("align")),
								h("div", { className: "dshs-seg", role: "group" },
									["left", "center", "right"].map((a) => h("button", {
										key: a,
										type: "button",
										"data-active": String(s.text.align === a),
										onClick: () => patch((p) => ({ ...p, text: { ...p.text, align: a } })),
									}, t(`align${a[0].toUpperCase()}${a.slice(1)}`))),
								),
							),
						),
						section("setAppearance",
							h("div", { className: "dshs-set-row" },
								h("div", { className: "dshs-set-label" }, t("bgFill")),
								h("label", { className: "dshs-set-check" },
									h("input", {
										type: "checkbox",
										checked: s.text.background === true,
										onChange: (e) => patch((p) => ({ ...p, text: { ...p.text, background: e.target.checked } })),
									}),
									h("span", {}, t("bgFill")),
								),
							),
							s.text.background === true && h(ColorRow, {
								labelKey: "bgColor",
								value: s.text.bgColor,
								onChange: (v) => patch((p) => ({ ...p, text: { ...p.text, bgColor: v } })),
							}),
							numberRow("radius", s.text.radius, (v) => patch((p) => ({ ...p, text: { ...p.text, radius: v } })), 0, 16),
							numberRow("padding", s.text.padding, (v) => patch((p) => ({ ...p, text: { ...p.text, padding: v } })), 0, 16),
						),
					)
					: h(React.Fragment, null,
						section("setLayout",
							h("div", { className: "dshs-set-row" },
								h("div", { className: "dshs-set-label" }, t("cardSize")),
								h("div", { className: "dshs-seg", role: "group" },
									["small", "medium", "large"].map((size) => h("button", {
										key: size,
										type: "button",
										"data-active": String(s.card.size === size),
										onClick: () => patch((p) => ({ ...p, card: { ...p.card, size } })),
									}, t(`cardSize${size[0].toUpperCase()}${size.slice(1)}`))),
								),
							),
							h("div", { className: "dshs-set-row" },
								h("div", { className: "dshs-set-label" }, t("columns")),
								h("div", { className: "dshs-seg", role: "group" },
									[1, 2, 4].map((n) => h("button", {
										key: n,
										type: "button",
										"data-active": String(s.card.columns === n),
										onClick: () => patch((p) => ({ ...p, card: { ...p.card, columns: n } })),
									}, t(`col${n}`))),
								),
							),
							h("div", { className: "dshs-set-row" },
								h("div", { className: "dshs-set-label" }, t("showItems")),
								h("div", { className: "dshs-set-checks" },
									ALL_CARD_ITEMS.map((key) => h("label", { key, className: "dshs-set-check" },
										h("input", {
											type: "checkbox",
											checked: s.card.items.includes(key),
											onChange: (e) => {
												const items = e.target.checked
													? [...s.card.items, key]
													: s.card.items.filter((k) => k !== key);
												patch((p) => ({ ...p, card: { ...p.card, items: items.length > 0 ? items : ALL_CARD_ITEMS } }));
											},
										}),
										h("span", {}, t(key)),
									)),
								),
							),
						),
						section("setCardText",
							numberRow("titleSize", s.card.titleSize, (v) => patch((p) => ({ ...p, card: { ...p.card, titleSize: v } })), 8, 24),
							numberRow("valueSize", s.card.valueSize, (v) => patch((p) => ({ ...p, card: { ...p.card, valueSize: v } })), 10, 32),
							h(ColorRow, {
								labelKey: "titleColor",
								value: s.card.titleColor,
								onChange: (v) => patch((p) => ({ ...p, card: { ...p.card, titleColor: v } })),
							}),
							h(ColorRow, {
								labelKey: "valueColor",
								value: s.card.valueColor,
								onChange: (v) => patch((p) => ({ ...p, card: { ...p.card, valueColor: v } })),
							}),
						),
						section("setAppearance",
							numberRow("gap", s.card.gap, (v) => patch((p) => ({ ...p, card: { ...p.card, gap: v } })), 0, 24),
							numberRow("radius", s.card.radius, (v) => patch((p) => ({ ...p, card: { ...p.card, radius: v } })), 0, 24),
							numberRow("border", s.card.border, (v) => patch((p) => ({ ...p, card: { ...p.card, border: v } })), 0, 3),
							h(ColorRow, {
								labelKey: "cardBg",
								value: s.card.bg,
								onChange: (v) => patch((p) => ({ ...p, card: { ...p.card, bg: v } })),
							}),
							h(ColorRow, {
								labelKey: "borderColor",
								value: s.card.borderColor,
								onChange: (v) => patch((p) => ({ ...p, card: { ...p.card, borderColor: v } })),
							}),
						),
					),

				section("preview",
					h("div", { className: "dshs-set-preview" },
						s.mode === "card"
							? h(SettingsCard, { cardSettings: s.card, data: summary, error: null, onOpen: () => {} })
							: h(TextLine, { textSettings: s.text, data: summary, error: null, onOpen: () => {} }),
					),
				),
			);
		}

		// ------------------------------------------------------------ apply

		const inject = ["slots"];

		function apply(ctx) {
			// CSS (tag-guarded, same pattern as first-party client plugins)
			if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${CSS_TAG}"]`) === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = "chicheng-stats";
				tag.dataset.pluginCss = CSS_TAG;
				tag.textContent = CSS;
				document.head.appendChild(tag);
			}

			// Settings-page entry: rendered inside the DSH settings shell
			// (Settings → 用量统计), same pattern as chicheng-push.
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "chicheng-stats",
				order: 70,
				label: () => t("settingsNav"),
			}, StatsSettingsSection));

			ctx.effect(() => {
				let disposed = false;
				let root = null;
				let host = null;
				let anchorEl = null;
				let probeTimer = null;
				let pollTimer = null;
				let collapseObserver = null;
				let resizeObserver = null;
				let bodyObserver = null;
				let dialogRoot = null;
				let settings = null;
				let data = null;
				let error = null;
				let collapsed = false;
				let lastPosition = null;

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

				const render = () => {
					if (root === null || host === null) return;
					root.render(h(StatsWidget, { settings, collapsed, data, error, onOpen: openDialog }));
				};

				// Single choke point for the collapsed state: updates the host
				// attribute (rail sizing) and re-renders together.
				const setCollapsed = (next) => {
					if (next === collapsed) return;
					collapsed = next;
					if (host !== null) host.dataset.collapsed = String(next);
					render();
				};

				const mountHost = () => {
					if (host !== null) return;
					const position = lastPosition ?? "below";
					const point = findMountPoint(position);
					if (point === null) return;
					host = document.createElement("div");
					host.setAttribute("data-dsh-stats-host", "");
					host.className = "dshs-host";
					if (point.before) {
						point.root.insertBefore(host, point.anchor);
					} else {
						point.root.insertBefore(host, point.anchor.nextSibling);
					}
					root = ReactDOM.createRoot(host);
					anchorEl = point.anchor;
					collapsed = isCollapsed(point.anchor);
					host.dataset.collapsed = String(collapsed);
					render();
					// The shell flips the rail class on the sidebar ROOT (an
					// ancestor of this subtree), so observers here cannot see
					// it — they are best-effort fast paths only; the 400ms
					// probe below is the authoritative state check.
					const rootEl = host.parentElement;
					if (rootEl !== null && rootEl !== undefined && typeof MutationObserver !== "undefined") {
						collapseObserver = new MutationObserver(() => {
							if (disposed || host === null || anchorEl === null) return;
							setCollapsed(isCollapsed(anchorEl));
						});
						collapseObserver.observe(rootEl, { attributes: true, attributeFilter: ["class"], subtree: true });
					}
					if (rootEl !== null && rootEl !== undefined && typeof ResizeObserver !== "undefined") {
						resizeObserver = new ResizeObserver(() => {
							if (disposed || host === null || anchorEl === null) return;
							setCollapsed(isCollapsed(anchorEl));
						});
						resizeObserver.observe(rootEl);
					}
				};

				// Position changes (above/below) require moving the host node.
				const remount = () => {
					if (host === null) return;
					if (root !== null) {
						root.unmount();
						root = null;
					}
					if (collapseObserver !== null) {
						collapseObserver.disconnect();
						collapseObserver = null;
					}
					if (resizeObserver !== null) {
						resizeObserver.disconnect();
						resizeObserver = null;
					}
					if (host.parentNode !== null) host.parentNode.removeChild(host);
					host = null;
					anchorEl = null;
					mountHost();
				};

				// The settings shell picks nav glyphs from a hardcoded id map and
				// falls back to the settings gear for unknown ids, so patch my
				// section's nav cell to show the same chart icon as the sidebar.
				const patchSettingsNavIcon = () => {
					const label = t("settingsNav");
					const buttons = document.querySelectorAll('[role="dialog"] button');
					const NS = "http://www.w3.org/2000/svg";
					for (const button of buttons) {
						if ((button.textContent ?? "").trim() !== label) continue;
						if (button.querySelector("svg[data-dsh-stats-nav]") !== null) continue;
						const svg = button.querySelector("svg");
						if (svg === null) continue;
						const replacement = document.createElementNS(NS, "svg");
						replacement.setAttribute("data-dsh-stats-nav", "");
						replacement.setAttribute("width", "16");
						replacement.setAttribute("height", "16");
						replacement.setAttribute("viewBox", "0 0 16 16");
						replacement.setAttribute("fill", "none");
						replacement.setAttribute("aria-hidden", "true");
						const cls = svg.getAttribute("class");
						if (cls !== null) replacement.setAttribute("class", cls);
						const path = document.createElementNS(NS, "path");
						path.setAttribute("d", "M1.5 13.5h13v1.5h-13zm1-2h2v-5h-2zm4 0h2v-8h-2zm4 0h2v-3h-2z");
						path.setAttribute("fill", "currentColor");
						replacement.appendChild(path);
						svg.parentNode.replaceChild(replacement, svg);
					}
				};

				const refresh = async () => {
					if (disposed) return;
					try {
						const [st, sum] = await Promise.all([call("settings"), call("summary")]);
						settings = st?.settings ?? settings;
						data = sum;
						error = null;
						const position = settings?.position ?? "below";
						if (position !== lastPosition) {
							lastPosition = position;
							remount();
						}
					} catch (e) {
						error = e.message;
					}
					render();
				};

				const teardown = () => {
					disposed = true;
					closeDialog();
					if (probeTimer !== null) clearInterval(probeTimer);
					probeTimer = null;
					if (pollTimer !== null) clearInterval(pollTimer);
					pollTimer = null;
					if (collapseObserver !== null) {
						collapseObserver.disconnect();
						collapseObserver = null;
					}
					if (resizeObserver !== null) {
						resizeObserver.disconnect();
						resizeObserver = null;
					}
					if (bodyObserver !== null) {
						bodyObserver.disconnect();
						bodyObserver = null;
					}
					if (root !== null) {
						root.unmount();
						root = null;
					}
					if (host !== null && host.parentNode !== null) host.parentNode.removeChild(host);
					host = null;
					anchorEl = null;
				};

				// Patch the settings-nav icon the moment the shell commits the
				// panel — MutationObserver callbacks run before paint, so the
				// chart icon is what the first frame shows (no gear flash).
				if (typeof MutationObserver !== "undefined") {
					bodyObserver = new MutationObserver(() => {
						if (disposed) return;
						if (document.querySelector('[role="dialog"]') !== null) patchSettingsNavIcon();
					});
					bodyObserver.observe(document.body, { childList: true, subtree: true });
				}
				patchSettingsNavIcon();

				probeTimer = setInterval(() => {
					if (disposed) return;
					if (host === null) {
						mountHost();
						return;
					}
					// Authoritative collapse check: the shell's rail class flips
					// on the sidebar ROOT, outside any subtree we observe, so
					// re-measure on every tick — settles within 400ms of any
					// expand/collapse, whatever the observers missed.
					if (anchorEl !== null) setCollapsed(isCollapsed(anchorEl));
					// Safety net for the settings-nav icon (observer is the fast path).
					patchSettingsNavIcon();
				}, 400);
				pollTimer = setInterval(() => void refresh(), 5000);
				const onVisible = () => {
					if (document.visibilityState === "visible") void refresh();
				};
				document.addEventListener("visibilitychange", onVisible);
				void refresh();

				return () => {
					document.removeEventListener("visibilitychange", onVisible);
					teardown();
				};
			}, "chicheng-stats: sidebar mount");
		}

		return { apply, inject };
	}
});
