(() => {
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightbox-image');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const lightboxSection = document.getElementById('lightbox-section');
    const lightboxLocation = document.getElementById('lightbox-location');

    const closeButton = document.querySelector('.lightbox-close');
    const nextButton = document.querySelector('.lightbox-next');
    const prevButton = document.querySelector('.lightbox-prev');
    const galleryItems = document.querySelectorAll('.gallery-item img');

    if (!lightbox || !lightboxImage || !lightboxCaption || !lightboxSection || !lightboxLocation || !galleryItems.length) {
        return;
    }

    let currentIndex = 0;
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

    fetch('image_data.json')
        .then((response) => response.json())
        .then((data) => {
            imageData = data;
        })
        .catch(() => {
            imageData = {};
        });

    const updateLightboxContent = () => {
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
    };

    const openLightbox = (index) => {
        currentIndex = index;
        updateLightboxContent();
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    const closeLightbox = () => {
        lightbox.classList.remove('active');
        document.body.style.overflow = 'auto';
    };

    const showNextImage = () => {
        currentIndex = (currentIndex + 1) % galleryItems.length;
        updateLightboxContent();
    };

    const showPrevImage = () => {
        currentIndex = (currentIndex - 1 + galleryItems.length) % galleryItems.length;
        updateLightboxContent();
    };

    galleryItems.forEach((item, index) => {
        item.addEventListener('click', () => openLightbox(index));
    });

    if (closeButton) {
        closeButton.addEventListener('click', closeLightbox);
    }

    if (nextButton) {
        nextButton.addEventListener('click', showNextImage);
    }

    if (prevButton) {
        prevButton.addEventListener('click', showPrevImage);
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

        if (event.key === 'ArrowRight') {
            showNextImage();
        } else if (event.key === 'ArrowLeft') {
            showPrevImage();
        } else if (event.key === 'Escape') {
            closeLightbox();
        }
    });
})();
