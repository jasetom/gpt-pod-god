import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { removeBackground, upscaleImage, downloadImage } from '@/lib/imageProcessor';
import { toast } from 'sonner';

export type GenerationStep = 
  | 'idle'
  | 'generating'
  | 'removing-background'
  | 'upscaling'
  | 'complete'
  | 'error';

export type StepInfo = {
  id: string;
  label: string;
  description: string;
};

export const STEPS: StepInfo[] = [
  { id: 'generating', label: 'Generating', description: 'AI creates your design' },
  { id: 'removing-background', label: 'Background', description: 'Removing background' },
  { id: 'upscaling', label: 'Upscaling', description: 'Scaling to 4500×5400' },
  { id: 'complete', label: 'Complete', description: 'Ready to download' },
];

export function useDesignGenerator() {
  const [step, setStep] = useState<GenerationStep>('idle');
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [finalBlob, setFinalBlob] = useState<Blob | null>(null);
  const [prompt, setPrompt] = useState('');
  const [backgroundProgress, setBackgroundProgress] = useState(0);

  const reset = useCallback(() => {
    setStep('idle');
    setCurrentStepIndex(-1);
    setPreviewUrl(null);
    setFinalBlob(null);
    setPrompt('');
    setBackgroundProgress(0);
  }, []);

  const generate = useCallback(async (inputPrompt: string) => {
    // Full reset before starting new generation
    setStep('idle');
    setCurrentStepIndex(-1);
    setPreviewUrl(null);
    setFinalBlob(null);
    setBackgroundProgress(0);
    
    // Small delay to ensure state is cleared
    await new Promise(resolve => setTimeout(resolve, 50));
    
    try {
      setPrompt(inputPrompt);
      setStep('generating');
      setCurrentStepIndex(0);

      // Step 1: Generate the image
      console.log('Step 1: Generating image...');
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

      // Show initial preview
      setPreviewUrl(URL.createObjectURL(imageBlob));
      toast.success('Design generated!');

      // Step 2: Remove background with in-browser ML model
      setStep('removing-background');
      setCurrentStepIndex(1);
      console.log('Step 2: Removing background with ML model...');
      
      try {
        imageBlob = await removeBackground(imageBlob, (progress) => {
          setBackgroundProgress(progress);
        });
        setPreviewUrl(URL.createObjectURL(imageBlob));
        toast.success('Background removed!');
      } catch (bgError) {
        console.error('Background removal failed:', bgError);
        toast.error('Background removal failed - continuing with original');
        // Continue with the original image if background removal fails
      }

      // Step 3: Upscale
      setStep('upscaling');
      setCurrentStepIndex(2);
      console.log('Step 3: Upscaling to 4500x5400...');
      
      imageBlob = await upscaleImage(imageBlob);
      setPreviewUrl(URL.createObjectURL(imageBlob));
      setFinalBlob(imageBlob);
      toast.success('Image upscaled to 4500×5400!');

      // Complete
      setStep('complete');
      setCurrentStepIndex(3);
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
    if (step === 'removing-background' && backgroundProgress > 0) {
      return `Removing background (${backgroundProgress}%)`;
    }
    if (currentStepIndex >= 0 && currentStepIndex < STEPS.length) {
      return STEPS[currentStepIndex].description;
    }
    return undefined;
  }, [step, backgroundProgress, currentStepIndex]);

  return {
    step,
    currentStepIndex,
    previewUrl,
    finalBlob,
    prompt,
    backgroundProgress,
    generate,
    download,
    reset,
    getStepDescription,
    isProcessing: step !== 'idle' && step !== 'complete' && step !== 'error',
  };
}
