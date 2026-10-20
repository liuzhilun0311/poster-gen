# 内容与版式

只有 title 必填。以下长度是排版建议，不是静默截断规则；
超长内容须检查成品，不改用户事实以满足版式。

| 字段 | 结构与建议 |
| --- | --- |
| title | 字符串或 1～3 行数组，每行常用 4～6 字，较长自动缩小 |
| brand / logo | 主办方名称 / 本机标志图片路径 |
| kicker / issue / slogan | 眉题约 12 字 / 角标约 4 字 / 口号约 16 字 |
| price | label、cur、num、orig、note；num 建议不超过 5 位 |
| points | 最多 3 个 {h, p}，h 建议 8 字，p 建议 14 字 |
| date / dateNote / place | 日期 / 时段补充 / 地点；保留用户事实 |
| qr | {text, cap} 自动画码；或 {image, cap} 使用用户图片，image 优先 |
| contact | 联系方式 |
| fine | 最多 2 行说明，建议每行 30 字以内 |

```json
{
  "title": ["周末", "读书会"],
  "price": {"cur": "¥", "num": "39"},
  "points": [{"h": "一起读书", "p": "带一本你喜欢的书"}],
  "qr": {"text": "https://example.test/signup", "cap": "扫码报名"}
}
```

示例内容只有用户实际提供时才能用于其海报，不能从示例自动补全。
字段一般接受文字或数字，拒绝对象/布尔值等错误类型。未识别字段出现在 unused，
不把它们默默当已展示。图片路径相对工作目录，支持 PNG/JPEG/WebP/SVG/GIF。
文字通过 textContent 或转义后的内容脚本填充，不当 HTML 指令执行。

| 编号 | slug | 中文名 | 默认尺寸 |
| --- | --- | --- | --- |
| 1 | comic-pop | 漫画波普 | 9x16 |
| 2 | redbook-bold | 小红书大字 | 3x4 |
| 3 | redbook-window | 小红书界面风 | 3x4 |
| 4 | douyin-glitch | 抖音故障 | 9x16 |
| 5 | mesh-gradient | 弥散渐变 | 9x16 |
| 6 | big-type | 先锋大字 | 9x16 |
| 7 | guochao | 撞色国潮 | 9x16 |
| 8 | collage | 拼贴剪报 | 9x16 |

## 命令

```text
node scripts/poster.mjs sheet "<工作目录>" --size 3x4 --open
node scripts/poster.mjs render "<工作目录>" --style 2 --size both --no-download
node scripts/poster.mjs fonts --all
```

风格可用编号、slug 或中文名，render 可重复 --style。sheet 支持单尺寸，
render 支持 both。--driver auto|pipe|cli 供排查；默认 auto 在管道连接失败时回退 CLI。
--timeout 是单次操作的秒数，render 默认 30，sheet 默认 45；图片失败最多尝试两次。

检查字段：overflow 为垂直超出像素，out 为出界项，covered 为疑似遮挡，
fontsMissing 为缺字体，qr 为 none/drawn/image/failed，badImages 为未加载图数量。
covered 需视觉复核；qr=drawn 仍需发布前实扫。进程退出 0 不保证 problems 为空，
应同时检查每张图的自查结果。

固定目录关系：styles/<slug>/template.html 引用 ../../engine；
engine/fill.js 引用 ../fonts 的内置字体，中文字体来自配置缓存；
engine/pick.html 引用 styles.js 并加载 ../styles 的预览。
