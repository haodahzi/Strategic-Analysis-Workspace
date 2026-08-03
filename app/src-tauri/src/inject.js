// 注入到信息源窗口的工具条（顶部一条）。经 include_str! 编进外壳；运行前由 Rust 预置
// window.__ZLGZT_SRC__（源名）/ window.__ZLGZT_SID__（源 id）。
// 提供三件事：① 抓取本页研报清单（站内自动抓取，报告查一查为首个调优目标）；
// ② 抓取此页正文；③ 隐藏。原始 DOM 读取在这里，脏数据清洗/打分在 App 侧 scrape.ts（可单测）。
(function () {
  try {
    if (window.top !== window) return;
    if (document.getElementById('zlgzt-bar')) return;
    var SRC = window.__ZLGZT_SRC__ || '信息源';

    // 让「新窗口」链接在本内置窗口内打开：研报详情多为 <a target="_blank">，而内置 WebView 不处理弹窗，
    // 点了就像没反应。捕获阶段接管这类点击、改为同窗导航，用户就能点进正文。
    // （登录/微信扫码等弹窗不走 <a target="_blank">，不受影响。）
    document.addEventListener('click', function (e) {
      var t = e.target;
      var a = t && t.closest ? t.closest('a[href]') : null;
      if (!a) return;
      var raw = a.getAttribute('href') || '';
      if (/^(javascript:|#|mailto:|tel:)/i.test(raw)) return;
      var blank = a.target === '_blank' || /(^|\s)_blank(\s|$)/.test(a.getAttribute('target') || '');
      if (blank && a.href) { e.preventDefault(); location.href = a.href; }
    }, true);

    // 更关键的一类：研报详情用 JS 的 window.open(...) 打开新窗口，内置 WebView 直接丢弃——点了「完全没反应」。
    // 覆盖 window.open：凡带真实地址（含站内相对路径）的一律改在本窗口内打开，用户就能进到正文页。
    (function () {
      var _open = window.open;
      window.open = function (url) {
        try {
          var u = url == null ? '' : String(url);
          if (u && !/^(javascript:|about:)/i.test(u)) { window.location.href = u; return null; }
        } catch (e) { /* 落回原生 */ }
        try { return _open.apply(window, arguments); } catch (e) { return null; }
      };
    })();

    function invoke(cmd, args) {
      var i = (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke)
           || (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke);
      if (!i) return Promise.reject(new Error('no-ipc'));
      return i(cmd, args);
    }

    // 通用正文：剥离脚本/样式/导航，取主区域 innerText
    function pageText() {
      var root = document.querySelector('article, main, #content, .content') || document.body;
      var c = root.cloneNode(true);
      c.querySelectorAll('script,style,noscript,svg,nav,header,footer,iframe').forEach(function (n) { n.remove(); });
      return (c.innerText || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 200000);
    }

    // 站内研报候选：遍历锚点，读出 标题/href/同行日期/是否在列表行。打分去噪交给 App 侧。
    function gatherCandidates() {
      var DATE = /20\d{2}[-/.年]\d{1,2}([-/.月]\d{1,2}日?)?/;
      var out = [];
      var as = Array.prototype.slice.call(document.querySelectorAll('a[href]'));
      for (var k = 0; k < as.length && out.length < 800; k++) {
        var a = as[k];
        var title = (a.getAttribute('title') || a.textContent || '').replace(/\s+/g, ' ').trim();
        if (title.length < 5) continue;
        var row = a.closest('li,tr,article,[class*="item"],[class*="report"],[class*="list"],[class*="card"]');
        var rowText = row ? (row.textContent || '') : '';
        var dm = rowText.match(DATE);
        out.push({ title: title, href: a.getAttribute('href') || '', meta: dm ? dm[0] : '', inList: !!row, dateNear: !!dm });
      }
      return out;
    }

    // 触发懒加载：滚到底若干次再回顶，随后回调
    function autoScroll(times, done) {
      var n = 0;
      (function step() {
        window.scrollTo(0, document.body.scrollHeight);
        if (++n >= times) { window.scrollTo(0, 0); setTimeout(done, 300); return; }
        setTimeout(step, 500);
      })();
    }

    function mkBtn(label, bg, fn) {
      var b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'margin-left:8px;padding:4px 12px;border:0;border-radius:6px;cursor:pointer;font-size:13px;color:#fff;background:' + bg;
      b.onclick = fn;
      return b;
    }

    function build() {
      if (document.getElementById('zlgzt-bar')) return;
      var bar = document.createElement('div');
      bar.id = 'zlgzt-bar';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;align-items:center;'
        + 'padding:6px 14px;background:#8a1f18;color:#fff;font-size:13px;box-shadow:0 1px 6px rgba(0,0,0,.3);'
        + 'font-family:-apple-system,Segoe UI,Microsoft YaHei,sans-serif';
      var lb = document.createElement('span');
      lb.textContent = '战略工作台 · 从「' + SRC + '」获取：登录后下载研报回工作台上传（最佳），或抓取本页研报清单 / 正文';
      lb.style.cssText = 'flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      bar.appendChild(lb);

      // ① 站内自动抓取：滚动加载 → 采集候选 → 回传（App 侧打分成研报清单）
      var rbtn = mkBtn('抓取本页研报清单', '#c0392b', function () {
        rbtn.disabled = true;
        rbtn.textContent = '加载中…';
        autoScroll(5, function () {
          rbtn.textContent = '回传中…';
          invoke('grab_reports', { source: SRC, pageUrl: location.href, items: gatherCandidates() })
            .then(function () { rbtn.textContent = '已抓取清单 ✓'; })
            .catch(function () { rbtn.textContent = '未生效，改用下载→上传'; })
            .then(function () { setTimeout(function () { rbtn.disabled = false; rbtn.textContent = '抓取本页研报清单'; }, 2500); });
        });
      });
      bar.appendChild(rbtn);

      // ② 通用正文
      var tbtn = mkBtn('抓取此页正文', '#a0392b', function () {
        var text = pageText();
        if (!text) { tbtn.textContent = '本页无正文'; return; }
        var name = SRC + ' · ' + ((document.title || '网页').slice(0, 40)) + '（抓取）';
        tbtn.textContent = '回传中…';
        invoke('grab_page', { name: name, url: location.href, text: text })
          .then(function () { tbtn.textContent = '已加入本单 ✓'; setTimeout(function () { tbtn.textContent = '抓取此页正文'; }, 2000); })
          .catch(function () { tbtn.textContent = '此页未生效，请下载→上传'; });
      });
      bar.appendChild(tbtn);

      bar.appendChild(mkBtn('隐藏', '#5a5a5a', function () { bar.remove(); document.documentElement.style.paddingTop = ''; }));
      document.documentElement.style.paddingTop = '38px';
      (document.body || document.documentElement).appendChild(bar);
    }

    if (document.body) build();
    else document.addEventListener('DOMContentLoaded', build);
  } catch (e) { /* 注入失败不影响站点浏览 */ }
})();
