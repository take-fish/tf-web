# tf-web

FishMatrix（摸鱼矩阵）前端应用 —— Vue 3 + Vite + TypeScript + Pinia + Vue Router。

- 角色：工作台壳层（6 套伪装皮肤、Boss 键、全局状态）与 4 个功能模块的宿主
- 模块：TerminalChat（Xterm）、CodeReader（Monaco）、MonitorGame（ECharts）、BuildMusic
- 开发端口：`5173`（vite 默认）
- 测试：Vitest + @vue/test-utils；Lint：ESLint + oxlint
- 生产：nginx 静态镜像，`/api` 与 `/ws` 反向代理到 gateway

> qiankun 一期暂未接入：模块按 `src/modules/*` 组织并路由懒加载，需要时再拆为子应用。

## 本地开发

```bash
npm install        # 安装依赖
npm run dev        # 启动开发服务（/api、/ws 代理到 localhost:8080）
npm run type-check # 类型检查
npm run lint       # Lint（自动修复）
npm run test:unit  # 单元测试
npm run build      # 构建产物 dist/
```

依赖的本地服务：`tf-gateway`（8080）及其下游 Java 服务；页面通过 `/api`、`/ws` 访问。

若本机 8080 被占用或想直接连集中机的 nginx 入口，可覆盖代理目标：

```bash
VITE_PROXY_TARGET=http://localhost:8088 npm run dev
```

> 国内网络可切换 npm 镜像源：`npm config set registry https://registry.npmmirror.com`

## 快捷键

- `Ctrl+Shift+F`：立即切换到 IDE 工作画面（暂停音乐；再按恢复）
- `Ctrl+Shift+M`：打开工作区视图切换面板

## 镜像

```bash
docker build -t ghcr.io/take-fish/tf-web:local .
```

- `nginx.conf`：SPA fallback、静态资源长缓存、`/api` 反向代理、`/ws` WebSocket Upgrade、10m 上传限制
- 合 master 自动推送 `ghcr.io/take-fish/tf-web:<version>` 与 `:latest`

## 分支模型

- `master`：保护分支，只接受 PR（CI 必须通过，squash 合并），合并后自动发版
- `test`：联调分支，开发分支直接合入（不走 PR），可直接推送
- 开发流：`feature/*` 开发 → 直接合入 `test` 联调 → 验证 OK 后从开发分支开 PR 合 `master` → 自动发版
