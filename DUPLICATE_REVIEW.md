# 查重与上游状态

采集日：2026-10-21。目标仓 issue 列表含关闭项为空；包名、仓库名和作者检索命中下列记录，完整阅读正文和全部当前评论。

- [#793 【intake 输入】工作流插件"上下文税"横评：5 件实测 + 1 件装不上（同一任务/模型/宿主，每臂独立冷 profile；doublecheck +840 拆为 611 工具 + 229 技能）](https://github.com/FuRongJun-1999/dsh-bounty/issues/793)：已读正文及 1 条评论，主题为上下文成本；未见本轮相同交互根因。
- [#795 【intake 输入】工作流插件"上下文税"第 2 批：6 件实测（graph +7478 / ralph +413 / kanban +42 / spec-kit +44），另 2 件被版本门拒装](https://github.com/FuRongJun-1999/dsh-bounty/issues/795)：已读正文及 1 条评论，主题为上下文成本；未见本轮相同交互根因。
- [#801 【intake 输入】工作流插件"上下文税"第 3 批（自动化流水线）：8 件实测——plugin-debugging +1452、4 件零工具件 +42/+44，另 3 件被版本门拒装](https://github.com/FuRongJun-1999/dsh-bounty/issues/801)：已读正文及 1 条评论，主题为上下文成本；未见本轮相同交互根因。
- [#805 【intake 输入】工作流插件"上下文税"第 4 批：10 件实测——context-toolkit +1831 居次高；新发现 system 层注入渠道（dsh-ops +1007 / zen-remote +656）；另 3 件装上但非 profile 层](https://github.com/FuRongJun-1999/dsh-bounty/issues/805)：已读正文及 1 条评论，主题为上下文成本；未见本轮相同交互根因。
- [#834 【intake 输入】DSH 插件上下文成本评测**方法论对比**（4 类口径 × 33 臂实证 · 含 2 条方法学反例与 4 道流水线守卫）](https://github.com/FuRongJun-1999/dsh-bounty/issues/834)：已读正文及 1 条评论，主题为上下文成本；未见本轮相同交互根因。

另核对被引用的 #648/#653/#664，分别属于 advisor、doublecheck、specflow，不是本插件交互报告。
评测站该插件目录公开评测数为 0；当前账号未见匹配 intake。以上不证明绝对首报，发现重复将合并或撤回。

投稿前 HEAD 仍为 `47dc2dacca02fae36f3b9215fba535cd4a9e79a9`，npm 当前版本仍为 0.6.0。
