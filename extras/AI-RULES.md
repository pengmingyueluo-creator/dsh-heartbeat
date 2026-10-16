# dsh-heartbeat · AI 硬性规定（安装时自动写入你的工作区）

> 本文件由 dsh-heartbeat 安装脚本写入，目的：**把硬性规定放进 AI 每会话必读的地方**，
> 不依赖 AI 自己去翻开发文档。同时会被同步进工作区手册（AGENTS.md）的托管块。

## 一、动手前两条铁律
1. **改核心代码前先备份**：`backupNow(reason, by)` 或 POST `/api/heartbeat/backup?reason=改核心前&by=AI`
2. **往 /sdcard 解压代码仓库前先放 .nomedia**（否则图库被塞满 0:00 假视频）
   → `bash <工作区>/nomedia.sh <刚解压的目录>`

## 二、改前端（widget）的唯一正确姿势
```
源码不是 lib/widget.js（它是构建产物，会被覆盖）
真正要改的是 _build/msrc/*.js：00-head 10-boot-state 20-ecg 30-panel-render
                                40-settings-save 50-flow-report 60-selfupdate 70-tail-and-crash
流程（缺一不可）：
 ① 改模块（顺带 SELF_VER +1，不递增前端不热更）
 ② node _build/build-widget.cjs           拼回 lib/widget.js
 ③ node _tools/validate-orchestrator.cjs  统筹层（构建一致性 + 语法 + DOM 回归）
 ④ node _tools/preflight.cjs              14 项发布前自检
 ⑤ node _tools/audit-switches.cjs         开关五类检查
 ⑥ node _tools/selfcheck-signal.cjs "名字" "改了哪个模块"   抛自检信号 ⇒ 前端立刻自检
```
- `lib/core.cjs` 同理：改 `_build/msrc-core/00-core.js` ⇒ `node _build/build-core.cjs`
- `lib/board.html` / `lib/index.js` / `lib/doctor.js` 不拆，直接改
  改 board 逻辑必须 **PAGE_VERSION 与 board 的 `var V` 同步 +1**（不一致 ⇒ 串流页无限刷新）

## 三、绝对不许动
| 不许 | 为什么 |
|---|---|
| 改 `_build/build-widget.cjs` / `_build/build-core.cjs` | 统筹文件，改坏=整个插件崩（有底层备份+校验线兜底，但别去动）|
| 删署名 `by:鹏冥月落`、`lib/.dshhe-art.json` | 作者标记与官方凭据 |
| 删 `lib/.dshhb-master.backup.cjs` / `lib/.dshhb-core.backup.cjs` | 随包备份，校验系统靠它回滚 |

## 四、设置控件三段链路（少一段就是点了没用）
```
① 有输入框 id="dshhb-xxx"（绝不能与别的元素撞 id）
② 有回填：登记进回填表 ['dshhb-xxx','settingKey']（表在 _build/msrc/20-ecg.js）
③ 能保存：currentForm() 里读它（同文件）或保存串显式 + '&settingKey=' + …（30-panel-render.js）
```
附加：**禁止在 tick 里无脑回填设置控件**（会覆盖用户刚点的值 ⇒ 表现为点了自动弹回去）
⇒ 只在面板打开 / 保存成功后 3 秒内允许回填（`window.__dshhbRefillOK`）

## 五、运行时自检 / 保守运行（本插件自带，你要配合）
- **改完模块必须抛自检信号**：`node _tools/selfcheck-signal.cjs 名字 说明`（或 POST `/api/heartbeat/signal` / 控制台 `__dshhbSignal()`）⇒ 挂件与串流页 ≤15 秒自检一次
- 周期自检默认 **10 分钟**（`selfCheckMin`：0=关，有效 5~30）
- 规则：核心模块坏 ⇒ 停止 + 抛诊断页；功能模块坏 ⇒ 默认跳过并提醒；开「保守运行」⇒ 任意坏都停
- 手动：`__dshhbProbe()` / `__dshhbCheck()` / `__dshhbFail('core'|'feature',…)`

## 六、发布
改版本号**必须先问用户**，不许自己拍板。完整清单见 `AI-CUSTOMIZE.md` 与工作区手册 §15。

## 七、界面可调项（用户口味不同，都做成开关）
| 想改什么 | 用什么 |
|---|---|
| 显示多少 | 设置里 **👁 外显总控**（`uiMode`：full / minimal / custom，默认 custom）|
| 某个外显数据要不要 | 各 `showXxx` 开关（心电图/日报/手机日志/时间线/花费/可视化/上下文条）|
| 出错时行为 | **🛡 保守运行**（`strictRun`，默认关）|
| 自检频率 | **🩺 自检间隔(分)**（`selfCheckMin`，默认 10，0=关）|

## 八、用户协议（必读 ✓）

本项目以 **MIT** 发布（`LICENSE` + `NOTICE` ✓）。
1. **允许二改二发**（含商业 ✓）✗ 但**必须保留版权声明与许可文本** ✓；
   **底线：必须能从源码/产物中读出原作者名字** `鹏冥月落` ✗（产物署名行 / NOTICE / package.json.author ✓）
2. 可**并列**添加二改者署名 ✓ 但**不得覆写、删除或隐藏**原作者署名 ✗
3. UI 上的署名行是**建议保留**（不是使用/分发的许可条件 ✓）
4. **违反者：我们将不再为其获取的数据副本提供支持** ⚠️
5. 作者不对 AI 二次编译产物的可用性负责 ✓
