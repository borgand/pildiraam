/**
 * Pildiraam - Digital Photo Frame Slideshow
 * ES5-compatible JavaScript for iOS 9 Safari support
 *
 * Features:
 * - Auto-advancing slideshow with configurable interval
 * - Progressive image loading with pagination
 * - Image randomization using Fisher-Yates algorithm
 * - Keyboard navigation (arrows, space, F key)
 * - Touch/swipe gestures for mobile
 * - Fullscreen mode support
 * - Clock and weather overlays
 * - Periodic refresh check
 * - Rolling window memory management
 */

(function() {
  'use strict';

  // Get configuration from global scope (set in slideshow.html)
  var config = window.PILDIRAAM_CONFIG || {};

  // State management
  var state = {
    token: config.token,
    interval: config.interval * 1000, // Convert to milliseconds
    currentIndex: 0,
    images: [], // All image metadata (after shuffle)
    loadedPages: 0,
    totalImages: 0,
    isPaused: false,
    isFullscreen: false,
    slideTimer: null,
    weatherTimer: null,
    clockTimer: null,
    refreshTimer: null,
    loadingNextBatch: false,
    allPagesLoaded: false,
    lastRefreshCheck: Date.now(),
    imageElements: {}, // Cache of preloaded image elements (rolling window)
    visibleSlideIndex: 0,
    // Image loading pool management
    imageLoadQueue: [], // Queue of {index, element, retryCount} to load
    loadingCount: 0, // Current concurrent loads
    MAX_CONCURRENT_LOADS: 4, // Browser connection pool size
    MAX_IMAGE_RETRIES: 1, // Retry failed images once
    imageRetryMap: {}, // Track retry count per image index
    failedImages: {}, // Track permanently failed images (don't retry in future)
    // Request cancellation on page unload
    pageLoadAbortController: null // AbortController for page fetch requests
  };

  // DOM element cache
  var dom = {
    app: null,
    slideshow: null,
    controls: null,
    counter: null,
    playPauseBtn: null,
    prevBtn: null,
    nextBtn: null,
    fullscreenBtn: null,
    clockOverlay: null,
    weatherOverlay: null,
    loadingIndicator: null,
    errorModal: null,
    imageDetailOverlay: null
  };

  // Constants
  var IMAGES_PER_PAGE = 50;
  var PRELOAD_WINDOW = 20; // Number of images to keep in memory
  var REFRESH_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  var WEATHER_UPDATE_INTERVAL = 30 * 60 * 1000; // 30 minutes
  var CLOCK_UPDATE_INTERVAL = 1000; // 1 second

  /**
   * Initialize the slideshow application
   */
  function init() {
    console.log('Slideshow initializing with config:', config);

    if (!state.token) {
      showError('No album token provided');
      return;
    }

    // Initialize AbortController for clean request cancellation on unload
    state.pageLoadAbortController = new AbortController();

    // Cache DOM elements
    dom.app = document.getElementById('app');

    // Build the slideshow UI
    buildUI();

    // Start loading images
    loadImagesPage(0);

    // Set up event listeners
    setupEventListeners();

    // Start overlays if configured
    if (config.clock) {
      startClock();
    }
    if (config.weather) {
      startWeather();
    }

    // Start periodic refresh check
    startRefreshCheck();

    // Request fullscreen if configured
    if (config.fullscreen) {
      setTimeout(function() {
        requestFullscreen();
      }, 1000);
    }
  }

  /**
   * Build the slideshow UI structure
   */
  function buildUI() {
    var html = '';

    // Slideshow container
    html += '<div class="slideshow" id="slideshow"></div>';

    // Controls panel
    html += '<div class="controls" id="controls">';
    html += '  <button id="prev-btn" class="control-btn" title="Previous (Left Arrow)">&#9664;</button>';
    html += '  <button id="play-pause-btn" class="control-btn" title="Play/Pause (Space)">&#9208;</button>';
    html += '  <button id="next-btn" class="control-btn" title="Next (Right Arrow)">&#9654;</button>';
    html += '  <button id="fullscreen-btn" class="control-btn" title="Fullscreen (F)">&#9974;</button>';
    html += '</div>';

    // Loading indicator
    html += '<div class="loading-indicator" id="loading-indicator" style="display: none;">';
    html += '  <div class="spinner"></div>';
    html += '  <p>Loading images...</p>';
    html += '</div>';

    // Clock overlay
    if (config.clock) {
      html += '<div class="clock-overlay" id="clock-overlay"></div>';
    }

    // Weather overlay
    if (config.weather) {
      html += '<div class="weather-overlay" id="weather-overlay"></div>';
    }

    // Image detail overlay
    html += '<div class="image-detail-overlay" id="image-detail-overlay"></div>';

    // Error modal
    html += '<div class="error-modal" id="error-modal" style="display: none;">';
    html += '  <div class="error-content">';
    html += '    <h2>Error</h2>';
    html += '    <p id="error-message"></p>';
    html += '    <button id="retry-btn" class="retry-btn">Retry</button>';
    html += '    <button id="close-error-btn" class="close-btn">Close</button>';
    html += '  </div>';
    html += '</div>';

    dom.app.innerHTML = html;

    // Cache newly created DOM elements
    dom.slideshow = document.getElementById('slideshow');
    dom.controls = document.getElementById('controls');
    dom.playPauseBtn = document.getElementById('play-pause-btn');
    dom.prevBtn = document.getElementById('prev-btn');
    dom.nextBtn = document.getElementById('next-btn');
    dom.fullscreenBtn = document.getElementById('fullscreen-btn');
    dom.loadingIndicator = document.getElementById('loading-indicator');
    dom.errorModal = document.getElementById('error-modal');
    dom.clockOverlay = document.getElementById('clock-overlay');
    dom.weatherOverlay = document.getElementById('weather-overlay');
    dom.imageDetailOverlay = document.getElementById('image-detail-overlay');
  }

  /**
   * Set up all event listeners
   */
  function setupEventListeners() {
    // Keyboard controls
    document.addEventListener('keydown', handleKeyPress);

    // Touch gestures
    var touchStartX = 0;
    var touchEndX = 0;
    var touchStartY = 0;
    var touchEndY = 0;
    var doubleTapTimer = null;
    var lastTapTime = 0;

    dom.slideshow.addEventListener('touchstart', function(e) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;

      // Double tap detection
      var currentTime = Date.now();
      var tapGap = currentTime - lastTapTime;

      if (tapGap < 300 && tapGap > 0) {
        // Double tap detected
        toggleFullscreen();
        if (doubleTapTimer) {
          clearTimeout(doubleTapTimer);
          doubleTapTimer = null;
        }
      } else {
        doubleTapTimer = setTimeout(function() {
          doubleTapTimer = null;
        }, 300);
      }

      lastTapTime = currentTime;
    }, false);

    dom.slideshow.addEventListener('touchend', function(e) {
      touchEndX = e.changedTouches[0].clientX;
      touchEndY = e.changedTouches[0].clientY;
      handleSwipe();
    }, false);

    function handleSwipe() {
      var diffX = touchEndX - touchStartX;
      var diffY = touchEndY - touchStartY;

      // Only handle horizontal swipes (ignore vertical scrolls)
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
        if (diffX > 0) {
          // Swipe right - previous
          previousSlide();
        } else {
          // Swipe left - next
          nextSlide();
        }
      }
    }

    // Control button clicks
    dom.prevBtn.addEventListener('click', previousSlide);
    dom.nextBtn.addEventListener('click', nextSlide);
    dom.playPauseBtn.addEventListener('click', togglePlayPause);
    dom.fullscreenBtn.addEventListener('click', toggleFullscreen);

    // Controls hover for image detail overlay
    dom.controls.addEventListener('mouseenter', function() {
      updateImageDetailOverlay();
    });

    dom.controls.addEventListener('mouseleave', function() {
      if (!config.clock) {
        hideImageDetailOverlay();
      }
    });

    // Error modal buttons
    document.getElementById('retry-btn').addEventListener('click', function() {
      hideError();
      // Retry loading from the beginning
      state.loadedPages = 0;
      state.images = [];
      state.currentIndex = 0;
      state.allPagesLoaded = false;
      loadImagesPage(0);
    });

    document.getElementById('close-error-btn').addEventListener('click', hideError);

    // Fullscreen change detection
    document.addEventListener('fullscreenchange', updateFullscreenState);
    document.addEventListener('webkitfullscreenchange', updateFullscreenState);
    document.addEventListener('mozfullscreenchange', updateFullscreenState);
    document.addEventListener('MSFullscreenChange', updateFullscreenState);

    // Window resize/orientation change (debounced)
    var resizeTimer;
    window.addEventListener('resize', function() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        // Refresh current slide layout
        updateSlideLayout();
      }, 250);
    });
  }

  /**
   * Handle keyboard input
   */
  function handleKeyPress(e) {
    var key = e.keyCode || e.which;

    switch(key) {
      case 37: // Left arrow
        e.preventDefault();
        previousSlide();
        break;
      case 39: // Right arrow
        e.preventDefault();
        nextSlide();
        break;
      case 32: // Space
        e.preventDefault();
        togglePlayPause();
        break;
      case 70: // F key
        e.preventDefault();
        toggleFullscreen();
        break;
      case 27: // ESC key
        if (state.isFullscreen) {
          exitFullscreen();
        }
        break;
    }
  }

  /**
   * Load a page of images from the API
   */
  function loadImagesPage(page) {
    if (state.loadingNextBatch) {
      console.log('Already loading a batch, skipping...');
      return;
    }

    state.loadingNextBatch = true;
    showLoading();

    var url = '/api/album/' + state.token + '/images?page=' + page + '&limit=' + IMAGES_PER_PAGE;

    console.log('Fetching images page:', page);

    fetch(url, { signal: state.pageLoadAbortController.signal })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }
        return response.json();
      })
      .then(function(data) {
        console.log('Loaded page', page, ':', data);

        state.loadingNextBatch = false;
        hideLoading();

        if (!data.images || data.images.length === 0) {
          // No more images
          state.allPagesLoaded = true;

          if (state.images.length === 0) {
            showError('No images found in this album');
          } else {
            console.log('All pages loaded. Total images:', state.images.length);
            // Shuffle images if this is the first load
            if (page === 0) {
              shuffleImages();
              startSlideshow();
            }
          }
          return;
        }

        // Add images to the list
        for (var i = 0; i < data.images.length; i++) {
          state.images.push(data.images[i]);
        }

        state.loadedPages = page + 1;
        state.totalImages = state.images.length;

        // Randomize immediately after loading each page
        // This ensures first page is randomized and avoids repetitive first images
        console.log('Randomizing page', page, 'with', state.images.length, 'total images');
        shuffleImages();

        // Re-run prefetch algorithm after randomization to match new order
        preloadNearbyImages();

        // If this is the first page, start the slideshow
        if (page === 0) {
          startSlideshow();
        }

        // Check if there might be more pages
        if (data.images.length < IMAGES_PER_PAGE) {
          state.allPagesLoaded = true;
          console.log('Last page loaded. Total images:', state.images.length);
        } else {
          // Aggressive background prefetching: Load next page in background
          // Use 1500ms delay to respect rate limits and avoid overwhelming server
          // Longer delay than image loading pool recovery time to prevent thundering herd
          setTimeout(function() {
            if (!state.allPagesLoaded && !state.loadingNextBatch) {
              console.log('Starting aggressive prefetch of page', state.loadedPages);
              loadImagesPage(state.loadedPages);
            }
          }, 1500);
        }
      })
      .catch(function(error) {
        // Distinguish between abort (page reload) and actual errors
        if (error.name === 'AbortError') {
          console.log('Page load cancelled (likely due to page reload)');
        } else {
          console.error('Failed to load images:', error);
          state.loadingNextBatch = false;
          hideLoading();
          showError('Failed to load images: ' + error.message);
        }
      });
  }

  /**
   * Shuffle images using Fisher-Yates algorithm
   */
  function shuffleImages() {
    console.log('Shuffling', state.images.length, 'images');

    // Use a seeded random with timestamp for true randomization on each reload
    // Combines album token + current timestamp to ensure different order each load
    var seed = hashCode(state.token + Date.now());

    function seededRandom() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    // Fisher-Yates shuffle
    for (var i = state.images.length - 1; i > 0; i--) {
      var j = Math.floor(seededRandom() * (i + 1));
      var temp = state.images[i];
      state.images[i] = state.images[j];
      state.images[j] = temp;
    }

    console.log('Images shuffled');
  }

  /**
   * Simple hash function for seeding random
   */
  function hashCode(str) {
    var hash = 0;
    if (str.length === 0) return hash;
    for (var i = 0; i < str.length; i++) {
      var chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Start the slideshow
   */
  function startSlideshow() {
    if (state.images.length === 0) {
      showError('No images to display');
      return;
    }

    console.log('Starting slideshow with', state.images.length, 'images');

    // Show first image
    state.currentIndex = 0;
    showSlide(state.currentIndex);
    updateCounter();

    // Preload nearby images
    preloadNearbyImages();

    // Start auto-advance timer
    resetSlideTimer();
  }

  /**
   * Show a specific slide
   */
  function showSlide(index) {
    if (index < 0 || index >= state.images.length) {
      console.warn('Invalid slide index:', index);
      return;
    }

    var image = state.images[index];
    console.log('Showing slide', index + 1, 'of', state.images.length);

    // Get or create image element
    var slideDiv = getOrCreateSlideElement(index);

    // Hide all other slides
    var allSlides = dom.slideshow.getElementsByClassName('slideshow-image');
    for (var i = 0; i < allSlides.length; i++) {
      if (allSlides[i] !== slideDiv) {
        allSlides[i].className = 'slideshow-image';
      }
    }

    // Show current slide with fade-in
    setTimeout(function() {
      slideDiv.className = 'slideshow-image active';
    }, 50);

    state.visibleSlideIndex = index;

    // Preload nearby images
    preloadNearbyImages();

    // Update counter
    updateCounter();

    // Update image detail overlay
    updateImageDetailOverlay();
  }

  /**
   * Get or create a slide element for the given index
   * Note: img.src is NOT set here - it's queued for pooled loading
   */
  function getOrCreateSlideElement(index) {
    var cacheKey = 'slide-' + index;

    // Check if already in DOM
    var existing = document.getElementById(cacheKey);
    if (existing) {
      return existing;
    }

    // Create new slide element
    var image = state.images[index];
    var slideDiv = document.createElement('div');
    slideDiv.id = cacheKey;
    slideDiv.className = 'slideshow-image';

    var img = document.createElement('img');
    // DO NOT SET img.src HERE - it will be set by the pooled loader
    img.alt = image.caption || 'Photo ' + (index + 1);
    img.dataset.url = image.url; // Store URL for later loading
    img.dataset.index = index;

    // Error handling for image load with retry support
    img.onerror = function() {
      console.error('Failed to load image:', image.url, 'index:', index);

      // Skip retry if already marked as permanently failed
      if (state.failedImages[index]) {
        console.log('Image already permanently failed, skipping retry:', index);
        processImageLoadQueue();
        return;
      }

      // Check if we should retry
      var retryCount = state.imageRetryMap[index] || 0;
      if (retryCount < state.MAX_IMAGE_RETRIES) {
        // Increment retry count and requeue for retry
        state.imageRetryMap[index] = retryCount + 1;
        console.log('Retrying image load - index:', index, 'attempt:', retryCount + 2);
        queueImageLoad(index, img);
      } else {
        // Max retries exceeded - mark as permanently failed and remove from queue
        console.error('Max retries exceeded for image:', index, '- removing from display');
        state.failedImages[index] = true;
        // Remove this image from DOM
        if (slideDiv.parentNode) {
          slideDiv.parentNode.removeChild(slideDiv);
        }
        // Clean up from cache
        delete state.imageElements[cacheKey];
      }

      // Process next item in queue
      processImageLoadQueue();
    };

    // Success handler
    img.onload = function() {
      console.log('Image loaded:', index + 1);
      // Clear retry count for successful load
      delete state.imageRetryMap[index];
      // Process next item in queue
      processImageLoadQueue();
    };

    slideDiv.appendChild(img);
    dom.slideshow.appendChild(slideDiv);

    // Add to cache
    state.imageElements[cacheKey] = slideDiv;

    // Queue for pooled loading
    queueImageLoad(index, img);

    return slideDiv;
  }

  /**
   * Queue an image for pooled loading
   * Maintains max concurrent connections to browser limit
   */
  function queueImageLoad(index, imgElement) {
    state.imageLoadQueue.push({
      index: index,
      element: imgElement
    });

    console.log('Image queued for loading:', index + 1, '(queue size:', state.imageLoadQueue.length + ')');

    // Start processing queue if not at capacity
    processImageLoadQueue();
  }

  /**
   * Process the image load queue with connection pooling
   * Respects browser HTTP connection limits by loading max 4 concurrent
   */
  function processImageLoadQueue() {
    // Decrease counter if this is called after a load completes
    if (state.loadingCount > 0 && arguments.length === 0) {
      state.loadingCount--;
    }

    // Load more images if under concurrent limit and queue has items
    while (state.loadingCount < state.MAX_CONCURRENT_LOADS && state.imageLoadQueue.length > 0) {
      var loadItem = state.imageLoadQueue.shift();
      var imgElement = loadItem.element;
      var imageUrl = imgElement.dataset.url;

      state.loadingCount++;

      console.log('Starting image load:', loadItem.index + 1, '(concurrent:', state.loadingCount + ')');

      // Set src to trigger load - this will call onload or onerror when complete
      imgElement.src = imageUrl;
    }

    if (state.imageLoadQueue.length === 0 && state.loadingCount === 0) {
      console.log('All images loaded');
    }
  }

  /**
   * Preload nearby images (rolling window)
   */
  function preloadNearbyImages() {
    var start = Math.max(0, state.currentIndex - 5);
    var end = Math.min(state.images.length - 1, state.currentIndex + PRELOAD_WINDOW);

    // Preload images in range
    for (var i = start; i <= end; i++) {
      getOrCreateSlideElement(i);
    }

    // Remove old images outside the window to save memory
    var keysToRemove = [];
    for (var key in state.imageElements) {
      if (state.imageElements.hasOwnProperty(key)) {
        var slideIndex = parseInt(key.replace('slide-', ''), 10);
        if (slideIndex < start - 5 || slideIndex > end + 5) {
          keysToRemove.push(key);
        }
      }
    }

    for (var j = 0; j < keysToRemove.length; j++) {
      var keyToRemove = keysToRemove[j];
      var element = state.imageElements[keyToRemove];
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
      delete state.imageElements[keyToRemove];
    }

    console.log('Preloaded images', start, 'to', end, '(current:', state.currentIndex + ')');
  }

  /**
   * Next slide
   */
  function nextSlide() {
    if (state.images.length === 0) return;

    state.currentIndex = (state.currentIndex + 1) % state.images.length;
    showSlide(state.currentIndex);
    resetSlideTimer();

    // Note: Pages are now loaded aggressively in background via loadImagesPage()
    // This ensures all images are available for randomization before slideshow needs them
    // No longer loading pages on-demand during slideshow to avoid deterministic ordering
  }

  /**
   * Previous slide
   */
  function previousSlide() {
    if (state.images.length === 0) return;

    state.currentIndex--;
    if (state.currentIndex < 0) {
      state.currentIndex = state.images.length - 1;
    }
    showSlide(state.currentIndex);
    resetSlideTimer();
  }

  /**
   * Toggle play/pause
   */
  function togglePlayPause() {
    state.isPaused = !state.isPaused;

    if (state.isPaused) {
      // Pause
      if (state.slideTimer) {
        clearTimeout(state.slideTimer);
        state.slideTimer = null;
      }
      dom.playPauseBtn.innerHTML = '&#9654;'; // Play icon
      dom.playPauseBtn.title = 'Play (Space)';
    } else {
      // Resume
      dom.playPauseBtn.innerHTML = '&#9208;'; // Pause icon
      dom.playPauseBtn.title = 'Pause (Space)';
      resetSlideTimer();
    }
  }

  /**
   * Reset the slide timer
   */
  function resetSlideTimer() {
    if (state.slideTimer) {
      clearTimeout(state.slideTimer);
    }

    if (!state.isPaused) {
      state.slideTimer = setTimeout(function() {
        nextSlide();
      }, state.interval);
    }
  }

  /**
   * Update slide counter
   */
  function updateCounter() {
    // Counter is now part of image detail overlay, removed from controls panel
  }

  /**
   * Update image detail overlay with current image info
   */
  function updateImageDetailOverlay() {
    if (!dom.imageDetailOverlay || state.images.length === 0) {
      return;
    }

    var currentImage = state.images[state.currentIndex];
    if (!currentImage) {
      return;
    }

    var html = '';

    // Title (if available)
    if (currentImage.title) {
      html += '<div class="image-detail-title">' + escapeHtml(currentImage.title) + '</div>';
    }

    // Caption (if available)
    if (currentImage.caption) {
      html += '<div class="image-detail-caption">' + escapeHtml(currentImage.caption) + '</div>';
    }

    // Metadata (date and counter)
    html += '<div class="image-detail-meta">';

    // Date
    if (currentImage.dateCreated) {
      var date = new Date(currentImage.dateCreated);
      var dateStr = formatDate(date);
      html += '<div class="image-detail-date">' + dateStr + '</div>';
    }

    // Counter
    html += '<div class="image-detail-counter">' + (state.currentIndex + 1) + ' / ' + state.images.length + '</div>';
    html += '</div>';

    dom.imageDetailOverlay.innerHTML = html;

    // Show overlay if clock is visible or controls are hovered
    if (config.clock) {
      dom.imageDetailOverlay.className = 'image-detail-overlay visible';
    }
  }

  /**
   * Show image detail overlay
   */
  function showImageDetailOverlay() {
    if (dom.imageDetailOverlay) {
      dom.imageDetailOverlay.className = 'image-detail-overlay visible';
    }
  }

  /**
   * Hide image detail overlay
   */
  function hideImageDetailOverlay() {
    if (dom.imageDetailOverlay) {
      dom.imageDetailOverlay.className = 'image-detail-overlay';
    }
  }

  /**
   * Format date for display
   */
  function formatDate(date) {
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var day = date.getDate();
    var month = months[date.getMonth()];
    var year = date.getFullYear();
    var hours = date.getHours();
    var minutes = date.getMinutes();

    // Pad with zeros
    hours = hours < 10 ? '0' + hours : hours;
    minutes = minutes < 10 ? '0' + minutes : minutes;

    return month + ' ' + day + ', ' + year + ' at ' + hours + ':' + minutes;
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Update slide layout (on resize)
   */
  function updateSlideLayout() {
    // Force re-layout of current image
    var currentSlide = document.getElementById('slide-' + state.currentIndex);
    if (currentSlide) {
      var img = currentSlide.getElementsByTagName('img')[0];
      if (img) {
        // Trigger reflow
        img.style.display = 'none';
        setTimeout(function() {
          img.style.display = '';
        }, 10);
      }
    }
  }

  /**
   * Toggle fullscreen mode
   */
  function toggleFullscreen() {
    if (state.isFullscreen) {
      exitFullscreen();
    } else {
      requestFullscreen();
    }
  }

  /**
   * Request fullscreen
   */
  function requestFullscreen() {
    var elem = document.documentElement;

    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      elem.mozRequestFullScreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    } else {
      // Fallback: CSS fullscreen
      document.body.classList.add('fullscreen-fallback');
      state.isFullscreen = true;
      updateFullscreenButton();
    }
  }

  /**
   * Exit fullscreen
   */
  function exitFullscreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    } else {
      // Fallback
      document.body.classList.remove('fullscreen-fallback');
      state.isFullscreen = false;
      updateFullscreenButton();
    }
  }

  /**
   * Update fullscreen state
   */
  function updateFullscreenState() {
    var isCurrentlyFullscreen = !!(document.fullscreenElement ||
                                    document.webkitFullscreenElement ||
                                    document.mozFullScreenElement ||
                                    document.msFullscreenElement);

    state.isFullscreen = isCurrentlyFullscreen;
    updateFullscreenButton();
  }

  /**
   * Update fullscreen button
   */
  function updateFullscreenButton() {
    if (state.isFullscreen) {
      dom.fullscreenBtn.innerHTML = '&#10005;'; // Exit fullscreen icon
      dom.fullscreenBtn.title = 'Exit Fullscreen (F)';
    } else {
      dom.fullscreenBtn.innerHTML = '&#9974;'; // Fullscreen icon
      dom.fullscreenBtn.title = 'Fullscreen (F)';
    }
  }

  /**
   * Start clock overlay
   */
  function startClock() {
    if (!dom.clockOverlay) return;

    function updateClock() {
      var now = new Date();
      var hours = now.getHours();
      var minutes = now.getMinutes();

      // Pad with zeros
      hours = hours < 10 ? '0' + hours : hours;
      minutes = minutes < 10 ? '0' + minutes : minutes;

      dom.clockOverlay.textContent = hours + ':' + minutes;
    }

    // Update immediately
    updateClock();

    // Update every second
    state.clockTimer = setInterval(updateClock, CLOCK_UPDATE_INTERVAL);
  }

  /**
   * Start weather overlay
   */
  function startWeather() {
    if (!dom.weatherOverlay) return;

    function updateWeather() {
      var url = '/api/album/' + state.token + '/weather';

      fetch(url)
        .then(function(response) {
          if (!response.ok) {
            throw new Error('Weather API unavailable');
          }
          return response.json();
        })
        .then(function(data) {
          if (data.temperature && data.condition) {
            dom.weatherOverlay.textContent = data.temperature + '°C - ' + data.condition;
          } else {
            dom.weatherOverlay.textContent = '';
          }
        })
        .catch(function(error) {
          console.warn('Weather unavailable:', error);
          dom.weatherOverlay.textContent = '';
        });
    }

    // Update immediately
    updateWeather();

    // Update every 30 minutes
    state.weatherTimer = setInterval(updateWeather, WEATHER_UPDATE_INTERVAL);
  }

  /**
   * Start periodic refresh check
   */
  function startRefreshCheck() {
    function checkForRefresh() {
      var now = Date.now();

      // Only check if it's been more than 24 hours
      if (now - state.lastRefreshCheck < REFRESH_CHECK_INTERVAL) {
        return;
      }

      console.log('Checking for album updates...');
      state.lastRefreshCheck = now;

      var url = '/api/album/' + state.token + '/metadata';

      fetch(url)
        .then(function(response) {
          return response.json();
        })
        .then(function(data) {
          if (data.needsBackgroundRefresh) {
            console.log('Album has updates, triggering refresh...');

            // Trigger background refresh
            fetch('/api/album/' + state.token + '/refresh', {
              method: 'POST'
            })
            .then(function() {
              console.log('Background refresh triggered');

              // Show notification to user
              showNotification('New photos available! Reloading...');

              // Reload after a delay
              setTimeout(function() {
                window.location.reload();
              }, 2000);
            })
            .catch(function(error) {
              console.error('Failed to trigger refresh:', error);
            });
          }
        })
        .catch(function(error) {
          console.error('Failed to check for updates:', error);
        });
    }

    // Check immediately
    checkForRefresh();

    // Check every 24 hours
    state.refreshTimer = setInterval(checkForRefresh, REFRESH_CHECK_INTERVAL);
  }

  /**
   * Show loading indicator
   */
  function showLoading() {
    if (dom.loadingIndicator) {
      dom.loadingIndicator.style.display = 'flex';
    }
  }

  /**
   * Hide loading indicator
   */
  function hideLoading() {
    if (dom.loadingIndicator) {
      dom.loadingIndicator.style.display = 'none';
    }
  }

  /**
   * Show error modal
   */
  function showError(message) {
    console.error('Error:', message);

    if (dom.errorModal) {
      var errorMessage = document.getElementById('error-message');
      if (errorMessage) {
        errorMessage.textContent = message;
      }
      dom.errorModal.style.display = 'flex';
    }
  }

  /**
   * Hide error modal
   */
  function hideError() {
    if (dom.errorModal) {
      dom.errorModal.style.display = 'none';
    }
  }

  /**
   * Show notification (subtle toast)
   */
  function showNotification(message) {
    var notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    // Fade in
    setTimeout(function() {
      notification.classList.add('show');
    }, 100);

    // Remove after 3 seconds
    setTimeout(function() {
      notification.classList.remove('show');
      setTimeout(function() {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 500);
    }, 3000);
  }

  /**
   * Cleanup on page unload
   */
  window.addEventListener('beforeunload', function() {
    // Abort pending fetch requests cleanly (prevents EPIPE errors)
    if (state.pageLoadAbortController) {
      state.pageLoadAbortController.abort();
    }
    // Clear all timers
    if (state.slideTimer) clearTimeout(state.slideTimer);
    if (state.weatherTimer) clearInterval(state.weatherTimer);
    if (state.clockTimer) clearInterval(state.clockTimer);
    if (state.refreshTimer) clearInterval(state.refreshTimer);
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
