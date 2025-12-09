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
  { id: 'generating', label: 'Generating', description: 'AI creates your design' },
  { id: 'upscaling', label: 'Processing', description: 'Upscaling & edge cleanup' },
  { id: 'complete', label: 'Complete', description: 'Ready to download' },
];

export function useDesignGenerator() {
  const [step, setStep] = useState<GenerationStep>('idle');
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [finalBlob, setFinalBlob] = useState<Blob | null>(null);
  const [prompt, setPrompt] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  const reset = useCallback(() => {
    setStep('idle');
    setCurrentStepIndex(-1);
    setPreviewUrl(null);
    setFinalBlob(null);
    setPrompt('');
    setProgress(0);
    setProgressMessage('');
  }, []);

  const generate = useCallback(async (inputPrompt: string) => {
    // Full reset before starting new generation
    setStep('idle');
    setCurrentStepIndex(-1);
    setPreviewUrl(null);
    setFinalBlob(null);
    setProgress(0);
    setProgressMessage('');
    
    // Small delay to ensure state is cleared
    await new Promise(resolve => setTimeout(resolve, 50));
    
    try {
      setPrompt(inputPrompt);
      setStep('generating');
      setCurrentStepIndex(0);
      setProgress(0);
      setProgressMessage('Starting AI generation...');

      // Simulate generation progress (since we can't get real progress from the API)
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev < 45) return prev + Math.random() * 3;
          return prev;
        });
      }, 500);

      // Step 1: Generate the image with transparent background using Fal.ai + gpt-image-1
      console.log('Step 1: Generating image with Fal.ai + gpt-image-1 (transparent background)...');
      setProgressMessage('Creating your design with AI...');
      
      const { data, error } = await supabase.functions.invoke('generate-design', {
        body: { prompt: inputPrompt }
      });

      clearInterval(progressInterval);

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      if (!data.imageUrl) throw new Error('No image received');

      setProgress(50);
      setProgressMessage('Design generated! Processing...');

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

      // Step 2: Upscale with progress tracking
      setStep('upscaling');
      setCurrentStepIndex(1);
      console.log('Step 2: Upscaling to 4500x5400...');
      
      imageBlob = await upscaleImage(imageBlob, (upscaleProgress, message) => {
        // Map upscale progress (0-100) to overall progress (50-100)
        const overallProgress = 50 + (upscaleProgress * 0.5);
        setProgress(Math.round(overallProgress));
        setProgressMessage(message);
      });
      
      setPreviewUrl(URL.createObjectURL(imageBlob));
      setFinalBlob(imageBlob);
      toast.success('Image upscaled to 4500×5400!');

      // Complete
      setStep('complete');
      setCurrentStepIndex(2);
      setProgress(100);
      setProgressMessage('Complete!');
      toast.success('Your design is ready to download!');

    } catch (error) {
      console.error('Generation error:', error);
      setStep('error');
      setProgress(0);
      setProgressMessage('');
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
    progress,
    progressMessage,
    generate,
    download,
    reset,
    getStepDescription,
    isProcessing: step !== 'idle' && step !== 'complete' && step !== 'error',
  };
}
