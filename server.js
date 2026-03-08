require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Rate limiter ─────────────────────────────────────────────────────────────
const RATE_LIMIT = 10;
const rateLimitMap = new Map(); // ip → { count, resetAt }

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now >= entry.resetAt) {
    // Start of a new day window — midnight UTC
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    rateLimitMap.set(ip, { count: 1, resetAt: tomorrow.getTime() });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;

  entry.count += 1;
  return true;
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── GET / — serve the app ───────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── GET /seo-guide — serve the SEO guide ────────────────────────────────────
app.get('/seo-guide', (req, res) => {
  res.sendFile(path.join(__dirname, 'seo-guide.html'));
});

// ── POST /api/generate — proxy to Anthropic ─────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "You've reached today's limit. Come back tomorrow!" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'sk-ant-your-key-here') {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured in the .env file.' });
  }

  const { content, count, tone, language } = req.body;
  if (!content || content.trim().length < 10) {
    return res.status(400).json({ error: 'Content is required and must be at least 10 characters.' });
  }

  const faqCount = Number.isInteger(count) && count >= 3 && count <= 7 ? count : 6;

  const validTones = ['Professional', 'Casual', 'Authoritative'];
  const selectedTone = validTones.includes(tone) ? tone : 'Professional';

  const validLanguages = ['English', 'Spanish', 'French', 'German', 'Dutch', 'Japanese'];
  const selectedLanguage = validLanguages.includes(language) ? language : 'English';

  const toneGuide = {
    Professional: 'Use clear, formal, business-appropriate language. Be precise and polished without being stiff.',
    Casual: 'Use friendly, conversational language as if chatting with a friend. Keep it warm, approachable, and jargon-free.',
    Authoritative: 'Use confident, expert language backed by specifics. Be definitive and data-driven. Establish credibility.',
  }[selectedTone];

  const prompt = `You are an FAQ expert. Based on the following content, generate exactly ${faqCount} frequently asked questions with clear, concise answers. These FAQs should reflect what real users would ask about this topic.

Tone: ${selectedTone} — ${toneGuide}

Return ONLY a valid JSON array with no extra text, markdown, or explanation. Format:
[
  {"q": "Question here?", "a": "Answer here (2-4 sentences)."},
  ...
]

Rules:
- Questions must be natural and conversational, as a real person would type them
- Answers must be accurate based ONLY on the provided content
- Each answer must be 2–3 sentences maximum — clear, concise, and direct
- Apply the specified tone consistently to both questions and answers
- Do not number the questions
- Return exactly ${faqCount} items
- Write all questions and answers in ${selectedLanguage}

Content:
${content.slice(0, 8000)}`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json().catch(() => ({}));
      console.error('Anthropic error:', JSON.stringify(err, null, 2));
      const msg = err?.error?.message || `Anthropic API error ${anthropicRes.status}`;
      return res.status(anthropicRes.status).json({ error: msg });
    }

    const data = await anthropicRes.json();
    const raw = data.content?.[0]?.text || '';

    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      return res.status(500).json({ error: 'Claude returned an unexpected format. Please try again.' });
    }

    const faqs = JSON.parse(match[0]);
    if (!Array.isArray(faqs) || faqs.length === 0) {
      return res.status(500).json({ error: 'No FAQs were returned. Please try again.' });
    }

    res.json({ faqs });
  } catch (err) {
    res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

// ── POST /api/fetch-url — fetch a URL server-side ───────────────────────────
app.post('/api/fetch-url', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required.' });
  }

  let parsed;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return res.status(400).json({ error: 'URL must use http or https.' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL.' });
  }

  try {
    const pageRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FAQGenerator/1.0)' },
      timeout: 10000,
    });

    if (!pageRes.ok) {
      return res.status(400).json({ error: `Could not fetch that page (HTTP ${pageRes.status}).` });
    }

    const contentType = pageRes.headers.get('content-type') || '';
    if (!contentType.includes('html') && !contentType.includes('text')) {
      return res.status(400).json({ error: 'That URL does not appear to be an HTML page.' });
    }

    const html = await pageRes.text();

    // Strip HTML tags and clean up whitespace
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s{3,}/g, '\n\n')
      .trim()
      .slice(0, 8000);

    if (text.length < 50) {
      return res.status(400).json({ error: 'Could not extract enough text from that page. Try pasting the content manually.' });
    }

    res.json({ content: text });
  } catch (err) {
    res.status(400).json({ error: `Failed to fetch URL: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`FAQ Generator running at http://localhost:${PORT}`);
});
