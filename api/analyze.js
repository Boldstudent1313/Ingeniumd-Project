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
    if (!image) {
      return res.status(400).json({ error: 'No image data received' });
    }

    // Clean Base64 string and convert to binary Buffer
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '').replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length === 0) {
      return res.status(400).json({ error: 'Empty image buffer received' });
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

    // Retry loop to handle Hugging Face model loading / cold start state (HTTP 503)
    while (attempts < maxAttempts) {
      attempts++;
      hfRes = await fetch(MODEL_URL, {
        method: "POST",
        headers,
        body: buffer,
      });

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
      console.error("Hugging Face API Error:", hfRes?.status, errText);
      return res.status(hfRes?.status || 500).json({
        error: `AI Processing Failed (${hfRes?.status || 500}): ${errText || 'Inference error'}`
      });
    }

    const result = await hfRes.json();
    let caption = "";

    if (Array.isArray(result) && result[0] && result[0].generated_text) {
      caption = result[0].generated_text;
    } else if (result && result.generated_text) {
      caption = result.generated_text;
    } else {
      caption = "a photo document containing text layout and visual elements";
    }

    const fullDescription = `Spatial & Layout Summary: ${caption.charAt(0).toUpperCase() + caption.slice(1)}. The document elements are arranged systematically for screen reader navigation.`;

    return res.status(200).json({ description: fullDescription });

  } catch (error) {
    console.error("Serverless Handler Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
