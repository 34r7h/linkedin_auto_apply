# LinkedIn Auto-Apply

Automated LinkedIn job application system using Chrome Extension + WebSocket Server + AI.

## Architecture

```
Chrome Extension (Browser)
    ↕ WebSocket
Node.js Server (localhost:8080)
    ↕ AI
Ollama (Local AI - llama3.2)
```

### Components

1. **Chrome Extension** (`extension/`)
   - `manifest.json` - Extension config
   - `background.js` - WebSocket client, message relay
   - `content.js` - Main UI overlay on LinkedIn jobs pages
   - `overlay.js` - Legacy overlay (being phased out)
   - `overlay.css` - Extension styling

2. **Node.js Server** (`apply_linkedin.js`)
   - WebSocket server on port 8080
   - Profile management (load/save from `profiles.json`)
   - AI integration via Ollama
   - Resume parsing
   - Job application automation

3. **Profile Storage** (`profiles.json`)
   - Stores user profiles with personal info, work history, skills, etc.
   - Format: `{ "profile_id": { ...profileData } }`

## User Workflow

### Setup (One Time)

1. **Start the server**
   ```bash
   cd /Users/34r7h/Developer/hacks/linkedin-auto-apply
   node apply_linkedin.js
   ```
   - Server runs on `ws://localhost:8080`
   - Loads profiles from `profiles.json`

2. **Load Chrome Extension**
   - Open Chrome: `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension/` folder
   - **CRITICAL**: Click reload button (🔄) on extension after ANY code changes

3. **Verify Connection**
   - Navigate to https://www.linkedin.com/jobs/
   - Extension overlay should appear on the right side
   - Status should show "Ready" or profile count
   - **If stuck on "Loading Profiles..."**: Reload extension in Chrome

### Creating a Profile

**Option 1: From Resume (Recommended)**
1. On LinkedIn jobs page, overlay shows "Create Profile" form
2. Paste resume text into textarea
3. (Optional) Enter LinkedIn email/password for auto-login
4. Click "✨ Parse Resume & Create Profile"
5. AI extracts info and creates profile in `profiles.json`
6. Overlay refreshes to show profile selector

**Option 2: Manual Edit**
1. Edit `profiles.json` directly
2. Follow existing profile structure:
   ```json
   {
     "profile_id": {
       "id": "profile_id",
       "profileName": "Display Name",
       "firstName": "First",
       "lastName": "Last",
       "email": "email@example.com",
       "phone": "123-456-7890",
       "loginPassword": "optional_linkedin_password",
       "linkedin": "https://linkedin.com/in/username",
       "github": "https://github.com/username",
       "website": "https://example.com",
       "workExperience": [...],
       "education": [...],
       "skills": [...],
       "certifications": [...],
       "customQuestions": {...}
     }
   }
   ```
3. Server auto-reloads profiles (or click "Reload Profiles" in overlay)

### Applying to Jobs

1. **Navigate to LinkedIn job posting**
   - Any page with URL pattern: `linkedin.com/jobs/*`
   - Extension overlay appears automatically

2. **Select Profile**
   - Overlay shows dropdown with all profiles
   - Select the profile to use for applications

3. **Start Automation**
   - Click "Start Applying" button
   - Bot clicks "Easy Apply" button
   - Fills out application form fields using profile data
   - For unknown questions: AI generates answer → shows modal for approval
   - User approves/edits answer → optionally saves to profile
   - Bot submits application

4. **Monitor Progress**
   - Activity log in overlay shows each step
   - Status updates in real-time
   - Click "Stop" to halt automation

### Managing Profiles

- **Switch Profile**: Use dropdown in overlay
- **Delete Profile**: Click "🗑️ Delete Profile" button
- **Edit Profile**: Edit `profiles.json` → Click "Reload Profiles"
- **Update from Resume**: Parse new resume (creates new profile)

## WebSocket Messages

### Client → Server

| Message Type | Payload | Description |
|---|---|---|
| `loadProfiles` | none | Request all profiles |
| `LOAD_PROFILES` | none | Same as above (case variant) |
| `parseResume` | `{text, email, password}` | Parse resume text |
| `START_AUTOMATION` | `{profileId, jobUrl}` | Start job application |
| `DELETE_PROFILE` | `{profileId}` | Delete profile |
| `UPDATE_PROFILE` | `{...profile}` | Update existing profile |
| `PING` | none | Keepalive ping |

### Server → Client

| Message Type | Payload | Description |
|---|---|---|
| `PROFILES_LOADED` | `{profile_id: {...}}` | Full profiles object |
| `PROFILE_DELETED` | none | Profile deleted successfully |
| `PROFILE_UPDATED` | none | Profile updated successfully |
| `RESUME_PARSED` | none | Resume parsing complete |
| `REQUEST_ANSWER` | `{question, suggestedAnswer}` | Ask user for approval |
| `ERROR` | `{message}` | Error occurred |
| `PONG` | none | Keepalive response |

## Expected Behavior

### On Extension Load
1. Extension connects to `ws://localhost:8080`
2. Background script sends `loadProfiles` message
3. Server responds with `PROFILES_LOADED` + profile data
4. Content script receives message via `chrome.runtime.onMessage`
5. Overlay renders with profile selector (if profiles exist) OR create form (if no profiles)

### Profile Display
- **No profiles**: Shows "Create Profile" form with resume textarea
- **Has profiles**: Shows profile dropdown + "Start Applying" button + profile details
- **Profile count**: Shown in overlay header or status area

### Error States
- **"Loading Profiles..."**: WebSocket not connected or message not received
- **"Error connecting to server"**: Server not running or wrong port
- **"Extension context invalidated"**: Extension needs reload in Chrome
- **Empty dropdown**: Profiles not parsed correctly from server response

## Troubleshooting

### Profiles Not Loading

1. **Check server is running**
   ```bash
   ps aux | grep "node apply_linkedin.js"
   ```

2. **Check server output**
   - Should show: `🚀 LinkedIn Auto-Apply Server running on ws://localhost:8080`
   - Should show: `[SERVER] Loaded X profiles.`

3. **Reload extension**
   - Go to `chrome://extensions/`
   - Find "LinkedIn Auto-Apply"
   - Click reload button (🔄)

4. **Check browser console**
   - F12 → Console tab
   - Look for extension logs
   - Look for WebSocket errors

5. **Verify profiles.json**
   - File exists and is valid JSON
   - Has at least one profile object

### Extension Context Invalidated

**Cause**: Extension code changed but Chrome still using old version

**Fix**: 
1. `chrome://extensions/`
2. Find extension
3. Click 🔄 button
4. Refresh LinkedIn page

### Connection Errors

- Verify server running on port 8080
- Check `extension/background.js` port matches (line 7)
- Check firewall not blocking localhost:8080

## Development Notes

- Server auto-reloads `profiles.json` on file changes
- Extension requires manual reload in Chrome after code changes
- Ollama must be running for AI features: `ollama serve`
- Model required: `ollama pull llama3.2`

## Files Reference

- `apply_linkedin.js` - Main server (485 lines)
- `extension/background.js` - WebSocket bridge (83 lines)
- `extension/content.js` - Main UI (460 lines)
- `extension/manifest.json` - Extension config
- `profiles.json` - Profile database
- `README.md` - This file
