# 模型原始文件暂存

此目录用于保存正规下载的原始模型包、解压文件和随包许可，位于 public 之外，不会进入游戏发行包。

2026-10-15 已确认玩家 B 和三类独立领导；2026-10-17 用户要求开放许可，将 S1 改为 Modern Office Environment。五款来源均已通过官方按钮下载，页面许可均为 CC BY 4.0。准确作者、UID、哈希、链接和修改记录见 docs/model-replacement-selection.json。

建议按角色保存到以下子目录，保留原始文件名：

- player：B 款玩家。
- department：Eric 部门领导。
- roaming：黑西装巡视领导。
- security：制服安保主管。
- office：Modern Office Environment；原 S1 已排除。

免费不等于 CC0。CC BY 4.0 要求署名、许可链接和修改说明；每个目录的 LICENSE-SOURCE.txt 与 public/licenses 保留了记录。原 S1 为 Free Standard，不符合本次开放许可要求，没有接入。

运行时派生文件由 scripts/prepare-game-models.py 使用官方 Blender 4.5 LTS 本地生成，位于 public/assets/models。原始下载文件不修改、不上传，不将 Renderpeople 的 NoAI 模型用于生成式 AI。

检查解压后的 GLB/glTF：

    node scripts/inspect-model-assets.mjs source-assets --out qa/model-intake.json

该报告仅检查文件结构、骨骼、动画、压缩依赖与外部 URI，不会联网获取依赖，也不代表已经通过浏览器或设备验收。

只有经过检查与优化的运行时模型才能复制到 public/assets。不要将预览查看器缓存当成正规下载文件，也不要用其他人物冒充已确认的模型。
