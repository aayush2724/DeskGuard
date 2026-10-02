/**
 * app.js — DeskGuard marketing site interactions
 * GSAP-powered entrance animations, scroll reveals, counter roll-ups,
 * accessible mobile nav, and the contact form.
 *
 * GSAP is optional: every animation is guarded so the page is fully
 * usable (content visible, nav working) even if the vendor script fails.
 */

(function () {
  'use strict';

  const CONFIG = window.DESKGUARD_CONFIG || {};
  const API_BASE = (CONFIG.apiBase || '').replace(/\/$/, '') || '/api';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = typeof window.gsap !== 'undefined';
  const hasScrollTrigger = hasGsap && typeof window.ScrollTrigger !== 'undefined';

  /* ── Reveal everything immediately when animations can't run ── */
  function revealAll() {
    document.querySelectorAll('[data-reveal], .hero-badge, .hero-sub, .hero-actions, .hero-stats, .floor-preview, .hero-headline .line')
      .forEach(el => {
        el.style.opacity = '1';
        el.style.transform = 'none';
        el.classList.add('revealed');
      });
    document.querySelectorAll('.feature-list li').forEach(li => { li.style.opacity = '1'; li.style.transform = 'none'; });
  }
  if (!hasGsap || reduceMotion) revealAll();

  if (hasScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  /* ── Footer year ─────────────────────────────────────── */
  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });

  /* ── Contact email (only rendered when configured) ───── */
  const email = (CONFIG.contactEmail || '').trim();
  if (email) {
    const block = document.getElementById('contactEmailBlock');
    const link = document.getElementById('contactEmailLink');
    if (block && link) { link.href = 'mailto:' + email; link.textContent = email; block.hidden = false; }
    document.querySelectorAll('[data-contact-email-or-form]').forEach(el => {
      const a = document.createElement('a');
      a.href = 'mailto:' + email; a.textContent = email;
      el.replaceChildren(a);
    });
  }

  /* ── Nav scroll state ────────────────────────────────── */
  const nav = document.getElementById('nav');
  if (nav) {
    const syncNav = () => nav.classList.toggle('scrolled', window.scrollY > 20);
    window.addEventListener('scroll', syncNav, { passive: true });
    syncNav();
  }

  /* ── Mobile nav (accessible) ─────────────────────────── */
  const hamburger = document.querySelector('.nav-hamburger');
  const navLinks = document.getElementById('nav-links');
  let mobileOpen = false;
  function setMobileNav(open) {
    mobileOpen = open;
    document.body.classList.toggle('nav-mobile-open', open);
    if (hamburger) {
      hamburger.setAttribute('aria-expanded', String(open));
      hamburger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
  }
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      setMobileNav(!mobileOpen);
      if (mobileOpen) {
        const first = navLinks.querySelector('a');
        if (first) first.focus();
      }
    });
    navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMobileNav(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileOpen) { setMobileNav(false); hamburger.focus(); }
    });
    // Close the overlay if the viewport grows past the mobile breakpoint
    const mq = window.matchMedia('(min-width: 861px)');
    mq.addEventListener('change', (e) => { if (e.matches && mobileOpen) setMobileNav(false); });
  }

  /* ── Hero entrance sequence ──────────────────────────── */
  if (hasGsap && !reduceMotion && document.querySelector('.hero-headline')) {
    const tl = gsap.timeline({ delay: 0.15 });
    tl.to('.hero-headline .line', { y: 0, duration: 1.1, stagger: 0.12, ease: 'power4.out' });
    tl.to('.hero-badge', { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, '-=0.7');
    tl.to(['.hero-sub', '.hero-actions', '.hero-stats'], { opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out' }, '-=0.4');
    tl.to('.floor-preview', { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: 'power3.out' }, '-=0.5');
  }

  /* ── Counter roll-up ─────────────────────────────────── */
  function animateCounter(el) {
    const target = parseInt(el.dataset.count, 10);
    if (isNaN(target)) return;
    if (target === 0 || !hasGsap || reduceMotion) { el.textContent = String(target); return; }
    gsap.fromTo(el, { innerText: 0 }, {
      innerText: target, duration: 1.8, ease: 'power2.out', snap: { innerText: 1 }, delay: 1.2,
      onUpdate() { el.innerText = Math.round(parseFloat(el.innerText)); },
    });
  }
  document.querySelectorAll('.stat-num[data-count]').forEach(animateCounter);

  /* ── Generic scroll reveal ───────────────────────────── */
  if (hasScrollTrigger && !reduceMotion) {
    document.querySelectorAll('[data-reveal]').forEach(el => {
      const delay = parseFloat(el.dataset.revealDelay || 0) / 1000;
      ScrollTrigger.create({
        trigger: el, start: 'top 88%', once: true,
        onEnter() {
          gsap.to(el, { opacity: 1, y: 0, x: 0, scale: 1, duration: 0.75, delay, ease: 'power3.out' });
          el.classList.add('revealed');
        },
      });
    });
    document.querySelectorAll('.feature-list li').forEach((li, i) => {
      ScrollTrigger.create({
        trigger: li, start: 'top 90%', once: true,
        onEnter() { gsap.to(li, { opacity: 1, x: 0, duration: 0.6, delay: i * 0.1, ease: 'power3.out' }); },
      });
    });
    // Safety net: anything still hidden after load becomes visible (e.g. pinned sections that never trigger)
    window.addEventListener('load', () => setTimeout(() => {
      document.querySelectorAll('[data-reveal]:not(.revealed)').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight) { el.style.opacity = '1'; el.style.transform = 'none'; el.classList.add('revealed'); }
      });
    }, 1500));
  }

  /* ── How It Works: vertical-to-horizontal scroller ───── */
  const howSection = document.getElementById('how');
  const howCards = document.getElementById('howCards');
  const howAvatar = document.getElementById('howAvatar');
  const howProgress = document.getElementById('howTrackProgress');
  const howTrack = document.querySelector('.how-track');

  if (howSection && howCards && howAvatar && howProgress && howTrack && hasScrollTrigger) {
    const cards = howCards.querySelectorAll('.how-card');
    const totalCards = cards.length;
    const mm = gsap.matchMedia();

    // Desktop: pinned vertical scroll drives horizontal scroll (skipped for reduced motion)
    mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
      gsap.set(howCards, { clearProps: 'all' });
      gsap.set(howAvatar, { clearProps: 'all' });
      gsap.set(howProgress, { clearProps: 'all' });

      const howTimeline = gsap.timeline({
        scrollTrigger: {
          trigger: '#how', pin: true, scrub: 0.5, start: 'top top',
          end: () => `+=${howCards.scrollWidth + 100}`,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const progress = self.progress;
            gsap.set(howAvatar, { left: `${progress * 100}%` });
            gsap.set(howProgress, { width: `${progress * 100}%` });
            const activeIdx = Math.min(totalCards - 1, Math.floor(progress * totalCards * 0.999));
            cards.forEach((card, idx) => card.classList.toggle('active', idx === activeIdx));
          },
        },
      });
      howTimeline.to(howCards, {
        x: () => { const amount = howCards.scrollWidth - window.innerWidth + 200; return amount > 0 ? -amount : 0; },
        ease: 'none',
      });

      const handlers = [];
      cards.forEach((card, idx) => {
        const handler = () => {
          const trigger = howTimeline.scrollTrigger;
          if (!trigger) return;
          const targetScroll = trigger.start + (idx / (totalCards - 1)) * (trigger.end - trigger.start);
          window.scrollTo({ top: targetScroll, behavior: 'smooth' });
        };
        card.addEventListener('click', handler);
        handlers.push(handler);
      });
      return () => cards.forEach((card, idx) => card.removeEventListener('click', handlers[idx]));
    });

    // Mobile (or reduced motion): native horizontal scroll
    mm.add('(max-width: 767px), (prefers-reduced-motion: reduce)', () => {
      gsap.set(howCards, { clearProps: 'all' });
      gsap.set(howAvatar, { left: '0%' });
      gsap.set(howProgress, { width: '0%' });

      function updateMobileScroll() {
        const maxScroll = howCards.scrollWidth - howCards.clientWidth;
        const ratio = maxScroll > 0 ? howCards.scrollLeft / maxScroll : 0;
        gsap.set(howAvatar, { left: `${ratio * 100}%` });
        gsap.set(howProgress, { width: `${ratio * 100}%` });
        const cardWidth = 280 + 20;
        const activeIdx = Math.min(totalCards - 1, Math.round(howCards.scrollLeft / cardWidth));
        cards.forEach((card, idx) => card.classList.toggle('active', idx === activeIdx));
      }
      howCards.addEventListener('scroll', updateMobileScroll, { passive: true });
      const handlers = [];
      cards.forEach((card, idx) => {
        const handler = () => howCards.scrollTo({ left: idx * 300, behavior: 'smooth' });
        card.addEventListener('click', handler);
        handlers.push(handler);
      });
      updateMobileScroll();
      return () => {
        howCards.removeEventListener('scroll', updateMobileScroll);
        cards.forEach((card, idx) => card.removeEventListener('click', handlers[idx]));
      };
    });
  }

  /* ── Sticky mobile CTA (landing page only) ───────────── */
  const mobileCta = document.getElementById('mobileCta');
  const hero = document.getElementById('hero');
  if (mobileCta && hero) {
    const mqMobile = window.matchMedia('(max-width: 600px)');
    const update = () => {
      const heroBottom = hero.getBoundingClientRect().bottom;
      const show = mqMobile.matches && heroBottom < 80 && !mobileOpen;
      mobileCta.hidden = !show;
      document.body.classList.toggle('has-mobile-cta', show);
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    if (hamburger) hamburger.addEventListener('click', update);
    update();
  }

  /* ── Contact form ────────────────────────────────────── */
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    const status = document.getElementById('contactStatus');
    const submitBtn = document.getElementById('contactSubmit');
    const success = document.getElementById('contactSuccess');
    const fields = {
      name: contactForm.elements.name,
      email: contactForm.elements.email,
      message: contactForm.elements.message,
    };
    let submitting = false;

    // Pre-fill from the landing page CTA (/contact?email=…)
    try {
      const prefill = new URLSearchParams(window.location.search).get('email');
      if (prefill && fields.email && !fields.email.value) {
        fields.email.value = prefill;
        (fields.name || fields.email).focus();
      }
    } catch { /* ignore */ }

    function setError(input, message) {
      const err = document.getElementById(input.id + '-error');
      if (!err) return;
      if (message) {
        err.textContent = message; err.hidden = false;
        input.setAttribute('aria-invalid', 'true');
      } else {
        err.textContent = ''; err.hidden = true;
        input.removeAttribute('aria-invalid');
      }
    }

    function validate() {
      let firstInvalid = null;
      const name = fields.name.value.trim();
      const em = fields.email.value.trim();
      const msg = fields.message ? fields.message.value.trim() : '';

      if (!name) { setError(fields.name, 'Please enter your name.'); firstInvalid = firstInvalid || fields.name; }
      else if (name.length > 120) { setError(fields.name, 'Name must be 120 characters or fewer.'); firstInvalid = firstInvalid || fields.name; }
      else setError(fields.name, '');

      if (!em) { setError(fields.email, 'Please enter your email address.'); firstInvalid = firstInvalid || fields.email; }
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em) || em.length > 254) { setError(fields.email, 'Please enter a valid email address, like name@university.edu.'); firstInvalid = firstInvalid || fields.email; }
      else setError(fields.email, '');

      if (fields.message) {
        if (msg.length > 2000) { setError(fields.message, 'Message must be 2000 characters or fewer.'); firstInvalid = firstInvalid || fields.message; }
        else setError(fields.message, '');
      }
      return firstInvalid;
    }

    [fields.name, fields.email, fields.message].forEach(f => {
      if (!f) return;
      f.addEventListener('input', () => { if (f.getAttribute('aria-invalid')) validate(); });
    });

    function setStatus(text, kind) {
      if (!status) return;
      status.textContent = text;
      status.className = 'form-status' + (kind ? ' ' + kind : '');
    }

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submitting) return;
      const invalid = validate();
      if (invalid) { setStatus('Please fix the highlighted fields.', 'error'); invalid.focus(); return; }

      submitting = true;
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
      const originalLabel = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span>Sending…</span>';
      setStatus('Sending your message…', '');

      const payload = {
        name: fields.name.value.trim(),
        email: fields.email.value.trim(),
        institution: (contactForm.elements.institution.value || '').trim(),
        floors: contactForm.elements.floors.value,
        message: fields.message ? fields.message.value.trim() : '',
        website: (contactForm.elements.website && contactForm.elements.website.value) || '',
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000); // Render free tier can take ~30s to wake

      try {
        const res = await fetch(`${API_BASE}/contact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        let data = {};
        try { data = await res.json(); } catch { /* non-JSON body */ }

        if (res.ok) {
          contactForm.hidden = true;
          success.hidden = false;
          success.focus();
          setStatus('', '');
          return;
        }
        if (res.status === 400 && data && data.fields) {
          Object.entries(data.fields).forEach(([key, msg]) => { if (fields[key]) setError(fields[key], msg); });
          setStatus('Please fix the highlighted fields.', 'error');
        } else if (res.status === 429) {
          setStatus('Too many messages were sent from your connection. Please wait a minute and try again.', 'error');
        } else {
          setStatus(fallbackMessage(), 'error');
        }
      } catch {
        setStatus(fallbackMessage(), 'error');
      } finally {
        clearTimeout(timeout);
        submitting = false;
        submitBtn.disabled = false;
        submitBtn.removeAttribute('aria-busy');
        submitBtn.innerHTML = originalLabel;
      }
    });

    function fallbackMessage() {
      return email
        ? `We couldn't send your message right now. Please try again in a moment, or email us directly at ${email}.`
        : "We couldn't send your message right now. Please try again in a moment.";
    }
  }

  /* ── Subtle parallax on hero headline ────────────────── */
  if (hasGsap && !reduceMotion && window.matchMedia('(min-width: 960px)').matches) {
    const heroContent = document.querySelector('.hero-content');
    if (heroContent) {
      window.addEventListener('scroll', () => {
        const y = window.scrollY;
        if (y < window.innerHeight) gsap.set(heroContent, { y: y * 0.12 });
      }, { passive: true });
    }
  }

})();
