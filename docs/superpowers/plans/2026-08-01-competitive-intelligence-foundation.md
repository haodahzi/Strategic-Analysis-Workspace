# 对标企业情报基础设施 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有战略发展分析工作台中交付一个可进入、可持久化、可安全取数、可在启动时恢复任务的“对标企业情报”内部模块基础设施，不实现招聘功能，也不在本期启动采集。

**Architecture:** 模块复用 React/Vite/Tauri 外壳，业务代码位于独立 feature 目录，数据进入独立 SQLite 文件。React 只依赖 TypeScript 平台接口；SQLite、受控 HTTP、不可变快照和系统凭据由 Rust/Tauri 命令实现。数据库惰性初始化且失败可重试；启动恢复只准备补采时间窗。

**Tech Stack:** React 18、TypeScript 5.6、Vite 5、Vitest 2、Tauri 2、Rust 1.77.2、rusqlite、reqwest、keyring（Windows native）、flate2、sha2。

## Global Constraints

- 目标仓库：`haodahzi/Strategic-Analysis-Workspace`。
- 基线分支：`claude/business-project-docking-workbench-ccies1`；批准基线提交：`79d26128baae4c43ac08b7c62948fc986e62a941`。
- 功能分支：`feature/competitive-intelligence`。
- 工作台关闭后不采集；应用顶层启动时根据 SQLite 检查点准备补采时间窗，本计划不执行补采。
- 情报数据不得写入 localStorage；只允许非敏感 UI/模型偏好写入 localStorage。
- 模型 API Key 不得写入 SQLite、localStorage、日志、快照或备份。
- 首期不采集、跟踪或分析招聘岗位与招聘趋势。
- 不重构现有项目分析和报告库的持久化方式。
- React 组件不得直接调用 SQL、文件系统或任意外部 URL。
- Rust HTTP 只接受 HTTPS，拒绝本机、私网、链路本地、未指定和云元数据地址。
- 所有新增行为先写失败测试，再写最小实现；Rust 测试文件先注册到 crate，再运行目标测试确认因行为缺失而失败。
- Rust MSRV 保持 `1.77.2`；所有 Cargo check/test 验收显式使用 `+1.77.2-x86_64-pc-windows-msvc`，且命令组先打印该 toolchain 的 `rustc`/`cargo` 版本。1.85.1 仅允许用于 MSRV-aware 依赖解析和锁文件生成，不得用于实际 check/test 验收。
- `app/src-tauri/capabilities/default.json` 保持不变。

---

## 批准修订（2026-08-01）

以下内容优先于原始步骤中任何相反表述：

1. **惰性、可重试数据库初始化：** Tauri `setup` 不打开情报库；`intelligence_health` 首次调用时串行初始化。失败不得永久缓存，也不得阻止工作台启动；UI 重试会重新初始化。
2. **应用顶层只准备补采窗口：** 恢复在 `main/bootstrap` 顶层、React StrictMode 外启动一次，标记遗留运行、读取检查点并共享 `catchUpFrom/catchUpTo`；不调用 fetch、不创建新 run、不启动采集器。UI retry 会重新惰性初始化。
3. **DNS 固定与流式 5 MiB：** DNS 校验通过后把批准 IP 固定到本次 reqwest client；禁用重定向；正文逐块读取，累计超过 `5 * 1024 * 1024` 立即中止，不能先完整读取再检查。
4. **Windows 原生凭据与浏览器安全行为：** `keyring` 只启用 `windows-native`；浏览器模式不调用 Tauri 凭据命令、不崩溃、不回退到 localStorage，秘密仅可留在当前内存会话。
5. **显式安全保存：** 设置输入只更新本地状态；仅用户点击保存时调用 `saveConfigSecurely`，等待凭据写入/删除成功后再保存脱敏配置，并显示失败。
6. **完整 Rust/HTTP TDD：** 先注册模块/测试，再验证失败；覆盖初始化重试、迁移幂等、命令健康信息、DNS 固定、地址拒绝、MIME、重定向与有/无 Content-Length 的流式上限。
7. **锁文件：** `Cargo.lock` 自 Task 3 首次解析数据库依赖起纳入提交，并在后续 Rust 任务持续更新；不得删除或忽略。
8. **capabilities 不变：** 情报请求由 Rust reqwest 完成，数据库/文件/keyring 也由 Rust 内部命令封装，不需要扩大 WebView 权限；验收必须比较批准提交到 HEAD 的 committed diff，同步后再比较远端基线到 HEAD。
9. **sourceId-only 抓取：** IPC 只接收 `sourceId`；Rust 从 SQLite `sources` 读取已启用来源的 `base_url` 和 `expected_host`。调用方提交任意 URL、未知或禁用来源均失败。

## Scope decomposition

本计划是四段路线的第一段：

1. 本计划：外壳接入、SQLite、受控 HTTP、快照、凭据和启动恢复。
2. 后续计划：企业/别名/来源维护、采集器、正文与时间提取。
3. 后续计划：主体识别、聚类、评分、证据和 AI 分析。
4. 后续计划：完整情报流、待校验区、反馈、备份恢复和发布。

只有本计划通过完整回归验收后，才编写和执行第 2 段；本计划预留数据结构不等于启用采集。

## File map

### Create

- `app/src/features/intelligence/index.ts`
- `app/src/features/intelligence/IntelligenceFeature.tsx`
- `app/src/features/intelligence/IntelligenceFeature.test.tsx`
- `app/src/features/intelligence/domain/platform.ts`
- `app/src/features/intelligence/infrastructure/tauriPlatform.ts`
- `app/src/features/intelligence/infrastructure/tauriPlatform.test.ts`
- `app/src/features/intelligence/application/startupRecovery.ts`
- `app/src/features/intelligence/application/startupRecovery.test.ts`
- `app/src/features/intelligence/application/intelligenceBoot.ts`
- `app/src/features/intelligence/application/intelligenceBoot.test.ts`
- `app/src/bootstrap.tsx`
- `app/src/bootstrap.test.tsx`
- `app/src/App.test.tsx`
- `app/src/features/intelligence/infrastructure/secureConfig.ts`
- `app/src/features/intelligence/infrastructure/secureConfig.test.ts`
- `app/src/features/intelligence/styles.css`
- `app/src-tauri/migrations/intelligence/001_initial.sql`
- `app/src-tauri/src/intelligence/mod.rs`
- `app/src-tauri/src/intelligence/database.rs`
- `app/src-tauri/src/intelligence/fetch.rs`
- `app/src-tauri/src/intelligence/snapshot.rs`
- `app/src-tauri/src/intelligence/secrets.rs`
- `docs/testing/competitive-intelligence-foundation.md`

### Modify

- `app/src/App.tsx`
- `app/src/main.tsx`
- `app/src/config/store.ts`
- `app/src/config/store.test.ts`
- `app/src/components/Settings.tsx`
- `app/src-tauri/Cargo.toml`
- `app/src-tauri/Cargo.lock`
- `app/src-tauri/src/lib.rs`

### Explicitly unchanged

- `app/src-tauri/capabilities/default.json`：不新增 HTTP、文件、数据库或凭据权限；Task 8 比较批准基线/同步后远端基线到 HEAD 的 committed diff。
- 现有项目分析和报告库的数据文件与持久化逻辑。

---

### Task 1: Establish the isolated worktree and capture the clean baseline

**Files:**

- Create: `docs/superpowers/specs/2026-08-01-competitive-intelligence-module-design.md`
- Create: `docs/superpowers/plans/2026-08-01-competitive-intelligence-foundation.md`
- No product files changed.

**Interfaces:**

- Consumes: approved base and amendments.
- Produces: isolated `feature/competitive-intelligence` worktree, clean baseline evidence, and one documentation-only commit.

- [ ] **Step 1: Clone the approved repository baseline when executing from scratch**

Run from `D:\工作文档\AI相关\对标企业情报功能`:

```powershell
git clone --filter=blob:none --branch "claude/business-project-docking-workbench-ccies1" https://github.com/haodahzi/Strategic-Analysis-Workspace.git Strategic-Analysis-Workspace
git -C Strategic-Analysis-Workspace fetch origin
git -C Strategic-Analysis-Workspace remote show origin
```

Expected: clone completes with normal HTTPS/TLS validation, origin is `haodahzi/Strategic-Analysis-Workspace`, the remote default branch has been inspected, and the approved base branch still exists. If HTTPS validation fails or the remote default/base changed, stop for review; do not weaken certificate or revocation checks.

- [ ] **Step 2: Create and verify the isolated feature worktree**

```powershell
git -C Strategic-Analysis-Workspace worktree add ..\Strategic-Analysis-Workspace-intelligence -b feature/competitive-intelligence "origin/claude/business-project-docking-workbench-ccies1"
git -C ..\Strategic-Analysis-Workspace-intelligence branch --show-current
git -C ..\Strategic-Analysis-Workspace-intelligence rev-parse HEAD
git -C ..\Strategic-Analysis-Workspace-intelligence status --short
```

Expected: branch is `feature/competitive-intelligence`, starting commit is the approved base `79d2612...`, and the new worktree is clean.

For an already prepared controller-owned worktree, do not clone or add another worktree; verify the same facts in place:

```powershell
git remote -v
git branch --show-current
git rev-parse HEAD
git status --short
```

Expected: repository is `haodahzi/Strategic-Analysis-Workspace`, branch is `feature/competitive-intelligence`, the starting base is `79d2612...`, and only controller-owned task metadata may be untracked.

- [ ] **Step 3: Record the untouched baseline**

Run from `app`:

```powershell
npm ci
npm test
npm run typecheck
npm run build
rustc +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc check --manifest-path src-tauri/Cargo.toml
```

Expected: existing tests pass, typecheck/build exit 0, and Cargo check passes under Rust 1.77.2/MSVC.

- [ ] **Step 4: Add the approved design and plan with apply_patch**

Create exactly the two docs named above. Confirm the plan contains all eight tasks and this approved-amendments section. Do not create product files in this task.

- [ ] **Step 5: Commit only the documents**

```powershell
git add docs/superpowers/specs/2026-08-01-competitive-intelligence-module-design.md docs/superpowers/plans/2026-08-01-competitive-intelligence-foundation.md
git diff --cached --check
git diff --cached --name-only
git commit -m "docs: add competitive intelligence design and foundation plan"
```

Expected: exactly two Markdown files in one documentation-only commit.

---

### Task 2: Add the isolated navigation shell

**Files:**

- Create: `app/src/features/intelligence/IntelligenceFeature.tsx`
- Create: `app/src/features/intelligence/IntelligenceFeature.test.tsx`
- Create: `app/src/features/intelligence/index.ts`
- Create: `app/src/features/intelligence/styles.css`
- Create: `app/src/App.test.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/main.tsx`

**Interfaces:**

- Consumes: existing `App` view state and navigation helper.
- Produces: `IntelligenceFeature` and top-level view value `intelligence`.

- [ ] **Step 1: Write and run the failing shell test**

The test renders `<IntelligenceFeature status="initializing" onRetry={...} />` and asserts `对标企业情报` plus `正在检查本地数据`; it separately renders `error` and asserts an alert and retry button.

```powershell
npx vitest run src/features/intelligence/IntelligenceFeature.test.tsx
```

Expected: FAIL because the feature component is not registered yet.

- [ ] **Step 2: Write and run the failing App navigation integration test**

In `App.test.tsx`, render the application with deterministic window/storage stubs. Assert the top-level navigation contains `对标企业情报`; render with `?view=intelligence` and assert the module title is in the App output while existing dashboard/report/settings labels remain. This is an App integration test, not another isolated feature test.

```powershell
npx vitest run src/App.test.tsx
```

Expected: FAIL because the App `View` union, navigation item and render branch do not contain `intelligence`.

- [ ] **Step 3: Implement the minimal isolated shell**

Define `IntelligenceBootStatus = "initializing" | "ready" | "error"`; render initialization, retryable Chinese error, and ready copy `本地情报库已就绪，尚未执行首次同步。` Use only `.intel-*` CSS classes. Export through `index.ts`.

- [ ] **Step 4: Register navigation without touching existing persistence**

Extend the existing `View` union with `intelligence`, add `◉ 对标企业情报` after report navigation, render the feature, and import its scoped stylesheet from `main.tsx`.

- [ ] **Step 5: Verify and commit**

```powershell
npx vitest run src/features/intelligence/IntelligenceFeature.test.tsx
npx vitest run src/App.test.tsx
npm test
npm run typecheck
git add app/src/App.tsx app/src/main.tsx app/src/features/intelligence
git commit -m "feat(intelligence): add isolated workspace shell"
```

Expected: focused and regression tests pass; existing views retain behavior.

---

### Task 3: Create the independent SQLite schema and retryable health command

**Files:**

- Create: `app/src-tauri/migrations/intelligence/001_initial.sql`
- Create: `app/src-tauri/src/intelligence/mod.rs`
- Create: `app/src-tauri/src/intelligence/database.rs`
- Modify: `app/src-tauri/Cargo.toml`
- Modify: `app/src-tauri/Cargo.lock`
- Modify: `app/src-tauri/src/lib.rs`

**Interfaces:**

- Consumes: `AppHandle` and application data directory.
- Produces: lazy database state and `intelligence_health -> IntelligenceHealth { ready, schemaVersion, dataDir }`.

- [ ] **Step 1: Add pinned-compatible database dependencies and track the lock**

Add `rusqlite = { version = "0.32", features = ["bundled"] }`, `chrono = { version = "0.4", features = ["serde"] }`, and `thiserror = "2"`. Keep the generated `app/src-tauri/Cargo.lock` in this task. If dependency resolution needs Cargo 1.85.1's MSRV-aware resolver, use it only to generate/update the lock, then perform every check/test below with 1.77.2.

```powershell
rustc +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc check --manifest-path src-tauri/Cargo.toml
git status --short src-tauri/Cargo.toml src-tauri/Cargo.lock
```

Expected: both manifest and lock are tracked changes; dependency selection honors MSRV.

- [ ] **Step 2: Register the module, then write failing Rust tests**

Add `mod intelligence;` to `lib.rs`, `pub mod database;` to `intelligence/mod.rs`, and create `database.rs` tests named:

- `migration_creates_core_tables`
- `migration_is_idempotent_and_records_version_one`
- `failed_initialization_can_be_retried`
- `health_reports_schema_version_and_data_directory`
- `concurrent_health_calls_share_one_initialization`

Use a temp path/in-memory connection and an injectable open/migrate helper for deterministic failure. The concurrency test launches two health calls against one state, blocks the first initializer with a barrier, then asserts the open/migrate counter is exactly one and both callers receive the same ready state. Do not implement the migration/init body before the failure run.

```powershell
rustc +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc test --manifest-path src-tauri/Cargo.toml intelligence::database::tests
```

Expected: tests are discovered and FAIL for missing schema/initialization behavior; the concurrency test specifically fails because duplicate initialization is not yet deduplicated, rather than because the module is absent.

- [ ] **Step 3: Add schema version 1**

`001_initial.sql` enables WAL, foreign keys and 5000 ms busy timeout; creates `schema_migrations`, `business_units`, `companies`, `company_business_units`, `company_aliases`, `sources`, `collection_runs`, `raw_documents`, `events`, `event_sources`, `evidence_spans`, `event_analysis_versions`, `app_checkpoints`, `read_states`, `bookmarks`, `feedback`, and `intelligence_fts`; inserts migration version 1 with `INSERT OR IGNORE`.

- [ ] **Step 4: Implement lazy/retryable initialization**

Store an optional ready connection behind synchronization plus a separate initialization mutex. `intelligence_health` performs double-checked initialization: create `intelligence/snapshots` and `intelligence/backups`, open `competitive-intelligence.db`, migrate, then publish the connection. On any error, publish nothing and return an error, so the next call retries. Tauri `setup` only manages the uninitialized state and never fails because the intelligence database is unavailable.

- [ ] **Step 5: Register health only after its tests compile and pass**

Add `intelligence::intelligence_health` to `generate_handler!`. Verify command serialization uses camelCase and that concurrent health calls cannot run two migrations at once.

```powershell
rustc +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc test --manifest-path src-tauri/Cargo.toml intelligence::database
cargo +1.77.2-x86_64-pc-windows-msvc test --manifest-path src-tauri/Cargo.toml intelligence::tests
cargo +1.77.2-x86_64-pc-windows-msvc check --manifest-path src-tauri/Cargo.toml
git -C .. diff --exit-code 79d26128baae4c43ac08b7c62948fc986e62a941..HEAD -- app/src-tauri/capabilities/default.json
```

Expected: PASS; initialization failure test succeeds on its second attempt; concurrent callers initialize once; committed capability diff from the approved baseline is empty.

- [ ] **Step 6: Commit database, registration and lock together**

```powershell
git add app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock app/src-tauri/migrations/intelligence app/src-tauri/src/intelligence app/src-tauri/src/lib.rs
git commit -m "feat(intelligence): add isolated SQLite foundation"
```

- [ ] **Step 7: Verify the committed capability boundary against the approved baseline**

```powershell
git -C .. diff --exit-code 79d26128baae4c43ac08b7c62948fc986e62a941..HEAD -- app/src-tauri/capabilities/default.json
```

Expected: exit 0, proving no committed capability change from the approved baseline through this task.

---

### Task 4: Add DNS-pinned HTTPS fetching and immutable snapshots

**Files:**

- Create: `app/src-tauri/src/intelligence/fetch.rs`
- Create: `app/src-tauri/src/intelligence/snapshot.rs`
- Modify: `app/src-tauri/src/intelligence/mod.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src-tauri/Cargo.toml`
- Modify: `app/src-tauri/Cargo.lock`

**Interfaces:**

- Consumes: `FetchSourceRequest { sourceId }` only; unknown fields are rejected.
- Produces: `fetch_source_snapshot -> FetchSourceResult { finalUrl, status, contentType, contentHash, snapshotPath, fetchedAt }`.

- [ ] **Step 1: Add HTTP/snapshot dependencies**

Use reqwest with rustls, charset and streaming support; add tokio net, url, sha2, flate2, and hex. Keep default redirect behavior disabled in the implementation and update the tracked lock.

- [ ] **Step 2: Register modules before writing the failing tests**

Declare `pub mod fetch; pub mod snapshot;` and create tests for:

- request deserialization rejects caller-supplied `url`/`expectedHost` even when the URL is public;
- an unknown sourceId and a disabled source row are rejected before DNS/network access;
- an enabled source uses exactly its SQLite `base_url` and `expected_host`;
- rejection of `http`, embedded credentials, wrong host, empty DNS, loopback/private/link-local/unspecified/metadata IPv4 and IPv6;
- acceptance of public HTTPS on the expected host;
- resolver-approved addresses being installed into the request client (DNS pinning);
- redirects not being followed;
- accepted MIME set and rejection of other types;
- declared `Content-Length > 5 MiB` rejected before body consumption;
- chunked/no-length response crossing 5 MiB stopped during streaming;
- exactly-at-limit response accepted;
- duplicate snapshot bytes yielding one SHA-256 gzip path.

Use a local test server only as a byte-stream fixture; inject its socket as an already approved endpoint so production address policy itself is tested separately.

```powershell
rustc +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc test --manifest-path src-tauri/Cargo.toml intelligence::fetch::tests
cargo +1.77.2-x86_64-pc-windows-msvc test --manifest-path src-tauri/Cargo.toml intelligence::snapshot::tests
```

Expected: tests are discovered and FAIL because source lookup, arbitrary-URL rejection, validation, pinning, streaming and snapshot functions are not implemented.

- [ ] **Step 3: Implement the sourceId-only command boundary**

Define the only request shape as:

```rust
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FetchSourceRequest {
    pub source_id: String,
}
```

Under the database lock, query `SELECT base_url, expected_host FROM sources WHERE id = ?1 AND enabled = 1`. Return a stable error before network access when no row exists. The public command must not accept a URL or host argument; an enabled row's configured URL is the sole fetch target.

- [ ] **Step 4: Implement URL/address validation and DNS pinning**

Parse the database `base_url` only, reject non-HTTPS/credentials, require its host to match the database `expected_host`, resolve with tokio, reject if the set is empty or contains a blocked address, then configure the reqwest client to resolve that host to the validated socket address set. The connection must use this pinned set; it must not perform a second unvalidated DNS lookup. Disable redirects and set a 20-second timeout.

- [ ] **Step 5: Implement streaming 5 MiB enforcement**

Set `MAX_BODY_BYTES = 5 * 1024 * 1024`. Reject a larger Content-Length immediately. Iterate response chunks, check `accumulated + chunk.len()` before extending the buffer, abort on overflow, and never call an API that buffers the entire body first. Accept only `text/html`, `application/xhtml+xml`, `text/plain`, `application/xml`, `application/rss+xml`, and `application/atom+xml` (ignoring MIME parameters).

- [ ] **Step 6: Implement immutable gzip snapshots and metadata-only IPC**

Hash successful bytes with SHA-256 and store once at `snapshots/<hash>.html.gz`; ensure the directory exists and do not overwrite an existing content-addressed file. Return only URL/status/type/hash/path/time. Never serialize the response body.

- [ ] **Step 7: Register the command after unit/integration tests pass**

```powershell
rustc +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc test --manifest-path src-tauri/Cargo.toml intelligence::fetch
cargo +1.77.2-x86_64-pc-windows-msvc test --manifest-path src-tauri/Cargo.toml intelligence::snapshot
cargo +1.77.2-x86_64-pc-windows-msvc test --manifest-path src-tauri/Cargo.toml intelligence
cargo +1.77.2-x86_64-pc-windows-msvc check --manifest-path src-tauri/Cargo.toml
git -C .. diff --exit-code 79d26128baae4c43ac08b7c62948fc986e62a941..HEAD -- app/src-tauri/capabilities/default.json
```

Expected: all PASS, including DNS-pin and chunked-over-limit tests; capability diff remains empty.

- [ ] **Step 8: Commit and verify the committed capability boundary**

```powershell
git add app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock app/src-tauri/src/intelligence app/src-tauri/src/lib.rs
git commit -m "feat(intelligence): add secure source snapshots"
git -C .. diff --exit-code 79d26128baae4c43ac08b7c62948fc986e62a941..HEAD -- app/src-tauri/capabilities/default.json
```

---

### Task 5: Add typed TypeScript platform adapters

**Files:**

- Create: `app/src/features/intelligence/domain/platform.ts`
- Create: `app/src/features/intelligence/infrastructure/tauriPlatform.ts`
- Create: `app/src/features/intelligence/infrastructure/tauriPlatform.test.ts`

**Interfaces:**

- Produces: `IntelligencePlatform` with health and snapshot methods.
- Consumes: fixed Tauri command names from Tasks 3 and 4.

- [ ] **Step 1: Write the failing adapter test**

Use an injected `invoke` mock and assert exact command/argument mapping:

```ts
health()                                  -> invoke("intelligence_health")
fetchSnapshot({ sourceId: "source-1" })    -> invoke("fetch_source_snapshot", { request: { sourceId: "source-1" } })
```

Also make the type-level fixture use `FetchSnapshotRequest = { sourceId: string }`; no `url` or `expectedHost` property exists. The mock asserts an arbitrary URL never crosses IPC.

```powershell
npx vitest run src/features/intelligence/infrastructure/tauriPlatform.test.ts
```

Expected: FAIL because the platform files do not exist.

- [ ] **Step 2: Define complete domain types**

Define `IntelligenceHealth`, `FetchSnapshotRequest`, `FetchSnapshotResult`, and `IntelligencePlatform`. Preserve camelCase and `Promise<string | null>` for the checkpoint.

- [ ] **Step 3: Implement the adapter and verify**

Default to `@tauri-apps/api/core.invoke`, but keep the invoke function injectable for browser-independent tests. Components consume the interface, never the Tauri import.

```powershell
npx vitest run src/features/intelligence/infrastructure/tauriPlatform.test.ts
npm run typecheck
git add app/src/features/intelligence
git commit -m "feat(intelligence): add typed Tauri platform bridge"
```

Expected: PASS and one focused commit.

---

### Task 6: Persist recovery checkpoints and prepare the catch-up window

**Files:**

- Create: `app/src/features/intelligence/application/startupRecovery.ts`
- Create: `app/src/features/intelligence/application/startupRecovery.test.ts`
- Create: `app/src/features/intelligence/application/intelligenceBoot.ts`
- Create: `app/src/features/intelligence/application/intelligenceBoot.test.ts`
- Create: `app/src/bootstrap.tsx`
- Create: `app/src/bootstrap.test.tsx`
- Modify: `app/src-tauri/src/intelligence/database.rs`
- Modify: `app/src-tauri/src/intelligence/mod.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src/main.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/App.test.tsx`
- Modify: `app/src/features/intelligence/IntelligenceFeature.tsx`
- Modify: `app/src/features/intelligence/IntelligenceFeature.test.tsx`
- Modify: `app/src/features/intelligence/domain/platform.ts`
- Modify: `app/src/features/intelligence/infrastructure/tauriPlatform.ts`
- Modify: `app/src/features/intelligence/infrastructure/tauriPlatform.test.ts`

**Interfaces:**

- Produces: `recoverOnStartup(platform, now): Promise<StartupRecovery>`.
- Adds: `list_recoverable_runs`, `mark_run_interrupted`, `get_last_successful_sync`.
- Extends `IntelligencePlatform` and `tauriPlatform` with exact mappings:
  `listRecoverableRuns() -> list_recoverable_runs`,
  `markRunInterrupted(runId) -> mark_run_interrupted { runId }`, and
  `getLastSuccessfulSync() -> get_last_successful_sync`.
- Produces one application-scoped `IntelligenceBootCoordinator` whose snapshot is subscribed by `App` and passed to `IntelligenceFeature`.
- `bootstrapApplication` starts that coordinator before React render and outside `React.StrictMode`.

- [ ] **Step 1: Write failing recovery tests**

Test that two running IDs are each marked interrupted, the last checkpoint becomes `catchUpFrom`, injected `now` becomes `catchUpTo`, and no platform fetch/collection method is called. Also test `null` checkpoint and retry after health failure.

```powershell
npx vitest run src/features/intelligence/application/startupRecovery.test.ts
```

Expected: FAIL because recovery is missing. The no-collection assertion must fail if the implementation calls `fetchSnapshot` or any injected `createCollectionRun` spy.

- [ ] **Step 2: Write failing application-top-level boot and StrictMode tests**

In `intelligenceBoot.test.ts`, use an injected `recoverOnStartup` spy and verify:

- two concurrent/repeated `start()` calls return the same in-flight promise and invoke recovery once;
- a completed start remains one-shot when the same coordinator is reused across simulated StrictMode unmount/remount;
- an error snapshot can call `retry()`, which performs a new health/recovery attempt and publishes ready;
- subscribers see the same `initializing/error/ready` snapshot that the feature receives.
- a browser coordinator's single `start()` publishes `unavailable` without invoking any Tauri recovery/fetch command.

In `bootstrap.test.tsx`, inject coordinator and render callbacks; assert bootstrap calls `coordinator.start()` before rendering `<React.StrictMode><App intelligenceBoot={coordinator} /></React.StrictMode>`, even when the initial view is dashboard. StrictMode render must not own or repeat the start side effect.

In `App.test.tsx`/`IntelligenceFeature.test.tsx`, assert App passes the shared error state and retry callback to the feature; clicking/calling retry invokes the coordinator, enabling another lazy database initialization.

```powershell
npx vitest run src/features/intelligence/application/intelligenceBoot.test.ts src/bootstrap.test.tsx src/App.test.tsx src/features/intelligence/IntelligenceFeature.test.tsx
```

Expected: FAIL because there is no application-scoped coordinator/bootstrap integration, StrictMode guard, shared snapshot, or wired retry.

- [ ] **Step 3: Register Rust command tests before implementation**

Add test-only calls against a migrated temp database for the exact SQL semantics:

```sql
SELECT id FROM collection_runs WHERE status = 'running';

UPDATE collection_runs
SET status = 'interrupted',
    finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    error_code = 'APP_EXIT'
WHERE id = ?1 AND status = 'running';

SELECT checkpoint_value FROM app_checkpoints
WHERE checkpoint_key = 'last_successful_sync';
```

Register command symbols in the intelligence module so tests compile and are discovered, then run:

```powershell
rustc +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc test --manifest-path src-tauri/Cargo.toml intelligence::database::tests::recovery
```

Expected: FAIL for missing command/query behavior; a second mark of the same ID must ultimately be harmless.

- [ ] **Step 4: Implement database commands and pure TypeScript recovery**

`recoverOnStartup` calls health, lists abandoned runs, marks each interrupted, reads the checkpoint, and returns:

```ts
interface StartupRecovery {
  interruptedRunIds: string[];
  catchUpFrom: string | null;
  catchUpTo: string;
}
```

It does not call `fetchSnapshot`, does not create a run, and does not start timers/background work. Register the three commands only after their Rust tests pass.

- [ ] **Step 5: Implement application-scoped startup coordination**

Create a coordinator outside React component lifecycle with `start()`, `retry()`, `subscribe()` and `getSnapshot()`. `start()` deduplicates its promise and is one-shot after success; `retry()` is allowed from error and calls recovery again. `bootstrapApplication` invokes `start()` once before `ReactDOM.createRoot(...).render(<React.StrictMode>...)`; therefore StrictMode cannot duplicate recovery. `App` uses `useSyncExternalStore` on the injected application singleton and passes its snapshot/retry to `IntelligenceFeature` regardless of current view. The desktop feature displays shared `initializing | ready | error`; retry reruns health/lazy init. Extend the status with `unavailable` for browser mode; its coordinator starts once, performs zero Tauri calls and displays the desktop-required message.

- [ ] **Step 6: Verify top-level once-only recovery, no collection, Rust MSRV and commit**

```powershell
npx vitest run src/features/intelligence/application/startupRecovery.test.ts
npx vitest run src/features/intelligence/application/intelligenceBoot.test.ts src/bootstrap.test.tsx src/App.test.tsx src/features/intelligence/IntelligenceFeature.test.tsx
npm test
npm run typecheck
rustc +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc test --manifest-path src-tauri/Cargo.toml intelligence
cargo +1.77.2-x86_64-pc-windows-msvc check --manifest-path src-tauri/Cargo.toml
git -C .. diff --exit-code 79d26128baae4c43ac08b7c62948fc986e62a941..HEAD -- app/src-tauri/capabilities/default.json
git add app/src/features/intelligence app/src-tauri
git add app/src/bootstrap.tsx app/src/bootstrap.test.tsx app/src/App.tsx app/src/App.test.tsx app/src/main.tsx
git commit -m "feat(intelligence): prepare interrupted work recovery"
git -C .. diff --exit-code 79d26128baae4c43ac08b7c62948fc986e62a941..HEAD -- app/src-tauri/capabilities/default.json
```

Expected: all PASS under the printed 1.77.2 MSVC toolchain; tests prove application startup recovers before feature navigation, StrictMode invokes recovery once, UI retry performs a new lazy initialization, and fetch/create-run spies remain at zero. The committed capability comparison exits 0.

---

### Task 7: Move provider API keys to Windows native credential storage

**Files:**

- Create: `app/src-tauri/src/intelligence/secrets.rs`
- Create: `app/src/features/intelligence/infrastructure/secureConfig.ts`
- Create: `app/src/features/intelligence/infrastructure/secureConfig.test.ts`
- Create: `app/src/components/Settings.test.tsx`
- Modify: `app/src/bootstrap.tsx`
- Modify: `app/src/bootstrap.test.tsx`
- Modify: `app/src-tauri/src/intelligence/mod.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src/config/store.ts`
- Modify: `app/src/config/store.test.ts`
- Modify: `app/src/components/Settings.tsx`
- Modify: `app/src/main.tsx`
- Modify: `app/package.json`
- Modify: `app/package-lock.json`
- Modify: `app/src-tauri/Cargo.toml`
- Modify: `app/src-tauri/Cargo.lock`

**Interfaces:**

- Produces: `set_provider_secret`, `get_provider_secret`, `delete_provider_secret`.
- Produces: `bootstrapSecureConfig`, `saveConfigSecurely`, `getCachedSecret` and desktop/browser secret-store adapters.
- Preserves: synchronous `loadConfig()` after bootstrap through an in-memory cache.

- [ ] **Step 1: Configure only the Windows native keyring backend**

Add:

```toml
keyring = { version = "3", default-features = false, features = ["windows-native"] }
```

Update the tracked lock. Add exact dev test dependencies `@testing-library/react@16.3.0` and `jsdom@26.1.0` for Settings interaction RED tests. Rust compatibility is accepted only by the 1.77.2 commands below; a 1.85.1 resolver may update the lock but may not run check/test.

- [ ] **Step 2: Register secret module and write failing Rust tests**

Test provider validation (non-empty ASCII alphanumeric/hyphen), `NoEntry -> None`, idempotent delete, and backend errors mapped without secret values. Abstract the keyring operations behind a small trait/fake so tests never touch the real user credential store.

```powershell
rustc +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc test --manifest-path src-tauri/Cargo.toml intelligence::secrets::tests
```

Expected: tests are discovered and FAIL because command behavior is missing.

- [ ] **Step 3: Write failing secure-config, bootstrap and Settings tests**

Cover these exact cases:

- successful legacy migration writes keyring first, then removes `apiKey` from `dw.config.v1`;
- failed keyring migration does not erase the legacy key;
- explicit save writes/deletes all changed secrets, then persists only redacted provider config;
- failed explicit save reports failure and does not claim/persist a successful redacted state;
- browser adapter returns no persisted secret, never calls Tauri, never writes Key to localStorage, and exposes a “desktop required for secure persistence” state.
- native bootstrap first fails safely, renders no exception details, and its retry calls native bootstrap again before rendering the App;
- browser bootstrap bypasses native secret and intelligence Tauri calls, renders the App with intelligence status `unavailable`, and never persists a Key even when the native adapter would throw;

In `Settings.test.tsx` under jsdom, inject `saveConfigSecurely`, type into Key/base/model fields and assert zero writes before clicking the explicit save button. Click save and assert one awaited call with the draft; test a rejected save keeps the draft and renders a safe visible error; test blank Key causes delete only after save.

```powershell
npx vitest run src/features/intelligence/infrastructure/secureConfig.test.ts
npx vitest run src/config/store.test.ts
npx vitest run src/bootstrap.test.tsx src/components/Settings.test.tsx
```

Expected: FAIL before the secure layer, retryable native/browser bootstrap controller, explicit save button and deferred Settings persistence are implemented.

- [ ] **Step 4: Implement native commands and in-memory cache**

Use service `com.zhanlue.workbench.llm`; register get/set/delete commands. Load known IDs `claude`, `openai`, `deepseek`, `zhipu`, `kimi`. Never log secret values. Migration removes legacy data only after confirmed native write.

- [ ] **Step 5: Preserve synchronous config reads with redacted persistence**

`loadConfig()` merges `getCachedSecret(providerId)` after bootstrap. Ordinary config serialization always omits `apiKey`. In browser mode, the cache can hold a value for the current session only; refresh loses it and no localStorage fallback exists.

- [ ] **Step 6: Make settings saving explicit**

Change Settings so form edits call only `setCfg`. The user’s save button awaits `saveConfigSecurely(cfg)`; on success show confirmation, and on error keep edits plus a visible safe error. Blank Key means delete on explicit save. Do not persist on keystroke, blur or render.

- [ ] **Step 7: Bootstrap safely in desktop and browser modes**

Extend `bootstrapApplication` so secure config finishes before the intelligence coordinator starts and before React render. Choose the native adapter only when Tauri is available; otherwise choose the non-persistent browser adapter and continue rendering. A native bootstrap failure renders a small safe error with retry, without exception bodies that may contain platform details; retry reruns native bootstrap and then the normal top-level sequence. Browser mode never invokes the native adapter and never writes Key material to localStorage.

- [ ] **Step 8: Verify and commit**

```powershell
npx vitest run src/features/intelligence/infrastructure/secureConfig.test.ts
npx vitest run src/config/store.test.ts
npx vitest run src/bootstrap.test.tsx src/components/Settings.test.tsx
npm test
npm run typecheck
rustc +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc test --manifest-path src-tauri/Cargo.toml intelligence::secrets
cargo +1.77.2-x86_64-pc-windows-msvc check --manifest-path src-tauri/Cargo.toml
rg -n "apiKey.*localStorage|localStorage.*apiKey" src
git -C .. diff --exit-code 79d26128baae4c43ac08b7c62948fc986e62a941..HEAD -- app/src-tauri/capabilities/default.json
```

Expected: tests/checks pass; grep finds no intentional Key persistence; capabilities remain unchanged.

```powershell
git add app/src app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock app/src-tauri/src
git add app/package.json app/package-lock.json
git commit -m "security: move model keys to OS credential storage"
git -C .. diff --exit-code 79d26128baae4c43ac08b7c62948fc986e62a941..HEAD -- app/src-tauri/capabilities/default.json
```

---

### Task 8: Run the foundation acceptance gate

**Files:**

- Add: `docs/testing/competitive-intelligence-foundation.md`
- Modify: only files required by a demonstrated acceptance failure.

**Interfaces:**

- Consumes: Tasks 1–7.
- Produces: verified foundation ready for a separately approved source-collection plan.

- [ ] **Step 1: Write the manual protocol**

Record and execute:

1. Dashboard、新分析、报告库和设置正常打开。
2. “对标企业情报”打开时不改变已有分析。
3. 应用启动（仍停留 dashboard、未进入模块）即在 WebView 存储外创建 `competitive-intelligence.db` 并执行一次恢复；StrictMode 下仍只有一次。
4. 强制首次初始化失败后，其他页面仍可用；模块共享 error 状态，点击重试后重新惰性初始化成功。
5. 合成 `running` 记录在重启后变为 `interrupted`，UI 得到补采窗口，fetch 与 create-collection-run fixture 均记录零调用。
6. IPC 任意公网 URL 字段、未知/禁用 sourceId 被拒绝；已启用来源只抓 SQLite 配置 URL。HTTP 地址策略与 DNS 固定测试通过。
7. 无 Content-Length 的响应超过 5 MiB 时流式中止；合法 fixture 只保存一个 gzip 快照且 IPC 只有元数据。
8. 旧 Key 成功迁移一次并从 `dw.config.v1` 消失；迁移失败不丢 Key；显式保存/删除可见且浏览器刷新不持久化。
9. 没有招聘 UI、表、collector 或新增文案。
10. `Cargo.lock` 被跟踪；Rust 1.77.2 MSVC 完成所有 check/test；`default.json` 相对批准基线无 committed diff。

- [ ] **Step 2: Run the complete automated gate**

Run from `app`:

```powershell
npm ci
npm test
npm run typecheck
npm run build
rustc +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc --version
cargo +1.77.2-x86_64-pc-windows-msvc test --manifest-path src-tauri/Cargo.toml
cargo +1.77.2-x86_64-pc-windows-msvc check --manifest-path src-tauri/Cargo.toml
rg -n "招聘|岗位|recruitment" src src-tauri
git ls-files src-tauri/Cargo.lock
git -C .. diff --exit-code 79d26128baae4c43ac08b7c62948fc986e62a941..HEAD -- app/src-tauri/capabilities/default.json
```

Expected: printed `rustc`/`cargo` are exactly 1.77.2 MSVC; automated commands exit 0; Cargo.lock is printed as tracked; committed capability diff from the approved baseline is empty. Review grep matches by path: the new module must have none, and pre-existing matches outside it are documented rather than deleted mechanically.

- [ ] **Step 3: Run the desktop and browser smoke tests**

In terminal A, run desktop mode:

```powershell
npm run tauri dev
```

Expected desktop behavior: all navigation works, the intelligence entry reaches ready, retry works, Windows-native secret save succeeds, and no console error appears.

Stop terminal A's desktop dev process completely with `Ctrl+C` and confirm it exits. Only then, in a separate terminal B, run browser mode:

```powershell
npm run dev
```

Expected browser behavior: app starts without Tauri/keyring, non-secret functions work, secret persistence is clearly unavailable, and no Key is written to localStorage. Do not run desktop and browser smoke servers concurrently on the same configured port.

- [ ] **Step 4: Commit verification documentation**

```powershell
git add docs/testing/competitive-intelligence-foundation.md
git commit -m "test: document intelligence foundation acceptance"
```

- [ ] **Step 5: Synchronize and repeat the gate after conflicts**

```powershell
git fetch origin
git rebase "origin/claude/business-project-docking-workbench-ccies1"
git -C .. diff --exit-code "origin/claude/business-project-docking-workbench-ccies1"..HEAD -- app/src-tauri/capabilities/default.json
```

Resolve only genuine conflicts. The final command must exit 0, proving the committed capability boundary against the newly fetched remote base. If the rebase changes the tree, rerun Step 2 with the remote-base capability command substituted for the fixed approved hash, then rerun both smoke modes sequentially.

- [ ] **Step 6: Push when repository write permission is available**

```powershell
git push -u origin feature/competitive-intelligence
```

Expected: remote feature branch is created without changing the default branch.

- [ ] **Step 7: Open a draft PR**

Title: `feat: add competitive intelligence foundation`

The body lists delivered scope, explicit recruitment exclusion, database location/migration version, lazy retry behavior, “prepare only/no collection” recovery behavior, DNS pin plus streaming limit, Windows/browser secret behavior, unchanged capabilities, test results, and remaining follow-up plans. Target `claude/business-project-docking-workbench-ccies1`.

---

## Plan self-review checklist

- [ ] Eight tasks are present and ordered by dependency.
- [ ] Every new behavior has an explicit failing-test step before implementation.
- [ ] Rust tests are registered before the first targeted Cargo test invocation.
- [ ] Task 3 begins tracking `Cargo.lock`; later Rust tasks retain it.
- [ ] Application-top-level recovery runs once outside StrictMode, shares state, supports UI retry, and prepares but never consumes the catch-up window.
- [ ] HTTP accepts sourceId only, loads URL/host from SQLite, and combines address validation, DNS pinning, disabled redirects and streaming 5 MiB enforcement.
- [ ] Native secrets use only `windows-native`; browser behavior never persists Key.
- [ ] Settings writes secrets only on explicit save.
- [ ] `capabilities/default.json` is absent from modification lists and verified by committed diffs from the approved and synchronized remote baselines.
- [ ] Full frontend, build, Rust, desktop and browser gates are specified.
