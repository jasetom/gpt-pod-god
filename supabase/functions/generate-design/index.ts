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

    console.log('Step 1: Generating image with FLUX for prompt:', prompt);

    // Step 1: Generate image with FLUX (no OpenAI key needed)
    const generateResponse = await fetch('https://fal.run/fal-ai/flux/dev', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: `Create a professional print-on-demand t-shirt design illustration on a PURE WHITE background (#FFFFFF).

STYLE REQUIREMENTS:
- Vector/flat illustration style with bold, saturated colors
- Clean, crisp edges suitable for printing on merchandise
- Modern flat design aesthetic with bold outlines
- Cartoon/illustration style that translates well to print
- Centered composition on white background
- Bold colors that stand out

DO NOT include:
- Gradients or soft shadows
- Very light colors or pastels that blend with white
- Complex textures or photorealistic elements

DESIGN REQUEST: ${prompt}

Create a professional, print-ready illustration centered on a PURE WHITE background.`,
        image_size: 'square_hd',
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        enable_safety_checker: false
      }),
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      console.error('FLUX generation error:', generateResponse.status, errorText);
      throw new Error(`Image generation failed: ${generateResponse.status}`);
    }

    const generateResult = await generateResponse.json();
    const generatedImageUrl = generateResult.images?.[0]?.url;
    
    if (!generatedImageUrl) {
      console.error('No image in FLUX response:', JSON.stringify(generateResult));
      throw new Error('No image generated');
    }

    console.log('Step 2: Removing background...');

    // Step 2: Remove background using Fal.ai's rembg
    const rembgResponse = await fetch('https://fal.run/fal-ai/imageutils/rembg', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: generatedImageUrl
      }),
    });

    if (!rembgResponse.ok) {
      const errorText = await rembgResponse.text();
      console.error('Background removal error:', rembgResponse.status, errorText);
      throw new Error(`Background removal failed: ${rembgResponse.status}`);
    }

    const rembgResult = await rembgResponse.json();
    const finalImageUrl = rembgResult.image?.url;

    if (!finalImageUrl) {
      console.error('No image in rembg response:', JSON.stringify(rembgResult));
      throw new Error('Background removal failed - no image returned');
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

    console.log('Design generated successfully with transparent background');

    return new Response(
      JSON.stringify({ 
        success: true,
        imageUrl: dataUrl,
        message: 'Design generated successfully with transparent background'
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
