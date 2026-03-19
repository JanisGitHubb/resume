(function() {
    const thumbnails = document.querySelectorAll('.clickable-image');
    const galleries = document.querySelectorAll('.gallery-preview');
    const lightbox = document.getElementById('image-lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxClose = document.querySelector('.lightbox-close');
    if (!lightbox || !lightboxImg) return;

    const images = {
        aircraft: './assets/images/planeTarragon.png',
        'research-poster': './assets/images/poster.jpg',
        openrocket: './assets/images/openrocket.png',
        launchconditions: './assets/images/launchconditions.png',
        rocketorange: './assets/images/Rocketorange.png',
        car1: './assets/images/car1.jpg'
    };

    const galleryImages = {
        car: [
            './assets/images/car1.jpg',
            './assets/images/car2.jpg',
            './assets/images/car3.jpg'
        ]
    };

    let scale = 1, posX = 0, posY = 0, isDragging = false, dragStartX = 0, dragStartY = 0, hasMoved = false;
    let currentGallery = null, currentIndex = 0;

    // Create nav arrows
    const prevBtn = document.createElement('div');
    prevBtn.className = 'lightbox-prev';
    prevBtn.innerHTML = '‹';
    lightbox.appendChild(prevBtn);

    const nextBtn = document.createElement('div');
    nextBtn.className = 'lightbox-next';
    nextBtn.innerHTML = '›';
    lightbox.appendChild(nextBtn);

    const counter = document.createElement('div');
    counter.className = 'lightbox-counter';
    lightbox.appendChild(counter);

    function updateTransform() {
        lightboxImg.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
    }

    function resetZoom() {
        scale = 1; posX = 0; posY = 0;
        lightboxImg.style.transform = '';
        lightboxImg.classList.remove('zoomed');
    }

    function showNav(show) {
        prevBtn.style.display = show ? 'flex' : 'none';
        nextBtn.style.display = show ? 'flex' : 'none';
        counter.style.display = show ? 'block' : 'none';
    }

    function updateCounter() {
        if (currentGallery) {
            counter.textContent = (currentIndex + 1) + ' / ' + currentGallery.length;
        }
    }

    function close() {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
        resetZoom();
        currentGallery = null;
    }

    // Single image clicks
    thumbnails.forEach(t => {
        t.addEventListener('click', () => {
            lightboxImg.src = images[t.getAttribute('data-image')];
            lightbox.classList.add('active');
            document.body.style.overflow = 'hidden';
            resetZoom();
            currentGallery = null;
            showNav(false);
        });
    });

    // Gallery clicks
    galleries.forEach(g => {
        g.addEventListener('click', () => {
            const key = g.getAttribute('data-gallery');
            currentGallery = galleryImages[key];
            currentIndex = 0;
            lightboxImg.src = currentGallery[0];
            lightbox.classList.add('active');
            document.body.style.overflow = 'hidden';
            resetZoom();
            showNav(true);
            updateCounter();
        });
    });

    prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!currentGallery) return;
        resetZoom();
        currentIndex = (currentIndex - 1 + currentGallery.length) % currentGallery.length;
        lightboxImg.src = currentGallery[currentIndex];
        updateCounter();
    });

    nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!currentGallery) return;
        resetZoom();
        currentIndex = (currentIndex + 1) % currentGallery.length;
        lightboxImg.src = currentGallery[currentIndex];
        updateCounter();
    });

    // Keyboard nav
    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;
        if (e.key === 'Escape') close();
        if (currentGallery && e.key === 'ArrowRight') nextBtn.click();
        if (currentGallery && e.key === 'ArrowLeft') prevBtn.click();
    });

    lightboxImg.addEventListener('mousedown', e => {
        e.preventDefault();
        if (scale > 1) { isDragging = true; dragStartX = e.clientX - posX; dragStartY = e.clientY - posY; hasMoved = false; }
    });

    document.addEventListener('mousemove', e => {
        if (isDragging && scale > 1) { hasMoved = true; posX = e.clientX - dragStartX; posY = e.clientY - dragStartY; updateTransform(); }
    });

    document.addEventListener('mouseup', () => { isDragging = false; });

    lightboxImg.addEventListener('click', e => {
        e.stopPropagation();
        if (hasMoved) { hasMoved = false; return; }
        if (scale === 1) {
            const r = lightboxImg.getBoundingClientRect();
            posX = (r.width / 2 - (e.clientX - r.left)) * 0.4;
            posY = (r.height / 2 - (e.clientY - r.top)) * 0.4;
            scale = 1.4;
            lightboxImg.classList.add('zoomed');
            updateTransform();
        } else { resetZoom(); updateTransform(); }
    });

    if (lightboxClose) lightboxClose.addEventListener('click', close);
    lightbox.addEventListener('click', e => { if (e.target === lightbox) close(); });

    // Init nav hidden
    showNav(false);
})();
