# chicheng-stats

dsh Web 全局用量统计插件：在侧边栏底部展示 **今日请求 / 总请求 / 今日Token / 总Token**（跨所有会话，包括其他进程产生的会话，如 headless 定时任务）。

## 功能

- **实时累计**：订阅 `session/event`，按 `(turn, step)` 去重计数每次 provider 请求的用量样本；
- **历史回填 + 增量扫描**：启动后扫描 `$DSH_HOME/sessions` 下所有会话日志（zstd 多帧拼接，按帧切分后逐帧解压），只处理越过持久化 seq 水位的事件，与实时计数天然去重；此后每 5 分钟轻扫一次，覆盖 headless/cron 等外部进程写入的会话；
- **持久化**：`$DSH_HOME/stats/store.json`（防抖原子写入），重启不丢；
- **口径**：Token = `inputTokens + cacheReadTokens + cacheWriteTokens + outputTokens`（与 dsh-token-meter 的 `usageTokens()` 一致，reasoning 已含在 output 内不重复计）；"今日"按事件时间戳的本地日期分桶；同一步的重复用量样本按 last-wins 替换，不重复计请求；
- **API**：fenced `POST /stats/api/summary`、`POST /stats/api/status`（同源/回环 + trusted-host 校验）。

## 安装（web profile）

1. `dsh plugin --profile web add D:\Harness\chicheng-stats`（或手动在 profile 的 package.json 添加 `"chicheng-stats": "file:D:/Harness/chicheng-stats"` 依赖与 `dsh.profile.bundles` 条目后执行 `pnpm install`）；
2. 重启 `dsh web`；
3. 刷新页面：侧边栏底部出现用量卡片。

## 卸载

移除 profile 依赖与 bundle 条目 → 重装 → 重启；删除 `$DSH_HOME/stats/` 即清空全部统计。

## 目录

- `lib/index.js` — Host 端（Cordis 插件）
- `lib/client.js` — Client 端（`window.__ModuleLoader__` 注册的 React 组件）
- `cordis.patch.yml` — profile loader 挂载补丁
