// Original Matrix background slideshow runtime.
        // ==========================================
        // FEATURE 3: SLIDESHOW (Non-Invasive Background)
        // ==========================================
        let slideshowEnabled = false;
        let slideshowImages = [];
        let slideshowIndex = 0;
        let slideshowPlaying = false;
        let slideshowInterval = null;
        let slideshowSpeed = 3000; // ms
        let slideshowShuffle = false;

        const slideshowBg = document.getElementById('slideshowBg');
        const slideshowBar = document.getElementById('slideshowBar');

        // Resize helper: returns a data URL sized to maxDim
        function resizeImage(dataUrl, maxDim, quality) {
            return new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    let w = img.width, h = img.height;
                    if (w > maxDim || h > maxDim) {
                        const ratio = Math.min(maxDim / w, maxDim / h);
                        w = Math.round(w * ratio);
                        h = Math.round(h * ratio);
                    }
                    const c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    c.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(c.toDataURL('image/jpeg', quality || 0.8));
                };
                img.src = dataUrl;
            });
        }

        let slideshowThumbnails = []; // small versions for the bar

        // File upload — resizes on load for performance
        document.getElementById('slideshowFileInput').addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            files.forEach(file => {
                if (!file.type.startsWith('image/')) return;
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const raw = ev.target.result;
                    // Resize: 1920px for background, 80px for thumb
                    const [bg, thumb] = await Promise.all([
                        resizeImage(raw, 1920, 0.8),
                        resizeImage(raw, 80, 0.6)
                    ]);
                    slideshowImages.push(bg);
                    slideshowThumbnails.push(thumb);
                    buildSlideshowThumbs();
                    if (slideshowImages.length === 1) {
                        showSlide(0);
                    }
                    updateSlideCounter();
                };
                reader.readAsDataURL(file);
            });
        });

        function buildSlideshowThumbs() {
            const container = document.getElementById('slThumbs');
            container.innerHTML = '';
            slideshowThumbnails.forEach((src, i) => {
                const img = document.createElement('img');
                img.className = 'sl-thumb' + (i === slideshowIndex ? ' active' : '');
                img.src = src;
                img.onclick = () => showSlide(i);
                container.appendChild(img);
            });
        }

        function showSlide(index) {
            if (slideshowImages.length === 0) return;
            slideshowIndex = index % slideshowImages.length;
            if (slideshowIndex < 0) slideshowIndex = slideshowImages.length - 1;

            slideshowBg.style.backgroundImage = `url(${slideshowImages[slideshowIndex]})`;
            if (slideshowEnabled) slideshowBg.style.display = 'block';

            // Update active thumb
            document.querySelectorAll('.sl-thumb').forEach((t, i) => {
                t.classList.toggle('active', i === slideshowIndex);
            });
            updateSlideCounter();
        }

        function updateSlideCounter() {
            const counter = document.getElementById('slCounter');
            counter.textContent = slideshowImages.length > 0
                ? `${slideshowIndex + 1}/${slideshowImages.length}`
                : '0/0';
        }

        function startSlideshow() {
            if (slideshowInterval) clearInterval(slideshowInterval);
            slideshowPlaying = true;
            document.getElementById('slPlayPause').textContent = '⏸';
            slideshowInterval = setInterval(() => {
                if (slideshowShuffle && slideshowImages.length > 1) {
                    let next;
                    do { next = Math.floor(Math.random() * slideshowImages.length); } while (next === slideshowIndex);
                    showSlide(next);
                } else {
                    showSlide(slideshowIndex + 1);
                }
            }, slideshowSpeed);
        }

        function stopSlideshow() {
            slideshowPlaying = false;
            document.getElementById('slPlayPause').textContent = '▶';
            if (slideshowInterval) {
                clearInterval(slideshowInterval);
                slideshowInterval = null;
            }
        }

        document.getElementById('slPlayPause').addEventListener('click', () => {
            if (slideshowImages.length === 0) return;
            if (slideshowPlaying) stopSlideshow();
            else startSlideshow();
        });

        document.getElementById('slPrev').addEventListener('click', () => {
            showSlide(slideshowIndex - 1);
        });

        document.getElementById('slNext').addEventListener('click', () => {
            showSlide(slideshowIndex + 1);
        });

        document.getElementById('slShuffle').addEventListener('click', () => {
            slideshowShuffle = !slideshowShuffle;
            const btn = document.getElementById('slShuffle');
            btn.style.borderColor = slideshowShuffle ? '#0f0' : '';
            btn.style.background = slideshowShuffle ? 'rgba(0, 255, 0, 0.25)' : '';
            if (slideshowPlaying) startSlideshow(); // restart with new mode
        });

        document.getElementById('slSlower').addEventListener('click', () => {
            slideshowSpeed = Math.min(10000, slideshowSpeed + 500);
            document.getElementById('slSpeedLabel').textContent = (slideshowSpeed / 1000).toFixed(1) + 's';
            if (slideshowPlaying) startSlideshow(); // restart with new speed
        });

        document.getElementById('slFaster').addEventListener('click', () => {
            slideshowSpeed = Math.max(500, slideshowSpeed - 500);
            document.getElementById('slSpeedLabel').textContent = (slideshowSpeed / 1000).toFixed(1) + 's';
            if (slideshowPlaying) startSlideshow();
        });

        function updateSlideshowOpacity(val) {
            slideshowBg.style.opacity = val / 100;
        }

        let slideshowBarState = 1; // 0 = expanded, 1 = collapsed, 2 = hidden

        function toggleSlideshowBar() {
            const tab = slideshowBar.querySelector('.slideshow-toggle-tab');
            slideshowBarState = (slideshowBarState + 1) % 3;

            slideshowBar.classList.remove('collapsed', 'hidden');

            if (slideshowBarState === 0) {
                // Expanded — full bar visible
                tab.textContent = '▼ Slideshow';
            } else if (slideshowBarState === 1) {
                // Collapsed — just the tab peeking
                slideshowBar.classList.add('collapsed');
                tab.textContent = '▲ Slideshow';
            } else {
                // Hidden — bar slides fully off, tab fades out
                slideshowBar.classList.add('hidden');
                tab.textContent = '▲ Slideshow';
            }
        }

        function toggleSlideshow(checked) {
            slideshowEnabled = checked;
            slideshowBar.style.display = checked ? 'block' : 'none';
            slideshowBg.style.display = (checked && slideshowImages.length > 0) ? 'block' : 'none';
            if (!checked) {
                stopSlideshow();
            }
        }

        // Call initialization
        initializeColumns();

