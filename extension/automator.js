// automator.js - Client Side Automation Logic
(function() {
    window.liAutomator = window.liAutomator || {};
    let isRunning = false;
    let currentProfileId = null;

    // Helpers
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const waitForEl = (selector, timeout = 5000) => {
        return new Promise((resolve) => {
            if (document.querySelector(selector)) return resolve(document.querySelector(selector));
            
            const observer = new MutationObserver(() => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            
            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    };

    window.liAutomator.start = async (profileId) => {
        if(isRunning) return;
        isRunning = true;
        currentProfileId = profileId;
        console.log('🚀 Automation Started');
        
        // Auto-Login Check
        const isLoggedIn = !!document.querySelector('.global-nav__me-photo') || !!document.querySelector('.global-nav__me');
        if(!isLoggedIn) {
            alert('Please Log In first! The script cannot auto-login in this mode securely.');
            // Or we could ask server for creds and fill them? 
            // For now, let's assume user is logged in since they are "using their browser".
            isRunning = false;
            return;
        }

        loop();
    };

    window.liAutomator.stop = () => {
        isRunning = false;
        console.log('🛑 Automation Stopped');
        window.liAuto.setStatus('Stopped', false);
    };

    async function loop() {
        while(isRunning) {
            // Check if on Jobs Page
            if (!window.location.href.includes('jobs')) {
                window.liAuto.setStatus('Navigating to Jobs...', true);
                window.location.href = 'https://www.linkedin.com/jobs/collections/recommended/'; 
                // Navigation reloads page, script stops. 
                // Extension content script reloads, but state is lost?
                // We need to persist state in storage to resume after reload.
                // For MVP, assume user is on jobs page.
                await sleep(5000); 
                continue; 
            }

            // Find Job Cards
            const cards = Array.from(document.querySelectorAll('.job-card-container'));
            console.log(`Found ${cards.length} cards`);
            
            for(const card of cards) {
                if(!isRunning) break;
                
                try {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.click();
                    await sleep(2000);

                    const easyApplyBtn = document.querySelector('.jobs-apply-button--top-card button');
                    if(easyApplyBtn && easyApplyBtn.innerText.includes('Easy Apply')) {
                        const title = document.querySelector('.artdeco-entity-lockup__title')?.innerText || 'Job';
                        const company = document.querySelector('.artdeco-entity-lockup__subtitle')?.innerText.trim() || 'Unknown';
                        
                        window.liAuto.setStatus(`Applying: ${title}`, true);
                        console.log(`Applying to ${title} at ${company}`);
                        
                        await applyToJob(easyApplyBtn, title, company);
                    }
                } catch(e) {
                    console.error('Card Error', e);
                }
            }

            // Scroll for more
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(4000);
        }
    }

    async function applyToJob(btn, title, company) {
        btn.click();
        const modal = await waitForEl('.artdeco-modal');
        if(!modal) return;

        let active = true;
        while(active && isRunning) {
            await sleep(1000);

            // Submit?
            const submitBtn = document.querySelector('button[aria-label="Submit application"]');
            if(submitBtn) {
                submitBtn.click();
                await sleep(2000); // Wait for submit
                
                // Dismiss modal
                const dismiss = document.querySelector('.artdeco-modal__dismiss');
                if(dismiss) dismiss.click();

                // Log Success via Server
                chrome.runtime.sendMessage({
                    type: 'LOG_APPLICATION',
                    payload: { 
                        title, company, link: window.location.href, status: 'Success' 
                    }
                });
                return;
            }

            // Next/Review?
            const next = document.querySelector('button[aria-label="Continue to next step"]');
            const review = document.querySelector('button[aria-label="Review your application"]');
            
            if(review) review.click();
            else if(next) next.click();
            else {
                // stuck? Check errors
                const errors = document.querySelectorAll('.artdeco-inline-feedback--error');
                if(errors.length > 0) {
                     console.log('Errors found. Closing.');
                     const close = document.querySelector('.artdeco-modal__dismiss');
                     if(close) close.click();
                     return;
                }
            }
        }
    }

})();
