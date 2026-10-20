// 海报用到的字体清单。浏览器里的填充脚本和启动脚本共用这一份（启动脚本把它当成普通脚本加载）。
// bundled：很小的英文数字字体，直接放在技能的 fonts 文件夹里。
// 其余是中文字体，第一次用的时候由启动脚本从 base 下载到本机，下载后按 sha256 核对。
// 全部是 SIL 开源字体许可 1.1，原样分发，不压缩、不裁剪。
(typeof window !== 'undefined' ? window : globalThis).POSTER_FONTS = {
  "base": "https://code.heihuzi.ai/skills/heihuzi-poster/media/",
  "files": {
    "NotoSansSC-Bold.otf": { "family": "Noto Sans SC", "weight": 700, "size": 8543168, "sha256": "c6cb5a93abaa9edc8ee7463b7ebb7f42d618d40e6ed2f7a5371c97b0b64767c0" },
    "NotoSansSC-Black.otf": { "family": "Noto Sans SC", "weight": 900, "size": 8855916, "sha256": "ccb496022356b7dd14d117538a472ae40feff8f6e8f3fe8bffc5616785d2f3f9" },
    "NotoSerifSC-Black.otf": { "family": "Noto Serif SC", "weight": 900, "size": 11862600, "sha256": "91dde57622845beeb663f300813999febdb7fcd5e451bde199d7c954a9740cb4" },
    "Bungee-Regular.ttf": { "family": "Bungee", "weight": 400, "bundled": true },
    "PlayfairDisplay-Italic.ttf": { "family": "Playfair Display", "weight": "400 900", "style": "italic", "bundled": true }
  }
};
