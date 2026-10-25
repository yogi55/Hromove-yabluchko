(function () {
  'use strict';

  var UI = {
    ua: { part: 'Частина', play: 'Слухати', pause: 'Пауза', noAudio: 'запису ще немає', lang: 'uk',
          prev: 'Попередня', next: 'Наступна', all: 'Усі історії', of: 'з', close: 'Закрити',
          fail: 'Не вдалося завантажити content.json. Якщо ти відкрив index.html як файл, запусти локальний сервер, наприклад: python3 -m http.server' },
    en: { part: 'Part', play: 'Listen', pause: 'Pause', noAudio: 'no recording yet', lang: 'en',
          prev: 'Previous', next: 'Next', all: 'All stories', of: 'of', close: 'Close',
          fail: 'Could not load content.json.' }
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    title: $('title'), stage: $('stage'), art: $('art'), img: $('img'), ph: $('ph'), text: $('text'),
    wave: $('wave'), label: $('label'), time: $('time'),
    prev: $('prev'), play: $('play'), next: $('next'),
    pager: $('pager'), pagerNav: $('pagerNav'), lang: $('lang'), fail: $('fail'), audio: $('audio'),
    count: $('count'), countBtn: $('countBtn'), topbar: $('topbar'), spacer: $('spacer'), dock: $('dock'), player: $('player'),
    rmPrev: $('rmPrev'), rmNext: $('rmNext'),
    mPrev: $('mPrev'), mNext: $('mNext'), mAll: $('mAll'), mPrevTxt: $('mPrevTxt'), mNextTxt: $('mNextTxt'),
    mAllCount: $('mAllCount'), mAllTxt: $('mAllTxt'),
    sheet: $('sheet'), sheetBackdrop: $('sheetBackdrop'), sheetClose: $('sheetClose'), sheetTitle: $('sheetTitle'), sheetList: $('sheetList')
  };

  var S = { data: null, i: 0, lang: 'ua', peaks: [], peaksToken: 0, swapTimer: null, raf: 0, seeking: false, noAudio: false, keepCollapsed: false };
  var G = { full: 0, small: 0, y0: 0, R: 1, ticking: false };
  var DOCK_H = 54;

  var ICON_PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6.5v11l9-5.5z" fill="currentColor"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8.5 6.5h2.6v11H8.5zM12.9 6.5h2.6v11h-2.6z" fill="currentColor"/></svg>';

  var mq = window.matchMedia ? window.matchMedia('(max-width: 720px)') : { matches: false };
  function isMobile() { return mq.matches; }

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function fmt(t) { if (!isFinite(t) || t < 0) t = 0; return Math.floor(t / 60) + ':' + pad(Math.floor(t % 60)); }
  function tr(obj) { return obj ? (obj[S.lang] || obj.ua || '') : ''; }
  function ui() { return UI[S.lang] || UI.ua; }
  function total() { return S.data.slides.length; }
  function slide() { return S.data.slides[S.i]; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- завантаження ---------- */
  fetch('content.json').then(function (r) {
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }).then(init).catch(function () {
    el.fail.textContent = ui().fail;
    el.fail.hidden = false;
  });

  function init(data) {
    S.data = data;
    var langs = (data.meta && data.meta.langs) || ['ua'];
    var saved = store('lang');
    S.lang = langs.indexOf(saved) >= 0 ? saved : langs[0];

    buildPager();
    buildLang(langs);
    bindEvents();

    var m = /^#(\d+)$/.exec(location.hash);
    var start = m ? Math.min(Math.max(parseInt(m[1], 10), 1), total()) - 1 : 0;
    go(start, { instant: true });
  }

  /* ---------- шкала, список і мови ---------- */
  function buildPager() {
    el.pager.innerHTML = '';
    el.sheetList.innerHTML = '';
    S.data.slides.forEach(function (s, idx) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = pad(s.id);
      b.setAttribute('data-i', idx);
      b.setAttribute('aria-label', ui().part + ' ' + s.id);
      li.appendChild(b);
      el.pager.appendChild(li);

      var li2 = document.createElement('li');
      var b2 = document.createElement('button');
      b2.type = 'button';
      b2.setAttribute('data-i', idx);
      var n = document.createElement('span'); n.className = 'n'; n.textContent = pad(s.id);
      var t = document.createElement('span'); t.textContent = tr(s.title);
      b2.appendChild(n); b2.appendChild(t);
      li2.appendChild(b2);
      el.sheetList.appendChild(li2);
    });
  }

  function buildLang(langs) {
    if (langs.length < 2) return;
    el.lang.hidden = false;
    el.lang.innerHTML = '';
    langs.forEach(function (code) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = code.toUpperCase();
      b.setAttribute('data-lang', code);
      el.lang.appendChild(b);
    });
  }

  function markPager() {
    var btns = el.pager.querySelectorAll('button');
    for (var k = 0; k < btns.length; k++) {
      if (k === S.i) btns[k].setAttribute('aria-current', 'true'); else btns[k].removeAttribute('aria-current');
    }
    var cur = btns[S.i];
    if (cur && el.pagerNav.scrollWidth > el.pagerNav.clientWidth) {
      el.pagerNav.scrollLeft = cur.offsetLeft - el.pagerNav.clientWidth / 2 + cur.offsetWidth / 2;
    }
    var sb = el.sheetList.querySelectorAll('button');
    for (var q = 0; q < sb.length; q++) {
      if (q === S.i) sb[q].setAttribute('aria-current', 'true'); else sb[q].removeAttribute('aria-current');
    }
    var lb = el.lang.querySelectorAll('button');
    for (var j = 0; j < lb.length; j++) lb[j].setAttribute('aria-pressed', String(lb[j].getAttribute('data-lang') === S.lang));
  }

  /* ---------- згортання ілюстрації при прокрутці (телефон) ---------- */
  var root = document.documentElement;
  function setVars(o) { for (var k in o) root.style.setProperty(k, o[k]); }
  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  function measure() {
    if (!isMobile() || !S.data) {
      ['--stick', '--small', '--full', '--ih', '--dockh', '--playerh', '--dockop', '--rmop'].forEach(function (k) { root.style.removeProperty(k); });
      root.classList.remove('collapsed');
      return;
    }
    var vh = window.innerHeight;
    var W = el.text.clientWidth || (document.body.clientWidth - 32);
    var ratio = (!el.img.hidden && el.img.naturalWidth) ? el.img.naturalHeight / el.img.naturalWidth : 1.5;
    var full = Math.min(W * ratio, vh * 0.72);
    var small = Math.min(Math.max(vh * 0.30, 150), 320, full);
    var inset = parseFloat(getComputedStyle(el.topbar).top) || 0;
    var stick = inset + el.topbar.offsetHeight;
    G.full = full; G.small = small;
    setVars({
      '--stick': stick + 'px', '--small': small + 'px', '--full': full + 'px',
      '--dockh': DOCK_H + 'px', '--playerh': el.player.offsetHeight + 'px'
    });
    // положення ілюстрації в документі без «прилипання»: верх відступу мінус висота коробки
    var spacerTop = el.spacer.getBoundingClientRect().top + window.scrollY;
    G.y0 = spacerTop - (small + DOCK_H) - stick;
    G.R = Math.max(1, full - small);
    if (S.keepCollapsed) window.scrollTo(0, G.y0 + G.R);
    updateScroll();
  }

  function updateScroll() {
    if (!isMobile() || !S.data) return;
    var d = clamp(window.scrollY - G.y0, 0, G.R);
    var p = d / G.R;
    setVars({
      '--ih': (G.full - d) + 'px',
      '--dockop': clamp((p - 0.5) / 0.4, 0, 1).toFixed(3),
      '--rmop': clamp((p - 0.6) / 0.35, 0, 1).toFixed(3)
    });
    root.classList.toggle('collapsed', p > 0.6);
    G.p = p;
  }

  function onScroll() {
    if (G.ticking) return;
    G.ticking = true;
    requestAnimationFrame(function () { G.ticking = false; updateScroll(); });
  }

  /* ---------- список усіх частин ---------- */
  function openSheet() {
    el.sheet.hidden = false;
    var cur = el.sheetList.querySelector('[aria-current="true"]');
    if (cur) cur.scrollIntoView({ block: 'center' });
    el.sheetClose.focus();
  }
  function closeSheet() {
    if (el.sheet.hidden) return;
    el.sheet.hidden = true;
    try { el.mAll.focus(); } catch (e) {}
  }

  /* ---------- показ слайда ---------- */
  function go(i, opts) {
    opts = opts || {};
    i = Math.min(Math.max(i, 0), total() - 1);
    var changed = i !== S.i || opts.force;
    if (!opts.keepAudio) { el.audio.pause(); }
    S.i = i;
    clearTimeout(S.swapTimer);
    if (opts.instant || reduceMotion || !changed) {
      paint(opts, changed);
    } else {
      document.body.classList.add('swap');
      S.swapTimer = setTimeout(function () { paint(opts, changed); document.body.classList.remove('swap'); }, 180);
    }
  }

  function paint(opts, changed) {
    var s = slide();
    var u = ui();
    document.documentElement.lang = u.lang;
    document.title = tr(s.title) ? tr(s.title) + ' · ' + tr(S.data.meta.title) : tr(S.data.meta.title);
    el.title.textContent = tr(s.title);

    el.text.innerHTML = '';
    tr(s.text).split(/\n\s*\n/).forEach(function (para) {
      if (!para.trim()) return;
      var p = document.createElement('p');
      p.textContent = para.trim();
      el.text.appendChild(p);
    });
    el.text.setAttribute('aria-label', tr(s.title));
    updateClip();

    el.ph.textContent = pad(s.id);
    el.img.alt = tr(s.title);
    if (s.img) {
      el.img.hidden = false; el.ph.hidden = true;
      el.img.src = s.img;
    } else {
      el.img.hidden = true; el.ph.hidden = false;
      el.img.removeAttribute('src');
    }
    var nxt = S.data.slides[S.i + 1];
    if (nxt && nxt.img) { var pre = new Image(); pre.src = nxt.img; }

    var num = pad(s.id), tot = pad(total());
    el.label.textContent = u.part + ' ' + num + ' / ' + tot;
    el.count.textContent = num + ' / ' + tot;
    el.mAllCount.textContent = num + ' ' + u.of + ' ' + tot;
    el.mAllTxt.textContent = u.all;
    el.mPrevTxt.textContent = u.prev;
    el.mNextTxt.textContent = u.next;
    el.sheetTitle.textContent = u.all;
    el.sheetClose.setAttribute('aria-label', u.close);
    el.rmPrev.setAttribute('aria-label', u.prev);
    el.rmNext.setAttribute('aria-label', u.next);
    el.dock.textContent = tr(s.title);

    var atStart = S.i === 0, atEnd = S.i === total() - 1;
    el.prev.disabled = el.mPrev.disabled = el.rmPrev.disabled = atStart;
    el.next.disabled = el.mNext.disabled = el.rmNext.disabled = atEnd;
    markPager();
    try { history.replaceState(null, '', '#' + s.id); } catch (e) {}
    if (changed && !opts.instant && isMobile()) {
      S.keepCollapsed = (G.p || 0) > 0.5;
      if (!S.keepCollapsed) window.scrollTo(0, 0);
    }
    measure();
    if (!s.img) S.keepCollapsed = false;

    loadAudio(opts && opts.play);
  }

  /* ---------- аудіо ---------- */
  function loadAudio(autoplay) {
    var s = slide();
    var src = s.audio && (s.audio[S.lang] || s.audio.ua);
    S.noAudio = !src;
    el.play.disabled = S.noAudio;
    setPlayIcon(false);
    el.time.textContent = S.noAudio ? ui().noAudio : '0:00';
    if (S.noAudio) {
      el.audio.removeAttribute('src');
      el.audio.load();
      setPeaks(fakePeaks(s.id));
      return;
    }
    el.audio.src = src;
    el.audio.load();
    loadPeaks(src.replace(/\.[a-z0-9]+$/i, '.json'), s.id);
    if (autoplay) {
      var pr = el.audio.play();
      if (pr && pr.catch) pr.catch(function () { setPlayIcon(false); });
    }
  }

  function setPlayIcon(playing) {
    el.play.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    el.play.setAttribute('aria-label', playing ? ui().pause : ui().play);
  }

  function togglePlay() {
    if (S.noAudio) return;
    if (el.audio.paused) {
      var pr = el.audio.play();
      if (pr && pr.catch) pr.catch(function () {});
    } else {
      el.audio.pause();
    }
  }

  function tick() {
    drawWave();
    updateTime();
    if (!el.audio.paused) S.raf = requestAnimationFrame(tick);
  }

  function updateTime() {
    if (S.noAudio) return;
    var d = el.audio.duration;
    el.time.textContent = fmt(el.audio.currentTime) + (isFinite(d) ? ' / ' + fmt(d) : '');
    var pct = isFinite(d) && d > 0 ? Math.round(el.audio.currentTime / d * 100) : 0;
    el.wave.setAttribute('aria-valuenow', String(pct));
  }

  el.audio.addEventListener('play', function () { setPlayIcon(true); cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(tick); });
  el.audio.addEventListener('pause', function () { setPlayIcon(false); cancelAnimationFrame(S.raf); drawWave(); updateTime(); });
  el.audio.addEventListener('loadedmetadata', function () { drawWave(); updateTime(); });
  el.audio.addEventListener('timeupdate', function () { if (el.audio.paused) { drawWave(); updateTime(); } });
  el.audio.addEventListener('error', function () {
    if (!el.audio.getAttribute('src')) return;
    S.noAudio = true; el.play.disabled = true; el.time.textContent = ui().noAudio; setPlayIcon(false);
  });
  el.audio.addEventListener('ended', function () {
    setPlayIcon(false);
    if (S.i < total() - 1) go(S.i + 1, { play: true });
  });

  /* ---------- хвиля ---------- */
  function loadPeaks(url, id) {
    var token = ++S.peaksToken;
    setPeaks(fakePeaks(id));
    fetch(url).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (arr) {
      if (token === S.peaksToken && arr && arr.length) setPeaks(arr);
    }).catch(function () {});
  }

  function setPeaks(arr) { S.peaks = arr; drawWave(); }

  function fakePeaks(seed) {
    var out = [], x = seed * 9301 + 49297;
    for (var k = 0; k < 240; k++) {
      x = (x * 9301 + 49297) % 233280;
      var base = 0.42 + 0.28 * Math.sin(k / 9 + seed) + 0.18 * Math.sin(k / 3.1);
      out.push(Math.max(0.12, Math.min(1, base + (x / 233280 - 0.5) * 0.35)));
    }
    return out;
  }

  function drawWave() {
    var c = el.wave, dpr = window.devicePixelRatio || 1;
    var w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    var cs = getComputedStyle(document.documentElement);
    var played = cs.getPropertyValue('--ink').trim() || '#1a1816';
    var rest = cs.getPropertyValue('--wave').trim() || '#9b9286';
    var d = el.audio.duration;
    var prog = isFinite(d) && d > 0 ? el.audio.currentTime / d : 0;
    var step = 5, barW = 2, n = Math.max(1, Math.floor(w / step));
    var P = S.peaks, len = P.length || 1;
    for (var b = 0; b < n; b++) {
      var from = Math.floor(b / n * len), to = Math.max(from + 1, Math.floor((b + 1) / n * len)), m = 0;
      for (var q = from; q < to && q < len; q++) if (P[q] > m) m = P[q];
      var bh = Math.max(3, m * (h - 4));
      var x = b * step + (step - barW) / 2;
      g.fillStyle = (x / w) <= prog ? played : rest;
      g.fillRect(x, (h - bh) / 2, barW, bh);
    }
    g.fillStyle = played;
    g.fillRect(Math.min(Math.round(prog * w), w - 1), 0, 1, h);
  }

  function seekFromEvent(e) {
    var d = el.audio.duration;
    if (!isFinite(d) || d <= 0) return;
    var r = el.wave.getBoundingClientRect();
    var p = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    el.audio.currentTime = p * d;
    drawWave(); updateTime();
  }

  /* ---------- текст: затемнення знизу, якщо є що прокручувати ---------- */
  function updateClip() {
    var t = el.text;
    var more = t.scrollHeight - t.scrollTop - t.clientHeight > 4 && getComputedStyle(t).overflowY !== 'visible';
    t.classList.toggle('is-clipped', more);
  }

  /* ---------- події ---------- */
  function bindEvents() {
    function prev() { go(S.i - 1); }
    function next() { go(S.i + 1); }
    el.prev.addEventListener('click', prev);
    el.mPrev.addEventListener('click', prev);
    el.rmPrev.addEventListener('click', prev);
    el.next.addEventListener('click', next);
    el.mNext.addEventListener('click', next);
    el.rmNext.addEventListener('click', next);
    el.play.addEventListener('click', togglePlay);

    el.pager.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) go(parseInt(b.getAttribute('data-i'), 10));
    });

    el.mAll.addEventListener('click', openSheet);
    el.sheetClose.addEventListener('click', closeSheet);
    el.sheetBackdrop.addEventListener('click', closeSheet);
    el.sheetList.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var idx = parseInt(b.getAttribute('data-i'), 10);
      closeSheet();
      go(idx);
    });

    el.countBtn.addEventListener('click', openSheet);
    el.img.addEventListener('load', function () { measure(); S.keepCollapsed = false; });
    window.addEventListener('scroll', onScroll, { passive: true });

    el.lang.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      S.lang = b.getAttribute('data-lang');
      store('lang', S.lang);
      buildPager();
      go(S.i, { force: true, instant: true });
    });

    el.text.addEventListener('scroll', updateClip);
    window.addEventListener('resize', function () { drawWave(); updateClip(); measure(); });
    if (mq.addEventListener) mq.addEventListener('change', measure);
    else if (mq.addListener) mq.addListener(measure);
    window.addEventListener('hashchange', function () {
      var m = /^#(\d+)$/.exec(location.hash);
      if (m) { var idx = parseInt(m[1], 10) - 1; if (idx !== S.i) go(idx); }
    });

    // перемотка по хвилі
    el.wave.addEventListener('pointerdown', function (e) {
      S.seeking = true;
      try { el.wave.setPointerCapture(e.pointerId); } catch (err) {}
      seekFromEvent(e);
    });
    el.wave.addEventListener('pointermove', function (e) { if (S.seeking) seekFromEvent(e); });
    el.wave.addEventListener('pointerup', function () { S.seeking = false; });
    el.wave.addEventListener('pointercancel', function () { S.seeking = false; });
    el.wave.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); e.stopPropagation();
        var d = el.audio.duration;
        if (isFinite(d)) el.audio.currentTime = Math.min(Math.max(el.audio.currentTime + (e.key === 'ArrowRight' ? 5 : -5), 0), d);
        drawWave(); updateTime();
      }
    });

    // клавіатура: стрілки між частинами, пробіл для звуку, Esc закриває список
    document.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') { closeSheet(); return; }
      if (!el.sheet.hidden) return;
      if (e.key === 'ArrowLeft') { go(S.i - 1); }
      else if (e.key === 'ArrowRight') { go(S.i + 1); }
      else if (e.key === ' ' || e.code === 'Space') {
        if (e.target.closest && e.target.closest('button')) return;
        e.preventDefault(); togglePlay();
      }
    });

    // свайп на телефоні
    var sx = 0, sy = 0, tracking = false;
    el.stage.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { tracking = false; return; }
      tracking = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    el.stage.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) go(S.i + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }
})();
