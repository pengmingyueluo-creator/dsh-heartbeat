# 给 AI 的自定义指南（dsh-heartbeat）

> 这份文件是写给**读代码改代码的 AI** 的。人也可以看，但目标是：
> 用户说一句"我想要个 XX 样子的小窗"，AI 看完这份就能动手，且知道**哪些改动会生效、哪些要重启**。

## 优先级总表（三套：闸门 / 显示 / 交互）

### 一、闸门优先级 —— 谁能拦住 agent（高→低）

| 级别 | 触发 | 后果（拦截方式） |
|---|---|---|
| 1 | **⏸ 暂停工作** | `hb` 打印 `⏸⏸ …` 并**退出码 3**；`phone` 一切操作（含 `status`/`shot`）被拒（exit 3） |
| 2 | **⛔ 接管** | `phone` 操作被拒并把 DSH 切回前台（exit 3） |
| 3 | 正常 | —— |

> 两个同时置位时**暂停优先**（实测）。

### 二、显示优先级 —— 同一时刻看哪一行、颜色谁赢

行的顺序（胶囊下方，从上到下）：**手机操控/接管行 → 余额提醒行 → 今日已用行 → 工作状态行 → 严重不足行（最底、闪烁、不可关）**。

| 元素 | 判定顺序（前面的赢） |
|---|---|
| 余额级别 | `critical`（<严重线）> `red` > `orange` > `ok`；读数 >300 秒额外变灰 |
| 胶囊数字 / 外框 | critical 或 red → 红；orange → 橙；ok → 绿；读数旧 → 灰 |
| 时段 | 峰价 → **红字**；谷价 → **绿字** |
| 边缘闪烁 | red/critical → 红边（默认 3 分钟一次）；orange → 橙边（默认 10 分钟一次）；各用**独立计时** |
| 工作状态行 | 已暂停（红）> 工作中（绿 + 转圈）> 空闲（灰） |

### 三、交互优先级 —— 用户动手时谁响应（高→低）

| 级别 | 交互 | 规则 |
|---|---|---|
| 1 | **控件**（⏸/▶、⛔接管、设置输入、口径按钮） | 按在按钮上时，拖动与长按彩蛋**都不抢** |
| 2 | **长按彩蛋（运转互动）** | 需**按住 1 秒**且期间未拖动才启动；启动后**锁住拖动**（防止你想挪开视线时把挂件拖走）；任何时刻松手立刻回绿 |
| 3 | **拖动** | 位移 >8px 才算拖动（低于阈值算点击）；彩蛋期间被锁；位置按真实尺寸钳制在屏内 |
| 4 | **点击** | 胶囊=展开/收起面板；余额行=按「余额提醒常驻」设置**停边缘闪**或**关掉该行**；手机行=收起 60 秒；今日已用行=收起 30 分钟 |

> 点击**不会**触发任何"强制刷新"（只有真的按住/待命/爆炸状态才会在松手时收尾）—— 这条是修过一个 bug 后定下的规矩。

---

## 0. 别人的 AI 怎么"记住"这套东西

安装脚本会把 `extras/AGENTS-snippet.md`（一份完整的使用说明：必调命令、四类中断协议、
手机操控收尾、全部设置项、改代码契约）**追加到你工作区的 `AGENTS.md`**，用
`<!-- dsh-heartbeat:begin -->` / `:end -->` 包起来；重复安装只会更新同一节、不会重复。
DSH 每次会话都会自动加载工作区 `AGENTS.md` ⇒ **对方的 AI 开箱就知道该怎么用、怎么改**。

手动装的话，把 `extras/AGENTS-snippet.md` 里的 `__WORKDIR__` 换成状态目录再贴进 `AGENTS.md` 即可。

## 0.5 全部设置项（`settings` / `POST /api/heartbeat/settings`）

| 键 | 默认 | 含义 |
|---|---|---|
| `mode` | `both` | `widget` / `stream` / `both` |
| `streamPort` | `0` | `0`=跟随 DSH 端口；`auto`=自动找空闲端口；或具体数字 |
| `orangeBelow` / `redBelow` | `10` / `5` | 余额橙线 / 红线 |
| `criticalBelow` | `1` | 严重不足线（闪烁红条 + `hb` 🚨 + `guard.level="critical"`） |
| `dailyCostAlert` | `10` | 今日花费提醒线（橙色 `rowDaily`） |
| `todayMode` | `actual` | `actual` 实际结算 / `estimate` 估值（决定 `state.today` 与提醒用哪个口径） |
| `viz` | `true` | 余额与消耗可视化（条形 + 充值行） |
| `balanceAlert` | `true` | 余额提醒常驻（关掉=点行可关、不闪边缘） |
| `idleGraceSec` | `15` | 空闲判定秒数（`working` 的宽限） |
| `flashEveryMin` / `flashRedMin` | `10` / `3` | 边缘闪烁间隔（橙 / 红，各用独立计时） |
| `eggInteractive` | `true` | 运转互动（长按彩蛋）开关；需按住 1 秒且未拖动，启动后锁住拖动 |
| `ctxBar` | `true` | 上下文进度条开关 |
| `phoneTtlSec` | `8` | 手机横幅保留秒数 |
| `pauseIdleMin` | `5` | 暂停自动转空闲的分钟数（0=永不） |

> 刷新间隔（0.5~10s，默认 1）不走宿主，存在 localStorage 键 `dshhb-refresh`。

## 1. 三个文件的分工

| 文件 | 角色 | 改完要做什么 |
|---|---|---|
| `lib/core.cjs` | **数据核心**：采集余额/峰谷/上下文/CPU/磁盘/手机横幅/中断状态，导出 `createCore()` | 宿主代码 → **要重启 App** |
| `lib/index.js` | **宿主半侧**：注册路由、把挂件注入页面、处理模式/设置 | 同上（**要重启 App**） |
| `lib/board.html` | **串流页**（浏览器/小窗里看的完整看板） | 每请求现读，**刷新页面即可** |
| `lib/widget.js` | **页面挂件**（注入 DSH 页面里的那个小窗） | 每请求现读 + 自带版本号 → **用户什么都不用做** |

## 2. 两条铁律

1. **改 `lib/widget.js` 后，必须把文件顶部的 `var SELF_VER = N;` 加 1。**
   挂件每 30 秒取一次服务端的 `widget.js`，比对自己内嵌的 `SELF_VER`，不同就自己换掉自己。
   **忘了加 1 = 用户永远看不到你的改动。**
2. **改 `core.cjs` / `index.js` 要重启 DSH App 才生效**（宿主半侧在进程启动时加载）。
   用户重启有成本（无障碍权限可能要被标记故障），所以**攒着一起改**。

> App 内的 WebView **没有下拉刷新**。所以要看到 `board.html` 的改动，得重启 App 或改用浏览器打开。

## 3. 数据契约：`GET /api/heartbeat/state`

挂件/看板都只依赖这个接口。字段如下（改 `core.cjs` 的 `state()` 就能加字段）：

| 字段 | 含义 |
|---|---|
| `v` | 看板版本号（`core.cjs` 的 `PAGE_VERSION`） |
| `aliveSec` | 服务存活秒数 |
| `balance` | `{currency, total, at, ageSec}`，余额与**读数时间**（`ageSec` 用于显示"12s前"、超 300s 变灰） |
| `peak` | `{peak, weekend, weekendOffpeak, bandPct, nextInSec, nextPeak, price{uncachedInputPerMillion, cacheReadPerMillion, outputPerMillion}}` |
| `turn` | `{n, step, cost, lastStepCost, prev[]}` 本轮累计消耗（落盘，重启不丢） |
| `step` / `progressAgoSec` / `busyLeftSec` / `busyCapped` | 当前进度（`hb` 写的） |
| `working` / `idleSec` | 是否在干活 / 空闲多久 |
| `cpuPct` / `rssMB` / `disk{freeGB,usedPct}` / `running` | 宿主资源；`running` 是**最近启动**的子进程命令行 |
| `todayActual` / `todayEstimate` / `dayStart` | 今日实际 / 今日估值 / 今日原有（当天首次读到的余额） |
| `todayTopup` | 今日已充值（**估算**）：增量法，余额意外变多就累计 |
| `today` | `{requests, tokens, cost, buckets, fromSeries}` **今日**用量（按北京日期汇总统计接口的小时桶；宿主要是旧版，挂件会自己拉 `/api/token-usage-stats` 兜底） |
| `todayPeak` / `todayPeakHour` | 今日**最忙那一小时**的 token 量与小时数 |
| `sessionCount` / `avgSession` | 今日动过的**会话数**与**平均每会话 token** |
| `tokens` | `{requests, total, cost, sessionCost, sessionRequests}`（累计与本次会话） |
| `ctx` | `{sessionId, ctxPct, pressPct, surface, window, totals, last}` 上下文压力 |
| `phone` | `{on, text, ageSec, src}`（超过 `settings.phoneTtlSec` 即视为已停；agent 可调 `phone-done` 立刻撤掉） |
| ~~`phone`~~ | `{on, text, ageSec, src}` 手机操控横幅（`src`: `auto`哨兵 / `hbp`手工 / `counter`计数器兜底） |
| `sentinel` | `{installed, path}` 哨兵是否在位 |
| `interrupt` | `{on, ageSec, reason}` 接管中断状态 |
| `guard` | `{level: ok\|orange\|red, balance, orangeBelow, redBelow, at}` 余额分级 |

**注意（v36 起）**：余额提醒行**不可关闭**（点它只静音边缘闪烁，级别变化会重新闪）；
边缘闪烁**橙区闪橙、红区闪红**；胶囊上的时段文字 **峰价=红字 / 谷价=绿字**。
| `mode` / `settings` | 当前模式与全部设置 |
| `bjTime` / `bjDate` | 北京时间 |

`index.js` 另外附加：`streamPortActual`（独立串流端口，0=没开）、`widgetVersion`。

## 3.5 挂件结构（v34+）：胶囊 + 挂在它下面的"行"

```
[面板 ⌄]                      ← 点胶囊展开（数据 / 设置 / ⛔ 接管）
[🐳 ¥9.94 · 谷价 · 工作中]     ← 胶囊本体（拖动把手，位置存 localStorage: dshhb-pos）
[⚠️ 正在操控手机   (⛔ 接管)]  ← 行①：仅当 phone.on / interrupt.on；点行=收起 60s
[⛔ 余额 ¥9.58]              ← 行②：余额进橙/红区**常驻不可关**；点行=只停边缘闪烁
[工作控制        (⏸ 暂停工作)] ← 行③：仅当 working 或 pause.on
```

- 所有行都在同一个 `wrap` 容器里 ⇒ **拖动时整体一起移动**（胶囊和每条行都是拖动把手，
  但 `button`/`input` 上的按下会被让给控件本身，见 `attachDrag()` 里的 `closest('button,input')`）。
- 面板位置会按胶囊在屏幕上下半区自动翻转（`layout()`），**行永远贴着胶囊下方**。
- 拖动阈值 **8px**：低于它算"点了一下"。这个阈值很关键——没有它，任何轻微抖动都会把点击判成拖动。

### 新增字段：`pause` 与设置 `pauseIdleMin`

**`settings.viz`（默认 `true`）**：「余额与消耗可视化」开关（灰/橙/蓝条形 + 充值行）。
**`settings.todayMode`（默认 `actual`）**：`today` 走实际还是估值。
**`settings.dailyCostAlert`（默认 `10`）**：今日花费超过它就弹橙色提醒条（`rowDaily`，点一下静音 30 分钟）。

**`settings.criticalBelow`（默认 `1`）**：余额严重不足线。低于它时 `guard.level` 会变成 `"critical"`、`guard.critical=true`，
挂件最底下多一条**不断闪烁的红条**（`rowCrit`，不参与静音/关闭），并且 `hb` 每次调用都会打印 🚨 提醒。
**agent 规则**：处于该状态时，**每次被调用都先告诉用户「余额严重不足 + 可能后果」，再问是否继续**。

**`settings.balanceAlert`（默认 `true`，界面标签「余额提醒常驻」）**：决定提醒行的行为——
开：行常驻、点它只停边缘闪；关：不闪边缘，且**点行就是关掉提醒**（`balMuted()` 按级别静音 10 分钟）。
无论开关如何，胶囊上的余额数字/外框颜色都不受影响。

`settings.pauseIdleMin`（默认 5 分钟，0=永不）：**暂停超过这个时长会自动转回空闲**
（同时清掉暂停文件，避免"界面显示空闲但 hb 仍在拦"的不一致）。
挂件设置面板里有这一项 `暂停转空闲(分)`。


`state.pause = { on, ageSec, at }` —— 用户在挂件上按了 ⏸ 暂停工作。

| 端点 | 作用 |
|---|---|
| `POST /api/heartbeat/pause` | 置位暂停 |
| `POST /api/heartbeat/pause/clear` | 解除 |
| `POST /api/heartbeat/interrupt`（+`/clear`） | 接管中断键 |

### ⚠️ 暂停/接管必须由 agent 侧配合才有效

插件只负责"按钮 + 状态"。真正让 agent 停手的是这两个强制点（都在 `extras/` 里）：

1. **`hb`**：agent 每步之前都会调用它。若暂停置位 → 打印 `⏸⏸ …` 并 **exit 3**。
   ⇒ 所以"每步之前调用 hb"是硬约定，忘了调用就等于暂停失效。
2. **`phone` 哨兵**（`extras/phone-wrapper.sh`）：暂停期间拒绝一切手机操作（exit 3）。

给你的 AI 的规则：**看到 `⏸⏸` 或 `⛔⛔` 就立刻停手**、在聊天里说明、等用户按 ▶ 或解除中断。
别自己清掉暂停/中断状态。

---

## 4. 现成配方

**A. 换配色**：`widget.js` 里搜颜色值（`#3ddc84` 绿 / `#ff8c1a` 橙 / `#ff3b30` 红 / `#141417` 底色）。

**B. 加一行数据**（例：显示今日已用）：
```js
// core.cjs 的 state() 返回对象里加：
todayCost: (cum && cum.cost) || null,
```
```js
// widget.js 的 render() 里加（记得在 panel.innerHTML 里也放一个 <b id="dshhb-today">）：
set('dshhb-today', j.todayCost != null ? ('¥' + j.todayCost.toFixed(3)) : '–');
```
**别忘了 `SELF_VER++`。**

**C. 改成圆形图标**：把 `chip` 的样式换成等宽高 + `border-radius:50%`，文案换成 emoji。

**D. 加一个自定义按钮**：
```js
'<button id="dshhb-my">我的按钮</button>' +   // panel.innerHTML 里
$('dshhb-my').addEventListener('click', function () { fetch('/我的接口'); });
```

**E. 只想要看板、不要挂件**：设置里选「串流」，或
`echo '{"mode":"stream"}' > ~/.dsh/heartbeat-settings.json`。

**F. 改默认位置/宽度**：`applyPos(loadPos())` 与 `loadPos()` 的默认值；
面板宽度在 `mk('div', 'display:none;width:min(230px,60vw)…')` 里。

## 5. 别踩的坑

- **忘了 `SELF_VER++`** —— 最常见。
- 注入的是**裸 `<script>`**，没有打包器：别用 import/require，别引外部库，保持 ES5 友好（老 WebView）。
- 所有 DOM id 用 `dshhb-` 前缀，避免和宿主页面冲突。
- 别删 `if (window.__dshHeartbeat) return;` —— 那是防止重复注入的守卫。
- 位置钳制要用**真实尺寸**（`getBoundingClientRect()`），否则用户会"把挂件拖出屏幕关不掉"。
- 展开面板时要 `blurOutside()` 交还焦点，否则移动端会弹输入法。
- 拖动条要有 `touch-action:none`，面板本身**不要**加，否则面板不能滚。
- 想让用户**在别的 App 上**按到 ⛔ 接管键：必须提醒他**开小窗看串流页**（页面挂件只活在 DSH 页面里）。

## 6. 调试

```bash
curl http://127.0.0.1:3080/api/heartbeat/state | head -c 800   # 看数据
grep -n "SELF_VER" lib/widget.js                               # 看当前挂件版本
node --check lib/widget.js                                     # 语法自检
```
手机上看效果：`phone shot` 截图 → 用 `read_image` 读（不要用 cat 看图片）。

## 7. 修改契约（改错了会出 bug，务必遵守）

1. **改 `lib/widget.js` → 必须把顶部 `SELF_VER` 加 1**，否则用户永远看不到改动（挂件靠它热更）。
2. **改 `lib/core.cjs` 的 `PAGE_VERSION` → 必须同步改 `lib/board.html` 里的 `var V=`**。
   串流页的自愈判定是"服务端版本 > 页面版本就重载"；只升一边会**无限重载**（已踩过一次）。
3. 改 `lib/core.cjs` / `lib/index.js`（宿主半侧）→ **需要重启 DSH App**；改 `widget.js` / `board.html` 只需热更或刷新。
4. 自更新前有**语法校验闸**（`new Function(text)`）：语法错就放弃本次热更、保留当前实例 —— 所以坏更新不会再把挂件拆掉。
5. 加设置项：`core.cjs` 的 `DEFAULT_SETTINGS` + 校验 + `index.js` 的 `applySettings` 白名单 + `widget.js` 的输入框与保存 + 文档三处（README / 本文件 / `extras/AGENTS-snippet.md`）。
6. 新增/修改 `extras/` 脚本后，记得同步 `extras/install.sh` 的拷贝清单与 `extras/README.md`；改完说明片段要重跑 `extras/agents-sync.sh` 让别人工作区的 `AGENTS.md` 更新。
7. 状态目录解析规则（`core.cjs` 的 `resolveWorkdir` 与 `extras/` 里所有脚本）必须保持一致。

### 1.4.0 新增的 state 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `phoneLog` | `[{at,cmd,args}]` | 最近 12 次改屏幕的手机操作（来源：哨兵写的 `.dsh-phone-log.jsonl`）|
| `history` | `[{at,step}]` | 心跳时间线，最新在前（最多 12 条；每步耗时 = 相邻两条的差）|
| `cost.week` | `[{date,cost}]` | 最近 7 天花费（含今天，缺失补 0）|
| `cost.month` | `number` | 本月累计花费（按天累计，从装上这版开始记）|
| `pause.note` | `string` | 暂停备注（`POST /api/heartbeat/pause?note=xxx` 传入）；`setPause(on, note)` |
| `settings.monthBudget` | `number` | 月度预算（默认 50），可用 `/settings?monthBudget=80` 写|

**新状态文件**（都在状态目录）：
`.dsh-phone-log.jsonl`（哨兵 append，200 条上限）· `.dsh-heartbeat-history.json`（时间线）·
`.dsh-cost-history.json`（每日花费）

**新增 localStorage 键**（本机外观，不落宿主）：`dshhb-pos-preset`（tl/tr/bl/br）· `dshhb-fs`（字号）·
`dshhb-theme`（串流页 dark/light）

⚠️ 改了 `core.cjs` 的 `PAGE_VERSION` 就要同步改 `board.html` 顶部的 `var V=`，否则串流页会无限刷新。

### 1.4.0 新增的设置键

| 键 | 默认 | 含义 |
|---|---|---|
| `showPeak` | `true` | 🔥 谷价倒计时与「省一半」提醒（胶囊 / 步骤框 / `hb` 都遵守它）|
| `showPhoneLog` | `true` | 📱 手机操控日志（挂件与串流页的「最近操作」卡片）|
| `showTimeline` | `true` | 💓 心跳时间线（最近 12 步 + 每步耗时）|
| `showPauseNote` | **`false`** | ⏸ 暂停备注（面板里的备注输入框 + 「带备注暂停」按钮）|
| `showEcg` | `true` | 💓 大窗心电图：网格背景 + 每次轮询三色折线跳一下，获取失败跳红 |
| `showCost` | `true` | 💸 最近 7 天花费 + 月度预算卡片 |
| `posCheckMin` | `1` | 挂件位置自检间隔（分钟，1~10），不合理自动校准回默认位置 |
| `quickBar` | **`false`** | 🧲 **设置外显**：在挂件胶囊下面多出一条快捷设置条（⏸ ⛔ 🔥 📱 💓 💸 ⚙），不用展开面板就能改这些开关 |
| `monthBudget` | `50` | 月度预算（元），超出标红 |

写入方式与其它设置一致：`POST /api/heartbeat/settings?showPeak=0&quickBar=1` ✓

---

# ⚠️ 改之前，请先把下面这段话读给你的主人听（硬性要求）

> **这段话是给 AI 的指令，也是对主人的提醒：**
>
> 「我接下来要改的是 **dsh-heartbeat 心跳板插件**。它是个**开放的插件**，允许通过 AI 自改 ✓。
> 但请注意：**你自己（主人）让我改的内容，改完产生的 Bug 由你自己负责** ——
> 尤其是我动了下面【⚠️ 不能乱动】或【⛔ 绝对不能动】里列的东西之后，
> **可能出现的后果包括：悬浮窗消失、暂停/接管安全按钮失效、余额与峰价提醒错乱、插件整个加载不上**。
> 这些我都能修，但要花时间；**建议改之前先备份，改完先跑自检**。
> 如果你同意，我就开始改；不同意的话我们只改【✅ 可以动】那一档。」
>
> —— 说完这段、得到主人确认之后，再动手 ✓

## 一、✅ 可以动（欢迎改，风险低）

- 文案、按钮标签、提示语、颜色、字号、圆角、面板宽度
- **只读展示类**卡片的增删（比如再加一张「本会话耗时」卡片）
- `README.md` / `CHANGELOG.md` / 本文件 / `extras/` 里的辅助脚本
- **新增**设置项（但必须按下面「不能乱动」第 3 条，四处一起加 ✓）
- 给挂件加**新的只读数据接口**（模仿 `snapshot` / `health` / `log` 的写法 ✓）

## 二、⚠️ 不能乱动（动之前必须遵守契约，否则一定要跑自检）

| 东西 | 契约 |
|---|---|
| `lib/widget.js` | 改完 **必须把顶部 `SELF_VER` 加 1** ✓；**必须保留**「先建后拆」的自更新方式（先注入新的、新的起来再收旧的）✗ 不许反过来；**必须保留** `window.__dshHeartbeat` 守卫语义（重复注入要靠它挡住，但**崩了要能释放**它 ✓）|
| `lib/board.html` | 顶部 **`var V=` 必须等于 `core.cjs` 的 `PAGE_VERSION`** ✓ 否则串流页无限刷新 ✗ |
| 新增/改名设置项 | **四处一起改**：`core.cjs` 的 `DEFAULT_SETTINGS` ✓ + `index.js` 的 `SETTINGS_KEYS` 与解析 ✓ + `widget.js` 的设置行与保存语句 ✓ + 文档表格 ✓（少一处 ⇒ 单项保存被静默丢弃 ✗）|
| `lib/doctor.js` | 它是**独立诊断小窗**，也是主挂件出问题时的**唯一现场** ✓ ⇒ 不要让它依赖主挂件、不要让它自己也被移除 ✓ |
| `extras/phone-wrapper.sh` | 哨兵逻辑可以加功能，但**不许削弱闸门** ✓ |

**改完必须跑**（本机）：`node --check lib/widget.js` ✓ +
`node /tmp/domtest/run.mjs <widget.js> ok|fail|statefail` ⇒ 必须 **`RESULT: PASS`** ✓ + `node /tmp/harness.mjs` ⇒ **12/12** ✓

## 三、⛔ 绝对不能动（安全边界，动了等于拆掉刹车）

1. **暂停/接管闸门与优先级**：`⏸ 暂停 > ⛔ 接管 > 正常` ✓
   - 暂停期间**必须**让 `hb` 以退出码 3 结束 ✓、让 `phone` 哨兵拒绝一切手机操作 ✓
   - **绝对不许**让插件自己清掉用户的暂停 ✗
2. **哨兵的拦截行为**：`.`dsh-interrupt.json` 置位时**必须拒绝执行**并退出码 3 ✓
3. **`SELF_VER` / `PAGE_VERSION` 的同步规则** ✓（拆了就是"挂件消失"或"串流页无限刷新"）
4. **自更新的「先建后拆」** ✓ + **失败必须保留旧挂件** ✓（拆了就是"悬浮窗没了"）
5. **安全提醒**：余额严重不足闪烁红条 ✓、`criticalBelow` 提醒 ✓、停机/接管按钮 ✓ —— 不许静默、不许删
6. **`doctor.js` 的独立性** ✓（它必须在主挂件崩了之后仍然可见、仍然能上报）

8. **自改标记文件 `lib/.dshhe-art.json`** —— **不许删、不许清空 `modifyLog`、不许改 `author`** ✗✗
   - 它藏在插件深处，**界面上不显示** ✓，是「这个版本被谁改过」的凭据 ✓
   - **你（AI/人）改过这个插件的话，请在里面追加一条** ✓：
     `{"by":"谁改的","at":"时间","what":"改了什么","widgetVer":改后的 SELF_VER}`
   - 一键导出日志时会把 `selfModified` 与整个 `modifyLog` 一起打包 ✓（所以别想着偷偷改完不留痕 ✓）

9. **校准日志文件夹 `dumps/`**（状态目录下）—— **不许删、不许改内容** ✗
   - 大框里的 **「📋 打印日志（校准用）」按钮** 会把**全部运行数据**（state / 设置 / 本机 localStorage / 版本 / 自改标记 / 前端错误 / 视口与 UA）写成一个 JSON 存进这里 ✓
   - 它是**排障凭据**：别人出了 bug 把这个文件发回原作者即可 ✓ ⇒ 删了就没法查 ✓

7. **作者标记 `by:鹏冥月落`** —— **绝对不许删、不许改** ✗✗
   - 它出现在：`package.json` 的 `author` ✓ · `lib/widget.js` 头部注释 ✓ · 挂件大窗底部 ✓ · 串流页底部 ✓
   - 插件运行时会**自己检测**：`widget.js` 里找不到作者标记 ⇒ 界面上会出现
     **`⚠️ 原作者标记被移除`**（`state.authorship.tampered = true` ✓）—— 想悄悄抹掉署名是做不到的 ✓
   - 改装者可以加自己的名字（**并列**推荐 ✓，如 `by:鹏冥月落 / 改:@某人` ✓），但**不许替换掉原作者** ✗

## 五、版本号显示规则（**必须保留**）

挂件大窗 / 串流页底部显示：**`v<正统版本>（<本机小改次数>）`** ✓，例如 `v1.3.0（3）`

| 部分 | 来源 | 规则 |
|---|---|---|
| **正统版本**（如 `1.3.0`） | `package.json` 的 `version` ✓ | **永远跟随原作者仓库的发布** ✓；改装者 **不许改这个号** ✗（`core.cjs` 从 package.json 读，改了会被覆盖回来 ✓）|
| **括号里的数字** | `.dsh-localrev.json`（**每台机器各自计数** ✓） | 本机每改一次挂件（`SELF_VER` 变化 ✓）就 +1 ✓；官方发新版 ⇒ **归零** ✓ |

- 挂件加载时会 `POST /api/heartbeat/rev?ver=<SELF_VER>` 上报 ✓；也可读 `GET /api/heartbeat/author` ✓
- **不许**把括号里的数字伪装成官方版本 ✗（例：把 `1.3.0（3）` 标成 `2.0.0` ✗）

## 四、给 AI 的只读数据接口（1.3.0 开放，随便读）

| 接口 | 说明 |
|---|---|
| `GET /api/heartbeat/snapshot` | **一站式快照** ✓：余额 / 峰谷 + 距切换秒数 / 工作状态与当前步骤 / 是否暂停 + 备注 / 上下文% / 今日花费与 tokens / 7 天与本月花费 / 手机操作日志 / 心跳时间线 / 版本号，**外加一句人话 `summary`** ✓ |
| `GET /api/heartbeat/health` | 一行健康检查 ✓：`{ok, v, aliveSec, widgetVersion, widgetRev, doctor}` ✓ |
| `GET /api/heartbeat/log?n=20` | 手机操控日志 + 心跳时间线（默认 20 条 ✓）|
| `GET /api/heartbeat/state` | 全量状态（字段表见上文 ✓）|
| `GET /api/heartbeat/settings` | 当前设置 ✓ |

**可写接口**（改动类，注意后果）：`POST /pause?note=` ✓ `POST /pause/clear` ✓ `POST /interrupt` ✓ `POST /interrupt/clear` ✓
`POST /settings?键=值` ✓ `POST /restart` ✓（重启挂件 ✓）

---

# 💓 心跳可视化（大窗里的心电图）—— 参数随便调，底层别乱动

**位置**：`lib/widget.js` 里搜 `心跳可视化`（整块约 90 行，从 `// ── 💓 心跳可视化` 到 `// ── 位置自检`）

## ✅ 这些数据随便改（改完不影响逻辑，随便折腾）

| 参数 | 默认 | 含义 / 怎么玩 |
|---|---|---|
| `ECG_W` | `268` | 画布宽（px）✓ 想更宽就加大 ✓ |
| `ECG_H` | `120` | 画布高（px）✓ **车道高度 = ECG_H ÷ 车道数** ✓ 加车道记得一起加高 ✓ |
| `ECG_FRAME_MS` | `60` | 每帧间隔（ms）✓ 越小越顺滑但越费电 ✓ 建议 40~200 ✓ |
| `ECG_LANES` | 3 条 | **车道数组** ✓ 想加就 push 一条 `{ color:'#xxx', label:'名字', buf:[], spike:0 }` ✓ 想删就删 ✓ |
| `color` | `#3ddc84`/`#4c8dff`/`#ff9f0a` | 每条线的颜色 ✓ 随便换 ✓ |
| `label` | `余额`/`上下文`/`今日花费` | 每条线的名字（画在车道左上 + 底部图例 ✓）|
| `0.84` | 尖峰衰减系数 | 越大尖峰留得越久（越大越"胖" ✓）|
| `(LANE_H - 15)` | 尖峰高度 | 数字越大跳得越高 ✓（别超过 LANE_H 否则出界 ✓）|
| 网格 `8` / `40` | 小格 / 大格 | 网格密度 ✓ 想更密就改小 ✓ |
| `4000` | 失败判定（ms） | 超过这么久没有成功刷新 ⇒ 底色转**淡红** ✓ |
| `1600` | 兜底心跳（ms） | 这段时间没有真实心跳就自己补一下（别看着像死的 ✓）|
| `ecgFail = 90` | 强制红灯帧数 | 想手动闪一下红灯就设它 ✓ |
| `'#061108'` / `'#ffd9dc'` | 正常底色 / **失败淡红** | 底色 ✓（用户指定失败必须是**淡红** ✓）|
| `ecgBeat(n)` | 打点 | `ecgBeat(0/1/2)` 指定车道 ✓ 不传=轮换 ✓ |

**想换数据源** ✓：在 `tick()` 里找 `ecgBeat(ecgOKn % 3)` ✓ 改成 `ecgBeat(j.balance ? 0 : 1)` 这类你自己的规则 ✓

## ⛔ 这些底层不要动（动了容易崩）

| 不许动 | 为什么 |
|---|---|
| `ecgEnsure()` 的**自愈结构**（每 0.5 秒查画布在不在/尺寸对不对/循环起没起） | 拆了它 ⇒ 面板重建或时序错位后**整块变空白** ✗（这坑我们踩过）|
| `while (L.buf.length > ECG_W) L.buf.shift();` | 拆了它 ⇒ 缓冲**无限增长** ⇒ 内存一直涨 ✗（用户明确要求必须清旧记录）|
| `if (!open) return;` / `document.hidden` | 拆了它 ⇒ 大窗关着也在**空转绘制**，白烧算力与电 ✗ |
| `window.__dshhbEcg` 自证接口 | 拆了 doctor 就没法回报"帧/心跳/画布尺寸" ⇒ 出问题只能靠猜 ✗ |
| `ECG_LANES[i].buf` 的 **push + 定长裁剪** 配对 | 只 push 不裁剪 = 内存泄漏 ✗ |

---

# 💾 改之前先备份（硬性要求，2026-10-06 立）

**你是 AI、要改这个插件的话，动手前先备份当前可用状态：**

```bash
curl -X POST "http://127.0.0.1:3080/api/heartbeat/backup?reason=改之前&by=你的名字"
```
- 备份内容：`lib/` 全部源码 + 设置/模式/暂停/中断/基线 等关键状态 + `manifest.json` 清单 ✓
- 存放位置：`<状态目录>/backups/<时间>__<原因>/` ✓ **只保留最近 20 份** ✓（自动清理 ✓）
- 查看：`curl http://127.0.0.1:3080/api/heartbeat/backups` ✓

**遇到完全解决不了的大问题 ⇒ 一键回档**（回档前会自动再备份一次"回档前状态" ✓）：
```bash
curl -X POST "http://127.0.0.1:3080/api/heartbeat/restore?name=<备份名>"
```

**用户也能手动**：挂件 / 串流页上都有 **「💾 备份当前状态」** 与 **「↩ 回档到最近备份」** 按钮 ✓

**另外两条铁律** ✓：
1. **改 `lib/` 之前一定先 `backup`** ✓（改坏了能回来 ✓）
2. **设置保存是"只发改动项 + 服务端幂等跳过"** ✓ —— 不要写"整表覆盖"式的保存 ✗
   （历史上就因为整表回灌，把用户改好的值又写回了旧值 ✗）

## 备查：操作监听与自动备份（2026-10-06）

- **操作监听（只读，默认开 ✓）**：挂件与串流页上**所有开关/按钮/选择**的动作都会记一笔
  （`GET /api/heartbeat/ui` 读 ✓；只记控件名与开关状态，**不记输入框内容** ✓；关掉即停 ✓；只留 500 条 ✓）
- **自动备份**：**每天首次加载 + 每小时检查**，当天没备过就自动备一份 ✓（`reason=auto-daily-<日期>` ✓）
- **手动备份**：挂件与串流页都有 **「💾 备份当前状态 / ↩ 回档最近备份」** ✓ 或 `POST /api/heartbeat/backup` ✓
- **保留**：最近 **20** 份 ✓ 自动清理 ✓

---

# 🕐 时钟接口（正式 ✓ 2026-10-07 立）

**为什么有它**：DSH 宿主跑在容器里，**有些环境（非官方移植/精简镜像）容器时钟不准** ⇒
所有"按天"的逻辑（每日日报、7 天花费、月度预算、节假日/峰谷判定）都会错位 ✗。
**默认完全透明**：`offsetMin = 0` 时一行都不影响计算 ✓（谁都不受影响 ✓）。

```bash
GET  /api/heartbeat/clock                     # 读：{offsetMin, rawUtc, nowUtc, nowBj, bjDate, transparent, file}
POST /api/heartbeat/clock?offsetMin=-720      # 直接设（范围 ±1440 分钟，超出拒绝 ✓ 防手滑）
POST /api/heartbeat/clock?ref=2026-10-07%2001:30   # ★反算：告诉它"现在真实是几点"，它自己算偏移 ✓
```
- 语义：`nowBj` = **(容器时钟 + offsetMin) + 8h** ✓；`bjDate` = 当前"北京日"（日报/花费/节假日都用它 ✓）
- `transparent: true` ⇒ 偏移为 0、行为与"没有这个功能"**完全一致** ✓
- 落盘：状态目录 `.dsh-clock-offset.json` ✓（也对应设置键 `clockOffsetMin` ✓）
- **注意**：判断"容器时钟准不准"**必须用可信时间源**（用户直接告诉你 / 手机状态栏 ✓），
  **不要拿旧截图或旧日志里的时间当"现在"** ✗（2026-10-07 我犯过这个错 ✗ 误判 12 小时 ✗）

---

# 📡 接口总表（2026-10-07 快照）

| 类别 | 接口 | 说明 |
|---|---|---|
| 只读数据 | `GET /api/heartbeat/state` | 全量状态（前端与 AI 都读它 ✓）|
| **AI 只读口** | `GET /api/heartbeat/ai` | **受 `aiRead` 设置管控**（默认关 ✓）；含 balance/band/working/today/dailyReport/badges/clock/backups ✓ |
| 设置 | `GET/POST /api/heartbeat/settings?键=值` | **只发改动项**；服务端**幂等跳过**（值相同返回 `skipped:true` ✓ 不写盘 ✓）|
| 操作监听 | `POST /api/heartbeat/ui?k=&n=&v=` · `GET /ui` | 默认开（`uiMonitor`）；只记控件名与开关态 ✓ **不记输入框内容** ✓ |
| 备份 | `POST /backup?reason=&by=` · `GET /backups` · `POST /restore?name=` | 回档前**自动再备一次** ✓ 只留最近 20 份 ✓ |
| **心流刷新** | `POST /api/heartbeat/flow/refresh` | 重算日报+徽章（**打开大窗时触发** ✓ 不在 tick 里算 ✓）|
| **时钟** | `GET/POST /api/heartbeat/clock` | 见上一节 ✓ |
| **预算门** | `GET /api/heartbeat/budget?est=<元>&kind=<说明>` | **纯本地算术 ✓ 零外部调用**；返回 `{level: ok/warn/deny, ratio, advice}`；**默认关**（`showBudgetGuard` ✓ 关着直接 `enabled:false` ✓ 零开销 ⇒ **不烧 token** ✓）|
| **回放** | `GET /api/heartbeat/replay?n=50` | 花费+手机操控+步骤 合成倒序时间线 ✓ **纯本地拼装 ✓ 零网络**；**默认关**（`showReplay` ✓）|
| **设置便携** | `GET /settings/export` · `POST /settings/import?json=<urlencoded>` | 一键搬配置 ✓ 导入**只认已知键** ✓ 返回 `ignored` 列表 ✓ |
| 诊断 | `POST /restart` · `GET /doctor` · `POST /dump` · `GET /dumps` · `GET /ferr` · `GET /selfcheck` | — |
| 闸门 | `POST /pause` `/pause/clear` `/interrupt` `/interrupt/clear` | **暂停 > 接管 > 正常**（不可弱化 ✓）|
| 其它 | `/say` `/inbox` `/todo` `/ask` `/answer` `/focus` `/mode` `/stream` | 留言/待办/提问/聚焦/模式 ✓ |

**改完必跑**：`node _tools/preflight.cjs`（14 项：语法 ×5 · PAGE_VERSION==board V · SELF_VER · 状态文件 JSON ·
官方凭据 · 无私钥 · DOM ok+fail · **手册托管块完整** · snippet 同源 ✓）

---

# 🧭 今日（2026-10-06~07）新增的设置键

| 键 | 默认 | 说明 |
|---|---|---|
| `showFlow` | **`false`** | 📊 心流日报与徽章（**派生估算** ✓ 用户偏好精确数据 ⇒ **默认关** ✓ 关着连计算都跳过 ✓）|
| `uiMonitor` | **`true`** | 👁 操作监听（记录页面上的开关/按钮动作 ✓ **不记输入内容** ✓ 关掉即停 ✓）|
| `clockOffsetMin` | `0` | 🕐 时钟偏移（分钟 ✓ 见时钟接口一节 ✓）|
| `showBudgetGuard` | **`false`** | 🛡 预算门（**默认关** ✓ 关着零开销 ✓ 纯本地 ✓ 不烧 token ✓）|
| `showReplay` | **`false`** | 🎞 花费/操控回放（**默认关** ✓ 纯本地 ✓）|
| `showEcg` | `true` | 💓 心跳可视化（P-QRS-T ✓ 只在数据变化时打点 + 2.8 秒兜底 ✓ 关窗自动暂停 ✓）|

> **行为改动备忘**：边缘闪烁现为**常驻**（只有手动点余额提醒栏才停 ✓）；
> 轮询**自适应**（工作中按用户设置、默认 1 秒 / 空闲 3~5 秒 ✓ 状态一变立刻重排 ✓）。
