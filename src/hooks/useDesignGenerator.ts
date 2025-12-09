import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { downloadImage, resizeToTarget } from '@/lib/imageProcessor';
import { toast } from 'sonner';

export type GenerationStep = 
  | 'idle'
  | 'generating'
  | 'refining'
  | 'upscaling'
  | 'finalizing'
  | 'complete'
  | 'error';

export type StepInfo = {
  id: string;
  label: string;
  description: string;
};

export const STEPS: StepInfo[] = [
  { id: 'generating', label: 'Generating', description: 'Creating your design' },
  { id: 'refining', label: 'Refining', description: 'Cleaning up edges' },
  { id: 'upscaling', label: 'Upscaling', description: 'Scaling to print size' },
  { id: 'complete', label: 'Complete', description: 'Ready to download' },
];

// Expected total time ~50 seconds, distribute progress smoothly
const EXPECTED_TOTAL_TIME_MS = 50000;
const STEP_PROGRESS: Record<string, { start: number; end: number }> = {
  generating: { start: 0, end: 60 },
  refining: { start: 60, end: 72 },
  upscaling: { start: 72, end: 95 },
  finalizing: { start: 95, end: 100 },
};

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
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    let progressInterval: NodeJS.Timeout | null = null;
    
    try {
      setPrompt(inputPrompt);
      setStep('generating');
      setCurrentStepIndex(0);
      setProgress(0);
      setProgressMessage('Starting design creation...');

      // Time-based progress simulation for smooth, predictable updates
      const startTime = Date.now();
      const serverPhaseEnd = 72; // Server handles generation up to 72%
      const serverExpectedTime = EXPECTED_TOTAL_TIME_MS * 0.85; // ~42 seconds for server phase
      
      const messages = [
        { at: 0, msg: 'Starting design creation...' },
        { at: 8, msg: 'Preparing your design...' },
        { at: 18, msg: 'Creating visual elements...' },
        { at: 30, msg: 'Adding details and colors...' },
        { at: 42, msg: 'Finishing illustration...' },
        { at: 55, msg: 'Cleaning up edges...' },
        { at: 62, msg: 'Improving transparency...' },
        { at: 68, msg: 'Finalizing quality...' },
      ];
      
      let lastMsgIndex = -1;

      progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        // Use logarithmic easing so it slows down as it approaches the cap
        const rawProgress = (elapsed / serverExpectedTime) * serverPhaseEnd;
        // Cap at 70% to leave room before server responds
        const cappedProgress = Math.min(rawProgress * (1 - rawProgress / 200), serverPhaseEnd - 2);
        const displayProgress = Math.max(0, Math.min(Math.round(cappedProgress), serverPhaseEnd - 2));
        
        setProgress(displayProgress);
        
        // Update step based on progress
        if (displayProgress >= 55 && step === 'generating') {
          setStep('refining');
          setCurrentStepIndex(1);
        }
        
        // Update message based on progress thresholds
        for (let i = messages.length - 1; i >= 0; i--) {
          if (displayProgress >= messages[i].at && i > lastMsgIndex) {
            setProgressMessage(messages[i].msg);
            lastMsgIndex = i;
            break;
          }
        }
      }, 200);

      // Call the edge function (does all the heavy lifting)
      console.log('Calling generate-design edge function...');
      const { data, error } = await supabase.functions.invoke('generate-design', {
        body: { prompt: inputPrompt }
      });

      if (progressInterval) clearInterval(progressInterval);

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      if (!data.imageUrl) throw new Error('No image received');

      setProgress(73);
      setProgressMessage('Scaling to print resolution...');
      setStep('upscaling');
      setCurrentStepIndex(2);

      // Convert base64 to blob
      const base64Data = data.imageUrl.split(',')[1];
      const binaryData = atob(base64Data);
      const bytes = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i);
      }
      let imageBlob = new Blob([bytes], { type: 'image/png' });

      setProgress(82);
      setProgressMessage('Preparing high-resolution output...');

      // Resize to target dimensions
      imageBlob = await resizeToTarget(imageBlob);
      
      setProgress(95);
      setProgressMessage('Almost done...');
      
      setPreviewUrl(URL.createObjectURL(imageBlob));
      setFinalBlob(imageBlob);

      // Complete
      setStep('complete');
      setCurrentStepIndex(3);
      setProgress(100);
      setProgressMessage('Done!');
      toast.success('Your design is ready!');

    } catch (error) {
      if (progressInterval) clearInterval(progressInterval);
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