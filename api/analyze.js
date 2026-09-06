export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { image } = req.body || {};
    if (!image) return res.status(400).json({ error: 'No image data received' });

    // Clean base64 and create binary buffer
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '').replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    if (buffer.length === 0) return res.status(400).json({ error: 'Empty image buffer received' });

    const hfToken = process.env.HF_TOKEN;
    const headers = { 'Content-Type': 'application/octet-stream' };
    if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`;

    const MODEL_URL = "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large";

    const hfRes = await fetch(MODEL_URL, {
      method: "POST",
      headers,
      body: buffer,
    });

    // VERCEL TIMEOUT FIX: If HF is waking up, immediately tell frontend to wait and retry.
    if (hfRes.status === 503) {
      const errJson = await hfRes.json().catch(() => ({}));
      return res.status(503).json({ 
        error: 'Model is waking up', 
        waitTime: errJson.estimated_time || 15 
      });
    }

    if (!hfRes.ok) {
      const errText = await hfRes.text().catch(() => 'Unknown error');
      if (hfRes.status === 401) {
         return res.status(401).json({ error: 'Invalid or missing Hugging Face API Token (HF_TOKEN) in Vercel settings.' });
      }
      return res.status(hfRes.status).json({ error: `AI Processing Failed (${hfRes.status}): ${errText}` });
    }

    const result = await hfRes.json();
    let caption = "a document containing text and visual elements";

    if (Array.isArray(result) && result[0] && result[0].generated_text) {
      caption = result[0].generated_text;
    } else if (result && result.generated_text) {
      caption = result.generated_text;
    }

    const fullDescription = `Visual Description: ${caption.charAt(0).toUpperCase() + caption.slice(1)}.`;
    return res.status(200).json({ description: fullDescription });

  } catch (error) {
    console.error("Serverless Handler Error:", error);
    return res.status(500).json({ error: error.message || 'Server network error' });
  }
}
