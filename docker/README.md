# DeepSeek Harness Docker
独立部署分支，不影响 Windows 桌面版 main 分支。

GitHub Actions 构建并推送 GHCR 镜像；生产服务器仅拉取和运行，**禁止在生产服务器 docker build**。

运行前须验证 dsh web 的启动参数、容器持久化路径及 Web 认证方式。不要在未设置访问控制前启用公网 Nginx 反代。

部署：将 compose.yaml 放入服务器独立目录，创建 data 和 workspace，运行 `docker compose pull && docker compose up -d --no-build`。镜像若为私有包，需先配置 GHCR 只读认证。
