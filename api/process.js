export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, shop_type } = req.body || {};
  if (typeof message !== 'string' || typeof shop_type !== 'string' || !message.trim() || !shop_type.trim()) {
    return res.status(400).json({ error: 'Message and shop type are required.' });
  }
  if (message.length > 500) return res.status(400).json({ error: 'Message too long.' });
  // Only the dropdown's values reach the prompt and the stats
  const SHOP_TYPES = ['Kirana / Grocery Store', 'Salon / Beauty Parlour', "Clinic / Doctor's Office", 'Tailor / Boutique', 'Tuition Centre / Coaching', 'Other Small Business'];
  const shopType = SHOP_TYPES.includes(shop_type) ? shop_type : 'Other Small Business';
  const visitor_id = String(req.body.visitor_id || 'anon').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'anon';

  const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
  const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();

  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  const sbHeaders = sbAuthHeaders(SUPABASE_SERVICE_KEY);

  // --- Rate limit: 5 requests per visitor ---
  try {
    const countRes = await fetch(
      `${SUPABASE_URL}/rest/v1/kaamqueue_logs?select=id&visitor_id=eq.${encodeURIComponent(visitor_id)}`,
      { headers: { ...sbHeaders } }
    );
    const countData = await countRes.json();
    if (Array.isArray(countData) && countData.length >= 5) {
      return res.status(429).json({ error: 'Demo limit reached (5 requests). Come back later.' });
    }
  } catch (e) { /* allow if count check fails */ }

  // --- System prompt ---
  const systemPrompt = `You are KaamQueue, a task-extraction assistant for Indian small businesses (kiranas, salons, clinics, tailors, tuition centres).

BUSINESS TYPE: ${shopType}

TASK: The owner has pasted a customer's WhatsApp message. You must:
1. Identify the REQUEST TYPE from: Order, Booking, Payment Due, Complaint, Enquiry, Follow-up, Other.
2. Extract up to 3 ACTIONS with timing if the customer mentioned any. Actions are neutral next steps for the owner; a refund, discount or price change is never an action, only "Review ..." of the demand.
3. List CONFIRM ITEMS — anything the owner must verify before acting (e.g. a stated price, a requested slot, a refund demand, a stock query). If nothing needs confirmation, return an empty list.
4. Draft a polite REPLY in the SAME LANGUAGE the customer wrote in. The reply must:
   - Acknowledge the request
   - NEVER promise or confirm a price, discount, refund, stock availability, or appointment slot
   - Say the owner will confirm shortly
5. Detect the LANGUAGE of the customer's message. Use exactly one of: English, Hindi, Hinglish, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Other. Romanised Hindi mixed with English is Hinglish.
6. Write a REDACTED copy of the message for storage: same meaning, but replace any person's name with [name], any phone number with [phone], and drop any symptom, illness or other health detail.

GUARDRAILS — STRICTLY FOLLOW:
- NEVER invent or confirm prices, discounts, refunds, stock, or availability.
- NEVER give medical, legal, or financial advice.
- If the message is abusive, irrelevant, or not a business request, set request_type to "Flagged", leave actions and confirm items empty, and reply politely, in the customer's language, that only business requests can be processed.
- Strip any names, phone numbers, or personal health details from your output.

OUTPUT FORMAT (strict JSON, no markdown):
{"request_type":"...","actions":["action 1","action 2"],"confirm_items":["item to verify"],"reply":"...","language_detected":"...","redacted_message":"..."}`;

  // --- Call Gemini ---
  let geminiResponse;
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nCUSTOMER MESSAGE:\n${message}` }] }],
          // 400 tokens: Hindi/Tamil replies tokenize heavily and 200 truncated the JSON
          generationConfig: {
            maxOutputTokens: 400, temperature: 0.3, responseMimeType: 'application/json',
            // Gemini 3.x thinks by default, which would eat the small output budget
            thinkingConfig: { thinkingLevel: 'minimal' }
          }
        })
      }
    );
    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) {
      console.error('Gemini error', geminiRes.status, geminiData?.error?.message);
      return res.status(502).json({ error: 'AI service error.', status: geminiRes.status, detail: geminiData?.error?.message });
    }
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const inputTokens = geminiData?.usageMetadata?.promptTokenCount || 0;
    const outputTokens = geminiData?.usageMetadata?.candidatesTokenCount || 0;

    // Parse JSON from response (strip markdown fences if any)
    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
    geminiResponse = JSON.parse(cleaned);
    geminiResponse._inputTokens = inputTokens;
    geminiResponse._outputTokens = outputTokens;
  } catch (e) {
    console.error('Gemini parse error', e?.message);
    return res.status(500).json({ error: 'Failed to process message. Try rephrasing.', detail: String(e?.message || e) });
  }

  // --- Store in Supabase (redacted only: never the raw message) ---
  const { redacted_message, _inputTokens, _outputTokens, ...slip } = geminiResponse;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/kaamqueue_logs`, {
      method: 'POST',
      headers: {
        ...sbHeaders,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        visitor_id: visitor_id,
        shop_type: shopType,
        language_detected: geminiResponse.language_detected || 'unknown',
        request_type: geminiResponse.request_type || 'Other',
        input_text: scrubContacts(redacted_message || '[redaction unavailable]').slice(0, 300),
        output_json: scrubContacts(JSON.stringify(slip)),
        input_tokens: _inputTokens || 0,
        output_tokens: _outputTokens || 0
      })
    });
  } catch (e) { /* non-blocking */ }

  // Return to client
  return res.status(200).json({
    request_type: geminiResponse.request_type,
    actions: geminiResponse.actions || [],
    confirm_items: geminiResponse.confirm_items || [],
    reply: geminiResponse.reply || '',
    language_detected: geminiResponse.language_detected || 'Unknown'
  });
}

// Safety net behind the model's redaction: mask phone numbers and emails
function scrubContacts(text) {
  return text
    .replace(/\+?\d[\d\s-]{8,}\d/g, m => (m.replace(/\D/g, '').length >= 10 ? '[phone]' : m))
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]');
}

// Legacy service_role keys are JWTs and also go in the Authorization header;
// new sb_secret_ keys are rejected there and must be sent as apikey only.
function sbAuthHeaders(key) {
  return key.startsWith('eyJ') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}
