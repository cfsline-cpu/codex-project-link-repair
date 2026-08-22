# Codex 项目关联修复工具实现计划

> **面向 AI 代理的工作者：** 在当前会话由主代理按 TDD 顺序实现并验证。

**目标：** 构建零第三方依赖的 Windows GUI 工具，安全审计、备份、修复和恢复 Codex 项目关联索引，并产出 GitHub Release 资产。

**架构：** `src/core.js` 提供纯审计与修复逻辑，`src/cli.js` 提供可测试命令接口，`CodexProjectRepair.ps1` 提供 WinForms GUI。核心只使用 Node.js 标准库和 `node:sqlite`，所有写操作均支持自定义 Codex 根目录以便夹具测试。

**技术栈：** Node.js 22、内置 `node:sqlite`、PowerShell 5.1 WinForms、Windows AppX 启动接口。

---

### 任务 1：审计核心

**文件：**
- 创建：`src/core.js`
- 创建：`test/core.test.js`

- [ ] 编写夹具测试，覆盖一致状态、JSON/SQLite 不一致、明确目录推断和 projectless 排除。
- [ ] 运行 `node --test test/core.test.js`，确认因核心缺失而失败。
- [ ] 实现路径规范化、状态加载和只读审计。
- [ ] 重跑测试，确认全部通过。

### 任务 2：安全修复与恢复

**文件：**
- 修改：`src/core.js`
- 修改：`test/core.test.js`

- [ ] 编写备份、事务修复、验证失败回滚和恢复最近备份测试。
- [ ] 运行测试确认新增用例失败。
- [ ] 实现时间戳备份、JSON 原子替换、SQLite 事务同步和备份恢复。
- [ ] 重跑全部核心测试。

### 任务 3：CLI 与 GUI

**文件：**
- 创建：`src/cli.js`
- 创建：`test/cli.test.js`
- 创建：`CodexProjectRepair.ps1`
- 创建：`CodexProjectRepair.cmd`

- [ ] 编写 CLI 审计、JSON 输出、repair 与 restore 参数测试并确认失败。
- [ ] 实现 CLI，返回稳定退出码。
- [ ] 创建 WinForms GUI，按钮仅调用 CLI，不复制业务逻辑。
- [ ] 运行 CLI 测试和 PowerShell 语法检查。

### 任务 4：发布资产

**文件：**
- 创建：`README.md`
- 创建：`LICENSE`
- 创建：`VERSION`
- 创建：`build-release.ps1`
- 创建：`.gitignore`

- [ ] 编写安装、审计、修复、恢复和故障排查说明。
- [ ] 构建版本 ZIP 和 `SHA256SUMS.txt`。
- [ ] 解压到临时目录执行审计 smoke test。
- [ ] 运行全套测试、语法检查和 ZIP 清单检查。
- [ ] 提交代码，创建 GitHub 仓库、tag 和 Release，上传 ZIP 与校验文件。
