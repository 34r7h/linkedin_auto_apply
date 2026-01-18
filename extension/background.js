// background.js - WebSocket Bridge
let socket = null;
let keepAliveInterval = null;

function connect() {
    console.log('[BG] Connecting to Local Server ws://127.0.0.1:8080...');
    socket = new WebSocket('ws://127.0.0.1:8080');

    socket.onopen = () => {
        console.log('[BG] Connected to Server');
        chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', connected: true }).catch(() => {});
        
        // Auto-request profiles immediately on connection
        socket.send(JSON.stringify({ type: 'loadProfiles' }));
        
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        keepAliveInterval = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'PING' }));
        }, 30000);
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'PONG') return;
            console.log('[BG] Received from Server:', data.type);
            
            // Forward DB updates to All LinkedIn Tabs (Broadcast)
            chrome.tabs.query({ url: "*://*.linkedin.com/*" }, (tabs) => {
                tabs.forEach(tab => {
                     chrome.tabs.sendMessage(tab.id, data).catch(() => {});
                });
            });
        } catch (e) {
            console.error('[BG] WS Parse Error', e);
        }
    };

    socket.onclose = () => {
        console.log('[BG] Disconnected. Reconnecting in 5s...');
        chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', connected: false }).catch(() => {});
        socket = null;
        setTimeout(connect, 5000);
    };

    socket.onerror = (err) => {
        console.error('[BG] WebSocket Error:', err);
        socket.close();
    };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CONNECT') {
        if (!socket || socket.readyState !== WebSocket.OPEN) connect();
        sendResponse({ connected: socket && socket.readyState === WebSocket.OPEN });
        return true;
    }
    
    // Map PARSE_RESUME (or parseResume) to server's parseResume format
    if (message.type === 'PARSE_RESUME' || message.type === 'parseResume') {
        const serverMsg = {
            type: 'parseResume',
            payload: {
                text: message.payload.text || message.payload, // Handle both object and raw text
                email: message.payload.email || '',
                password: message.payload.password || ''
            }
        };
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(serverMsg));
            sendResponse({ sent: true });
        } else {
            sendResponse({ sent: false, error: 'Not connected' });
        }
        return true;
    }
    
    // Relay these specific types direct to server
    if (['GET_JOB_HISTORY', 'DELETE_PROFILE', 'GET_OLLAMA_MODELS', 'UPDATE_PROFILE', 'SAVE_JOB_HISTORY', 'SAVE_ANSWER', 'LOAD_PROFILES', 'loadProfiles'].includes(message.type)) {
         if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
            sendResponse({ sent: true });
        } else {
            sendResponse({ sent: false, error: 'Not connected' });
        }
        return true;
    }

    if (message.type === 'RELAY_TO_TAB') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                console.log('[BG] Relaying to tab:', tabs[0].id, message.payload.type);
                chrome.tabs.sendMessage(tabs[0].id, message.payload).catch(err => console.error('[BG] Relay failed:', err));
            }
        });
        sendResponse({ sent: true });
        return true;
    }
    
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
        sendResponse({ sent: true });
    } else {
        sendResponse({ sent: false, error: 'Not connected' });
    }
    return true;
});

connect();
