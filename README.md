# Codex Project Link Repair

Windows 图形工具，用于审计和修复 Codex 聊天与本地项目之间丢失的索引关联。

## 要求

- Windows 10/11
- Node.js 22.5 或更高版本（需要内置 `node:sqlite`）
- 已安装 Codex Windows 应用

## 使用

解压 Release ZIP，双击 `CodexProjectRepair.cmd`。

- **审计**：只读取 `.codex-global-state.json` 与 `state_5.sqlite`。
- **保守修复并重启 Codex**：关闭 Codex、备份索引、同步明确关联、验证并重启。
- **恢复最近备份**：关闭 Codex并恢复工具最近一次生成的备份。

保守模式只修复 JSON 中已有的明确关联，或未标记为 projectless 且 `cwd` 唯一落入一个项目根目录的聊天。模糊匹配不会自动处理。工具不会修改聊天正文、标题、归档状态或父子关系。

备份保存在 `%USERPROFILE%\.codex\backups_project_repair`。如 Codex 无法关闭或验证失败，工具停止操作并显示错误；修复失败时自动恢复本次备份。

## 命令行

```powershell
node src\cli.js audit --home "$env:USERPROFILE\.codex" --json
node src\cli.js repair --home "$env:USERPROFILE\.codex" --json
node src\cli.js restore --home "$env:USERPROFILE\.codex" --json
```

审计退出码：`0` 无待修复项，`2` 发现可保守修复项；执行错误为 `1`。

## 构建与测试

```powershell
node --test
.\build-release.ps1
```
