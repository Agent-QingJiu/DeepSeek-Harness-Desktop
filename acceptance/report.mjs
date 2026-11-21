import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const read = p => JSON.parse(readFileSync(p,'utf8'))
const pack = read('packaging/preview.json')
const sha = readFileSync('dist/SHA256SUMS.txt','utf8').trim().split(/\s+/)[0]
const reports = readdirSync('reports').sort()
assert.equal(reports.length, 2)
const results = []
for (const dir of reports) {
  const path = name => join('reports',dir,name)
  const win = read(path('windows.json').toString())
  const agent = read(path('agent.json'))
  const stages = read(path('window.json'))
  const native = read(path('native.json'))
  assert(win.install && win.shortcuts && win.uninstall && win.installerSha256 === sha)
  assert.equal(win.signature, 'NotSigned')
  assert(agent.pairedRealToolExecutions === 5 && agent.finalAnswerUsedToolResult && agent.resumedSession && agent.http401Reported)
  assert(stages.includes('workspace') && stages.includes('graceful-quit') && stages.includes('saved-key-encrypted'))
  const flags = native.filter(r => r.newerDirectImports.length || r.subsystemVersion[0] > 10)
  const observation = flags.length ? '，其中 ' + flags.length + ' 个文件有较高版本标记，见 native.json' : '，已筛查的较新静态导入未命中'
  results.push('| ' + win.operatingSystem + ' ' + win.version + ' | ' + win.hostArchitecture +
    ' | 安装、快捷方式、窗口、配置、工具链路、退出和卸载通过 | ' + native.length + ' 个 PE 文件' + observation + ' |')
}
const run = 'https://github.com/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID
const notes = `# DSH Desktop v${pack.version} · Windows x64 社区预览版

下载 **DSH-Desktop-Setup-x64.exe**，双击安装。**安装包未做 Authenticode 代码签名。** SHA256 为 \`${sha}\`。同页附有 SHA256SUMS.txt。

社区打包版本为 v${pack.version}。上游 Desktop 和 Agent 源自 DeepSeek 的 0.2.2-rc.5。[上游提交](https://github.com/deepseek-ai/deepseek-harness/commit/${pack.upstream}) · [本次构建及验收记录](${run})

| 实际测试系统 | 宿主 CPU | 使用同一 SHA256 安装包的结果 | 原生文件检查 |
| --- | --- | --- | --- |
${results.join('\n')}

本次用本机可控的 OpenAI Chat Completions 端点验收。桌面模型设置读取模型列表并加密保存测试 Key。安装包内的 Agent 使用自定义模型 ID 完成流式聊天及多轮恢复，执行 4 次真实文件读取和 1 次缺失文件读取。端点检查对应工具结果后才返回最终答案。401 错误另行测试。GitHub 验收使用本仓库 checkout 的 README、代码和提交记录。

| 目标 x64 客户端 | 验证结果 |
| --- | --- |
| Windows 10 Enterprise LTSC 2019（17763） | 静态检查，未实机验证 |
| Windows 10 Enterprise LTSC 2021（19044） | 静态检查，未实机验证 |
| Windows 10 22H2（19045） | 静态检查，未实机验证 |
| Windows 11 Enterprise LTSC 2024（26100） | x64 原生未实机验证 |
| 其他受支持的 Windows 11 x64 | x64 原生未实机验证。上表记录 Windows 11 ARM 对 x64 应用的仿真测试 |

已知限制包括第三方公网网关的账号、计费和模型质量未测，私有 GitHub 权限未测。更新安装包从本仓库 Releases 手动下载。凭据与当前 Windows 用户绑定。上游 MIT 版权、Electron 和第三方声明随包提供。
`
writeFileSync('dist/ACCEPTANCE.md',notes)
