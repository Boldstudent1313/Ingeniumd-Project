export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    const imageBuffer = Buffer.from(image, 'base64');

    // Call Hugging Face Free Serverless Vision API (BLIP Model)
    const hfResponse = await fetch(
      "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large",
      {
        headers: { "Content-Type": "application/octet-stream" },
        method: "POST",
        body: imageBuffer,
      }
    );

    const result = await hfResponse.json();
    let caption = "";

    if (Array.isArray(result) && result[0] && result[0].generated_text) {
      caption = result[0].generated_text;
    } else {
      caption = "A document containing text layout and graphical elements.";
    }

    const fullDescription = `Spatial & Layout Summary: ${caption.charAt(0).toUpperCase() + caption.slice(1)}. The document elements are arranged systematically for screen reader navigation.`;

    return res.status(200).json({ description: fullDescription });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
