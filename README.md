# DSH Desktop · Windows x64 社区预览版

这个仓库把 DeepSeek Harness 官方 Electron 桌面端、Agent 核心和随附运行时做成 Windows 安装包。项目由 Agent-QingJiu 独立打包，预览版本为 `v0.1.0-preview.1`。它使用你配置的模型服务，安装内容不含模型权重或任何用户的 API Key。[官方项目](https://github.com/deepseek-ai/deepseek-harness) · [预览版下载](https://github.com/Agent-QingJiu/DeepSeek-Harness-Desktop/releases) · [构建记录](https://github.com/Agent-QingJiu/DeepSeek-Harness-Desktop/actions/workflows/windows.yml)

## 安装和首次启动

1. 在 Releases 选择标记 **Pre-release** 的版本，下载 `DSH-Desktop-Setup-x64.exe`。同页的 `SHA256SUMS.txt` 可用于核对文件。Actions 的编译中间结果仅供开发检查。
2. 双击安装程序，按向导以当前用户安装。预览包未做 Authenticode 代码签名，Windows 可能显示 SmartScreen 提示。安装操作不需要开发工具。
3. 从桌面或开始菜单的 **DSH Desktop Preview** 启动。首次启动准备本地工作区可能需要一些时间。如果使用第三方中转，在欢迎页进入 API Key 分支并选择稍后配置。进入主窗口后打开 **设置 → 模型**。
4. 关闭主窗口可能会收回系统托盘。完全退出可使用托盘菜单的退出项。卸载请使用 Windows 设置中的“应用”。上游卸载器保留 Harness 会话和凭据。预览版默认数据目录为 `%USERPROFILE%\.dsh-desktop-preview`，已有 `DSH_HOME` 环境变量时优先使用该位置。

## 配置第三方模型

在 **设置 → 模型 → 添加模型提供商 → 自定义模型 API** 中填写下列字段。

| 字段 | 填写内容 |
| --- | --- |
| Provider ID | 自定的小写标识，如 `my-relay` |
| 基础 URL | 服务商提供的完整前缀，如 `https://你的中转域名/v1` |
| API 协议 | 对使用 `/chat/completions` 的服务选择 **OpenAI Chat Completions** |
| API Key | 服务商为你的账号签发的密钥 |
| 模型 ID | 原样输入网关返回的 ID，保留大小写、标点和版本后缀 |

点击 **获取可用模型** 可向兼容网关获取列表。服务商未开放列表时手动填写 ID 即可。应用配置后，在新会话的模型选择器中选中刚添加的模型。401 通常需要核对凭据，模型不存在时核对该 Key 的模型列表。工具调用还需要该模型及中转支持流式工具请求和工具结果回传。[上游配置指南](https://github.com/deepseek-ai/deepseek-harness/blob/2e39e70496aa02986ca6a820c5d497e816b69d7e/docs/user/guide/providers.zh.md)

在这份 Windows 构建中，界面保存的凭据经 **Windows DPAPI CurrentUser** 加密后才写入本地凭据文件。换 Windows 账号或重装系统后通常需要重新输入。当前账号下运行且有相应权限的程序仍可调用 DPAPI。显式指定其他 Harness 安装的 `DSH_HOME` 会共享数据目录，请为预览版使用独立目录。

## Agent 与 GitHub

打开本地项目目录，让 Agent 读取 `README.md`、分析一个指定源码文件，或解释代码对应的调用关系。初次试用可选只读权限。修改或执行命令时请检查权限请求。默认模型、权限预设和已批准的工作区会影响实际可用的工具。

要查看 GitHub 项目，可以打开本地 checkout。体验代码阅读只需项目文件。查看完整 Git 历史、拉取更新需要 Git 或相应的已授权连接器，私有仓库还需要你的 GitHub 授权。剪贴一个网页链接不会自动授予仓库权限。上游的 GitHub Webhook 自动评审另需插件、服务地址和独立授权。[上游 GitHub 指南](https://github.com/deepseek-ai/deepseek-harness/blob/2e39e70496aa02986ca6a820c5d497e816b69d7e/docs/user/guide/github-review.zh.md)

## Windows 10 / 11 兼容性

一个 NSIS 安装程序携带 x64 Electron、Node、Python、pnpm 和原生运行库。32 位 NSIS 引导程序可以安装 x64 应用。上游运行时清单指定 Node 24.21.0、Python 3.12.14；Electron 以构建时上游锁文件为准。Electron 与 Node 的 Windows x64 平台基线为 Windows 10。Windows 终端使用的系统 ConPTY API 自 1809 起提供。原生模块实际加载、显卡驱动、终端和 Office 文件转换仍需对应系统验证。[Electron 平台](https://github.com/electron/electron/tree/v44.7.0#platform-support) · [Node 平台](https://github.com/nodejs/node/blob/v24.21.0/BUILDING.md#platform-list) · [Python 平台](https://docs.python.org/3.12/using/windows.html) · [ConPTY](https://learn.microsoft.com/windows/console/createpseudoconsole)

| 目标系统（x64） | 目标 Build | 客户端验证 |
| --- | --- | --- |
| Windows 10 Enterprise LTSC 2019 | 17763 | 重点兼容目标，未实机验证 |
| Windows 10 Enterprise LTSC 2021 | 19044 | 未实机验证 |
| Windows 10 22H2 | 19045 | 未实机验证 |
| Windows 11 Enterprise LTSC 2024 | 26100 | 重点兼容目标，未实机验证 |
| 其他受支持的 Windows 11 x64 | 随发行版本 | 未实机验证 |

每份已发布安装包附带 `ACCEPTANCE.md`，其中逐项记录实际镜像、处理器架构和验收范围。标准 Windows x64 托管 runner 运行 Windows Server。另一个验收任务在 Windows 11 ARM 上运行同一 x64 包，经系统仿真执行。这两组均不能替代上述原生客户端实测。[系统 Build 对照](https://learn.microsoft.com/windows/release-health/supported-versions-windows-client)

## 构建、测试与发布

GitHub Actions 支持 main 推送、手动运行和版本标签。固定上游为 `2e39e70496aa02986ca6a820c5d497e816b69d7e`（0.2.2-rc.5）。Windows x64 构建机安装锁定依赖，准备环境文件、预览版更新策略、凭据存储和版权声明，执行上游完整编译、运行时完整性检查和安装包构建。上游在准备生产运行时时会单独解析部分外部依赖，固定上游提交并不保证逐字节复现。[上游打包说明](https://github.com/deepseek-ai/deepseek-harness/blob/2e39e70496aa02986ca6a820c5d497e816b69d7e/apps/desktop/packaging/README.md)

验收任务下载构建产物并比较 SHA256，在隔离目录中安装、启动和卸载。测试端点只绑定回环地址，使用每次运行生成的测试凭据和模型 ID。测试逐项核对 HTTP 工具请求、桌面随附 Agent 的执行事件、工具结果回传和最终回答。公开报告只记录测试结论。公网商业中转、模型质量、真实付费 Key 和私有仓库连接均未实测。

通过验收后，版本标签或手动发布选项会创建 GitHub 预览 Release。发布步骤校验 GitHub 返回的每份资产 SHA256 后开放下载。普通 main 提交保留 Actions 产物。预览版通过 Releases 手动更新，仓库维护每版的独立强制更新策略。[Actions](https://github.com/Agent-QingJiu/DeepSeek-Harness-Desktop/actions/workflows/windows.yml)

## 版权

DeepSeek Harness 版权所有 © 2026 DeepSeek，采用 MIT 许可证。“DeepSeek Harness”商标归原权利人所有。原始 MIT 文本及第三方声明放在安装目录的 `resources\licenses`，Electron 和 Chromium 另附自身的许可文件。[上游 MIT](https://github.com/deepseek-ai/deepseek-harness/blob/2e39e70496aa02986ca6a820c5d497e816b69d7e/LICENSE) · [第三方声明](https://github.com/deepseek-ai/deepseek-harness/blob/2e39e70496aa02986ca6a820c5d497e816b69d7e/THIRD_PARTY_NOTICES.md)
