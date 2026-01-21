console.log('LinkedIn Auto-Apply: Overlay Script Loaded [SAFE MODE]');

(function () {
    console.log('LinkedIn Auto-Apply: Overlay Script Initializing...');
    
    // Prevent multiple injections
    if (document.getElementById('li-auto-overlay-host')) {
        console.log('LinkedIn Auto-Apply: Host already exists.');
        return;
    }

    // --- State Management ---
    let state = {
        isRunning: false,
        profiles: [],
        activeProfileId: null,
        logs: [],
        activeTab: 'profile', // profile, settings, history
        settings: {
            openaiKey: '',
            anthropicKey: '',
            googleKey: '',
            model: 'gpt-4o'
        },
        ollamaModels: []
    };

    // Load Settings from Storage on Init
    chrome.storage.local.get(['liSettings'], (res) => {
        if (res.liSettings) state.settings = { ...state.settings, ...res.liSettings };
    });

    let els = {}; 

    // ... [Keep Helpers showNotification, showConfirmModal, updateStatus, addLog_internal] ... 
    // Re-implementing helpers to be safe or assuming they exist? 
    // I will keep existing helpers if I don't overwrite them. 
    // But since I am replacing a huge chunk, I should be careful. 
    // I will replace from 'let state' down to the end of file to be sure.

    // ... [Helpers omitted from replacement string for brevity, see Instruction implies I need to provide full content if replacing large block] ...
    // Actually, replacing 500 lines is risky. Let's do targeted replacement of renderUI and state.

    // WAIT: I can just replace renderUI and add the new render functions?
    // And update state init at top.

    // Let's replace `let state = ...` first.
    
    // ... Actually, let's replace the whole file content from `let state` downwards to ensure consistency.

    // FULL REPLACEMENT STRATEGY SIMPLIFIED:
    
    // 1. State Init
    // 2. Helpers (Generic)
    // 3. Logic (Start/Stop)
    // 4. Renderers (Tab Router)
    
    // I will provide the FULL functionality in the replacement.

    function showNotification(msg, type='info') {
        const host = document.getElementById('li-auto-overlay-host');
        if (!host || !host.shadowRoot) return;
        const wrapper = host.shadowRoot.querySelector('#li-auto-overlay');
        if (!wrapper) return;
        const notif = document.createElement('div');
        notif.textContent = msg;
        notif.className = `li-notification li-notification-${type}`;
        notif.style.cssText = `position: absolute; top: 60px; right: 20px; padding: 10px 16px; border-radius: 8px; background: ${type === 'error' ? '#ff3333' : '#00a400'}; color: white; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 10000; opacity: 0; transform: translateY(-10px); transition: all 0.3s ease;`;
        wrapper.appendChild(notif);
        requestAnimationFrame(() => { notif.style.opacity = '1'; notif.style.transform = 'translateY(0)'; });
        setTimeout(() => { notif.style.opacity = '0'; notif.style.transform = 'translateY(-10px)'; setTimeout(() => notif.remove(), 300); }, 3000);
    }

    function updateStatus(text, type = 'normal') {
        // Need to find status element dynamically as it might be re-rendered
        const el = els.wrapper?.querySelector('#statusDisplay');
        if (el) {
            el.textContent = text;
            el.className = 'li-status ' + (type !== 'normal' ? `li-status-${type}` : '');
        }
    }

    function addLog(msg, type = 'info') {
        const entry = { time: new Date().toLocaleTimeString(), msg, type };
        state.logs.unshift(entry);
        if (state.logs.length > 100) state.logs.pop();
        if (state.activeTab === 'history') renderHistoryTab(); 
    }

    async function startAutomation() {
        if (!state.activeProfileId) return showNotification('Select a profile first.', 'error');
        updateStatus('Starting...', 'busy');
        try {
             await chrome.runtime.sendMessage({
                 type: 'RELAY_TO_TAB',
                 payload: {
                     type: 'START_AUTOMATION_CLIENT',
                     profile: state.profiles.find(p => p.id === state.activeProfileId),
                     config: state.settings
                 }
             });
             state.isRunning = true;
             renderUI();
             addLog('Automation started.', 'success');
        } catch (e) {
            console.error(e);
            showNotification('Failed to start: ' + e.message, 'error');
        }
    }

    function stopAutomation() {
        state.isRunning = false;
        renderUI();
        updateStatus('Stopped', 'normal');
        addLog('Stopping automation...', 'warning');
        chrome.runtime.sendMessage({ 
            type: 'RELAY_TO_TAB', 
            payload: { type: 'STOP_AUTOMATION_CLIENT' } 
        }).catch(e => console.error(e));
    }

    // --- Helpers ---

    function renderConfirmModal(text, onConfirm) {
        let modal = els.wrapper.querySelector('.li-confirm-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'li-confirm-modal';
            modal.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; display:flex; justify-content:center; align-items:center;';
            els.wrapper.appendChild(modal);
        }
        modal.innerHTML = `
            <div style="background:white; padding:20px; border-radius:8px; width:80%; text-align:center; box-shadow:0 4px 12px rgba(0,0,0,0.2);">
                <div style="margin-bottom:15px; font-weight:600; color:#333;">${text}</div>
                <div style="display:flex; gap:10px; justify-content:center;">
                    <button id="btnNo" class="li-btn" style="background:#eee; color:#333;">Cancel</button>
                    <button id="btnYes" class="li-btn li-btn-danger">Delete</button>
                </div>
            </div>
        `;
        modal.querySelector('#btnNo').onclick = () => modal.remove();
        modal.querySelector('#btnYes').onclick = () => { modal.remove(); onConfirm(); };
    }

    // --- Renderers ---

    // --- Renderers ---

    function renderUI() {
        let host = document.getElementById('li-auto-overlay-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'li-auto-overlay-host';
            host.style.cssText = 'position:fixed; top:0; left:0; z-index:999999; width:0; height:0;';
            document.body.appendChild(host);
        }
        const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
        
        if (!shadow.querySelector('link')) {
            const cssLink = document.createElement('link');
            cssLink.rel = 'stylesheet';
            cssLink.href = chrome.runtime.getURL('overlay.css');
            shadow.appendChild(cssLink);
            
            const spinnerLink = document.createElement('link');
            spinnerLink.rel = 'stylesheet';
            spinnerLink.href = chrome.runtime.getURL('spinner.css');
            shadow.appendChild(spinnerLink);
        }

        let wrapper = shadow.getElementById('li-auto-overlay');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.id = 'li-auto-overlay';
            shadow.appendChild(wrapper);
        }
        els.wrapper = wrapper;

        if (state.connectionError) {
             // Just show a banner inside, don't replace everything
        }

        wrapper.innerHTML = `
            <div class="li-header">
                <div class="li-logo">🚀 Auto-Applier</div>
                <div class="li-status" id="statusDisplay">${state.isRunning ? 'Running...' : (state.connectionError ? 'Offline' : 'Ready')}</div>
                <div class="li-minimize" id="btnCloseUI" style="cursor:pointer; margin-left:auto;">✕</div>
            </div>
            <div class="li-tabs">
                <div class="li-tab ${state.activeTab === 'profile' ? 'active' : ''}" id="tab-profile">Profile</div>
                <div class="li-tab ${state.activeTab === 'history' ? 'active' : ''}" id="tab-history">History</div>
                <div class="li-tab ${state.activeTab === 'settings' ? 'active' : ''}" id="tab-settings">Settings</div>
            </div>
            <div class="li-body" id="tab-content"></div>
        `;

        wrapper.querySelector('#tab-profile').onclick = () => { state.activeTab = 'profile'; renderUI(); };
        wrapper.querySelector('#tab-history').onclick = () => { state.activeTab = 'history'; renderUI(); };
        wrapper.querySelector('#tab-settings').onclick = () => { state.activeTab = 'settings'; renderUI(); };
        wrapper.querySelector('#btnCloseUI').onclick = () => { 
            // Just minimize or hide? For now, we just close the UI box logic if user wants.
            // But actually user probably just wants to hide it.
            host.style.display = 'none'; 
            // We need a way to bring it back. The button on page should do it.
        };

        const content = wrapper.querySelector('#tab-content');
        if (state.activeTab === 'profile') renderProfileTab(content);
        else if (state.activeTab === 'settings') renderSettingsTab(content);
        else if (state.activeTab === 'history') renderHistoryTab(content);
    }

    function renderProfileTab(container) {
        if (!state.profiles.length) {
             container.innerHTML = `
                <div class="li-section">
                    <h3>No Profiles</h3>
                    <p style="font-size:12px; color:#666;">Create a profile by parsing your resume.</p>
                    <button id="btnCreateId" class="li-btn li-btn-primary">Upload Resume & Create</button>
                    <button id="btnReloadId" class="li-btn-text" style="color:#0a66c2; margin-top:10px;">Reload</button>
                </div>`;
            container.querySelector('#btnCreateId').onclick = promptResumeUpload;
            container.querySelector('#btnReloadId').onclick = () => chrome.runtime.sendMessage({ type: 'LOAD_PROFILES' });
            return;
        }

        const active = state.profiles.find(p => p.id === state.activeProfileId) || state.profiles[0];
        state.activeProfileId = active.id;

        container.innerHTML = `
            <div class="li-section">
                <label class="li-label">Active Profile</label>
                <select id="profileSelect" class="li-select">
                    ${state.profiles.map(p => `<option value="${p.id}" ${p.id === active.id ? 'selected' : ''}>${p.profileName || p.firstName}</option>`).join('')}
                    <option value="__NEW__" style="font-weight:bold; color:#0a66c2;">+ Add New Profile (Resume)</option>
                </select>
                <div class="li-profile-details" style="margin-top:10px; font-size:13px; color:#555;">
                    <div><strong>${active.firstName} ${active.lastName}</strong></div>
                    <div style="font-size:11px; color:#888;">${active.email}</div>
                </div>
                <div class="li-actions" style="margin-top: 15px; display:flex; gap:8px; align-items:center;">
                    <button id="btnEdit" class="li-btn li-btn-secondary" style="flex:1;">Edit Profile</button>
                    <div id="btnDelete" style="cursor:pointer; font-size:18px; opacity:0.5; padding:5px;" title="Delete Profile">🗑️</div>
                </div>
            </div>
            <div class="li-actions-row" style="margin-top:20px;">
                ${state.isRunning 
                    ? `<button id="btnStop" class="li-btn li-btn-danger" style="width:100%">Stop Automation</button>`
                    : `<button id="btnStart" class="li-btn li-btn-success" style="width:100%">Start Applying</button>`
                }
                <div id="liveStatus" style="font-size:10px; color:#666; text-align:center; margin-top:8px; height:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; transition: all 0.2s ease;">
                    ${state.lastLog || 'Ready to start'}
                </div>
            </div>
        `;

        container.querySelector('#profileSelect').onchange = (e) => { 
            if (e.target.value === '__NEW__') {
                promptResumeUpload();
                e.target.value = state.activeProfileId;
            } else {
                state.activeProfileId = e.target.value; 
                renderUI(); 
            }
        };
        container.querySelector('#btnEdit').onclick = () => renderEditUI(active.id, false);
        container.querySelector('#btnDelete').onclick = () => {
             renderConfirmModal(`Delete profile "${active.profileName}"?`, () => {
                 chrome.runtime.sendMessage({ type: 'DELETE_PROFILE', payload: { profileId: active.id } });
             });
        };
        
        if (state.isRunning) container.querySelector('#btnStop').onclick = stopAutomation;
        else container.querySelector('#btnStart').onclick = startAutomation;
    }

    function promptResumeUpload() {
        const wrapper = els.wrapper;
        wrapper.innerHTML = `
            <div class="li-header"><div class="li-logo">📄 Parse Resume</div><div class="li-minimize" id="btnCancelResume" style="cursor:pointer;">✕</div></div>
            <div class="li-body" style="padding:20px;">
                <p>Paste your resume text below. The AI will extract your details.</p>
                <textarea id="resumeText" class="li-input" style="height:200px; font-size:11px;" placeholder="Paste resume content here..."></textarea>
                <button id="btnParse" class="li-btn li-btn-primary" style="width:100%; margin-top:10px;">Parse & Create</button>
            </div>
             <div class="li-actions-row" style="margin-top:0; padding: 10px; border-top: 1px solid #eee;">
                <div id="liveStatus" style="font-size:10px; color:#666; text-align:center; height:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${state.lastLog || ''}
                </div>
            </div>
        `;
        wrapper.querySelector('#btnCancelResume').onclick = () => renderUI();
        wrapper.querySelector('#btnParse').onclick = () => {
            const text = wrapper.querySelector('#resumeText').value;
            if(!text.trim()) return showNotification('Please paste text.', 'error');
            
            // Set parsing state
            state.isParsing = true;
            updateStatus('Parsing...', 'busy');
            chrome.runtime.sendMessage({ type: 'parseResume', payload: text });
            
            // Render Loading View directly here (or call renderUI if we promoted isParsing to global state)
            // Let's render a temporary loading view that KEEPS the footer
            wrapper.querySelector('.li-body').innerHTML = `
                <div style="padding:40px; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;">
                    <div class="li-spinner"></div>
                    <h3 style="margin:10px 0 5px 0;">Analysis in progress...</h3>
                    <p style="color:#666; font-size:12px;">Consulting AI...</p>
                </div>
            `;
            // Remove button to prevent double click
            // wrapper.querySelector('#btnParse').remove(); 
        };
    }

    function renderSettingsTab(container) {
        if (state.ollamaModels.length === 0) chrome.runtime.sendMessage({ type: 'GET_OLLAMA_MODELS' });

        const cloudModels = [];
        if (state.settings.openaiKey?.length > 5) cloudModels.push('gpt-4o');
        if (state.settings.anthropicKey?.length > 5) cloudModels.push('claude-3-5-sonnet');
        if (state.settings.googleKey?.length > 5) cloudModels.push('gemini-pro');

        const allModels = [...new Set([...cloudModels, ...state.ollamaModels])];

        container.innerHTML = `
            <div class="li-section">
                <label class="li-label">AI Model</label>
                <select id="settingModel" class="li-select" style="margin-bottom:15px;" ${allModels.length === 0 ? 'disabled' : ''}>
                    ${allModels.map(m => `<option value="${m}" ${state.settings.model === m ? 'selected' : ''}>${m}</option>`).join('')}
                    ${allModels.length === 0 ? '<option>No models available</option>' : ''}
                </select>
                
                <div class="li-credentials">
                    <label class="li-label">OpenAI Key</label>
                    <input type="password" id="keyOpenAI" class="li-input" placeholder="sk-..." value="${state.settings.openaiKey || ''}">
                    <label class="li-label">Anthropic Key</label>
                    <input type="password" id="keyAnthropic" class="li-input" placeholder="sk-ant-..." value="${state.settings.anthropicKey || ''}">
                    <label class="li-label">Google Key</label>
                    <input type="password" id="keyGoogle" class="li-input" placeholder="AIza..." value="${state.settings.googleKey || ''}">
                </div>

                <button id="btnSaveSettings" class="li-btn li-btn-primary" style="margin-top:20px; width:100%">Save Settings</button>
            </div>
        `;

        container.querySelector('#btnSaveSettings').onclick = () => {
            state.settings = {
                model: container.querySelector('#settingModel').value || state.settings.model,
                openaiKey: container.querySelector('#keyOpenAI').value,
                anthropicKey: container.querySelector('#keyAnthropic').value,
                googleKey: container.querySelector('#keyGoogle').value
            };
            chrome.storage.local.set({ liSettings: state.settings }, () => {
                showNotification('Settings Saved!', 'success');
                renderUI(); 
            });
        };
    }

    function renderHistoryTab(container) {
        try {
            // Fetch history if not loaded and not currently fetching
            if(!state.historyLoaded && !state.isFetchingHistory) {
                state.isFetchingHistory = true;
                chrome.runtime.sendMessage({ type: 'GET_JOB_HISTORY' });
                container.innerHTML = `<div style="padding:20px; text-align:center;">Loading history...</div>`;
                return;
            } else if (state.isFetchingHistory) {
                 container.innerHTML = `<div style="padding:20px; text-align:center;">Loading history...</div>`;
                 return;
            }
            
            const history = Array.isArray(state.historyData) ? state.historyData : [];
            if(history.length === 0) {
                 container.innerHTML = `<div style="padding:20px; text-align:center; color:#888;">No applications yet.</div>`;
                 return;
            }
    
            container.innerHTML = `
                <div class="li-logs-area" style="height:350px; overflow-y:auto;">
                    ${history.map((job, idx) => {
                        const title = job.title || job.jobTitle || 'Unknown Job';
                        const company = job.company || 'Unknown Company';
                        const date = job.timestamp ? new Date(job.timestamp).toLocaleDateString() : 'Just now';
                        const link = job.link || job.jobLink || '#';
                        const log = Array.isArray(job.log) ? job.log : [];
                        
                        return `
                         <div class="li-history-item" style="padding:8px; border-bottom:1px solid #eee; font-size:12px;">
                            <div style="font-weight:bold; display:flex; justify-content:space-between;">
                                <span>${title}</span>
                                <span style="color:#888; font-weight:normal;">${date}</span>
                            </div>
                            <div style="color:#555;">${company}</div>
                            <div style="margin-top:4px;">
                                <a href="${link}" target="_blank" style="color:#0a66c2; text-decoration:none;">View Job</a>
                                <span class="btn-expand-log" data-idx="${idx}" style="cursor:pointer; color:#0a66c2; margin-left:10px;">View Logs (${log.length})</span>
                            </div>
                            <div id="log-details-${idx}" style="display:none; margin-top:8px; background:#f9f9f9; padding:5px; border-radius:4px;">
                                ${log.length > 0 
                                    ? log.map(l => `
                                        <div style="margin-bottom:4px; border-bottom:1px dashed #ddd; padding-bottom:2px;">
                                            <div style="color:#444; font-weight:600;">Q: ${l.question || 'Unknown Q'}</div>
                                            <div style="color:${l.type==='ai'?'#00a400':'#666'};">A: ${l.answer || ''} <span style="font-size:9px; opacity:0.7">(${l.type || 'info'})</span></div>
                                        </div>`).join('')
                                    : '<div style="color:#999; font-style:italic;">No Q&A recorded.</div>'
                                }
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            `;
            
            container.querySelectorAll('.btn-expand-log').forEach(btn => {
                btn.onclick = (e) => {
                    const idx = e.target.dataset.idx;
                    const details = container.querySelector(`#log-details-${idx}`);
                    if(details) {
                        const isHidden = details.style.display === 'none';
                        details.style.display = isHidden ? 'block' : 'none';
                        e.target.textContent = isHidden ? 'Hide Logs' : `View Logs`;
                    }
                };
            });
        } catch (e) {
            console.error('Render History Error:', e);
            container.innerHTML = `<div style="padding:20px; color:red;">Error loading history: ${e.message}</div>`;
        }
    }

    function renderConfirmModal(text, onConfirm) {
        let modal = els.wrapper.querySelector('.li-confirm-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'li-confirm-modal';
            modal.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; display:flex; justify-content:center; align-items:center;';
            els.wrapper.appendChild(modal);
        }
        modal.innerHTML = `
            <div style="background:white; padding:20px; border-radius:8px; width:80%; text-align:center; box-shadow:0 4px 12px rgba(0,0,0,0.2);">
                <div style="margin-bottom:15px; font-weight:600; color:#333;">${text}</div>
                <div style="display:flex; gap:10px; justify-content:center;">
                    <button id="btnNo" class="li-btn" style="background:#eee; color:#333;">Cancel</button>
                    <button id="btnYes" class="li-btn li-btn-danger">Delete</button>
                </div>
            </div>
        `;
        modal.querySelector('#btnNo').onclick = () => modal.remove();
        modal.querySelector('#btnYes').onclick = () => { modal.remove(); onConfirm(); };
    }

    function renderEditUI(activeId, isNew = false) {
        const wrapper = els.wrapper;
        let profile = isNew ? { profileName: 'New Profile', experience: { 'Skill': 1 }, questionCache: {} } : state.profiles.find(p => p.id === activeId);
        if (!profile) return;
        
        // Track current edit tab
        state.editTab = state.editTab || 'basic';
        
        wrapper.innerHTML = `
            <div class="li-header">
                <div class="li-logo">${isNew ? '✨ New Profile' : '✏️ Edit Profile'}</div>
                <div class="li-minimize" id="btnCancelEdit" style="cursor:pointer;">✕</div>
            </div>
            <div class="li-tabs" style="border-bottom:1px solid #eee;">
                <div class="li-tab ${state.editTab === 'basic' ? 'active' : ''}" id="editTab-basic" style="font-size:11px;">Basic Info</div>
                <div class="li-tab ${state.editTab === 'qa' ? 'active' : ''}" id="editTab-qa" style="font-size:11px;">Q&A Cache</div>
            </div>
            <div class="li-body" id="editContent" style="overflow-y:auto; max-height: 350px; padding-bottom: 20px;"></div>
            <div style="padding:10px; border-top:1px solid #eee;">
                <button id="btnSaveEdit" class="li-btn li-btn-primary" style="width:100%;">💾 ${isNew ? 'Create' : 'Save'}</button>
            </div>
        `;
        
        let experience = { ...(profile.experience || {}) };
        let questionCache = { ...(profile.questionCache || {}) };
        let qaFilter = '';
        
        const renderBasicTab = () => {
            const content = wrapper.querySelector('#editContent');
            content.innerHTML = `
                <div class="li-section">
                    <label class="li-label">Profile Name</label>
                    <input type="text" id="editProfileName" class="li-input" value="${profile.profileName || ''}">
                    <label class="li-label">First Name</label> <input type="text" id="editFirstName" class="li-input" value="${profile.firstName || ''}">
                    <label class="li-label">Last Name</label> <input type="text" id="editLastName" class="li-input" value="${profile.lastName || ''}">
                    <label class="li-label">Email</label> <input type="text" id="editEmail" class="li-input" value="${profile.email || ''}">
                    <label class="li-label">Phone</label> <input type="text" id="editPhone" class="li-input" value="${profile.phone || ''}">
                    <label class="li-label">LinkedIn</label> <input type="text" id="editLinkedIn" class="li-input" value="${profile.linkedin || ''}">
                    <label class="li-label">GitHub</label> <input type="text" id="editGitHub" class="li-input" value="${profile.github || ''}">
                    
                    <label class="li-label" style="margin-top:15px;">Skills (Name : Years)</label>
                    <div id="skillsContainer"></div>
                    <button id="btnAddSkill" style="background:none; border:none; color:#0a66c2; cursor:pointer; font-size:12px;">+ Add Skill</button>
                </div>
            `;
            
            const skillsContainer = content.querySelector('#skillsContainer');
            const renderSkills = () => {
                skillsContainer.innerHTML = '';
                Object.entries(experience).forEach(([k,v]) => {
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex; gap:5px; margin-bottom:5px;';
                    row.innerHTML = `<input class="li-input k" value="${k}" style="flex:2; font-size:11px;"> <input class="li-input v" value="${v}" style="flex:1; font-size:11px;"> <button class="x" style="background:#ff5252; color:white; border:none; border-radius:4px; cursor:pointer; padding:0 8px;">×</button>`;
                    row.querySelector('.x').onclick = () => { delete experience[k]; renderSkills(); };
                    row.querySelector('.k').onchange = (e) => { const n=e.target.value; if(n!==k){ experience[n]=v; delete experience[k]; renderSkills(); }};
                    row.querySelector('.v').onchange = (e) => experience[k] = parseInt(e.target.value) || 0;
                    skillsContainer.appendChild(row);
                });
            };
            renderSkills();
            content.querySelector('#btnAddSkill').onclick = () => { experience['New Skill'] = 1; renderSkills(); };
        };
        
        const renderQATab = () => {
            const content = wrapper.querySelector('#editContent');
            const entries = Object.entries(questionCache);
            const filtered = qaFilter 
                ? entries.filter(([q, a]) => q.toLowerCase().includes(qaFilter.toLowerCase()) || a.toLowerCase().includes(qaFilter.toLowerCase()))
                : entries;
            
            content.innerHTML = `
                <div class="li-section">
                    <div style="background:#e3f2fd; padding:8px 12px; border-radius:6px; margin-bottom:10px; font-size:11px; color:#1565c0;">
                        🧠 ${filtered.length} of ${entries.length} learned answers ${qaFilter ? '(filtered)' : ''}
                    </div>
                    <input type="text" id="qaSearchInput" class="li-input" placeholder="🔍 Search questions..." value="${qaFilter}" style="margin-bottom:10px; font-size:11px;">
                    <div id="qaContainer" style="max-height:220px; overflow-y:auto;"></div>
                    <button id="btnAddQA" style="background:none; border:none; color:#0a66c2; cursor:pointer; font-size:12px; margin-top:8px;">+ Add Question/Answer</button>
                </div>
            `;
            
            const qaContainer = content.querySelector('#qaContainer');
            
            if (filtered.length === 0) {
                qaContainer.innerHTML = `<div style="text-align:center; padding:20px; color:#999; font-style:italic; font-size:12px;">
                    ${qaFilter ? 'No matching questions.' : 'No cached answers yet.'}
                </div>`;
            } else {
                filtered.forEach(([q, a]) => {
                    const row = document.createElement('div');
                    row.style.cssText = 'background:#f8f9fa; border:1px solid #e0e0e0; border-radius:6px; padding:8px; margin-bottom:8px; position:relative;';
                    row.innerHTML = `
                        <button class="qa-del" style="position:absolute; top:4px; right:4px; background:#ff5252; color:white; border:none; width:18px; height:18px; border-radius:50%; cursor:pointer; font-size:12px; line-height:1;">×</button>
                        <input class="qa-q li-input" value="${escapeHtml(q)}" style="font-size:10px; font-weight:600; margin-bottom:4px; padding:6px;">
                        <textarea class="qa-a li-input" style="font-size:10px; min-height:30px; padding:6px; resize:vertical;">${escapeHtml(a)}</textarea>
                    `;
                    row.querySelector('.qa-del').onclick = () => { delete questionCache[q]; renderQATab(); };
                    row.querySelector('.qa-q').onchange = (e) => {
                        const newQ = e.target.value.trim();
                        if (newQ && newQ !== q) {
                            questionCache[newQ] = questionCache[q];
                            delete questionCache[q];
                        }
                    };
                    row.querySelector('.qa-a').onchange = (e) => {
                        const origQ = row.querySelector('.qa-q').value.trim();
                        if (origQ) questionCache[origQ] = e.target.value;
                    };
                    qaContainer.appendChild(row);
                });
            }
            
            content.querySelector('#qaSearchInput').oninput = (e) => { qaFilter = e.target.value; renderQATab(); };
            content.querySelector('#btnAddQA').onclick = () => { questionCache['New Question'] = ''; renderQATab(); };
        };
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text || '';
            return div.innerHTML;
        }
        
        // Tab switching
        wrapper.querySelector('#editTab-basic').onclick = () => { state.editTab = 'basic'; renderBasicTab(); updateTabStyles(); };
        wrapper.querySelector('#editTab-qa').onclick = () => { state.editTab = 'qa'; renderQATab(); updateTabStyles(); };
        
        function updateTabStyles() {
            wrapper.querySelector('#editTab-basic').className = `li-tab ${state.editTab === 'basic' ? 'active' : ''}`;
            wrapper.querySelector('#editTab-qa').className = `li-tab ${state.editTab === 'qa' ? 'active' : ''}`;
        }
        
        // Initial render
        if (state.editTab === 'qa') renderQATab();
        else renderBasicTab();
        
        wrapper.querySelector('#btnCancelEdit').onclick = () => { state.editTab = 'basic'; renderUI(); };
        wrapper.querySelector('#btnSaveEdit').onclick = async () => {
            // Collect current values from whichever tab is active
            const basicFields = wrapper.querySelector('#editProfileName') ? {
                profileName: wrapper.querySelector('#editProfileName')?.value || profile.profileName,
                firstName: wrapper.querySelector('#editFirstName')?.value || profile.firstName,
                lastName: wrapper.querySelector('#editLastName')?.value || profile.lastName,
                email: wrapper.querySelector('#editEmail')?.value || profile.email,
                phone: wrapper.querySelector('#editPhone')?.value || profile.phone,
                linkedin: wrapper.querySelector('#editLinkedIn')?.value || profile.linkedin,
                github: wrapper.querySelector('#editGitHub')?.value || profile.github,
            } : {
                profileName: profile.profileName,
                firstName: profile.firstName,
                lastName: profile.lastName,
                email: profile.email,
                phone: profile.phone,
                linkedin: profile.linkedin,
                github: profile.github,
            };
            
            const updated = {
                ...profile,
                id: profile.id || Date.now().toString(),
                ...basicFields,
                experience,
                questionCache
            };
            await chrome.runtime.sendMessage({ type: 'UPDATE_PROFILE', payload: updated });
            showNotification('Saved!', 'success');
            state.editTab = 'basic';
            renderUI();
        };
    }

    // --- Listeners & Init ---
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'PROFILES_LOADED') {
            state.profiles = Object.values(msg.payload || {});
            if (!state.activeProfileId && state.profiles.length) state.activeProfileId = state.profiles[0].id;
            if (els.wrapper) renderUI(); 
        } else if (msg.type === 'LOG') {
            console.log('[OVERLAY] Received LOG:', msg.payload.msg);
            addLog(msg.payload.msg, msg.payload.type);
            state.lastLog = msg.payload.msg;
            const statusEl = els.wrapper?.querySelector('#liveStatus');
            console.log('[OVERLAY] liveStatus element:', statusEl ? 'FOUND' : 'NOT FOUND');
            if(statusEl) {
                statusEl.textContent = msg.payload.msg;
                statusEl.style.color = msg.payload.type === 'error' ? '#cc1016' : (msg.payload.type === 'success' ? '#057642' : '#666');
                console.log('[OVERLAY] Updated liveStatus to:', msg.payload.msg);
            }
        } else if (msg.type === 'OLLAMA_MODELS_LIST') {
            state.ollamaModels = msg.payload || [];
            if (state.activeTab === 'settings' && els.wrapper) renderUI();
            showNotification(`Found ${state.ollamaModels.length} Ollama models`, 'success');
        } else if (msg.type === 'JOB_HISTORY_DATA') {
            state.historyData = msg.payload;
            state.isFetchingHistory = false; // Done fetching
            state.historyLoaded = true; // Data is ready
            if (state.activeTab === 'history' && els.wrapper) renderUI();
        } else if (msg.type === 'PROFILE_DELETED') {
             state.activeProfileId = null;
             showNotification('Profile Deleted', 'warning');
        } else if (msg.type === 'RESUME_PARSED') {
             console.log('[OVERLAY] Resume parsing complete!');
             state.isParsing = false;
             renderUI(); 
             showNotification('Resume Logic Complete', 'success');
        }
    });

    window.liAuto = { reload: () => chrome.runtime.sendMessage({ type: 'LOAD_PROFILES' }) };
    
    // --- Init & Connection Check ---
    
    function init() {
        // Render immediately
        renderUI(); 
        console.log('LinkedIn Auto-Apply: Triggering Initial Load');
        
        // Ping Background to check connection
        chrome.runtime.sendMessage({ type: 'CONNECT' }, (response) => {
            if (chrome.runtime.lastError || !response || !response.connected) {
                console.error('LinkedIn Auto-Apply: Connection Check Failed (Soft Fail)', chrome.runtime.lastError);
                updateStatus('Offline (Reload Ext)', 'error');
                // Don't block UI, just confirm status
            } else {
                 chrome.runtime.sendMessage({ type: 'LOAD_PROFILES' });
                 chrome.runtime.sendMessage({ type: 'GET_OLLAMA_MODELS' });
            }
        });
    }

    // Auto-Init with Delay
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
    else setTimeout(init, 500);

})();
