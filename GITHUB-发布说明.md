# 发布到 GitHub（照抄即可）

## 一、这个目录就是仓库根目录

`package.json`、`cordis.patch.yml`、`lib/` **必须在仓库根**，DSH 安装时直接拉取仓库根，
**不会进子目录去找** `package.json`。本目录已按此排布 ✓

```
.
├─ package.json          ← DSH 靠它找入口(main)与补丁(dsh.bundle.patch)
├─ cordis.patch.yml      ← 插件激活补丁（被上面的字段引用）
├─ lib/                  ← 运行时（也是源码，本插件无构建步骤）
├─ extras/               ← 一键安装、哨兵、hb/interrupt/pause/phone-done、给 AI 的说明片段
├─ install.sh            ← 给人看的便利入口：bash install.sh
├─ README.md  AI-CUSTOMIZE.md  CHANGELOG.md  LICENSE
├─ .gitignore  .gitattributes
└─ GITHUB-发布说明.md     ← 本文件（发布后可删）
```

## 二、推上去

```bash
cd dist/github-repo
git init -b main
git add -A
git commit -m "dsh-heartbeat 1.2.0: DSH 心跳板插件"
git remote add origin git@github.com:pengmingyueluo-creator/dsh-heartbeat.git
git push -u origin main
```

> 建议在 `package.json` 里补上 `repository` / `homepage`（截图里那位说的没错，那是给 npm 元数据用的；
> **DSH 从 git 安装并不需要它**，但公开项目最好填上）。

## 三、别人怎么装（写进 README 了）

```bash
# 只装插件本体：
dsh plugin --profile web add github:pengmingyueluo-creator/dsh-heartbeat

# 想连手机哨兵、hb、接管/暂停脚本一起装（推荐）：
git clone https://github.com/pengmingyueluo-creator/dsh-heartbeat && cd dsh-heartbeat && bash install.sh
```

装完 **重启一次 DSH App**（宿主半侧在进程启动时加载）。

## 四、关于 `allowBuilds`（本插件不需要 ✓）

DSH 源码里写得很清楚：git 托管的插件"**安装时通过 prepare 脚本构建**"，pnpm 默认拦截构建脚本，
需要手动把包名加进 `pnpm-workspace.yaml` 的 `allowBuilds` 再重跑。

**本插件是纯 JavaScript，没有 `prepare`/`build`/`install` 脚本**（只有 `scripts.check` 做语法自检），
所以别人 `dsh plugin add github:...` 时**不会**卡在 allowBuilds 这一步 ✓

如果以后给插件加了构建步骤（TypeScript / 打包器），就必须在 README 里告诉用户去加 `allowBuilds`，否则必报错。

## 五、发布前检查清单

- [ ] `package.json` 的 `version` 已递增；`CHANGELOG.md` 已记一笔
- [ ] `scripts.check` 通过（`npm run check` 或 `node --check` 三个文件）
- [ ] `lib/widget.js` 改了的话 `SELF_VER` 已 +1
- [ ] `lib/core.cjs` 的 `PAGE_VERSION` 与 `lib/board.html` 的 `var V=` 一致
- [ ] 补 `repository` / `homepage`；README 放一两张截图
- [ ] 打 tag：`git tag v1.2.0 && git push --tags`
