# dsh-heartbeat —— DSH 心跳板插件

余额 / 峰谷价 / 上下文压力 / 每轮消耗 / 存活状态 / 手机操控横幅 / ⛔ 接管键，
两种形态：**页面挂件**（注入 DSH 页面）与**串流页**（浏览器打开）。

---

## ⚠️ 最重要的一条：想"管住别的 App"，必须开小窗串流

| 你想要的效果 | 看哪里 |
|---|---|
| 我（agent）干活时，你能在**任何界面**上看到「正在操控手机」的横幅、能按「⛔ 我要接管」 | **串流页放进 Chrome 小窗**（小窗浮在别的应用上面）<br>地址：`http://127.0.0.1:3080/heartbeat` |
| 你只是待在 DSH 里看状态 | **页面挂件**就够了（自动注入页面左下角） |

**为什么**：页面挂件活在 DSH 的网页里 —— 一旦 agent 切到微信/QQ/别的 App，
DSH 页面就不在屏幕上了，**挂件和接管键你也看不见**。
只有"小窗"（系统级浮窗）才能盖在别的应用上面，所以**想在别的 App 上按接管键，就开小窗串流**。

推荐设置：模式选 **「两者」**，平时看挂件，需要被管住时把串流页挂成 Chrome 小窗。

---

## 一键安装（推荐）

```bash
bash extras/install.sh
```

它会依次做 6 件事：

1. `dsh plugin --profile web add` 装插件
2. 备份原版 `phone` 为 `phone-real`，装上**哨兵**（`/usr/local/sbin/phone` + `/usr/local/bin/phone`）
3. 把 `hb` / `interrupt.sh` / `pause.sh` / `phone-done` 放进状态目录并加执行权限
4. 写默认设置 `~/.dsh/heartbeat-settings.json`
5. **把这套使用说明写进你工作区的 `AGENTS.md`**（带 `<!-- dsh-heartbeat:begin -->` 标记、可重复安装不会重复）
   —— DSH 每次会话都会自动加载 `AGENTS.md`，所以**对方的 AI 会自动读到并"记住"这些协议**
6. 打印后续步骤（重启 App / 看板地址 / ⚠️ 小窗提醒 / phone-done 协议）

> 装完**重启一次 DSH App**（宿主半侧在启动时加载）。挂件本身以后不用再重启。

### 想自己定制小窗？让 AI 帮你改

本包附了一份**专为 AI 写的改造指南**：[AI-CUSTOMIZE.md](AI-CUSTOMIZE.md) ——
讲了三个文件的分工、数据字段表、5 个现成配方、以及必须遵守的契约（**改挂件要 `SELF_VER++`**）。
把 [extras/AGENTS-snippet.md](extras/AGENTS-snippet.md) 追加到你的工作区 `AGENTS.md`，
你的 AI 就知道该怎么用了。

## ⏸ 暂停工作 / ⛔ 接管（挂件上的两个按钮）

- **⏸ 暂停工作**（我在干活时才出现）：按下去 = 暂停我的工作。
  我在每步之间调用 `hb`，它一看到暂停就打印 `⏸⏸ 用户按下了「暂停工作」` 并 **以退出码 3 结束**，
  我据此停手、等你按 **▶ 继续工作**。暂停期间 `phone` 哨兵也会拒绝一切手机操作。
- **⛔ 接管**（我在操控手机时才出现）：按下去 = 让我立刻停止操控手机并切回 DSH。

> ⚠️ 这两个按钮只负责"置位 + 显示"；**真正让 AI 停手的是 `extras/hb` 与 `extras/phone-wrapper.sh`**。
> 别人安装时这两个脚本必须装到位（`extras/install.sh` 会做），否则按钮按了也不会生效。

> 💡 因为渲染在 DSH 页面里，只有你**看着 DSH 界面**时才能按到；要在别的 App 上按，请开小窗串流。

## 让「正在操控手机」尽快消失

agent 每做完一串手机操作（并还原屏幕后），调一次：

```bash
bash <状态目录>/phone-done
```

横幅会在下一次轮询（≤1 秒）内消失；不调的话最多留 `phoneTtlSec`（默认 8）秒也会自动消失。

## 优先级总表（闸门 / 显示 / 交互）

> 完整表格见 [AI-CUSTOMIZE.md](AI-CUSTOMIZE.md) 的「优先级总表」章节。

### 闸门优先级（从高到低）

1. **⏸ 暂停工作**（最高）—— 暂停期间：`hb` 退出码 3、`phone` 一切操作被拒（含 status/shot）
2. **⛔ 接管**—— 拒绝一切 `phone` 操作，并把 DSH 切回前台、退出码 3
3. 正常

> 两个同时置位时**暂停优先**（实测）。两个按钮都只置位/显示，真正拦截的是 `extras/hb` 与 `extras/phone-wrapper.sh`。

### 从 GitHub / npm 安装（发布后）

```bash
# 只装插件本体：
dsh plugin --profile web add github:pengmingyueluo-creator/dsh-heartbeat
# 或发布到 npm 之后：
dsh plugin --profile web add dsh-heartbeat

# 想连手机哨兵 / hb / 接管 / 暂停脚本一起装（推荐）：
git clone https://github.com/pengmingyueluo-creator/dsh-heartbeat && cd dsh-heartbeat && bash install.sh
```

> ⚠️ **只装插件时，配套脚本没有部署**：`dsh plugin add` 只装插件本体（`extras/` 里的脚本会躺在
> `node_modules/dsh-heartbeat/extras/`）。想启用手机哨兵 / `hb` / `phone-done` 等，再跑一次：
> ```bash
> bash node_modules/dsh-heartbeat/extras/install.sh
> ```
> 或者直接走克隆路线（`git clone … && bash install.sh`），它全都会装好。

> **本插件是纯 JavaScript，没有 `prepare`/`build`/`install` 脚本**，所以不需要在 `pnpm-workspace.yaml` 里配 `allowBuilds` ✓
> （DSH 的 git 插件默认会"安装时构建"，pnpm 会拦下构建脚本；有构建步骤的插件必须让用户手动放行，本插件不受影响）

仓库根目录必须是：`package.json` + `cordis.patch.yml` + `lib/`（**不能把这些套在子目录里**，DSH 直接拉仓库根）。

## 效果图

| 展开面板（余额 / 上下文进度条 / 今日峰值 / 平均每会话 / 可视化条） | 设置面板（16 项，全部可调） |
|---|---|
| ![面板](https://raw.githubusercontent.com/pengmingyueluo-creator/dsh-heartbeat/main/screenshot-1-panel.jpg) | ![设置](https://raw.githubusercontent.com/pengmingyueluo-creator/dsh-heartbeat/main/screenshot-2-settings.jpg) |

| 收起态（胶囊 + 余额 / 今日已用 / 工作状态三行） | 操控手机时的红色横幅 + ⛔ 接管键 |
|---|---|
| ![收起态](https://raw.githubusercontent.com/pengmingyueluo-creator/dsh-heartbeat/main/screenshot-3-rows.jpg) | ![接管](https://raw.githubusercontent.com/pengmingyueluo-creator/dsh-heartbeat/main/screenshot-4-phone-banner.png) |

> 截图来自真机（京 · 谷价时段）。挂件浮在对话上方，所以面板背后能看到淡淡的内容。

## 安装

```bash
dsh plugin --profile web add <本目录或包路径>
# 宿主半侧在进程启动时加载 ⇒ 需要重启一次 DSH App
```

挂件是注入进页面的脚本 —— **改挂件不用重启**（它自带版本号会自己更新；页面刷新也立即生效）。

## 两种模式

模式存在 `~/.dsh/heartbeat-mode.json`，**切换立即生效，无需重启**。

| 模式 | 行为 |
|---|---|
| `widget` | 只在 DSH 页面里注入挂件 |
| `stream` | 不注入挂件；只用串流页 `/heartbeat` |
| `both`（默认） | 两者都开 |

## 路由

| 路径 | 用途 |
|---|---|
| `GET /heartbeat` | 完整看板（串流页；放小窗里用这个） |
| `GET /heartbeat/widget.js` | 挂件脚本（被自动注入） |
| `GET /api/heartbeat/state` | 全部数据（JSON） |
| `GET/POST /api/heartbeat/settings?mode=&streamPort=&orangeBelow=&redBelow=` | 读/改设置 |
| `POST /api/heartbeat/interrupt` / `/interrupt/clear` | 接管键（置位/清除） |

**串流端口**（设置里）：`0` = 跟随 DSH 端口（默认，不占额外端口）；
`auto` = 自动探测一个空闲端口（3200 起往上找）并额外监听；也可填具体数字。
——这是为了适配不同环境：别人的 DSH 端口不一样时也能用。

## ⛔ 接管键的完整链路（不只靠本插件）

```
用户按 ⛔  →  /api/heartbeat/interrupt  →  写 .dsh-interrupt.json
                                          ↓
              phone 哨兵（包装脚本）读到置位 → 拒绝一切 phone 操作（退出码 3）
                                          ↓
              agent 看到「⛔⛔ 用户按下了接管」→ 停手、回话、切回 DSH、清中断
```

所以「拒绝执行」这一步**依赖 `phone` 哨兵包装脚本**，插件只负责按钮与状态。
本包 `extras/` 里放了配套脚本，按需自取：

| 文件 | 作用 | 装到哪 |
|---|---|---|
| `extras/phone-wrapper.sh` | **哨兵 + 中断闸门**：记录改屏幕操作（→ 自动亮横幅）、拦截被接管后的操作 | `/usr/local/sbin/phone`（PATH 优先于 `/usr/local/bin`，避免被 App 覆盖）<br>同时保留 `/usr/local/bin/phone-real` 为真身 |
| `extras/interrupt.sh` | 中断状态 `set` / `clear` / `status` | 工作区目录 |
| `extras/hb` | 每步进度 + **余额红区警告** | 工作区目录，agent 每步调用 |

> ⚠️ 哨兵里的工作区路径（默认 `/sdcard/123云盘/ds工作区`）请按自己的环境改。

## 环境变量（换环境时用）

| 变量 | 默认 | 说明 |
|---|---|---|
| `DSH_HEARTBEAT_DIR` | `/sdcard/123云盘/ds工作区` | 存放进度 / 中断 / 守护状态文件的工作区目录 |
| `DSH_HEARTBEAT_PORT` | `3200` | 独立版 `dsh-heartbeat.js` 的端口 |
| `DSH_HOME` | `/root/.dsh` | DSH 主目录（设置与投影缓存所在） |

### 余额提醒与边缘闪烁（v36 起）

- 余额进橙/红区时，胶囊下面出现提醒行，**常驻、点不掉**（点它只是停止边缘闪烁；级别变化会重新闪）。
- 设置里的「**余额提醒常驻**」（默认开）只控制**屏幕边缘闪烁**；关掉它提醒行照样常驻。
- 屏幕边缘闪烁：**橙区闪橙、红区闪红**，闪 3 下后留一层淡边。
- 胶囊外框跟随余额（绿/橙/红）；胶囊上的时段文字 **峰价=红、谷价=绿**。

### 📊 面板里的「今日」三行（像看手机内存一样）

```
今日原有   ¥12.93      ← 当天第一次读到的余额（宿主机记一份，挂件也自己记一份）
今日已用   ¥8.25       ← 按 todayMode 口径（默认实际结算）
剩余       ¥12.90      ← 当前余额
─────────────
估值       ¥8.29       ← 实际 + 正在进行这一轮的预估
```

> 口径说明：「实际」= 用量数据库按北京日期汇总的小时桶（官方结算口径，可能滞后当前这一轮几秒～一分钟）；
> 「估值」= 实际 + 当前进行中轮次的预估。别的桌宠（如小鲸鱼）按**会话事件 + 自己的价目表**估算，
> 数值会比实际偏高，两者对不齐是口径差异，不是 bug。

### 📊 余额与消耗可视化（设置项「余额与消耗可视化」，默认开）

展开面板后，"今日"块下面有一条像看手机存储空间那样的条：

```
今日原有   ¥12.93     今日已用（实际） ¥8.64 · 161M
剩余       ¥12.59
估值       ¥8.68
[████████░░░░░░░░░░░░░]   ← 橙=今日已用（从左往右长） / 灰=原有剩余 / 蓝=今日充值
今日已充值（估算） ¥0.00
```

**充值是估算的**（所以文案里带"估算"二字）：余额本该只减不增，两次读数之间：
「期望下降 = 期间消耗」减去「实际下降 = 余额差」，为正就说明**余额多出来了 ⇒ 判为一次充值**，
按增量累计（能抓住一天里的多次充值）。它只统计**检测器上线之后**发生的充值。

### ⏸ 暂停超时自动转空闲

暂停后若一直没人按 ▶，超过 `pauseIdleMin` 分钟（默认 **5**，设 `0` 表示永不）会**自动转回空闲**，
并把暂停状态清掉（保证界面与 `hb` 的判断一致）。时长在挂件设置里可改。

## 设置项（全部）

在挂件/串流页的 **⚙ 设置**里改，或 `POST /api/heartbeat/settings?键=值`。

| 项 | 默认 | 说明 |
|---|---|---|
| `mode` | `both` | 挂件 / 串流页 / 两者 |
| `streamPort` | `0` | `0`=跟随 DSH 端口（推荐）；`auto`=自动找空闲端口另起监听；或具体数字 |
| `orangeBelow` / `redBelow` | `10` / `5` | 余额橙线 / 红线（挂件数字与外框按此变色） |
| `criticalBelow` | `1` | **余额严重不足线**：低于它 → 挂件底部**闪烁红色多行条** + `hb` 打印 🚨🚨 提醒 |
| `dailyCostAlert` | `10` | **今日花费提醒线**：超过就弹橙色提醒条（点一下静音 30 分钟） |
| `todayMode` | `actual` | 今日已用走 `actual`（实际结算，默认）还是 `estimate`（估值=实际+进行中这一轮） |
| `viz` | `true` | **余额与消耗可视化**：灰/橙/蓝条形 + 「今日已充值（估算）」 |
| `balanceAlert` | `true` | **余额提醒常驻**：开=提醒行常驻（点它只停边缘闪烁）；关=点它能直接关掉且不闪边缘 |
| `idleGraceSec` | `15` | **空闲判定**：多久没动作算"空闲"（越小越灵敏） |
| `flashEveryMin` | `10` | **橙区边缘闪烁间隔**（分钟） |
| `flashRedMin` | `3` | **红区边缘闪烁间隔**（分钟，默认更急） |
| `ctxBar` | `true` | **上下文进度条**：面板里把上下文压力画成进度条（绿<60% / 橙<85% / 红≥85%） |
| `eggInteractive` | `true` | **运转互动**：长按「工作中」那一行的彩蛋总开关（按住 1 秒启动；启动后锁住拖动） |
| `phoneTtlSec` | `8` | **手机横幅**保留秒数（配合 `phone-done` 可立刻撤掉） |
| `pauseIdleMin` | `5` | 暂停超过这么久**自动转空闲**并清掉暂停（`0`=永不） |

**刷新间隔（秒）**：0.5 ~ 10，默认 **1**。存在浏览器 localStorage（键 `dshhb-refresh`），**改完立即生效、不需要重启宿主**（省电就调大）。

## 依赖与降级（装之前请看一眼）

| 能力 | 依赖 | 缺了会怎样 |
|---|---|---|
| 余额 / 峰谷价 / 上下文压力 | DSH 本体（`credentials` 能解析出 API key，或宿主环境变量里有 `DEEPSEEK_API_KEY`） | 余额显示 `–`、胶囊变灰；其余功能照常 |
| 今日用量 / 今日峰值 / 平均每会话 / 充值估算 | 装了 **`dsh-token-usage-stats`** 插件（提供 `/api/token-usage-stats`） | 这几项显示 `–`，不影响余额与闸门 |
| 手机操控横幅 / ⛔ 接管 | Android 上的 `phone` 工具 + `extras/phone-wrapper.sh` 哨兵（安装脚本自动装） | 横幅不出现，闸门只剩 `hb` 那一层 |
| 串流页 / 页面挂件 | 什么都不额外需要（走 DSH 自身路由与鉴权） | —— |

**没有 key 也不会崩**：同步门有 25 秒兜底，等不到余额就照常放行显示。

## 常见问题

- **改了挂件没生效？** 挂件每 30 秒自查一次版本（`SELF_VER`），会自动重载；
  想立刻看到就刷新页面。**App 内的 WebView 没有下拉刷新**，刷新不了就重启 App。
- **改了宿主半侧（路由/数据）没生效？** 宿主代码在进程启动时加载，需重启 App。
- **余额读不到？** 需要宿主进程环境里有 `DEEPSEEK_API_KEY`（或 credentials 服务可解析）。
- **端口被占？** 设 `auto`，它会自己往后找空闲端口。

## 卸载

```bash
dsh plugin --profile web remove dsh-heartbeat
# 重启 App 生效
```
