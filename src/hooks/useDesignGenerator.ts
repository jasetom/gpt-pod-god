import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { downloadImage, resizeToTarget, processWithAlphaPreservation } from '@/lib/imageProcessor';
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
  { id: 'upscaling', label: 'AI Upscaling', description: 'Enhancing quality' },
  { id: 'processing', label: 'Processing', description: 'Preparing print file' },
  { id: 'complete', label: 'Complete', description: 'Ready to download' },
];

// Expected total time ~60 seconds with AI upscaling
const EXPECTED_TOTAL_TIME_MS = 60000;
const STEP_PROGRESS: Record<string, { start: number; end: number }> = {
  generating: { start: 0, end: 50 },
  upscaling: { start: 50, end: 75 },
  processing: { start: 75, end: 95 },
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
      const serverPhaseEnd = 75; // Server handles generation + AI upscaling up to 75%
      const serverExpectedTime = EXPECTED_TOTAL_TIME_MS * 0.80; // ~48 seconds for server phase
      
      const messages = [
        { at: 0, msg: 'Starting design creation...' },
        { at: 10, msg: 'Preparing your design...' },
        { at: 20, msg: 'Creating visual elements...' },
        { at: 32, msg: 'Adding details and colors...' },
        { at: 45, msg: 'Finishing illustration...' },
        { at: 52, msg: 'AI upscaling in progress...' },
        { at: 62, msg: 'Enhancing image quality...' },
        { at: 70, msg: 'Finalizing high-res output...' },
      ];
      
      let lastMsgIndex = -1;

      progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const rawProgress = (elapsed / serverExpectedTime) * serverPhaseEnd;
        const cappedProgress = Math.min(rawProgress * (1 - rawProgress / 200), serverPhaseEnd - 2);
        const displayProgress = Math.max(0, Math.min(Math.round(cappedProgress), serverPhaseEnd - 2));
        
        setProgress(displayProgress);
        
        // Update step based on progress
        if (displayProgress >= 50 && step === 'generating') {
          setStep('upscaling');
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

      setProgress(76);
      setProgressMessage('Processing transparency...');
      setStep('upscaling');
      setCurrentStepIndex(2);

      // Convert upscaled image base64 to blob
      const upscaledBase64 = data.imageUrl.split(',')[1];
      const upscaledBinary = atob(upscaledBase64);
      const upscaledBytes = new Uint8Array(upscaledBinary.length);
      for (let i = 0; i < upscaledBinary.length; i++) {
        upscaledBytes[i] = upscaledBinary.charCodeAt(i);
      }
      const upscaledBlob = new Blob([upscaledBytes], { type: 'image/png' });

      // Convert original image base64 to blob (for alpha extraction)
      let processedBlob: Blob;
      
      if (data.originalImageUrl) {
        const originalBase64 = data.originalImageUrl.split(',')[1];
        const originalBinary = atob(originalBase64);
        const originalBytes = new Uint8Array(originalBinary.length);
        for (let i = 0; i < originalBinary.length; i++) {
          originalBytes[i] = originalBinary.charCodeAt(i);
        }
        const originalBlob = new Blob([originalBytes], { type: 'image/png' });
        
        setProgress(82);
        setProgressMessage('Preserving transparency...');
        
        // Process with alpha preservation
        processedBlob = await processWithAlphaPreservation(upscaledBlob, originalBlob);
      } else {
        processedBlob = upscaledBlob;
      }

      setProgress(88);
      setProgressMessage('Preparing print file...');

      // Resize to target dimensions
      const finalBlob = await resizeToTarget(processedBlob);
      
      setProgress(95);
      setProgressMessage('Almost done...');
      
      setPreviewUrl(URL.createObjectURL(finalBlob));
      setFinalBlob(finalBlob);

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
