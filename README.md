# DeepSeek Harness Desktop — Windows 安装包构建

基于 [DeepSeek Harness 官方开源项目](https://github.com/deepseek-ai/deepseek-harness)的 Windows x64 桌面安装包构建仓库。**非 DeepSeek 官方发布版。**

## 使用方法

1. 打开 [Actions](../../actions/workflows/windows.yml)，选择 **Run workflow**（或等待 main 分支提交自动触发）。
2. 等待 Windows 构建完成。
3. 在该次 Actions 运行的 **Artifacts** 下载 `DeepSeek-Harness-Desktop-Windows-x64`。
4. 安装前检查下载文件来源；未签名安装包可能触发 Windows SmartScreen 提示。

## 构建说明

- 使用 GitHub 托管的 Windows runner，不需要在个人电脑安装 Node.js 或编译工具。
- 构建时从官方仓库 `master` 拉取源代码，运行 `pnpm install --frozen-lockfile`、`pnpm run build`、`pnpm run package:desktop:win:x64:unsigned`。
- 手动构建及 main 分支构建上传 Actions Artifacts；推送 `v*` 标签时还会尝试创建 GitHub Release。
- 首次构建属于验证阶段：**尚未确认安装包构建成功，也尚未验证第三方 API 或运行时依赖**。
- 上游处于开发者预览阶段，可能出现不兼容变更；后续应固定已验证的上游提交 SHA。
- 此构建工作流未经代码签名。请勿将其视为官方签名安装包。

## 开源与版权

DeepSeek Harness 由 DeepSeek AI 开发，采用 MIT 许可证。原始项目和第三方依赖的版权及许可证归各自权利人所有。构建及分发时应保留上游许可证和第三方声明。

上游：https://github.com/deepseek-ai/deepseek-harness
