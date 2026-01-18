// Injected Logic
(function() {
    if (window.LI_AUTO_INSTALLED) return;
    window.LI_AUTO_INSTALLED = true;

    // --- State & API Definition (Moved to Top) ---
    // We define this FIRST so it exists for potential race conditions or self-reference
    window.liAuto = window.liAuto || {};
    window.liAuto.profiles = window.liAuto.profiles || {};

    const els = {};
    let currentResolve = null;

    // --- Exposed API ---
    Object.assign(window.liAuto, {
        setProfiles: (profiles, activeId) => {
            window.liAuto.profiles = profiles;
            console.log('Overlay: Updating Profiles.. Count:', profiles ? Object.keys(profiles).length : 0);
            if (profiles && Object.keys(profiles).length > 0) {
                console.log('Overlay: Rendering Success UI (Start Button)');
                renderUI(Object.keys(profiles)[0]); // Assuming renderUI is now the success UI
            } else {
                console.log('Overlay: Rendering Setup UI');
                renderUI(); // Assuming renderUI without args is the setup UI
            }
        },

        setStatus: (text, isRunning) => {
           if(els.status) els.status.innerText = text;
           updateButtons(isRunning);
        },

        askForField: (question, suggestedAnswer, rect) => {
            if(!els.assistant) return;
            // Position assistant near the field (rect)
            els.assistant.style.display = 'block';
            els.assistant.style.top = (window.scrollY + rect.y + rect.height + 10) + 'px';
            els.assistant.style.left = (window.scrollX + rect.x) + 'px';
            
            // Limit off-screen
            if (parseInt(els.assistant.style.left) > window.innerWidth - 340) {
                 els.assistant.style.left = (window.innerWidth - 340) + 'px';
            }

            els.questionText.innerText = question.substring(0, 100) + (question.length > 100 ? '...' : '');
            els.aiSuggestion.innerText = suggestedAnswer || "(No AI suggestion)";
            els.manualInput.value = suggestedAnswer || "";
            els.manualInput.focus();

            return new Promise(resolve => {
                currentResolve = resolve;
            });
        }
    });

    // --- UI Construction ---
    function renderUI(activeId) {
        // Clear existing if any
        const existing = document.getElementById('li-auto-overlay');
        if (existing) existing.remove();

        const hasProfiles = Object.keys(window.liAuto.profiles).length > 0;
        let innerContent = '';

        if (!hasProfiles) {
            // SETUP MODE
            innerContent = `
                <div class="li-auto-section">
                    <h3>⚠️ No Profile Found</h3>
                    <p>Paste your resume text below to auto-generate your profile.</p>
                    <textarea id="resumeInput" rows="10" placeholder="Paste resume content here..."></textarea>
                    <button id="btnParse" class="li-auto-btn li-auto-btn-primary">✨ Parse Resume & Create Profile</button>
                    <p style="font-size:10px; color:#666; margin-top:5px;">This uses local AI (Ollama) to extract details.</p>
                </div>
            `;
        } else {
            // RUN MODE
            innerContent = `
                <div class="li-auto-status" id="statusDisplay">Ready</div>
                
                <div class="li-auto-section">
                    <label>Active Profile</label>
                    <select id="profileSelect">
                        ${Object.keys(window.liAuto.profiles).map(id => 
                            `<option value="${id}" ${id===activeId?'selected':''}>${window.liAuto.profiles[id].profileName}</option>`
                        ).join('')}
                    </select>
                </div>

                <div class="li-auto-actions">
                    <button id="btnStart" class="li-auto-btn li-auto-btn-primary">Start Applying</button>
                    <button id="btnStop" class="li-auto-btn li-auto-btn-danger" style="display:none;">Stop</button>
                </div>
                
                <div class="li-auto-footer">
                    <button id="btnReload" class="li-auto-btn li-auto-btn-secondary">Reload Settings</button>
                </div>
            `;
        }

        const div = document.createElement('div');
        div.id = 'li-auto-overlay';
        div.innerHTML = `
            <div class="li-auto-header">
                <span>🚀 Auto-Applier</span>
                <span class="li-auto-minimize" id="btnMin">−</span>
            </div>
            <div class="li-auto-body" id="mainBody">
                ${innerContent}
            </div>
        `;
        document.body.appendChild(div);

        // Bind Elements
        els.overlay = div;
        els.status = document.getElementById('statusDisplay');
        els.btnStart = document.getElementById('btnStart');
        els.btnStop = document.getElementById('btnStop');
        els.profileSelect = document.getElementById('profileSelect');
        
        // Bind Events
        document.getElementById('btnMin').onclick = () => els.overlay.classList.toggle('minimized');

        if (!hasProfiles) {
            document.getElementById('btnParse').onclick = async () => {
                const text = document.getElementById('resumeInput').value;
                if (!text) return alert('Paste resume first!');
                
                const btn = document.getElementById('btnParse');
                btn.innerText = '⏳ Parsing...';
                btn.disabled = true;

                try {
                    const profileData = await window.nodeActions.parseResume(text);
                    if (profileData) {
                        const newId = await window.nodeActions.saveProfile(profileData);
                        // Reload profiles from Node to get the full object back
                        await window.nodeActions.reloadProfiles(); 
                        // The reloadProfiles call in Node calls pushProfilesToOverlay, 
                        // which calls window.liAuto.setProfiles, which calls renderUI.
                        // So we just need to wait a bit or ensure the UI switches to the new ID.
                        // Ideally renderUI should take the new ID as active.
                        // Let's rely on the user selecting it or auto-select.
                    } else {
                        throw new Error("No data returned");
                    }
                } catch(e) {
                    alert('Parse failed. Try again.');
                    btn.innerText = '✨ Parse Resume & Create Profile';
                    btn.disabled = false;
                }
            };
        } else {
            if(els.btnStart) els.btnStart.onclick = () => {
                const pid = els.profileSelect.value;
                updateButtons(true);
                window.nodeActions.startAutomation(pid);
            };
            if(els.btnStop) els.btnStop.onclick = () => {
                updateButtons(false);
                window.nodeActions.stopAutomation();
            };
            document.getElementById('btnReload').onclick = () => window.nodeActions.reloadProfiles();
        }
    }

    // --- Assistant UI (Persistent) ---
    if(!document.getElementById('li-field-assistant')) {
        const assistant = document.createElement('div');
        assistant.id = 'li-field-assistant';
        assistant.style.display = 'none'; // hidden by default
        assistant.innerHTML = `
            <h4>🤔 Unknown Question</h4>
            <p id="li-field-question">Question...</p>
            <p style="font-size:11px; color:#666;">AI Suggested:</p>
            <div id="li-ai-suggestion" style="background:#f0f7ff; padding:6px; margin-bottom:8px; cursor:pointer;">...</div>
            <label style="font-size:11px; font-weight:600;">Your Answer:</label>
            <textarea id="li-manual-input"></textarea>
            <div style="font-size:11px; margin-bottom:8px;">
                <input type="checkbox" id="li-save-rule" checked> <label for="li-save-rule">Save to Profile</label>
            </div>
            <div class="field-actions">
                <button id="li-btn-use-manual" class="li-auto-btn btn-primary">Use This Answer</button>
                <button id="li-btn-skip-field" class="li-auto-btn btn-secondary">Skip</button>
            </div>
        `;
        document.body.appendChild(assistant);
        
        // Bind Assistant Elements
        els.assistant = assistant;
        els.questionText = document.getElementById('li-field-question');
        els.aiSuggestion = document.getElementById('li-ai-suggestion');
        els.manualInput = document.getElementById('li-manual-input');
        els.saveRule = document.getElementById('li-save-rule');

        document.getElementById('li-btn-use-manual').onclick = () => {
            if(currentResolve) {
                const ans = els.manualInput.value;
                currentResolve({ answer: ans, save: els.saveRule.checked });
                els.assistant.style.display = 'none';
                currentResolve = null;
            }
        };
        document.getElementById('li-btn-skip-field').onclick = () => {
             if(currentResolve) {
                currentResolve(null);
                els.assistant.style.display = 'none';
                currentResolve = null;
             }
        };
        els.aiSuggestion.onclick = () => {
            els.manualInput.value = els.aiSuggestion.innerText;
        };
    }

    function updateButtons(isRunning) {
        if(!els.btnStart || !els.btnStop) return;
        if(isRunning) {
            els.btnStart.style.display = 'none';
            els.btnStop.style.display = 'block';
            if(els.status) els.status.innerText = 'Running...';
            if(els.profileSelect) els.profileSelect.disabled = true;
        } else {
            els.btnStart.style.display = 'block';
            els.btnStop.style.display = 'none';
            if(els.status) els.status.innerText = 'Stopped / Ready';
            if(els.profileSelect) els.profileSelect.disabled = false;
        }
    }

    // Initial Render
    renderUI();

})();

