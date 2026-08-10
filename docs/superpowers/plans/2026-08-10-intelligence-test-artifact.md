# 对标企业情报独立测试安装包 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `feature/competitive-intelligence` 每次推送都生成一个可下载、可与正式版共存且数据与模型凭据完全隔离的 Windows NSIS 测试安装包。

**Architecture:** 使用一份只在测试构建时叠加的 Tauri 配置隔离产品名、应用标识和应用数据目录；Rust 凭据后端通过编译期环境变量选择测试专用 Credential Manager 服务名，正式构建继续使用原默认值。GitHub Actions 只监听功能分支，完整门禁通过后构建并上传 30 天 Artifact，不创建 PR、Tag 或 Release。

**Tech Stack:** Tauri 2、Rust 1.77.2、React/Vite/Vitest、GitHub Actions、NSIS、actions/upload-artifact v4

## Global Constraints

- 只推送 `feature/competitive-intelligence`，不修改或合并 `claude/business-project-docking-workbench-ccies1`。
- 测试产品名固定为 `StrategicAnalysisWorkbench-IntelligenceTest`。
- 测试应用标识固定为 `com.zhanlue.workbench.intelligence-test`。
- 测试 Credential Manager 服务名固定为 `com.zhanlue.workbench.intelligence-test.llm`。
- 正式构建默认服务名继续为 `com.zhanlue.workbench.llm`。
- Windows 安装包格式仅为 NSIS `setup.exe`，Artifact 保留 30 天。
- 工作流权限为 `contents: read`，不创建 GitHub Release 或 Tag。
- 所有 Rust 门禁与构建使用 Rust 1.77.2 和已跟踪的 `Cargo.lock`。

---

### Task 1: 隔离测试版 Credential Manager 服务名

**Files:**
- Modify: `app/src-tauri/src/intelligence/secrets.rs`
- Test: `app/src-tauri/src/intelligence/secrets.rs`

**Interfaces:**
- Consumes: 编译期变量 `WORKBENCH_CREDENTIAL_SERVICE: Option<&'static str>`。
- Produces: `credential_service() -> &'static str`，供 `NativeCredentialBackend::entry` 创建 keyring entry。
- Produces: 正式构建无变量时返回 `com.zhanlue.workbench.llm`，测试构建有变量时返回注入值。

- [ ] **Step 1: 写入服务名选择的失败测试**

在 `secrets.rs` 的测试模块加入：

```rust
#[test]
fn credential_service_uses_default_or_non_blank_build_override() {
    assert_eq!(
        service_name(None),
        "com.zhanlue.workbench.llm"
    );
    assert_eq!(
        service_name(Some("com.zhanlue.workbench.intelligence-test.llm")),
        "com.zhanlue.workbench.intelligence-test.llm"
    );
    assert_eq!(
        service_name(Some("   ")),
        "com.zhanlue.workbench.llm"
    );
}
```

- [ ] **Step 2: 运行测试并确认红灯**

Run:

```powershell
cargo +1.77.2 test --locked --manifest-path app/src-tauri/Cargo.toml credential_service_uses_default_or_non_blank_build_override
```

Expected: FAIL，原因是 `service_name` 尚未定义。

- [ ] **Step 3: 实现最小服务名选择逻辑**

将固定 `SERVICE` 替换为：

```rust
const DEFAULT_SERVICE: &str = "com.zhanlue.workbench.llm";

fn service_name(build_override: Option<&'static str>) -> &'static str {
    match build_override {
        Some(value) if !value.trim().is_empty() => value,
        _ => DEFAULT_SERVICE,
    }
}

fn credential_service() -> &'static str {
    service_name(option_env!("WORKBENCH_CREDENTIAL_SERVICE"))
}
```

并把：

```rust
Entry::new(SERVICE, provider_id)
```

改为：

```rust
Entry::new(credential_service(), provider_id)
```

- [ ] **Step 4: 运行聚焦测试并确认绿灯**

Run:

```powershell
cargo +1.77.2 test --locked --manifest-path app/src-tauri/Cargo.toml credential_service_uses_default_or_non_blank_build_override
```

Expected: 1 passed，0 failed。

- [ ] **Step 5: 运行凭据模块完整测试**

Run:

```powershell
cargo +1.77.2 test --locked --manifest-path app/src-tauri/Cargo.toml intelligence::secrets::tests
```

Expected: 所有 secrets 测试通过，公开错误文本和 provider 校验不变。

- [ ] **Step 6: 提交凭据隔离实现**

```powershell
git add app/src-tauri/src/intelligence/secrets.rs
git commit -m "fix(security): isolate test build credential service"
```

---

### Task 2: 增加测试版 Tauri 配置和分支专用 Artifact 工作流

**Files:**
- Create: `app/src-tauri/tauri.intelligence-test.conf.json`
- Create: `.github/workflows/competitive-intelligence-test-build.yml`

**Interfaces:**
- Consumes: Task 1 的 `WORKBENCH_CREDENTIAL_SERVICE` 编译期接口。
- Produces: NSIS 安装包 `app/src-tauri/target/release/bundle/nsis/*-setup.exe`。
- Produces: GitHub Artifact `competitive-intelligence-windows-test-<short_sha>`，保留 30 天。

- [ ] **Step 1: 创建测试版 Tauri 叠加配置**

创建 `app/src-tauri/tauri.intelligence-test.conf.json`：

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "StrategicAnalysisWorkbench-IntelligenceTest",
  "identifier": "com.zhanlue.workbench.intelligence-test",
  "bundle": {
    "active": true,
    "targets": ["nsis"]
  }
}
```

- [ ] **Step 2: 静态验证测试配置与正式配置不同**

Run:

```powershell
@'
const fs = require("fs");
const stable = JSON.parse(fs.readFileSync("app/src-tauri/tauri.conf.json", "utf8"));
const test = JSON.parse(fs.readFileSync("app/src-tauri/tauri.intelligence-test.conf.json", "utf8"));
if (test.productName === stable.productName) throw new Error("productName is not isolated");
if (test.identifier === stable.identifier) throw new Error("identifier is not isolated");
if (test.identifier !== "com.zhanlue.workbench.intelligence-test") throw new Error("unexpected identifier");
'@ | node
```

Expected: exit 0，无输出。

- [ ] **Step 3: 创建功能分支专用 GitHub Actions 工作流**

创建 `.github/workflows/competitive-intelligence-test-build.yml`：

```yaml
name: build-competitive-intelligence-test

on:
  push:
    branches:
      - "feature/competitive-intelligence"

permissions:
  contents: read

env:
  RUST_BACKTRACE: "1"
  WORKBENCH_CREDENTIAL_SERVICE: "com.zhanlue.workbench.intelligence-test.llm"

jobs:
  build-windows-test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install frontend dependencies
        working-directory: app
        run: npm ci

      - name: Setup Rust 1.77.2
        uses: dtolnay/rust-toolchain@master
        with:
          toolchain: 1.77.2

      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: "app/src-tauri -> target"

      - name: Frontend tests
        working-directory: app
        run: npm test

      - name: Frontend typecheck
        working-directory: app
        run: npm run typecheck

      - name: Rust tests
        working-directory: app/src-tauri
        run: cargo test --locked

      - name: Rust check
        working-directory: app/src-tauri
        run: cargo check --locked

      - name: Rust format check
        working-directory: app/src-tauri
        run: cargo fmt -- --check

      - name: Build isolated Windows installer
        working-directory: app
        run: npm run tauri build -- --config src-tauri/tauri.intelligence-test.conf.json

      - name: Set artifact suffix
        id: artifact_meta
        shell: pwsh
        run: '"short_sha=$($env:GITHUB_SHA.Substring(0, 7))" >> $env:GITHUB_OUTPUT'

      - name: Upload Windows test installer
        uses: actions/upload-artifact@v4
        with:
          name: competitive-intelligence-windows-test-${{ steps.artifact_meta.outputs.short_sha }}
          path: app/src-tauri/target/release/bundle/nsis/*-setup.exe
          if-no-files-found: error
          retention-days: 30
```

- [ ] **Step 4: 静态检查工作流边界**

Run:

```powershell
rg -n "feature/competitive-intelligence|contents: read|WORKBENCH_CREDENTIAL_SERVICE|upload-artifact@v4|retention-days: 30|tauri.intelligence-test.conf.json" .github/workflows/competitive-intelligence-test-build.yml
rg -n "release|tagName|contents: write|pull_request" .github/workflows/competitive-intelligence-test-build.yml
```

Expected: 第一条命中全部约束；第二条无匹配并返回 1。

- [ ] **Step 5: 提交测试配置与工作流**

```powershell
git add app/src-tauri/tauri.intelligence-test.conf.json .github/workflows/competitive-intelligence-test-build.yml
git commit -m "ci: build isolated intelligence test installer"
```

---

### Task 3: 本地验收、推送与 GitHub Artifact 交付

**Files:**
- Verify: `app/src-tauri/src/intelligence/secrets.rs`
- Verify: `app/src-tauri/tauri.intelligence-test.conf.json`
- Verify: `.github/workflows/competitive-intelligence-test-build.yml`
- Verify: `docs/superpowers/specs/2026-08-10-intelligence-test-artifact-design.md`

**Interfaces:**
- Consumes: Tasks 1–2 的测试构建配置。
- Produces: 已推送的 `feature/competitive-intelligence` 和可下载 GitHub Artifact。

- [ ] **Step 1: 运行前端完整门禁**

Run from `app`:

```powershell
npm ci
npm test
npm run typecheck
npm run build
```

Expected: 安装成功；18 个测试文件与至少 162 个测试全部通过；typecheck 和 Vite build 退出码 0。

- [ ] **Step 2: 使用 Rust 1.77.2 运行后端完整门禁**

Run from `app/src-tauri`:

```powershell
cargo +1.77.2 test --locked
cargo +1.77.2 check --locked
cargo +1.77.2 fmt -- --check
```

Expected: 至少 41 个 Rust 测试通过；check 和 fmt 退出码 0。

- [ ] **Step 3: 本地构建隔离测试安装包**

Run from `app`:

```powershell
$env:WORKBENCH_CREDENTIAL_SERVICE = "com.zhanlue.workbench.intelligence-test.llm"
npm run tauri build -- --config src-tauri/tauri.intelligence-test.conf.json
```

Expected: `src-tauri/target/release/bundle/nsis/` 下出现名称包含 `StrategicAnalysisWorkbench-IntelligenceTest` 的 `*-setup.exe`。

- [ ] **Step 4: 检查分支、差异和工作树**

Run:

```powershell
git branch --show-current
git diff --check
git status --short --branch
```

Expected: 当前分支为 `feature/competitive-intelligence`，无未提交变更。

- [ ] **Step 5: 推送已授权功能分支**

```powershell
git push -u origin feature/competitive-intelligence
```

Expected: 推送成功；不创建或更新其他分支。

- [ ] **Step 6: 等待并核验 GitHub Actions**

Run:

```powershell
gh run list --workflow competitive-intelligence-test-build.yml --branch feature/competitive-intelligence --limit 1
gh run watch <run-id> --exit-status
```

Expected: workflow conclusion 为 `success`。

- [ ] **Step 7: 核验 Artifact 并交付下载信息**

Run:

```powershell
gh api repos/haodahzi/Strategic-Analysis-Workspace/actions/runs/<run-id>/artifacts
```

Expected: 返回一个未过期 Artifact，名称为 `competitive-intelligence-windows-test-<short_sha>`，并记录 Actions 运行页面 URL 供用户下载。
