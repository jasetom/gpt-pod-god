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

    console.log('Step 1: Generating design with gpt-image-1-mini (transparent background)...');

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

ALL ENCLOSED SHAPES MUST BE FILLED WITH A SINGLE FLAT, UNIFORM, FULLY OPAQUE COLOR.
Do NOT leave any interior areas empty or transparent unless explicitly intended.
Do NOT add ANY tonal variation inside shapes.

CRITICAL GLOBAL RULES:

* Use solid, fully opaque colors only. No pixel may contain partial opacity.
* No gradients, no soft blends, no tonal ramps, no shading, no lighting effects.
* All interior fills must be 100% flat and uniform with ZERO variation.
* Do not simulate curvature, volume, depth, highlights, or shadows of any kind.
* Every shape must have a thick, consistent black outline with uniform stroke width.
* All edges must be hard-edged vector-style. Absolutely no soft or feathered edges.
* No noise, texture, grain, dithering, or semi-realistic rendering.

ANTI-FAILSAFE OVERRIDES:

* Background must be pure transparency only — no color, halo, or haze.
* Do NOT fade edges into transparency. All edges must be solid and crisp.
* Do NOT add soft antialiasing.
* Do NOT simulate shadows using darker tones unless they are strictly flat shapes with black outlines.
* Do NOT alter brightness or color inside shapes.
* Do NOT create subtle variations, gradients, or lighting on text or characters.
* Do NOT add dimensional effects around text (no inner glow, outer glow, or shadow).

STRICT 2D RULE:
Render the entire design in a pure 2D flat vector style with no depth, no perspective shading, and no three-dimensional cues.

STYLE TARGET:

* Flat vector illustration (screen-printing aesthetic)
* Bold, high-contrast palette optimized for dark t-shirts
* Clean cartoon graphic clarity
* Centered composition with all elements fully inside the frame
* If text is included, it must follow:

  * solid opaque fill
  * bold black outline
  * crisp negative space
  * zero inner/outer shadows
  * zero dimensional or lighting effects

ABSOLUTE DO-NOT-INCLUDE LIST:

* No backgrounds of any kind
* No gradients
* No soft light or glow
* No shadowing or dimensionality
* No transparency effects
* No photorealism
* No pastel tones or low-opacity fills
* No floating artifacts
* No fuzzy or incomplete outlines
* No tonal transitions inside shapes

OUTPUT GOAL:
Produce a print-ready transparent PNG with:

* Fully opaque, flat solid color fills
* Hard-edged thick outlines
* Zero artifacts
* Clean silhouette
* Strong visibility on dark POD garments (unless specified otherwise in design request)

DESIGN REQUEST: ${sanitizedPrompt}`,
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

    console.log('Step 2: Refining edges with BiRefNet...');

    // Step 2: Use BiRefNet for high-quality edge refinement (preserves transparency)
    let finalImageUrl = initialImageUrl;
    
    try {
      const birefnetResponse = await fetch('https://fal.run/fal-ai/birefnet', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_url: initialImageUrl,
          model: 'General Use (Light)',
          operating_resolution: '1024x1024',
          output_format: 'png'
        }),
      });

      if (birefnetResponse.ok) {
        const birefnetResult = await birefnetResponse.json();
        console.log('BiRefNet result:', JSON.stringify(birefnetResult));
        finalImageUrl = birefnetResult.image?.url || initialImageUrl;
        console.log('Edge refinement complete, URL:', finalImageUrl);
      } else {
        const errorText = await birefnetResponse.text();
        console.error('BiRefNet error:', birefnetResponse.status, errorText);
      }
    } catch (birefnetError) {
      console.error('BiRefNet exception:', birefnetError);
    }

    console.log('Step 3: Fetching final image...');

    // Fetch the final image and convert to base64
    const imageResponse = await fetch(finalImageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch final image');
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const uint8Array = new Uint8Array(imageBuffer);
    
    // Convert to base64 in chunks
    let binary = '';
    const chunkSize = 32768;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64 = btoa(binary);
    const dataUrl = `data:image/png;base64,${base64}`;

    console.log('All steps complete!');

    return new Response(
      JSON.stringify({ 
        success: true,
        imageUrl: dataUrl,
        message: 'Design generated with clean edges'
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
