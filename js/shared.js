(() => {
    const isHomePage = document.body.classList.contains('home-page');
    if (isHomePage) {
        window.history.scrollRestoration = 'manual';
        window.scrollTo(0, 0);
        window.addEventListener('pageshow', () => window.scrollTo(0, 0));
    }

    const { pathname, search, hash } = window.location;
    if (pathname.endsWith('.html')) {
        const normalizedPath = pathname.endsWith('/index.html')
            ? pathname.slice(0, -'index.html'.length)
            : `${pathname.slice(0, -'.html'.length)}/`;
        window.history.replaceState({}, '', `${normalizedPath}${search}${hash}`);
    }

    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('navMenu');
    const navLinks = document.querySelectorAll('.nav-link');

    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            const isOpen = hamburger.classList.toggle('active');
            navMenu.classList.toggle('active', isOpen);
            hamburger.setAttribute('aria-expanded', String(isOpen));
            hamburger.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
        });

        navLinks.forEach((link) => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
                hamburger.setAttribute('aria-expanded', 'false');
                hamburger.setAttribute('aria-label', 'Open navigation');
            });
        });
    }

    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', function (event) {
            const targetSelector = this.getAttribute('href');
            if (!targetSelector || targetSelector.length <= 1) {
                return;
            }

            const target = document.querySelector(targetSelector);
            if (!target) {
                return;
            }

            event.preventDefault();
            if (isHomePage && targetSelector === '#home') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }

            target.scrollIntoView({ behavior: 'smooth' });
        });
    });

    const galleryImages = document.querySelectorAll('.gallery-item img, .gallery-card img');

    galleryImages.forEach((img) => {
        const container = img.closest('.gallery-item, .gallery-card');

        img.classList.add('lazy-fade-image');
        img.decoding = 'async';

        if (!img.hasAttribute('loading')) {
            img.setAttribute('loading', 'lazy');
        }

        if (container) {
            container.classList.add('is-loading');
        }

        const markLoaded = () => {
            img.classList.add('is-loaded');
            if (container) {
                container.classList.remove('is-loading');
                container.classList.add('is-loaded');
            }
        };

        const revealWhenDecoded = () => {
            if (typeof img.decode === 'function') {
                img.decode()
                    .catch(() => {})
                    .finally(markLoaded);
                return;
            }

            markLoaded();
        };

        if (img.complete && img.naturalWidth > 0) {
            requestAnimationFrame(revealWhenDecoded);
            return;
        }

        img.addEventListener('load', revealWhenDecoded, { once: true });
        img.addEventListener('error', markLoaded, { once: true });
    });

    const navbar = document.querySelector('.navbar');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (navbar) {
        const hideAfter = 80;
        const minDelta = 6;
        let lastY = Math.max(0, window.scrollY);
        let frame = null;

        const setHidden = (hidden) => navbar.classList.toggle('navbar--hidden', hidden);
        const navPinned = () => Boolean(navMenu?.classList.contains('active')) || (navbar.contains(document.activeElement) && document.activeElement.matches(":focus-visible"));

        const updateNavbar = () => {
            frame = null;
            const y = Math.max(0, window.scrollY);
            const delta = y - lastY;

            if (y <= hideAfter || navPinned()) {
                setHidden(false);
            } else if (Math.abs(delta) >= minDelta) {
                setHidden(delta > 0);
            } else {
                return;
            }

            lastY = y;
        };

        window.addEventListener('scroll', () => {
            if (frame === null) {
                frame = requestAnimationFrame(updateNavbar);
            }
        }, { passive: true });
        navbar.addEventListener('focusin', () => { if (navPinned()) setHidden(false); });
    }

    const supportsSmoothWheel = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (supportsSmoothWheel && !prefersReducedMotion) {
        const ease = 0.14;
        const lineHeight = 40;
        let target = window.scrollY;
        let current = target;
        let frame = null;
        let lastTime = 0;

        const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const clamp = (value) => Math.min(Math.max(value, 0), maxScroll());
        const isMouseWheel = (event) => event.deltaMode !== 0
            || (typeof event.wheelDeltaY === 'number' && event.wheelDeltaY !== 0 && event.wheelDeltaY % 120 === 0);
        const shouldIgnore = (event) => event.ctrlKey
            || event.defaultPrevented
            || document.body.style.overflow === 'hidden'
            || Math.abs(event.deltaX) > Math.abs(event.deltaY)
            || Boolean(event.target.closest?.('textarea, select, [data-native-scroll]'));

        const step = (time) => {
            const dt = Math.min(time - lastTime, 50);
            lastTime = time;
            const remaining = target - current;

            if (Math.abs(remaining) < 0.4) {
                current = target;
                window.scrollTo(0, current);
                frame = null;
                return;
            }

            current += remaining * (1 - Math.pow(1 - ease, dt / 16.67));
            window.scrollTo(0, current);
            frame = requestAnimationFrame(step);
        };

        window.addEventListener('wheel', (event) => {
            if (shouldIgnore(event) || !isMouseWheel(event)) {
                return;
            }

            event.preventDefault();
            if (frame === null) {
                current = window.scrollY;
                target = current;
                lastTime = performance.now();
            }

            const delta = event.deltaMode === 1 ? event.deltaY * lineHeight : event.deltaY;
            target = clamp(target + delta);
            if (frame === null) {
                frame = requestAnimationFrame(step);
            }
        }, { passive: false });

        window.addEventListener('scroll', () => {
            if (frame !== null && Math.abs(window.scrollY - current) > 2) {
                cancelAnimationFrame(frame);
                frame = null;
            }

            if (frame === null) {
                current = window.scrollY;
                target = current;
            }
        }, { passive: true });
    }
})();
