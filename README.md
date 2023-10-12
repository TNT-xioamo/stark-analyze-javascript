# stark-analyze-javascript 浏览器 JS 库

## 测试

单元测试：运行“yarn test”。
Cypress：运行 `yarnserve` 来运行测试服务器，并单独运行 `yarn cypress` 来启动 Cypress 测试引擎。


### 运行本地创建 React 应用程序示例

您可以使用“playground/nextjs”中的 create React 应用程序设置来测试 stark-analyze-javascript 作为 Nextjs 应用程序中的 npm 模块。

1. 在端口 8000 上本地运行 `posthog` (`DEBUG=1 TEST=1 ./bin/start`)。
2. 在 posthog repo 上运行 `python manage.py setup_dev --no-data`，这会设置一个演示帐户。
3. 复制在 `http://localhost:8000/project/settings` 中找到的 posthog 令牌，然后
4.`cdplayground/nextjs`并运行`NEXT_PUBLIC_POSTHOG_KEY='<your-local-api-key>'yarn dev`

### 测试层级

1. 单元测试——以小块的形式验证库的行为。 保持覆盖率接近 100%，在此处测试极端情况和内部行为
2. Cypress 测试 - 与真正的 chrome 浏览器集成，能够测试时序、浏览器请求等。对于测试高级库行为、排序和验证请求很有用。 我们不应该在这里追求 100% 的覆盖率，因为不可能测试所有可能的组合。
3. TestCafe E2E 测试 - 与真实的 posthog 实例集成并向其发送数据。 最难编写和维护 - 保持这些非常高的水平

## 与另一个项目一起开发

安装 Yalc 以在另一个 JS 项目中链接本地版本的 `stark-analyze-javascript`：`npm install -g yalc`

#### 运行此命令以链接本地版本

- 在`stark-analyze-javascript`目录中：`yalcpublish`
- 在另一个目录中：`yalc add stark-analyze-javascript`，然后安装依赖项
   （对于“posthog”，这意味着：“yalc add stark-analyze-javascript && pnpm i && pnpm copy-scripts”）

#### 运行此命令以更新链接的本地版本

- 在另一个目录：`yalc update`，然后安装依赖项
   （对于“posthog”，这意味着：“yalc update && pnpm i && pnpm copy-scripts”）

#### 运行此命令以取消本地版本的链接

- 在另一个目录中：`yalc remove stark-analyze-javascript`，然后安装依赖项
   （对于“posthog”，这意味着：“yalc remove stark-analyze-javascript && pnpm i && pnpm copy-scripts”）
