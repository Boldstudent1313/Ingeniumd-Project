export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Please use POST.' });
  }

  try {
    const { image } = req.body || {};
    if (!image) {
      return res.status(400).json({ error: 'No image data received by server.' });
    }

    // Convert Base64 data to Binary Buffer
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '').replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty image buffer.' });
    }

    const hfToken = process.env.HF_TOKEN;
    const headers = {
      'Content-Type': 'application/octet-stream'
    };
    if (hfToken) {
      headers['Authorization'] = `Bearer ${hfToken}`;
    }

    const MODEL_URL = "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large";

    let attempts = 0;
    let maxAttempts = 3;
    let hfRes;

    while (attempts < maxAttempts) {
      attempts++;
      hfRes = await fetch(MODEL_URL, {
        method: "POST",
        headers,
        body: buffer,
      });

      // Retry on 503 Model Cold Start / Loading State
      if (hfRes.status === 503) {
        const errJson = await hfRes.json().catch(() => ({}));
        const waitSec = Math.min(errJson.estimated_time || 5, 8);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        continue;
      }
      break;
    }

    if (!hfRes || !hfRes.ok) {
      const errText = await hfRes.text().catch(() => 'Unknown error');
      console.error("HF Inference Error:", hfRes?.status, errText);
      return res.status(hfRes?.status || 500).json({
        error: `AI Model Error (${hfRes?.status || 500}): ${errText || 'Failed to process image'}`
      });
    }

    const data = await hfRes.json();
    let description = "A captured photo.";

    if (Array.isArray(data) && data[0]?.generated_text) {
      description = data[0].generated_text;
    } else if (data?.generated_text) {
      description = data.generated_text;
    }

    description = description.charAt(0).toUpperCase() + description.slice(1);
    if (!description.endsWith('.')) description += '.';

    return res.status(200).json({ description });

  } catch (err) {
    console.error("Vercel Function Error:", err);
    return res.status(500).json({ error: err.message || 'Internal server error.' });
  }
}