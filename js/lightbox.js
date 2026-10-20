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

    Promise.all([
        fetch('image_data.json').then((response) => response.json()).catch(() => ({})),
        fetch('data/cms-content.json', { cache: 'no-store' }).then((response) => response.ok ? response.json() : {}).catch(() => ({})),
    ]).then(([staticData, cmsData]) => {
        imageData = staticData || {};
        appendCmsGalleryImages(cmsData || {});

        if (!galleryItems.length) {
            return;
        }

        galleryItems.forEach((item, index) => {
            item.addEventListener('click', () => {
                currentIndex = index;
                const currentImage = galleryItems[currentIndex];
                const section = currentImage.getAttribute('data-section') || '';
                const imageName = currentImage.getAttribute('src')?.split('/').pop() || '';
                const dataSection = section === 'photography' ? 'photography' : section;

                lightboxImage.src = currentImage.src;
                lightboxCaption.textContent = currentImage.getAttribute('data-caption') || '';
                lightboxSection.textContent = sectionDisplayNames[dataSection] || 'Photos';

                const matchingData = imageData[dataSection]
                    || Object.values(imageData).find((sectionData) => sectionData && sectionData[imageName]);

                if (matchingData && matchingData[imageName]) {
                    lightboxLocation.innerHTML = matchingData[imageName].replace(/\n/g, '<br>');
                } else {
                    lightboxLocation.textContent = '';
                }

                lightbox.classList.add('active');
                document.body.style.overflow = 'hidden';
            });
        });

        if (closeButton) {
            closeButton.addEventListener('click', () => {
                lightbox.classList.remove('active');
                document.body.style.overflow = 'auto';
            });
        }

        if (nextButton) {
            nextButton.addEventListener('click', () => {
                currentIndex = (currentIndex + 1) % galleryItems.length;
                const currentImage = galleryItems[currentIndex];
                if (!currentImage) {
                    return;
                }
                const section = currentImage.getAttribute('data-section') || '';
                const imageName = currentImage.getAttribute('src')?.split('/').pop() || '';
                const dataSection = section === 'photography' ? 'photography' : section;
                lightboxImage.src = currentImage.src;
                lightboxCaption.textContent = currentImage.getAttribute('data-caption') || '';
                lightboxSection.textContent = sectionDisplayNames[dataSection] || 'Photos';
                const matchingData = imageData[dataSection] || Object.values(imageData).find((sectionData) => sectionData && sectionData[imageName]);
                if (matchingData && matchingData[imageName]) {
                    lightboxLocation.innerHTML = matchingData[imageName].replace(/\n/g, '<br>');
                } else {
                    lightboxLocation.textContent = '';
                }
            });
        }

        if (prevButton) {
            prevButton.addEventListener('click', () => {
                currentIndex = (currentIndex - 1 + galleryItems.length) % galleryItems.length;
                const currentImage = galleryItems[currentIndex];
                if (!currentImage) {
                    return;
                }
                const section = currentImage.getAttribute('data-section') || '';
                const imageName = currentImage.getAttribute('src')?.split('/').pop() || '';
                const dataSection = section === 'photography' ? 'photography' : section;
                lightboxImage.src = currentImage.src;
                lightboxCaption.textContent = currentImage.getAttribute('data-caption') || '';
                lightboxSection.textContent = sectionDisplayNames[dataSection] || 'Photos';
                const matchingData = imageData[dataSection] || Object.values(imageData).find((sectionData) => sectionData && sectionData[imageName]);
                if (matchingData && matchingData[imageName]) {
                    lightboxLocation.innerHTML = matchingData[imageName].replace(/\n/g, '<br>');
                } else {
                    lightboxLocation.textContent = '';
                }
            });
        }

        lightbox.addEventListener('click', (event) => {
            if (event.target === lightbox) {
                lightbox.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
        });

        document.addEventListener('keydown', (event) => {
            if (!lightbox.classList.contains('active')) {
                return;
            }

            if (event.key === 'ArrowRight') {
                nextButton?.click();
            } else if (event.key === 'ArrowLeft') {
                prevButton?.click();
            } else if (event.key === 'Escape') {
                closeButton?.click();
            }
        });
    }).catch(() => {
        if (!galleryItems.length) {
            return;
        }
    });
})();
