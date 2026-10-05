export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Config error' });

  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
  };

  try {
    // Total requests
    const countRes = await fetch(
      `${SUPABASE_URL}/rest/v1/kaamqueue_logs?select=id`,
      { headers }
    );
    const countData = await countRes.json();
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

    return res.status(200).json({
      total_requests: totalRequests,
      shop_types: shopTypes,
      languages: languages,
      top_request_type: topType ? topType[0] : 'N/A'
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load stats.' });
  }
}
