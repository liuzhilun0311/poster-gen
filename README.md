# 海报制作 (poster-gen)

英文调用标识是 `$poster-gen`，界面显示为“海报制作 (poster-gen)”。

把标题、价格、日期、卖点、标志和二维码排入八种版式，用本机浏览器输出 PNG。
文字采用实际排版，不调用图片生成模型；无需 API Key，也不产生生成服务费用。
成品仍需检查遮挡、缺字和二维码可读性，不能保证任意内容都能自动排好。

## 准备与安装

需要 Node.js 18+ 和本机 Chrome、Edge 或兼容 Chromium。
将整个目录放入宿主技能目录并刷新，或直接让助手读取 SKILL.md。
engine、styles、fonts 是互相引用的运行资源，不能只复制脚本。

```text
使用 $poster-gen 做一张海报：周末编程公开课，免费报名，先给我看所有风格。
使用 $poster-gen 用小红书大字风格制作封面，标题是“周末读书会”。
```

未提供的价格、日期和联系方式不会编造。未选风格时先展示总览；
点名风格时直接生成。尺寸支持 1080×1920 和 1080×1440，可同时导出。
不支持照片插画主体、横版/方形或整组图文；用户提供的标志和二维码图片可以放入版式。

## 配置

| config/runtime.json 字段 | 用途 |
| --- | --- |
| browser_path | 空表示自动查找；非空为浏览器路径 |
| font_directory | 中文字体缓存目录，支持 `~` |
| font_base_url | 空表示使用内置字体源；非空覆盖下载地址 |
| allow_font_download | 是否允许自动下载缺失字体，默认 true |

相对配置路径以技能目录为基准。HEIHUZI_POSTER_BROWSER、HEIHUZI_FONT_DIR、
HEIHUZI_POSTER_FONT_BASE 分别优先覆盖对应设置，沿用旧环境变量兼容方式。
字段缺失、类型错误或未知字段会报错。

字体首次使用可能联网下载约 17～29 MB，按大小和 SHA-256 校验；
离线设置 allow_font_download 为 false 或命令传 --no-download。
缺字体时使用系统字体并给出提示，外观可能变化。不会自动安装浏览器。

## 手工运行

每张海报使用一个独立工作文件夹，创建最小内容文件 content.json：

```json
{"title": ["周末", "读书会"]}
```

从技能目录运行：

```text
node scripts/poster.mjs check
node scripts/poster.mjs sheet "<海报文件夹>" --open
node scripts/poster.mjs render "<海报文件夹>" --style redbook-bold --size 3x4
```

输出包括 content.js、总览.png、选风格.html 或各风格 PNG，第一行 JSON 给出真实结果。
这些是工作文件，不写进技能资源目录。选风格页依赖技能目录保持原位，
分享成品直接使用 PNG。内容字段和风格编号见 [内容与版式](references/content.md)。

字体许可保留在 fonts/，二维码库许可保留在 engine/。这些许可不自动覆盖其余实现；
公开分发整个目录前需确认整体使用与分发授权。
