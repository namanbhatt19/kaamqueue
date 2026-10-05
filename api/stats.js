export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Config error' });

  const headers = {
    ...sbAuthHeaders(SUPABASE_SERVICE_KEY)
  };

  try {
    // Total requests
    const countRes = await fetch(
      `${SUPABASE_URL}/rest/v1/kaamqueue_logs?select=id`,
      { headers }
    );
    const countData = await countRes.json();
    if (!countRes.ok) {
      return res.status(500).json({ error: 'Supabase error', status: countRes.status, detail: countData?.message || countData });
    }
    const totalRequests = Array.isArray(countData) ? countData.length : 0;

    // Distinct shop types
    const shopRes = await fetch(
      `${SUPABASE_URL}/rest/v1/kaamqueue_logs?select=shop_type`,
      { headers }
    );
    const shopData = await shopRes.json();
    const shopTypes = new Set((shopData || []).map(r => r.shop_type)).size;

    // Distinct languages
    const langRes = await fetch(
      `${SUPABASE_URL}/rest/v1/kaamqueue_logs?select=language_detected`,
      { headers }
    );
    const langData = await langRes.json();
    const languages = new Set((langData || []).map(r => r.language_detected)).size;

    // Most common request type
    const typeRes = await fetch(
      `${SUPABASE_URL}/rest/v1/kaamqueue_logs?select=request_type`,
      { headers }
    );
    const typeData = await typeRes.json();
    const typeCounts = {};
    (typeData || []).forEach(r => { typeCounts[r.request_type] = (typeCounts[r.request_type] || 0) + 1; });
    const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];

    // Average token usage per request
    const tokRes = await fetch(
      `${SUPABASE_URL}/rest/v1/kaamqueue_logs?select=input_tokens,output_tokens`,
      { headers }
    );
    const tokData = await tokRes.json();
    const avg = (key) => tokData.length ? Math.round(tokData.reduce((s, r) => s + (r[key] || 0), 0) / tokData.length) : 0;

    return res.status(200).json({
      total_requests: totalRequests,
      shop_types: shopTypes,
      languages: languages,
      top_request_type: topType ? topType[0] : 'N/A',
      avg_input_tokens: avg('input_tokens'),
      avg_output_tokens: avg('output_tokens')
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load stats.', detail: String(e?.cause?.code || e?.message || e) });
  }
}

// Legacy service_role keys are JWTs and also go in the Authorization header;
// new sb_secret_ keys are rejected there and must be sent as apikey only.
function sbAuthHeaders(key) {
  return key.startsWith('eyJ') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}
