(function () {
  'use strict';

  var UI = {
    ua: { part: 'Частина', listen: 'Слухати', read: 'Читати', toc: 'Зміст', next: 'Далі — частина', back: '← Назад',
          paused: 'На паузі', playing: 'Грає', noAudio: 'Запису ще немає', play: 'Слухати', pause: 'Пауза',
          all: 'Зміст', close: 'Закрити', lang: 'uk',
          fail: 'Не вдалося завантажити content.json. Якщо ти відкрив index.html як файл, запусти локальний сервер, наприклад: python3 -m http.server' },
    en: { part: 'Part', listen: 'Listen', read: 'Read', toc: 'Contents', next: 'Next — part', back: '← Back',
          paused: 'Paused', playing: 'Playing', noAudio: 'No recording yet', play: 'Play', pause: 'Pause',
          all: 'Contents', close: 'Close', lang: 'en',
          fail: 'Could not load content.json.' }
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    app: $('app'), part: $('part'), tabListen: $('tabListen'), tabRead: $('tabRead'), modes: $('modes'), tocBtn: $('tocBtn'), lang: $('lang'),
    title: $('title'), img: $('img'), ph: $('ph'), read: $('read'), body: $('body'), text: $('text'),
    next: $('next'), back: $('back'), cont: $('cont'), thumb: $('thumb'),
    play: $('play'), wave: $('wave'), state: $('state'), time: $('time'), audio: $('audio'), fail: $('fail'),
    sheet: $('sheet'), sheetBackdrop: $('sheetBackdrop'), sheetClose: $('sheetClose'), sheetTitle: $('sheetTitle'), sheetList: $('sheetList')
  };

  var S = { data: null, i: 0, lang: 'ua', mode: 'read', peaks: [], peaksToken: 0, swapTimer: null, raf: 0, seeking: false, noAudio: false };

  var ICON_PLAY = '<svg viewBox="0 0 10 12" width="10" height="12" aria-hidden="true" style="margin-left:2px"><path d="M0 0l10 6-10 6z" fill="currentColor"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 10 12" width="10" height="12" aria-hidden="true"><path d="M0 0h3.2v12H0zM6.8 0H10v12H6.8z" fill="currentColor"/></svg>';

  var mq = window.matchMedia ? window.matchMedia('(max-width: 820px)') : { matches: false };
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
    var m0 = store('mode');
    S.mode = (m0 === 'listen' || m0 === 'read') ? m0 : (isMobile() ? 'listen' : 'read');

    buildList();
    buildLang(langs);
    bindEvents();

    var m = /^#(\d+)$/.exec(location.hash);
    var start = m ? Math.min(Math.max(parseInt(m[1], 10), 1), total()) - 1 : 0;
    go(start, { instant: true });
  }

  /* ---------- зміст і мови ---------- */
  function buildList() {
    el.sheetList.innerHTML = '';
    S.data.slides.forEach(function (s, idx) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-i', idx);
      var n = document.createElement('span'); n.className = 'n'; n.textContent = pad(s.id);
      var t = document.createElement('span'); t.textContent = tr(s.title);
      b.appendChild(n); b.appendChild(t);
      li.appendChild(b);
      el.sheetList.appendChild(li);
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

  function markList() {
    var sb = el.sheetList.querySelectorAll('button');
    for (var q = 0; q < sb.length; q++) {
      if (q === S.i) sb[q].setAttribute('aria-current', 'true'); else sb[q].removeAttribute('aria-current');
    }
    var lb = el.lang.querySelectorAll('button');
    for (var j = 0; j < lb.length; j++) lb[j].setAttribute('aria-pressed', String(lb[j].getAttribute('data-lang') === S.lang));
  }

  function openSheet() {
    el.sheet.hidden = false;
    var cur = el.sheetList.querySelector('[aria-current="true"]');
    if (cur) cur.scrollIntoView({ block: 'center' });
    el.sheetClose.focus();
  }
  function closeSheet() {
    if (el.sheet.hidden) return;
    el.sheet.hidden = true;
    try { el.tocBtn.focus(); } catch (e) {}
  }

  /* ---------- режим: слухати / читати ---------- */
  function setMode(mode, save) {
    S.mode = mode;
    if (save) store('mode', mode);
    el.app.setAttribute('data-mode', mode);
    el.tabListen.setAttribute('aria-selected', String(mode === 'listen'));
    el.tabRead.setAttribute('aria-selected', String(mode === 'read'));
    el.body.scrollTop = 0;
    requestAnimationFrame(function () { drawWave(); updateRail(); });
  }

  /* смужка позиції читання (телефон) */
  function updateRail() {
    var b = el.body;
    var on = isMobile() && S.mode === 'read' && b.scrollHeight > b.clientHeight + 2;
    el.read.classList.toggle('scrolls', on);
    if (!on) return;
    var sh = b.scrollHeight, ch = b.clientHeight;
    el.thumb.style.height = (ch / sh * 100) + '%';
    el.thumb.style.top = (b.scrollTop / sh * 100) + '%';
    el.read.classList.toggle('end', b.scrollTop + ch >= sh - 4);
  }

  /* ---------- показ слайда ---------- */
  function go(i, opts) {
    opts = opts || {};
    if (i < 0 || i > total() - 1) return;
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
    el.text.scrollTop = 0;
    el.body.scrollTop = 0;

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
    el.part.textContent = u.part + ' ' + num + ' / ' + tot;
    el.tabListen.textContent = u.listen;
    el.tabRead.textContent = u.read;
    el.tocBtn.textContent = u.toc;
    el.sheetTitle.textContent = u.all;
    el.sheetClose.setAttribute('aria-label', u.close);

    var atStart = S.i === 0, atEnd = S.i === total() - 1;
    el.next.hidden = atEnd;
    el.back.hidden = atStart;
    if (!atEnd) el.next.textContent = u.next + ' ' + pad(S.data.slides[S.i + 1].id) + ' →';
    el.back.textContent = u.back;
    el.cont.hidden = atStart && atEnd;

    setMode(S.mode, false);
    markList();
    try { history.replaceState(null, '', '#' + s.id); } catch (e) {}
    mediaSession(s);

    loadAudio(opts && opts.play);
  }

  function mediaSession(s) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: tr(s.title), artist: tr(S.data.meta.title), artwork: s.img ? [{ src: s.img }] : [] });
      navigator.mediaSession.setActionHandler('previoustrack', function () { go(S.i - 1, { play: !el.audio.paused }); });
      navigator.mediaSession.setActionHandler('nexttrack', function () { go(S.i + 1, { play: !el.audio.paused }); });
    } catch (e) {}
  }

  /* ---------- аудіо ---------- */
  function setState() {
    var u = ui();
    el.state.textContent = S.noAudio ? u.noAudio : (el.audio.paused ? u.paused : u.playing);
  }

  function loadAudio(autoplay) {
    var s = slide();
    var src = s.audio && s.audio[S.lang]; // без запасного варіанта: англійський текст не має грати українську озвучку
    S.noAudio = !src;
    el.play.disabled = S.noAudio;
    setPlayIcon(false);
    el.time.textContent = S.noAudio ? '' : '0:00';
    setState();
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

  el.audio.addEventListener('play', function () { setPlayIcon(true); setState(); cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(tick); });
  el.audio.addEventListener('pause', function () { setPlayIcon(false); setState(); cancelAnimationFrame(S.raf); drawWave(); updateTime(); });
  el.audio.addEventListener('loadedmetadata', function () { drawWave(); updateTime(); });
  el.audio.addEventListener('timeupdate', function () { if (el.audio.paused) { drawWave(); updateTime(); } });
  el.audio.addEventListener('error', function () {
    if (!el.audio.getAttribute('src')) return;
    S.noAudio = true; el.play.disabled = true; el.time.textContent = ''; setPlayIcon(false); setState();
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

  /* як на макеті: ~65 тонких стовпчиків, прослухані темні, решта світліші, лінія позиції з крапкою */
  function drawWave() {
    var c = el.wave, dpr = window.devicePixelRatio || 1;
    var w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    var cs = getComputedStyle(document.documentElement);
    var played = cs.getPropertyValue('--ink').trim() || '#25251F';
    var rest = cs.getPropertyValue('--wave').trim() || '#B9B4A7';
    var d = el.audio.duration;
    var prog = isFinite(d) && d > 0 ? el.audio.currentTime / d : 0;
    var barW = 1.2, n = Math.max(12, Math.min(65, Math.floor(w / 4)));
    var step = (w - barW) / (n - 1);
    var px = Math.min(Math.max(prog * w, 0), w - 1);
    var P = S.peaks, len = P.length || 1;
    for (var b = 0; b < n; b++) {
      var from = Math.floor(b / n * len), to = Math.max(from + 1, Math.floor((b + 1) / n * len)), m = 0, cnt = 0;
      for (var q = from; q < to && q < len; q++) { m += P[q]; cnt++; }
      m = cnt ? m / cnt : 0;
      var bh = Math.max(3, h * (0.08 + 0.58 * m));
      var x = b * step;
      g.fillStyle = x <= px ? played : rest;
      g.fillRect(x, (h - bh) / 2, barW, bh);
    }
    g.fillStyle = played;
    g.fillRect(px, 2, 1, h - 4);
    g.beginPath(); g.arc(px + 0.5, 2, 2, 0, Math.PI * 2); g.fill();
  }

  function seekFromEvent(e) {
    var d = el.audio.duration;
    if (!isFinite(d) || d <= 0) return;
    var r = el.wave.getBoundingClientRect();
    var p = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    el.audio.currentTime = p * d;
    drawWave(); updateTime();
  }

  /* ---------- події ---------- */
  function bindEvents() {
    el.next.addEventListener('click', function () { go(S.i + 1); });
    el.back.addEventListener('click', function () { go(S.i - 1); });
    el.play.addEventListener('click', togglePlay);

    el.modes.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) setMode(b.getAttribute('data-mode'), true);
    });

    // якщо файл картинки ще не залитий, показуємо плашку з номером замість зламаної іконки
    el.img.addEventListener('error', function () {
      if (!el.img.getAttribute('src')) return;
      el.img.hidden = true; el.ph.hidden = false;
    });

    el.tocBtn.addEventListener('click', openSheet);
    el.sheetClose.addEventListener('click', closeSheet);
    el.sheetBackdrop.addEventListener('click', closeSheet);
    el.sheetList.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var idx = parseInt(b.getAttribute('data-i'), 10);
      closeSheet();
      go(idx);
    });

    el.lang.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      S.lang = b.getAttribute('data-lang');
      store('lang', S.lang);
      buildList();
      go(S.i, { force: true, instant: true });
    });

    el.body.addEventListener('scroll', updateRail, { passive: true });
    window.addEventListener('resize', function () { drawWave(); updateRail(); });
    if (mq.addEventListener) mq.addEventListener('change', function () { drawWave(); updateRail(); });
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

    // клавіатура: стрілки між частинами, пробіл для звуку, Esc закриває зміст
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

    // свайп вліво-вправо на телефоні (по гравюрі та тексту, не по хвилі)
    var sx = 0, sy = 0, tracking = false;
    el.app.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1 || (e.target.closest && e.target.closest('.wave'))) { tracking = false; return; }
      tracking = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    el.app.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) go(S.i + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }
})();
