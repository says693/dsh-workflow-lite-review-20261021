# dsh-workflow-lite 0.6.0：交互与运行状态复核

本报告是**体验快测／功能复核**，不是模型能力评价。日期为 2026-10-21。8 项确定问题，2 项单列行为观察；不给总分、星级或五状态，不声称整体“通过”或“合格”。

## 结论与范围

| 编号 | 本轮确定问题 | 实际影响 | 建议顺序 |
|---|---|---|---|
| F01 | 计划预览弹窗的 Delete 穿透到底层画布 | 步骤与连线被删除并自动保存 | P1 |
| F02 | 保存失败或冲突未解决仍可切换 | 未保存草稿丢失；失败时预览仍编译旧稿 | P1 |
| F03 | 窄窗口顶栏未收纳操作 | 预览和执行入口被裁掉 | P2 |
| F04 | A 的迟到保存回包污染 B 的基线 | B 的并行编辑可被静默覆盖 | P1，条件性 |
| F05 | 运行实例之间串草稿 | A 的状态与说明进入 B，确认保存后写入 B | P1 |
| F06 | 保存期间的后加编辑被成功回包清空 | 编辑既未写入服务器，也未保留本地草稿 | P1，条件性 |
| F07 | 画布底部状态菜单未向上避让 | 失败、跳过、设为下一步等项失去鼠标可达性 | P2 |
| F09 | 导入失败后重置目标与冲突策略 | 重试原合并操作会变成另存副本 | P2 |

P1/P2 仅是修复顺序建议，由维护者决定实际级别。编号按发现顺序保留；F08 未计入确定问题。

## 对象、发布件与环境

- 仓库：`xiaoso456/dsh-workflow-lite`，包名 `@xiaoso/dsh-workflow-lite`。
- 实测源码提交：`47dc2dacca02fae36f3b9215fba535cd4a9e79a9`。
- 投稿前只读核验，上游 HEAD 仍为上述提交，npm 当前版本仍为 0.6.0。
- 官方发布包：`https://registry.npmjs.org/@xiaoso/dsh-workflow-lite/-/dsh-workflow-lite-0.6.0.tgz`。
- tarball SHA-256：`dd0fba388faef7a2eb682cc2e63343eb11f05ea083af8123c9b553d367d85d79`；npm SHA-512 integrity 已独立核对。
- 发布包 `lib/client.js` SHA-256：`20aeb3b12a0910261850eeda89133355ff2167e63dc223d17f4a489744657913`。
- 发布包 `lib/index.mjs` SHA-256：`d48179b6893b565d44fcba6337b581357d82ab057cc628608d6bfee0f49a1336`。
- Windows 11、Node 24.19.0、DSH 0.2.1-rc.2、Playwright 1.62.1、Chromium 153.0.8010.12，中文浅色。

先前两轮在固定源码构建件上测量，并对关键项冷重启复跑。投稿前追加加载官方 tgz 的原始前后端文件，8 项全部再次复现。本公开包主要展示这次官方发布件补验的读数，未修改目标 `lib`。

发布件复用固定源码依赖目录；**不是另一台机器、全新依赖缓存的安装测试**。宿主、数据、浏览器会话均独立；会话准备仅用本地假模型，未测试真实模型效果。

本地构建的客户端哈希与发布件不同，因此本报告没有只凭“同一版本号”替代发布件验证。具体见 [发布件核验](NPM_ARTIFACT_VERIFICATION.json) 和 [实际加载摘要](evidence/loaded-artifact.json)。

## F01：预览计划时误删画布节点

复现：建立两步骤一连线 → 选中第一步 → 打开计划预览 → 焦点在弹窗内按 Delete → 保持弹窗打开，从宿主读回工作流。

预期：预览弹窗不应触发底层编辑器删除。

实测：步骤 `2 → 1`，连线 `1 → 0`，自动写盘；弹窗仍打开并显示原两步骤计划。这不是仅 DOM 显示差异；可就地撤销，因此不夸大为必然不可恢复。

原因：[PlanDialog.tsx:99](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/client/ui/PlanDialog.tsx#L99)仅拦 Escape，其他键冒泡到 [WorkflowView.tsx:639](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/client/ui/WorkflowView.tsx#L639)。项目已有隔离键盘事件的 Modal，应统一复用。

证据：[交互读数](evidence/interaction-results.json)、[请求与读回](evidence/interaction-rpc-log.json)。

![预览仍开着，节点已经被删除并保存](images/F01-preview-delete.png)

## F02：冲突未解决，切换就丢本地草稿

复现：界面打开 A → 第二编辑者通过真实宿主修改同一个步骤名称 → 本地修改该名称 → 等到真实 `conflict` 和“保留我的／用磁盘的”提示 → 不解决冲突，直接切到 B 再回来。

实测：本地“我的冲突草稿应保留”消失，回来只有磁盘上的“另一位编辑者保存的名称”。没有伪造这次冲突响应。

另以明确标注的保存失败注入复核：界面已显示保存失败，预览仍显示磁盘旧名称，不含新稿。作为同根因的邻近行为，不另计一项。

原因：[useWorkflow.ts:235](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/client/app/useWorkflow.ts#L235)内部 flush 失败后只返回；[open:292](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/client/app/useWorkflow.ts#L292)仍进入加载并重置旧状态，[buildPlan:443](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/client/app/useWorkflow.ts#L443)继续编译磁盘稿。应复用已有明确成功判据，保留失败草稿，而非放行后续操作。

证据：[真实冲突](evidence/real-conflict-results.json)、[保存失败注入](evidence/interaction-results.json)。

## F03：窄窗口操作入口被裁掉

正常调整浏览器宽度，无目标 CSS 修改。测量实际元素矩形并核对中心点命中：

| 视口 | 插件实际宽度 | 结果 |
|---|---:|---|
| 1024 × 768 | 737px | 这处顶栏裁切未出现 |
| 720 × 768 | 657px | 执行下拉右侧越界约 24px，中心点不可点击 |
| 680 × 768 | 617px | 执行主按钮也不可点击 |
| 640 × 768 | 577px | 预览、执行、执行下拉中心点均不可点击 |

宿主侧栏有自己的断点，不能只用浏览器宽度减固定侧栏宽度。

原因：[顶栏](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/client/ui/shell.module.css#L480)单行 flex、按钮组不收缩；[窄视图规则](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/client/ui/topbar.module.css#L675)只隐藏文字，没有收纳操作；外壳最终裁切右侧。应按容器可用宽度组织操作，而非仅缩小字号。

证据：[尺寸和命中读数](evidence/toolbar-results.json)。

![640px 窗口下预览和执行入口出界](images/F03-toolbar.png)

## F04：迟到回包污染另一张工作流的保存基线

条件：测试刻意扣留 A 的**真实成功回包**，没有修改响应内容。

复现：A 修改并保存 → 宿主已完成但回包暂扣 → 切到 B → 释放 A 回包 → 第二编辑者修改 B 的提示词 → 本地只改 B 的名称并保存。

| 核对 | 正常对照 | 存在迟到 A 回包 |
|---|---|---|
| 第二编辑者的新提示词 | 保留 | 被旧提示词覆盖 |
| B 请求携带的基线 | B 的基线 | A 回包哈希 |
| 界面反馈 | 已保存 | 仍显示已保存 |

不是每次普通点击都触发的现象；成立条件是保存未结算就切换，并随后发生并行编辑。

原因：[save 回调:192](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/client/app/useWorkflow.ts#L192)未校验当前文档身份，状态机接受了错误基线；[仓储:737](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/host/store/repository.ts#L737)查不到基线后继续合并，使旧内容被当成本地修改覆盖。

应把回包绑定工作流身份与加载代次；显式基线失配不应静默降级。加长等待时间不能修复身份错误。

证据：[完整请求与正常对照](evidence/late-save-results.json)。

## F05：运行实例串草稿，且能写入错误实例

无需故障注入。A/B 具有同样步骤 ID，是复用同一流程结构的常见情形。

复现：B 将 `finish` 改为失败，填写“仅属于B的草稿说明”，不保存 → 切 A，已能看到 B 草稿 → A 将 `start` 标为跳过，说明改为“仅属于A的草稿说明” → 切回 B → 关闭模型通知，保存。

实测：B 的说明变为 A 的说明；B 真实状态文件 `start: pending → skipped`。请求目标确为 B。这不是只显示错了，也不是迟到网络响应。

原因：[草稿持久化 effect:303](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/client/app/useRuns.ts#L303)先于[实例恢复 effect:349](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/client/app/useRuns.ts#L349)执行，用新实例 ID 写入了旧 state；恢复时读回已污染的草稿。[RunView](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/client/ui/WorkflowView.tsx#L744)在切实例时仍被复用。

修复应为草稿建立明确的实例归属，身份匹配后才持久化。与 F04 的模板基线竞态不是同一根因。

证据：[草稿、状态文件及真实请求](evidence/F05-run-draft-isolation.json)。

![正在查看 B，草稿说明却属于 A](images/F05-cross-instance.png)

## F06：同一实例保存成功时，后加编辑消失

正常对照：先保存 `start=skipped`，完成后再改并保存 `finish=failed`，两项均保留。

延迟条件：扣留第一次真实成功回包 → 保存按钮禁用，但状态菜单仍能编辑 → 将 `finish` 改为失败，本地草稿已记下 → 释放回包。

实测：`finish: failed → pending`；本地草稿清空；真实状态文件仍为 pending。后加修改既没写到服务器，也没留给下一次保存。

原因：[useRun.save:463](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/client/app/useRuns.ts#L463)发送的是当时编辑，但[成功回调:491](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/client/app/useRuns.ts#L491)清空了全部当前草稿。应只确认已提交修订，保留后加编辑；或完整冻结相关编辑入口。与 F02 的保存失败和切换丢稿不同。

证据：[延迟响应与正常对照](evidence/F06-inflight-run-edit.json)。

## F07：底部状态菜单向下出界

1440 × 900 视口，先在中央打开状态菜单，所有项中心点可命中；用真实鼠标把节点移到画布下部再打开。

实测：插件底边 900px；菜单从 773px 延伸到 1034px，高 261px；“失败、跳过、设为下一步”中心点均不可命中。节点仍在画布中，菜单没有向上翻转。

宽屏右侧面板仍有部分同类动作，不夸大成所有状态功能消失。

原因：[RunView.tsx:295](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/client/ui/RunView.tsx#L295)只夹紧 X；Y 直接取小标底边加间距。应复用已有浮层定位能力，处理垂直翻转与高度。

证据：[中央对照、底部矩形和命中](evidence/F07-status-menu.json)。

![底部状态菜单后半部分被窗口裁掉](images/F07-menu.png)

## F09：导入失败后，重试变成另一目标

先以真实官方导出生成无 Skill 包，并完成正常合并对照。再用本轮新建空目录占住下一版本文件路径，制造真实且可恢复的写入失败；不改宿主代码、不伪造错误响应。

界面选择“并入已有的”“用包里的资料”，确认导入 → EPERM → 移除测试空目录 → 按同样的“导入、确认”重试。

| 字段 | 第一次请求 | 重试请求 |
|---|---|---|
| mode | merge | new |
| 目标 | deep-import-failure | 自动另存的副本名 |
| 资料策略 | package | local |

实测确实新建了副本，原工作流没有完成合并。**新目标在界面和确认框中可见，不是绕过确认的后台隐蔽写入。**问题是错误恢复丢失用户决策。

原因：[进入 busy:189](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/client/ui/HubImport.tsx#L189)卸载预览；[失败后:203](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/client/ui/HubImport.tsx#L203)重新挂载，选项使用[默认新建策略](https://github.com/xiaoso456/dsh-workflow-lite/blob/47dc2dacca02fae36f3b9215fba535cd4a9e79a9/src/client/model/pack.ts#L150)。应将选择与本次导入任务绑定，错误后保留。

证据：[正常导入、失败请求、选项及重试目标](evidence/O01-import-partial-result.json)。

![报错后原合并目标变成另存新名字](images/F09-import-reset.png)

## 两项观察，不计入缺陷数

**F08：窄视图裁减运行详情。**同一节点在 `1440 → 1024 → 1440` 视口变化时，运行/编辑切换和面板开关存在数为 `1 → 0 → 1`；插件宽 737px 时详情不挂载。源码显式排除 narrow，但尚未明确承诺该宽度的完整功能，因此只记已验限制。辅助 `panelCount` 使用旧选择器，未参与判定；依据实际 testIds、入口存在性和截图。见 [F08 读数](evidence/F08-narrow-run-panel.json)。

**O01：导入失败已部分覆盖资料。**上述真实写入失败时，资料 guide.txt 已变成包内内容；工作流 JSON 哈希不变，版本数仍为 0。现有说明只承诺工作流主体最后写，未明确全事务回滚，因此记已验部分应用行为，事务契约待确认。与 F09 共享实验，不重复记次数。见 [文件对账](evidence/O01-import-partial-result.json)。

## 既有测试与失败记录

固定源码原有构建、类型、lint 成功；Vitest 55 个文件、888 条断言全绿。输入收集 9 步、版本管理 12 步、设置 6 步、运行记录 28 步正常链路完成。这些是此前源码轮的读数，不计成官方包又跑了一遍完整上游测试。

原画布浏览器脚本在第 17 步期待旧版资源说明位置而失败；现编译器已把说明移到任务文件。运行记录初次超时是驱动漏传数据目录。还有浏览器版本缺失、测试子进程权限、初始化未先产出类型声明等环境失败。均保留私有原记录；公开包不将它们算产品缺陷。

官方包冷启动复跑首次停在上次运行实例，准备驱动却等待模板控件；仅修正导航驱动，先点击现有“打开模板”再进行检查。原超时记录保留，未把它当产品失败或删掉记录后冒称一次全绿。

官方包追加验证只覆盖本报告的定向复现，不声称全面回归。复现脚本退出码 0 表示采集过程完成，**不表示产品无缺陷**；机器核验另见 [发布件复现汇总](PUBLISHED_REPLAY_VALIDATION.json)。

## 查重与新增边界

读取目标仓全部当前 issue 列表；查询悬赏仓包名、仓库名与作者，命中 #793、#795、#801、#805、#834，完整读取正文及各 1 条评论。它们主要测上下文成本，不是本次交互根因。另核对被引用的 #648/#653/#664，属于其他插件。

评测站该插件目录的公开评测数为 0；这只描述本次站内读数，不等于所有地方都无人报告。当前账号无匹配的既有 intake。未见本轮 8 项同根因报告；不保证穷尽、不宣称绝对首报，若维护者指出重复将合并或撤回。

## 投稿性质与站点状态

本件与后续可能的评测站稿件是同一项贡献，不请求重复计分。难度建议 medium、影响建议 B，最终由维护者裁定。未修改产品，无修复 PR，不申请修复交付或安全审计成绩。

投稿前实读站内规范：体验快测不出五状态，线上表单却仅提供五状态且按标准测评收取。**本站草稿可保存，但本件不会自动选“还说不准”来绕过冲突，也未送审。**相关字段冲突另存 [站点边界](SITE_SCOPE_CONFLICT.md)。

## 已验、未验与不做

- 已验：固定源码两轮、官方包定向补验、真实网页宿主、文件及请求对账、故障条件明确的对照。
- 未验：原生桌面壳、其他系统、触摸、全部语言主题、真实模型效果、全新跨机安装、真实 Skill 安装、全面安全审计。
- 不确定：维护者最终级别、窄视图设计边界、整次导入的事务约定。
- 不做：冒充人工独立评审、修改目标源码、代替维护者确认修复、自动部署到用户日常环境。

原始私有报告、截图和记录保持原字节。公开证据副本遮罩了路径；JSON/日志中的本机路径、回环端口、暂存 token 作了有记录的替换。可执行脚本不经通用替换，按其实际执行字节公开。原件与公开件摘要见 [来源与脱敏记录](PROVENANCE.json)。
