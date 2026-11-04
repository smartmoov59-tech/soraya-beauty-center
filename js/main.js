/* ==========================================================================
   Soraya Beauty Center — mise en scène (GSAP + ScrollTrigger + Lenis)
   Site statique autonome : aucune requête serveur, aucun abonnement.
   La réservation génère un SMS / e-mail / .ics pré-remplis côté navigateur.
   ========================================================================== */
(() => {
  'use strict';

  /* ----------------------------- Réglages ---------------------------------
     À modifier ici si les infos du salon changent. */
  const CONFIG = {
    phoneTel: '+33609303644',
    phoneDisplay: '06 09 30 36 44',
    email: 'sorayalasiaa@gmail.com',
    address: 'Place Raymond Lopez, 12 rue des Frères Vallon, 13090 Aix-en-Provence',
    // Horaires d'ouverture : [ouverture, fermeture] en heures décimales. 0 = dimanche (fermé).
    hours: { 1: [9.5, 17.5], 2: [9.5, 17.5], 3: [9.5, 17.5], 4: [9.5, 17.5], 5: [9.5, 17.5], 6: [9.5, 17.5] },
    firstSlot: 9.5,          // premier créneau proposé (9h30)
    lastSlot: 16.5,          // dernier créneau proposé (16h30)
    slotStep: 0.5,           // un créneau toutes les 30 min
    daysAhead: 14,           // nombre de jours proposés
    closeOnHolidays: true,   // jours fériés non proposés
    // Congés à bloquer : [['2026-12-24', '2027-01-03']]
    holidays: [],
    // Durée par défaut du rendez-vous dans le fichier agenda (.ics), en minutes
    icsMinutes: 90,
  };

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasGSAP = !!(window.gsap && window.ScrollTrigger);

  const root = document.documentElement;
  const body = document.body;
  const nav = $('#nav');
  const loader = $('#loader');
  const video = $('.hero__video');

  /* ------------------------ Utilitaires indépendants ----------------------- */
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtH = (h) => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return mm ? `${hh}h${pad2(mm)}` : `${hh}h00`; };
  const DAYS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const DAYS_SHORT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const dayLong = (d) => `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;

  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7,
      m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31),
      da = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mo - 1, da);
  }
  const holidayCache = {};
  function frenchHolidays(y) {
    if (holidayCache[y]) return holidayCache[y];
    const e = easter(y), add = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const fixed = [[0, 1], [4, 1], [4, 8], [6, 14], [7, 15], [10, 1], [10, 11], [11, 25]].map(([m, d]) => new Date(y, m, d));
    return (holidayCache[y] = new Set([...fixed, add(e, 1), add(e, 39), add(e, 50)].map(dayKey)));
  }
  function isClosedDay(d) {
    if (!CONFIG.hours[d.getDay()]) return true;
    if (CONFIG.closeOnHolidays && frenchHolidays(d.getFullYear()).has(dayKey(d))) return true;
    const k = dayKey(d);
    return CONFIG.holidays.some(([a, b]) => k >= a && k <= b);
  }

  /* ---------------------- Fonctions qui ne dépendent pas de GSAP ---------------------- */
  $('#year') && ($('#year').textContent = new Date().getFullYear());

  // Statut "ouvert / fermé" + ligne du jour dans le tableau des horaires
  (function openNow() {
    const el = $('#openNow');
    if (!el) return;
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const d = now.getDay(), t = now.getHours() + now.getMinutes() / 60;
    const row = $(`#hours [data-day="${d}"]`);
    row && row.classList.add('is-today');
    const h = CONFIG.hours[d];
    let txt;
    if (h && t >= h[0] && t < h[1]) {
      el.classList.add('is-open');
      txt = `Ouvert maintenant · ferme à ${fmtH(h[1])}`;
    } else {
      txt = 'Fermé actuellement';
      for (let k = 0; k < 8; k++) {
        const dd = (d + k) % 7, hh = CONFIG.hours[dd];
        if (hh && (k > 0 || t < hh[0])) {
          txt = `Fermé · ouvre ${k === 0 ? "aujourd'hui" : k === 1 ? 'demain' : DAYS_LONG[dd]} à ${fmtH(hh[0])}`;
          break;
        }
      }
    }
    el.querySelector('span').textContent = txt;
  })();

  /* ============================== RÉSERVATION ============================== */
  const booking = (() => {
    const form = $('#bookForm');
    if (!form) return null;
    const chips = $$('input[name="service"]', form);
    const LABELS = Object.fromEntries(chips.map((c) => [c.value, c.dataset.label]));
    const daysEl = $('#days'), slotsEl = $('#slots'), hint = $('#slotsHint');
    const nameInput = $('#bkName'), noteInput = $('#bkNote');
    const help = $('#bookHelp'), preview = $('#bkPreview');
    const smsBtn = $('#bkSms'), mailBtn = $('#bkMail'), icsBtn = $('#bkIcs'), copyBtn = $('#bkCopy');
    const state = { date: null, time: null };

    const slotList = (date) => {
      const out = [], now = new Date();
      for (let h = CONFIG.firstSlot; h <= CONFIG.lastSlot + 1e-6; h += CONFIG.slotStep) {
        const when = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(h), Math.round((h % 1) * 60));
        out.push({ h, ok: when.getTime() > now.getTime() + 90 * 60000 });
      }
      return out;
    };

    function buildDays() {
      const out = [], start = new Date();
      start.setHours(0, 0, 0, 0);
      for (let i = 0; out.length < CONFIG.daysAhead && i < 60; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        if (isClosedDay(d)) continue;
        if (!slotList(d).some((s) => s.ok)) continue;
        out.push(d);
      }
      daysEl.innerHTML = '';
      out.forEach((d) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'day';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', 'false');
        b.setAttribute('aria-label', dayLong(d));
        b.dataset.key = dayKey(d);
        b.innerHTML = `<small>${DAYS_SHORT[d.getDay()]}</small><b>${d.getDate()}</b><em>${MONTHS_SHORT[d.getMonth()]}</em>`;
        b.addEventListener('click', () => pickDay(d, b));
        daysEl.appendChild(b);
      });
    }

    function pickDay(d, btn) {
      state.date = d;
      state.time = null;
      $$('.day', daysEl).forEach((x) => x.setAttribute('aria-checked', String(x === btn)));
      slotsEl.innerHTML = '';
      slotList(d).forEach((s) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'slot';
        b.textContent = fmtH(s.h);
        b.disabled = !s.ok;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', 'false');
        b.dataset.h = s.h;
        b.addEventListener('click', () => {
          state.time = s.h;
          $$('.slot', slotsEl).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
          refresh();
        });
        slotsEl.appendChild(b);
      });
      slotsEl.hidden = false;
      hint.textContent = `${dayLong(d)} : choisissez une heure. Horaires indicatifs, Soraya confirme selon la durée de la prestation.`;
      refresh();
    }

    const selected = () => chips.filter((c) => c.checked).map((c) => LABELS[c.value]);

    function missing() {
      const m = [];
      if (!selected().length) m.push('une prestation');
      if (!state.date) m.push('un jour');
      else if (state.time == null) m.push('une heure');
      if (!nameInput.value.trim()) m.push('votre prénom');
      return m;
    }

    function message() {
      const lines = [
        'Bonjour Soraya,',
        'je souhaite prendre rendez-vous :',
        `• Prestation : ${selected().join(', ')}`,
        `• Jour souhaité : ${dayLong(state.date)}`,
        `• Heure souhaitée : ${fmtH(state.time)}`,
        `• Prénom : ${nameInput.value.trim()}`,
      ];
      if (noteInput.value.trim()) lines.push(`• Précision : ${noteInput.value.trim()}`);
      lines.push('', 'Pouvez-vous me confirmer la disponibilité ? Merci !');
      return lines.join('\n');
    }

    function setLink(a, href, on) {
      a.classList.toggle('is-disabled', !on);
      a.setAttribute('aria-disabled', String(!on));
      if (a.tagName === 'A') a.setAttribute('href', on ? href : '#reservation');
    }

    function refresh() {
      const m = missing();
      const ok = m.length === 0;
      help.classList.toggle('is-ready', ok);
      if (!ok) {
        help.textContent = `Il manque encore : ${m.join(', ')}.`;
        preview.hidden = true;
      } else {
        const msg = message();
        help.textContent = 'Votre message est prêt. Envoyez-le à Soraya, elle vous confirme le créneau.';
        preview.textContent = msg;
        preview.hidden = false;
        smsBtn.dataset.msg = msg;
        setLink(smsBtn, `sms:${CONFIG.phoneTel}?&body=${encodeURIComponent(msg)}`, true);
        setLink(mailBtn, `mailto:${CONFIG.email}?subject=${encodeURIComponent('Demande de rendez-vous')}&body=${encodeURIComponent(msg)}`, true);
      }
      if (!ok) { setLink(smsBtn, '', false); setLink(mailBtn, '', false); }
      setLink(icsBtn, '', ok);
      setLink(copyBtn, '', ok);
    }

    function guard(e, el) {
      if (el.getAttribute('aria-disabled') === 'true') {
        e.preventDefault();
        e.stopPropagation();
        help.focus && help.setAttribute('tabindex', '-1');
        help.focus();
        return true;
      }
      return false;
    }

    smsBtn.addEventListener('click', (e) => {
      if (guard(e, smsBtn)) return;
      help.textContent = "Votre application SMS s'ouvre avec le message prêt : appuyez sur « Envoyer » pour valider votre demande.";
    });
    mailBtn.addEventListener('click', (e) => { guard(e, mailBtn); });

    copyBtn.addEventListener('click', async () => {
      if (copyBtn.getAttribute('aria-disabled') === 'true') return;
      const msg = message();
      try { await navigator.clipboard.writeText(msg); }
      catch (_) {
        const t = document.createElement('textarea');
        t.value = msg; t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); } catch (__) { /* noop */ }
        t.remove();
      }
      help.textContent = `Message copié. Collez-le dans un SMS au ${CONFIG.phoneDisplay} ou dans un e-mail.`;
    });

    icsBtn.addEventListener('click', () => {
      if (icsBtn.getAttribute('aria-disabled') === 'true') return;
      const d = state.date, h = Math.floor(state.time), mi = Math.round((state.time % 1) * 60);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi);
      const end = new Date(start.getTime() + CONFIG.icsMinutes * 60000);
      const f = (x) => `${x.getFullYear()}${pad2(x.getMonth() + 1)}${pad2(x.getDate())}T${pad2(x.getHours())}${pad2(x.getMinutes())}00`;
      const stamp = new Date();
      const esc = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
      const ics = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Soraya Beauty Center//Rendez-vous//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${stamp.getTime()}@soraya-beauty-center`,
        `DTSTAMP:${stamp.getUTCFullYear()}${pad2(stamp.getUTCMonth() + 1)}${pad2(stamp.getUTCDate())}T${pad2(stamp.getUTCHours())}${pad2(stamp.getUTCMinutes())}00Z`,
        `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
        `SUMMARY:${esc('Soraya Beauty Center (à confirmer)')}`,
        `LOCATION:${esc(CONFIG.address)}`,
        `DESCRIPTION:${esc(selected().join(', ') + `\nDemande envoyée à Soraya : ${CONFIG.phoneDisplay}. Créneau à confirmer.`)}`,
        'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Rendez-vous chez Soraya Beauty Center', 'END:VALARM',
        'END:VEVENT', 'END:VCALENDAR',
      ].join('\r\n');
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'rendez-vous-soraya-beauty-center.ics';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });

    chips.forEach((c) => c.addEventListener('change', refresh));
    nameInput.addEventListener('input', refresh);
    noteInput.addEventListener('input', refresh);
    form.addEventListener('submit', (e) => e.preventDefault());

    // Préselection depuis les cartes « Réserver »
    $$('.go[data-service]').forEach((a) => a.addEventListener('click', () => {
      const c = chips.find((x) => x.value === a.dataset.service);
      if (c) { c.checked = true; refresh(); }
    }));

    buildDays();
    refresh();
    return { refresh };
  })();

  /* ================== Garde-fou : si GSAP est indisponible ================== */
  if (!hasGSAP) {
    loader && loader.remove();
    body.classList.remove('is-loading');
    if (video) { video.src = video.dataset.srcSmall; video.play && video.play().catch(() => {}); }
    $$('.rev').forEach((r, i) => r.classList.toggle('is-active', i === 0));
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  /* ----------------------- Smooth scroll (Lenis) ----------------------- */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }
  const scrollToY = (y, dur = 1.6) => {
    if (lenis) lenis.scrollTo(y, { duration: dur, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  };

  /* ----------------------------- Split text ----------------------------- */
  function splitNode(node, mode, out) {
    const frag = document.createDocumentFragment();
    node.childNodes.forEach((ch) => {
      if (ch.nodeType === 3) {
        ch.textContent.split(/(\s+)/).forEach((tok) => {
          if (!tok) return;
          if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span');
          w.className = 'w';
          w.setAttribute('aria-hidden', 'true');
          const inner = document.createElement('span');
          inner.className = 'wi';
          if (mode === 'chars') {
            Array.from(tok).forEach((c) => {
              const s = document.createElement('span');
              s.className = 'c';
              s.textContent = c;
              inner.appendChild(s);
              out.push(s);
            });
            inner.className = '';
            inner.style.display = 'inline-block';
          } else {
            inner.textContent = tok;
            out.push(inner);
          }
          w.appendChild(inner);
          frag.appendChild(w);
        });
      } else if (ch.nodeType === 1) {
        const clone = ch.cloneNode(false);
        clone.appendChild(splitNode(ch, mode, out));
        frag.appendChild(clone);
      }
    });
    return frag;
  }
  function split(el, mode = 'words') {
    const label = el.textContent.replace(/\s+/g, ' ').trim();
    if (el.tagName !== 'SPAN') el.setAttribute('aria-label', label);
    const out = [];
    const frag = splitNode(el, mode, out);
    el.textContent = '';
    el.appendChild(frag);
    return out;
  }

  /* ------------------ Frange de cils (séparateurs) ------------------ */
  const NS = 'http://www.w3.org/2000/svg';
  const rnd = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  function buildFringe(el) {
    const w = Math.max(320, Math.round(el.clientWidth || window.innerWidth)), h = 72;
    const n = Math.round(w / 15);
    el.innerHTML = '';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');
    const base = document.createElementNS(NS, 'rect');
    base.setAttribute('x', 0); base.setAttribute('y', h - 3); base.setAttribute('width', w); base.setAttribute('height', 4);
    svg.appendChild(base);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = t * w;
      const len = 16 + 48 * Math.pow(Math.sin(Math.PI * t), 0.85) * (0.62 + 0.38 * rnd(i));
      const lean = (t - 0.5) * 2 * 22 * (len / 64);
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', `M${x.toFixed(1)} ${h} Q${(x + lean * 0.1).toFixed(1)} ${(h - len * 0.55).toFixed(1)} ${(x + lean).toFixed(1)} ${(h - len).toFixed(1)}`);
      p.setAttribute('stroke-width', (2.4 + rnd(i + 9) * 1.2).toFixed(2));
      svg.appendChild(p);
    }
    el.appendChild(svg);
    return $$('path', svg);
  }
  const fringes = $$('[data-fringe]');
  fringes.forEach((el) => {
    let paths = buildFringe(el);
    if (!reduce) {
      gsap.set(paths, { scaleY: 0, transformOrigin: '50% 100%' });
      ScrollTrigger.create({
        trigger: el, start: 'bottom 98%', once: true,
        onEnter: () => {
          el._played = true;
          gsap.to($$('path', el), { scaleY: 1, duration: 1.1, ease: 'back.out(2.2)', stagger: { each: 0.011, from: 'center' } });
        },
      });
    }
    el._rebuild = () => { paths = buildFringe(el); if (!reduce && !el._played) gsap.set(paths, { scaleY: 0, transformOrigin: '50% 100%' }); };
  });
  let rz;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => fringes.forEach((f) => f._rebuild()), 250); });

  /* ------------------------------ Vidéo ------------------------------ */
  function initVideo() {
    if (!video) return;
    const small = innerWidth < 900 || (navigator.connection && navigator.connection.saveData);
    if (reduce) return; // affiche seulement l'image de secours
    video.muted = true;
    video.src = small ? video.dataset.srcSmall : video.dataset.srcBig;
    video.play && video.play().catch(() => {});
  }
  const bookVideo = $('.book__bg video');
  if (bookVideo && !reduce && innerWidth >= 900 && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (e.isIntersecting) {
          if (!bookVideo.src) { bookVideo.muted = true; bookVideo.src = bookVideo.dataset.src; }
          bookVideo.play && bookVideo.play().catch(() => {});
        } else { bookVideo.pause && bookVideo.pause(); }
      });
    }, { rootMargin: '200px' });
    io.observe($('.book'));
  }

  /* ------------------------ Préchargeur & intro ------------------------ */
  // Cils dessinés sur la paupière du préchargeur
  const eyeLashes = $('.eye-lashes');
  const lashEls = [];
  if (eyeLashes) {
    const P = [[20, 100], [90, 18], [270, 18], [340, 100]];
    const B = (t) => {
      const u = 1 - t;
      return [0, 1].map((k) => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]);
    };
    const D = (t) => {
      const u = 1 - t;
      return [0, 1].map((k) => 3 * u * u * (P[1][k] - P[0][k]) + 6 * u * t * (P[2][k] - P[1][k]) + 3 * t * t * (P[3][k] - P[2][k]));
    };
    const N = 19;
    for (let i = 0; i < N; i++) {
      const t = 0.07 + (i * 0.86) / (N - 1);
      const [bx, by] = B(t), [dx, dy] = D(t), l = Math.hypot(dx, dy);
      const nx = dy / l, ny = -dx / l, tx = dx / l, ty = dy / l;
      const L = 12 + 26 * Math.pow(t, 1.4) + rnd(i) * 5, lean = (t - 0.35) * 14;
      const ex = bx + nx * L + tx * lean, ey = by + ny * L + ty * lean;
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', `M${bx.toFixed(1)} ${by.toFixed(1)} Q${(bx + nx * L * 0.6).toFixed(1)} ${(by + ny * L * 0.6).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`);
      p._o = `${bx.toFixed(1)} ${by.toFixed(1)}`;
      eyeLashes.appendChild(p);
      lashEls.push(p);
    }
  }

  // Titres : split puis révélation au scroll
  let heroChars = [];
  if (!reduce) {
    heroChars = split($('.hero__name'), 'chars');
    $$('[data-split]').forEach((el) => {
      if (el.classList.contains('hero__name')) return;
      const mode = el.dataset.split;
      const parts = split(el, mode);
      gsap.from(parts, {
        yPercent: 118, duration: 1.3, ease: 'expo.out', stagger: mode === 'chars' ? 0.07 : 0.055,
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      });
    });
  }

  function heroIntro() {
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.fromTo('.hero__video', { scale: 1.4 }, { scale: 1.1, duration: 2.6 }, 0)
      .from(heroChars, { yPercent: 120, duration: 1.5, stagger: 0.07 }, 0.1)
      .from('.hero__eyebrow', { y: 24, autoAlpha: 0, duration: 1 }, 0.35)
      .from('.hero__sub', { y: 40, autoAlpha: 0, duration: 1.2 }, 0.75)
      .from('.hero__lead', { y: 30, autoAlpha: 0, duration: 1.1 }, 0.9)
      .from('.hero__cta .btn', { y: 30, autoAlpha: 0, duration: 1, stagger: 0.12 }, 1)
      .from('.float img', { scale: 0.4, autoAlpha: 0, duration: 1.6, stagger: 0.14, ease: 'back.out(1.5)' }, 0.5)
      .from('.badge', { scale: 0, rotate: -120, duration: 1.4, ease: 'back.out(1.6)' }, 1.2)
      .from('.nav > *', { y: -28, autoAlpha: 0, duration: 1.1, stagger: 0.08 }, 0.9)
      .add(() => $('#fab') && $('#fab').classList.add('is-in'), 1.8);
    return tl;
  }

  function finishLoader() {
    loader && loader.remove();
    body.classList.remove('is-loading');
    lenis && lenis.start();
    ScrollTrigger.refresh();
  }

  function runLoader() {
    initVideo();
    if (reduce || !loader) {
      finishLoader();
      $('#fab') && $('#fab').classList.add('is-in');
      return;
    }
    const lid = $('.eye-lid'), low = $('.eye-low');
    const lidLen = lid.getTotalLength(), lowLen = low.getTotalLength();
    const nameChars = split($('.loader__name'), 'chars');
    gsap.set(lid, { strokeDasharray: lidLen, strokeDashoffset: lidLen });
    gsap.set(low, { strokeDasharray: lowLen, strokeDashoffset: lowLen });
    lashEls.forEach((p) => gsap.set(p, { svgOrigin: p._o, scale: 0 }));
    gsap.set('.eye-iris', { svgOrigin: '180 86', scale: 0 });

    const num = $('#loadNum'), prog = { v: 0 };
    const tl = gsap.timeline();
    tl.to(prog, { v: 100, duration: 2.3, ease: 'power1.inOut', onUpdate: () => { num.textContent = Math.round(prog.v); } }, 0)
      .to(lid, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut' }, 0.1)
      .to(low, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut' }, 0.3)
      .to(lashEls, { scale: 1, duration: 0.7, ease: 'back.out(2.6)', stagger: 0.045 }, 0.7)
      .to('.eye-iris', { scale: 1, duration: 0.8, ease: 'back.out(2)' }, 1.1)
      .from(nameChars, { yPercent: 130, duration: 0.9, ease: 'expo.out', stagger: 0.06 }, 0.8);

    // On attend la fin de l'animation, les polices et le début de la vidéo, mais jamais plus de 5 s
    const ready = Promise.race([
      Promise.all([
        document.fonts && document.fonts.ready,
        new Promise((r) => {
          if (!video || !video.src) return r();
          if (video.readyState >= 3) return r();
          video.addEventListener('canplay', r, { once: true });
          setTimeout(r, 3500);
        }),
        new Promise((r) => tl.eventCallback('onComplete', r)),
      ]),
      new Promise((r) => setTimeout(r, 5000)),
    ]);

    ready.then(() => {
      num.textContent = '100';
      const ex = gsap.timeline({ onComplete: finishLoader });
      ex.to('.eye-lashes path', { scale: 1.25, duration: 0.3, stagger: 0.01, ease: 'power2.out' }, 0)
        .to('.loader__core', { scale: 1.2, autoAlpha: 0, duration: 0.55, ease: 'power2.in' }, 0.25)
        .to('.lid--top', { yPercent: -128, duration: 1.35, ease: 'expo.inOut' }, 0.5)
        .to('.lid--bot', { yPercent: 128, duration: 1.35, ease: 'expo.inOut' }, 0.5)
        .add(heroIntro, 0.95);
    });
  }

  /* ------------------------------ Hero : parallax ------------------------------ */
  if (!reduce) {
    gsap.to('.hero__video', { yPercent: 9, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero__content', { yPercent: -14, autoAlpha: 0.1, ease: 'none', scrollTrigger: { trigger: '.hero', start: '35% top', end: 'bottom top', scrub: true } });
    gsap.to('.hero__shade', { opacity: 0.75, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    $$('.float').forEach((f) => {
      const sp = parseFloat(f.dataset.speed || 0.3);
      gsap.to(f, { y: () => -sp * innerHeight * 0.9, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true, invalidateOnRefresh: true } });
      gsap.to($('.float__in', f), { y: '+=14', rotate: sp * 6 - 2, duration: 3 + sp * 3, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    });
    if (finePointer) {
      const fl = $$('.float__in');
      const setters = fl.map((el, i) => ({ x: gsap.quickTo(el, 'x', { duration: 1.2, ease: 'power3' }), k: 18 + i * 14 }));
      $('.hero').addEventListener('pointermove', (e) => {
        const mx = e.clientX / innerWidth - 0.5;
        setters.forEach((s) => s.x(-mx * s.k));
      });
    }
  }

  /* --------------------------- Barre de progression --------------------------- */
  gsap.to('.progress i', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: root, start: 0, end: 'max', scrub: 0.25 } });

  /* ------------------------------ Navigation ------------------------------ */
  let menuOpen = false;
  const menu = $('#menu'), burger = $('#burger');
  $$('.menu__links a').forEach((a) => { a.innerHTML = `<b class="m-in">${a.innerHTML}</b>`; });
  function setMenu(open) {
    menuOpen = open;
    nav.classList.toggle('is-open', open);
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    menu.inert = !open;
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    if (lenis) open ? lenis.stop() : lenis.start();
    else body.style.overflow = open ? 'hidden' : '';
    if (open && !reduce) gsap.fromTo('.menu__links .m-in', { yPercent: 115 }, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.07, delay: 0.3 });
  }
  burger.addEventListener('click', () => setMenu(!menuOpen));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) { setMenu(false); burger.focus(); } });

  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: (self) => {
      const y = self.scroll();
      nav.classList.toggle('is-solid', y > 60);
      if (menuOpen) return;
      if (y > 500 && self.direction === 1) nav.classList.add('is-hidden');
      else if (self.direction === -1 || y <= 500) nav.classList.remove('is-hidden');
    },
  });

  // Liens d'ancrage (compatibles avec les sections épinglées)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented) return;
    const id = a.getAttribute('href');
    if (!id || id === '#') return;
    e.preventDefault();
    const go = () => {
      if (id === '#top') { scrollToY(0, 1.8); return; }
      const t = $(id);
      if (!t) return;
      const st = ScrollTrigger.getAll().find((s) => s.pin && (s.trigger === t || s.vars.trigger === t));
      const y = st ? st.start : t.getBoundingClientRect().top + window.scrollY;
      scrollToY(y, 1.8);
      history.replaceState(null, '', id);
    };
    if (menuOpen) { setMenu(false); setTimeout(go, 450); } else go();
  });
  $('#toTop') && $('#toTop').addEventListener('click', () => scrollToY(0, 2.2));

  /* -------------------------------- Marquee -------------------------------- */
  function initMarquee() {
    const tracks = $$('.marquee__track');
    if (!tracks.length) return;
    const state = tracks.map((tr) => {
      const group = tr.firstElementChild;
      const gw = group.getBoundingClientRect().width;
      const copies = Math.ceil(innerWidth / gw) + 1;
      for (let i = 0; i < copies; i++) {
        const c = group.cloneNode(true);
        c.setAttribute('aria-hidden', 'true');
        tr.appendChild(c);
      }
      return { tr, gw, x: 0, dir: parseInt(tr.dataset.dir, 10) || -1 };
    });
    if (reduce) return;
    let lastY = window.scrollY, boost = 0, way = 1;
    gsap.ticker.add((time, delta) => {
      const y = window.scrollY, v = y - lastY;
      lastY = y;
      boost += (clamp(Math.abs(v) * 0.5, 0, 22) - boost) * 0.1;
      if (Math.abs(v) > 0.5) way = v > 0 ? 1 : -1;
      const f = delta / 16.67;
      state.forEach((s) => {
        s.x += s.dir * way * (0.7 + boost) * f;
        if (s.x <= -s.gw) s.x += s.gw;
        if (s.x >= 0) s.x -= s.gw;
        s.tr.style.transform = `translate3d(${s.x.toFixed(2)}px,0,0)`;
      });
    });
  }
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(initMarquee);

  /* ---------------- Révélations discrètes (textes, blocs) ---------------- */
  if (!reduce) {
    gsap.utils.toArray('.eyebrow, .gallery__intro, .svc__hint, .book__lead, .book__phone, .book__facts li, .open-now, .access__addr, .hours div, .access__links li, .access__pmr, .footer__claim, .footer__cols>div, .footer__legal>*').forEach((el) => {
      gsap.from(el, { y: 34, autoAlpha: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true } });
    });
    gsap.from('.booking', { y: 70, autoAlpha: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.booking', start: 'top 88%', once: true } });
    $$('.polaroid').forEach((p, i) => {
      p.style.transition = 'none';
      gsap.from(p, {
        y: 120, autoAlpha: 0, duration: 1.4, ease: 'expo.out', delay: i * 0.18,
        scrollTrigger: { trigger: '.polaroids', start: 'top 92%', once: true },
        onComplete: () => { p.style.transition = ''; gsap.set(p, { clearProps: 'transform' }); },
      });
    });
    gsap.from('.map', { y: 70, autoAlpha: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.map', start: 'top 90%', once: true } });
  }

  /* -------------- Sections épinglées & défilement horizontal -------------- */
  const mm = gsap.matchMedia();

  // L'institut : storytelling étape par étape
  mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
    const sec = $('.story');
    const steps = $$('.step', sec), frames = $$('.frame', sec), imgs = frames.map((f) => $('img', f));
    const meter = $('.story__meter i', sec);
    const colors = ['#FBF4EE', '#F6DAD7', '#EEDFCF', '#FBF4EE'];
    root.classList.add('has-pin-story');
    gsap.set(steps.slice(1), { autoAlpha: 0, y: 50 });
    gsap.set(frames.slice(1), { yPercent: 100 });
    gsap.set(imgs.slice(1), { yPercent: -100 });
    gsap.set(meter, { scaleX: 1 / steps.length });

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: sec, start: 'top top', end: () => `+=${steps.length * 95}%`, pin: true, scrub: 0.7, anticipatePin: 1, invalidateOnRefresh: true },
    });
    steps.forEach((_, i) => {
      if (!i) return;
      const at = (i - 1) * 1.15 + 0.5;
      tl.to(steps[i - 1], { autoAlpha: 0, y: -50, duration: 0.28, ease: 'power2.out' }, at)
        .to(frames[i], { yPercent: 0, duration: 0.8, ease: 'power3.inOut' }, at)
        .to(imgs[i], { yPercent: 0, duration: 0.8, ease: 'power3.inOut' }, at)
        .to(steps[i], { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out' }, at + 0.3)
        .to(sec, { backgroundColor: colors[i], duration: 0.8 }, at)
        .to(meter, { scaleX: (i + 1) / steps.length, duration: 0.8 }, at);
    });
    tl.to({}, { duration: 0.6 });
    return () => root.classList.remove('has-pin-story');
  });

  // Mobile / tablette : simples apparitions
  mm.add('(max-width: 899px) and (prefers-reduced-motion: no-preference)', () => {
    $$('.story .step').forEach((s) => gsap.from(s, { y: 50, autoAlpha: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: s, start: 'top 88%', once: true } }));
    $$('.story .frame').forEach((f, i) => gsap.from(f, { y: 70, autoAlpha: 0, duration: 1.2, delay: (i % 2) * 0.12, ease: 'expo.out', scrollTrigger: { trigger: f, start: 'top 92%', once: true } }));
    gsap.from('.card', { autoAlpha: 0, duration: 1, ease: 'power2.out', stagger: 0.12, scrollTrigger: { trigger: '.svc__track', start: 'top 85%', once: true } });
  });

  // Prestations : scroll horizontal piloté par le scroll vertical
  mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
    const sec = $('.svc'), track = $('.svc__track'), bar = $('.svc__progress i');
    const dist = () => Math.max(0, track.scrollWidth - innerWidth);
    const tween = gsap.to(track, {
      x: () => -dist(), ease: 'none',
      scrollTrigger: {
        trigger: sec, start: 'top top', end: () => `+=${dist()}`, pin: true, scrub: 0.7, anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: (self) => gsap.set(bar, { scaleX: self.progress }),
      },
    });
    $$('.card', sec).forEach((card) => {
      gsap.fromTo($('img', card), { x: 24 }, { x: -24, ease: 'none', scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
    });
    gsap.from('.card', { autoAlpha: 0, duration: 1.2, ease: 'power2.out', stagger: 0.1, scrollTrigger: { trigger: sec, start: 'top 70%', once: true } });
  });

  /* -------------------------------- Chiffres -------------------------------- */
  $$('[data-count]').forEach((el) => {
    const stat = el.closest('.stat');
    const to = parseFloat(el.dataset.count), from = parseFloat(el.dataset.from || 0), dec = parseInt(el.dataset.dec || 0, 10);
    const fmt = (v) => (dec ? v.toFixed(dec).replace('.', ',') : String(Math.round(v)));
    if (reduce) { stat.classList.add('is-done'); return; }
    el.textContent = fmt(from);
    const o = { v: from };
    gsap.set(stat, { '--line': 0 });
    ScrollTrigger.create({
      trigger: stat, start: 'top 82%', once: true,
      onEnter: () => {
        gsap.to(stat, { '--line': 1, duration: 1.4, ease: 'expo.out' });
        gsap.to(o, { v: to, duration: 2.4, ease: 'power3.out', onUpdate: () => { el.textContent = fmt(o.v); }, onComplete: () => stat.classList.add('is-done') });
        const stars = $$('.stat__stars svg', stat);
        stars.length && gsap.from(stars, { scale: 0, rotate: -80, duration: 0.8, stagger: 0.12, delay: 0.6, ease: 'back.out(3)' });
      },
    });
  });

  /* -------------------------------- Galerie -------------------------------- */
  $$('.tile:not(.tile--ig)').forEach((tile) => {
    const img = $('img', tile), curtain = $('.tile__curtain', tile);
    if (reduce) return;
    gsap.set(img, { scale: 1.4 });
    const reveal = gsap.timeline({ paused: true });
    reveal.to(curtain, { scaleX: 0, duration: 1.3, ease: 'expo.inOut' }, 0).to(img, { scale: 1, duration: 1.8, ease: 'expo.out' }, 0.1);
    ScrollTrigger.create({ trigger: tile, start: 'top 88%', once: true, onEnter: () => reveal.play() });
    gsap.fromTo(img, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: tile, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  gsap.from('.tile--ig', { y: 60, autoAlpha: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.tile--ig', start: 'top 92%', once: true } });

  /* ---------------------- Inclinaison 3D (tilt) & reflet ---------------------- */
  if (finePointer && !reduce) {
    $$('[data-tilt]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--ry', `${((px - 0.5) * 10).toFixed(2)}deg`);
        el.style.setProperty('--rx', `${((0.5 - py) * 8).toFixed(2)}deg`);
        el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
        el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
      });
      el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });

    // Boutons magnétiques
    $$('.magnetic').forEach((el) => {
      const inner = el.firstElementChild;
      const bx = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' }), by = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
      const ix = inner && gsap.quickTo(inner, 'x', { duration: 0.6, ease: 'power3' }), iy = inner && gsap.quickTo(inner, 'y', { duration: 0.6, ease: 'power3' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        bx(dx * 0.28); by(dy * 0.36);
        inner && (ix(dx * 0.14), iy(dy * 0.18));
      });
      el.addEventListener('pointerleave', () => { bx(0); by(0); inner && (ix(0), iy(0)); });
    });

    // Curseur "grain de beauté"
    const cur = $('.cursor');
    const cx = gsap.quickTo(cur, 'x', { duration: 0.35, ease: 'power3' }), cy = gsap.quickTo(cur, 'y', { duration: 0.35, ease: 'power3' });
    addEventListener('pointermove', (e) => { cur.classList.add('is-on'); cx(e.clientX); cy(e.clientY); }, { passive: true });
    document.addEventListener('pointerover', (e) => { cur.classList.toggle('is-hover', !!e.target.closest('a,button,[data-tilt],summary,label,input')); });
    document.addEventListener('mouseleave', () => cur.classList.remove('is-on'));
  }

  /* --------------------------- Avis : carrousel --------------------------- */
  (function reviews() {
    const view = $('#revView'), track = $('#revTrack');
    if (!view || !track) return;
    const items = $$('.rev', track), bar = $('.reviews__bar i'), count = $('#revCount');
    let i = 0, timer = null, paused = false, visible = false, drag = null;
    const target = (k) => { const it = items[k]; return -(it.offsetLeft - (view.clientWidth - it.offsetWidth) / 2); };
    function go(k, instant) {
      i = (k + items.length) % items.length;
      items.forEach((it, n) => it.classList.toggle('is-active', n === i));
      count.textContent = `${i + 1} / ${items.length}`;
      gsap.to(track, { x: target(i), duration: instant || reduce ? 0 : 1, ease: 'power3.out', overwrite: true });
      restart();
    }
    function restart() {
      timer && timer.kill();
      gsap.set(bar, { scaleX: 0 });
      if (reduce) return;
      timer = gsap.to(bar, { scaleX: 1, duration: 7, ease: 'none', paused: paused || !visible, onComplete: () => go(i + 1) });
    }
    const setPaused = (p) => { paused = p; timer && (paused || !visible ? timer.pause() : timer.play()); };
    $('#revNext').addEventListener('click', () => go(i + 1));
    $('#revPrev').addEventListener('click', () => go(i - 1));
    view.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
    });
    view.addEventListener('mouseenter', () => setPaused(true));
    view.addEventListener('mouseleave', () => setPaused(false));
    view.addEventListener('focusin', () => setPaused(true));
    view.addEventListener('focusout', () => setPaused(false));

    // Glisser avec la souris ou le doigt
    view.addEventListener('pointerdown', (e) => {
      if (e.target.closest('summary')) return;
      drag = { x: e.clientX, tx: gsap.getProperty(track, 'x'), moved: false };
      timer && timer.pause();
    });
    addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 6) drag.moved = true;
      if (drag.moved) gsap.set(track, { x: drag.tx + dx });
    });
    addEventListener('pointerup', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, moved = drag.moved;
      drag = null;
      if (moved && Math.abs(dx) > 60) go(i + (dx < 0 ? 1 : -1));
      else go(i, false);
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => { visible = es[0].isIntersecting; timer && (paused || !visible ? timer.pause() : timer.play()); }, { threshold: 0.35 }).observe(view);
    }
    addEventListener('resize', () => gsap.set(track, { x: target(i) }));
    go(0, true);
    if (!reduce) {
      gsap.from('.rating b', { y: 50, autoAlpha: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.rating', start: 'top 92%', once: true } });
      gsap.from('.rating__stars svg', { scale: 0, rotate: -90, duration: 0.8, stagger: 0.1, ease: 'back.out(3)', scrollTrigger: { trigger: '.rating', start: 'top 92%', once: true } });
    }
  })();

  /* --------------------- Footer : lettres géantes qui vibrent --------------------- */
  if (!reduce && finePointer) {
    $$('.footer__giant .c').forEach((c) => {
      c.addEventListener('pointerenter', () => gsap.fromTo(c, { yPercent: 0 }, { yPercent: -9, duration: 0.35, ease: 'power2.out', yoyo: true, repeat: 1 }));
    });
  }

  /* --------------------------------- Départ --------------------------------- */
  addEventListener('load', () => ScrollTrigger.refresh());
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => ScrollTrigger.refresh());
  runLoader();
})();
