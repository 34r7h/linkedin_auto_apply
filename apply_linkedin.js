require('dotenv').config();
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const puppeteer = require('puppeteer');
const AIService = require('./ai_service');

// --- Configuration ---
const PORT = 8080;
const PROFILES_PATH = path.join(__dirname, 'profiles.json');
const HISTORY_PATH = path.join(__dirname, 'applied_jobs.json');
const USER_DATA_DIR = path.join(__dirname, 'puppeteer_data'); // Persist login

// --- State ---
let PROFILES = {};
let AI = new AIService({ provider: 'ollama', model: 'smollm2:1.7b' });
let browser = null; 
let page = null;

// --- Helpers ---
function loadProfiles() {
    if (fs.existsSync(PROFILES_PATH)) {
        try {
            PROFILES = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
            console.log(`[SERVER] Loaded ${Object.keys(PROFILES).length} profiles.`);
        } catch (e) {
            console.error('[SERVER] Error loading profiles:', e);
        }
    }
    return PROFILES;
}

function saveProfile(data) {
    const id = data.id || `custom_${Date.now()}`;
    
    // Ensure new schema fields exist with defaults
    const profile = {
        ...data,
        id,
        experience: data.experience || {},
        questionCache: data.questionCache || {},
        city: data.city || '',
        state: data.state || '',
        country: data.country || '',
        currentCompany: data.currentCompany || '',
        yearsExperience: data.yearsExperience || 0,
        workAuthorization: data.workAuthorization || '',
        sponsorship: data.sponsorship || '',
        willingToRelocate: data.willingToRelocate || ''
    };
    
    PROFILES[id] = profile;
    fs.writeFileSync(PROFILES_PATH, JSON.stringify(PROFILES, null, 2));
    console.log(`[SERVER] Saved profile: ${id}`);
    loadProfiles();
}

function logApplication(data) {
    let history = [];
    if (fs.existsSync(HISTORY_PATH)) {
        try { history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); } catch {}
    }
    history.unshift({ timestamp: new Date().toISOString(), ...data });
    if(history.length > 200) history = history.slice(0, 200);
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    console.log(`[SERVER] 📝 Logged Application: ${data.title}`);
}

// --- Dynamic Question Answering ---
async function getAnswer(question, context, profile, ws, autoSave = false) {
    const normalizedQ = question.toLowerCase().trim();
    
    // 1. Check direct profile fields first
    if (normalizedQ.includes('first name')) return profile.firstName || '';
    if (normalizedQ.includes('last name')) return profile.lastName || '';
    if (normalizedQ.includes('email')) return profile.email || '';
    if (normalizedQ.includes('phone') || normalizedQ.includes('mobile')) return profile.phone || '';
    if (normalizedQ.includes('city')) return profile.city || '';
    if (normalizedQ.includes('linkedin')) return profile.linkedin || '';
    if (normalizedQ.includes('github')) return profile.github || '';
    if (normalizedQ.includes('website') || normalizedQ.includes('portfolio')) return profile.website || '';
    
    // 2. Check technology experience
    if ((normalizedQ.includes('year') || normalizedQ.includes('experience')) && profile.experience) {
        for (const [tech, years] of Object.entries(profile.experience)) {
            if (normalizedQ.includes(tech.toLowerCase())) {
                return years.toString();
            }
        }
    }
    
    // 3. Check work authorization
    if (normalizedQ.includes('sponsor') && normalizedQ.includes('require')) return profile.sponsorship || 'No';
    if (normalizedQ.includes('authorized') || normalizedQ.includes('legal') || normalizedQ.includes('work authorization')) return profile.workAuthorization || 'Yes';
    if (normalizedQ.includes('relocat')) return profile.willingToRelocate || 'Yes';
    
    // 4. Check questionCache
    // Use fuzzy/normalized key
    if (profile.questionCache && profile.questionCache[normalizedQ]) {
        console.log(`📦 Using cached answer for: "${normalizedQ}" (orig: "${question}")`);
        return profile.questionCache[normalizedQ];
    }
    
    // 5. Ask AI to generate answer
    console.log(`🤖 No cached answer found for: "${question}". Asking AI...`);
    const resumeContext = JSON.stringify(profile);
    const aiAnswer = await AI.generateAnswer(question, context, resumeContext);
    
    if (!aiAnswer) {
        console.log('⚠️  AI could not generate answer');
        return null;
    }
    
    // 6. Auto-Save or Request Approval
    if (autoSave) {
        console.log(`[SERVER] 🧠 Learned & Saved: "${question}" -> "${aiAnswer}"`);
        if (!profile.questionCache) profile.questionCache = {};
        profile.questionCache[question] = aiAnswer;
        saveProfile(profile);
        return aiAnswer;
    }

    console.log(`📨 Requesting user approval for answer: "${aiAnswer}"`);
    
    return new Promise((resolve) => {
        ws.send(JSON.stringify({
            type: 'REQUEST_ANSWER',
            payload: {
                question,
                context,
                suggestedAnswer: aiAnswer,
                requiresApproval: true
            }
        }));
        
        const approvalHandler = (msg) => {
            try {
                const data = JSON.parse(msg);
                if (data.type === 'ANSWER_APPROVED' && data.payload.question === question) {
                    const approvedAnswer = data.payload.answer;
                    if (data.payload.saveToProfile) {
                        if (!profile.questionCache) profile.questionCache = {};
                        profile.questionCache[question] = approvedAnswer;
                        saveProfile(profile);
                        console.log(`💾 Saved answer to profile cache: "${question}" -> "${approvedAnswer}"`);
                    }
                    ws.removeListener('message', approvalHandler);
                    resolve(approvedAnswer);
                }
            } catch (e) { console.error(e); }
        };
        
        ws.on('message', approvalHandler);
        setTimeout(() => {
            ws.removeListener('message', approvalHandler);
            console.log('⏰ Answer approval timed out');
            resolve(null);
        }, 60000);
    });
}

// --- Puppeteer Automation ---
// --- Puppeteer Automation ---
async function launchBrowser() {
    if (browser) return browser;
    console.log('[PUPPETEER] Launching Browser...');
    browser = await puppeteer.launch({
        headless: process.env.HEADLESS === 'true' || false,
        userDataDir: USER_DATA_DIR,
        defaultViewport: null,
        args: ['--start-maximized', '--no-sandbox']
    });
    
    // Close handler
    browser.on('disconnected', () => {
        console.log('[PUPPETEER] Browser closed.');
        browser = null;
        page = null;
    });

    return browser;
}

// Helper: Delay
const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function runAutomation(profileId, jobUrl, ws) {
    try {
        const profile = PROFILES[profileId];
        if (!profile) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Profile not found' }));
            return;
        }

        const b = await launchBrowser();
        const pages = await b.pages();
        page = pages.length > 0 ? pages[0] : await b.newPage();

        ws.send(JSON.stringify({ type: 'LOG', payload: { msg: 'Navigating to Job...', type: 'info' } }));
        await page.goto(jobUrl, { waitUntil: 'domcontentloaded' });

        // Check Login
        const isLogin = await page.$('.login__form_action_container, #username');
        if (isLogin) {
            ws.send(JSON.stringify({ type: 'LOG', payload: { msg: '🚨 Please Log In manually in the Puppeteer window!', type: 'warning' } }));
            try {
                await page.waitForSelector('.global-nav__me-photo, .feed-identity-module', { timeout: 60000 });
                ws.send(JSON.stringify({ type: 'LOG', payload: { msg: 'Login detected! Continuing...', type: 'success' } }));
            } catch (e) {
                ws.send(JSON.stringify({ type: 'ERROR', message: 'Login timeout. Please try again.' }));
                return;
            }
        }

        // Click Easy Apply
        ws.send(JSON.stringify({ type: 'LOG', payload: { msg: 'Looking for Easy Apply button...', type: 'info' } }));
        try {
            await page.waitForSelector('.jobs-apply-button', { timeout: 5000 });
            await page.click('.jobs-apply-button');
            ws.send(JSON.stringify({ type: 'LOG', payload: { msg: 'Clicked Apply. Starting Form Logic...', type: 'success' } }));
            
            // Start the form loop
            await handleApplicationModal(page, profile, ws);

        } catch (e) {
            console.error(e);
            ws.send(JSON.stringify({ type: 'LOG', payload: { msg: 'Easy Apply button not found or error clicking.', type: 'warning' } }));
        }

    } catch (e) {
        console.error('[PUPPETEER] Error:', e);
        ws.send(JSON.stringify({ type: 'ERROR', message: e.message }));
    }
}

async function handleApplicationModal(page, profile, ws) {
    const MAX_STEPS = 10;
    let steps = 0;

    // Wait for modal
    try {
        await page.waitForSelector('.jobs-easy-apply-content', { timeout: 10000 });
    } catch {
        ws.send(JSON.stringify({ type: 'LOG', payload: { msg: 'Application modal did not appear.', type: 'error' } }));
        return;
    }

    while (steps < MAX_STEPS) {
        steps++;
        ws.send(JSON.stringify({ type: 'LOG', payload: { msg: `Processing Step ${steps}...`, type: 'info' } }));
        await delay(2000); // Wait for animations

        // 1. Identify Buttons
        const nextBtn = await page.$('button[aria-label="Continue to next step"]');
        const reviewBtn = await page.$('button[aria-label="Review your application"]');
        const submitBtn = await page.$('button[aria-label="Submit application"]');
        const errorMsg = await page.$('.artdeco-inline-feedback--error');

        // Check for Errors from previous step
        if (errorMsg) {
             ws.send(JSON.stringify({ type: 'LOG', payload: { msg: '⚠️ Validation Error detected. Attempting to fix...', type: 'warning' } }));
             // For now, we just try to solve again. If stuck, the user must intervene.
        }

        // 2. Solve Form Fields
        await solveCurrentPage(page, profile, ws);

        // 3. Navigate
        if (submitBtn) {
            ws.send(JSON.stringify({ type: 'LOG', payload: { msg: 'Submitting Application...', type: 'success' } }));
            await submitBtn.click();
            await page.waitForSelector('.artdeco-modal__header, .artdeco-inline-feedback--success', { timeout: 10000 });
            ws.send(JSON.stringify({ type: 'LOG', payload: { msg: '✅ Application Submitted (Probably)!', type: 'success' } }));
            return;
        } else if (reviewBtn) {
            ws.send(JSON.stringify({ type: 'LOG', payload: { msg: 'Reviewing...', type: 'info' } }));
            await reviewBtn.click();
        } else if (nextBtn) {
            ws.send(JSON.stringify({ type: 'LOG', payload: { msg: 'Next Step...', type: 'info' } }));
            await nextBtn.click();
        } else {
            // Might be done or closed
            ws.send(JSON.stringify({ type: 'LOG', payload: { msg: 'No navigation buttons found. Finished?', type: 'warning' } }));
            return;
        }
    }
}

async function solveCurrentPage(page, profile, ws) {
    // Find all input containers
    // We target common LinkedIn form structures
    const inputs = await page.$$('.jobs-easy-apply-form-section__grouping');
    
    // Also grab single Inputs if not grouped
    const singleInputs = await page.$$('input[type="text"], input[type="number"], select, fieldset');

    // Combine unique elements to process
    // Actually, simpler to just query all form controls
    const controls = await page.$$('input, select, textarea');

    // Iterate and fill
    for (const el of controls) {
        const isVisible = await el.evaluate(e => {
            const style = window.getComputedStyle(e);
            return style.display !== 'none' && style.visibility !== 'hidden' && e.offsetParent !== null;
        });
        if (!isVisible) continue;

        const val = await el.evaluate(e => e.value);
        if (val && val.length > 0) continue; // Already filled

        // Get Label/Question
        const id = await el.evaluate(e => e.id);
        const labelText = await page.evaluate((id) => {
            const label = document.querySelector(`label[for="${id}"]`);
            if (label) return label.innerText;
            // Fallback: look for nearby text
            const el = document.getElementById(id);
            if (el) {
                const parent = el.closest('.fb-dash-form-element, .jobs-easy-apply-form-section__grouping');
                if (parent) return parent.innerText;
            }
            return "";
        }, id);

        const cleanQuestion = labelText.replace(/\n/g, ' ').trim();
        if (!cleanQuestion) continue;

        // Determine Type
        const tagName = await el.evaluate(e => e.tagName.toLowerCase());
        const type = await el.evaluate(e => e.type);

        let answer = null;
        let context = { type: 'text' };

        if (tagName === 'select') {
            const options = await el.evaluate(e => Array.from(e.options).map(o => o.text));
            context = { type: 'select', options };
            answer = await getAnswer(cleanQuestion, context, profile, ws);
            
            // Select option
            if (answer) {
                 await page.select(`#${id}`, answer); // This might fail if answer isn't exact value
                 // Try to match text
                 await page.evaluate((id, answer) => {
                     const sel = document.getElementById(id);
                     for(let opt of sel.options) {
                         if(opt.text.includes(answer) || answer.includes(opt.text)) {
                             sel.value = opt.value;
                             sel.dispatchEvent(new Event('change', { bubbles: true }));
                             return;
                         }
                     }
                 }, id, answer);
            }

        } else if (type === 'radio' || type === 'checkbox') {
             // These usually handled by fieldsets, but skipping for brevity in this simple pass
             // This is the hardest part to genericize without more complex logic
             continue; 
        } else {
             // Text/Number
             answer = await getAnswer(cleanQuestion, context, profile, ws);
             if (answer) {
                 await el.type(answer);
             }
        }
        
        ws.send(JSON.stringify({ type: 'LOG', payload: { msg: `Answered: ${cleanQuestion.substring(0,30)}... -> ${answer}`, type: 'success' } }));
    }
    
    // Handle Fieldsets (Radios) specifically
    const fieldsets = await page.$$('fieldset');
    for (const fs of fieldsets) {
        const question = await fs.evaluate(e => {
            const legend = e.querySelector('legend');
            return legend ? legend.innerText : e.innerText;
        });

        // Check if already selected
        const isChecked = await fs.evaluate(e => e.querySelector('input:checked'));
        if (isChecked) continue;

        const options = await fs.evaluate(e => {
            return Array.from(e.querySelectorAll('label')).map(l => l.innerText);
        });

        const answer = await getAnswer(question, { type: 'radio', options }, profile, ws);
        
        if (answer) {
             // Click the label matching answer
             await fs.evaluate((e, ans) => {
                 const labels = Array.from(e.querySelectorAll('label'));
                 const match = labels.find(l => l.innerText.includes(ans) || ans.includes(l.innerText));
                 if(match) match.click();
             }, answer);
             ws.send(JSON.stringify({ type: 'LOG', payload: { msg: `Radio: ${question.substring(0,30)}... -> ${answer}`, type: 'success' } }));
        }
    }
}

// --- Server ---
const wss = new WebSocket.Server({ port: PORT });
console.log(`🚀 LinkedIn Auto-Apply Server running on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
    console.log('[WS] Client connected');

    ws.on('message', async (message) => {
        try {
            const msg = JSON.parse(message);
            console.log('[WS] Received:', msg.type);

            switch (msg.type) {
                case 'PING':
                    ws.send(JSON.stringify({ type: 'PONG' }));
                    break;

                case 'LOAD_PROFILES':
                case 'loadProfiles':
                    ws.send(JSON.stringify({ type: 'PROFILES_LOADED', payload: loadProfiles() }));
                    break;

                case 'parseResume': // Parse Resume and Create Profile
                    console.time('resume-parse');
                    console.log('[SERVER] Parsing Resume of length:', msg.payload.text ? msg.payload.text.length : 0);
                    ws.send(JSON.stringify({ type: 'LOG', payload: { msg: 'Server received resume. sending to AI...', type: 'info' } }));
                    
                    const resumeText = msg.payload.text || msg.payload;
                    const email = msg.payload.email || '';
                    const password = msg.payload.password || '';
                    
                    try {
                        // Race against a timeout
                        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AI Transformation Timed Out (60s)')), 60000));
                        
                        const result = await Promise.race([
                            AI.extractProfileInfo(resumeText, ws),
                            timeoutPromise
                        ]);

                        console.timeEnd('resume-parse');

                        if (result) {
                            console.log('[SERVER] Profile extracted successfully:', JSON.stringify(result, null, 2));
                            // Merge credentials into profile
                            if (email) result.email = email;
                            if (password) result.loginPassword = password;
                            
                            // Generate a profile name if missing
                            if (!result.profileName && result.firstName && result.lastName) {
                                result.profileName = `${result.firstName} ${result.lastName}`;
                            } else if (!result.profileName) {
                                result.profileName = 'My Profile';
                            }
                            
                            saveProfile(result);
                            ws.send(JSON.stringify({ type: 'PROFILES_LOADED', payload: loadProfiles() }));
                            ws.send(JSON.stringify({ type: 'RESUME_PARSED' }));
                            ws.send(JSON.stringify({ type: 'LOG', payload: { msg: 'Profile extracted and saved!', type: 'success' } }));
                        } else {
                            console.error('[SERVER] extraction returned null (AI failed to return valid JSON)');
                            ws.send(JSON.stringify({ type: 'ERROR', payload: 'AI Analysis Failed. Please check server logs.' }));
                        }
                    } catch (e) {
                         console.timeEnd('resume-parse');
                         console.error('[SERVER] Parsing Message Error:', e);
                         ws.send(JSON.stringify({ type: 'ERROR', payload: 'Error: ' + e.message }));
                    }
                    break;
                case 'START_AUTOMATION':
                    console.log('[SERVER] Starting Automation for:', msg.payload.jobUrl);
                    runAutomation(msg.payload.profileId, msg.payload.jobUrl, ws);
                    break;

                case 'UPDATE_PROFILE':
                    console.log('[SERVER] Updating Profile:', msg.payload.id);
                    if (msg.payload.id) {
                        // Merge updates
                        PROFILES[msg.payload.id] = { ...PROFILES[msg.payload.id], ...msg.payload };
                        saveProfile(PROFILES[msg.payload.id]); // Handles write and reload
                        ws.send(JSON.stringify({ type: 'PROFILES_LOADED', payload: PROFILES }));
                        ws.send(JSON.stringify({ type: 'LOG', payload: { msg: 'Profile updated successfully', type: 'success' } }));
                    }
                    break;

                case 'DELETE_PROFILE':
                    console.log('[SERVER] Deleting Profile:', msg.payload.profileId);
                    const profileId = msg.payload.profileId;
                    if (PROFILES[profileId]) {
                        delete PROFILES[profileId];
                        fs.writeFileSync(PROFILES_PATH, JSON.stringify(PROFILES, null, 2));
                        console.log(`[SERVER] Deleted profile: ${profileId}`);
                        PROFILES = loadProfiles(); // Reload from disk to be sure
                        
                        ws.send(JSON.stringify({ type: 'PROFILE_DELETED' }));
                        ws.send(JSON.stringify({ type: 'PROFILES_LOADED', payload: PROFILES }));
                    } else {
                        ws.send(JSON.stringify({ type: 'ERROR', payload: 'Profile not found' }));
                    }
                    break;

                case 'GENERATE_ANSWER':
                    console.log('[SERVER] Generating Answer for:', msg.payload.question);
                    try {
                        const answer = await getAnswer(
                            msg.payload.question, 
                            msg.payload.context || { type: 'text' }, 
                            msg.payload.profile, 
                            ws,
                            true // autoSave = true
                        );
                        
                        ws.send(JSON.stringify({
                            type: 'ANSWER_GENERATED',
                            payload: {
                                question: msg.payload.question,
                                answer: answer
                            }
                        }));
                    } catch (e) {
                         console.error('Answer Generation Error:', e);
                         ws.send(JSON.stringify({ type: 'ERROR', payload: 'AI Generation Failed: ' + e.message }));
                    }
                    break;
                
                case 'SAVE_ANSWER': {
                    // Persist learned answer
                    const { profileId, question, answer } = msg.payload;
                    const normalizedKey = question.trim().toLowerCase(); // Smart Key
                    if (PROFILES[profileId]) {
                        if (!PROFILES[profileId].questionCache) PROFILES[profileId].questionCache = {};
                        PROFILES[profileId].questionCache[normalizedKey] = answer;
                        saveProfile(PROFILES[profileId]);
                        console.log(`[SERVER] 🧠 Learned & Saved: "${question}" -> "${answer}"`);
                    }
                    break;
                }
                
                case 'SAVE_JOB_HISTORY': {
                    console.log('[SERVER] Saving Job History:', msg.payload.title);
                    logApplication(msg.payload);
                    ws.send(JSON.stringify({ type: 'LOG', payload: { msg: 'Job Saved to History', type: 'success' } }));
                    break;
                }
                    
                case 'GET_JOB_HISTORY': {
                    let history = [];
                    if (fs.existsSync(HISTORY_PATH)) {
                        try { history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); } catch {}
                    }
                    ws.send(JSON.stringify({ type: 'JOB_HISTORY_DATA', payload: history }));
                    break;
                }

                case 'GET_OLLAMA_MODELS':
                    console.log('[SERVER] Fetching Ollama Models...');
                    try {
                        const fetch = (await import('node-fetch')).default;
                        const response = await fetch('http://localhost:11434/api/tags');
                        const data = await response.json();
                        const models = data.models.map(m => m.name);
                        
                        ws.send(JSON.stringify({
                            type: 'OLLAMA_MODELS_LIST',
                            payload: models
                        }));
                    } catch (e) {
                        console.error('[SERVER] Failed to fetch Ollama models:', e.message);
                        ws.send(JSON.stringify({ 
                            type: 'ERROR', 
                            payload: 'Could not fetch Ollama models. Is Ollama running?' 
                        }));
                    }
                    break;
            }
        } catch (e) {
            console.error('[WS] Error handling message:', e);
        }
    });

    // Send initial Data
    ws.send(JSON.stringify({ type: 'PROFILES_LOADED', payload: loadProfiles() }));
});
