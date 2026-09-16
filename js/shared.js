(() => {
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
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });

        navLinks.forEach((link) => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
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
