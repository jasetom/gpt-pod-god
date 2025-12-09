import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt } = await req.json();
    
    // Validate prompt exists
    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate prompt type
    if (typeof prompt !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Prompt must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sanitize and validate prompt length
    const sanitizedPrompt = prompt.trim();
    const MAX_PROMPT_LENGTH = 500;
    
    if (sanitizedPrompt.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Prompt cannot be empty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (sanitizedPrompt.length > MAX_PROMPT_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const FAL_KEY = Deno.env.get('FAL_KEY');
    if (!FAL_KEY) {
      throw new Error('FAL_KEY is not configured');
    }

    console.log('Generating design with gpt-image-1-mini (transparent background)...');

    // Step 1: Generate the initial design with transparent background
    const generateResponse = await fetch('https://fal.run/fal-ai/gpt-image-1-mini', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: `Create a professional print-on-demand t-shirt illustration.
The final output MUST be a fully isolated design on a 100% transparent background.

### GLOBAL REQUIREMENTS

* The design must contain zero background color, zero shapes, zero glow, zero haze, zero shadows, zero gradients, zero noise outside the main illustration.
* Background MUST be pure transparency only.

### INTERIOR COLOR RULES

* All interior areas of the design MUST be fully filled with opaque color.
* Gradients ARE allowed inside the design, but they must be:

  * fully opaque
  * smooth color transitions
  * NOT fading into transparency
  * NOT turning into soft shadows
  * NOT creating semi-transparent borders
* Interior gradients must remain strictly inside filled shapes bounded by outlines.

### OUTLINE RULES

* Every shape must have a bold, thick, consistent black outline.
* Outlines must have:

  * hard, crisp edges
  * no softness
  * no blur
  * no feathering
  * no glow
  * no partial transparency

### ABSOLUTE FORBIDDEN OUTPUT

Do NOT include ANY of the following:

* Background gradients
* Background color blocks
* Background textures
* Soft light, glows, fog, haze
* Transparency inside shapes
* Faded edges
* Subtle shadows or 3D effects
* Outer glows
* Edge-fade gradients
* Metallic sheen, reflective shine
* Semi-transparent pixels in ANY part of the image

### STYLE TARGET

* Bold flat vector aesthetic with optional opaque internal gradients
* Hard edges, crisp separation between shapes
* High contrast visibility on dark shirts
* Centered composition
* No element cut off by the frame

### TEXT RULES (Only if text is included)

* Text must use solid or opaque gradient fills only
* No inner glow
* No outer glow
* No transparency
* Bold black outlines
* Clean negative space
* Perfectly sharp edges

### OUTPUT GOAL

Produce a print-ready transparent PNG with:

* Fully opaque color usage
* Zero background artifacts
* Zero semi-transparency
* Clean silhouette
* Hard-edged outlines
* Optional opaque internal gradients
* No defects

### DESIGN REQUEST:

${sanitizedPrompt}`,
        image_size: '1024x1024',
        background: 'transparent',
        quality: 'high',
        num_images: 1,
        output_format: 'png'
      }),
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      console.error('Generation error:', generateResponse.status, errorText);
      
      if (generateResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Generation error: ${generateResponse.status}`);
    }

    const generateResult = await generateResponse.json();
    const initialImageUrl = generateResult.images?.[0]?.url;
    
    if (!initialImageUrl) {
      throw new Error('No image generated');
    }

    console.log('Step 2: AI Upscaling with Real-ESRGAN...');

    // Upscale using Real-ESRGAN for higher quality
    let upscaledImageUrl = initialImageUrl;
    
    try {
      const upscaleResponse = await fetch('https://fal.run/fal-ai/real-esrgan', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_url: initialImageUrl,
          scale: 4, // 4x upscale: 1024 -> 4096
          face_enhance: false,
          model: 'RealESRGAN_x4plus' // Best quality general model
        }),
      });

      if (upscaleResponse.ok) {
        const upscaleResult = await upscaleResponse.json();
        console.log('Upscale result:', JSON.stringify(upscaleResult));
        upscaledImageUrl = upscaleResult.image?.url || initialImageUrl;
        console.log('AI upscaling complete');
      } else {
        const errorText = await upscaleResponse.text();
        console.error('Upscale error:', upscaleResponse.status, errorText);
        console.log('Falling back to original resolution');
      }
    } catch (upscaleError) {
      console.error('Upscale exception:', upscaleError);
      console.log('Falling back to original resolution');
    }

    console.log('Step 3: Fetching images...');

    // Fetch both original (for alpha) and upscaled (for RGB)
    const [originalResponse, upscaledResponse] = await Promise.all([
      fetch(initialImageUrl),
      fetch(upscaledImageUrl)
    ]);

    if (!originalResponse.ok || !upscaledResponse.ok) {
      throw new Error('Failed to fetch images');
    }

    const originalBuffer = await originalResponse.arrayBuffer();
    const upscaledBuffer = await upscaledResponse.arrayBuffer();
    
    // Convert to base64
    const chunkSize = 32768;
    
    const originalUint8 = new Uint8Array(originalBuffer);
    let originalBinary = '';
    for (let i = 0; i < originalUint8.length; i += chunkSize) {
      const chunk = originalUint8.slice(i, i + chunkSize);
      originalBinary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const originalBase64 = btoa(originalBinary);
    const originalDataUrl = `data:image/png;base64,${originalBase64}`;

    const upscaledUint8 = new Uint8Array(upscaledBuffer);
    let upscaledBinary = '';
    for (let i = 0; i < upscaledUint8.length; i += chunkSize) {
      const chunk = upscaledUint8.slice(i, i + chunkSize);
      upscaledBinary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const upscaledBase64 = btoa(upscaledBinary);
    const upscaledDataUrl = `data:image/png;base64,${upscaledBase64}`;

    console.log('All steps complete!');

    return new Response(
      JSON.stringify({ 
        success: true,
        imageUrl: upscaledDataUrl,
        originalImageUrl: originalDataUrl, // For alpha channel extraction
        message: 'Design generated and upscaled successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating design:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate design';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
