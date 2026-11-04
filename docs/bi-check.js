// 中英两套自查（双语单）：导出中英文字清单、两种语言各跑一遍真流程、查英文排版、截图。
// 用法（仓库根目录）：node docs/bi-check.js
// 要 playwright（全局装的就行）；自己起一个静态服务，不碰外网以外的东西。
// 出：docs/strings-bi/zh.txt、en.txt（一行一条：key<Tab>文字），docs/shots-bi/*.png，控制台最后一行 JSON 汇总。
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT_STR = path.join(__dirname, 'strings-bi'), OUT_SHOT = path.join(__dirname, 'shots-bi');
fs.mkdirSync(OUT_STR, { recursive: true }); fs.mkdirSync(OUT_SHOT, { recursive: true });

// ---------------------------------------------------------------- 1. 文字清单
function exportStrings() {
  const win = {};
  const sandbox = { window: win, location: { search: '' }, localStorage: { getItem() { return null; } },
    document: { documentElement: { getAttribute() { return null; } }, querySelector() { return null; } }, CustomEvent: function () {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'strings.js'), 'utf8'), sandbox);
  const S = win.GS_STRINGS, counts = {};
  for (const lang of ['zh', 'en']) {
    const lines = [];
    (function walk(o, pre) {
      for (const k of Object.keys(o)) {
        const v = o[k], key = pre ? pre + '.' + k : k;
        if (typeof v === 'string') lines.push(key + '\t' + v);
        else if (v && typeof v === 'object') walk(v, key);
      }
    })(S[lang], '');
    fs.writeFileSync(path.join(OUT_STR, lang + '.txt'), lines.join('\n') + '\n');
    counts[lang] = lines.length;
  }
  return counts;
}

// ---------------------------------------------------------------- 2. 静态服务
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png' };
function serve() {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, path.normalize(p));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// ---------------------------------------------------------------- 3. 一张假的检查表（第 4 行 UCL 故意错一位，应该标黄 2 格）
const SHEET_ROWS = [
  ['1', '1.0860', '-0.0050', '0.0010', '0', '1.0810', '1.0870'],
  ['2', '0.3750', '-0.0020', '0.0020', '0', '0.3730', '0.3770'],
  ['3', '2.5000', '-0.0100', '0.0050', '0', '2.4900', '2.5050'],
  ['4', '0.6250', '-0.0030', '0.0030', '0', '0.6220', '0.6290'],
  ['5', '1.2500', '-0.0050', '0.0000', '0', '1.2450', '1.2500'],
  ['6', '0.1875', '-0.0010', '0.0020', '0', '0.1865', '0.1895']
];
async function makeSheet(browser, file) {
  const p = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  await p.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#fff;font-family:Arial,"Noto Sans CJK SC",sans-serif;color:#111}.p{padding:40px 48px;width:1300px}
    h1{font-size:30px;margin:0 0 6px}.m{font-size:18px;margin:0 0 22px}table{border-collapse:collapse;width:100%;font-size:26px}
    th,td{border:2px solid #222;padding:14px 10px;text-align:center}th{font-size:22px;background:#f2f2f2}</style>
    <div class="p"><h1>IN-PROCESS INSPECTION REPORT</h1><p class="m">PART NO. GX-2044 &nbsp; OP 30</p>
    <table><tr><th>NO 标号</th><th>DIMENSION 尺寸</th><th>LSL 下</th><th>USL 上</th><th>STOCK 余量</th><th>LCL</th><th>UCL</th></tr>
    ${SHEET_ROWS.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('')}</table></div>`);
  await p.locator('.p').screenshot({ path: file });
  await p.close();
}

// ---------------------------------------------------------------- 4. 排版：按钮一行、不撑破、不截断、手机不横向滚
async function layout(p, where) {
  return p.evaluate(where => {
    const bad = [], vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const lines = el => {                                  // 文字占了几行（只数字，不数图标）
      const tops = new Set(), w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const r of rg.getClientRects()) if (r.width > 1) tops.add(Math.round(r.top));
      }
      return tops.size;
    };
    for (const el of document.querySelectorAll('button, .tabs a, .lab, .sw-text, .band-lab, .chip, .ledger-head h2, .ledger-head .r, .shift label > span, .face-label')) {
      if (!vis(el) || !el.textContent.trim() || el.classList.contains('mirror')) continue;
      const name = (el.id || el.className || el.tagName) + ' "' + el.textContent.trim().slice(0, 30) + '"';
      if (el.scrollWidth > el.clientWidth + 1) bad.push(where + ' 撑破 ' + name);
      if (lines(el) > 1) bad.push(where + ' 两行 ' + name);
      const r = el.getBoundingClientRect();
      if (r.right > innerWidth + 1 || r.left < -1) bad.push(where + ' 出屏 ' + name);
    }
    for (const el of document.querySelectorAll('body *')) {   // 被裁掉的字
      if (!vis(el) || el.closest('.pic, .hero, svg')) continue;
      const cs = getComputedStyle(el);
      if ((cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1 && el.textContent.trim()) bad.push(where + ' 截断 ' + (el.id || el.className));
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) bad.push(where + ' 横向滚动 ' + document.documentElement.scrollWidth);
    return bad;
  }, where);
}

// ---------------------------------------------------------------- 5. 真流程
(async () => {
  const counts = exportStrings();
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch();
  const sheet = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gs-sheet-')), 'sheet.png');
  await makeSheet(browser, sheet);
  const report = { strings: counts, errors: [], layout: [], checks: {}, shots: [] };
  // 整页截图：把窗口拉到整页那么高再截（照妖镜的藤蔓台子比屏宽，页面自己 clip 掉了，fullPage 会把它算进宽度）
  const shot = async (p, name) => {
    const f = path.join(OUT_SHOT, name + '.png'), vp = p.viewportSize();
    const h = await p.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
    await p.setViewportSize({ width: vp.width, height: Math.max(vp.height, h) }); await p.waitForTimeout(200);
    await p.screenshot({ path: f });
    await p.setViewportSize(vp); await p.waitForTimeout(100);
    report.shots.push(path.relative(ROOT, f));
  };
  const PHONE = { width: 390, height: 844 }, DESK = { width: 1280, height: 800 };

  for (const lang of ['en', 'zh']) {
    const ctx = await browser.newContext({ viewport: PHONE, acceptDownloads: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => report.errors.push(lang + ' pageerror ' + e.message));
    p.on('console', m => { if (m.type() === 'error') report.errors.push(lang + ' console ' + m.text()); });
    const c = report.checks[lang] = {};

    // ---- 工时榨汁机：第一次打开默认英文；中文那趟点右上角「中文」，刷新后还记得
    await p.goto(base);
    c.defaultLang = await p.evaluate(() => document.documentElement.lang);
    if (lang === 'zh') {
      await p.click('.lang button[data-l="zh"]');
      await p.reload();
    }
    c.coLang = await p.evaluate(() => document.documentElement.lang);
    c.coTitle = await p.title();
    c.coDesc = await p.getAttribute('meta[name="description"]', 'content');
    c.coPressed = await p.getAttribute('.lang button[aria-pressed="true"]', 'data-l');
    c.coVersion = await p.textContent('[data-version]');
    report.layout.push(...await layout(p, lang + ' co 390 空'));
    await shot(p, `co-${lang}-390-empty`);
    await p.setViewportSize(DESK); await shot(p, `co-${lang}-1280-empty`);
    report.layout.push(...await layout(p, lang + ' co 1280 空'));
    await p.setViewportSize(PHONE);
    const setT = async (id, v) => { await p.fill('#' + id, ''); await p.type('#' + id, v); await p.locator('#' + id).blur(); };
    await setT('start', '1645'); await setT('end', '0910');
    c.coEndBefore = await p.textContent('#line');
    await p.click('#fix');
    c.coNet = await p.textContent('#net');           // 16:45 → 次日 09:10：毛 985，扣晚饭 30、夜里 705 → 250
    c.coLine = await p.textContent('#line');
    report.layout.push(...await layout(p, lang + ' co 390 结果'));
    await shot(p, `co-${lang}-390-result`);
    await p.setViewportSize(DESK); await shot(p, `co-${lang}-1280-result`);
    report.layout.push(...await layout(p, lang + ' co 1280 结果'));
    await p.setViewportSize(PHONE);
    // 改休息表：英文界面里名字显示英文，存回去还是默认表
    await p.click('#edit');
    c.coEditNames = await p.$$eval('#rows .name', els => els.map(e => e.value));
    report.layout.push(...await layout(p, lang + ' co 390 改休息表'));
    await p.click('#done');
    c.coRulesStillDefault = await p.evaluate(() => localStorage.getItem('co-calc-rules-v1') === null);

    // ---- 英寸照妖镜：同一网站，语言跟着上一页选的走
    await p.goto(base + 'inch/');
    c.inchLang = await p.evaluate(() => document.documentElement.lang);
    c.inchTitle = await p.title();
    await p.waitForFunction(() => window.__inch && window.__inch.state.engine === 'ready', null, { timeout: 240000 });
    await p.waitForTimeout(2600);                      // 藤蔓长完
    report.layout.push(...await layout(p, lang + ' inch 390 空'));
    await shot(p, `inch-${lang}-390-empty`);
    await p.setViewportSize(DESK); await p.waitForTimeout(300); await shot(p, `inch-${lang}-1280-empty`);
    report.layout.push(...await layout(p, lang + ' inch 1280 空'));
    await p.setViewportSize(PHONE);
    await p.setInputFiles('#lib', sheet);
    await p.waitForFunction(() => window.__inch.result, null, { timeout: 240000 });
    await p.waitForTimeout(800);
    const r = await p.evaluate(() => window.__inch.result);
    c.inchStat = r.stat;
    c.inchRow4 = r.rows && r.rows[3] && { conv: r.rows[3].conv, flag: r.rows[3].flag, sugg: r.rows[3].sugg };
    c.inchSum = await p.textContent('#sum');
    report.layout.push(...await layout(p, lang + ' inch 390 结果'));
    await shot(p, `inch-${lang}-390-result`);
    await p.setViewportSize(DESK); await p.waitForTimeout(400); await shot(p, `inch-${lang}-1280-result`);
    report.layout.push(...await layout(p, lang + ' inch 1280 结果'));
    await p.setViewportSize(PHONE);
    // 点红字改数的单子
    await p.evaluate(() => window.__inch.openEdit(0));
    c.inchEditMeta = await p.textContent('#ed-meta');
    report.layout.push(...await layout(p, lang + ' inch 390 改数单'));
    await p.click('#ed-cancel');
    // 存图：文件名跟语言走
    const dl = p.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await p.click('#save');
    const d = await dl;
    c.inchFile = d ? d.suggestedFilename() : null;
    // 结果开着时换语言：结果那句跟着换，选择记住
    const other = lang === 'en' ? 'zh' : 'en';
    await p.click(`.lang button[data-l="${other}"]`);
    await p.waitForTimeout(800);
    c.switchedLang = await p.evaluate(() => document.documentElement.lang);
    c.switchedSum = await p.textContent('#sum');
    c.switchedFace = await p.textContent('#face-label');
    report.layout.push(...await layout(p, other + ' inch 390 结果（换过去）'));
    await p.goto(base);
    c.rememberedOnCo = await p.evaluate(() => document.documentElement.lang);
    await ctx.close();
  }
  await browser.close();
  srv.close();
  console.log(JSON.stringify(report, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
