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
    
    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
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

CRITICAL GLOBAL RULES (ENFORCING GPT IMAGE 1 MINI LIMITATIONS)

Use solid, fully opaque colors only.
No pixel may contain partial opacity.

Absolutely no gradients, no soft blends, no color ramps, no tonal shifts.

Every shape must have a thick, consistent black outline with uniform stroke width.

All edges must be hard-edged vector-style, never soft or feathered.

Do not apply lighting, shading, highlights, reflections, inner shadows, outer glows, or ambient occlusion.

No noise, texture, patterns, grain, dithering, or "semi-realistic" rendering.

ANTI-FAILSAFE OVERRIDES (SPECIFICALLY FOR GPT IMAGE 1 MINI)

These prevent common unwanted behaviors:

Do not generate any background color, background texture, or residual color halo.
Background must be pure transparency only.

Do not place any color behind text or inside negative spaces of letters.

Do not fade edges into transparency. Edges must be fully opaque, hard, and clean.

Do not add soft antialiasing. Keep edges pixel-crisp and sharp.

Do not simulate shadows with darker shapes unless they are fully solid, flat colors with outlines.

Do not create subtle tints or variations inside a single color area.

STYLE TARGET (LOCKED, CONSISTENT OUTPUT)

Flat vector illustration (screen-printing aesthetic)

Bold, high-contrast palette optimized for dark t-shirts

Cartoon / graphic-illustration clarity

Centered composition

100% of the artwork contained within the frame — no cut-offs

Text, if included, must be:

solid opaque fill

bold black outline

clean negative space

aligned and centered

ABSOLUTE "DO NOT INCLUDE" LIST

No backgrounds (colors, patterns, shapes, gradients)

No shading

No soft light or glow

No transparency effects

No photorealism

No complex lighting

No subtle color differences

No pastel tones or low-opacity fills

No floating artifacts around the design

No fuzzy or incomplete outlines

OUTPUT GOAL

Produce a print-ready transparent PNG with:

Fully opaque, solid color fills

Hard-edged outlines

Zero artifacts

Clean silhouette

Strong visibility on dark POD garments

DESIGN REQUEST: ${prompt}`,
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
