import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();
    
    if (!imageBase64) {
      throw new Error('No image provided');
    }

    const REMOVEBG_API_KEY = Deno.env.get('REMOVEBG_API_KEY');
    if (!REMOVEBG_API_KEY) {
      throw new Error('REMOVEBG_API_KEY not configured');
    }

    console.log('Processing background removal request...');

    // Convert base64 to blob
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const blob = new Blob([binaryData], { type: 'image/png' });

    // Create form data
    const formData = new FormData();
    formData.append('image_file', blob, 'image.png');

    // Call removebgapi.com
    const response = await fetch('https://removebgapi.com/api/v1/remove', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REMOVEBG_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('RemoveBG API error:', response.status, errorText);
      throw new Error(`RemoveBG API error: ${response.status}`);
    }

    // Get the result as blob and convert to base64
    const resultBlob = await response.blob();
    const arrayBuffer = await resultBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    let binaryString = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      binaryString += String.fromCharCode(...chunk);
    }
    
    const resultBase64 = btoa(binaryString);

    console.log('Background removal successful');

    return new Response(
      JSON.stringify({ 
        success: true, 
        imageBase64: `data:image/png;base64,${resultBase64}` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error in remove-background function:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
