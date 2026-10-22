# 准点下班：开放许可模型替换交付

2026-10-17，用户确认：玩家 B 与三类独立领导保留；原 S1 因 Free Standard 不符合开放许可要求，改用 Modern Office Environment。五款均从 Sketchfab 官方下载按钮取得，页面许可链接均核对为 CC BY 4.0。没有购买或付费。准确 UID、作者、原始文件哈希和派生文件哈希见 `model-replacement-selection.json`。

## 当前结果

- 玩家使用 Business Man，保留其 25 段原始动画；使用原有待机、行走和快走，补充关节蹲伏、互动与发现姿态。
- 部门领导 Eric、巡视领导 Businessman 分别使用独立外观和骨骼实例，保留源模型蒙皮并映射到小型解剖骨架，新增 Idle / Walk / Run。
- 安保 Police 原始 GLB 与 FBX 均没有骨骼；本地添加骨架、平滑权重和三段动画，服装标志区域改为普通安保服。
- 办公室拆成书桌、椅子、柜子、书架、桌子、绿植，按原有五区布置。家具中心及落地高度经过顶点检查，导航占地仍由独立配置维护。
- 10 个运行时 GLB 共 18,159,936 字节，均内嵌纹理，无必需压缩扩展、外部纹理 URI 或网络解码器。
- 灯光适配与中性家具表面提高游戏照明下的可见度。隐藏模板保留在场景中，使 Babylon 实例能正确接收新增和切换的灯光。
- 原摄像机跟随、新手五步教学、任务、AI、门禁、设置和正常存档保留。开发验证使用独立存档键，不覆盖正常旅程。

## 来源与许可

完整清单见 `../ASSET_SOURCES.md`。运行时在菜单「素材来源」显示作者、原站链接、CC BY 4.0 链接与修改说明；`public/licenses/` 和构建后的 `dist/licenses/` 包含法律文本、署名说明和软件通知。Renderpeople 的附加 NoAI 声明保留；未将模型上传到生成式图像/模型服务。

模型的 CC BY 4.0 不等于整款游戏代码使用该许可，也不等于 CC0。原始来源与优化派生文件不冒充项目原创。

## 验证证据

- `npm test`：7 个测试文件，47 项通过。新增测试直接检查发行 GLB 的骨骼、有效动作、独立模型、内嵌纹理、家具中心/落地高度与许可清单。
- `npm run build`：TypeScript 严格检查及 Vite 生产构建通过。
- `npm run qa`：22 个本地资产与构建副本逐字节哈希一致，配置、许可证、旧参数清理和生产测试夹具排除通过。
- 实际 Chromium：五区所有目标和安全检查点可达；新手金色路径逐段碰撞检查通过。
- 普通五区主线完成：关机、工牌、访客证、打印启动与等待取件、人事口令 1800、四道门禁、供电/呼叫电梯、开门/进入/关门与普通结局。
- 硬核：发现失败、检查点重试、难度保持、隐藏/离开、最终章电梯与「无声的专业人士」结局通过。
- 低→高→中画质切换无运行错误；四种人物近景、行走/快走、玩家蹲伏检查通过。
- 独立生产地址 `127.0.0.1:4188`：菜单署名、进入游戏、暂停，带 `?qa=1` 也没有开发面板。
- 390×844：无横向溢出；实际摇杆拖动推进教学至「关闭你的电脑」；蹲伏的 aria-pressed 反馈正确。此为浏览器视口验证，不是手机实机验收。
- 1280×720、Intel HD Graphics 630 前台短时样本约 43–51 FPS。后台页曾被调度限制到约 1–2 FPS；不以此推算设备性能。一次包含 GPU 回读的独立渲染成本样本平均 26.7 ms，也不作为持续帧率保证。

证据文件：`qa/runtime-model-intake.json`、`qa/model-flow-browser-20261017.json`、`qa/model-regression-browser-20261017.json`、`qa/model-hard-ending-20261017.json`、`qa/model-production-browser-20261017.json` 与 `qa/screenshots/models-*-20261017.jpg`。

主线使用明确可见的开发定位/时间夹具，证明游戏规则与结局链可执行，不能作为无辅助首玩或通关时长数据。

## 清理与恢复

旧盒体人物、旧家具生成实现和对应导入已替换；旧 `office-kit.json` 与 `motion.json` 已删除。布局和电梯时序移到独立 `assets/config/`，共享建筑、碰撞、导航、音效和地面纹理保留。素材生成脚本不会重新生成旧人物参数。

过期 P2/S1 活动预览与旧截图已清理，`art-preview/` 只展示当前五款开放许可来源。重复办公室候选副本已删除，选定原始文件仍在 `source-assets/office/`。

替换前恢复备份：`backups/before-model-replacement-20261015-204942`。删除旧参数与截图前对照该备份核对了 SHA256。旧 `准点下班-v1.0.0-20261014.zip` 仅为历史版本，保留但不是本次交付。

## 接手与重建

1. `npm install`，运行 `npm run dev`；生产包使用 `npm run build`、`npm run preview`。
2. 四种原始人物和办公室在 `source-assets/<role>/`，每个目录有 `LICENSE-SOURCE.txt`。
3. 使用官方 Blender 4.5 LTS：`blender --background --factory-startup --python scripts/prepare-game-models.py`。可在命令后加 `-- office` 单独重建家具。
4. `node scripts/record-model-licenses.mjs` 重新记录来源哈希；`node scripts/inspect-model-assets.mjs public/assets/models --out qa/runtime-model-intake.json` 做静态检查。
5. `npm test`、`npm run build`、`npm run qa`；模型改变后仍须实际浏览器观察骨骼、材质、比例和交互。

未验收：真实 Android/iOS、实体手柄、多浏览器完整流程、持续功耗/热降频、真人无辅助首玩时长。没有部署到外部网站或提交 Git 版本。
