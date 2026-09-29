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
