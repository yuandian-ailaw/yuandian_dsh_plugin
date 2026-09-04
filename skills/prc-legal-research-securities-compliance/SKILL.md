---
name: prc-legal-research-securities-compliance
description: >
  中国证券合规检索助手。适用于证券行业法规与法条检索、监管案例（行政处罚/监管函/警示函等）
  查询、上市公司公告检索、以及证券法律问题的语义检索。覆盖场景：按法规名 + 条款号精确查询
  证券法规条文、按主题关键词检索证券行业法规法条、按公司名/处罚机构/监管类型检索监管案例、
  按公司名/股票简称检索上市公司公告、通过自然语言做证券法律语义检索。本 skill **仅覆盖
  中国大陆证券监管体系**——不涉及香港证监会(SFC)/美国 SEC/FCA 等其他法域。
argument-hint: "[法规名 + 条款号 | 公司名 | 监管类型 | 主题关键词 | 自然语言问题]"
whenToUse: >
  运行前先探测 yuandian-securities mcp 是否连通；未连通时停止并提示我先配置 MCP。
---

## DeepSeek Harness 连接说明

本插件统一连接 `https://open.chineselaw.com/mcp` 聚合入口；上游正文中的 `yuandian-law`、`yuandian-case`、`yuandian-company`、`yuandian-securities` 分类服务均由该入口提供。

在 DeepSeek Harness 中，元典原始工具名会加服务器命名空间：正文中的 `yuandian_*` 对应 `mcp__yuandian__yuandian_*`。调用时必须使用实际发现到的完整工具名，不要自行拼造未发现的名称。

# 中国证券合规检索

## 适用范围（先读）

本 skill 通过 `yuandian-securities` MCP 接入元典证券合规数据库，**仅中国大陆证券监管体系适用**。

**不要在以下场景使用本 skill：**

- **非中国大陆证券监管事项**（如香港证监会 SFC / 美国 SEC / 英国 FCA 等）：本 skill 不覆盖。
- **非证券领域的法律法规检索**（如刑法、民法典、劳动法等通用法规） — 建议使用 `prc-legal-research-law-search`。
- **需要查找案例判决** — 建议使用 `prc-legal-research-case-search`。
- **需要查询企业信息** — 建议使用 `prc-legal-research-company-search`。
- **需要综合分析法律问题、输出研究报告** — 建议使用 `prc-legal-research-deep-research`。
- **起草法律文件、表格或模板** — 超出本 skill 范围。
- **穷举式检索**（如"找出所有被证监会处罚的公司"） — MCP 有返回数量限制，无法保证穷举。

## 前置条件 / 连接器探测

`yuandian-securities` MCP 必须实际连通才能使用。

**严禁仅凭配置文件声明就认为连接器可用**——必须实际探测一次轻量级 capability（如 `yuandian_rh_fg_zq_search` 传最小参数）成功后才往下走。失败标 `[连接器未核验]` 并停止：

```text
元典证券合规检索工具未连接（或探测失败）。请确认对应的 MCP 服务器 API 凭据已配置、
网络可达，并在重启 agent 后重试。订阅与凭据问题联系数据源方（元典开放平台
https://open.chineselaw.com/，支持邮箱 yuandianzonghe@thunisoft.com）。
```

## 第一步：分析查询意图

从对话上下文中获取用户的查询需求，无需用户重复输入。分析用户的需求，确定检索策略：

**证券法规精确查询**（已知法规名称）：
- 用户提供法规名称 + 条款号 → 调用 `yuandian_rh_ft_detail` 获取法条详情。
- 用户提供法规名称但未指定条款 → 调用 `yuandian_rh_fg_detail` 获取法规全文。

**证券法规主题检索**（按内容查找）：
- 提炼核心关键词（如"内幕交易""信息披露""操纵市场""短线交易"）。
- 调用 `yuandian_rh_fg_zq_search`（证券行业法规关键词检索）或 `yuandian_rh_ft_zq_search`（证券行业法条关键词检索）。
- 确定筛选条件：`sxx="现行有效"`（默认优先），`xljb_1` 效力级别。

**证券法律语义检索**（模糊/自然语言描述）：
- 直接用自然语言描述问题，调用 `yuandian_law_vector_zq_search`。
- 可选过滤：时效性（`sxx`）、一级效力级别（`effect1`）、实施日期范围。

**监管案例检索**（查找处罚案例）：
- 根据用户需求组合填写筛选项，调用`yuandian_rh_zqcfws_search`（监管案例检索）。

**上市公司公告检索**：
- 根据用户需求组合填写筛选项，调用`yuandian_rh_ssgsgg_search`（上市公司公告检索）。


## 第二步：执行检索

### 工具选择矩阵

| 场景 | 首选 MCP 工具 | 补充工具 |
|------|--------------|----------|
| 已知证券法规名称 + 条款号 | `yuandian_rh_ft_detail` | `yuandian_rh_fg_detail` 查上下文 |
| 已知证券法规名称，找相关条款 | `yuandian_rh_ft_zq_search`（fgmc=法规名） | `yuandian_rh_fg_detail` |
| 证券法规主题关键词检索 | `yuandian_rh_fg_zq_search` | `yuandian_law_vector_zq_search` |
| 证券法条主题关键词检索 | `yuandian_rh_ft_zq_search` | `yuandian_law_vector_zq_search` |
| 查找某公司的监管案例 | `yuandian_rh_zqcfws_search`（company=公司名） | — |
| 查找某类型监管案例 | `yuandian_rh_zqcfws_search`（jglb=监管类型） | — |
| 查找特定时间段处罚案例 | `yuandian_rh_zqcfws_search`（cfsj_start/end） | — |
| 查找上市公司公告 | `yuandian_rh_ssgsgg_search`（name/jc） | — |
| 证券法律语义检索 | `yuandian_law_vector_zq_search` | `yuandian_rh_ft_zq_search` |
| 需要法规完整上下文 | `yuandian_rh_fg_detail` | — |

### 关键词检索 vs 语义检索使用原则

- **关键词检索**：已知具体法规名称/法条号，或已提取出精确术语（如"内幕交易""信息披露义务"）。
- **语义检索**：问题模糊、口语描述、术语不确定，或需发现跨法规潜在相关条文。
- **关键词召回 < 3 条相关结果时**，降级到语义检索补充。

### MCP 工具说明

**`yuandian_rh_fg_detail`** — 法规详情
- 参数：`fgmc`（法规名）或 `id`，可选 `refer_date`（参考日期）。

**`yuandian_rh_ft_detail`** — 法条详情
- 参数：`fgmc`（法规名）+ `ftnum`（条款号，如"第一百条"），或 `id`。
- 返回：法条原文、时效状态、效力级别、发布日期。

**`yuandian_rh_fg_zq_search`** — 证券行业法规关键词检索
- 参数：`keyword`、`sxx`、`xljb_1`、`top_k`。

**`yuandian_rh_ft_zq_search`** — 证券行业法条关键词检索
- 参数：`keyword`（必填）、`sxx`（时效性，默认"现行有效"）、`xljb_1`（效力级别）、`fgmc`（法规名过滤）、`top_k`（默认 10）。
- 返回：法条列表，每条含 `llm_content`（格式：`"- 《法规名》条款号##内容"`）。

**`yuandian_law_vector_zq_search`** — 证券行业法律法规语义检索
- 参数：`query`（自然语言描述）、`sxx`（列表，如 `["现行有效"]`）、`return_num`。
- 返回：按语义相似度排序的法条列表，每条含 `score`。

**`yuandian_rh_zqcfws_search`** — 监管案例关键词检索
- 参数（均为可选，但请求体不能为空）：`search_mode`、`title`、`content`（全文关键词）、`company`、`cfzt`、`cfjg`、`jglb`、`cfsj_start`/`cfsj_end`、`top_k`。
- 返回：案例列表，每条含 `标题`、`公司全称`、`处罚机构`、`处罚时间`、`监管类型`、`内容` 等。

**`yuandian_rh_ssgsgg_search`** — 上市公司公告关键词检索
- 参数（均为可选，但请求体不能为空）：`search_mode`、`title`、`name`、`jc`、`content`、`market`、`area`、`zsx_type`、`fbrq_start`/`fbrq_end`、`top_k`。
- 返回：公告列表，每条含 `标题`、`公司全称`、`股票简称`、`公告发布时间`、`内容`（命中片段）等。


## 第三步：输出结果

以清晰格式在对话中直接呈现，**无需保存文件**。

### 法条/法规格式

```
《{法规全名}》{条款号}
{条文原文（完整）}

时效状态：现行有效 / 失效 / 已被修改 / 部分失效
效力级别：法律 / 行政法规 / 部门规章 / 司法解释 / 行业/团体规范 / ...
发布日期：YYYY-MM-DD  |  施行日期：YYYY-MM-DD
发布机关：{机关名称}
```

### 监管案例格式

```
【{监管类型}】{标题}
公司：{公司全称}
处罚机构：{处罚机构}
处罚时间：{处罚时间}
处罚字号：{处罚字号}

{内容摘要（从content字段提取关键信息）}
```

### 上市公司公告格式

```
《{标题}》
公司：{公司全称}（{股票简称}，{股票代码}）
公告时间：{公告发布时间}
交易所：{股票上市交易所}

{内容摘要（从content字段提取关键信息，注意content可能为包含HTML表格的长文本）}
```

### 多条命中排序规则

1. 法规/法条：效力级别高的优先（法律 > 行政法规 > 部门规章 > 司法解释 > 行业/团体规范 > 其他）。
2. 同效力级别内，现行有效的优先于失效。
3. 语义检索结果按 `score` 降序排列，附相似度分数。
4. 监管案例/公告：按时间倒序排列（最新的在前）。

### 失效 / 已修改的处理

如检索到的法条已失效或已被修改，**必须明确标注**，并尝试检索当前有效版本：

```
⚠️ 注意：《{法规名}》已于 {日期} 失效 / 修改
当前有效规定见：《{新法规名}》{条款号}
{新条文内容}
```

### 语义检索结果

语义检索结果附上相似度分数（score）供参考，score 越高越相关：

```
（语义相似度：{score:.3f}）
《{法规名}》{条款号}
{条文内容}
```

## 来源标签三级分级

- `[settled - 元典证券 YYYY-MM-DD 确认]`：稳定主条款经 MCP 实际返回且对照当前日期已确认现行有效。YYYY-MM-DD 为本次检索日期。
- `[元典证券]`：本会话内通过 `yuandian-securities` MCP 实际返回的内容。这是默认标签。
- `[verify - 需对照元典原文]`：检索命中但仍需用户对照原文核实的内容（如 ad-hoc 主题检索召回的边缘条文）。
- `[模型知识 — 需核验]`：未经 MCP 核验、来自模型记忆的内容。**仅在 MCP 不可用时使用**，并必须明示模型记忆出处不可作为法律依据。

## 工作约束

- **不编造内容**：所有条文、案例、公告内容必须来自 MCP 工具实际返回结果，未检索到时如实告知 `[模型知识 — 需核验]`。
- **时效优先**：优先呈现 `sxx=现行有效` 的法规条文，失效条文需明确标注。
- **效力层级**：呈现多条结果时说明各条文的效力级别关系。
- **歧义处理**：同名法规有多个版本时，优先返回现行有效版本，并注明版本信息。
- **公告内容截断**：上市公司公告的 `content` 字段可能包含大量 HTML 表格和长文本，呈现时提取关键段落，注明"内容已截断，完整内容见原文"。
- **来源标签**：所有引用按三级分级标注；未经 MCP 核验的内容标注 `[模型知识 — 需核验]`。

## 工作成果头部

按 profile 中角色 + 法域决定：

- 律师 + 美国法上下文：`PRIVILEGED & CONFIDENTIAL — ATTORNEY WORK PRODUCT — PREPARED AT THE DIRECTION OF COUNSEL`（**本 skill 是中国法 cluster，不适用**）
- 律师 + 中国法：`保密 / 内部法律分析 — 仅供法务团队使用 — 不构成外发法律意见`
- 非律师：`研究笔记 / 内部记录 — 不构成法律意见 — 请律师复核后再依赖`

外发给业务方 / 客户的版本去工作成果头。

## 非律师门

法规/案例检索本身是事实查询（"该法规如何规定""某公司受到何种处罚"），不必每次都触发非律师门。但当用户**基于本 skill 检索的内容做具体决策**（出具法律意见、向监管机构提交、起草诉讼文件、客户回函等）时，先 surface：

```text
本 skill 返回的证券法规/案例/公告是研究材料——汇集了元典证券合规数据库的现行信息。
它不是对你具体事实的法律意见。

如果计划基于这些内容做具体决策（给客户回函、监管提交、诉讼起草），
是否已与律师 / 有执业资格的法律人员复核过？
- 是：明确确认后继续
- 否：建议先与律师复核相关内容在你具体场景下的适用与边界
```

## 交接

- 用户问题超出证券合规检索 → `prc-legal-research-deep-research`（8 阶段研究备忘录）。
- 涉及非证券领域法规 → `prc-legal-research-law-search`。
- 涉及案例 → `prc-legal-research-case-search`。
- 涉及企业信息 → `prc-legal-research-company-search`。
- 用户问题涉及业务场景（合同 / 隐私 / 监管） → 对应 cluster 的 review skill，配合本 skill 的检索作为支撑：
  - 商事合同：`commercial-contract-review` 等。
  - 数据隐私：`privacy-use-case-triage` / `privacy-reg-gap-analysis` 等。
  - 监管合规：`regulatory-policy-diff` / `regulatory-gap-surfacer` 等。

## 本 skill 不做的事

- 不对非中国大陆证券监管事项使用——香港/美国/英国等法域请走当地商业法律研究服务。
- 不在 `yuandian-securities` MCP 不可达时尝试用模型知识"模拟"检索。
- 不编造法规条文、不伪造案例内容、不虚构公告信息。
- 不替代律师做具体事实下的法律判断。
- 不保留 Claude 专属配置路径。
- 不要求用户调用 Claude slash command。

## 数据来源

- MCP server：`yuandian-securities`（http stream，订阅管理）
- 数据来源：元典开放平台（北京华宇元典信息服务有限公司）
- API 文档：https://open.chineselaw.com/
- 支持邮箱：yuandianzonghe@thunisoft.com
