# 复跑说明

## 先读范围

此包是 Windows 下的真实网页宿主交互证据，不是点开即用的安装器。所有测试使用新的目录、合成会话和本地假模型。不要把脚本接到日常 DSH_HOME 或真实工作流。

固定源码为 `47dc2dacca02fae36f3b9215fba535cd4a9e79a9`；插件运行文件来自官方 npm 0.6.0 tarball，不用本地重构建替代。原始 lib 摘要必须与 `NPM_ARTIFACT_VERIFICATION.json` 相符。

## 准备依赖

使用成熟的 Git、pnpm、npm 和 Playwright：

1. 在新目录克隆 `xiaoso456/dsh-workflow-lite`，checkout 上述完整提交。
2. 在源码目录按锁文件执行 `pnpm install --frozen-lockfile --ignore-scripts`。
3. 下载 npm 0.6.0 tarball，先核对 npm SHA-512 integrity 与本报告 SHA-256，再解压到独立 `package` 目录。
4. 将该 `package/node_modules` 链接至固定源码的 `node_modules`。本次 Windows 使用 directory junction；这复用的是固定依赖，不修改官方 lib。
5. 在独立工具目录安装 `@deepseek-ai/dsh@0.2.1-rc.2`、`@deepseek-ai/dsh-base@0.2.1-rc.2`、`@deepseek-ai/dsh-web-app@0.2.1-rc.2`、`playwright@1.62.1`。本轮安装阶段禁用自动脚本。
6. 使用本机浏览器独立启动。本轮实测 Chromium 153.0.8010.12；其他内核未验。

## 设置本机路径

这些值只在本机设置，不公开真实值：

```powershell
$env:WORKFLOW_LITE_SOURCE = '<固定源码绝对路径>'
$env:WORKFLOW_LITE_PACKAGE = '<官方发布包解压后的 package 绝对路径>'
$env:REVIEW_NODE_MODULES_PACKAGE = '<工具目录的 package.json 绝对路径>'
$env:REVIEW_DSH_BIN = '<工具目录的 node_modules/.bin/dsh.cmd 绝对路径>'
$env:REVIEW_BROWSER = '<已安装浏览器的可执行文件绝对路径>'
```

脚本会在自身所在目录下创建独立 `isolated-home`、`data`、`synthetic-workspace`，以及仅本机使用的 `private-runtime.json`。后者包含测试会话鉴权信息，不要公开。

## 执行顺序

第一个终端留着宿主：

```powershell
node scripts/boot-review.mjs
```

第二个终端继承相同环境，依次执行：

```powershell
node scripts/prepare-page.mjs
node scripts/interaction-probes.mjs
node scripts/conflict-probe.mjs
node scripts/late-save-probe.mjs
node scripts/toolbar-probe.mjs
node scripts/probe-run-draft-isolation.mjs
node scripts/probe-inflight-run-edit.mjs
node scripts/probe-status-menu.mjs
node scripts/probe-narrow-run-panel.mjs
node scripts/probe-import-failure.mjs
```

停止时在 `scripts/` 下新建名为 `STOP` 的普通文件；宿主和浏览器只关闭本脚本创建的进程。再次启动前将该停止标记移走。为比较冷启动，保留上一次输出后再运行。

`prepare-page` 和实例准备复用了固定源码已有 helper，源码目录必须保留。脚本不修改目标产品源文件。

## 如何读结果

- 退出码 0：驱动完成，不等于插件无问题。
- 每组 JSON 的 `confirmed`、`F09.choicesResetConfirmed`、文件和请求字段，才是本轮现象判据。
- F01：步骤 2→1、连线 1→0，模态框仍开着。
- F02：真实 conflict 后切走，回来本地草稿丢失。
- F03：640px 视口下三个关键入口 `hit=false`。
- F04：正常对照保留外部提示词；迟到回包条件下被覆盖，B 误带 A 哈希。
- F05：B 保存前 start=pending，接入 A 草稿后保存为 skipped。
- F06：正常第二次编辑可保存；延迟回包条件下 finish 从 failed 返回 pending 且本地草稿被清空。
- F07：中央所有项可命中；底部菜单超过容器，失败等项 `hit=false`。
- F09：真实写入失败后请求从 merge 变成 new，另存副本。

导入测试只向本轮合成目录创建一个空目录作为版本写入障碍，并移除该空目录。包中没有 Skill；不要将其改接真实资料。

F08、O01 只读作已验行为观察，不计入 8 项确定问题。F08 的旧辅助选择器读数未参与判断。

公开 JSON/日志已替换本机路径、回环端口，并对暂存 token 做确定性摘要；它们不是无需配置即可直接重放的私有运行状态。脚本文件按实际执行字节公开，未经过通用脱敏替换。截图为路径遮罩副本，修改区域列在 `PROVENANCE.json`。
