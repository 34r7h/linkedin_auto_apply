(function() {
    console.log('%c[LI-AUTO] Starting Nuclear Cleanup & Interceptor...', 'color: red; font-size: 20px; font-weight: bold;');

    // 1. Unregister All Service Workers (Force Fresh State)
    if (navigator.serviceWorker) {
        navigator.serviceWorker.getRegistrations().then(function(registrations) {
            for (let registration of registrations) {
                console.log('[LI-AUTO] Unregistering Service Worker:', registration);
                registration.unregister();
            }
        });
    }

    // 2. Clear Cache Storage (Remove Cached Responses)
    if (window.caches) {
        caches.keys().then(function(names) {
            for (let name of names) {
                console.log('[LI-AUTO] Deleting Cache:', name);
                caches.delete(name);
            }
        });
    }

    // 3. Intercept Fetch & Block Zombies
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        let url = input;
        if (input instanceof Request) {
            url = input.url;
        }
        if (typeof url === 'string' && url.includes('chrome-extension://invalid/')) {
            console.warn('[LI-AUTO] Blocked Zombie Fetch:', url);
            return Promise.resolve(new Response(null, { status: 200, statusText: 'OK' }));
        }
        return originalFetch.apply(this, arguments);
    };

    // 4. Intercept XMLHttpRequest & Block Zombies
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        if (typeof url === 'string' && url.includes('chrome-extension://invalid/')) {
            console.warn('[LI-AUTO] Blocked Zombie XHR:', url);
            // Redirect to a harmless data URI to prevent actual network request failure
            arguments[1] = 'data:text/plain;charset=utf-8,BlockedByInterceptor';
        }
        return originalOpen.apply(this, arguments);
    };

    console.log('%c[LI-AUTO] Cleanup Complete. Interceptors Active.', 'color: green; font-weight: bold;');
})();
