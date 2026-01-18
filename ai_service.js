const fs = require('fs');

/**
 * AI Service for generating answers to job application questions.
 * Supports: Ollama (default), OpenAI, Anthropic, Gemini.
 */
class AIService {
    constructor(config = {}) {
        this.provider = config.provider || 'ollama';
        this.apiKey = config.apiKey || '';
        this.baseUrl = config.baseUrl || ''; // Custom URL for Ollama/OpenAI-compatible
        this.model = config.model || ''; 
        
        // Defaults
        if (this.provider === 'ollama' && !this.baseUrl) this.baseUrl = 'http://127.0.0.1:11434';
    }

    async generateAnswer(question, context = {}, resumeText = '') {
        const prompt = this._constructPrompt(question, context, resumeText);
        
        try {
            console.log(`🤖 Asking AI (${this.provider})...`);
            switch (this.provider) {
                case 'ollama':
                    return await this._callOllama(prompt);
                case 'openai':
                    return await this._callOpenAI(prompt);
                case 'anthropic':
                    return await this._callAnthropic(prompt);
                case 'gemini':
                    return await this._callGemini(prompt);
                default:
                    throw new Error(`Unknown provider: ${this.provider}`);
            }
        } catch (e) {
            console.error('AI Generation Failed:', e.message);
            return null; // Fallback to manual/default handling
        }
    }

    _constructPrompt(question, context, resumeText) {
        // Safe truncate resume if too long (approx 20k chars)
        const safeResume = resumeText.slice(0, 20000);
        
        let prompt = `You are an assistant applying for a job on my behalf.
I need you to answer the following application form question based on my resume and profile.

QUESTION: "${question}"

CONTEXT:
${context.options ? `This is a multiple choice/dropdown question. Available options: ${JSON.stringify(context.options)}. Pick the best one.` : ''}
${context.type === 'number' ? 'The answer MUST be a single number (integer).' : ''}
${context.type === 'boolean' ? 'The answer must be "Yes" or "No".' : ''}

MY RESUME:
${safeResume}

INSTRUCTIONS:
- Answer ONLY the question. Do not explain.
- If it's a number field, return JUST the number.
- If it's yes/no, return JUST "Yes" or "No".
- If selecting an option, return the exact text of the option.
- If you don't know, make a best professional guess based on the resume (e.g. if asked for React experience and I used it in a project 5 years ago, say 5).
`;
        return prompt;
    }

    async extractProfileInfo(resumeText, ws = null) {
        const cleanText = resumeText
            .replace(/[➔●►]/g, '-')
            .replace(/[^\x20-\x7E\n\t]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        let prompt = `You are a data extraction assistant for LinkedIn job applications.
Extract profile information from this resume.

RESUME:
${cleanText.slice(0, 15000)}

INSTRUCTIONS:
- Return ONLY valid JSON.
- No markdown code blocks.
- Extract: firstName, lastName, email, phone, linkedin, github, city, state, country, currentCompany, yearsExperience (int), experience (map of tech->years), workAuthorization, sponsorship, willingToRelocate.
- Example JSON structure:
{
  "firstName": "Mark", "lastName": "Smith", "email": "mark@test.com", "phone": "123-456-7890",
  "linkedin": "...", "github": "...", "city": "NY", "state": "NY", "country": "USA",
  "currentCompany": "StartUp", "yearsExperience": 5,
  "experience": { "React": 5, "Node": 3 },
  "workAuthorization": "US Citizen", "sponsorship": "No", "willingToRelocate": "Yes"
}
`;
        
        try {
            console.log('🤖 Extracting Profile Info...');
            if (ws) ws.send(JSON.stringify({ type: 'LOG', payload: { msg: '📋 Preparing AI extraction prompt...', type: 'info' } }));
            
            let result = null;
            if (this.provider === 'ollama') {
                if (ws) ws.send(JSON.stringify({ type: 'LOG', payload: { msg: '🤖 Calling Ollama AI (smollm2)...', type: 'info' } }));
                result = await this._callOllama(prompt);
            } else if (this.provider === 'openai') {
                if (ws) ws.send(JSON.stringify({ type: 'LOG', payload: { msg: '🤖 Calling OpenAI...', type: 'info' } }));
                result = await this._callOpenAI(prompt);
            } else if (this.provider === 'anthropic') result = await this._callAnthropic(prompt);
            else if (this.provider === 'gemini') result = await this._callGemini(prompt);
            
            if (ws) ws.send(JSON.stringify({ type: 'LOG', payload: { msg: '✅ AI responded! Parsing JSON...', type: 'success' } }));
            
            if (result) {
                result = result.replace(/```json/g, '').replace(/```/g, '').trim();
                const start = result.indexOf('{');
                const end = result.lastIndexOf('}');
                
                if (start !== -1 && end !== -1 && end > start) {
                    result = result.slice(start, end + 1);
                }
                
                if (ws) ws.send(JSON.stringify({ type: 'LOG', payload: { msg: '🎉 Profile data extracted successfully!', type: 'success' } }));
                return JSON.parse(result);
            }
        } catch (e) {
            console.error('Profile Extraction Failed:', e);
            if (ws) ws.send(JSON.stringify({ type: 'LOG', payload: { msg: `❌ Error: ${e.message}`, type: 'error' } }));
        }
        return null;
    }

    async _callOllama(prompt) {
        const model = this.model || 'llama3.2:latest';  
        console.log(`[AI] Calling Ollama (${model})...`);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.error('[AI] Ollama timeout after 120s');
                controller.abort();
            }, 120000);

            console.log(`[AI] Sending request to ${this.baseUrl}/api/generate`);
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    prompt: prompt,
                    stream: false
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                console.error(`Ollama Error: ${response.status} ${await response.text()}`);
                throw new Error(`Ollama API Error: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            const raw = data.response ? data.response.trim() : null;
            console.log(`[Ollama RAW] Length: ${raw ? raw.length : 0} | Preview: ${raw ? raw.substring(0, 50) + '...' : 'null'}`);
            return raw;
        } catch (e) {
            console.error('🔴 Ollama Connection Failed:', e.message);
            throw e;
        }
    }

    async _callOpenAI(prompt) {
        const model = this.model || 'gpt-4o';
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim();
    }

    async _callAnthropic(prompt) {
        const model = this.model || 'claude-3-5-sonnet-20240620';
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 1024,
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const data = await response.json();
        return data.content?.[0]?.text?.trim();
    }

    async _callGemini(prompt) {
        const model = this.model || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    }
}

module.exports = AIService;
