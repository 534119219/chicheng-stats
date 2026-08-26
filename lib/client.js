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
				provider: "提供方",
				timeRange: "时间范围",
				rangeToday: "今日",
				range7d: "近7天",
				range30d: "近30天",
				rangeMonth: "本月",
				rangeAll: "全部",
				overview: "概览",
				modelDist: "模型分布",
				providerDist: "提供方分布",
				trend: "Token 使用趋势",
				details: "用量明细",
				requests: "请求",
				tokens: "Token",
				colTime: "时间",
				colModel: "模型",
				colSession: "会话",
				conversation: "对话",
				sessionUsage: "对话用量",
				untitledConversation: "未命名对话",
				colInput: "输入",
				cacheHit: "缓存命中",
				cacheRead: "缓存读",
				cacheWrite: "缓存写",
				colOutput: "输出",
				colTtft: "首字节",
				colDuration: "总耗时",
				avgDuration: "平均耗时",
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
				dsTitle: "DeepSeek 平台",
				dsBalance: "剩余金额",
				dsTodayCost: "今日消费",
				dsTodayTokens: "今日 Token",
				dsTodayRequests: "今日请求",
				dsOfficial: "官方",
				dsEstimate: "估算",
				dsLocal: "本地",
				dsUnconfigured: "未配置 DeepSeek API Key",
				dsUnconfiguredHint: "请在 设置 → 模型 或 ~/.dsh/.credentials.yaml 配置 DEEPSEEK_API_KEY",
				dsPlatformTokenHint: "配置 DEEPSEEK_PLATFORM_TOKEN 后可显示官方今日消费与 Token",
				dsUpdated: "更新",
				dsBalanceBreakdown: "赠送 / 充值",
				dsTokenSection: "DeepSeek 平台 UserToken（可选）",
				dsTokenIntro: "配置后悬停提示中的今日消费 / Token 使用官方数据；未配置则为估算 / 本地统计。",
				dsTokenLabel: "UserToken",
				dsTokenPlaceholder: "粘贴 platform.deepseek.com 的 userToken",
				dsTokenAuto: "自动获取",
				dsTokenSave: "保存 Token",
				dsTokenSaved: "已保存",
				dsTokenFetched: "已自动获取并保存",
				dsTokenNotFound: "未在浏览器中找到，请先登录 platform.deepseek.com 后重试，或手动粘贴",
				dsTokenConfigured: "已配置",
				dsTokenUnconfigured: "未配置",
				dsRefresh: "立即刷新",
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
				provider: "Provider",
				timeRange: "Time Range",
				rangeToday: "Today",
				range7d: "7 days",
				range30d: "30 days",
				rangeMonth: "Month",
				rangeAll: "All",
				overview: "Overview",
				modelDist: "By model",
				providerDist: "By provider",
				trend: "Token trend",
				details: "Usage details",
				requests: "req",
				tokens: "tok",
				colTime: "Time",
				colModel: "Model",
				colSession: "Session",
				conversation: "Conversation",
				sessionUsage: "Conversation usage",
				untitledConversation: "Untitled",
				colInput: "Input",
				cacheHit: "Cache hit",
				cacheRead: "Cache read",
				cacheWrite: "Cache write",
				colOutput: "Output",
				colTtft: "TTFT",
				colDuration: "Duration",
				avgDuration: "Avg duration",
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
				dsTitle: "DeepSeek Platform",
				dsBalance: "Balance",
				dsTodayCost: "Cost today",
				dsTodayTokens: "Tokens today",
				dsTodayRequests: "Requests today",
				dsOfficial: "official",
				dsEstimate: "estimate",
				dsLocal: "local",
				dsUnconfigured: "DeepSeek API key not configured",
				dsUnconfiguredHint: "Configure DEEPSEEK_API_KEY in Settings → Models or ~/.dsh/.credentials.yaml",
				dsPlatformTokenHint: "Set DEEPSEEK_PLATFORM_TOKEN for official today cost & tokens",
				dsUpdated: "Updated",
				dsBalanceBreakdown: "Granted / Topped up",
				dsTokenSection: "DeepSeek Platform UserToken (optional)",
				dsTokenIntro: "When set, today's cost/tokens in the hover tooltip use official data; otherwise estimate/local.",
				dsTokenLabel: "UserToken",
				dsTokenPlaceholder: "Paste userToken from platform.deepseek.com",
				dsTokenAuto: "Auto fetch",
				dsTokenSave: "Save token",
				dsTokenSaved: "Saved",
				dsTokenFetched: "Fetched and saved",
				dsTokenNotFound: "Not found in browser. Log in to platform.deepseek.com and retry, or paste manually.",
				dsTokenConfigured: "Configured",
				dsTokenUnconfigured: "Not configured",
				dsRefresh: "Refresh",
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

		function formatMoney(n, currency) {
			if (!Number.isFinite(n)) return "—";
			const symbol = currency === "USD" ? "$" : currency === "CNY" ? "¥" : "";
			const value = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
			return `${symbol}${value}`;
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

		function formatDuration(ms) {
			if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
			if (ms < 1000) return `${Math.round(ms)}ms`;
			const s = ms / 1000;
			if (s < 60) return `${s.toFixed(1)}s`;
			const m = Math.floor(s / 60);
			const rest = Math.round(s % 60);
			return `${m}m${rest}s`;
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
/* Theme tokens follow the dsh theme with light-safe fallbacks.
   The desktop shell sets body[data-ds-dark-theme] from the OS dark appearance
   even while the dsh UI theme is light, which rendered an unreadable dark
   panel inside the light UI — the dedicated dark override is removed and all
   var() fallbacks are now light-safe. */
body{
  --dshs-surface-1:var(--dsw-alias-bg-layer-1,#ffffff);
  --dshs-surface-2:var(--dsw-alias-bg-layer-2,#f4f5f7);
  --dshs-surface-input:var(--dsw-alias-bg-layer-1,#ffffff);
  --dshs-card-bg:var(--dsw-alias-bg-layer-3,#eef0f4);
  --dshs-accent:var(--dsw-alias-button-primary-fill,#3964fe);
  --dshs-accent-foreground:var(--dsw-alias-label-primary-foreground,#ffffff);
  --dshs-focus:var(--dsw-alias-button-primary-fill,#3964fe);
  --dshs-error:var(--dsw-alias-state-error-primary,#d93026);
  --dshs-success:var(--dsw-alias-state-success-primary,#1a9e57);
  --dshs-mask:var(--dsw-alias-bg-mask-1,rgba(15,20,30,.35))
}
.dshs-host{box-sizing:border-box;width:calc(100% - 4px);margin:0 2px 8px}
.dshs-host[data-collapsed="true"]{width:36px;height:36px;align-self:flex-start;margin:0 0 8px;
  display:flex;align-items:center;justify-content:center}
.dshs-host[data-collapsed="true"] .dshs-rail{margin:0}
.dshs-line{box-sizing:border-box;width:100%;display:block;text-align:left;padding:4px 8px;margin:0;
  border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#667085);
  line-height:1.5;cursor:pointer;white-space:pre-line;overflow-wrap:anywhere}
.dshs-line:hover{background:var(--dsw-alias-interactive-bg-hover,#eceff4);color:var(--dsw-alias-label-primary,#f4f5f7)}
.dshs-setcard{box-sizing:border-box;width:100%;margin:0;display:block;text-align:left;
  border:1px solid var(--dsw-alias-border-l2,#d7dbe3);background:var(--dshs-card-bg);
  color:var(--dsw-alias-label-primary,#f4f5f7);cursor:pointer}
.dshs-setcard:hover{background:var(--dsw-alias-interactive-bg-hover,#e6e9f0)}
.dshs-setcard-grid{display:grid;grid-template-columns:1fr 1fr}
.dshs-setcard-item{min-width:0}
.dshs-setcard-label{color:var(--dsw-alias-label-secondary,#667085);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshs-setcard-value{font-weight:600;font-variant-numeric:tabular-nums;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshs-rail{box-sizing:border-box;width:36px;height:36px;display:flex;align-items:center;justify-content:center;
  margin:0;border:1px solid transparent;border-radius:10px;color:var(--dsw-alias-label-secondary,#667085);
  background:transparent;cursor:pointer}
.dshs-rail:hover{background:var(--dsw-alias-interactive-bg-hover,#eceff4)}
.dshs-mask{position:fixed;inset:0;z-index:2147482000;background:var(--dshs-mask,rgba(15,20,30,.35));backdrop-filter:blur(2px);
  display:flex;align-items:center;justify-content:center;padding:24px}
.dshs-panel{box-sizing:border-box;width:min(880px,96vw);height:min(700px,92vh);display:flex;flex-direction:column;
  background:var(--dsw-alias-bg-base,#ffffff);color:var(--dsw-alias-label-primary,#f4f5f7);
  border:1px solid var(--dsw-alias-border-l2,#d7dbe3);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.45);
  overflow:hidden;font-size:14px}
.dshs-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;flex:none;
  border-bottom:1px solid var(--dsw-alias-border-l1,#d7dbe3)}
.dshs-head h2{margin:0;font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px;white-space:nowrap}
.dshs-seg{display:flex;gap:4px;padding:3px;border:1px solid var(--dsw-alias-border-l2,#d7dbe3);border-radius:10px;
  background:var(--dshs-surface-2,#f4f5f7)}
.dshs-seg button{border:none;background:transparent;color:var(--dsw-alias-label-secondary,#667085);font-size:12px;
  padding:3px 10px;border-radius:7px;cursor:pointer;white-space:nowrap}
.dshs-seg button:hover{color:var(--dsw-alias-label-primary,#f4f5f7)}
.dshs-seg button[data-active="true"]{background:var(--dshs-accent,#3964fe);color:var(--dshs-accent-foreground,#ffffff)}
.dshs-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2,#d7dbe3);
  background:var(--dsw-alias-button-elevated-fill,#f4f5f7);color:var(--dsw-alias-label-primary,#f4f5f7);font-size:12px;cursor:pointer}
.dshs-btn:hover{background:var(--dsw-alias-button-floating-hover,#e6e9f0)}
.dshs-body{flex:1;min-height:0;overflow:auto;padding:14px 16px 18px;display:flex;flex-direction:column;gap:18px}
.dshs-section h3{margin:0 0 8px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#f4f5f7)}
.dshs-chips{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.dshs-chip{box-sizing:border-box;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1,#d7dbe3);border-radius:10px;
  background:var(--dshs-surface-2,#f4f5f7);min-width:0}
.dshs-chip .dshs-chip-label{font-size:11px;color:var(--dsw-alias-label-secondary,#667085);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshs-chip .dshs-chip-value{font-size:16px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshs-models{display:flex;flex-direction:column;gap:8px}
.dshs-model-meta{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:3px}
.dshs-model-name{font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshs-model-nums{font-size:11px;color:var(--dsw-alias-label-secondary,#667085);white-space:nowrap;flex:none}
.dshs-model-bar{height:6px;border-radius:99px;background:var(--dshs-surface-2,#f4f5f7);overflow:hidden}
.dshs-model-bar-fill{height:100%;border-radius:99px;background:var(--dshs-accent,#3964fe)}
.dshs-chart{border:1px solid var(--dsw-alias-border-l1,#d7dbe3);border-radius:10px;background:var(--dshs-surface-2,#f4f5f7);padding:8px}
.dshs-table-wrap{max-height:280px;overflow:auto;border:1px solid var(--dsw-alias-border-l1,#d7dbe3);border-radius:10px}
.dshs-table{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}
.dshs-table th{position:sticky;top:0;background:var(--dshs-surface-2,#f4f5f7);color:var(--dsw-alias-label-secondary,#667085);
  font-weight:500;text-align:left;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,#d7dbe3);white-space:nowrap;z-index:1}
.dshs-table td{padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,#d7dbe3);white-space:nowrap;color:var(--dsw-alias-label-primary,#f4f5f7)}
.dshs-table tr:last-child td{border-bottom:none}
.dshs-table tr:hover td{background:var(--dsw-alias-interactive-bg-hover,#eef0f4)}
.dshs-td-model{max-width:220px;overflow:hidden;text-overflow:ellipsis}
.dshs-td-total{font-weight:600}
.dshs-empty{color:var(--dsw-alias-label-secondary,#667085);font-size:12px;padding:18px;text-align:center}
.dshs-filtrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dshs-filtlabel{font-size:12px;color:var(--dsw-alias-label-secondary,#667085);flex:none;width:72px;white-space:nowrap}
.dshs-filtrow .dshs-seg{flex-wrap:wrap}
.dshs-error{color:var(--dshs-error,#d93026);font-size:12px;padding:12px;text-align:center}
/* hover tooltip for DeepSeek platform data */
.dshs-tip{position:fixed;z-index:2147482100;width:240px;box-sizing:border-box;padding:10px 12px;
  border:1px solid var(--dsw-alias-border-l2,#d7dbe3);border-radius:12px;background:var(--dshs-surface-2,#f4f5f7);
  color:var(--dsw-alias-label-primary,#f4f5f7);font-size:12px;line-height:1.5;box-shadow:0 12px 32px rgba(0,0,0,.45);
  pointer-events:auto}
.dshs-tip-title{font-weight:600;font-size:12px;margin-bottom:6px;color:var(--dsw-alias-label-primary,#f4f5f7)}
.dshs-tip-row{display:flex;justify-content:space-between;gap:10px;margin-top:3px;align-items:baseline}
.dshs-tip-label{color:var(--dsw-alias-label-secondary,#667085);flex:none;white-space:nowrap}
.dshs-tip-value{font-weight:600;font-variant-numeric:tabular-nums;text-align:right}
.dshs-tip-tag{font-size:10px;font-weight:400;color:var(--dsw-alias-label-tertiary,#6b7280);margin-left:4px}
.dshs-tip-hint{font-size:11px;color:var(--dsw-alias-label-tertiary,#6b7280);margin-top:6px;line-height:1.45}
.dshs-tip-error{color:var(--dshs-error,#d93026)}
.dshs-tip-footer{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px}
.dshs-tip-updated{font-size:10px;color:var(--dsw-alias-label-tertiary,#6b7280);white-space:nowrap}
.dshs-tip-refresh{border:1px solid var(--dsw-alias-border-l2,#d7dbe3);background:var(--dsw-alias-button-elevated-fill,#f4f5f7);
  color:var(--dsw-alias-label-primary,#f4f5f7);font-size:11px;padding:2px 8px;border-radius:7px;cursor:pointer}
.dshs-tip-refresh:hover{background:var(--dsw-alias-button-floating-hover,#e6e9f0)}
.dshs-tip-refresh:disabled{opacity:.5;cursor:default}
/* settings page */
.dshs-set{display:flex;flex-direction:column;gap:16px;max-width:720px}
.dshs-set-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dshs-set-title{font-size:15px;font-weight:600}
.dshs-set-intro{font-size:12px;color:var(--dsw-alias-label-secondary,#667085);margin-top:3px}
.dshs-set-actions{display:flex;align-items:center;gap:10px;flex:none}
.dshs-set-saved{font-size:12px;color:var(--dshs-success,#1a9e57)}
.dshs-set-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.dshs-set-label{font-size:12px;color:var(--dsw-alias-label-secondary,#667085);width:96px;flex:none}
.dshs-set-block{display:flex;flex-direction:column;gap:8px}
.dshs-set-hint{font-size:11px;color:var(--dsw-alias-label-tertiary,#6b7280)}
.dshs-set-textarea{box-sizing:border-box;width:100%;padding:8px 10px;font-size:13px;color:inherit;
  background:var(--dshs-surface-input,#ffffff);border:1px solid var(--dsw-alias-border-l2,#d7dbe3);border-radius:9px;outline:none;font-family:inherit;resize:vertical}
.dshs-set-textarea:focus{border-color:var(--dshs-focus,#639efe)}
.dshs-set-ph{display:flex;gap:6px;flex-wrap:wrap}
.dshs-set-ph-chip{border:1px solid var(--dsw-alias-border-l2,#d7dbe3);background:var(--dshs-surface-2,#f4f5f7);
  color:var(--dsw-alias-label-secondary,#667085);font-size:11px;padding:3px 9px;border-radius:99px;cursor:pointer}
.dshs-set-ph-chip:hover{border-color:var(--dshs-focus,#639efe);color:var(--dsw-alias-label-primary,#f4f5f7)}
.dshs-set-input{box-sizing:border-box;width:80px;padding:5px 8px;font-size:13px;color:inherit;
  background:var(--dshs-surface-input,#ffffff);border:1px solid var(--dsw-alias-border-l2,#d7dbe3);border-radius:8px;outline:none;font-family:inherit}
.dshs-set-input:focus{border-color:var(--dshs-focus,#639efe)}
.dshs-set-color{box-sizing:border-box;width:38px;height:28px;padding:2px;border:1px solid var(--dsw-alias-border-l2,#d7dbe3);
  border-radius:8px;background:var(--dshs-surface-input,#ffffff);cursor:pointer}
.dshs-set-checks{display:flex;gap:12px;flex-wrap:wrap}
.dshs-set-check{display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;font-size:12px;color:var(--dsw-alias-label-secondary,#667085)}
.dshs-set-check input{accent-color:var(--dshs-focus,#639efe)}
.dshs-set-unit{font-size:12px;color:var(--dsw-alias-label-tertiary,#6b7280)}
.dshs-set-preview{border:1px dashed var(--dsw-alias-border-l2,#d7dbe3);border-radius:10px;padding:10px;background:var(--dshs-surface-2,#f4f5f7)}
.dshs-set-section{border:1px solid var(--dsw-alias-border-l2);border-radius:16px;
  background:var(--dsw-alias-bg-layer-3);padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.dshs-set-section-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#f4f5f7)}
@media (max-width: 720px){
  .dshs-mask{padding:0;align-items:stretch}
  .dshs-panel{width:100vw;width:100dvw;height:100vh;height:100dvh;max-height:none;border-radius:0;border-left:none;border-right:none;border-bottom:none}
  .dshs-head{min-height:52px;padding:calc(10px + env(safe-area-inset-top)) 12px 8px;flex-wrap:wrap}
  .dshs-head h2{font-size:15px}
  .dshs-seg button{flex:none;padding:3px 8px}
  .dshs-chips{grid-template-columns:repeat(2,1fr)}
  .dshs-body{padding:12px 12px calc(16px + env(safe-area-inset-bottom))}
  .dshs-table{font-size:11px;min-width:620px}
  .dshs-table-wrap{max-height:none}
  .dshs-td-model{max-width:120px}
  .dshs-set-label{width:auto;min-width:72px}
}
/* Dialog-only dashboard polish: clean white-card style, single blue accent.
   Scoped to .dshs-panel so sidebar widget, hover tooltip and settings stay unchanged. */
.dshs-panel{
  --dshs-accent:#3b82f6;
  --dshs-accent-foreground:#ffffff;
  width:min(1120px,96vw);
  height:min(880px,94vh);
  background:var(--dshs-surface-1);
  border:1px solid var(--dsw-alias-border-l2,#d7dbe3);
  border-radius:16px;
  box-shadow:0 24px 64px rgba(0,0,0,.45)
}
.dshs-panel .dshs-duo{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:14px;
  align-items:stretch
}
.dshs-head{
  background:var(--dshs-surface-1);
  border-bottom:1px solid var(--dsw-alias-border-l1,#d7dbe3)
}
.dshs-head h2{color:var(--dsw-alias-label-primary,#1f2430)}
.dshs-panel .dshs-seg{
  border:1px solid var(--dsw-alias-border-l2,#d7dbe3);
  background:var(--dshs-surface-2);
  box-shadow:0 1px 2px rgba(0,0,0,.03)
}
.dshs-panel .dshs-seg button[data-active="true"]{
  background:var(--dshs-accent);
  color:var(--dshs-accent-foreground);
  box-shadow:0 1px 3px rgba(57,100,254,.25)
}
.dshs-panel .dshs-btn{
  border:1px solid var(--dsw-alias-border-l2,#d7dbe3);
  background:var(--dsw-alias-button-elevated-fill,#f4f5f7);
  color:var(--dsw-alias-label-primary,#1f2430)
}
.dshs-panel .dshs-section{
  border:1px solid var(--dsw-alias-border-l1,#d7dbe3);
  border-radius:14px;
  background:var(--dshs-surface-2);
  padding:12px 14px;
  box-shadow:0 2px 8px rgba(0,0,0,.04)
}
.dshs-panel .dshs-section h3{
  color:var(--dsw-alias-label-primary,#1f2430);
  display:flex;align-items:center;gap:6px
}
.dshs-panel .dshs-section h3::before{
  content:"";width:8px;height:8px;border-radius:50%;background:var(--dshs-accent);flex:none
}
.dshs-panel .dshs-chips{gap:10px;grid-template-columns:repeat(4,1fr)}
.dshs-panel .dshs-chip{
  position:relative;
  border:1px solid var(--dsw-alias-border-l1,#d7dbe3);
  border-radius:12px;
  background:var(--dshs-surface-2);
  padding:12px 14px 12px 16px;
  box-shadow:0 2px 6px rgba(0,0,0,.04)
}
.dshs-panel .dshs-chip::before{
  content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;
  border-radius:3px;background:var(--dshs-accent)
}
.dshs-panel .dshs-chip-label{color:var(--dsw-alias-label-secondary,#667085)}
.dshs-panel .dshs-chip-value{color:var(--dsw-alias-label-primary,#1f2430)}
.dshs-panel .dshs-model-bar{height:8px;border-radius:99px}
.dshs-panel .dshs-model-bar-fill{
  background:linear-gradient(90deg,var(--dshs-accent),color-mix(in srgb,var(--dshs-accent) 70%,#ffffff));
  border-radius:99px
}
.dshs-panel .dshs-models{max-height:200px;overflow-y:auto;padding-right:4px}
.dshs-panel .dshs-chart{
  border:1px solid var(--dsw-alias-border-l1,#d7dbe3);
  border-radius:12px;
  background:var(--dshs-surface-2);
  padding:12px
}
.dshs-panel .dshs-table-wrap{border-radius:12px;overflow:auto}
.dshs-panel .dshs-table th{
  background:color-mix(in srgb,var(--dshs-accent) 6%,var(--dshs-surface-2));
  color:var(--dsw-alias-label-secondary,#667085);
  border-bottom-color:var(--dsw-alias-border-l1,#d7dbe3)
}
.dshs-panel .dshs-table tr:hover td{
  background:color-mix(in srgb,var(--dshs-accent) 5%,var(--dsw-alias-interactive-bg-hover,#eef0f4))
}
.dshs-panel .dshs-filtlabel{color:var(--dsw-alias-label-secondary,#667085)}
.dshs-panel .dshs-td-total{color:var(--dshs-accent);font-weight:600}
.dshs-panel .dshs-empty{color:var(--dsw-alias-label-secondary,#667085)}
.dshs-panel .dshs-donut{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.dshs-panel .dshs-donut-legend{display:flex;flex-direction:column;gap:6px;min-width:180px;flex:1;max-height:220px;overflow-y:auto;padding-right:4px}
.dshs-panel .dshs-donut-item{display:flex;align-items:center;gap:8px;font-size:12px}
.dshs-panel .dshs-donut-dot{width:8px;height:8px;border-radius:50%;flex:none}
.dshs-panel .dshs-donut-name{color:var(--dsw-alias-label-primary,#1f2430);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}
.dshs-panel .dshs-donut-value{color:var(--dsw-alias-label-secondary,#667085);white-space:nowrap;font-variant-numeric:tabular-nums}
@media (max-width:720px){
  .dshs-panel .dshs-chips{grid-template-columns:repeat(2,1fr)}
  .dshs-panel .dshs-duo{grid-template-columns:1fr}
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

		function TextLine({ textSettings, data, error, onOpen, onMouseEnter, onMouseLeave }) {
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
				style.background = ts.bgColor ?? "var(--dshs-surface-2,#f4f5f7)";
				style.border = "1px solid var(--dsw-alias-border-l2,#d7dbe3)";
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
				onMouseEnter,
				onMouseLeave,
			}, line);
		}

		const ALL_CARD_ITEMS = ["todayRequests", "todayTokens", "totalRequests", "totalTokens"];
		/** Fixed display order for 4-column cards: 今日请求、总请求、今日Token、总Token. */
		const FOUR_COL_ORDER = ["todayRequests", "totalRequests", "todayTokens", "totalTokens"];

		function SettingsCard({ cardSettings, data, error, onOpen, onMouseEnter, onMouseLeave }) {
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
				onMouseEnter,
				onMouseLeave,
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

		function tipStyle(position) {
			const vw = typeof window !== "undefined" ? window.innerWidth : 800;
			const width = Math.max(120, Math.min(position?.width ?? 240, vw - 16));
			const left = Math.max(8, Math.min(vw - width - 8, position.left - width / 2));
			const above = position.top > 190;
			return {
				left: `${left}px`,
				top: `${position.top}px`,
				width: `${width}px`,
				transform: above ? "translateY(calc(-100% - 8px))" : "translateY(8px)",
			};
		}

		function DeepseekTooltip({ data, loading, error, position, onMouseEnter, onMouseLeave, onRefresh }) {
			const style = tipStyle(position);
			const rootProps = { className: "dshs-tip", style, onMouseEnter, onMouseLeave };
			const footer = h("div", { className: "dshs-tip-footer" },
				h("span", { className: "dshs-tip-updated" },
					data?.updatedAt != null ? `${t("dsUpdated")}: ${new Date(data.updatedAt).toLocaleTimeString()}` : ""),
				h("button", {
					type: "button",
					className: "dshs-tip-refresh",
					disabled: loading,
					onClick: onRefresh,
				}, t("dsRefresh")),
			);
			if (loading) return h("div", rootProps, t("loading"), footer);
			if (error !== null && error !== undefined) {
				return h("div", { ...rootProps, className: "dshs-tip dshs-tip-error" }, `${t("dsTitle")} · ${error}`, footer);
			}
			if (data === null || data === undefined) return null;
			if (!data.configured) {
				return h("div", rootProps,
					h("div", { className: "dshs-tip-title" }, t("dsTitle")),
					h("div", { className: "dshs-tip-row" },
						h("span", { className: "dshs-tip-label" }, t("dsTodayCost")),
						h("span", { className: "dshs-tip-value" }, "—"),
					),
					h("div", { className: "dshs-tip-hint" }, t("dsUnconfigured")),
					h("div", { className: "dshs-tip-hint" }, t("dsUnconfiguredHint")),
					footer,
				);
			}
			const currency = data.balance?.currency ?? "CNY";
			const cost = data.todayCost;
			const costText = Number.isFinite(cost)
				? `${data.todayCostSource === "estimate" ? "≈" : ""}${formatMoney(cost, currency)}`
				: "—";
			const officialTokens = data.todayTokens;
			const tokenText = Number.isFinite(officialTokens)
				? formatTokens(officialTokens)
				: formatTokens(data.localTodayTokens);
			const tokenTag = Number.isFinite(officialTokens) ? t("dsOfficial") : t("dsLocal");
			const officialRequests = data.todayRequests;
			const reqText = Number.isFinite(officialRequests)
				? formatRequests(officialRequests)
				: formatRequests(data.localTodayRequests);
			const breakdown = data.todayBreakdown;
			return h("div", rootProps,
				h("div", { className: "dshs-tip-title" }, t("dsTitle")),
				h("div", { className: "dshs-tip-row" },
					h("span", { className: "dshs-tip-label" }, t("dsBalance")),
					h("span", { className: "dshs-tip-value" }, formatMoney(data.balance?.total, currency)),
				),
				h("div", { className: "dshs-tip-row" },
					h("span", { className: "dshs-tip-label" }, t("dsTodayCost")),
					h("span", { className: "dshs-tip-value" }, costText,
						Number.isFinite(cost) && data.todayCostSource !== null
							? h("span", { className: "dshs-tip-tag" },
								data.todayCostSource === "official" ? t("dsOfficial") : t("dsEstimate"))
							: null),
				),
				h("div", { className: "dshs-tip-row" },
					h("span", { className: "dshs-tip-label" }, t("dsTodayTokens")),
					h("span", { className: "dshs-tip-value" }, tokenText, h("span", { className: "dshs-tip-tag" }, tokenTag)),
				),
				h("div", { className: "dshs-tip-row" },
					h("span", { className: "dshs-tip-label" }, t("dsTodayRequests")),
					h("span", { className: "dshs-tip-value" }, reqText),
				),
				breakdown !== null && breakdown !== undefined
					? h("div", { className: "dshs-tip-hint" },
						`缓存命中 ${formatTokens(breakdown.cacheHit ?? 0)} / 输入 ${formatTokens(breakdown.cacheMiss ?? 0)} / 输出 ${formatTokens(breakdown.output ?? 0)}`)
					: null,
				data.configured === true && data.platformTokenConfigured === false
					? h("div", { className: "dshs-tip-hint" }, t("dsPlatformTokenHint"))
					: null,
				footer,
			);
		}

		function StatsWidget({ settings, collapsed, data, error, onOpen, deepseek, deepseekLoading, deepseekError, onFetchDeepseek }) {
			const [tip, setTip] = useState(null);
			const hideTimerRef = useRef(null);

			useEffect(() => {
				if (!data?.deepseekInUse) setTip(null);
			}, [data?.deepseekInUse]);

			const cancelHide = () => {
				if (hideTimerRef.current !== null) {
					clearTimeout(hideTimerRef.current);
					hideTimerRef.current = null;
				}
			};

			const showTip = (event) => {
				if (!data?.deepseekInUse) return;
				cancelHide();
				if (typeof onFetchDeepseek === "function") onFetchDeepseek();
				const rect = event.currentTarget.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0) {
					setTip({ left: rect.left + rect.width / 2, top: rect.top, width: rect.width });
				}
			};

			const hideTip = () => {
				cancelHide();
				hideTimerRef.current = setTimeout(() => {
					hideTimerRef.current = null;
					setTip(null);
				}, 200);
			};

			const handleTipEnter = () => cancelHide();
			const refreshNow = () => {
				if (typeof onFetchDeepseek === "function") onFetchDeepseek(true);
			};

			const child = collapsed
				? h("button", {
					type: "button",
					className: "dshs-rail",
					"aria-label": t("cardLabel"),
					title: t("cardLabel"),
					onClick: onOpen,
					onMouseEnter: showTip,
					onMouseLeave: hideTip,
				}, iconChart(16))
				: (settings?.mode ?? "text") === "card"
					? h(SettingsCard, { cardSettings: settings?.card, data, error, onOpen, onMouseEnter: showTip, onMouseLeave: hideTip })
					: h(TextLine, { textSettings: settings?.text, data, error, onOpen, onMouseEnter: showTip, onMouseLeave: hideTip });
			return h(React.Fragment, null,
				child,
				tip !== null && h(DeepseekTooltip, {
					data: deepseek,
					loading: deepseekLoading,
					error: deepseekError,
					position: tip,
					onMouseEnter: handleTipEnter,
					onMouseLeave: hideTip,
					onRefresh: refreshNow,
				}),
			);
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
				{ label: t("colOutput"), value: formatTokens(totals?.output) },
				{ label: t("cacheRead"), value: formatTokens(totals?.cacheRead) },
				{ label: t("cacheWrite"), value: formatTokens(totals?.cacheWrite) },
				{ label: t("cacheHit"), value: hitRate },
				{ label: t("avgDuration"), value: formatDuration(totals?.avgDuration) },
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
			const H = 170;
			const padT = 20;
			const padB = 24;
			const plotH = H - padT - padB;
			const max = Math.max(...trend.map((b) => b.tokens), 1);
			const slot = (W - 8) / n;
			const pts = trend.map((b, i) => {
				const x = 4 + i * slot + slot / 2;
				const y = padT + plotH - (b.tokens / max) * plotH;
				return { x, y, b, i };
			});
			const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
			const base = padT + plotH;
			const areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${base} L ${pts[0].x.toFixed(1)} ${base} Z`;
			const step = Math.max(1, Math.ceil(n / 12));
			const labels = trend.map((b, i) =>
				i % step === 0
					? h("text", {
						key: `l-${b.key}`,
						x: 4 + i * slot + slot / 2,
						y: H - 6,
						fontSize: 9,
						fill: "var(--dsw-alias-label-secondary,#667085)",
						textAnchor: "middle",
					}, b.key)
					: null);
			return h("div", { className: "dshs-chart" },
				h("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": t("trend") },
					h("defs", null,
						h("linearGradient", { id: "dshs-trend-area", x1: "0", y1: "0", x2: "0", y2: "1" },
							h("stop", { offset: "0%", stopColor: "var(--dshs-accent,#3b82f6)", stopOpacity: 0.35 }),
							h("stop", { offset: "100%", stopColor: "var(--dshs-accent,#3b82f6)", stopOpacity: 0.02 }),
						),
						h("linearGradient", { id: "dshs-trend-line", x1: "0", y1: "0", x2: "1", y2: "0" },
							h("stop", { offset: "0%", stopColor: "var(--dshs-accent,#3b82f6)" }),
							h("stop", { offset: "100%", stopColor: "#7aa4ff" }),
						),
					),
					h("text", { x: 4, y: 12, fontSize: 10, fill: "var(--dsw-alias-label-tertiary,#6b7280)" }, `max ${formatTokens(max)}`),
					h("path", { d: areaPath, fill: "url(#dshs-trend-area)" }),
					h("path", { d: linePath, fill: "none", stroke: "url(#dshs-trend-line)", strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" }),
					pts.map((p) => h("circle", {
						key: `c-${p.b.key}-${p.i}`,
						cx: p.x,
						cy: p.y,
						r: 2.5,
						fill: "var(--dshs-accent,#3b82f6)",
					}, h("title", {}, `${p.b.key} · ${p.b.requests} ${t("requests")} · ${formatTokens(p.b.tokens)} ${t("tokens")}`))),
					labels,
				),
			);
		}

		function DonutChart({ items }) {
			const total = items.reduce((sum, item) => sum + Math.max(0, item.value || 0), 0);
			if (total <= 0) return h("div", { className: "dshs-empty" }, t("noData"));
			const colors = ["#3b82f6", "#60a5fa", "#93c5fd", "#1d4ed8", "#bfdbfe", "#2563eb"];
			const R = 54;
			const C = 2 * Math.PI * R;
			let offset = 0;
			const segments = items.map((item, i) => {
				const frac = Math.max(0, item.value || 0) / total;
				const dash = `${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}`;
				const seg = h("circle", {
					key: item.name,
					cx: 80,
					cy: 80,
					r: R,
					fill: "none",
					stroke: colors[i % colors.length],
					strokeWidth: 18,
					strokeDasharray: dash,
					strokeDashoffset: -offset,
					transform: "rotate(-90 80 80)",
				}, h("title", {}, `${item.name} · ${formatTokens(item.value)} (${(frac * 100).toFixed(1)}%)`));
				offset += frac * C;
				return seg;
			});
			return h("div", { className: "dshs-donut" },
				h("svg", { viewBox: "0 0 160 160", width: 160, height: 160, role: "img", "aria-label": t("providerDist") }, segments),
				h("div", { className: "dshs-donut-legend" },
					items.map((item, i) => h("div", { key: item.name, className: "dshs-donut-item" },
						h("span", { className: "dshs-donut-dot", style: { background: colors[i % colors.length] } }),
						h("span", { className: "dshs-donut-name" }, item.name),
						h("span", { className: "dshs-donut-value" }, `${formatTokens(item.value)} (${((Math.max(0, item.value || 0) / total) * 100).toFixed(1)}%)`),
					)),
				),
			);
		}

		function DetailTable({ details }) {
			if (details.length === 0) return h("div", { className: "dshs-empty" }, t("noData"));
			const nowMs = Date.now();
			const columns = [t("colTime"), t("colModel"), t("colInput"), t("colOutput"), t("colTotal"), t("cacheHit"), t("colTtft"), t("colDuration")];
			return h("div", { className: "dshs-table-wrap" },
				h("table", { className: "dshs-table" },
					h("thead", null, h("tr", null, columns.map((c) => h("th", { key: c }, c)))),
					h("tbody", null, details.map((d) => {
						const total = d.input + d.cacheRead + d.cacheWrite + d.output;
						const inputTotal = d.input + d.cacheRead + d.cacheWrite;
						const hit = inputTotal > 0 ? `${((d.cacheRead / inputTotal) * 100).toFixed(0)}%` : "—";
						return h("tr", { key: `${d.t}-${d.model}-${total}` },
							h("td", {}, formatTime(d.t, nowMs)),
							h("td", { className: "dshs-td-model", title: d.model }, d.model),
							h("td", {}, formatTokens(d.input)),
							h("td", {}, formatTokens(d.output)),
							h("td", { className: "dshs-td-total" }, formatTokens(total)),
							h("td", {}, hit),
							h("td", {}, formatDuration(d.ttft)),
							h("td", {}, formatDuration(d.duration)),
						);
					})),
				),
			);
		}

		function SessionTable({ sessions }) {
			if (!sessions || sessions.length === 0) return h("div", { className: "dshs-empty" }, t("noData"));
			const columns = [t("conversation"), t("requests"), t("tokens"), t("colInput"), t("colOutput"), t("avgDuration")];
			return h("div", { className: "dshs-table-wrap" },
				h("table", { className: "dshs-table" },
					h("thead", null, h("tr", null, columns.map((c) => h("th", { key: c }, c)))),
					h("tbody", null, sessions.map((s) => h("tr", { key: s.session },
						h("td", { className: "dshs-td-model", title: s.name || s.session }, s.name || t("untitledConversation")),
						h("td", {}, formatRequests(s.requests)),
						h("td", { className: "dshs-td-total" }, formatTokens(s.tokens)),
						h("td", {}, formatTokens(s.input)),
						h("td", {}, formatTokens(s.output)),
						h("td", {}, formatDuration(s.avgDuration)),
					))),
				),
			);
		}

		function StatsDialog({ onClose }) {
			const [range, setRange] = useState("today");
			const [provider, setProvider] = useState("all");
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
				call("usage", { range, provider })
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
			}, [range, provider]);

			const body = loading
				? h("div", { className: "dshs-empty" }, t("loading"))
				: error !== null
					? h("div", { className: "dshs-error" }, `${t("error")}: ${error}`)
					: h(React.Fragment, null,
						h("div", { className: "dshs-filtrow" },
							h("span", { className: "dshs-filtlabel" }, t("timeRange")),
							h("div", { className: "dshs-seg", role: "group" },
								RANGES.map((r) => h("button", {
									key: r.id,
									type: "button",
									"data-active": String(r.id === range),
									onClick: () => setRange(r.id),
								}, r.label)),
							),
						),
						h("div", { className: "dshs-filtrow" },
							h("span", { className: "dshs-filtlabel" }, t("provider")),
							h("div", { className: "dshs-seg", role: "group" },
								h("button", {
									type: "button",
									"data-active": String(provider === "all"),
									onClick: () => setProvider("all"),
								}, t("rangeAll")),
								(data?.providers ?? []).map((p) => h("button", {
									key: p.provider,
									type: "button",
									title: `${p.name ?? p.provider} · ${p.requests} ${t("requests")} · ${formatTokens(p.tokens)} ${t("tokens")}`,
									"data-active": String(provider === p.provider),
									onClick: () => setProvider(p.provider),
								}, p.name ?? p.provider)),
							),
						),
						h("section", { className: "dshs-section" },
							h("h3", null, t("overview")),
							h(OverviewChips, { totals: data?.totals }),
						),
						(data?.providers ?? []).length > 0
							? h("div", { className: "dshs-duo" },
								h("section", { className: "dshs-section" },
									h("h3", null, t("providerDist")),
									h(DonutChart, { items: (data?.providers ?? []).map((p) => ({ name: p.name ?? p.provider, value: p.tokens })) }),
								),
								h("section", { className: "dshs-section" },
									h("h3", null, t("modelDist")),
									h(ModelRows, { models: data?.models ?? [] }),
								),
							)
							: h("section", { className: "dshs-section" },
								h("h3", null, t("modelDist")),
								h(ModelRows, { models: data?.models ?? [] }),
							),
						h("section", { className: "dshs-section" },
							h("h3", null, t("trend")),
							h(TrendChart, { trend: data?.trend ?? [] }),
						),
						h("section", { className: "dshs-section" },
							h("h3", null, `${t("sessionUsage")} (${(data?.sessions ?? []).length})`),
							h(SessionTable, { sessions: data?.sessions ?? [] }),
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
					value: value ?? "#f4f5f7",
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
			const [platformToken, setPlatformToken] = useState("");
			const [platformTokenStatus, setPlatformTokenStatus] = useState(null);
			const [platformTokenMessage, setPlatformTokenMessage] = useState("");
			const [platformBusy, setPlatformBusy] = useState(false);

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
				call("platformTokenStatus")
					.then((tok) => {
						if (!cancelled) setPlatformTokenStatus(tok);
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

			const savePlatformToken = async () => {
				if (platformBusy) return;
				setPlatformBusy(true);
				setPlatformTokenMessage("");
				try {
					await call("savePlatformToken", { token: platformToken.trim() });
					const st = await call("platformTokenStatus");
					setPlatformTokenStatus(st);
					setPlatformTokenMessage(t("dsTokenSaved"));
				} catch (e) {
					setPlatformTokenMessage(`${t("error")}: ${e.message}`);
				}
				setPlatformBusy(false);
			};

			const fetchPlatformToken = async () => {
				if (platformBusy) return;
				setPlatformBusy(true);
				setPlatformTokenMessage("");
				try {
					const res = await call("importPlatformToken");
					if (res?.found === true && typeof res.token === "string" && res.token.trim() !== "") {
						setPlatformToken(res.token);
						await call("savePlatformToken", { token: res.token });
						const st = await call("platformTokenStatus");
						setPlatformTokenStatus(st);
						setPlatformTokenMessage(t("dsTokenFetched"));
					} else {
						setPlatformTokenMessage(t("dsTokenNotFound"));
					}
				} catch (e) {
					setPlatformTokenMessage(`${t("error")}: ${e.message}`);
				}
				setPlatformBusy(false);
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

				section("dsTokenSection",
					h("div", { className: "dshs-set-hint" }, t("dsTokenIntro")),
					h("div", { className: "dshs-set-row" },
						h("div", { className: "dshs-set-label" }, t("dsTokenLabel")),
						h("input", {
							type: "text",
							className: "dshs-set-input",
							style: { width: "auto", flex: 1, minWidth: 0 },
							placeholder: t("dsTokenPlaceholder"),
							value: platformToken,
							onChange: (e) => setPlatformToken(e.target.value),
							spellCheck: false,
						}),
					),
					h("div", { className: "dshs-set-row" },
						h("button", { type: "button", className: "dshs-btn", disabled: platformBusy, onClick: fetchPlatformToken }, t("dsTokenAuto")),
						h("button", { type: "button", className: "dshs-btn", disabled: platformBusy, onClick: savePlatformToken }, t("dsTokenSave")),
						h("span", { className: "dshs-set-hint" },
							platformTokenStatus === null ? "" : (platformTokenStatus.configured ? t("dsTokenConfigured") : t("dsTokenUnconfigured"))),
					),
					platformTokenMessage !== "" && h("div", { className: "dshs-set-hint" }, platformTokenMessage),
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
				let deepseekData = null;
				let deepseekError = null;
				let deepseekLoading = false;

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

				const fetchDeepseek = async (force = false) => {
					if (disposed || deepseekLoading) return;
					deepseekLoading = true;
					deepseekError = null;
					render();
					try {
						deepseekData = await call("deepseek", force ? { force: true } : {});
						deepseekError = null;
					} catch (e) {
						deepseekError = e.message;
						deepseekData = null;
					}
					deepseekLoading = false;
					render();
				};

				const render = () => {
					if (root === null || host === null) return;
					root.render(h(StatsWidget, {
						settings,
						collapsed,
						data,
						error,
						onOpen: openDialog,
						deepseek: deepseekData,
						deepseekLoading,
						deepseekError,
						onFetchDeepseek: fetchDeepseek,
					}));
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
