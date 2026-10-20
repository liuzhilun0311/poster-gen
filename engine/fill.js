// 海报模板的填充脚本：在浏览器里运行。把内容填进模板、装字体、画二维码、把大字调到刚好，最后自查。
//
// 模板的网址参数：
//   content   内容文件的地址（一个 .js 文件，里面是 window.POSTER = {...}）
//   fonts     放中文字体的文件夹的地址；不给就用系统自带的字体
//   size      9x16（竖长版 1080×1920，默认）或 3x4（小红书版 1080×1440）
//
// 模板里的写法：
//   data-s="price.num"        填这一项的文字；内容里没有这一项就整块隐藏
//   data-need="price.num"     这个容器依赖的内容；写多项时用空格隔开，全都没有才隐藏
//   data-count                数出容器里看得见的孩子有几个，写回这个属性；第一个加 is-first、最后一个加 is-last
//   data-chars                把文字拆成一个字一个小块（拼贴风格用），并把字数写在 data-n 上
//   data-digits（写在 body 上） 把数字单独包起来，换成清楚的数字字体
//   data-fit="960"            把这行字的字号调到正好 960 像素宽（写成 "37rem" 就按 rem 算，用在跟着尺寸缩放的小框里）；data-max="27" 是字号上限（单位 rem）。
//                             模板的样式里写了 --fit-max 就以它为准（比如“没有价格时标题可以更大”）
//   data-qr                   在这里放二维码（内容里给网址就生成，给图片就原样放）
//   data-logo                 在这里放标志图片；没给图片就隐藏，旁边的 data-nologo 才显示
//   data-bleed                故意伸出画面的装饰，自查时不算出界
//   window.POSTER_AFTER       模板可以定义这个函数：字都填好、大小都调好之后调用一次（比如按最终尺寸剪出撕纸边）
//
// 自查结果写在 <html data-check="…">（JSON），启动脚本读它：
//   size        实际用的尺寸
//   empty       内容里完全没有标题
//   overflow    内容比画面高出多少像素（0 表示放得下）
//   out         跑出画面的内容项
//   covered     可能被别的东西盖住的内容项（有误报，要看图确认）
//   fontsMissing 没装上的字体文件
//   qr          none / drawn / image / failed
//   badImages   没加载出来的图片数
//   errors      其它问题的说明
(function () {
  var root = document.documentElement;
  var q = new URLSearchParams(location.search);
  var size = q.get('size') === '3x4' ? '3x4' : '9x16';
  var W = 1080, H = size === '3x4' ? 1440 : 1920;
  root.setAttribute('data-size', size);
  var engine = (document.currentScript && document.currentScript.src || '').replace(/[^/]*$/, '');
  var report = { size: size, empty: false, overflow: 0, out: [], covered: [], fontsMissing: [], qr: 'none', badImages: 0, errors: [] };
  var all = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function done() {
    root.setAttribute('data-check', JSON.stringify(report));
    // 放在选风格页的小窗里时，把结果告诉外面的页面
    if (window.parent !== window) try { window.parent.postMessage({ posterCheck: report, style: q.get('style') || '' }, '*'); } catch (e) {}
  }
  function fail(message) { report.errors.push(message); done(); }

  function loadScript(src, ok, bad) {
    var s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = bad;
    document.head.appendChild(s);
  }

  // 装字体：小的英文数字字体在技能自己的 fonts 文件夹里；中文字体在参数给的文件夹里
  var loads = [];
  function installFonts() {
    var table = window.POSTER_FONTS || { files: {} };
    var wanted = ((document.querySelector('meta[name="poster-fonts"]') || {}).content || '')
      .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var dir = q.get('fonts');
    Object.keys(table.files).forEach(function (file) {
      var f = table.files[file];
      if (wanted.indexOf(f.family) < 0) return;
      var url = f.bundled ? engine + '../fonts/' + file : dir ? dir.replace(/\/$/, '') + '/' + encodeURIComponent(file) : null;
      if (!url) { report.fontsMissing.push(file); return; }
      var face = new FontFace(f.family, 'url("' + url + '")', { weight: String(f.weight), style: f.style || 'normal', display: 'block' });
      document.fonts.add(face);
      loads.push(face.load().then(null, function () { report.fontsMissing.push(file); }));
    });
  }

  function get(P, path) {
    var o = P;
    path.split('.').forEach(function (k) { o = (o == null) ? o : o[k]; });
    return (o == null || o === '') ? null : o;
  }
  function resolve(file) {
    // 图片地址相对内容文件所在的文件夹
    try { return new URL(file, q.get('content') || location.href).href; } catch (e) { return file; }
  }

  var charIndex = 0;
  function fill(P) {
    if (!P.mark && P.brand) P.mark = Array.from(String(P.brand))[0];
    report.empty = !get(P, 'title.0');
    var digits = document.body.hasAttribute('data-digits');
    all('[data-s]').forEach(function (el) {
      var v = get(P, el.getAttribute('data-s'));
      if (v === null) { el.hidden = true; return; }
      v = String(v);
      el.setAttribute('data-text', v);  // 给重影、错位这类效果用
      el.textContent = '';
      if (el.hasAttribute('data-chars')) {
        el.setAttribute('data-n', String(Array.from(v.replace(/ /g, '')).length));
        Array.from(v).forEach(function (ch) {
          var c = document.createElement('span');
          if (ch === ' ') c.className = 'sp'; else { c.className = 'c c' + (charIndex++ % 6); c.textContent = ch; }
          el.appendChild(c);
        });
      } else if (digits) {
        v.split(/([0-9¥%][0-9¥%.:—-]*)/).forEach(function (part, i) {
          if (!part) return;
          if (i % 2) { var d = document.createElement('span'); d.className = 'd'; d.textContent = part; el.appendChild(d); }
          else el.appendChild(document.createTextNode(part));
        });
      } else el.textContent = v;
    });
    all('[data-need]').forEach(function (el) {
      var any = el.getAttribute('data-need').split(/\s+/).some(function (path) { return get(P, path) !== null; });
      if (!any) el.hidden = true;
    });
    // data-count：数一数容器里还剩几个看得见的孩子（卖点可能只有两个），并标出第一个和最后一个
    all('[data-count]').forEach(function (el) {
      var kids = Array.prototype.filter.call(el.children, function (c) { return !c.hidden && !c.hasAttribute('data-skip'); });
      el.setAttribute('data-count', String(kids.length));
      if (kids.length) { kids[0].classList.add('is-first'); kids[kids.length - 1].classList.add('is-last'); }
      if (!kids.length) el.hidden = true;
    });
    var logo = get(P, 'logo');
    all('[data-logo]').forEach(function (el) {
      if (!logo) { el.hidden = true; return; }
      var img = new Image(); img.alt = ''; img.src = resolve(logo); el.appendChild(img);
    });
    all('[data-nologo]').forEach(function (el) { if (logo) el.hidden = true; });
    var qr = P.qr || {};
    all('[data-qr]').forEach(function (el) {
      if (qr.image) {
        var img = new Image(); img.alt = ''; img.src = resolve(qr.image); el.appendChild(img); report.qr = 'image';
      } else if (qr.text && typeof QRCode !== 'undefined') {
        try {
          // 只借二维码库算出黑白格子，自己画成矢量图：放多大都是清楚的方块，不会因为缩放发虚
          var code = new QRCode(document.createElement('div'), { text: String(qr.text), width: 64, height: 64, correctLevel: QRCode.CorrectLevel.M })._oQRCode;
          var n = code.getModuleCount(), d = '';
          for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (code.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
          el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges"><rect width="' + n + '" height="' + n + '"/><path d="' + d + '"/></svg>';
          el.querySelector('rect').setAttribute('fill', el.getAttribute('data-light') || '#ffffff');
          el.querySelector('path').setAttribute('fill', el.getAttribute('data-dark') || '#111111');
          report.qr = 'drawn';
        } catch (e) { report.qr = 'failed'; report.errors.push('二维码画不出来：内容可能太长'); }
      } else if (qr.text) { report.qr = 'failed'; report.errors.push('二维码库没有加载'); }
    });
  }

  function fit() {
    var rem = parseFloat(getComputedStyle(root).fontSize);
    all('[data-fit]').forEach(function (el) {
      if (el.hidden) return;
      var target = parseFloat(el.getAttribute('data-fit')) * (/rem\s*$/.test(el.getAttribute('data-fit')) ? rem : 1);
      var max = (parseFloat(getComputedStyle(el).getPropertyValue('--fit-max')) || parseFloat(el.getAttribute('data-max')) || 999) * rem;
      for (var i = 0; i < 3; i++) {
        var w = el.offsetWidth;
        if (!w) return;
        el.style.fontSize = Math.min(max, parseFloat(getComputedStyle(el).fontSize) * target / w) + 'px';
      }
    });
  }

  // 取点时碰到的那个东西，在这个位置是不是真的看得见。两种情况不算：
  // 一是大字上下看不见的那截行框（字号很大、行距压得很紧时会伸到别的字上面）；二是什么都没画的空盒子。
  function paints(top, y) {
    var holder = top;
    while (holder && getComputedStyle(holder).display === 'inline') holder = holder.parentElement;
    var b = (holder || top).getBoundingClientRect();
    if (y < b.top || y > b.bottom) return false;
    if (top.closest('[data-s]') || /^(img|svg|canvas|path|rect|circle|polygon)$/i.test(top.tagName)) return true;
    var cs = getComputedStyle(top);
    return cs.backgroundImage !== 'none' || !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || parseFloat(cs.borderTopWidth) > 0;
  }

  function check() {
    var poster = document.querySelector('.poster') || document.body;
    // 放不下：看从上往下排的那些块，最底下一块的下沿超出画面多少（铺底的装饰和转了角度的块不影响这个数）
    var bottom = 0;
    Array.prototype.forEach.call(poster.children, function (c) {
      if (c.hidden || c.classList.contains('bg') || getComputedStyle(c).position === 'absolute') return;
      bottom = Math.max(bottom, c.offsetTop + c.offsetHeight + (parseFloat(getComputedStyle(c).marginBottom) || 0));
    });
    var over = Math.round(bottom + (parseFloat(getComputedStyle(poster).paddingBottom) || 0) - poster.clientHeight);
    report.overflow = over > 2 ? over : 0;  // 一两个像素是尺寸换算的零头，不算
    all('[data-s]').forEach(function (el) {
      if (el.hidden || el.closest('[hidden]')) return;
      var name = el.getAttribute('data-s');
      var range = document.createRange(); range.selectNodeContents(el);
      var r = range.getBoundingClientRect();
      if (!r.width) return;
      // 字的选区上下会比这一行的格子高出一截（行距压得很紧的大字尤其明显），上下以格子为准，免得误报出界
      var holder = el;
      while (holder && getComputedStyle(holder).display === 'inline') holder = holder.parentElement;
      var b = (holder || el).getBoundingClientRect();
      var t = { left: r.left, right: r.right, top: Math.max(r.top, b.top), bottom: Math.min(r.bottom, b.bottom) };
      t.width = t.right - t.left; t.height = t.bottom - t.top;
      if ((t.left < -1 || t.top < -1 || t.right > W + 1 || t.bottom > H + 1) && !el.closest('[data-bleed]')) report.out.push(name);
      // 沿文字中线取几个点，看最上面一层是不是它自己；是别的东西就可能被盖住了。
      // 故意伸出画面、转了角度重复排的装饰字（胶带）不查：转过以后的外框互相交叠，查了全是误报。
      if (el.closest('[data-bleed]')) return;
      var vertical = getComputedStyle(el).writingMode.indexOf('vertical') === 0;
      var hit = [0.12, 0.5, 0.88].some(function (k) {
        var x = vertical ? t.left + t.width / 2 : t.left + t.width * k;
        var y = vertical ? t.top + t.height * k : t.top + t.height / 2;
        if (x < 0 || y < 0 || x >= W || y >= H) return false;
        var top = document.elementFromPoint(x, y);
        var over = top && !el.contains(top) && !top.contains(el) && paints(top, y);
        if (over && q.get('debug')) (report.coveredBy = report.coveredBy || {})[name] = top.tagName.toLowerCase() + '.' + top.className;  // 调模板时用：是谁盖在上面
        return over;
      });
      if (hit && report.covered.indexOf(name) < 0) report.covered.push(name);
    });
    report.badImages = all('img').filter(function (i) { return !(i.complete && i.naturalWidth > 0); }).length;
    if (report.qr === 'image' && all('[data-qr] img').some(function (i) { return !(i.complete && i.naturalWidth > 0); })) report.qr = 'failed';
  }

  function start() {
    var P = window.POSTER;
    if (!P || typeof P !== 'object') return fail('没有读到海报内容');
    try { fill(P); } catch (e) { return fail('填内容时出错：' + e.message); }
    var images = all('img').map(function (img) {
      return img.complete ? null : new Promise(function (ok) { img.onload = img.onerror = ok; });
    });
    Promise.all(loads.concat(images)).then(function () { return document.fonts.ready; }).then(function () {
      fit();
      return document.fonts.ready;
    }).then(function () {
      try { if (typeof window.POSTER_AFTER === 'function') window.POSTER_AFTER(); } catch (e) { report.errors.push('模板收尾时出错：' + e.message); }
      try { check(); } catch (e) { report.errors.push('自查时出错：' + e.message); }
      done();
    });
  }

  try { installFonts(); } catch (e) { report.errors.push('装字体时出错：' + e.message); }
  var content = q.get('content');
  if (content) loadScript(content, start, function () { fail('内容文件打不开'); });
  else start();  // 设计稿可以直接在页面里写好 window.POSTER
})();
