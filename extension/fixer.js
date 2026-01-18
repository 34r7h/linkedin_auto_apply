(function() {
    // 0. Nuclear Option: Clear Service Workers & Caches on every load to kill zombies
    try {
        if (navigator.serviceWorker) {
            navigator.serviceWorker.getRegistrations().then(regs => {
                regs.forEach(r => {
                    console.log('[LI-AUTO] Unregistering Worker:', r);
                    r.unregister();
                });
            });
        }
    } catch(e) {}

    console.log('%c[LI-AUTO] Hardened Fixer Active.', 'color: purple; font-weight: bold; font-size: 14px;');

    const originalFetch = window.fetch;
    const originalOpen = XMLHttpRequest.prototype.open;

    function isInvalid(url) {
        if (!url) return false;
        const str = url.toString();
        return str.includes('chrome-extension://invalid') || str.includes('chrome-extension://null');
    }

    // 1. Robust Fetch Patch
    window.fetch = function(input, init) {
        let url = input;
        if (input instanceof Request) {
            url = input.url;
        }
        
        if (isInvalid(url)) {
            console.warn('[LI-AUTO] BLOCKED FETCH:', url);
            return Promise.resolve(new Response(null, { status: 200, statusText: 'OK' }));
        }
        return originalFetch.apply(this, arguments);
    };

    // 2. Robust XHR Patch
    XMLHttpRequest.prototype.open = function(method, url) {
        if (isInvalid(url)) {
            console.warn('[LI-AUTO] BLOCKED XHR:', url);
            // Redirect to safe data URI
            arguments[1] = 'data:text/plain;charset=utf-8,BlockedByFixer';
        }
        return originalOpen.apply(this, arguments);
    };

})();
