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

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    console.log('Generating POD design with Fal.ai + gpt-image-1 for prompt:', prompt);

    // Submit request to Fal.ai queue
    const submitResponse = await fetch('https://queue.fal.run/fal-ai/gpt-image-1/text-to-image/byok', {
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
        output_format: 'png',
        openai_api_key: OPENAI_API_KEY
      }),
    });

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      console.error('Fal.ai submit error:', submitResponse.status, errorText);
      throw new Error(`Fal.ai submit error: ${submitResponse.status} - ${errorText}`);
    }

    const submitData = await submitResponse.json();
    const requestId = submitData.request_id;
    console.log('Request submitted, ID:', requestId);

    // Poll for result
    let result = null;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max wait

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(
        `https://queue.fal.run/fal-ai/gpt-image-1/text-to-image/byok/requests/${requestId}/status`,
        {
          headers: {
            'Authorization': `Key ${FAL_KEY}`,
          },
        }
      );

      if (!statusResponse.ok) {
        console.error('Status check failed:', statusResponse.status);
        attempts++;
        continue;
      }

      const statusData = await statusResponse.json();
      console.log('Status:', statusData.status);

      if (statusData.status === 'COMPLETED') {
        // Fetch the result
        const resultResponse = await fetch(
          `https://queue.fal.run/fal-ai/gpt-image-1/text-to-image/byok/requests/${requestId}`,
          {
            headers: {
              'Authorization': `Key ${FAL_KEY}`,
            },
          }
        );

        if (resultResponse.ok) {
          result = await resultResponse.json();
          break;
        }
      } else if (statusData.status === 'FAILED') {
        throw new Error('Image generation failed');
      }

      attempts++;
    }

    if (!result) {
      throw new Error('Timeout waiting for image generation');
    }

    console.log('Generation complete');

    // Get the image URL from the result
    const imageUrl = result.images?.[0]?.url;
    
    if (!imageUrl) {
      console.error('No image in response:', JSON.stringify(result));
      throw new Error('No image generated');
    }

    // Fetch the image and convert to base64
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    const dataUrl = `data:image/png;base64,${base64}`;

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
