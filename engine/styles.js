// 风格清单：选风格页和启动脚本共用。顺序就是选风格页上的顺序，编号从 1 开始。
// slug 是 styles/ 下的文件夹名；use 是适合的场景；size 是不指定尺寸时用哪个（不写就是 9x16）；
// fonts 是这个风格要下载的中文字体文件（见 fonts.js）。
(typeof window !== 'undefined' ? window : globalThis).POSTER_STYLES = [
  { "slug": "comic-pop", "name": "漫画波普", "use": "促销、上新、抽奖", "fonts": ["NotoSansSC-Bold.otf", "NotoSansSC-Black.otf"] },
  { "slug": "redbook-bold", "name": "小红书大字", "use": "小红书封面、干货、种草", "size": "3x4", "fonts": ["NotoSansSC-Bold.otf", "NotoSansSC-Black.otf"] },
  { "slug": "redbook-window", "name": "小红书界面风", "use": "小红书封面、课程、工具", "size": "3x4", "fonts": ["NotoSansSC-Bold.otf", "NotoSansSC-Black.otf"] },
  { "slug": "douyin-glitch", "name": "抖音故障", "use": "抖音封面、直播、潮流活动", "fonts": ["NotoSansSC-Bold.otf", "NotoSansSC-Black.otf"] },
  { "slug": "mesh-gradient", "name": "弥散渐变", "use": "文艺、女性向、品牌", "fonts": ["NotoSansSC-Bold.otf", "NotoSansSC-Black.otf", "NotoSerifSC-Black.otf"] },
  { "slug": "big-type", "name": "先锋大字", "use": "展览、讲座、态度表达", "fonts": ["NotoSansSC-Bold.otf", "NotoSansSC-Black.otf"] },
  { "slug": "guochao", "name": "撞色国潮", "use": "节日、大促、开业", "fonts": ["NotoSansSC-Bold.otf", "NotoSansSC-Black.otf"] },
  { "slug": "collage", "name": "拼贴剪报", "use": "社团、市集、创意活动", "fonts": ["NotoSansSC-Bold.otf", "NotoSansSC-Black.otf", "NotoSerifSC-Black.otf"] }
];
