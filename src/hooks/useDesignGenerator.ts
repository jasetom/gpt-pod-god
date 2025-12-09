import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { upscaleImage, downloadImage } from '@/lib/imageProcessor';
import { toast } from 'sonner';

export type GenerationStep = 
  | 'idle'
  | 'generating'
  | 'upscaling'
  | 'complete'
  | 'error';

export type StepInfo = {
  id: string;
  label: string;
  description: string;
};

export const STEPS: StepInfo[] = [
  { id: 'generating', label: 'Generating', description: 'AI creates your design with transparent background' },
  { id: 'upscaling', label: 'Upscaling', description: 'Scaling to 4500×5400' },
  { id: 'complete', label: 'Complete', description: 'Ready to download' },
];

export function useDesignGenerator() {
  const [step, setStep] = useState<GenerationStep>('idle');
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [finalBlob, setFinalBlob] = useState<Blob | null>(null);
  const [prompt, setPrompt] = useState('');

  const reset = useCallback(() => {
    setStep('idle');
    setCurrentStepIndex(-1);
    setPreviewUrl(null);
    setFinalBlob(null);
    setPrompt('');
  }, []);

  const generate = useCallback(async (inputPrompt: string) => {
    // Full reset before starting new generation
    setStep('idle');
    setCurrentStepIndex(-1);
    setPreviewUrl(null);
    setFinalBlob(null);
    
    // Small delay to ensure state is cleared
    await new Promise(resolve => setTimeout(resolve, 50));
    
    try {
      setPrompt(inputPrompt);
      setStep('generating');
      setCurrentStepIndex(0);

      // Step 1: Generate the image with transparent background using Fal.ai + gpt-image-1
      console.log('Step 1: Generating image with Fal.ai + gpt-image-1 (transparent background)...');
      const { data, error } = await supabase.functions.invoke('generate-design', {
        body: { prompt: inputPrompt }
      });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      if (!data.imageUrl) throw new Error('No image received');

      // Convert base64 to blob
      const base64Data = data.imageUrl.split(',')[1];
      const binaryData = atob(base64Data);
      const bytes = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i);
      }
      let imageBlob = new Blob([bytes], { type: 'image/png' });

      // Show initial preview (already has transparent background)
      setPreviewUrl(URL.createObjectURL(imageBlob));
      toast.success('Design generated with transparent background!');

      // Step 2: Upscale
      setStep('upscaling');
      setCurrentStepIndex(1);
      console.log('Step 2: Upscaling to 4500x5400...');
      
      imageBlob = await upscaleImage(imageBlob);
      setPreviewUrl(URL.createObjectURL(imageBlob));
      setFinalBlob(imageBlob);
      toast.success('Image upscaled to 4500×5400!');

      // Complete
      setStep('complete');
      setCurrentStepIndex(2);
      toast.success('Your design is ready to download!');

    } catch (error) {
      console.error('Generation error:', error);
      setStep('error');
      toast.error(error instanceof Error ? error.message : 'Failed to generate design');
    }
  }, []);

  const download = useCallback(() => {
    if (finalBlob) {
      const timestamp = Date.now();
      const filename = `pod-design-${timestamp}.png`;
      downloadImage(finalBlob, filename);
      toast.success('Download started!');
    }
  }, [finalBlob]);

  const getStepDescription = useCallback(() => {
    if (currentStepIndex >= 0 && currentStepIndex < STEPS.length) {
      return STEPS[currentStepIndex].description;
    }
    return undefined;
  }, [currentStepIndex]);

  return {
    step,
    currentStepIndex,
    previewUrl,
    finalBlob,
    prompt,
    generate,
    download,
    reset,
    getStepDescription,
    isProcessing: step !== 'idle' && step !== 'complete' && step !== 'error',
  };
}
