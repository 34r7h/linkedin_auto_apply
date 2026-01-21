// automation.js - In-Browser Automation Logic

// Listen for messages from Overlay or Background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_AUTOMATION_CLIENT') {
        console.log('[AUTO] Starting client-side automation...');
        startAutomation(msg.profile, msg.config);
    } else if (msg.type === 'STOP_AUTOMATION_CLIENT') {
        console.log('[AUTO] Stopping automation...');
        isRunning = false;
    }
});

let isRunning = false;

async function startAutomation(profile, config) {
    if (isRunning) return;
    isRunning = true;
    
    log('🚀 Starting Automation Loop (Continuous)...', 'info');

    try {
        let appliedCount = 0;

        // Selector for job cards in the left sidebar
        const JOB_CARD_SEL = '.jobs-search-results__list-item, .job-card-container';
        
        // Initial wait for list
        await delay(2000);

        // Get initial count to iterate
        const jobCards = Array.from(document.querySelectorAll(JOB_CARD_SEL));
        
        if (jobCards.length === 0) {
            log('No job list found. Running single job mode.', 'warning');
            const result = await runSingleJob(profile);
            if (result) log('✅ Single Job Done.', 'success');
            return;
        }

        // Ping check to ensure context is valid
        try {
            await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
                    if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                    else resolve(response);
                });
            });
        } catch (e) {
            alert('Extension Context Invalidated! Please REFRESH the page.');
            return;
        }

        log(`Found ${jobCards.length} jobs in sidebar.`, 'info');

        for (let i = 0; i < jobCards.length; i++) {
            if (!isRunning) {
                log('🛑 Automation Stopped by User.', 'warning');
                break;
            }

            // Re-select to avoid stale elements
            const currentCards = Array.from(document.querySelectorAll(JOB_CARD_SEL));
            const card = currentCards[i];
            
            if (!card) continue;

            // Check if this job card has Easy Apply indicator BEFORE clicking
            const hasEasyApply = card.querySelector('.job-card-container__apply-method') || 
                                 card.querySelector('[class*="easy-apply"]') ||
                                 card.innerText.toLowerCase().includes('easy apply');
            
            // Skip jobs without Easy Apply badge (external applications)
            if (!hasEasyApply) {
                log(`⏭️ Job ${i + 1}: No Easy Apply - skipping external link`, 'info');
                continue;
            }

            // Scroll into view
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Click the job card
            const clickable = card.querySelector('a.job-card-container__link') || card;
            clickable.click();
            
            log(`Processing Job ${i + 1}/${jobCards.length} (Easy Apply)...`, 'info');
            await delay(3000); // Wait for right pane to load

            // Double-check the job detail pane has Easy Apply button
            const applyBtn = document.querySelector('.jobs-apply-button');
            const isEasyApply = applyBtn && (
                applyBtn.innerText.toLowerCase().includes('easy apply') ||
                applyBtn.querySelector('svg[data-test-icon="linkedin-bug"]') ||
                !applyBtn.closest('a[href*="externalApply"]')
            );

            if (!isEasyApply) {
                log(`⏭️ Job ${i + 1}: External application link - skipping`, 'info');
                continue;
            }

            // Run Job Logic
            const success = await runSingleJob(profile);
            
            if (success) {
                appliedCount++;
                log(`✅ Application sent! Total: ${appliedCount}`, 'success');
                await delay(2000);
            } else {
                log('⏭️ Skipping job (Failed or Already Applied).', 'info');
            }
        }

    } catch (e) {
        console.error(e);
        log(`Error in Loop: ${e.message}`, 'error');
    } finally {
        isRunning = false;
        log('Automation Cycle Finished.', 'info');
    }
}

async function runSingleJob(profile) {
    try {
        const applyBtn = document.querySelector('.jobs-apply-button');
        
        if (!applyBtn) {
            log('No Apply button found.', 'warning');
            return false;
        }

        // Check if it's an external link (not Easy Apply)
        const btnText = applyBtn.innerText.toLowerCase();
        const isExternal = btnText.includes('apply') && !btnText.includes('easy apply');
        const hasExternalLink = applyBtn.closest('a[target="_blank"]') || 
                                applyBtn.getAttribute('data-job-id') === null;
        
        // Also check for "Applied" state
        const alreadyApplied = btnText.includes('applied') || 
                              document.querySelector('.jobs-s-apply__application-link');

        if (alreadyApplied) {
            log('Already applied to this job.', 'info');
            return false;
        }

        if (isExternal || hasExternalLink) {
            log('External application link detected - skipping.', 'info');
            return false;
        }

        log('Found Easy Apply Button. Clicking...', 'info');
        applyBtn.click();
        await delay(2000);
        
        // Handle Modal
        const result = await handleModal(profile);
        return result; // True if submitted, False if closed/failed
    } catch (e) {
        log(`Job Error: ${e.message}`, 'error');
        return false;
    }
}

// Helpers
function log(msg, type='info') {
    console.log(`[AUTO] ${msg}`);
    chrome.runtime.sendMessage({ 
        type: 'RELAY_TO_TAB', 
        payload: { type: 'LOG', payload: { msg, type } } 
    }).catch(() => {});
}

async function handleModal(profile) {
    const MAX_STEPS = 25;
    let steps = 0;
    const SEL_MODAL = '.jobs-easy-apply-content, .jobs-easy-apply-modal'; 
    
    // Wait for modal to appear
    let modal = null;
    for(let w=0; w<5; w++) {
        modal = document.querySelector(SEL_MODAL);
        if(modal) break;
        await delay(1000);
    }
    if (!modal) return false;

    let qaLog = []; // Init once per modal tracking

    while (steps < MAX_STEPS) {
        steps++;
        await delay(1500);
        
        modal = document.querySelector(SEL_MODAL);
        if (!modal) {
             log('Modal closed by itself.', 'info');
             return true; 
        }

        if (document.querySelector('.artdeco-inline-feedback--error')) {
            log('⚠️ Form Validation Error. Waiting 5s for manual fix...', 'warning');
            await delay(5000);
        }

        const buttons = Array.from(modal.querySelectorAll('button'));
        const nextBtn = buttons.find(b => b.innerText.includes('Next') || b.getAttribute('aria-label')?.includes('Continue'));
        const reviewBtn = buttons.find(b => b.innerText.includes('Review') || b.getAttribute('aria-label')?.includes('Review'));
        const submitBtn = buttons.find(b => b.innerText.includes('Submit') || b.getAttribute('aria-label')?.includes('Submit'));

        // Fill Data
        // Fill Data
        // qaLog passed from outer scope
        const fillResult = await fillInputs(modal, profile, qaLog);
        if (fillResult === 'user_required') {
            log('⚠️ Unknown fields! Pausing 5s for YOU to fill...', 'warning');
            await delay(5000);
            continue; 
        }

        // Navigate
        if (submitBtn) {
            if(!reviewBtn) { 
                 log('Submitting Application...', 'success');
                 submitBtn.click();
                 await delay(3000); 
                 
                // Save History
                 const jobTitle = document.querySelector('.job-details-jobs-unified-top-card__job-title')?.innerText || 'Unknown Job';
                 const company = document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText || 'Unknown Company';
                 const link = window.location.href;
                 
                 chrome.runtime.sendMessage({
                    type: 'SAVE_JOB_HISTORY',
                    payload: { 
                        title: jobTitle, 
                        company, 
                        link, 
                        profileId: profile.id,
                        log: qaLog
                    }
                 });

                 // Dismiss the success modal
                 const dismiss = document.querySelector('button[aria-label="Dismiss"]');
                 if(dismiss) dismiss.click();
                 
                 await delay(1000);
                 return true;
            }
            // If Review button exists alongside Submit, click Review first (usually handled by else if)
             reviewBtn.click();
        } else if (reviewBtn) {
            reviewBtn.click();
        } else if (nextBtn) {
            nextBtn.click();
        } else {
             // ... existing stuck logic
            log('No nav buttons. Stuck?', 'warning');
            if(document.querySelector('.artdeco-modal__header')?.innerText.toLowerCase().includes('success')) {
                return true; 
            }
             await delay(2000);
        }
    }
    return false;
}

// --- AI & Helpers ---

async function getAIAnswer(question, context, profile) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 30000);
        const listener = (msg) => {
            if (msg.type === 'ANSWER_GENERATED' && msg.payload.question === question) {
                chrome.runtime.onMessage.removeListener(listener);
                clearTimeout(timeout);
                resolve(msg.payload.answer);
            }
        };
        chrome.runtime.onMessage.addListener(listener);

        log(`Asking AI: ${question.substring(0, 30)}...`, 'info');
        chrome.runtime.sendMessage({
            type: 'GENERATE_ANSWER',
            payload: { question, context, profile }
        });
    });
}

function saveLearnedAnswer(profileId, question, answer) {
    if (!answer) return;
    chrome.runtime.sendMessage({
        type: 'SAVE_ANSWER',
        payload: { profileId, question, answer }
    });
}

async function fillInputs(modal, profile, qaLog) {
    if (!modal) return 'done';
    let userActionRequired = false;

    // 1. Inputs & Textareas
    const textuals = Array.from(modal.querySelectorAll('input[type="text"], input[type="number"], textarea'));
    for (const el of textuals) {
        if (el.offsetParent === null) continue;
        const question = getLabel(el);
        if (!question) continue;

        // Learn from filled fields (User or LinkedIn pre-fill)
        if (el.value && el.value.trim().length > 0) {
            // If we don't have this answer cached, save it!
            if (!profile.questionCache || !profile.questionCache[question]) {
                 saveLearnedAnswer(profile.id, question, el.value);
            }
            if(qaLog) qaLog.push({ question, answer: el.value, type: 'pre-fill' });
            continue; 
        }

        const answer = await getAIAnswer(question, { type: 'text' }, profile);
        if (answer) {
            el.value = answer;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            if(qaLog) qaLog.push({ question, answer, type: 'ai' });
            el.dispatchEvent(new Event('change', { bubbles: true }));
            log(`Filled: ${question.substring(0,15)}...`, 'success');
            saveLearnedAnswer(profile.id, question, answer);
        } else {
            if (el.required || question.includes('*')) userActionRequired = true;
        }
    }

    // 2. Selects
    const selects = Array.from(modal.querySelectorAll('select'));
    for (const el of selects) {
        if (el.offsetParent === null) continue;
        const question = getLabel(el);
        
        // Learn from filled
        if (el.value && el.selectedIndex > 0) {
             const selectedText = el.options[el.selectedIndex].text;
             if(qaLog) qaLog.push({ question, answer: selectedText, type: 'pre-fill' });
             if (!profile.questionCache || !profile.questionCache[question]) {
                 saveLearnedAnswer(profile.id, question, selectedText);
             }
             continue;
        }

        const options = Array.from(el.options).map(o => o.text);
        const answer = await getAIAnswer(question || 'Select', { type: 'select', options }, profile);
        
        if (answer) {
            let found = false;
            for (const opt of el.options) {
                if (opt.text.toLowerCase().includes(answer.toLowerCase()) || answer.toLowerCase().includes(opt.text.toLowerCase())) {
                    el.value = opt.value;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    found = true;
                    break;
                }
            }
            if(found) {
                log(`Selected: ${answer}`, 'success');
                if(qaLog) qaLog.push({ question, answer, type: 'ai' });
                saveLearnedAnswer(profile.id, question, answer);
            }
        }
    }

    // 3. Radios
    const fieldsets = Array.from(modal.querySelectorAll('fieldset'));
    for (const fs of fieldsets) {
        const question = getLabel(fs);
        // Learn from filled
        const checked = fs.querySelector('input:checked');
        if (checked) {
             const label = fs.querySelector(`label[for="${checked.id}"]`)?.innerText || checked.value;
             if(qaLog) qaLog.push({ question, answer: label, type: 'pre-fill' });
             if (!profile.questionCache || !profile.questionCache[question]) {
                 saveLearnedAnswer(profile.id, question, label);
             }
             continue;
        }
        
        const labels = Array.from(fs.querySelectorAll('label'));
        const options = labels.map(l => l.innerText.trim());
        
        const answer = await getAIAnswer(question, { type: 'radio', options }, profile);
        if (answer) {
            const match = labels.find(l => l.innerText.toLowerCase().includes(answer.toLowerCase()));
            if (match) {
                try {
                    match.click();
                    log(`Radio: ${answer}`, 'success');
                    if(qaLog) qaLog.push({ question, answer, type: 'ai' });
                    saveLearnedAnswer(profile.id, question, answer);
                } catch(e) { /* Ignore focus errors from LinkedIn */ }
            } else {
                if (question.includes('*') || question.toLowerCase().includes('required')) userActionRequired = true;
            }
        } else {
             if (question.includes('*') || question.toLowerCase().includes('required')) userActionRequired = true;
        }
    }

    return userActionRequired ? 'user_required' : 'done';
}

function getLabel(el) {
    let text = '';
    if (el.tagName === 'FIELDSET') {
        const legend = el.querySelector('legend');
        text = legend ? legend.innerText : el.innerText;
    } else if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        text = label ? label.innerText : '';
    }
    
    if (!text) {
        const group = el.closest('.jobs-easy-apply-form-section__grouping');
        if (group) {
            const title = group.querySelector('.jobs-easy-apply-form-section__group-title');
            text = title ? title.innerText : group.innerText.split('\n')[0];
        } else {
            text = el.placeholder || '';
        }
    }

    // CLEANUP: Remove "Required", "Optional", newlines, and trim
    return text
        .replace(/Required/gi, '')
        .replace(/Optional/gi, '')
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
console.log('LinkedIn Auto-Apply: Automation Loop Loaded');
