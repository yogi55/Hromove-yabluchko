(function () {
  'use strict';

  var UI = {
    ua: { part: 'Частина', play: 'Слухати', pause: 'Пауза', noAudio: 'запису ще немає', lang: 'uk', fail: 'Не вдалося завантажити content.json. Якщо ти відкрив index.html як файл, запусти локальний сервер, наприклад: python3 -m http.server' },
    en: { part: 'Part', play: 'Listen', pause: 'Pause', noAudio: 'no recording yet', lang: 'en', fail: 'Could not load content.json.' }
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    title: $('title'), stage: $('stage'), img: $('img'), ph: $('ph'), text: $('text'),
    wave: $('wave'), label: $('label'), time: $('time'),
    prev: $('prev'), play: $('play'), next: $('next'),
    pager: $('pager'), pagerNav: $('pagerNav'), lang: $('lang'), fail: $('fail'), audio: $('audio')
  };

  var S = { data: null, i: 0, lang: 'ua', peaks: [], peaksToken: 0, swapTimer: null, raf: 0, seeking: false, noAudio: false };

  var ICON_PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6.5v11l9-5.5z" fill="currentColor"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8.5 6.5h2.6v11H8.5zM12.9 6.5h2.6v11h-2.6z" fill="currentColor"/></svg>';

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

  /* ---------- шкала й мови ---------- */
  function buildPager() {
    el.pager.innerHTML = '';
    S.data.slides.forEach(function (s, idx) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = pad(s.id);
      b.setAttribute('data-i', idx);
      b.setAttribute('aria-label', ui().part + ' ' + s.id);
      li.appendChild(b);
      el.pager.appendChild(li);
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
      var on = k === S.i;
      if (on) btns[k].setAttribute('aria-current', 'true'); else btns[k].removeAttribute('aria-current');
    }
    var cur = btns[S.i];
    if (cur && el.pagerNav.scrollWidth > el.pagerNav.clientWidth) {
      el.pagerNav.scrollLeft = cur.offsetLeft - el.pagerNav.clientWidth / 2 + cur.offsetWidth / 2;
    }
    var lb = el.lang.querySelectorAll('button');
    for (var j = 0; j < lb.length; j++) lb[j].setAttribute('aria-pressed', String(lb[j].getAttribute('data-lang') === S.lang));
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
      paint(opts);
    } else {
      document.body.classList.add('swap');
      S.swapTimer = setTimeout(function () { paint(opts); document.body.classList.remove('swap'); }, 180);
    }
  }

  function paint(opts) {
    var s = slide();
    document.documentElement.lang = ui().lang;
    document.title = tr(s.title) ? tr(s.title) + ' · ' + tr(S.data.meta.title) : tr(S.data.meta.title);
    el.title.textContent = tr(s.title);

    el.text.innerHTML = '';
    tr(s.text).split(/\n\s*\n/).forEach(function (para) {
      if (!para.trim()) return;
      var p = document.createElement('p');
      p.textContent = para.trim();
      el.text.appendChild(p);
    });
    el.text.scrollTop = 0;
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

    el.label.textContent = ui().part + ' ' + pad(s.id) + ' / ' + pad(total());
    el.prev.disabled = S.i === 0;
    el.next.disabled = S.i === total() - 1;
    markPager();
    try { history.replaceState(null, '', '#' + s.id); } catch (e) {}

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
    el.prev.addEventListener('click', function () { go(S.i - 1); });
    el.next.addEventListener('click', function () { go(S.i + 1); });
    el.play.addEventListener('click', togglePlay);

    el.pager.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) go(parseInt(b.getAttribute('data-i'), 10));
    });

    el.lang.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      S.lang = b.getAttribute('data-lang');
      store('lang', S.lang);
      buildPager();
      go(S.i, { force: true, instant: true });
    });

    el.text.addEventListener('scroll', updateClip);
    window.addEventListener('resize', function () { drawWave(); updateClip(); });
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

    // клавіатура: стрілки між частинами, пробіл для звуку
    document.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
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
