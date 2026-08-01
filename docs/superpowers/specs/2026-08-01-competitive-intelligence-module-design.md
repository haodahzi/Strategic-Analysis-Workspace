# 对标企业情报模块基础设施设计

**日期：** 2026-08-01

**状态：** 已批准（含 2026-08-01 安全修订）

**适用仓库：** `haodahzi/Strategic-Analysis-Workspace`

**基线：** `claude/business-project-docking-workbench-ccies1` / `79d26128baae4c43ac08b7c62948fc986e62a941`

**实施分支：** `feature/competitive-intelligence`

## 1. 背景与目标

现有工作台已具备战略分析、报告库和模型设置能力。本设计为其增加一个边界清晰的“对标企业情报”内部模块基础设施，使后续企业来源采集、事件抽取和分析能够建立在稳定的本地数据、安全取数和可恢复执行机制上。

本期目标：

- 在现有 React/Vite/Tauri 外壳中增加独立模块入口，不改变既有分析和报告行为。
- 建立独立 SQLite 数据库、版本化迁移、内容寻址的不可变原文快照与类型化 IPC。
- 由 Rust 统一执行受限 HTTPS 请求、文件写入、数据库访问和系统凭据操作。
- 应用启动时识别遗留的运行中任务，将其标记为中断，并计算待补采时间窗。
- 将模型 API Key 从 WebView 持久化迁往 Windows 原生凭据库；浏览器开发模式保持可启动、可测试且不持久化秘密。
- 为后续采集计划提供可验证的安全边界和验收基线。

## 2. 非目标

本期明确不做：

- 不实现企业、别名和来源的完整维护界面。
- 不实现采集调度器、页面解析器、正文/时间抽取、事件识别、聚类、评分或 AI 分析。
- 不采集、跟踪、展示或分析招聘岗位与招聘趋势。
- 不在应用关闭后运行后台采集，也不引入常驻服务。
- 不重构既有项目分析、报告库或其持久化方式。
- 不把情报正文经 IPC 返回给 React，不允许 React 直接访问 SQL、文件系统或任意外部 URL。
- **启动恢复只准备补采时间窗，不启动任何网络请求或采集。** 实际补采属于后续采集计划。

## 3. 边界与原则

### 3.1 模块边界

- 前端代码位于 `app/src/features/intelligence/`，只依赖领域定义的 `IntelligencePlatform`。
- Tauri 适配器负责把 TypeScript 方法映射为固定命令名；组件不直接调用 `invoke`。
- Rust 代码位于 `app/src-tauri/src/intelligence/`，拥有 SQLite、快照、HTTP 和凭据库。
- 情报数据写入应用数据目录中的 `intelligence/competitive-intelligence.db`；快照写入同目录的 `snapshots/`，预留 `backups/`。
- `localStorage` 仅保留非敏感 UI/模型偏好；情报数据与 API Key 均不得进入其中。

### 3.2 运行原则

- 数据库按需惰性初始化。应用顶层启动恢复会首次触发健康检查；初始化失败不阻断整个工作台，UI 重试会重新健康检查与初始化。
- 同一时刻只允许一个初始化过程；成功后复用连接，失败结果不永久缓存。
- 启动恢复协调器在 `main/bootstrap` 中、React `StrictMode` 外启动一次；`App` 订阅其共享状态并传给 `IntelligenceFeature`。开发模式的 StrictMode 重挂载不得重复恢复。
- 所有新增行为遵循测试先行。Rust 模块先完成注册，使测试目标可被发现，再运行预期失败测试，然后提交最小实现。
- 依赖解析从 SQLite 任务开始产生并跟踪 `app/src-tauri/Cargo.lock`，锁定与 Rust 1.77.2/MSRV 兼容的版本。
- 所有 Rust check/test 验收均显式使用 `+1.77.2-x86_64-pc-windows-msvc` 并先打印 `rustc`/`cargo` 版本；1.85.1 仅可用于 MSRV-aware 依赖解析和生成锁文件，不能替代 1.77.2 验收。
- 本模块不需要新增 Tauri capability；所有新增敏感操作都是应用内 Rust 命令，而不是暴露给 WebView 的插件权限。

## 4. 架构

```text
main/bootstrap（StrictMode 外，只启动一次）
        |
        v
StartupRecoveryCoordinator（共享 boot snapshot / retry）
        |
        +--> App --> IntelligenceFeature
        |
        v
IntelligencePlatform（TypeScript 领域接口）
        |
        v
tauriPlatform / secureConfig（适配器与内存秘密缓存）
        |
        v
固定 Tauri IPC 命令
        |
        +--> DatabaseState（惰性、串行、失败后可重试） --> SQLite
        +--> SecureFetcher（DNS 固定、HTTPS、流式限额） --> gzip 快照
        +--> SecretStore（Windows Credential Manager）
```

前端统一使用 `initializing | ready | error | unavailable` 四态呈现模块启动状态。`unavailable` 仅用于没有 Tauri IPC 的浏览器开发模式；桌面端不得用它掩盖初始化或恢复错误。数据库健康检查、恢复准备和安全设置保存都返回结构化结果；错误以稳定的用户消息展示，日志不得包含秘密或响应正文。

## 5. 数据设计

首个迁移版本为 `001_initial.sql`，启用 `WAL`、外键和 5 秒 busy timeout，并记录 `schema_migrations.version = 1`。核心表分为：

- 主数据：`business_units`、`companies`、`company_business_units`、`company_aliases`、`sources`。
- 执行与原文：`collection_runs`、`raw_documents`、`app_checkpoints`。
- 情报与证据：`events`、`event_sources`、`evidence_spans`、`event_analysis_versions`。
- 用户状态：`read_states`、`bookmarks`、`feedback`。
- 检索：`intelligence_fts`。

虽然 schema 为后续阶段预留实体，首期不写入实际采集结果。`raw_documents` 只保存快照相对路径和 SHA-256 等元数据；内容以 `<sha256>.html.gz` 形式不可变保存。同一正文重复保存得到同一哈希和路径，不重复产生文件。

数据库初始化状态由 Rust 管理为“未初始化 / 初始化中 / 已就绪”。健康命令触发初始化并返回：

```ts
interface IntelligenceHealth {
  ready: boolean;
  schemaVersion: number;
  dataDir: string;
}
```

初始化错误释放初始化锁并保留“未初始化”状态，因此下一次健康检查或 UI“重试”会重新创建目录、打开数据库并执行幂等迁移。失败不得使应用 `setup` 退出。

## 6. IPC 契约

固定命令与用途：

| 命令 | 输入 | 输出/效果 |
| --- | --- | --- |
| `intelligence_health` | 无 | 初始化或复用数据库，返回健康信息 |
| `fetch_source_snapshot` | `{ request: { sourceId } }` | Rust 按来源 ID 读取已启用来源并抓取其配置 URL；返回元数据，不返回正文 |
| `list_recoverable_runs` | 无 | 返回状态仍为 `running` 的任务 ID |
| `mark_run_interrupted` | `{ runId }` | 幂等地标记中断并写入 `APP_EXIT` |
| `get_last_successful_sync` | 无 | 返回最近成功同步检查点或 `null` |
| `set_provider_secret` | `{ providerId, value }` | 写入 Windows 原生凭据库 |
| `get_provider_secret` | `{ providerId }` | 返回秘密或 `null`；仅供安全配置层使用 |
| `delete_provider_secret` | `{ providerId }` | 幂等删除凭据 |

TypeScript 使用 camelCase，Rust 结构以 serde rename 统一。IPC 错误对用户层归一化；秘密、完整数据库路径细节和 HTTP 正文不进入可见错误。

## 7. HTTP 与快照安全

`fetch_source_snapshot` 只接受 `sourceId`，请求结构拒绝 `url`、`expectedHost` 等额外字段。Rust 只服务数据库中已配置且启用的来源，并执行以下完整链路：

1. 在 SQLite `sources` 中按 ID 查询 `enabled = 1` 的 `base_url` 和 `expected_host`；未知、未配置或禁用来源立即失败。调用方不能提交或覆盖 URL/主机。
2. 解析数据库中的 `base_url`；仅允许 `https`，禁止用户名/密码，主机名必须与数据库中的 `expected_host` 不区分大小写地相等。
3. DNS 解析主机，拒绝任何回环、私网、链路本地、未指定、IPv6 unique-local 及云元数据地址；空解析也失败。
4. 将经校验的 IP 集合固定到本次 reqwest client/请求，连接不得再次使用未验证 DNS 结果，防止检查后使用（DNS rebinding）。
5. 禁用自动重定向；因此最终 URL 不会静默跳往未经验证的主机。如后续允许重定向，每一跳必须重复解析、校验并固定。
6. 设置 20 秒超时，只接受 HTML、XHTML、纯文本、XML、RSS 和 Atom 类型。
7. 若 `Content-Length` 已超过 5 MiB，读取前拒绝；无论该头是否存在，响应均按数据块流式读取，累计字节一旦超过 `5 * 1024 * 1024` 立即停止并拒绝。不得先调用 `bytes()` 后再检查长度。
8. 成功正文计算 SHA-256、gzip 写入内容寻址路径；IPC 只返回元数据。

测试覆盖任意公网 URL 字段被拒绝、未知/禁用 sourceId、只使用数据库 URL、HTTP、主机不匹配、凭据 URL、IPv4/IPv6 私有地址、元数据地址、空 DNS、DNS 固定、禁重定向、错误 MIME、声明超限、无长度头的流式超限、边界内成功和快照去重。

## 8. 凭据与设置保存

桌面端使用 `keyring` 3 的 `windows-native` 后端，服务名为 `com.zhanlue.workbench.llm`，provider ID 仅允许非空 ASCII 字母数字和连字符。秘密只存在于 Windows Credential Manager 和进程内 `Map`，不得写入 SQLite、`dw.config.v1`、日志、快照或备份。

安全配置启动流程：

- 应用顶层 bootstrap 先完成安全配置，再启动一次情报恢复，最后渲染 React；二者均在 StrictMode 外编排。
- Tauri 桌面模式从凭据库加载已知 provider（`claude`、`openai`、`deepseek`、`zhipu`、`kimi`）。
- 遇到旧版 localStorage `apiKey` 时，只有在凭据库确认写入成功后才删除旧字段并写回脱敏配置；失败时保留原值并显示迁移失败，不造成秘密丢失。
- `loadConfig()` 在安全配置 bootstrap 完成后仍可同步读取，由内存缓存合并 API Key。
- 设置页面编辑只更新组件状态。用户点击明确的“保存”动作时，`saveConfigSecurely` 先完成凭据新增/更新/删除，再写入不含 `apiKey` 的普通配置；任一步失败都显示可见错误，不谎报成功。
- 不在每次输入、失焦或 React 渲染时自动写入凭据库。

浏览器开发模式没有原生 keyring：安全配置层使用显式的“不可持久化”适配器，返回空秘密并允许应用和非秘密设置继续运行；输入的 Key 最多保留在当前内存会话，刷新即丢失，并向用户提示桌面版才能安全保存。禁止回退到 localStorage。

桌面安全配置 bootstrap 失败时，不泄露异常详情，显示可重试的安全错误；重试成功后才继续顶层恢复和 React 渲染。浏览器 bootstrap 明确绕过原生适配器，不能因 Tauri/keyring 不存在而走失败分支，也不能把秘密持久化。

## 9. 启动恢复与失败处理

应用顶层启动时（不等待用户进入模块）：

1. 调用健康检查，按需初始化数据库。
2. 查询 `collection_runs.status = 'running'`，逐条幂等改为 `interrupted`，写入结束时间和 `APP_EXIT`。
3. 读取 `last_successful_sync`，以当前时间构造 `{ catchUpFrom, catchUpTo }`。
4. 协调器保存中断 ID 和待补采时间窗为共享快照；`App` 订阅并传给 `IntelligenceFeature`。React StrictMode 重挂载只复用同一个启动 Promise，不再执行恢复。

**本期到此结束：只记录/准备待补采时间窗，不调用 `fetch_source_snapshot`，不创建新的 collection run，不启动定时器或后台任务。** 后续采集计划必须由显式用户动作或已批准调度策略消费该时间窗。

失败恢复规则：

- 数据库初始化/迁移失败：共享状态进入 error，模块显示中文错误和重试按钮；工作台其他页面可继续使用；重试重新健康检查、惰性初始化和恢复。
- 单条中断标记失败：恢复整体失败并可重试；SQL 状态条件确保重复执行安全。
- 无成功检查点：`catchUpFrom = null`，仅表达首次同步尚未决定，不自行选取无限历史窗口。
- 快照写入失败：不返回成功元数据，也不写入指向不存在文件的记录。
- 凭据写入失败：不清除旧 localStorage 秘密、不覆盖为“已保存”，允许用户重试。
- 浏览器模式：缺少 Tauri/keyring 不是致命错误；顶层协调器仍启动一次但直接发布 `unavailable`，不调用任何 Tauri IPC，只禁用秘密持久化和 Rust 专属情报操作，并提供明确提示。

## 10. Capability 决策

`app/src-tauri/capabilities/default.json` 保持不变。现有 HTTP plugin 白名单只供既有模型提供商调用；情报来源请求由 Rust 内部 reqwest 命令执行，不依赖或扩大 WebView HTTP 权限。数据库、文件和凭据也均未通过插件 capability 暴露。验收必须比较 `79d26128baae4c43ac08b7c62948fc986e62a941..HEAD` 的 committed diff；同步远端后再比较 `origin/claude/business-project-docking-workbench-ccies1..HEAD`，不能只检查未提交工作树。若未来改为 WebView 直连或新增插件，必须另行安全评审，不能借本计划扩大权限。

## 11. 验收标准

- 既有 dashboard、新分析、报告库和设置正常；新增入口不会修改已有分析数据。
- 应用启动在 WebView 存储外创建独立 SQLite，迁移版本为 1；初始化失败后可由 UI 重试且不拖垮应用。
- 应用顶层启动恢复可标记合成的运行中记录并返回准确时间窗；StrictMode 只执行一次，同时证明没有 fetch 或创建 collection run。
- 抓取调用方只能提交 sourceId；任意 URL 字段、未知/禁用来源被拒绝，实际 URL 与 expected host 只来自 SQLite。
- HTTPS 防护拒绝不安全协议/地址/主机，连接使用已验证 DNS 固定，响应始终受流式 5 MiB 硬上限保护。
- 合法 fixture 产生一个 gzip 快照，重复内容去重，IPC 不含正文。
- 旧 Key 成功迁移后不再出现在 `dw.config.v1`；失败不丢失；显式保存和删除行为可测试。
- 浏览器模式不崩溃、不把 Key 写入 localStorage，并明确提示不持久化。
- `Cargo.lock` 已跟踪；所有 Rust 验收显示并使用 `1.77.2-x86_64-pc-windows-msvc`。Tauri capabilities 相对批准基线及同步后的远端基线均无 committed diff。
- 新模块无招聘 UI、表、采集器或文案。
- 前端测试、typecheck、build、Rust 测试和 Cargo check 全部通过。
- 手工协议、自动化 gate、桌面 smoke 或浏览器 smoke 的任一失败都阻止验收文档提交；先复现并尽可能转为自动化 RED 回归测试，做最小修复，跑 focused/full gate，再顺序复验两种 smoke 模式，直到全部为绿。

## 12. 后续计划

本基础设施通过验收后，依次另行设计和批准：

1. 企业/别名/来源维护、采集器、正文与时间提取，并明确补采窗口消费策略。
2. 主体识别、聚类、评分、证据引用和 AI 分析版本化。
3. 完整情报流、待校验区、反馈、备份恢复和发布。

任何后续阶段均继续遵守本设计的 IPC、秘密、HTTP、数据库和招聘排除边界；如需改变，先更新设计并重新评审。
