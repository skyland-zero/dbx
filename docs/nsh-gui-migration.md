# DBX 原生 GUI（NSH）迁移方案 —— 桌面优先 + 1:1 视觉还原

> 状态：方案稿，待评审
> 分支：`dev-nsh`
> 范围：第一阶段（桌面端连接 SQL Server + 执行 SQL + 多 tab）
> 硬性要求：**迁移的界面以现有 Vue 版为基准做 1:1 截图还原**
> 上游依赖：[longbridge/nsh](https://github.com/longbridge/nsh) `0.5.0`（Apache-2.0）

## 实现状态（`dev-nsh` 分支）

| 项 | 状态 |
| --- | --- |
| M1：`dbx-web` 拆 lib + 数据通道 + 连接列表 | **已完成**；`cargo check --workspace` 通过，冒烟测试真实启动进程内服务并读到连接列表（rustc 1.99.1） |
| SQL 工作台（编辑器 + 执行 + 取消 + 只读结果网格） | **已完成**，见 `apps/nsh/native/src/workbench.rs` |
| 数据通道 | **进程内 `Router::oneshot`**（`RouterMode::Local`），无端口、无 HTTP 客户端 |
| 连接配置的钥匙串 | **已打通**：`build_local_state` 用 `Storage::with_desktop_credential_recovery()` 打开桌面存储；本地模式 `password_viewer_enabled = true`，已保存的密码可直接连接 |
| M0（三平台启动 / 中文 IME / 网格帧率） | 未验证：需要图形环境与 GTK4 |
| 主题（D10：从 `tokens.css` 生成） | **已完成**：`scripts/gen-nsh-theme.mjs` → `apps/nsh/theme.json`（31 个 token × light/dark，`radius` 4px），`pnpm check` 会校验漂移 |
| 多 tab | **已完成**（M4 的主体）：每个 tab 独立语句/状态/结果，编辑器随 tab 切换；关闭与拖拽拆分未做 |
| 新建连接 | **已完成**：应用内表单写入 `dbx.db`（payload 已用真实 `dbx-web` 二进制验证） |
| `serve()` 回归 | 已用构建出的 `dbx-web` 二进制冒烟：`/api/version` 200、`/api/connection/list` `[]`、保存后再列出、`/query/execute` 走到 tiberius 并返回预期连接错误 |
| 1:1 视觉还原（字体、图标、截图基线） | 未开始（§8） |
| 运行说明 | `apps/nsh/README.md` |

复现验证：

```sh
cargo check -p dbx-web --lib          # 根 workspace
cd apps/nsh && cargo test -p dbx-native  # 进程内服务 + /api/connection/list
```

## 1. 背景

| 现状 | 规模 |
| --- | --- |
| 前端 `apps/desktop/src` | 587 个 `.vue`，约 58.7 万行 |
| Tauri 命令层 `src-tauri/src/commands` | 83 个文件，约 3.2 万行，785 个命令 |
| 业务层 `crates/dbx-core` | 约 31 万行 |
| Web 服务 `crates/dbx-web` | 767 条路由，约 3.2 万行 |
| SQL Server 驱动 | `crates/dbx-driver-sqlserver`，纯 Rust（tiberius 0.12.3） |

关键事实：

1. 业务逻辑全部在 Rust（`dbx-core`），Tauri 只是壳。
2. `apps/desktop/src/lib/backend/tauri.ts`（828 个导出）与 `http.ts`（874 个）**接口完全对齐，tauri 有而 http 缺的为 0**。
3. `dbx-web` 的 767 条路由就是「core 应该怎么调」的完整参考答案，其中连接探测、隧道、凭据等逻辑已经过验证。
4. 仓库已有 Vue 版 Web（`dbx-web` + `apps/desktop` 的 http 传输），**浏览器访问的需求已被覆盖**。
5. 设计令牌集中在 `apps/desktop/src/styles/tokens.css`，是 shadcn 风格的 CSS 变量——这一点让 1:1 还原具备可操作性（见 §8）。

## 2. 目标与非目标

### 目标

- 用 NSH 新增一套**桌面 GUI**（macOS / Windows / Linux 原生渲染），与现有 Tauri/Vue 版**并存**。
- 采用 mixed 模式：**大部分页面 TSX，重页面（SQL 工作台、结果网格）用 Rust**。
- 数据通道复用 `dbx-web` 的现有路由（进程内调用），不重写业务层。
- 复用现有连接配置（`dbx.db` + 系统钥匙串）。
- **迁移到的界面与现有 Vue 版 1:1 还原**（判定方式与容差见 §8）。

### 非目标

- **Web / 浏览器**（现有 Vue 版已覆盖；未来扩展见附录 A）。
- iOS / Android。
- TUI（未来可用同一套 DTO 扩展，见 D8）。
- 替换现有 Tauri 桌面版。
- 功能全量对齐（第一阶段只做连接和查询）。
- Windows 7 / Ubuntu 22.04（见 §10）。

## 3. 决策记录

| # | 决策 | 理由 |
| --- | --- | --- |
| D1 | 数据通道走 **`dbx-web` 进程内 router**（`Router::oneshot`），不开端口 | 复用 767 条已验证路由；避免成为连接探测逻辑的第三份实现（见附录 B） |
| D2 | UI **以 TSX 为入口**（路由/导航），重页面为 Rust 组件 | 团队 Vue 背景、迭代快；数据密集页面数据零跨界 |
| D3 | **复用 dbx 连接配置**：`dbx.db`（SQLite）+ 系统钥匙串 | 两套 GUI 看到同一批连接；避免第二套配置 |
| D4 | **保留 TDS ATTENTION（查询取消）** | 需要 vendored tiberius |
| D5 | **多 tab 从第一阶段开始** | 先做固定 tab 条，可拖拽 dock 后置 |
| D6 | `apps/nsh` 为**独立 Cargo workspace**，内部复制一行 `[patch.crates-io] tiberius` | 既要 ATTENTION，又不想让根的 `cargo --workspace` CI 编译 GTK4/QuickJS |
| D7 | 不改动现有 `src-tauri` / `apps/desktop` | 保证现有版本可随时发版 |
| D8 | UI 层**只使用 `dbx-types` 的 DTO**，不出现 `dbx_core::AppState` 等运行时类型 | 零成本的未来保险：加 TUI / Web 时只需补一个传输实现 |
| D9 | **页面验收以 1:1 截图对比为准**，不通过不合并 | 视觉一致性是本次迁移的核心目标，不是加分项 |
| D10 | 主题从 `tokens.css` **脚本生成**，不手抄 | 手抄必然漂移；生成 + CI 校验（§8.3） |

## 4. 架构

```text
┌────────────────────────── apps/nsh ──────────────────────────┐
│  App.tsx                    TSX：路由、导航、全局状态         │
│    ├── routes/Connections.tsx     纯 TSX                      │
│    ├── routes/SqlWorkbench.tsx    TSX 外壳 → <SqlWorkbench/>  │
│    └── routes/Settings.tsx        纯 TSX                      │
│                                                               │
│  native/（Rust 组件，dbx-nsh-native）                          │
│    ├── SqlWorkbench：多 tab + editor + data_table             │
│    └── service：把 UI 请求翻译成 dbx-web 路由调用              │
└──────────────────────────────┬────────────────────────────────┘
                               │ 进程内 oneshot（JSON DTO）
                      crates/dbx-web (lib, 新增)
                               │
                      crates/dbx-core
                               │
              crates/dbx-driver-sqlserver → tiberius(vendored)
```

没有 wasm、没有 HTTP 端口、没有鉴权层、没有反向代理。

## 5. 目录结构

```text
apps/nsh/                          # 独立 workspace（根 Cargo.toml exclude）
├── nsh.json                       # { "name": "DBX", "id": "com.dbx.native", "rust": "native" }
├── App.tsx                        # 唯一入口
├── tsconfig.json
├── routes/
│   ├── Connections.tsx
│   ├── SqlWorkbench.tsx
│   └── Settings.tsx
├── components/                    # 纯 TSX 组件
├── themes/                        # 由 tokens.css 生成，勿手改
│   ├── light.json
│   ├── dark.json
│   └── theme-soft.json …
├── fixtures/                      # 截图基线用的固定数据
├── .screenshots/                  # 截图与 diff 产物（gitignore）
├── Cargo.toml                     # [workspace] members = ["native"]
├── Cargo.lock
└── native/                        # dbx-nsh-native
    ├── Cargo.toml
    ├── fonts/                     # 内置 Geist / Fira Code（OFL）
    └── src/
        ├── lib.rs                 # #[native_module("dbx/native")]
        ├── sql_workbench.rs       # 多 tab 容器
        ├── data_grid.rs           # 基于 nsh_base::prelude::DataTable
        ├── editor.rs              # 基于 nsh_base::prelude::Editor
        └── service/
            ├── mod.rs             # Router 持有者 + 后台 tokio runtime
            ├── connection.rs      # /connection/*
            └── query.rs           # /query/*
```

对现有代码的改动（最小集）：

| 文件 | 改动 | 风险 |
| --- | --- | --- |
| `crates/dbx-web/src/lib.rs` | **新增**：`build_router(state, mode)`、`serve(config)`、`WebState::local(...)` | 中（纯搬迁） |
| `crates/dbx-web/src/main.rs` | 变薄，只解析环境变量并调 lib | 低 |
| `crates/dbx-web/Cargo.toml` | 增加 `[lib]`，bin 依赖 lib | 低 |
| `crates/dbx-platform/src/data_dir.rs` | **新增**（从 `src-tauri/src/data_dir.rs` 迁入，210 行纯 std） | 低 |
| `src-tauri/src/data_dir.rs` | 改为 `pub use dbx_platform::data_dir::*` | 低 |
| `scripts/gen-nsh-theme.mjs` | **新增**：tokens.css → nsh 主题 JSON | 低 |
| `Cargo.toml` | workspace `exclude` 增加 `apps/nsh` | 低 |
| `Makefile` | `nsh-dev` / `nsh-build` / `nsh-visual` | 低 |

## 6. 数据通道

### 6.1 为什么是进程内 router

桌面端本可以直接依赖 `dbx-core`，但**连接测试/建立连接这一层，仓库里已经有两份实现**：

| 位置 | 内容 |
| --- | --- |
| `src-tauri/src/commands/connection.rs:1641` `test_connection_with_info_impl` | 端点探测、隧道、插件驱动、取消 |
| `crates/dbx-web/src/routes/connection.rs:368` `run_temporary_connection_test` | 同样的探测逻辑（约 100 行） |

涉及 `connection_endpoint_attempt`、`ZooKeeperTransportCancellation`、`probe_connection_endpoint`、runtime proxy、SSH 隧道、session credentials。**再写第三份就是技术债。**

用进程内 router 的代价只是每次调用多一次 JSON 序列化，在分页结果下可以忽略。等第一阶段跑完、拿到真实性能数据，再把热门路径（结果集分页、大字段）换成直连 core。

**本分支的实现**（已完成）：

```rust
// crates/dbx-web
pub fn build_router(state: Arc<WebState>, mode: RouterMode) -> Router;
pub async fn build_local_state(data_dir: PathBuf) -> Result<Arc<WebState>, String>;

// apps/nsh/native/src/service.rs
let state = build_local_state(data_dir)?;          // 桌面存储 + 钥匙串
let router = build_router(state, RouterMode::Local); // 无 login/captcha/migration 门
let response = router.clone().oneshot(request).await?; // 进程内，无端口
```

- `RouterMode::Local` 跳过 `migration_gate` / `demo_mode_gate` / `auth_middleware`（`lib.rs` 的 `api_router`）。
- 本地状态用 `Storage::with_desktop_credential_recovery()`，并按桌面习惯让 `/api/connection/list` 返回已保存的密码（仅在进程内，不经过网络）。
- 工作台的密码框因此变成**可选**：留空即用钥匙串里的密码。
- 请求在 DBX 自己的 multi-thread runtime 上执行，UI 线程只 await 一个 channel，不阻塞引擎。

### 6.2 契约

UI 侧只暴露 DTO：

```rust
pub struct DbxService { /* 后台 runtime + Router */ }

impl DbxService {
    pub fn list_connections(&self, done: impl FnOnce(Result<Vec<ConnectionConfig>, String>) + 'static);
    pub fn save_connections(&self, configs: Vec<ConnectionConfig>, done: ...);
    pub fn test_connection(&self, config: ConnectionConfig, done: impl FnOnce(Result<ConnectionTestResult, String>) + 'static);
    pub fn connect(&self, config: ConnectionConfig, done: ...);
    pub fn execute(&self, req: ExecuteRequest, done: impl FnOnce(Result<QueryResult, String>) + 'static);
    pub fn cancel(&self, execution_id: String, done: ...);
}
```

- DTO 全部来自 `dbx-types`（`QueryResult` 在 `crates/dbx-types/src/types.rs:636`）。
- 回调式而非 `async fn`：UI 线程与后台 runtime 解耦，避免 runtime 嵌套。

### 6.3 无鉴权

`dbx-web` 的鉴权是 tower 中间件（`crates/dbx-web/src/auth.rs:325`，挂在 `main.rs:1599-1601`）。`build_router` 增加一个模式参数：

```rust
pub enum RouterMode {
    Server,   // 现行为：migration_gate + demo_mode_gate + auth_middleware
    Local,    // 桌面进程内：跳过三者
}
```

桌面端不引入登录、密码、captcha、session。

### 6.4 线程模型

```text
UI 线程 ──request──▶ 后台线程（独立 multi-thread tokio runtime）
   ▲                          │
   └──────回调 / 信号─────────┘
```

不在 nsh 引擎自带的 runtime 里跑 `dbx-core` 任务。回调如何安全回到 UI 线程（`nsh_core::element::ambient::spawn` 是否足够）是 M0 的验证项之一。

### 6.5 第一阶段要打通的接口（均已存在）

| 用途 | 路由 | 位置 |
| --- | --- | --- |
| 连接列表 | `GET /connection/list` | `crates/dbx-web/src/main.rs:700` |
| 保存连接 | `POST /connection/save` | `:699` |
| 测试连接 | `POST /connection/test-info` | `:675` |
| 建立连接 | `POST /connection/connect` | `:678` |
| 执行 SQL | `POST /query/execute` | `:892` |
| 取消查询 | `POST /query/cancel` | `:1020` |

### 6.6 分页契约

`/query/execute` 返回整页结果。第一阶段限制单页行数（例如 5,000），超出时提示并使用 `/query/prepare-pagination-plan` 分页。**禁止把整表塞进一次响应**。

## 7. 第一阶段功能范围

### 做什么

1. 连接管理：列表、新建、编辑、删除、测试连接、建立连接。
2. SQL 工作台：
   - `nsh_base::prelude::Editor`（SQL 高亮、补全钩子）；
   - 执行、取消；
   - `nsh_base::prelude::DataTable` 结果网格（虚拟滚动）；
   - 错误信息文本展示（行列定位后续）。
3. **多 tab**：每个 tab 独立的连接/数据库/编辑器内容/结果。
4. 复用现有连接配置：`dbx.db` + 系统钥匙串。
5. 上述界面的 **1:1 截图还原**（§8）。

### 不做什么

- Web、iOS/Android、TUI。
- 对象树、表结构、导入导出、AI、插件、ER 图、Redis/Mongo 等。
- 可拖拽 dock 布局（用固定 tab 条替代）。
- 深链接、托盘、自动更新、单实例。

### 验收标准（DoD）

- [ ] macOS 14+ / Windows 10 1809+ / Linux（GTK 4.14+）三平台可启动。
- [ ] 新建 SQL Server 连接 → 保存 → 测试 → 连接成功。
- [ ] 保存的连接出现在现有 Tauri 版中（同一 `dbx.db`），密码从钥匙串读取。
- [ ] 执行 `SELECT` / `CREATE` / `INSERT`，结果网格正确渲染 1 万行，滚动流畅。
- [ ] 长查询可取消，取消后连接仍可继续使用。
- [ ] 至少 2 个 tab 并行，互不干扰。
- [ ] `cargo test -p dbx-nsh-native` 有 headless UI 测试。
- [ ] **每个迁移页面提交三张图：Vue 基线 / NSH 实现 / diff 报告，A 区差异 ≤0.1%**（§8.1）。
- [ ] 主题通过脚本生成，`pnpm check` 能发现 token 漂移。

## 8. 视觉还原（1:1）

### 8.1 判定标准

对比条件必须固定：**同窗口尺寸**（1280×800 与 2560×1600 各一组）、**同数据 fixture**、**同主题**（light / dark 各一组）、**同语言**（zh-CN）。

按区域分三档：

| 档 | 范围 | 标准 |
| --- | --- | --- |
| **A** | 布局、间距、颜色、边框、圆角、图标、文本位置 | 像素 diff ≈ 0，容忍 ≤0.1% |
| **B** | 文本字形渲染（抗锯齿、hinting） | 允许像素差异；字号/行高/基线/文本包围盒必须一致 |
| **C** | 编辑器内部、滚动条、系统控件、光标 | 允许差异，人工审核，逐项记录 |

合入前必须附：`vue-<page>.png`、`nsh-<page>.png`、`diff-<page>.png` + 差异百分比。

### 8.2 有利条件：主题层可以做到逐 token 相同

- dbx 的 `apps/desktop/src/styles/tokens.css`（225 行）是 **shadcn 风格 CSS 变量**：`--background`、`--foreground`、`--card`、`--popover`、`--primary`、`--secondary`、`--muted`、`--accent`、`--destructive`、`--border`、`--input`、`--ring`、`--chart-1..5`、`--sidebar-*`、`--radius`。
- nsh 的主题文件格式**就是 shadcn 的 `cssVars`**（`crates/nsh-base/src/theme.rs:10`），token 名一一对应。
- nsh 的颜色解析支持 hex / `rgb()` / `hsl()` / `oklch()` / `oklab()`（`crates/nsh-core/src/color.rs:32`），**`tokens.css` 里的值可以原样搬**。

所以主题不是"调得像"，而是"数值相同"。

### 8.3 主题由脚本生成（D10）

新增 `scripts/gen-nsh-theme.mjs`：

1. 解析 `tokens.css` 的 `:root` 与 `.dark`。
2. 解析 `globals.css` 里尚未迁入 tokens.css 的部分：`html.theme-soft`、`.theme-graphite` 等备选主题，以及 `:root[data-corner-style]` 的圆角变体。
3. 输出 `apps/nsh/themes/{light,dark,theme-*.json}`，格式为 nsh 的 `cssVars`。
4. `--check` 模式纳入 `pnpm check`：token 改了但没重新生成就报错。

### 8.4 字体

| 用途 | 现状 | 迁移做法 |
| --- | --- | --- |
| 正文 | `"Geist Variable", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", system-ui` | 内置 Geist（OFL），中文回退系统字体 |
| 等宽 | `Fira Code, Cascadia Code, JetBrains Mono, …` | 内置 Fira Code（OFL） |
| 标题 | 同正文 | 同正文 |

注意：

- 中文回退字体在三个平台本就不同（PingFang / Microsoft YaHei / Noto Sans CJK），**现有 Tauri 版也有这个差异**，所以基线截图按平台分别生成。
- 字号、行高、字距按 token 逐项对齐；nsh 支持 `letterSpacing`、`lineHeight`。
- 内置字体通过 `nsh_core::element::ambient::register_font(data)` 注册（`crates/nsh-core/src/core/mod.rs:2242`）。

### 8.5 图标

- 现有 Vue 使用 SVG 图标集；nsh 有 `svg` 模块（`crates/nsh-core/src/svg`，feature `svg`）。
- **同一份 SVG 源文件同时供给两端**，禁止各画一套。
- 尺寸/颜色用 token（`currentColor` 语义由 nsh 样式映射）。

### 8.6 已知不能像素级一致的地方

| 项 | 原因 | 处理 |
| --- | --- | --- |
| 文本抗锯齿 | 平台字形光栅化不同 | B 档，允许差异，校验包围盒 |
| 编辑器内部 | nsh `Editor` 不是 CodeMirror | C 档：语法配色、行号、选区、当前行、缩进参考线对齐；光标/折叠箭头/滚动条人工审核 |
| `::-webkit-scrollbar` | 浏览器私有样式 | 用 nsh 滚动条调到同宽同色 |
| `backdrop-filter` 模糊 | nsh 有 `backdropFilter`，但算法不同 | 按视觉近似，记录在 C 档 |
| 系统控件（输入框光标、原生菜单） | 平台行为 | C 档 |

nsh 已确认支持的关键样式（`crates/nsh-core/src/style.rs`）：

| CSS | nsh |
| --- | --- |
| `box-shadow`（含多层、inset） | `boxShadow` |
| `backdrop-filter` | `backdropFilter` |
| `letter-spacing` / `line-height` | `letterSpacing` / `lineHeight` |
| `line-clamp` | `numberOfLines`（或 class `line-clamp-*`） |
| `text-overflow` | `textOverflow`（ellipsis / clip / ellipsis-start / ellipsis-middle） |
| `position: sticky` | `position: "sticky"` |
| 渐变 | `backgroundImage` / `maskImage` |
| `transform` | `transform`（translate/scale/rotate/skew/perspective） |

没有发现明显缺项；真正的差距在**文本测量与光栅化**，不在样式能力。

### 8.7 截图流水线

```text
Vue 基线：固定 fixture 启动 Tauri 版 → 窗口截图（或 devtools CDP 截图）
NSH 实现：nsh test ... → app.screenshot("out.png")   ← 三平台均支持
对比：odiff / pixelmatch → diff.png + 差异百分比
归档：apps/nsh/.screenshots/<page>-<theme>-<size>.{vue,nsh,diff}.png
```

- `app.screenshot` 在 `crates/nsh-testing/src/module.rs:1862`，三个桌面后端都实现了 `window_screenshot`（`nsh-platform-{linux,macos,windows}/src/agent.rs`）。
- CI 增加 `nsh-visual` job，三平台各跑一套；超阈值失败并上传 diff 图。

### 8.8 对工期的影响

| 项 | 影响 |
| --- | --- |
| 主题生成脚本 | 2–3 天（M0 内完成） |
| 截图对比工具链 | 2–3 天（M0 内完成） |
| 每个页面的还原调试 | +20%~30% |
| 编辑器/网格贴 CodeMirror 观感 | +1 周 |

## 9. 关键实现要点

### 9.1 dbx-web 拆 lib

```rust
// crates/dbx-web/src/lib.rs
pub struct WebConfig { /* 端口、数据目录、静态资源、密码策略 */ }
pub enum RouterMode { Server, Local }

pub async fn build_state(config: &WebConfig) -> Result<Arc<WebState>, String>;
pub fn build_router(state: Arc<WebState>, mode: RouterMode) -> axum::Router;
pub async fn serve(config: WebConfig) -> Result<(), String>;
```

路由组装目前已在 `add_*_routes()` 中分段，搬迁是机械工作。现有 `dbx-web` 测试全绿后再继续。

### 9.2 复用连接配置与钥匙串

```rust
let data_dir = dbx_platform::data_dir::resolve(...);   // 支持 DBX_DATA_DIR / Windows portable
let storage = Storage::open_unmigrated(&data_dir.join("dbx.db"))
    .await?
    .with_desktop_credential_recovery();                // 系统钥匙串
let app = AppState::new_with_plugin_and_agent_dir_and_app_version(
    storage,
    data_dir.join("plugins"),
    data_dir.join("agents"),
    env!("CARGO_PKG_VERSION"),
);
```

- **不要**沿用 `dbx-web` 的 `SecretKeyPolicy::ManagedDataDir`（`crates/dbx-web/src/main.rs:542`），桌面要用平台钥匙串（`src-tauri/src/lib.rs:2098` 只在 Windows portable 模式切 Managed）。
- `WebState` 需要一个本地构造入口（类似现有 `WebState::for_tests`），不读环境变量、不设置密码。
- **并发风险**：两个进程同时打开 `dbx.db`。第一阶段约束是「不与 Tauri 版同时运行」，后续做单实例互斥（文件锁或命名信号量）。

### 9.3 ATTENTION 与 tiberius

- `crates/dbx-core` 的 `sqlserver-native-attention` 特性转发到 `dbx-drivers`。
- `send_attention` **只存在于 vendored tiberius**（根 `Cargo.toml` 的 `[patch.crates-io] tiberius = { path = "vendor/tiberius" }`）。
- `apps/nsh/Cargo.toml` 必须复制：

```toml
[patch.crates-io]
tiberius = { path = "../../vendor/tiberius" }
```

- 依赖声明显式开启：

```toml
dbx-core = { path = "../../crates/dbx-core", features = ["sqlserver-native-attention"] }
```

漏掉 patch 会直接编译失败（不是静默降级）。

### 9.4 编辑器与网格

- 编辑器用 `nsh_base::prelude::Editor`：内置 57 种语言（含 SQL）的高亮、补全回调、诊断。第一阶段补全先接表名/列名（静态），不做语义分析。
- 网格用 `nsh_base::prelude::DataTable`：只渲染可视行（官方 10 万行 × 20 列基准即此模式），因此**行数据必须留在 Rust**，TSX 只传 `tabId`。
- 两者都需要按 §8 贴齐现有视觉：编辑器主题色来自 dbx 的编辑器配色 token，网格行高/边框/表头样式来自 tokens。

### 9.5 多 tab

- Rust 侧维护 `Vec<TabState>`，用 `nsh_base::prelude::{Tabs, Tab}` 渲染 tab 条。
- `TabState`：`connection_id`、`database`、编辑器缓冲区、`execution_id`、结果集。
- tab 条的视觉按现有实现 1:1（高度、圆角、激活态、关闭按钮、溢出滚动）。

### 9.6 桌面集成（后续阶段）

深链接、托盘、自动更新、窗口状态恢复、单实例——第一阶段全部不做，避免把复杂度提前引入。

## 10. 平台与构建

| 平台 | 要求 | 影响 |
| --- | --- | --- |
| macOS | 14+ | 抬高最低版本（Tauri 版不受影响） |
| Windows | 10 1809+ | **不支持 Win7**，现有 `x86_64-win7-windows-msvc` 构建线与本 GUI 无关 |
| Linux | GTK 4.14+、glibc 2.39（Ubuntu 24.04+） | 与现有 ubuntu-22.04 基线冲突，需单独产物 |
| 无 GPU | Windows 自动 WARP；Linux `GSK_RENDERER=cairo` | 可用，性能需实测 |
| 中文输入 | 原生 IME | M0 必须验证 |

工具链：nsh 0.5.0 要求 rustc **1.97**（仓库 CI 已是 1.97.1），edition 2024。`apps/nsh` 独立 workspace 单独声明 MSRV。

## 11. CI

新增独立 job（不改动现有 `ci.yml`）：

| 任务 | 内容 |
| --- | --- |
| `nsh-check` | `cargo check` + `cargo test -p dbx-nsh-native`（Linux，装 GTK4 dev） |
| `nsh-visual` | 三平台截图对比，超阈值失败，上传 diff 图 |
| `nsh-build` | 三平台打包（先手动触发，稳定后再进发布流程） |

## 12. 风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| nsh 0.5 API 破坏性变更 | 中 | 锁定版本；升级单独 PR；不追 main |
| 中文 IME 在 nsh editor 内表现 | 高 | M0 首周验证，不行退回 `TextView` + 外部输入 |
| 编辑器观感与 CodeMirror 差距 | **高** | M0 就做编辑器截图对比，结论不对就调整范围（例如首版只做只读高亮） |
| 字体/图标不一致导致 A 区差差异 | 中 | 内置字体 + 同源 SVG + 生成式主题 |
| 10 万行网格在 WARP/cairo 下帧率 | 中 | 官方基准 + 自测；必要时限制首屏行数 |
| `dbx.db` 双进程写冲突 | 中 | 第一阶段不同时运行；后续单实例 |
| 桌面端 QuickJS 内存（~79MB vs ~49MB） | 低 | 必要时把页面逐步改为 Rust 组件 |
| Linux 基线（GTK4/glibc） | 中 | 先只出 Ubuntu 24.04 产物 |
| `dbx-web` 拆 lib 引入回归 | 中 | 纯搬迁，现有测试全绿后再继续 |

## 13. 里程碑

| 里程碑 | 内容 | 估 |
| --- | --- | --- |
| M0 | PoC：三平台启动 + 中文 IME + 10 万行网格帧率 + 回调线程模型 + **主题生成脚本 + 截图对比工具链** | 1.5 周 |
| M1 | `dbx-web` 拆 lib + `DbxService`，打通 `/connection/list` | 1.5 周 |
| M2 | 连接管理（TSX：保存/测试/连接，走钥匙串）+ 1:1 还原 | 2 周 |
| M3 | `SqlWorkbench`（编辑器 + 执行 + 网格 + 取消）+ 1:1 还原 | 3 周 |
| M4 | 多 tab + 1:1 还原 | 1 周 |

合计 **8–9 周**（1–2 人）。M0 结束即可决定是否继续——尤其是编辑器视觉这一关。

## 14. 未决问题

1. 后台线程结果如何安全送回 UI 线程（`ambient::spawn` 是否足够），M0 验证。
2. 连接密码是否需要「每次询问」（现有 session credential 机制）。
3. `WebState::local` 需要剥离哪些 web 专属字段（密码、captcha、sse channels）才能最小化启动成本。
4. 1:1 的 C 档（编辑器、滚动条）由谁审核、记录在哪个文件——建议 `apps/nsh/.screenshots/APPROVALS.md`。
5. 现有 Vue 版的截图基线由谁维护（每次 UI 改动都要重生成基线）。

---

## 附录 A：未来支持 Web 需要补什么

当前方案刻意不做 Web，但保留了扩展点：

1. `DbxService` 拆成 `trait DbxService` + `LocalService`（进程内 router）实现。
2. 新增 `HttpService`（`fetch`）+ `client` crate，依赖按 `cfg(target_arch = "wasm32")` 分流；此时 `native` crate 不能无条件依赖 `dbx-core`。
3. 恢复 `RouterMode::Server`（鉴权中间件），前端用 `dbx_session` cookie。
4. 同源部署：`/` 或 `/nsh/` 静态产物 + 其余路径反代到 `dbx-web`。
5. `BlobHandle` 抽象：文件导入导出在 Web 端只能走上传/下载路由。
6. 视觉还原的 C 档会变大（Web 端字体/滚动条与桌面不同），需要单独的浏览器基线。

届时 UI 层不需要重写——这正是 D8（只用 DTO）的价值。

## 附录 B：为什么暂不直连 core

| 方案 | 连接/隧道/凭据逻辑 | 首阶段成本 |
| --- | --- | --- |
| 进程内 router（本方案） | 复用现成的 | 低 |
| 直连 `dbx-core` | 需要第三份实现，或先抽到 core | 高（约 1 周 + 回归风险） |

如果后续要提速，正确顺序是：**先把连接探测逻辑抽到 `dbx-core`**（同时消掉 `src-tauri` 与 `dbx-web` 的现有重复），再让 UI 直连。不要为了性能先写第三份。
