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

### FRAME & TRANSPARENCY REQUIREMENTS

* The entire design MUST fit completely within the image frame.
* No part of the artwork may be cut off, cropped, or touching any edge of the canvas.
* There must be a clean, even transparent margin around the entire illustration.
* Background must remain 100% transparent with **no shapes, no fragments, no noise, no haze, no color bleed, no gradient fade** near the edges.
* Do NOT extend any stroke, glow, fade, or color beyond the interior of the illustration.
* The illustration should appear centered with balanced spacing on all sides.
* No clipped elements, no incomplete outlines, no truncated shapes.
* All outlines and shapes must be fully visible and fully contained inside the boundaries of the canvas.

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
        image_size: '1024x1536',
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

    console.log('Fetching generated image and starting SeedVR upscale in parallel...');

    // Helper to convert array buffer to base64 data URL
    const arrayBufferToDataUrl = (buffer: ArrayBuffer): string => {
      const uint8Array = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 32768;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64 = btoa(binary);
      return `data:image/png;base64,${base64}`;
    };

    // Parallel: fetch original image AND run SeedVR upscale
    const [imageResponse, seedvrImageUrl] = await Promise.all([
      // Fetch original image
      fetch(initialImageUrl),
      
      // SeedVR 3x upscale - high quality AI upscaler
      (async () => {
        try {
          console.log('Starting SeedVR 3x upscale...');
          const seedvrResponse = await fetch('https://fal.run/fal-ai/seedvr/upscale/image', {
            method: 'POST',
            headers: {
              'Authorization': `Key ${FAL_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              image_url: initialImageUrl,
              upscale_factor: 3,
              seed: 9000,
            }),
          });

          if (!seedvrResponse.ok) {
            console.error('SeedVR upscale failed:', seedvrResponse.status);
            return null;
          }

          const seedvrData = await seedvrResponse.json();
          const url = seedvrData.image?.url;
          
          if (!url) {
            console.error('No SeedVR image URL returned');
            return null;
          }

          console.log('SeedVR 3x upscale complete!');
          return url;
        } catch (err) {
          console.error('SeedVR upscale error:', err);
          return null;
        }
      })()
    ]);

    if (!imageResponse.ok) {
      throw new Error('Failed to fetch image');
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const dataUrl = arrayBufferToDataUrl(imageBuffer);

    console.log('Generation complete!');

    return new Response(
      JSON.stringify({ 
        success: true,
        imageUrl: dataUrl,
        seedvrImageUrl: seedvrImageUrl,
        message: 'Design generated successfully'
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