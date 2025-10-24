/**
 * Pildiraam - Digital Photo Frame Slideshow
 * ES5-compatible JavaScript for iOS 9 Safari support
 *
 * This is a stub implementation - full functionality to be implemented in Phase 7
 */

(function() {
  'use strict';

  // Get configuration from global scope (set in slideshow.html)
  var config = window.PILDIRAAM_CONFIG || {};

  console.log('Slideshow script loaded', config);

  // Basic API endpoint test
  if (config.token) {
    // Test metadata endpoint
    fetch('/api/album/' + config.token + '/metadata')
      .then(function(response) {
        return response.json();
      })
      .then(function(data) {
        console.log('Metadata loaded:', data);

        // Update UI with album info
        var app = document.getElementById('app');
        if (app && data.metadata) {
          app.innerHTML = '<div class="loading"><h1>' +
            (data.metadata.streamName || 'Album Loaded') +
            '</h1><p>Slideshow implementation coming in Phase 7...</p></div>';
        }
      })
      .catch(function(error) {
        console.error('Failed to load metadata:', error);
        var app = document.getElementById('app');
        if (app) {
          app.innerHTML = '<div class="error"><h1>Error</h1><p>Failed to load album: ' +
            error.message + '</p></div>';
        }
      });
  } else {
    console.error('No album token provided');
    var app = document.getElementById('app');
    if (app) {
      app.innerHTML = '<div class="error"><h1>Error</h1><p>No album token provided</p></div>';
    }
  }
})();
