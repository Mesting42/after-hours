# 素材来源与许可证

2026-10-17：四款人物与一套办公室家具已从作者的 Sketchfab 官方下载入口取得，均标注 **CC BY 4.0**。该开放内容许可允许免费使用、修改和商用，要求保留作者署名、来源与许可链接，并说明修改。它不要求整款游戏代码开源，也不能把第三方模型改标 CC0。

| 用途 | 模型 / 作者 | 官方来源 | 本项目修改 |
| --- | --- | --- | --- |
| 玩家 | Business Man - Low Polygon game character / manoeldarochadeoliveira | [原模型](https://sketchfab.com/3d-models/business-man-low-polygon-game-character-b6f6740f883b4749abac47af0045a9dd) | 米制、贴图优化、原有行走/快走动作适配、蹲伏与互动叠加 |
| 部门领导 | Eric Rigged 001 / Renderpeople | [原模型](https://sketchfab.com/3d-models/eric-rigged-001-rigged-3d-business-man-a46bc9f67aaa415bb4f3241eef900e7f) | 保留原表面与蒙皮，简化骨骼映射，新增待机/行走/快走，贴图优化 |
| 巡视领导 | Businessman (Rigged) / Jungle Jim | [原模型](https://sketchfab.com/3d-models/businessman-rigged-8933d61fcb1e46f3aead661227bb4fed) | 骨骼映射、新增动作、网格减面与贴图优化 |
| 安保主管 | Police 3D Model / Aayush.Bhattarai | [原模型](https://sketchfab.com/3d-models/police-3d-model-c02d07f380f74bd485a4820f0f5f7541) | 原包没有骨骼；新增骨骼/权重/动作，警徽区域改为普通安保服，贴图优化 |
| 办公室家具 | Modern Office Environment / Bl4ckGh0st | [原模型](https://sketchfab.com/3d-models/modern-office-environment-64144940384d426884f70a9c941bf124) | 拆分书桌、椅子、柜子、书架、桌子和绿植；优化贴图，适配现有五区 |

五款模型均采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。完整法律文本位于 `public/licenses/CC-BY-4.0.txt`，可随发行包在 `licenses/` 中取得；英文署名与修改说明位于 `MODEL-ATTRIBUTIONS.txt`。游戏菜单「素材来源」也保留作者、原模型、许可链接及修改说明。作者没有为本项目背书。

Eric 页面另有 NoAI 声明：不得用于生成式 AI 的数据集、开发或作为其输入。本项目只以 Blender 在本地进行确定性的网格/骨骼处理与游戏渲染，保留该声明，不上传模型或用于生成式 AI。

原 S1 `office large room FREE` 仅为 Free Standard，按用户的开放许可要求已排除；未接入游戏。收费 P2 及来源不清的转载素材也已排除。没有购买、订阅或付费授权。

原始文件位于 `source-assets/`，不会直接进入发行包；来源、SHA256、字节数、检查范围与修改记录见 `docs/model-replacement-selection.json`。`scripts/prepare-game-models.py` 可使用官方 Blender 4.5 LTS 重建派生 GLB；原始下载不修改。静态检查不等于动画/设备验收，当前验证范围见 QA_CHECKLIST.md。

## 项目原创素材

建筑墙体、通道、功能门禁、电梯、摄像头/打印机等交互装置、视野锥、任务标记、指引、图标、地面 SVG 纹理和六个 PCM 音效为本地项目原创，按 CC0-1.0 提供。原创作者为本项目（Codex 协助制作）；来源为 `OfficeWorld.ts`、`TutorialGuide.ts`、`icons.ts` 与 `scripts/generate-assets.mjs`。原始地址不存在时明确记为本地原创。设备系统字体只调用、不再分发。项目原创许可不覆盖上表第三方模型。

## 软件依赖

| 软件 | 原始地址 | 作者 | 许可证 |
| --- | --- | --- | --- |
| Babylon.js core / loaders | https://github.com/BabylonJS/Babylon.js | Babylon.js Contributors | Apache-2.0 |
| Vite | https://github.com/vitejs/vite | Vite Contributors | MIT |
| TypeScript | https://github.com/microsoft/TypeScript | Microsoft | Apache-2.0 |
| Vitest | https://github.com/vitest-dev/vitest | Vitest Contributors | MIT |
| Blender（仅本地资源构建） | https://www.blender.org/ | Blender Foundation / contributors | GPL；生成的模型仍遵循各自素材许可 |

软件依赖许可证不是模型的授权。版本由 package-lock.json 锁定，许可证保留在安装包中。交付时保留本文件、THIRD_PARTY_NOTICES.txt 及 dist/licenses/。
