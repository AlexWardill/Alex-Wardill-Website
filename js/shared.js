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
})();
