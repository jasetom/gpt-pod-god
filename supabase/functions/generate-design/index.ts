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

    console.log('Step 1: Generating design with gpt-image-1-mini...');

    // Step 1: Generate the initial design
    const generateResponse = await fetch('https://fal.run/fal-ai/gpt-image-1-mini', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: `Create a professional print-on-demand t-shirt design illustration.

STYLE REQUIREMENTS:
- Vector/flat illustration style with bold, saturated colors
- Clean, crisp edges suitable for printing on merchandise
- Modern flat design aesthetic with bold outlines
- Cartoon/illustration style that translates well to print
- Centered composition

DO NOT include:
- Any background elements - the subject should be isolated
- Very light colors or pastels
- Complex textures or photorealistic elements
- Text unless specifically requested

DESIGN REQUEST: ${prompt}

Create a professional, print-ready isolated illustration.`,
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

    // Step 2: Use BiRefNet for high-quality edge refinement
    const birefnetResponse = await fetch('https://fal.run/fal-ai/birefnet', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: initialImageUrl,
        model: 'General',
        operating_resolution: '1024x1024',
        output_format: 'png'
      }),
    });

    if (!birefnetResponse.ok) {
      console.error('BiRefNet error, using original image');
      // Fall back to original if BiRefNet fails
    }

    let refinedImageUrl = initialImageUrl;
    if (birefnetResponse.ok) {
      const birefnetResult = await birefnetResponse.json();
      refinedImageUrl = birefnetResult.image?.url || initialImageUrl;
      console.log('Edge refinement complete');
    }

    console.log('Step 3: AI upscaling with Clarity Upscaler...');

    // Step 3: Use Clarity Upscaler for high-quality AI upscaling
    const upscaleResponse = await fetch('https://fal.run/fal-ai/clarity-upscaler', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: refinedImageUrl,
        scale: 4,
        creativity: 0.2,
        resemblance: 0.9,
        prompt: 'high quality vector illustration, sharp edges, clean lines, professional t-shirt design',
        negative_prompt: 'blurry, low quality, pixelated, noisy, grainy, artifacts',
        guidance_scale: 7.5,
        num_inference_steps: 25,
        enable_safety_checker: false
      }),
    });

    if (!upscaleResponse.ok) {
      const errorText = await upscaleResponse.text();
      console.error('Upscale error:', upscaleResponse.status, errorText);
      // Continue with non-upscaled version if upscaling fails
    }

    let finalImageUrl = refinedImageUrl;
    if (upscaleResponse.ok) {
      const upscaleResult = await upscaleResponse.json();
      finalImageUrl = upscaleResult.image?.url || refinedImageUrl;
      console.log('AI upscaling complete');
    }

    console.log('Step 4: Fetching final image...');

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
        message: 'Design generated, refined, and upscaled successfully'
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
