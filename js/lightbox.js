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

    let currentIndex = 0;
    let galleryItems = Array.from(document.querySelectorAll('.gallery-item img'));
    let imageData = {};
    const getFullSizeSrc = (image) => image.getAttribute('data-full-src') || image.currentSrc || image.src;

    const sectionDisplayNames = {
        photography: 'Photography',
        photos_of_me: 'Photos of Me',
        photos_by_me: 'Photos by Me',
        gigs_2025: 'Gigs 2025',
        gigs_2026: 'Gigs 2026',
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
        const imageName = imageSrc.split('/').pop() || '';
        const dataSection = section === 'photography' ? 'photography' : section;
        const matchingData = imageData[dataSection]
            || Object.values(imageData).find((sectionData) => sectionData && sectionData[imageName]);

        lightboxImage.src = imageSrc;
        lightboxImage.alt = currentImage.alt || 'Photo';
        lightboxCaption.textContent = currentImage.getAttribute('data-caption') || '';
        lightboxSection.textContent = sectionDisplayNames[dataSection] || 'Photos';
        lightboxLocation.textContent = matchingData?.[imageName] || '';
        lightbox.classList.add('active');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        closeButton?.focus();
    };

    const closeLightbox = () => {
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

        if (nextButton) {
            nextButton.addEventListener('click', () => {
                showImageAtIndex((currentIndex + 1) % galleryItems.length);
            });
        }

        if (prevButton) {
            prevButton.addEventListener('click', () => {
                showImageAtIndex((currentIndex - 1 + galleryItems.length) % galleryItems.length);
            });
        }

        lightbox.addEventListener('click', (event) => {
            if (event.target === lightbox) {
                closeLightbox();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (!lightbox.classList.contains('active')) {
                return;
            }

            if (event.key === 'Tab') {
                const focusableControls = Array.from(lightbox.querySelectorAll('button:not([disabled])'));
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
