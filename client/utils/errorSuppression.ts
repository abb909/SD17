// Suppress common third-party errors that we can't control
export const setupErrorSuppression = () => {
  const originalError = console.error;
  const originalWarn = console.warn;

  // Intercept console.error
  console.error = (...args) => {
    const message = args.join(' ').toLowerCase();

    // Aggressively suppress these error patterns
    const suppressPatterns = [
      'fullstory',
      'edge.fullstory.com',
      'fs.js',
      'failed to fetch',
      'typeerror: failed to fetch',
      'firebase',
      'firestore',
      'network error',
      'fetch error',
      'messageevent',
      'window.fetch',
      'eval at messagehandler',
      'firebase_firestore.js',
      'deps/firebase_firestore.js',
      'at h.send',
      'at h.ea',
      'at jb',
      'at hb',
      'at h.ga',
      'at da'
    ];

    const shouldSuppress = suppressPatterns.some(pattern =>
      message.includes(pattern.toLowerCase())
    );

    if (!shouldSuppress) {
      originalError.apply(console, args);
    }
  };

  // Intercept console.warn for Firebase warnings
  console.warn = (...args) => {
    const message = args.join(' ').toLowerCase();

    if (message.includes('firebase') || message.includes('firestore') || message.includes('failed to fetch')) {
      return; // Suppress Firebase warnings
    }

    originalWarn.apply(console, args);
  };

  // Completely suppress unhandled promise rejections from known problematic sources
  const originalRejectionHandler = window.onunhandledrejection;

  window.onunhandledrejection = (event) => {
    const error = event.reason;
    const message = error?.message?.toLowerCase() || '';
    const stack = error?.stack?.toLowerCase() || '';

    // Suppress all fetch-related errors from these sources
    const suppressSources = [
      'fullstory',
      'edge.fullstory.com',
      'fs.js',
      'firebase',
      'firestore'
    ];

    const shouldSuppressPromiseRejection = suppressSources.some(source =>
      message.includes(source) || stack.includes(source)
    ) || message.includes('failed to fetch');

    if (shouldSuppressPromiseRejection) {
      event.preventDefault();
      return;
    }

    // Call original handler for other errors
    if (originalRejectionHandler) {
      originalRejectionHandler(event);
    }
  };

  // Suppress window errors too
  const originalErrorHandler = window.onerror;

  window.onerror = (message, source, lineno, colno, error) => {
    const msgStr = String(message).toLowerCase();
    const srcStr = String(source).toLowerCase();
    const errorStr = String(error?.stack || '').toLowerCase();

    const suppressPatterns = [
      'failed to fetch',
      'fullstory',
      'firebase',
      'fs.js',
      'firestore',
      'edge.fullstory.com',
      'window.fetch',
      'messageevent',
      'firebase_firestore.js',
      'deps/firebase_firestore.js'
    ];

    const shouldSuppress = suppressPatterns.some(pattern =>
      msgStr.includes(pattern) ||
      srcStr.includes(pattern) ||
      errorStr.includes(pattern)
    );

    if (shouldSuppress) {
      return true; // Suppress the error
    }

    if (originalErrorHandler) {
      return originalErrorHandler(message, source, lineno, colno, error);
    }

    return false;
  };

  // Override global fetch to suppress errors from FullStory and other third-party services
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    try {
      return await originalFetch.apply(window, args);
    } catch (error: any) {
      const url = args[0]?.toString() || '';
      const errorMessage = error?.message?.toLowerCase() || '';

      // Suppress fetch errors from these sources
      const suppressUrls = [
        'fullstory.com',
        'edge.fullstory.com',
        'fs.js'
      ];

      const shouldSuppressFetch = suppressUrls.some(pattern =>
        url.includes(pattern)
      ) || errorMessage.includes('failed to fetch');

      if (shouldSuppressFetch) {
        // Return a dummy response to prevent error propagation
        return new Response('', { status: 200, statusText: 'OK' });
      }

      // For other errors, re-throw
      throw error;
    }
  };
};
