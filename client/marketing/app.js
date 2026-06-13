/**
 * app.js — DeskGuard interactive UI
 * GSAP-powered entrance animations, scroll reveals,
 * animated floor map, counter roll-ups, mobile nav
 */

(function () {
  'use strict';

  /* ── GSAP setup ──────────────────────────────────────── */
  gsap.registerPlugin(ScrollTrigger);

  /* ── Nav scroll state ────────────────────────────────── */
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  /* ── Hero entrance sequence ──────────────────────────── */
  const tl = gsap.timeline({ delay: 0.15 });

  // Lines slide up one by one
  tl.to('.hero-headline .line', {
    y: 0,
    duration: 1.1,
    stagger: 0.12,
    ease: 'power4.out',
  });

  // Badge fades in
  tl.to('.hero-badge', {
    opacity: 1,
    y: 0,
    duration: 0.7,
    ease: 'power3.out',
  }, '-=0.7');

  // Sub, actions, stats
  tl.to(['.hero-sub', '.hero-actions', '.hero-stats'], {
    opacity: 1,
    y: 0,
    duration: 0.7,
    stagger: 0.1,
    ease: 'power3.out',
  }, '-=0.4');

  // Floor preview
  tl.to('.floor-preview', {
    opacity: 1,
    y: 0,
    scale: 1,
    duration: 0.9,
    ease: 'power3.out',
  }, '-=0.5');

  /* ── Counter roll-up (fires when hero-stats visible) ── */
  function animateCounter(el) {
    const target = parseInt(el.dataset.count, 10);
    if (isNaN(target) || target === 0) return;
    gsap.fromTo(el,
      { innerText: 0 },
      {
        innerText: target,
        duration: 1.8,
        ease: 'power2.out',
        snap: { innerText: 1 },
        delay: 1.2,
        onUpdate() {
          el.innerText = Math.round(parseFloat(el.innerText));
        },
      }
    );
  }
  document.querySelectorAll('.stat-num[data-count]').forEach(animateCounter);

  /* ── Generic scroll reveal ───────────────────────────── */
  document.querySelectorAll('[data-reveal]').forEach(el => {
    const delay = parseFloat(el.dataset.revealDelay || 0) / 1000;
    ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter() {
        gsap.to(el, {
          opacity: 1,
          y: 0,
          x: 0,
          scale: 1,
          duration: 0.75,
          delay,
          ease: 'power3.out',
        });
        el.classList.add('revealed');
      },
    });
  });

  /* ── Feature list items (translateX) ─────────────────── */
  document.querySelectorAll('.feature-list li').forEach((li, i) => {
    ScrollTrigger.create({
      trigger: li,
      start: 'top 90%',
      once: true,
      onEnter() {
        gsap.to(li, {
          opacity: 1,
          x: 0,
          duration: 0.6,
          delay: i * 0.1,
          ease: 'power3.out',
        });
      },
    });
  });

  /* ── How It Works: vertical-to-horizontal GSAP scroller ── */
  const howSection = document.getElementById('how');
  const howCards = document.getElementById('howCards');
  const howAvatar = document.getElementById('howAvatar');
  const howProgress = document.getElementById('howTrackProgress');
  const howTrack = document.querySelector('.how-track');

  if (howSection && howCards && howAvatar && howProgress && howTrack) {
    const cards = howCards.querySelectorAll('.how-card');
    const totalCards = cards.length;

    let mm = gsap.matchMedia();

    // Desktop: Pinned vertical scroll drives horizontal scroll
    mm.add("(min-width: 768px)", () => {
      // Reset any mobile touch styling/handlers
      gsap.set(howCards, { clearProps: "all" });
      gsap.set(howAvatar, { clearProps: "all" });
      gsap.set(howProgress, { clearProps: "all" });

      const howTimeline = gsap.timeline({
        scrollTrigger: {
          trigger: '#how',
          pin: true,
          scrub: 0.5,
          start: 'top top',
          end: () => `+=${howCards.scrollWidth + 100}`,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const progress = self.progress;

            // Move avatar along the track line (0% to 100%)
            gsap.set(howAvatar, { left: `${progress * 100}%` });

            // Fill progress bar (0% to 100%)
            gsap.set(howProgress, { width: `${progress * 100}%` });

            // Determine active card based on scroll progress
            const activeIdx = Math.min(totalCards - 1, Math.floor(progress * totalCards * 0.999));
            cards.forEach((card, idx) => {
              card.classList.toggle('active', idx === activeIdx);
            });
          }
        }
      });

      // Translate cards horizontally to the left
      howTimeline.to(howCards, {
        x: () => {
          const amount = howCards.scrollWidth - window.innerWidth + 200;
          return amount > 0 ? -amount : 0;
        },
        ease: 'none',
      });

      // Click cards to scroll the window to their corresponding scrollTrigger position
      const desktopHandlers = [];
      cards.forEach((card, idx) => {
        const handler = () => {
          const trigger = howTimeline.scrollTrigger;
          if (!trigger) return;
          const start = trigger.start;
          const end = trigger.end;
          const scrollRange = end - start;
          const targetScroll = start + (idx / (totalCards - 1)) * scrollRange;
          window.scrollTo({
            top: targetScroll,
            behavior: 'smooth'
          });
        };
        card.addEventListener('click', handler);
        desktopHandlers.push(handler);
      });

      return () => {
        // Cleanup desktop click handlers on responsive breakpoint switch
        cards.forEach((card, idx) => {
          card.removeEventListener('click', desktopHandlers[idx]);
        });
      };
    });

    // Mobile: Touch scroll scroller
    mm.add("(max-width: 767px)", () => {
      // Clear desktop translation styles
      gsap.set(howCards, { clearProps: "all" });
      gsap.set(howAvatar, { left: "0%" });
      gsap.set(howProgress, { width: "0%" });

      function updateMobileScroll() {
        const scrollLeft = howCards.scrollLeft;
        const maxScroll = howCards.scrollWidth - howCards.clientWidth;
        const ratio = maxScroll > 0 ? scrollLeft / maxScroll : 0;

        gsap.set(howAvatar, { left: `${ratio * 100}%` });
        gsap.set(howProgress, { width: `${ratio * 100}%` });

        const cardWidth = 280 + 20; // card width + gap
        const activeIdx = Math.min(totalCards - 1, Math.round(scrollLeft / cardWidth));
        cards.forEach((card, idx) => {
          card.classList.toggle('active', idx === activeIdx);
        });
      }

      howCards.addEventListener('scroll', updateMobileScroll, { passive: true });

      const mobileHandlers = [];
      cards.forEach((card, idx) => {
        const handler = () => {
          const cardWidth = 280 + 20;
          howCards.scrollTo({ left: idx * cardWidth, behavior: 'smooth' });
        };
        card.addEventListener('click', handler);
        mobileHandlers.push(handler);
      });

      // Initialize positions
      updateMobileScroll();

      return () => {
        // Cleanup mobile listeners
        howCards.removeEventListener('scroll', updateMobileScroll);
        cards.forEach((card, idx) => {
          card.removeEventListener('click', mobileHandlers[idx]);
        });
      };
    });
  }

  /* ── Mobile nav ───────────────────────────────────────── */
  const hamburger = document.querySelector('.nav-hamburger');
  let mobileOpen = false;
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      mobileOpen = !mobileOpen;
      document.body.classList.toggle('nav-mobile-open', mobileOpen);
      hamburger.setAttribute('aria-expanded', mobileOpen);
    });
    document.querySelectorAll('.nav-links a').forEach(a => {
      a.addEventListener('click', () => {
        mobileOpen = false;
        document.body.classList.remove('nav-mobile-open');
      });
    });
  }

  /* ── CTA form ─────────────────────────────────────────── */
  const ctaInput  = document.querySelector('.cta-input');
  const ctaButton = document.querySelector('.cta-section .btn-primary');
  if (ctaButton && ctaInput) {
    ctaButton.addEventListener('click', () => {
      const email = ctaInput.value.trim();
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!valid) {
        gsap.to(ctaInput, {
          x: [-6, 6, -5, 5, -3, 3, 0],
          duration: 0.4,
          ease: 'none',
        });
        ctaInput.style.borderColor = '#f87171';
        setTimeout(() => { ctaInput.style.borderColor = ''; }, 1200);
        return;
      }
      ctaButton.textContent = "✓ You're on the list";
      ctaButton.style.background = '#166534';
      ctaButton.style.pointerEvents = 'none';
      ctaInput.value = '';
    });
  }

  /* ── Contact form (contact.html) ─────────────────────── */
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const success = document.getElementById('contactSuccess');
      gsap.to(contactForm, {
        opacity: 0,
        y: -8,
        duration: 0.3,
        onComplete: () => {
          contactForm.style.display = 'none';
          success.classList.add('visible');
          gsap.fromTo(success, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4 });
        },
      });
    });
  }

  /* ── Subtle parallax on hero headline ────────────────── */
  if (window.matchMedia('(min-width: 960px)').matches) {
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      const heroContent = document.querySelector('.hero-content');
      if (heroContent && y < window.innerHeight) {
        gsap.set(heroContent, { y: y * 0.12 });
      }
    }, { passive: true });
  }

})();
