# 发布流程

此仓库的 `main` 分支每次推送都会在 GitHub Actions 上执行 Windows x64 校验与便携版构建。若 `package.json` 的版本号尚未有同名标签，校验通过后会自动建立 `v<版本>` Release，附上单文件 EXE、含说明的 ZIP 和 SHA256SUMS。PR 只构建，不发布。

发布新版本时：

1. 修改 `package.json` 与 `package-lock.json` 的版本号，新增 `docs/releases/v<版本>.md`。
2. 运行 `npm ci`、`npm run check`，确认新源码和资源可用。
3. 检查没有 `data`、密钥、聊天记录、导入书籍、个人配置和构建缓存进入 Git；确认角色图像具有公开分发权。
4. 把经过检查的提交推送到 `main`，等待工作流完成，并打开 Release 核对附件与 SHA256。

同一版本的 Release 不会因为后续普通提交而覆盖；需要更新下载包时必须递增版本号。GitHub 普通 Git 文件有 100 MB 上限，便携 EXE/ZIP 只作为 Release 附件发布，不提交进仓库。工作流执行失败时不视为已发布，须修复并重新验证。
