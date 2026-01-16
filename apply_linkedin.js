const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Configuration
const RESUME_PATH = '/Users/34r7h/Downloads/Mark Candaras Resume.pdf';
const JOB_COLLECTION_URL = 'https://www.linkedin.com/jobs/collections/recommended';

// User Profile Data (Extracted from resume)
const USER_PROFILE = {
    firstName: 'Mark',
    lastName: 'Candaras',
    email: 'mark@xmbl.org',
    phone: '555-555-5555', // Placeholder - User should update or script will ask? 
    // We'll try to detect what's filled or default to this.
    experience: {
        'rust': 5,
        'javascript': 4,
        'solidity': 6,
        'react': 4,
        'node': 4,
        'blockchain': 6
    }
};

(async () => {
    console.log('Starting LinkedIn Easy Apply Automation...');
    
    // Launch browser with head (so user can see/interact)
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized'],
        userDataDir: path.join(__dirname, 'user_data') // Persist session
    });

    const page = await browser.newPage();

    // 1. Authenticate
    console.log(`Navigating to ${JOB_COLLECTION_URL}...`);
    // Relaxed wait condition and increased timeout
    await page.goto(JOB_COLLECTION_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Better Login Detection
    // Check if URL suggests login or if "Me" icon is missing
    const isLoginPage = page.url().includes('login') || page.url().includes('signup');
    const hasProfileIcon = await page.$('.global-nav__me-photo');
    
    if (isLoginPage || !hasProfileIcon) {
        console.log('⚠️ Login required (detected login URL or missing profile icon).');
        console.log('👉 Please log in manually in the browser window.');
        
        // Wait for successful login (navigating to feed or jobs)
        // We wait until URL does NOT include login AND we have a profile icon (or feed/jobs container)
        try {
            await page.waitForFunction(() => {
                return !window.location.href.includes('login') && 
                       !window.location.href.includes('signup') &&
                       document.querySelector('.global-nav__me-photo');
            }, { timeout: 300000 }); // Give 5 minutes to login
            console.log('✅ Login detected!');
        } catch (e) {
            console.log('❌ Timed out waiting for login. Continuing anyway to see if we can scrape...');
        }
    } else {
        console.log('✅ Appears to be logged in (Profile icon found).');
    }

    // Ensure we are on the jobs page after potential login redirect
    if (!page.url().includes('jobs/collections')) {
        console.log('Navigating back to jobs page...');
        await page.goto(JOB_COLLECTION_URL, { waitUntil: 'domcontentloaded' });
    }

    // 2. Identify Easy Apply Jobs
    console.log('Scanning for Easy Apply jobs...');
    
    try {
        await page.waitForSelector('.job-card-container', { timeout: 30000 });
        console.log('Found job cards.');
    } catch (e) {
        console.error('❌ Could not find .job-card-container.');
        await browser.close();
        return;
    }

    // Process jobs in a loop with scrolling
    const PROCESSED_JOBS = new Set();
    let noNewJobsCount = 0;

    // Try to find the scrollable container. 
    // It's usually .jobs-search-results-list OR the window itself for some views
    const scrollContainerSelector = '.jobs-search-results-list';
    
    // Check if container exists, else we scroll window
    const hasScrollContainer = await page.$(scrollContainerSelector);

    while (true) {
        // Select current cards
        const jobCards = await page.$$('.job-card-container');
        console.log(`Visible job cards: ${jobCards.length}`);

        let newJobsFoundInThisBatch = 0;

        for (let i = 0; i < jobCards.length; i++) {
            try {
                // Re-query to avoid stale elements
                const cards = await page.$$('.job-card-container');
                const card = cards[i];
                if (!card) continue;

                // Get ID or unique text to avoid duplicates
                const jobId = await page.evaluate(el => el.getAttribute('data-job-id') || el.innerText.split('\n')[0], card);
                if (PROCESSED_JOBS.has(jobId)) continue;
                
                PROCESSED_JOBS.add(jobId);
                newJobsFoundInThisBatch++;

                // Scroll card into view
                await page.evaluate(el => el.scrollIntoView(), card);
                
                const jobTitleEl = await card.$('.artdeco-entity-lockup__title');
                const jobTitle = await page.evaluate(el => el.innerText, jobTitleEl);

                // Click to load details
                await card.click();
                await new Promise(r => setTimeout(r, 2000)); // Wait for details

                // Check for Easy Apply
                const easyApplyBtn = await page.$('.jobs-apply-button--top-card button');
                const btnText = easyApplyBtn ? await page.evaluate(el => el.innerText, easyApplyBtn) : '';
                
                if (easyApplyBtn && btnText.includes('Easy Apply')) {
                    console.log(`[CANDIDATE] ${jobTitle}`);
                    await applyToJob(page, easyApplyBtn);
                } else {
                    console.log(`[SKIP] ${jobTitle}`);
                }
            } catch (err) {
                // Ignore stale element errors
            }
        }

        if (newJobsFoundInThisBatch === 0) {
            noNewJobsCount++;
            if (noNewJobsCount > 3) {
                console.log('No new jobs found after scrolling multiple times. Finishing.');
                break;
            }
        } else {
            noNewJobsCount = 0;
        }

        console.log('Scrolling for more jobs...');
        if (hasScrollContainer) {
            await page.evaluate(selector => {
                const el = document.querySelector(selector);
                if (el) el.scrollTop = el.scrollHeight;
            }, scrollContainerSelector);
        } else {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        }
        
        await new Promise(r => setTimeout(r, 4000)); // Wait for load
    }
    
    console.log(`Done. Processed ${PROCESSED_JOBS.size} unique jobs.`);
    // await browser.close();
})();

async function applyToJob(page, applyBtn) {
    try {
        console.log('  -> Clicking Easy Apply...');
        // Try JS click as it's often more reliable
        await page.evaluate(b => b.click(), applyBtn);
        
        // Wait for modal (more generic selector first)
        try {
            await page.waitForSelector('.artdeco-modal', { timeout: 5000 });
            console.log('  -> Modal opened.');
        } catch (e) {
             console.log('  -> Modal did not open with .artdeco-modal. Trying text search or longer wait...');
             // Retry click?
             await applyBtn.click();
             await page.waitForSelector('.artdeco-modal', { timeout: 5000 });
        }
        
        // Now wait for specific content or just proceed
        // .jobs-easy-apply-content might be too specific or changed?
        // Let's look for the "Next" or "Submit" buttons directly as valid indicators
        // or just the modal wrapper
        const modal = await page.$('.artdeco-modal');
        if (!modal) throw new Error('Modal not found');

        // Loop through form pages
        let isOpen = true;
        while (isOpen) {
             // Take a breather
             await new Promise(r => setTimeout(r, 1000));
            // Check for "Submit application" button
            const submitBtn = await page.$('button[aria-label="Submit application"]');
            if (submitBtn) {
                console.log('  -> Review page reached. Submitting...');
                await submitBtn.click();
                await page.waitForSelector('.artdeco-modal__dismiss', { timeout: 5000 }); // Wait for success/dismiss
                console.log('  -> ✅ Application Submitted!');
                
                // Dismiss success modal
                const dismiss = await page.$('.artdeco-modal__dismiss');
                if (dismiss) await dismiss.click();
                return;
            }

            // Check for "Review" button (next step)
            const reviewBtn = await page.$('button[aria-label="Review your application"]');
            if (reviewBtn) {
                 console.log('  -> Review button found. Clicking...');
                 await reviewBtn.click();
                 await new Promise(r => setTimeout(r, 1000));
                 continue;
            }

            // Check for "Next" button
            const nextBtn = await page.$('button[aria-label="Continue to next step"]');
            
            // Handle Form Fields before clicking Next
            await fillFormFields(page);

            if (nextBtn) {
                console.log('  -> Clicking Next...');
                await nextBtn.click();
                await new Promise(r => setTimeout(r, 1000));
            } else {
                // If no Next/Review/Submit, maybe we are stuck or finished?
                // Check for errors
                const errors = await page.$$('.artdeco-inline-feedback--error');
                if (errors.length > 0) {
                    console.log('  -> ❌ Form has blocking errors. Cannot proceed automatically.');
                    // Close modal and discard
                    const closeBtn = await page.$('.artdeco-modal__dismiss');
                    if (closeBtn) await closeBtn.click();
                    const discardBtn = await page.$('button[data-control-name="discard_application_confirm_btn"]'); // potential selector
                    // If discard confirmation pops up
                   await new Promise(r => setTimeout(r, 1000));
                   const confirmDiscard = await page.$('button[data-test-dialog-primary-action]');
                   if (confirmDiscard) await confirmDiscard.click();

                    return;
                }
                
                // Safety break
                break;
            }
        }

    } catch (e) {
        console.log('  -> Error during application:', e.message);
        // Try to close modal
        try {
            const closeBtn = await page.$('.artdeco-modal__dismiss');
            if (closeBtn) await closeBtn.click();
        } catch (ignored) {}
    }
}

async function fillFormFields(page) {
    console.log('    -> Scanning form fields...');

    // 1. Text/Number Inputs
    const inputs = await page.$$('input[type="text"], input[type="number"], input:not([type])');
    for (const input of inputs) {
        // Check visibility
        const isVisible = await page.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style && style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
        }, input);
        if (!isVisible) continue;

        const val = await page.evaluate(el => el.value, input);
        if (val) continue; // Already filled

        // Get label text
        const labelStr = await page.evaluate(el => {
            const id = el.id;
            if (id) {
                const label = document.querySelector(`label[for="${id}"]`);
                if (label) return label.innerText;
            }
            // Try closest label or parent text
            return el.closest('label')?.innerText || '';
        }, input);
        
        const lowerLabel = labelStr.toLowerCase();
        console.log(`    -> Text Input: "${labelStr}"`);

        // Heuristics
        if (lowerLabel.includes('first name')) await input.type(USER_PROFILE.firstName);
        else if (lowerLabel.includes('last name')) await input.type(USER_PROFILE.lastName);
        else if (lowerLabel.includes('phone') || lowerLabel.includes('mobile')) await input.type(USER_PROFILE.phone);
        else if (lowerLabel.includes('linkedin')) await input.type('https://linkedin.com/in/markcandaras'); // Example
        else if (lowerLabel.includes('website') || lowerLabel.includes('portfolio')) await input.type('https://xmbl.org');
        else if (lowerLabel.includes('years') || lowerLabel.includes('experience')) {
            // Check specific techs
            let years = '5'; // Default "Senior" level
            for (const [tech, yr] of Object.entries(USER_PROFILE.experience)) {
                if (lowerLabel.includes(tech)) {
                    years = yr.toString();
                    break;
                }
            }
            await input.type(years);
        } else if (lowerLabel.includes('city')) await input.type('New York, NY'); // Default
        else {
             // Generic fallback for strict validation?
             // If number required
             await input.type('5'); 
        }
    }

    // 2. Select Dropdowns (New)
    const selects = await page.$$('select');
    for (const select of selects) {
        const val = await page.evaluate(el => el.value, select);
        if (val && val !== 'Select an option' && val !== "") continue;

        const labelStr = await page.evaluate(el => {
            const id = el.id;
            if (id) {
                const label = document.querySelector(`label[for="${id}"]`);
                if (label) return label.innerText;
            }
            return el.closest('label')?.innerText || '';
        }, select);
        const lowerLabel = labelStr.toLowerCase();
        console.log(`    -> Select: "${labelStr}"`);

        // Try to select "Yes" or sane default
        const options = await page.evaluate(el => Array.from(el.options).map(o => ({text: o.text, value: o.value})), select);
        
        // Find best option
        let targetVal = null;
        const yesOpt = options.find(o => o.text.toLowerCase().includes('yes'));
        const usOpt = options.find(o => o.text.toLowerCase().includes('united states'));
        
        if (lowerLabel.includes('citizen') || lowerLabel.includes('sponsorship') || lowerLabel.includes('authorized')) {
             if (lowerLabel.includes('sponsorship')) {
                 // Usually "No" to "Will you require sponsorship?"
                 const noOpt = options.find(o => o.text.toLowerCase().includes('no'));
                 if (noOpt) targetVal = noOpt.value;
             } else {
                 // Usually "Yes" to "Authorized?" or "Citizen?"
                 if (yesOpt) targetVal = yesOpt.value;
             }
        }
        
        // Fallback: Pick first valid option that isn't placeholder
        if (!targetVal) {
             const validOpt = options.find(o => o.value && !o.text.includes('Select'));
             if (validOpt) targetVal = validOpt.value;
        }

        if (targetVal) {
            await page.select(`select#${await page.evaluate(el => el.id, select)}`, targetVal);
            // Or use puppeteer element handle
            // await select.type(targetVal) sometimes works for dropdowns in weird frameworks, but page.select is standard
        }
    }

    // 3. Radio Buttons
    const fieldsets = await page.$$('fieldset');
    for (const fieldset of fieldsets) {
        const legend = await page.evaluate(el => el.querySelector('legend')?.innerText, fieldset);
        if (!legend) continue;
        
        // Check if already selected
        const isSelected = await fieldset.$('input[checked]');
        if (isSelected) continue;

        console.log(`    -> Radio Fieldset: "${legend}"`);
        
        let targetText = 'Yes';
        if (legend.toLowerCase().includes('sponsorship')) {
            targetText = 'No';
        }

        // Click the label containing the target text
        const labels = await fieldset.$$('label');
        let clicked = false;
        for (const label of labels) {
            const text = await page.evaluate(el => el.innerText.trim(), label);
            if (text.toLowerCase() === targetText.toLowerCase()) {
                await label.click();
                clicked = true;
                break;
            }
        }
        
        if (!clicked) {
             // Fallback: Try to find input with value
             try {
                const input = await fieldset.$(`input[value="${targetText}"]`);
                if (input) await page.evaluate(el => el.click(), input);
             } catch(e) {}
        }
    }

    // 4. Checkboxes (e.g. Terms of Service, "I agree")
    const checkboxes = await page.$$('input[type="checkbox"]');
    for (const checkbox of checkboxes) {
         const isChecked = await page.evaluate(el => el.checked, checkbox);
         if (isChecked) continue;
         
         const label = await page.evaluate(el => {
            const id = el.id;
            return id ? document.querySelector(`label[for="${id}"]`)?.innerText : el.closest('label')?.innerText;
         }, checkbox);
         
         if (label && (label.toLowerCase().includes('agree') || label.toLowerCase().includes('allow') || label.toLowerCase().includes('confirm'))) {
             await checkbox.click();
         }
    }

    // 5. File Upload (Resume)
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
        try {
            await fileInput.uploadFile(RESUME_PATH);
            console.log('    -> Uploaded resume.');
        } catch (e) {}
    }
}
