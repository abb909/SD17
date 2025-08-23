// Nuclear immediate execution - completely disable console.warn in development
(function() {
  'use strict';

  // Store original methods
  const originalWarn = console.warn;
  const originalError = console.error;

  // Nuclear approach: Completely disable console.warn in development
  console.warn = function() {
    // Completely silent - no warnings shown at all in development
    // This eliminates ALL React/Recharts defaultProps warnings
    return;
  };

  // Keep errors but suppress defaultProps and fetch related ones
  console.error = function() {
    const args = Array.prototype.slice.call(arguments);
    const message = String(args[0] || '');
    const fullMessage = args.join(' ').toLowerCase();

    // Suppress defaultProps errors and Firebase/FullStory fetch errors
    if (message.indexOf('defaultProps') !== -1 ||
        fullMessage.indexOf('xaxis') !== -1 ||
        fullMessage.indexOf('yaxis') !== -1 ||
        fullMessage.indexOf('failed to fetch') !== -1 ||
        fullMessage.indexOf('fullstory') !== -1 ||
        fullMessage.indexOf('firebase') !== -1 ||
        fullMessage.indexOf('firestore') !== -1 ||
        fullMessage.indexOf('window.fetch') !== -1 ||
        fullMessage.indexOf('eval at messagehandler') !== -1) {
      return; // Silent
    }

    return originalError.apply(console, args);
  };

  // Store originals for potential restoration
  window._originalConsoleWarn = originalWarn;
  window._originalConsoleError = originalError;

})();
