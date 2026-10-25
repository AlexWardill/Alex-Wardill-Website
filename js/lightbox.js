(() => {
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightbox-image');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const lightboxSection = document.getElementById('lightbox-section');
    const lightboxLocation = document.getElementById('lightbox-location');

    const closeButton = document.querySelector('.lightbox-close');
    const nextButton = document.querySelector('.lightbox-next');
    const prevButton = document.querySelector('.lightbox-prev');

    if (!lightbox || !lightboxImage || !lightboxCaption || !lightboxSection || !lightboxLocation) {
        return;
    }

    const lightboxContent = lightbox.querySelector('.lightbox-content');
    const icon = (path) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg>';
    if (closeButton) closeButton.innerHTML = icon('M6 6l12 12M18 6L6 18');
    if (prevButton) {
        prevButton.innerHTML = icon('M15 18l-6-6 6-6');
        lightboxContent?.insertBefore(prevButton, lightboxImage);
    }
    if (nextButton) {
        nextButton.innerHTML = icon('M9 6l6 6-6 6');
        lightboxContent?.appendChild(nextButton);
    }
    const lightboxCounter = document.createElement('p');
    lightboxCounter.className = 'lightbox-counter';
    lightboxCounter.setAttribute('aria-live', 'polite');
    lightbox.appendChild(lightboxCounter);
    lightboxImage.draggable = false;

    const loadedSources = new Set();
    const preload = (src) => {
        if (!src || loadedSources.has(src)) {
            return Promise.resolve();
        }
        const image = new Image();
        image.src = src;
        return image.decode().then(() => loadedSources.add(src)).catch(() => {});
    };

    let currentIndex = 0;
    let galleryItems = Array.from(document.querySelectorAll('.gallery-item img'));
    let imageData = {};
    const getFullSizeSrc = (image) => image.getAttribute('data-full-src') || image.currentSrc || image.src;

    const sectionDisplayNames = {
        photography: 'Photography',
        gigs: 'Gigs',
        portraits: 'Portraits',
        siena: 'Siena',
        other: 'Other',
        events: 'Events',
        photoshoot: 'Photos'
    };

    const detectGallerySlug = () => {
        const pagePath = window.location.pathname.replace(/\/+$/, '');
        const match = pagePath.match(/\/gallery-([^/]+)\/?$/i);
        if (match) {
            return match[1];
        }

        return '';
    };

    const loadJson = async (url) => {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`${url} request failed with status ${response.status}.`);
        }
        return response.json();
    };

    const appendCmsGalleryImages = (cmsData) => {
        const cmsGalleryImages = Array.isArray(cmsData?.galleryImages) ? cmsData.galleryImages : [];
        if (!cmsGalleryImages.length) {
            return;
        }

        const gallerySlug = detectGallerySlug();
        const grid = document.querySelector('.gallery-grid');
        if (!grid || !gallerySlug) {
            return;
        }

        const existingSrcs = new Set(galleryItems.map((item) => item.getAttribute('src')));

        cmsGalleryImages
            .filter((entry) => (entry.gallery || '').toLowerCase() === gallerySlug.toLowerCase())
            .forEach((entry) => {
                const src = entry.src || entry.image || '';
                if (!src || existingSrcs.has(src)) {
                    return;
                }

                const wrapper = document.createElement('div');
                wrapper.className = 'gallery-item';
                const image = document.createElement('img');
                image.src = src;
                image.alt = entry.caption || 'Gallery image';
                image.loading = 'lazy';
                image.setAttribute('data-caption', entry.caption || '');
                image.setAttribute('data-section', gallerySlug);
                wrapper.appendChild(image);
                grid.appendChild(wrapper);
                existingSrcs.add(src);
            });

        galleryItems = Array.from(document.querySelectorAll('.gallery-item img'));
    };

    const imageDataRequest = loadJson('image_data.json').catch((error) => {
        console.warn('Unable to load photo captions.', error);
        return {};
    });
    const gallerySlug = detectGallerySlug();
    const cmsDataRequest = gallerySlug
        ? loadJson('data/cms-content.json').catch((error) => {
            console.warn('Unable to load CMS gallery images.', error);
            return {};
        })
        : Promise.resolve({});

    const showImageAtIndex = (index) => {
        currentIndex = index;
        const currentImage = galleryItems[currentIndex];
        if (!currentImage) {
            return;
        }

        const section = currentImage.getAttribute('data-section') || '';
        const imageSrc = getFullSizeSrc(currentImage);
        const imageName = currentImage.getAttribute('data-name') || decodeURIComponent(imageSrc.split('/').pop() || '');
        const dataSection = section === 'photography' ? 'photography' : section;
        const matchingData = imageData[dataSection]
            || Object.values(imageData).find((sectionData) => sectionData && sectionData[imageName]);

        const shownSrc = loadedSources.has(imageSrc) ? imageSrc : (currentImage.currentSrc || currentImage.src);
        lightboxImage.src = shownSrc;
        if (shownSrc !== imageSrc) {
            preload(imageSrc).then(() => {
                if (currentIndex === index && lightbox.classList.contains('active')) {
                    lightboxImage.src = imageSrc;
                }
            });
        }
        lightboxImage.alt = currentImage.alt || 'Photo';
        lightboxCounter.textContent = (index + 1) + ' / ' + galleryItems.length;
        const hasMultiple = galleryItems.length > 1;
        if (prevButton) prevButton.hidden = !hasMultiple;
        if (nextButton) nextButton.hidden = !hasMultiple;
        [1, -1, 2].forEach((offset) => {
            const neighbour = galleryItems[(index + offset + galleryItems.length) % galleryItems.length];
            if (neighbour) preload(getFullSizeSrc(neighbour));
        });
        lightboxCaption.textContent = currentImage.getAttribute('data-caption') || '';
        lightboxSection.textContent = sectionDisplayNames[dataSection] || 'Photos';
        lightboxLocation.textContent = matchingData?.[imageName] || '';
        if (!lightbox.classList.contains('active')) {
            lightbox.classList.add('active');
            lightbox.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            closeButton?.focus({ preventScroll: true });
        }
    };

    const stepBy = (direction) => {
        const total = galleryItems.length;
        showImageAtIndex((currentIndex + direction + total) % total);
    };

    const slideTransition = 'transform 0.15s ease-out, opacity 0.15s ease-out';

    const resetImagePosition = () => {
        lightboxImage.style.transition = '';
        lightboxImage.style.transform = '';
        lightboxImage.style.opacity = '';
    };

    const slideToNext = (direction, fromDx = 0) => {
        const distance = Math.max(Math.round(window.innerWidth * 0.5), Math.abs(fromDx)) * -direction;
        lightboxImage.style.transition = slideTransition;
        lightboxImage.style.transform = 'translateX(' + distance + 'px)';
        lightboxImage.style.opacity = '0';
        window.setTimeout(() => {
            stepBy(direction);
            lightboxImage.style.transition = 'none';
            lightboxImage.style.transform = 'translateX(' + (-distance * 0.5) + 'px)';
            void lightboxImage.offsetWidth;
            lightboxImage.style.transition = slideTransition;
            lightboxImage.style.transform = 'translateX(0)';
            lightboxImage.style.opacity = '1';
        }, 150);
    };

    const AXIS_LOCK_DISTANCE = 14;
    const VERTICAL_BIAS = 1.8;
    const SWIPE_DISTANCE = 50;
    const CLOSE_DISTANCE = 160;
    const CLOSE_VERTICAL_BIAS = 2;

    const enableSwipe = () => {
        let startX = 0;
        let startY = 0;
        let axis = '';
        let pointerId = null;

        lightboxImage.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            pointerId = event.pointerId;
            startX = event.clientX;
            startY = event.clientY;
            axis = '';
            lightboxImage.setPointerCapture?.(pointerId);
            lightboxImage.style.transition = 'none';
        });

        lightboxImage.addEventListener('pointermove', (event) => {
            if (event.pointerId !== pointerId) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if (!axis && Math.max(Math.abs(dx), Math.abs(dy)) > AXIS_LOCK_DISTANCE) {
                axis = Math.abs(dy) > Math.abs(dx) * VERTICAL_BIAS ? 'y' : 'x';
                lightboxImage.classList.add('is-dragging');
            }
            if (axis === 'x' && galleryItems.length > 1) {
                lightboxImage.style.transform = 'translateX(' + dx + 'px)';
            }
        });

        const endDrag = (event) => {
            if (event.pointerId !== pointerId) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            const dragAxis = axis;
            pointerId = null;
            axis = '';
            lightboxImage.classList.remove('is-dragging');

            if (event.type === 'pointercancel') {
                resetImagePosition();
            } else if (dragAxis === 'x' && Math.abs(dx) > SWIPE_DISTANCE && galleryItems.length > 1) {
                slideToNext(dx < 0 ? 1 : -1, dx);
            } else if (dragAxis === 'y' && dy > CLOSE_DISTANCE && dy > Math.abs(dx) * CLOSE_VERTICAL_BIAS) {
                closeLightbox();
            } else {
                lightboxImage.style.transition = slideTransition;
                lightboxImage.style.transform = '';
                lightboxImage.style.opacity = '';
            }
        };

        lightboxImage.addEventListener('pointerup', endDrag);
        lightboxImage.addEventListener('pointercancel', endDrag);
    };

    const closeLightbox = () => {
        resetImagePosition();
        lightbox.classList.remove('active');
        lightbox.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        galleryItems[currentIndex]?.focus();
    };

    Promise.all([imageDataRequest, cmsDataRequest]).then(([staticData, cmsData]) => {
        imageData = staticData || {};
        appendCmsGalleryImages(cmsData || {});

        if (!galleryItems.length) {
            return;
        }

        galleryItems.forEach((item, index) => {
            item.setAttribute('role', 'button');
            item.setAttribute('tabindex', '0');
            item.setAttribute('aria-label', `Open photo: ${item.alt || 'Photo'}`);
            item.addEventListener('click', () => {
                showImageAtIndex(index);
            });
            item.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    showImageAtIndex(index);
                }
            });
        });

        if (closeButton) {
            closeButton.addEventListener('click', closeLightbox);
        }

        nextButton?.addEventListener('click', () => stepBy(1));
        prevButton?.addEventListener('click', () => stepBy(-1));
        enableSwipe();

        lightbox.addEventListener('click', (event) => {
            if (event.target === lightbox || event.target === lightboxContent) {
                closeLightbox();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (!lightbox.classList.contains('active')) {
                return;
            }

            if (event.key === 'Tab') {
                const focusableControls = Array.from(lightbox.querySelectorAll('button:not([disabled])')).filter((button) => button.getClientRects().length > 0);
                const firstControl = focusableControls[0];
                const lastControl = focusableControls[focusableControls.length - 1];
                if (event.shiftKey && document.activeElement === firstControl) {
                    event.preventDefault();
                    lastControl?.focus();
                } else if (!event.shiftKey && document.activeElement === lastControl) {
                    event.preventDefault();
                    firstControl?.focus();
                }
            } else if (event.key === 'ArrowRight') {
                nextButton?.click();
            } else if (event.key === 'ArrowLeft') {
                prevButton?.click();
            } else if (event.key === 'Escape') {
                closeButton?.click();
            }
        });
    }).catch((error) => {
        console.error('Unable to initialize the photo viewer.', error);
    });
})();
