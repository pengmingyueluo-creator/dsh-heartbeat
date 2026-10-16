# dsh-heartbeat · 数据心流 —— AI 开发文档（重构版）

> 本文档 **2026-10-16 重写** ✓ 结构部分按实时文件系统生成 ⇒ 与代码一致 ✓

> 旧版（一层层追加的、结构已过时 ✗）留底：`AI-CUSTOMIZE.legacy.md.bak`


---

## 0. 一页速览

| 项 | 值 |
|---|---|
| 插件名 | **数据心流**（包名 `dsh-heartbeat`）|
| 版本 | `package.json` = **1.4.0** · 凭据 `officialVersion` = **1.4.0** |
| 三处版本号 | 挂件 `SELF_VER`=**168** · 宿主 `PAGE_VERSION`=**41** · 串流页 `var V`=**41**（**必须同步** ✗）|
| 作者标记 | `by:鹏冥月落`（**删不掉** ✗ 篡改会显示红字）· ES256 官方凭据在 `lib/.dshhe-art.json` |
| 宿主侧生效 | 改 `core.cjs`/`index.js` ⇒ **重启 App** |
| 前端生效 | 改 `widget.js`/`board.html` ⇒ **刷新页面**（挂件 30 秒自动热更 ✓）|

---

## 1. 目录结构（实时生成 ✓）

```
   AI-CUSTOMIZE.legacy.md.bak  (678 行)
   AI-CUSTOMIZE.md  (678 行)
   CHANGELOG.md  (70 行)
   LICENSE  (22 行)
   README.md  (323 行)
📁 _build/
   📁 .master/
         README.md
         build-core.master.cjs  (22 行)
         build-widget.master.cjs  (36 行)
         core.sha256
         orchestrator.sha256
      build-core.cjs  (22 行)
      build-widget.cjs  (36 行)
   📁 msrc/
         00-head.js  (241 行)
         10-boot-state.js  (227 行)
         20-ecg.js  (252 行)
         30-panel-render.js  (209 行)
         40-settings-save.js  (300 行)
         50-flow-report.js  (256 行)
         60-selfupdate.js  (255 行)
         70-tail-and-crash.js  (142 行)
   📁 msrc-core/
         00-core.js  (1177 行)
📁 _tests/
      widget-dom-test.mjs  (66 行)
📁 _tools/
      audit-switches.cjs  (66 行)
      official-key.cjs  (49 行)
      preflight.cjs  (72 行)
      validate-orchestrator.cjs  (73 行)
      widget-cleanup-todo.md
   cordis.patch.yml
📁 extras/
      AGENTS-snippet.md  (148 行)
      README.md  (21 行)
      agents-sync.sh  (38 行)
      hb  (113 行)
      install.sh  (70 行)
      interrupt.sh  (30 行)
      pause.sh  (23 行)
      phone-done
      phone-wrapper.sh  (84 行)
      widget-doctor.sh
      widget-restart.sh
📁 lib/
      .dshhb-core.backup.cjs  (22 行)
      .dshhb-master.backup.cjs  (36 行)
      .dshhe-art.json
      board.html  (548 行)
      core.cjs  (1184 行)
      doctor.js  (176 行)
      index.js  (408 行)
      widget.js  (1882 行)
   package.json  (48 行)
```

### 1.1 三个前端文件的地位

| 文件 | 拆不拆 | 怎么改 |
|---|---|---|
| `lib/widget.js` | **拆 8 模块 ✓** | 改 `_build/msrc/*.js` ⇒ `node _build/build-widget.cjs` |
| `lib/core.cjs` | **不拆 ✗ 单模块** | 大闭包（可安全切点仅 21 个）⇒ 改 `_build/msrc-core/00-core.js` ⇒ `node _build/build-core.cjs` |
| `lib/board.html` | **不拆 ✗** | HTML 与内联脚本缠在一起 ⇒ 直接改文件（**记得同步 `PAGE_VERSION` 与 `var V`** ✗）|
| `lib/index.js` | 不拆 ✗ | 就是路由表，直接改（宿主侧 ⇒ 重启生效）|
| `lib/doctor.js` | 不拆 ✗ | 独立诊断小窗 |

### 1.2 挂件的 8 个模块（`_build/msrc/`）

| 模块 | 行数 | 管什么 |
|---|---|---|
| `00-head.js` | 241 | 外壳 / API 地址 / 常量 / **SELF_VER 声明** / 面板 HTML 头 |
| `10-boot-state.js` | 227 | 单例锁 / 轮询节奏(自适应) / 守卫 / 状态同步 / **UI_SHIM 外显垫片** |
| `20-ecg.js` | 252 | 💓 心跳可视化（波形表 / peak-hold / 画布隔离 / 打点节奏）**含回填表与 currentForm** |
| `30-panel-render.js` | 209 | 面板渲染（三区布局 / 数据区）+ **保存串的拼接** |
| `40-settings-save.js` | 300 | 设置存取（差异保存 / 布尔归一 / 保存后的回填放行） |
| `50-flow-report.js` | 256 | 心流日报 / 徽章 / 操作日志卡片 / 备份回档按钮 |
| `60-selfupdate.js` | 255 | 热更新（先建后拆）+ 版本号显示 |
| `70-tail-and-crash.js` | 142 | 收尾 / 崩溃兜底面板 / 统筹崩溃小窗 / 极简胶囊 |

### 1.3 core 的模块（`_build/msrc-core/`）

| 模块 | 行数 |
|---|---|
| `00-core.js` | 1177 |

---

## 2. 🛑 统筹文件（谁都不能动 ✗）

| 统筹 | 拼什么 | 底层备份 | 随包备份 |
|---|---|---|---|
| `_build/build-widget.cjs` | `msrc/*.js` → `lib/widget.js` | `_build/.master/build-widget.master.cjs` | `lib/.dshhb-master.backup.cjs` |
| `_build/build-core.cjs` | `msrc-core/*.js` → `lib/core.cjs` | `_build/.master/build-core.master.cjs` | `lib/.dshhb-core.backup.cjs` |

**校验线**：`node _tools/validate-orchestrator.cjs`（独立于所有模块 ✓）

```
① 指纹一致（没人动）  ⇒ 快检：构建一致性 + 语法 + DOM 回归 ⇒ 静默通过 ✓
② 指纹不一致（被改过）⇒ 【先按改过的跑】
      跑通   ⇒ 接受该改动（更新基准 + 记日志 ✓ 尊重用户的修改 ✓）
      跑不通 ⇒ 用 _build/.master/ 的备份【全量覆盖】再跑
            还跑不通 ⇒ 写崩溃标记 ⇒ 挂件弹小窗：错误码【统筹文件崩溃】✓
③ 修好后重跑 ⇒ 自动清标记 + 撤小窗 ✓
```
标记：状态目录 `.dsh-orchestrator-crash.json`（前端读 `state.orchestratorCrash` ✓）· 日志 `.dsh-orchestrator-log.jsonl` ✓


---

## 3. 改前端的**唯一正确流程**（照做，别跳步 ✓）

```bash
# ⓪ 备份（硬规矩 ✓）
node -e 'const c=require("./lib/core.cjs").createCore({workdir:"/sdcard/123云盘/ds工作区",harness:"http://127.0.0.1:<DSH端口>",dshHome:"/root/.dsh"});console.log(c.backupNow("改前端前","AI").name)'
# ① 只改 _build/msrc/*.js 子模块（顺带 SELF_VER +1 ✓ core 改 _build/msrc-core/00-core.js ✓）
# ② node _build/build-widget.cjs        （或 build-core.cjs）
# ③ node _tools/validate-orchestrator.cjs   统筹层（构建一致性 + 语法 + DOM ✓）
# ④ node _tools/preflight.cjs               14 项发布前自检 ✓
# ⑤ node _tools/audit-switches.cjs          开关五重检查 ✓
```
**任何一步不过 ⇒ 立刻回滚，不要硬做** ✗


---

## 4. ✅ 设置控件的"三段链路"铁律（2026-10-16 血泪 ✓）

每个开关/输入框必须**三段齐全**，少一段就是"点了没用"✗：

```
① 有输入框：id="dshhb-xxx"（**绝不能与其他元素撞 id** ✗ 撞了 $() 只拿到先出现的 ⇒ 必有一个点不动）
② 有回填：登记进回填表 ['dshhb-xxx','settingKey']（回填表在 _build/msrc/20-ecg.js ✗ 常找错模块）
③ 能保存：在 currentForm() 里读它（同 20-ecg.js）**或**保存串里显式 + '&settingKey=' + …（在 30-panel-render.js）
```
**两条附加铁律** ✓：
- 保存时读的框**必须和判断存在性的框是同一个** ✗（曾出现 `$('A') && $('B').checked` ⇒ 永远只能关不能开）
- **禁止在每秒 tick 里无脑回填设置控件** ✗（会把用户刚点的值覆盖 ⇒ "点了自动弹回去"）
  ⇒ 正确做法：时间窗守卫，**只在面板打开 / 保存成功后 3 秒内**允许回填（`window.__dshhbRefillOK`）

`node _tools/audit-switches.cjs` 会查五类：重复 id · 跨元素读框 · 无守卫回填 · 三段链路 · **未进回填表的输入框（盲点检查 ✓）**


---

## 5. 👁 外显统一（uiMode）：想让界面"少显示点东西"只改一处

| uiMode | 效果 |
|---|---|
| **`custom`（默认 ✓）** | 各 `showXxx` 开关各自生效（= 原有行为 ✓）|
| `full` | 全部外显打开 |
| `minimal` | 只留核心：余额胶囊 + 工作状态 + 余额提醒 + ⏸/⛔（其余全隐藏 ✓）|

**权威在 `core.cjs` 的 `state.ui`** ✅（一张有效显示表）⇒ 前端（挂件 `_build/msrc/10-boot-state.js` 的 `UI_SHIM` + 串流页的 `BOARD_UI_SHIM`）把它覆盖回 `settings.show*` ⇒ **一处生效** ✓

### 外显数据总表

| 数据 | 设置键 | 默认 | minimal 下 | 谁渲染 |
|---|---|---|---|---|
| 💓 心电图（三车道） | `showEcg` | 开 | 隐藏 | 20-ecg.js |
| 📊 心流日报 + 徽章 | `showFlow` | **关** | 隐藏 | 50-flow-report.js |
| 📱 手机操控日志 | `showPhoneLog` | 开 | 隐藏 | 50-flow-report.js |
| 💓 心跳时间线 | `showTimeline` | 开 | 隐藏 | 50-flow-report.js |
| 💸 7 天花费卡片 | `showCost` | 开 | 隐藏 | 50-flow-report.js |
| 🔥 谷价倒计时 | `showPeak` | 开 | 隐藏 | 30-panel-render / hb |
| 🎨 余额可视化条 | `viz` | 开 | 隐藏 | 30-panel-render.js |
| 📈 上下文进度条 | `ctxBar` | 开 | 隐藏 | 30-panel-render.js |
| 🐳 胶囊/工作状态/余额提醒/⏸⛔ | `—` | **永远显示** ✗ | 保留 | 安全相关，任何模式都不可隐藏 ✓ |

**加一项新外显的标准动作（四步 ✓）**：① `state.ui` 加键（full/minimal 两分支给值）② `10-boot-state.js` 的 `UI_MAP` 加映射 ③ 面板加勾选框 **+ 回填 + currentForm**（三段缺一不可 ✗）④ build ⇒ audit ⇒ preflight


---

## 6. 接口总表（实时生成 ✓）

```
  /api/heartbeat/ai
  /api/heartbeat/answer
  /api/heartbeat/ask
  /api/heartbeat/ask/clear
  /api/heartbeat/author
  /api/heartbeat/backup
  /api/heartbeat/backups
  /api/heartbeat/budget
  /api/heartbeat/clock
  /api/heartbeat/doctor
  /api/heartbeat/dump
  /api/heartbeat/dumps
  /api/heartbeat/ferr
  /api/heartbeat/flow/refresh
  /api/heartbeat/focus
  /api/heartbeat/focus/clear
  /api/heartbeat/focus/pending
  /api/heartbeat/health
  /api/heartbeat/inbox
  /api/heartbeat/inbox/done
  /api/heartbeat/interrupt
  /api/heartbeat/interrupt/clear
  /api/heartbeat/log
  /api/heartbeat/mode
  /api/heartbeat/pause
  /api/heartbeat/pause/clear
  /api/heartbeat/replay
  /api/heartbeat/restart
  /api/heartbeat/restore
  /api/heartbeat/rev
  /api/heartbeat/say
  /api/heartbeat/selfcheck
  /api/heartbeat/settings
  /api/heartbeat/settings/export
  /api/heartbeat/settings/import
  /api/heartbeat/snapshot
  /api/heartbeat/state
  /api/heartbeat/stream
  /api/heartbeat/todo
  /api/heartbeat/ui
```

> `/ai` 是**给 AI 的只读口**（受设置 `aiRead` 管控，默认关 ✓）；其余接口默认开放 ✓


---

## 7. 设置键总表（实时生成 ✓，共 34 个）

| 键 | 默认 |
|---|---|
| `mode` | `'both'` |
| `streamPort` | `0` |
| `orangeBelow` | `10` |
| `redBelow` | `5` |
| `pauseIdleMin` | `5` |
| `balanceAlert` | `true` |
| `criticalBelow` | `1` |
| `dailyCostAlert` | `10` |
| `todayMode` | `'actual'` |
| `viz` | `true` |
| `idleGraceSec` | `15` |
| `phoneTtlSec` | `8` |
| `flashEveryMin` | `10` |
| `flashRedMin` | `3` |
| `eggInteractive` | `true` |
| `ctxBar` | `true` |
| `monthBudget` | `50` |
| `showPeak` | `true` |
| `showPhoneLog` | `true` |
| `showTimeline` | `true` |
| `showPauseNote` | `false` |
| `showCost` | `true` |
| `showEcg` | `true` |
| `refreshSec` | `1` |
| `uiMode` | `'custom'` |
| `showFlow` | `false` |
| `showBudgetGuard` | `false` |
| `showReplay` | `false` |
| `uiMonitor` | `true` |
| `sensitiveApps` | `''` |
| `aiRead` | `false` |
| `quickBar` | `false` |
| `posCheck` | `false` |
| `posCheckMin` | `1` |

---

## 8. 发布流程（完整清单见工作区手册 §15 ✓）

```
0. 先问用户版本号 ✗ 不许自己拍板
1. 改版本号四处：package.json / CHANGELOG / README（一览表 + 新版新增块）/ 本文档与 extras/AGENTS-snippet.md
2. 改 GitHub 仓库 Description 与 Topics（最容易漏 ✗）
3. node _tools/official-key.cjs sign   ← 签完**要手动把 art 的 officialVersion 改成新版本号** ✗（工具只写 version）
4. node 心跳插件-同步到仓库.js  ⇒ 打包（清单排除）
    · tar 必须 `--exclude=./.dsh*`（写成 `.dsh*` 会连官方凭据 lib/.dshhe-art.json 一起排掉 ✗）
    · zip 的 skip() 要单独放行 lib/.dshhe-art.json ✓
5. 扫密钥：用 `privateEnc.data` 的首尾做指纹（私钥里**没有 `d` 字段** ✗ 别扫错）
6. 推送（/sdcard 是 FUSE ⇒ 容器里 git 写不了对象 ✗ 要在 Termux home 推）
7. GitHub Release：tag vX.Y.Z + 挂 tar.gz / .zip 两个附件
```

---

## 9. 踩过的坑（都记着，别再犯 ✗）

| 坑 | 教训 |
|---|---|
| 热更新"先拆后建" ⇒ 挂件整个消失 | 必须**先建后拆**，失败要能退回旧版（`60-selfupdate.js`）|
| 设置被神秘改回旧值 | ① tick 无脑回填 ② id 撞车 ③ 整表回灌 ⇒ 现在有 audit-switches 五重检查 ✓ |
| 打包把官方凭据排掉 | 排除规则必须清单式 + 逐条核对包内容 ✓ |
| 误判时钟 12 小时 | 判断时间**必须用可信时间源**（用户亲口/系统命令）✗ 别拿旧截图当"现在" |
| `.ts` 污染手机图库 | 往 /sdcard 解压代码前先放 `.nomedia`（工具：工作区 `nomedia.sh` ✓）|
| 文档漂移 | 结构改了**必须同步本文档** ✓ 本文档结构节已改为实时生成 ⇒ 不易漂移 ✓ |

---

## 10. 契约速查（给任何要改它的 AI ✓）

```
✗ 不许改：_build/build-widget.cjs · _build/build-core.cjs（统筹 ✓ 改它=整个崩）
✗ 不许删：署名 by:鹏冥月落 · lib/.dshhe-art.json · lib/.dshhb-*.backup.cjs
✓ 改 widget 必须：改模块 → build → 体检（SELF_VER +1 ✗ 不递增前端不热更）
✓ 改 core/board 逻辑必须：PAGE_VERSION +1 且 board 的 var V 同步（两个都要 37/38… ✗ 不一致串流页会无限刷新）
✓ 改完必跑：validate-orchestrator → preflight → audit-switches
✓ 改前必做：backupNow("改前","AI")
```

---

# 🛡 保守运行 + 运行时自检 + 诊断页（2026-10-16 立）

## 三条规则（用户定的 ✓）

```
① 核心模块坏  ⇒ 一律【停止 + 抛诊断页】✗（红框）
② 功能模块坏  ⇒ 默认【跳过它继续跑】+ 诊断页提醒 ✓（橙框）
   选「保守运行」=开 ⇒ 功能模块坏也【停止 + 抛诊断页】✓
③ 检测到模块被改过（签名变化）⇒ 先跑【能力探针自检】再继续 ✓
```

## 哪些算核心、哪些算功能（权威在 `core.cjs` 的 `state.modules` ✓）

| 类型 | 模块 |
|---|---|
| **核心（坏=必停）** | `00-head` · `10-boot-state` · `30-panel-render` · `40-settings-save` · `60-selfupdate` · `70-tail-and-crash` |
| **功能（坏=跳过+提醒）** | `20-ecg`（心电图）· `50-flow-report`（日报/徽章/手机日志/时间线/花费/回放/备份按钮）|

> 想改分类 ⇒ 只动 `core.cjs` 里 `state.modules` 的 `KB` 映射 ✓ 前端与诊断页会自动跟着变 ✓

## 三个组件（都在 `_build/msrc/70-tail-and-crash.js` ✓）

| 组件 | 作用 |
|---|---|
| `hbProbe()` | **能力探针**：检查 胶囊 / 轮询 / 状态同步 / 暂停·接管按钮 / 署名行 ✓ 缺任一 ⇒ 记成核心故障 ⇒ 抛诊断页 |
| `hbFail(kind, name, err)` | **故障登记**：核心 ⇒ 必停；功能 ⇒ 记录 + 跳过（保守运行时停）· **同一模块只报一次**（防每帧刷屏 ✗）|
| `hbDiagPanel()` | **诊断页**：核心状态 / 功能跳过清单 / 模块签名 / 自检时间 / 保守运行开关 + 「🔄 重新自检」「收起」|

**调试点**：`window.__dshhbProbe()` 手动自检 · `window.__dshhbDiag()` 强制开诊断页 · `window.__dshhbHealth` 看当前健康数据 ✓

## 接线位置（新加功能块时必须照做 ✓）

```js
try { 你的功能渲染(j); } catch (e) { hbFail('feature', '你的模块名', e); }
```
已接：`extras(手机日志/时间线/花费)` · `ecg(心电图)` · `flow(日报/徽章)` ✓
**新功能块** ⇒ 必须包 `try/catch + hbFail('feature', ...)` ✓ 否则它坏了会连带主挂件 ✗

## 诊断页长什么样

```
🛑 核心模块故障 —— 已停止         / 🛑 保守运行：功能模块故障 ⇒ 已停止 / ⚠️ 功能模块故障 ⇒ 已跳过它继续运行
核心：✅ 核心能力正常 或 ✗ 胶囊：探针未通过 …
功能：· 功能模块无异常 或 ⏭ ecg(心电图)：已跳过（…）
模块签名：6/2 · 自检时间：… · 保守运行：关/开
处理：① 看 _build/msrc/ 对应模块 ② validate-orchestrator ③ preflight ④ 设置里关掉该功能 / 开保守运行
[🔄 重新自检] [收起]
```

## 🩺 自检信号 + 周期自检（2026-10-16 立）

**给其他 AI 的硬规定**：**改完 `_build/msrc/*.js` 模块之后，抛一下自检信号** ✓

```bash
node _tools/selfcheck-signal.cjs "你的名字" "改了哪个模块"
# 等价做法：
#   curl -X POST "http://127.0.0.1:<DSH端口>/api/heartbeat/signal?who=名字&note=说明"
#   网页控制台：__dshhbSignal('名字')
```
**信号做了什么**：写状态目录 `.dsh-selfcheck-signal.json`（`{at, who, note}` ✓）
⇒ 挂件/串流页**下一次判定**（≤15 秒）看到时间戳变新 ⇒ **立刻跑一次自检**（`hbProbe` + `hbSweep` ✓）
⇒ 结果按"核心/功能"规则处理（见上一节：核心必停、功能跳过并提醒 ✓）

**周期自检**：默认 **每 10 分钟**一次 ✓
- 设置项 `selfCheckMin`：**0 = 关闭** ✓ **有效 5~30** ✓（填 1~4 会被钳到 5，>30 钳到 30 ✓ 非法值回默认 10 ✓）
- 界面上在「⚙ 设置」里的「🩺 自检间隔(分)」✓
- 实现：**自己的定时器**（每 15 秒判一次"该不该自检" ✓ 不依赖 tick ✓ 页面在后台时跳过 ✓）

**手动立刻自检**（网页控制台 ✓）：
```js
__dshhbProbe()                 // 只跑能力探针
__dshhbCheck('手测')           // 探针 + 功能巡检
__dshhbFail('feature','x',new Error('故意'))   // 造一个功能故障 ⇒ 橙框诊断页
__dshhbFail('core','x',new Error('故意'))      // 造一个核心故障 ⇒ 红框 + 停止提示
__dshhbHealth                   // 看当前健康数据（core/feature/skipped/自检时间）
```

---

# 📜 用户协议（User Agreement）

本插件（**数据心流 dsh-heartbeat**）作者：**鹏冥月落（ZERO—鹏冥月落）**。
本项目以 **MIT 许可证**发布（见根目录 `LICENSE` ✓ 另有 `NOTICE` ✓）。
安装、使用、二次修改或再次发布，即表示你同意以下条款：

1. **允许二改、二发** ✓：你可以修改它，并在任何平台二次发布（含商业用途 ✓）。
2. **必须保留版权声明与许可文本** ✗（这是 MIT 本身的要求 ✓）：
   - 保留 `LICENSE` 全文，以及 `package.json` 里的 `author` / `license` 字段 ✓；
   - **底线：任何人都必须能从源码或产物中读出原作者的名字** ✗
     （例如产物里的署名行 `数据心流 · by:鹏冥月落 · v…`、包内的 `NOTICE` / `AI-CUSTOMIZE.md` ✓）。
3. **可以并列添加二改者的署名** ✓（例：`ZERO—鹏冥月落 × 你的名字` ✓），
   但**不得覆写、删除或隐藏**原作者的名字与官方凭据 ✗。
4. **界面署名是"建议"而非强制** ✓：插件 UI 上的署名行是版权声明的体现，**建议保留** ✓；
   本协议**不以"UI 必须显示"作为使用或分发的许可条件** ✗ —— 你可以调整界面呈现形式 ✓，
   但前提仍是第 2 条（**能从代码里读出原作者名字** ✓）。
5. **违反后果 + 内置校验** ⚠️：本插件**内置署名完整性校验**；若你违反本协议（尤其是覆写、删除或隐藏原作者署名与官方凭据），
   **我们将不再为你获取的数据副本提供支持** ✗（不再提供后续更新、问题排查、数据恢复协助等服务 ✓），
   且该副本的**核心文件逻辑备份将不再可用**（会被密封为仅供原作者解算的数据流 ✗；
   校验只作用于本插件自身目录 ✓ 绝不触碰 DSH 主程序、其他插件或你手机上的任何其它数据 ✓）。
> 一句话版本：**随便改、随便发 —— 但代码里必须留着我的名字，一个都不能少 ✓**
> （以上为开源协议通用解读，不构成正式法律意见；商业大规模使用建议咨询知识产权律师 ✓）
