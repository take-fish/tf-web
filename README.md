# tf-web

FishMatrix（摸鱼矩阵）前端应用 —— Vue 3 + Vite + TypeScript + Pinia + Vue Router。

- 角色：微前端壳层（皮肤管理中心、全局 Boss 键、全局状态）与各功能子应用的宿主
- 开发端口：`5173`（vite 默认）
- 测试：Vitest + @vue/test-utils；Lint：ESLint + oxlint

> qiankun 微前端一期暂未接入，待第一个功能子应用拆分时再加。

## 本地开发

```bash
npm install        # 安装依赖
npm run dev        # 启动开发服务
npm run type-check # 类型检查
npm run lint       # Lint（自动修复）
npm run test:unit  # 单元测试
npm run build      # 构建产物 dist/
```

> 国内网络可切换 npm 镜像源：`npm config set registry https://registry.npmmirror.com`

## 分支模型

- `master`：保护分支，只接受 PR（CI 必须通过，squash 合并），合并后自动发版
- `test`：联调分支，开发分支直接合入（不走 PR），可直接推送
- 开发流：`feature/*` 开发 → 直接合入 `test` 联调 → 验证 OK 后从开发分支开 PR 合 `master` → 自动发版
