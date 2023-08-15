# PostHog 浏览器 JS 库

[![npm 包](https://img.shields.io/npm/v/posthog-js?style=flat-square)](https://www.npmjs.com/package/posthog-js)
[![麻省理工学院许可证](https://img.shields.io/badge/License-MIT-red.svg?style=flat-square)](https://opensource.org/licenses/MIT)

有关在应用程序中使用此库的信息，[请参阅 PostHog 文档](https://posthog.com/docs/libraries/js)。
本自述文件旨在用于开发库本身。

## 测试

单元测试：运行“yarn test”。
Cypress：运行 `yarnserve` 来运行测试服务器，并单独运行 `yarn cypress` 来启动 Cypress 测试引擎。

### 使用 BrowserStack 运行 TestCafe E2E 测试

在 IE11 上进行测试需要更多设置。 TestCafe 测试将使用
游乐场应用程序来测试本地构建的 array.full.js 包。 它会
还验证游乐场测试期间发出的事件是否已加载
进入 PostHog 应用程序。 默认情况下，它使用 https://app.posthog.com 和
ID 为 11213 的项目。请参阅 testcafe 测试以了解如何覆盖这些 if
需要。 对于 PostHog 内部用户，请@benjackwhite 或 @hazzadous 邀请您
到该项目。 您需要将 `POSTHOG_API_KEY` 设置为您的个人 API 密钥，并且
`POSTHOG_PROJECT_KEY` 为您正在使用的项目的密钥。

您还需要注册 [BrowserStack](https://www.browserstack.com/)。
请注意，如果您使用 CodeSpaces，这些变量将已经可用
在你的 shell 环境变量中。

完成所有这些后，您将能够执行以下步骤：

1. 可选：在更改时重建 array.js：`nodemon -w src/ --exec bash -c "yarn build-rollup"`。
1. 导出 browserstack 凭据：`export BROWSERSTACK_USERNAME=xxx BROWSERSTACK_ACCESS_KEY=xxx`。
1. 运行测试：`npx testcafe "browserstack:ie" testcafe/e2e.spec.js`。

### 运行本地创建 React 应用程序示例

您可以使用“playground/nextjs”中的 create React 应用程序设置来测试 posthog-js 作为 Nextjs 应用程序中的 npm 模块。

1. 在端口 8000 上本地运行 `posthog` (`DEBUG=1 TEST=1 ./bin/start`)。
2. 在 posthog repo 上运行 `python manage.py setup_dev --no-data`，这会设置一个演示帐户。
3. 复制在 `http://localhost:8000/project/settings` 中找到的 posthog 令牌，然后
4.`cdplayground/nextjs`并运行`NEXT_PUBLIC_POSTHOG_KEY='<your-local-api-key>'yarn dev`

### 测试层级

1. 单元测试——以小块的形式验证库的行为。 保持覆盖率接近 100%，在此处测试极端情况和内部行为
2. Cypress 测试 - 与真正的 chrome 浏览器集成，能够测试时序、浏览器请求等。对于测试高级库行为、排序和验证请求很有用。 我们不应该在这里追求 100% 的覆盖率，因为不可能测试所有可能的组合。
3. TestCafe E2E 测试 - 与真实的 posthog 实例集成并向其发送数据。 最难编写和维护 - 保持这些非常高的水平

## 与另一个项目一起开发

安装 Yalc 以在另一个 JS 项目中链接本地版本的 `posthog-js`：`npm install -g yalc`

#### 运行此命令以链接本地版本

- 在`posthog-js`目录中：`yalcpublish`
- 在另一个目录中：`yalc add posthog-js`，然后安装依赖项
   （对于“posthog”，这意味着：“yalc add posthog-js && pnpm i && pnpm copy-scripts”）

#### 运行此命令以更新链接的本地版本

- 在另一个目录：`yalc update`，然后安装依赖项
   （对于“posthog”，这意味着：“yalc update && pnpm i && pnpm copy-scripts”）

#### 运行此命令以取消本地版本的链接

- 在另一个目录中：`yalc remove posthog-js`，然后安装依赖项
   （对于“posthog”，这意味着：“yalc remove posthog-js && pnpm i && pnpm copy-scripts”）

## 发布新版本

只需在您的 PR 上贴上“凹凸补丁/次要/主要”标签即可！ PR 合并后，将发布具有适当版本提升的新版本，并且依赖项将在 [posthog/PostHog](https://github.com/posthog/PostHog) 中自动更新。
 
如果您想发布没有 PR 的新版本（例如，因为您忘记使用标签），请查看 `master` 分支并运行 `npm version [major | 次要| patch] && git push --tags` - 这将像标签一样触发自动发布过程。

### 售前赛

要发布 alpha 或 beta 版本，您需要在本地使用 CLI：

1. 确保您是 npm 中 `posthog-js` 的协作者（[检查此处](https://www.npmjs.com/package/posthog-js)）。
2. 确保您已登录 npm CLI（“npm login”）。
3. 检查您正在进行的分支（不要从“master”发布 alpha/beta）。
4. 使用与 PR 相同的凹凸级别（主要/次要/补丁）运行以下命令：
     ````bash
     npm 版本 [premajor | 初级| 预补丁] --preid=beta
     npm 发布 --tag beta
     git push --标签
     ````
5.享受新的预发布版本。 您现在可以在本地、虚拟应用程序或[主存储库](https://github.com/posthog/PostHog)中使用它。