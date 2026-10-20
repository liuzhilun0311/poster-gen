#!/usr/bin/env node
// 与图片创作一致，先提示旧版 Node，再加载内置模块。
if (Number(process.versions.node.split('.')[0]) < 18) {
    process.stderr.write('Node 版本太旧，请安装 Node 18 或更新版本后再运行。\n');
    process.exit(1);
}

import {loadRuntimeConfig} from './runtime-config.mjs';

export async function createModule(options = {}) {
    const [fs, path, os, http, https, crypto, url, vm, cp, tty, stream] = await Promise.all([
        'node:fs', 'node:path', 'node:os', 'node:http', 'node:https', 'node:crypto',
        'node:url', 'node:vm', 'node:child_process', 'node:tty', 'node:stream/promises',
    ].map(name => import(name)));
    const {settings, resolvePath} = loadRuntimeConfig(import.meta.url, {
        browser_path: 'string', font_directory: 'string', font_base_url: 'string', allow_font_download: 'boolean',
    });
    if (!settings.font_directory.trim()) throw new Error('字体目录不能为空。');
    const m = {}, env = options.env || process.env;
    const self = url.fileURLToPath(import.meta.url);
    m.root = options.root || path.resolve(path.dirname(self), '..');
    m.VERSION = '1.0';
    const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    class UserError extends Error {}
    m.UserError = UserError;
    const expand = v => v === '~' ? os.homedir() : /^~[/\\]/.test(v) ? path.join(os.homedir(), v.slice(2)) : v;
    m.fontDir = env.HEIHUZI_FONT_DIR ? path.resolve(expand(env.HEIHUZI_FONT_DIR)) : resolvePath(settings.font_directory);
    m.is_main = (entry = process.argv[1]) => {
        if (!entry) return false;
        try {
            if (fs.realpathSync(entry) === fs.realpathSync(self)) return true;
            const a = fs.statSync(entry, {bigint: true}), b = fs.statSync(self, {bigint: true});
            return Boolean(a.ino && b.ino && a.dev === b.dev && a.ino === b.ino);
        } catch (_) { return path.resolve(entry) === self; }
    };
    // 管道同步写 UTF-8；终端交给 Node 的 Unicode 写入路径（Windows 也不依赖代码页）。
    m.output = async (value, stderr = false) => {
        const text = (value + '\n').replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,
            c => '\\u' + c.charCodeAt(0).toString(16));
        if (tty.isatty(stderr ? 2 : 1)) {
            const out = stderr ? process.stderr : process.stdout;
            await new Promise((resolve, reject) => {
                const error = e => reject(e);
                out.once('error', error);
                out.write(text, 'utf8', e => { setImmediate(() => out.removeListener('error', error)); e ? reject(e) : resolve(); });
            });
        } else {
            const bytes = Buffer.from(text, 'utf8');
            for (let offset = 0; offset < bytes.length;) offset += fs.writeSync(stderr ? 2 : 1, bytes, offset, bytes.length - offset);
        }
    };
    m.loadTables = () => {
        const sandbox = Object.create(null);
        vm.createContext(sandbox, {codeGeneration: {strings: false, wasm: false}});
        for (const file of ['fonts.js', 'styles.js']) vm.runInContext(fs.readFileSync(path.join(m.root, 'engine', file), 'utf8'), sandbox, {filename: file, timeout: 1000});
        return {fonts: JSON.parse(JSON.stringify(sandbox.POSTER_FONTS)), styles: JSON.parse(JSON.stringify(sandbox.POSTER_STYLES))};
    };
    m.findBrowser = ({platform = process.platform, exists = p => { try { return fs.statSync(p).isFile(); } catch (_) { return false; } }, home = os.homedir(), environment = env} = {}) => {
        if (environment.HEIHUZI_POSTER_BROWSER || settings.browser_path) {
            const p = environment.HEIHUZI_POSTER_BROWSER ? expand(environment.HEIHUZI_POSTER_BROWSER) : resolvePath(settings.browser_path);
            if (!exists(p)) throw new UserError('HEIHUZI_POSTER_BROWSER 指向的文件不存在，请改成 Chrome 或 Edge 的完整路径。');
            return {name: '指定浏览器', path: p};
        }
        const candidates = [];
        if (platform === 'darwin') {
            for (const [name, app, bin] of [['Chrome', 'Google Chrome', 'Google Chrome'], ['Edge', 'Microsoft Edge', 'Microsoft Edge'], ['Chromium', 'Chromium', 'Chromium']])
                for (const dir of ['/Applications', path.join(home, 'Applications')]) candidates.push({name, path: path.join(dir, app + '.app', 'Contents/MacOS', bin)});
        } else if (platform === 'win32') {
            for (const [name, rel] of [['Edge', 'Microsoft/Edge/Application/msedge.exe'], ['Chrome', 'Google/Chrome/Application/chrome.exe']])
                for (const dir of [environment.ProgramFiles, environment['ProgramFiles(x86)'], environment.LocalAppData]) if (dir) candidates.push({name, path: path.win32.join(dir, rel)});
        } else {
            for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'])
                for (const dir of (environment.PATH || '').split(path.delimiter).filter(Boolean)) candidates.push({name, path: path.join(dir, name)});
        }
        return candidates.find(v => exists(v.path)) || null;
    };
    m.selectStyles = (values, styles) => {
        const selected = values.map(value => styles.find((s, i) => value === String(i + 1) || value === s.slug || value === s.name));
        if (selected.some(v => !v)) throw new UserError('风格写错了，可选：' + styles.map((s, i) => `${i + 1} ${s.slug}（${s.name}）`).join('、'));
        return [...new Set(selected)];
    };
    m.normalizeContent = (input, directory) => {
        if (!object(input)) throw new UserError('content.json 必须是一个对象，请用 { "title": ["你的标题"] } 这样的写法。');
        const unused = [], output = {};
        const text = (v, key) => {
            if (v === undefined || v === null) return undefined;
            if (!['string', 'number'].includes(typeof v)) throw new UserError(`${key} 要写文字或数字，请不要填写数组、对象或布尔值。`);
            return String(v).trim() || undefined;
        };
        const fields = (source, keys, prefix = '') => {
            const result = {};
            for (const k of Object.keys(source)) if (!keys.includes(k)) unused.push(prefix + k);
            for (const k of keys) { const v = text(source[k], prefix + k); if (v !== undefined) result[k] = v; }
            return result;
        };
        const allowed = ['brand', 'logo', 'kicker', 'issue', 'title', 'slogan', 'price', 'points', 'date', 'dateNote', 'place', 'qr', 'contact', 'fine'];
        for (const key of Object.keys(input)) if (!allowed.includes(key)) unused.push(key);
        for (const key of allowed.filter(k => !['title', 'price', 'points', 'qr', 'fine'].includes(k))) {
            const v = text(input[key], key); if (v !== undefined) output[key] = v;
        }
        const lines = (v, key, max) => {
            if (v === undefined || v === null) return [];
            const a = Array.isArray(v) ? v : [v];
            if (a.length > max) throw new UserError(`${key} 最多 ${max} 行，请删减后再试。`);
            return a.map((x, i) => text(x, `${key}[${i}]`)).filter(v => v !== undefined);
        };
        output.title = lines(input.title, 'title', 3);
        if (!output.title.length) throw new UserError('还没有标题，请在 content.json 的 title 里写 1 到 3 行标题。');
        const fine = lines(input.fine, 'fine', 2); if (fine.length) output.fine = fine;
        for (const [key, keys] of [['price', ['label', 'cur', 'num', 'orig', 'note']], ['qr', ['text', 'image', 'cap']]]) {
            if (input[key] == null || input[key] === '') continue;
            if (!object(input[key])) throw new UserError(`${key} 必须是对象，请按内容清单示例填写。`);
            const result = fields(input[key], keys, key + '.'); if (Object.keys(result).length) output[key] = result;
        }
        if (input.points != null) {
            if (!Array.isArray(input.points) || input.points.length > 3) throw new UserError('points 要写成数组，最多 3 个卖点，请删减后再试。');
            output.points = input.points.map((p, i) => {
                if (!object(p)) throw new UserError(`points[${i}] 必须是有 h 的对象。`);
                const result = fields(p, ['h', 'p'], `points[${i}].`);
                if (!result.h) throw new UserError(`points[${i}].h 还没写，请补上这个卖点的标题。`);
                return result;
            });
        }
        const picture = (v, key) => {
            const filename = path.resolve(directory, expand(v));
            if (!/\.(png|jpe?g|webp|svg|gif)$/i.test(filename)) throw new UserError(`${key} 请使用 png、jpeg、webp、svg 或 gif 图片。`);
            try { if (!fs.statSync(filename).isFile()) throw new Error(); }
            catch (_) { throw new UserError(`${key} 图片不存在：${filename}。请检查路径，或把图片放进海报文件夹。`); }
            return url.pathToFileURL(filename).href;
        };
        // 网址里带中文时先转成纯英文数字的写法：二维码里直接放中文，有的扫码软件会认成乱码
        if (output.qr?.text && /^https?:\/\//i.test(output.qr.text) && /[^\x20-\x7e]/.test(output.qr.text)) { try { output.qr.text = new URL(output.qr.text).href; } catch (_) {} }
        if (output.logo) output.logo = picture(output.logo, 'logo');
        if (output.qr?.image) { output.qr.image = picture(output.qr.image, 'qr.image'); delete output.qr.text; }
        return {content: output, unused};
    };
    m.contentScript = content => 'window.POSTER = ' + JSON.stringify(content).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ';\n';
    m.prepareContent = directory => {
        let source;
        try { source = JSON.parse(fs.readFileSync(path.join(directory, 'content.json'), 'utf8').replace(/^\uFEFF/, '')); }
        catch (e) { throw new UserError(`无法读取 content.json：${e instanceof SyntaxError ? 'JSON 格式不正确，请检查引号和逗号' : '请检查文件是否存在、路径和权限'}。`); }
        const result = m.normalizeContent(source, directory);
        fs.writeFileSync(path.join(directory, 'content.js'), m.contentScript(result.content), 'utf8');
        return result;
    };
    const controller = new AbortController(), downloads = new Set(), transfers = new Set(), browsers = new Set();
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const abortCheck = () => { if (controller.signal.aborted) throw new UserError('操作已中断。'); };
    async function pool(items, limit, work) {
        const result = new Array(items.length); let index = 0;
        await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
            while (index < items.length) { const i = index++; result[i] = await work(items[i], i); }
        }));
        return result;
    }
    m.pool = pool;
    const fontPath = (name, f) => path.join(f.bundled ? path.join(m.root, 'fonts') : m.fontDir, name);
    const hasFont = (name, f) => { try { const s = fs.statSync(fontPath(name, f)); return s.isFile() && (f.size ? s.size === f.size : s.size > 0); } catch (_) { return false; } };
    m.fontStatus = (table, names = Object.keys(table.files)) => {
        const existing = [], missing = [];
        for (const name of [...new Set(names)]) {
            const f = table.files[name]; if (!f) throw new UserError(`字体表里没有 ${name}，请检查 styles.js。`);
            (hasFont(name, f) ? existing : missing).push({file: name, size: f.size || null, bundled: Boolean(f.bundled), path: fontPath(name, f)});
        }
        return {directory: m.fontDir, existing, missing, missingBytes: missing.reduce((sum, f) => sum + (f.bundled ? 0 : f.size || 0), 0)};
    };
    function validURL(address) {
        const u = new URL(address);
        if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname))) throw new UserError('字体下载必须使用 HTTPS；只有 127.0.0.1 或 localhost 的测试地址允许 HTTP。');
        if (u.username || u.password) throw new UserError('字体下载地址不能带登录信息。');
        return u;
    }
    async function download(address, dest, expected) {
        const deadline = Date.now() + 600000;
        for (let redirects = 0; ; redirects++) {
            abortCheck();
            const u = validURL(address);
            let req, connectionTimer, totalTimer;
            try {
                const res = await new Promise((resolve, reject) => {
                    req = (u.protocol === 'https:' ? https : http).get(u, {agent: false, headers: {'User-Agent': 'poster-gen/1.0'}, signal: controller.signal}, resolve);
                    req.on('error', reject);
                    connectionTimer = setTimeout(() => req.destroy(new Error('连接超过 15 秒')), 15000);
                    totalTimer = setTimeout(() => req.destroy(new Error('下载超过 10 分钟')), Math.max(1, deadline - Date.now()));
                    req.setTimeout(30000, () => req.destroy(new Error('30 秒没有收到新数据')));
                    req.on('socket', socket => socket.once(u.protocol === 'https:' ? 'secureConnect' : 'connect', () => clearTimeout(connectionTimer)));
                });
                clearTimeout(connectionTimer);
                if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                    res.resume();
                    if (redirects >= 3 || !res.headers.location) throw new Error('跳转超过 3 次或没有跳转地址');
                    address = validURL(new URL(res.headers.location, u).href).href;
                    continue;
                }
                if (res.statusCode !== 200) { res.resume(); throw new Error('服务器返回 HTTP ' + res.statusCode); }
                const hash = crypto.createHash('sha256'); let count = 0, transferError;
                // 请求失败后也等 pipeline 关闭写入句柄，Windows 才能删掉临时文件。
                req.on('error', e => { transferError = e; });
                res.on('data', chunk => {
                    count += chunk.length; hash.update(chunk);
                    if (count > expected.size) req.destroy(new Error('文件大小不对'));
                });
                try { await stream.pipeline(res, fs.createWriteStream(dest, {flags: 'wx'})); }
                catch (e) { throw transferError || e; }
                if (count !== expected.size) throw new Error('文件大小不对（收到 ' + count + '，需要 ' + expected.size + '）');
                if (hash.digest('hex') !== expected.sha256) throw new Error('sha256 指纹不对');
                return;
            } finally { clearTimeout(connectionTimer); clearTimeout(totalTimer); if (req) req.destroy(); }
        }
    }
    // 字体服务器连不上时不能让用户每次出图都干等：连不上、超时不重试，同一批里后面的也不再试，
    // 并在字体文件夹里留一个记号，十分钟内出图直接用系统字体。只有下载下来的内容不对（大小、指纹）才重下一次。
    // again 为真（用户明确运行 fonts 命令）时不看记号。
    m.ensureFonts = async (table, names, noDownload = false, again = false) => {
        noDownload = noDownload || !settings.allow_font_download;
        const initial = m.fontStatus(table, names), result = {directory: m.fontDir, existing: initial.existing.map(f => f.file), downloaded: [], failed: [], missing: []};
        const mark = path.join(m.fontDir, '.download-failed');
        let unreachable = false;
        if (!again) try { unreachable = Date.now() - fs.statSync(mark).mtimeMs < 600000; } catch (_) {}
        const waiting = unreachable;
        await pool(initial.missing, 2, async item => {
            if (noDownload || item.bundled) { result.failed.push({file: item.file, reason: item.bundled ? '技能内置字体缺失，请重新安装技能' : '未下载（--no-download）'}); return; }
            if (unreachable) { result.failed.push({file: item.file, reason: waiting ? '十分钟内下载失败过，这次先不试' : '字体服务器连不上，这次不再试'}); return; }
            const f = table.files[item.file]; let error;
            for (let attempt = 0; attempt < 2; attempt++) {
                const tmp = path.join(m.fontDir, `.${item.file}.${process.pid}.${crypto.randomUUID()}.tmp`);
                try {
                    abortCheck(); fs.mkdirSync(m.fontDir, {recursive: true}); downloads.add(tmp);
                    const transfer = download(new URL(encodeURIComponent(item.file), (env.HEIHUZI_POSTER_FONT_BASE || settings.font_base_url || table.base).replace(/\/?$/, '/')).href, tmp, f);
                    transfers.add(transfer);
                    try { await transfer; } finally { transfers.delete(transfer); }
                    // 同进程和跨进程均用独立临时文件；Windows 已存在时保留另一进程的合格文件。
                    try { fs.renameSync(tmp, fontPath(item.file, f)); }
                    catch (e) { if (!hasFont(item.file, f)) throw e; }
                    result.downloaded.push(item.file); error = null; break;
                } catch (e) { error = e; if (!/文件大小不对|指纹不对/.test(e.message)) break; }
                finally { downloads.delete(tmp); try { fs.rmSync(tmp, {force: true}); } catch (_) {} }
            }
            if (error) {
                result.failed.push({file: item.file, reason: error.message});
                if (!/文件大小不对|指纹不对|HTTP 4\d\d/.test(error.message) && !controller.signal.aborted) {
                    unreachable = true;
                    try { fs.mkdirSync(m.fontDir, {recursive: true}); fs.writeFileSync(mark, new Date().toISOString() + '\n'); } catch (_) {}
                }
            }
        });
        if (result.downloaded.length && !unreachable) try { fs.rmSync(mark, {force: true}); } catch (_) {}
        result.missing = m.fontStatus(table, names).missing;
        result.fallback = result.missing.length > 0;
        return result;
    };
    const flags = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1'];
    async function removeProfile(profile) {
        for (let i = 0; i < 5; i++) {
            try { fs.rmSync(profile, {recursive: true, force: true}); return; } catch (_) { await delay(100 * (i + 1)); }
        }
    }
    function startBrowser(browser, args, pipe = false) {
        abortCheck();
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'poster-gen-'));
        let child;
        try {
            const nodeScript = /\.mjs$/i.test(browser.path);
            child = cp.spawn(nodeScript ? process.execPath : browser.path, [...(nodeScript ? [browser.path] : []), ...flags, '--user-data-dir=' + profile, ...args],
                {stdio: pipe ? ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true, env});
        } catch (e) { fs.rmSync(profile, {recursive: true, force: true}); throw e; }
        const record = {child, profile, error: null, closePromise: null}; browsers.add(record);
        record.exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', e => { record.error = e; resolve(); }); });
        child.stderr.resume();
        record.close = () => {
            if (record.closePromise) return record.closePromise;
            record.closePromise = (async () => {
                if (process.platform === 'win32' && child.pid) {
                    await new Promise(resolve => {
                        const killer = cp.spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {stdio: 'ignore', windowsHide: true});
                        killer.on('error', resolve); killer.on('exit', resolve);
                    });
                } else if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { try { child.kill('SIGKILL'); } catch (_) {} } }
                await record.exited;
                for (const io of child.stdio) if (io) io.destroy();
                await removeProfile(profile); browsers.delete(record);
            })();
            return record.closePromise;
        };
        return record;
    }
    m.cleanup = async () => {
        controller.abort();
        await Promise.allSettled([...transfers]);
        await Promise.all([...browsers].map(b => b.close()));
        for (const file of downloads) try { fs.rmSync(file, {force: true}); } catch (_) {}
    };
    const limited = async (promise, ms, label) => {
        let timer;
        try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}超时`)), Math.max(1, ms)); })]); }
        finally { clearTimeout(timer); }
    };
    async function connectPipe(browser) {
        const b = startBrowser(browser, ['--remote-debugging-pipe'], true), pending = new Map();
        let serial = 0, buffer = Buffer.alloc(0), dead = null;
        b.child.stdout.resume();
        const fail = e => { dead = e; for (const p of pending.values()) p.reject(e); pending.clear(); };
        b.child.on('exit', () => fail(new Error('浏览器中途退出')));
        b.child.on('error', e => fail(new Error('浏览器启动失败：' + e.message)));
        b.child.stdio[3].on('error', e => fail(e)); b.child.stdio[4].on('error', e => fail(e));
        b.child.stdio[4].on('data', chunk => {
            buffer = Buffer.concat([buffer, chunk]); let end;
            while ((end = buffer.indexOf(0)) >= 0) {
                const raw = buffer.subarray(0, end); buffer = buffer.subarray(end + 1);
                try {
                    const message = JSON.parse(raw.toString('utf8')), p = pending.get(message.id);
                    if (p) { pending.delete(message.id); message.error ? p.reject(new Error(message.error.message)) : p.resolve(message.result || {}); }
                } catch (_) { fail(new Error('浏览器管道返回了无效 JSON')); }
            }
        });
        b.send = (method, params = {}, sessionId) => {
            if (dead) return Promise.reject(dead);
            return new Promise((resolve, reject) => {
                const id = ++serial; pending.set(id, {resolve, reject});
                b.child.stdio[3].write(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}) + '\0', e => { if (e) { pending.delete(id); reject(e); } });
            });
        };
        try { await limited(b.send('Browser.getVersion'), 5000, '连接浏览器管道'); return b; }
        catch (e) { await b.close(); throw e; }
    }
    const readyExpression = sheet => `(() => { const r = document.documentElement; return ${sheet ? "r.getAttribute('data-ready') === '1' ? {height: r.getAttribute('data-height'), checks: r.getAttribute('data-checks')} : null" : "r.hasAttribute('data-check') ? {check: r.getAttribute('data-check')} : null"}; })()`;
    function parseCheck(raw, sheet) {
        if (sheet) {
            const height = Number(raw.height);
            if (!Number.isInteger(height) || height <= 0 || height > 100000) throw new Error('总览页 data-height 无效');
            const checks = JSON.parse(raw.checks);
            if (!object(checks)) throw new Error('总览页 data-checks 不是对象');
            return {height, checks};
        }
        const check = JSON.parse(raw.check);
        if (!object(check)) throw new Error('模板 data-check 不是对象');
        return {check};
    }
    async function pipeShot(b, job, timeout) {
        let targetId, sessionId, stage = '新建页面';
        const deadline = Date.now() + timeout;
        const send = (method, params, sid = sessionId) => limited(b.send(method, params, sid), deadline - Date.now(), stage);
        try {
            // 每张图开自己的窗口，并把窗口真的调成成品那么大。只改“模拟的画面尺寸”、窗口还是默认大小时，
            // 截出来的图会一块一块地重复（2026-10-11 实测：16 张里坏 1 到 2 张，花样多的风格更容易中）。
            ({targetId} = await send('Target.createTarget', {url: 'about:blank', newWindow: true}));
            ({sessionId} = await send('Target.attachToTarget', {targetId, flatten: true}, undefined));
            stage = '设置画面尺寸';
            const resize = async height => {
                const {windowId} = await send('Browser.getWindowForTarget', {targetId}, undefined);
                await send('Browser.setWindowBounds', {windowId, bounds: {windowState: 'normal'}}, undefined);
                await send('Browser.setWindowBounds', {windowId, bounds: {width: job.width, height}}, undefined);
                await send('Emulation.setDeviceMetricsOverride', {width: job.width, height, deviceScaleFactor: 1, mobile: false});
            };
            await resize(job.height);
            stage = '打开模板'; await send('Page.enable'); await send('Runtime.enable');
            await send('Page.navigate', {url: job.url});
            stage = job.sheet ? '等待总览页就绪' : '等待模板自查';
            let raw;
            const readyDeadline = Math.min(deadline, Date.now() + (job.sheet ? 45000 : timeout));
            while (!raw) {
                if (Date.now() >= readyDeadline) throw new Error(stage + '超时');
                const result = await send('Runtime.evaluate', {expression: readyExpression(job.sheet), returnByValue: true});
                raw = result.result?.value;
                if (!raw) await delay(50);
            }
            const result = parseCheck(raw, job.sheet);
            if (job.sheet) await resize(result.height);
            stage = '截图';
            // 等画面真的画完两帧再截；不让浏览器“截到窗口外面去”，那条路就是上面说的会截坏的那条
            await send('Runtime.evaluate', {awaitPromise: true, expression: 'new Promise(done => { const t = setTimeout(done, 500); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); done(); })); })'});
            const {data} = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
            const bytes = Buffer.from(data || '', 'base64');
            if (!bytes.length) throw new Error('截图文件不存在或是空的');
            const wide = bytes.length > 24 ? bytes.readUInt32BE(16) : 0, tall = bytes.length > 24 ? bytes.readUInt32BE(20) : 0;
            if (wide !== job.width || tall !== (result.height || job.height)) throw new Error(`截出来的图是 ${wide}×${tall}，应该是 ${job.width}×${result.height || job.height}`);
            fs.writeFileSync(job.path, bytes);
            return result;
        } catch (e) { throw new Error(`${stage}：${e.message}`); }
        finally { if (targetId) try { await limited(b.send('Target.closeTarget', {targetId}), 1000, '关闭页面'); } catch (_) {} }
    }
    async function cliRun(browser, args, timeout, stage) {
        const b = startBrowser(browser, args); const chunks = []; let count = 0;
        const drained = new Promise(resolve => { b.child.stdout.once('end', resolve); b.child.stdout.once('close', resolve); });
        b.child.stdout.on('data', chunk => { count += chunk.length; if (count < 32 * 1024 * 1024) chunks.push(chunk); });
        try {
            await limited(Promise.all([b.exited, drained]), timeout, stage);
            if (b.error) throw new Error('浏览器启动失败：' + b.error.message);
            if (b.child.exitCode !== 0) throw new Error(stage + '：浏览器中途退出');
            return Buffer.concat(chunks).toString('utf8');
        } finally { await b.close(); }
    }
    const unescapeHTML = s => s.replace(/&(?:quot|apos|amp|lt|gt|#\d+|#x[\da-f]+);/gi, value => {
        const named = {'&quot;': '"', '&apos;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>'};
        if (named[value.toLowerCase()]) return named[value.toLowerCase()];
        return String.fromCodePoint(value[2].toLowerCase() === 'x' ? parseInt(value.slice(3, -1), 16) : Number(value.slice(2, -1)));
    });
    m.domAttributes = dom => {
        const html = dom.match(/<html\b(?:[^>"']|"[^"]*"|'[^']*')*>/i)?.[0];
        if (!html) throw new Error('浏览器没有返回 html 页面');
        const result = {};
        for (const match of html.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) result[match[1]] = unescapeHTML(match[2] ?? match[3]);
        return result;
    };
    async function cliShot(browser, job, timeout) {
        const deadline = Date.now() + timeout;
        const common = ['--virtual-time-budget=10000', '--run-all-compositor-stages-before-draw'];
        const dom = await cliRun(browser, [...common, `--window-size=${job.width},${job.height}`, '--dump-dom', job.url], deadline - Date.now(), '等待页面自查');
        const attrs = m.domAttributes(dom);
        if (job.sheet ? attrs['data-ready'] !== '1' : !attrs['data-check']) throw new Error('等待页面自查：页面尚未就绪');
        const result = parseCheck(job.sheet ? {height: attrs['data-height'], checks: attrs['data-checks']} : {check: attrs['data-check']}, job.sheet);
        // 先删掉旧图，不能把上次成功的文件当成本次成功。
        fs.rmSync(job.path, {force: true});
        await cliRun(browser, [...common, `--window-size=${job.width},${result.height || job.height}`, '--screenshot=' + job.path, job.url], deadline - Date.now(), '截图');
        if (!fs.existsSync(job.path) || !fs.statSync(job.path).size) throw new Error('截图文件不存在或是空的');
        return result;
    }
    const names = {brand: '主办方', mark: '主办方', logo: '标志图片', kicker: '眉题', issue: '角标', title: '标题', slogan: '口号', price: '价格', 'price.label': '价格标签', 'price.cur': '币种符号', 'price.num': '价格数字', 'price.orig': '原价', 'price.note': '价格说明',
        points: '卖点', date: '日期', dateNote: '日期说明', place: '地点', qr: '二维码', 'qr.cap': '二维码下面的字', contact: '联系方式', fine: '小字'};
    // 把内容项的名字说成人话：title.1 是“标题第 2 行”，points.0.p 是“第 1 个卖点”
    const chinese = v => {
        v = String(v);
        const row = v.match(/^(title|points|fine)\.(\d+)/);
        if (row) return row[1] === 'points' ? `第 ${Number(row[2]) + 1} 个卖点` : `${names[row[1]]}第 ${Number(row[2]) + 1} 行`;
        return names[v] || names[v.split(/[.\[]/)[0]] || v;
    };
    m.describeCheck = (check, content = {}) => {
        const problems = [];
        if (check.empty) problems.push('还没有标题');
        if (Number(check.overflow) > 0) problems.push(`内容放不下，超出画面 ${check.overflow} 像素，请精简卖点或小字`);
        if (check.out?.length) problems.push('这些内容跑出画面：' + [...new Set(check.out.map(chinese))].join('、'));
        if (check.qr === 'failed') problems.push('二维码没画出来');
        if (check.badImages) problems.push(content.logo && !content.qr?.image ? '标志图片没加载出来' : `有 ${check.badImages} 张图片没加载出来，请检查标志图片或二维码图片`);
        for (const e of check.errors || []) problems.push(String(e));
        if (check.timeout) problems.push('这个风格等待自查超时');
        return {problems, look: check.covered?.length ? '请看一眼这几处有没有被盖住：' + [...new Set(check.covered.map(chinese))].join('、') : ''};
    };
    // --driver 供验收和压测强制选择；auto 才会在管道握手失败时回退。
    m.renderJobs = async (browser, jobs, {driver = 'auto', timeout = 30000} = {}) => {
        let shared, chosen = driver, fallbackReason;
        if (driver !== 'cli') {
            try { shared = await connectPipe(browser); chosen = 'pipe'; }
            catch (e) { if (driver === 'pipe') throw e; chosen = 'cli'; fallbackReason = e.message; }
        }
        try {
            const results = await pool(jobs, 2, async job => {
                const errors = [];
                for (let attempt = 1; attempt <= 2; attempt++) {
                    let fresh;
                    try {
                        abortCheck();
                        if (chosen === 'pipe' && attempt === 2) fresh = await connectPipe(browser);
                        const result = chosen === 'pipe' ? await pipeShot(fresh || shared, job, timeout) : await cliShot(browser, job, timeout);
                        return {...job, url: undefined, ...result, attempts: attempt, retryErrors: errors, driver: chosen};
                    } catch (e) { errors.push(e.message); }
                    finally { if (fresh) await fresh.close(); }
                }
                return {...job, url: undefined, driver: chosen, attempts: 2, error: `${job.name || '总览'} ${job.size || ''}失败：${errors.join('；重试：')}`, retryErrors: errors};
            });
            return {driver: chosen, ...(fallbackReason ? {fallbackReason} : {}), results};
        } finally { if (shared) await shared.close(); }
    };
    m.pageURL = (filename, directory, size, style, shot) => {
        const address = url.pathToFileURL(filename);
        address.searchParams.set('content', url.pathToFileURL(path.join(directory, 'content.js')).href);
        address.searchParams.set('fonts', url.pathToFileURL(m.fontDir + path.sep).href);
        address.searchParams.set('size', size);
        if (style) address.searchParams.set('style', style);
        if (shot) address.searchParams.set('shot', '1');
        return address.href;
    };
    m.writeShortcut = (directory, size) => {
        const address = m.pageURL(path.join(m.root, 'engine/pick.html'), directory, size);
        const escape = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        const filename = path.join(directory, '选风格.html');
        fs.writeFileSync(filename, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${escape(address)}"><title>选风格</title><p>正在打开选风格页</p><a href="${escape(address)}">点这里打开选风格页</a></html>\n`, 'utf8');
        return filename;
    };
    m.open = async (directory, browser = m.findBrowser(), platform = process.platform) => {
        const filename = path.join(directory, '选风格.html');
        if (!fs.existsSync(filename)) throw new UserError('还没有选风格.html，请先运行 sheet。');
        const address = url.pathToFileURL(filename).href;
        const launch = options.launch || (async function launch(command, args, extraEnv = {}) {
            await new Promise((resolve, reject) => {
                const child = cp.spawn(command, args, {detached: true, stdio: 'ignore', windowsHide: false, env: {...env, ...extraEnv}});
                let timer;
                child.once('error', e => { clearTimeout(timer); reject(e); });
                child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('浏览器启动失败')); });
                child.once('spawn', () => { timer = setTimeout(() => { child.unref(); resolve(); }, 350); });
            });
        });
        if (browser) try {
            await launch(/\.mjs$/i.test(browser.path) ? process.execPath : browser.path, [...(/\.mjs$/i.test(browser.path) ? [browser.path] : []), '--new-window', address]); return;
        } catch (_) { /* 启动失败再用系统默认方式。 */ }
        if (platform === 'darwin') await launch('open', [address]);
        else if (platform === 'win32') await launch('cmd.exe', ['/d', '/v:off', '/s', '/c', 'start "" "%HEIHUZI_POSTER_OPEN_URL%"'], {HEIHUZI_POSTER_OPEN_URL: address});
        else await launch('xdg-open', [address]);
    };
    m.parseArgs = argv => {
        if (argv.includes('--help') || argv.includes('-h')) return {command: 'help'};
        const a = {command: argv[0], styles: [], driver: 'auto', timeout: 30};
        if (!['check', 'fonts', 'sheet', 'open', 'render'].includes(a.command)) throw new UserError('命令写错了，请用 --help 查看用法。');
        for (let i = 1; i < argv.length; i++) {
            const v = argv[i];
            if (['--all', '--open', '--no-download'].includes(v)) a[v.slice(2)] = true;
            else if (['--style', '--size', '--timeout', '--driver'].includes(v)) {
                const value = argv[++i]; if (!value || value.startsWith('--')) throw new UserError(`${v} 后面还需要填写一个值。`);
                if (v === '--style') a.styles.push(value); else a[v.slice(2)] = value;
            } else if (!v.startsWith('-') && !a.directory && ['sheet', 'open', 'render'].includes(a.command)) a.directory = path.resolve(expand(v));
            else throw new UserError(`不认识参数 ${v}，请用 --help 查看用法。`);
        }
        if (['sheet', 'open', 'render'].includes(a.command) && !a.directory) throw new UserError('请填写海报文件夹路径。');
        if (a.command === 'render' && !a.styles.length || a.command === 'fonts' && !a.styles.length && !a.all) throw new UserError('请用 --style 指定风格；下载全部字体可以用 fonts --all。');
        const allowed = {check: [], fonts: ['--style', '--all'], open: [], sheet: ['--size', '--open', '--no-download', '--timeout', '--driver'], render: ['--style', '--size', '--no-download', '--timeout', '--driver']}[a.command];
        for (const v of argv.slice(1).filter(v => v.startsWith('--'))) if (!allowed.includes(v)) throw new UserError(`${a.command} 不支持 ${v}。`);
        if (a.size && !['9x16', '3x4', ...(a.command === 'render' ? ['both'] : [])].includes(a.size)) throw new UserError('尺寸请写 9x16、3x4；render 还可以写 both。');
        a.timeout = Number(a.timeout);
        if (!Number.isFinite(a.timeout) || a.timeout <= 0) throw new UserError('--timeout 要写大于 0 的秒数。');
        if (!['auto', 'pipe', 'cli'].includes(a.driver)) throw new UserError('--driver 请写 auto、pipe 或 cli。');
        if (a.command === 'sheet' && !argv.includes('--timeout')) a.timeout = 45;
        return a;
    };
    m.run = async argv => {
        const args = m.parseArgs(argv);
        if (args.command === 'help') return {result: {version: m.VERSION, commands: ['check', 'fonts', 'sheet', 'open', 'render']}, lines: [
            '用法：node scripts/poster.mjs check', 'fonts --style <编号、slug 或中文名>（可重复），或 fonts --all',
            'sheet <海报文件夹> [--size 9x16|3x4] [--open] [--no-download]', 'open <海报文件夹>',
            'render <海报文件夹> --style <风格> [--style …] [--size 9x16|3x4|both] [--no-download]',
            'sheet/render 可加 --timeout <秒>（render 默认 30，sheet 默认 45）、--driver auto|pipe|cli（默认 auto）。']};
        const {fonts, styles} = m.loadTables();
        if (args.command === 'check') {
            const browser = m.findBrowser(), status = m.fontStatus(fonts);
            // 各风格还要下载多少字体：都不用下、都一样多、多少不等，三种说法
            const need = styles.map(s => m.fontStatus(fonts, s.fonts || []).missingBytes), low = Math.min(...need), high = Math.max(...need);
            const mb = bytes => Math.round(bytes / 1e6);
            const fontLine = !high ? '中文字体已经在这台电脑上了，不用再下载。'
                : !settings.allow_font_download ? '自动下载字体已关闭；缺少的中文字体将使用系统字体替代。'
                : low === high ? `第一次出图会自动下载中文字体，约 ${mb(high)} MB，只下一次。`
                : low ? `第一次出图会自动下载中文字体，约 ${mb(low)} MB，只下一次；个别风格还要多下约 ${mb(high - low)} MB。`
                : `大部分风格的字体已经有了，个别风格第一次用时还要下载约 ${mb(high)} MB。`;
            return {result: {skill: 'poster-gen', version: m.VERSION, node: process.versions.node, browser, fonts: status, styles: styles.map((s, i) => ({number: i + 1, slug: s.slug, name: s.name, use: s.use, size: s.size || '9x16'}))}, lines: [
                '海报制作已就绪（版本 1.0）。本地排版不需要 API Key，不调用付费生成服务。',
                browser ? `出图要用这台电脑上的 Chrome 或 Edge，已经找到了 ${browser.name}。` : '还没有找到 Chrome 或 Edge。出图要用其中一个，请先装一个再试（这个 skill 自己不会装软件）。',
                fontLine,
                '用法：直接说想做什么海报，例如“帮我做一张海报：周末 AI 编程训练营，早鸟价 199，11 月 14 日开营，扫码报名 https://example.com/camp”。会先把 ' + styles.length + ' 种风格都排一版给你挑，挑好再出原尺寸的图；之后想改字直接说，几秒钟重出一张。']};
        }
        if (args.command === 'open') { await m.open(args.directory); return {result: {opened: path.join(args.directory, '选风格.html')}, lines: ['已打开选风格页。']}; }
        const selected = args.command === 'sheet' || args.all ? styles : m.selectStyles(args.styles, styles);
        const wanted = [...new Set(selected.flatMap(s => s.fonts || []))];
        const prepared = args.command !== 'fonts' ? m.prepareContent(args.directory) : null;
        const status = await m.ensureFonts(fonts, wanted, args['no-download'], args.command === 'fonts');
        if (args.command === 'fonts') return {result: status, code: status.failed.length ? 1 : 0, lines: [status.failed.length ? '有字体下载失败，详情见上面的 failed；其余字体已处理。' : '字体已准备好，以后不用重复下载。']};
        const lines = [];
        if (status.fallback) lines.push('这次用的是系统自带字体，标题会细一些。');
        if (prepared.unused.length) lines.push('这几项没有用上：' + prepared.unused.join('、'));
        const browser = m.findBrowser();
        if (!browser) throw new UserError('没有找到 Chrome 或 Edge。请装一个再试，这个技能自己不会装软件。');
        let shortcut, jobs;
        if (args.command === 'sheet') {
            const size = args.size || '9x16'; shortcut = m.writeShortcut(args.directory, size);
            jobs = [{name: '总览', sheet: true, size, width: 1600, height: 900, path: path.join(args.directory, '总览.png'), url: m.pageURL(path.join(m.root, 'engine/pick.html'), args.directory, size, null, true)}];
        } else jobs = selected.flatMap(s => (args.size === 'both' ? ['9x16', '3x4'] : [args.size || s.size || '9x16']).map(size => ({
            slug: s.slug, name: s.name, size, width: 1080, height: size === '3x4' ? 1440 : 1920,
            path: path.join(args.directory, `${s.name}-${size}.png`), url: m.pageURL(path.join(m.root, 'styles', s.slug, 'template.html'), args.directory, size, s.slug),
        })));
        const rendered = await m.renderJobs(browser, jobs, {driver: args.driver, timeout: args.timeout * 1000});
        // 给 AI 直接贴进回复里的那一行：路径里的反斜杠换成正斜杠，尖括号包住（路径里常有空格）
        const picture = (label, file) => `![${label}](<${file.replace(/\\/g, '/').replace(/>/g, '%3E')}>)`;
        for (const r of rendered.results) {
            if (r.check) Object.assign(r, m.describeCheck(r.check, prepared.content));
            if (r.error) lines.push(r.error);
            else if (!r.sheet) {
                lines.push(picture(`${r.name} ${r.size}`, r.path));
                if (r.problems.length) lines.push(`${r.name} ${r.size} 有问题：` + r.problems.join('；'));
                if (r.look) lines.push(`${r.name} ${r.size}：` + r.look);
            } else lines.push(picture('全部风格总览', r.path));
            if (r.check?.fontsMissing?.length && !status.fallback) { status.fallback = true; lines.push('这次用的是系统自带字体，标题会细一些。'); }
        }
        let openError;
        if (args.open) try { await m.open(args.directory, browser); } catch (e) { openError = e.message; lines.push('选风格页没能打开：' + e.message); }
        const result = {command: args.command, ...rendered, fonts: status, unused: prepared.unused};
        if (shortcut) {
            result.shortcut = shortcut; result.overview = jobs[0].path;
            result.styles = styles.map((s, i) => {
                const check = rendered.results[0].checks?.[s.slug];
                return {number: i + 1, slug: s.slug, name: s.name, check, ...(check ? m.describeCheck(check, prepared.content) : {problems: ['没有收到这个风格的自查结果'], look: ''})};
            });
            if (!rendered.results[0].error) for (const s of result.styles) if (s.problems.length) lines.push(`${s.number} ${s.name} 有问题：` + s.problems.join('；'));
            if (!rendered.results[0].error) lines.push('选风格页：' + shortcut);
            if (Object.values(rendered.results[0].checks || {}).some(c => c.fontsMissing?.length) && !status.fallback) { status.fallback = true; lines.push('这次用的是系统自带字体，标题会细一些。'); }
        }
        if (openError) result.openError = openError;
        const failed = rendered.results.filter(r => r.error).length;
        lines.push(`已生成 ${rendered.results.length - failed} 张图片${failed ? `，${failed} 张失败` : ''}。`);
        return {result, lines, code: failed || openError ? 1 : 0};
    };
    m.main = async (argv = process.argv.slice(2)) => {
        let interrupted = false;
        const onSignal = async signal => {
            if (interrupted) return; interrupted = true;
            await m.cleanup();
            try { await m.output(JSON.stringify({error: '操作已中断', signal})); await m.output('操作已中断，已清理本次渲染浏览器。'); } catch (_) {}
            process.exit(signal === 'SIGINT' ? 130 : 143);
        };
        const sigint = () => { void onSignal('SIGINT'); }, sigterm = () => { void onSignal('SIGTERM'); };
        process.on('SIGINT', sigint); process.on('SIGTERM', sigterm);
        try {
            const {result, lines = [], code = 0} = await m.run(argv);
            if (!interrupted) { await m.output(JSON.stringify(result)); for (const line of lines) await m.output(line); }
            return code;
        } catch (e) {
            if (!interrupted) {
                const detail = e instanceof UserError ? e.message : `无法完成操作：${e.message}。请检查路径、权限或浏览器。`;
                try { await m.output(JSON.stringify({error: detail})); await m.output('错误：' + detail, true); } catch (_) {}
            }
            return 1;
        } finally { await m.cleanup(); process.removeListener('SIGINT', sigint); process.removeListener('SIGTERM', sigterm); }
    };
    return m;
}

createModule().then(async m => { if (m.is_main()) process.exitCode = await m.main(); }).catch(e => {
    process.stderr.write('错误：' + e.message + '\n'); process.exitCode = 1;
});
