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
  { id: 'generating', label: 'Generating', description: 'AI creates your design' },
  { id: 'refining', label: 'Refining', description: 'BiRefNet edge cleanup' },
  { id: 'upscaling', label: 'Upscaling', description: 'ESRGAN 4x super-resolution' },
  { id: 'finalRefine', label: 'Transparency', description: 'Restoring clean edges' },
  { id: 'complete', label: 'Complete', description: 'Ready to download' },
];

const STEP_PROGRESS: Record<string, { start: number; end: number }> = {
  generating: { start: 0, end: 30 },
  refining: { start: 30, end: 50 },
  upscaling: { start: 50, end: 75 },
  finalRefine: { start: 75, end: 90 },
  finalizing: { start: 90, end: 100 },
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
      setProgressMessage('Starting AI generation...');

      // Simulate progress through stages
      let currentProgress = 0;
      const stages = ['generating', 'refining', 'upscaling', 'finalRefine'];
      let stageIndex = 0;
      
      const stageMessages: Record<string, string[]> = {
        generating: [
          'Creating your design with GPT Image...',
          'Composing visual elements...',
          'Rendering with transparent background...',
        ],
        refining: [
          'BiRefNet edge analysis...',
          'Cleaning initial transparency...',
          'Perfecting edge boundaries...',
        ],
        upscaling: [
          'ESRGAN 4x super-resolution...',
          'Enhancing pixel details...',
          'Scaling to print resolution...',
        ],
        finalRefine: [
          'Final BiRefNet pass...',
          'Restoring clean transparency...',
          'Finalizing edge quality...',
        ],
      };

      progressInterval = setInterval(() => {
        const currentStage = stages[stageIndex];
        const stageInfo = STEP_PROGRESS[currentStage];
        if (!stageInfo) return;
        
        const { start, end } = stageInfo;
        
        // Smoothly progress within each stage
        if (currentProgress < end - 3) {
          const increment = Math.random() * 1.5 + 0.3;
          currentProgress = Math.min(currentProgress + increment, end - 3);
          setProgress(Math.round(currentProgress));
          
          // Update message based on progress within stage
          const stageProgress = (currentProgress - start) / (end - start);
          const messages = stageMessages[currentStage] || ['Processing...'];
          const msgIndex = Math.min(
            Math.floor(stageProgress * messages.length),
            messages.length - 1
          );
          setProgressMessage(messages[msgIndex]);
          
          // Move to next stage
          if (currentProgress >= end - 5 && stageIndex < stages.length - 1) {
            stageIndex++;
            const nextStage = stages[stageIndex];
            if (nextStage === 'refining') {
              setStep('refining');
              setCurrentStepIndex(1);
            } else if (nextStage === 'upscaling') {
              setStep('upscaling');
              setCurrentStepIndex(2);
            } else if (nextStage === 'finalRefine') {
              setStep('refining');
              setCurrentStepIndex(3);
            }
          }
        }
      }, 350);

      // Call the edge function (does all the heavy lifting)
      console.log('Calling generate-design edge function...');
      const { data, error } = await supabase.functions.invoke('generate-design', {
        body: { prompt: inputPrompt }
      });

      if (progressInterval) clearInterval(progressInterval);

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      if (!data.imageUrl) throw new Error('No image received');

      setProgress(90);
      setProgressMessage('Processing final image...');
      setStep('finalizing');

      // Convert base64 to blob
      const base64Data = data.imageUrl.split(',')[1];
      const binaryData = atob(base64Data);
      const bytes = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i);
      }
      let imageBlob = new Blob([bytes], { type: 'image/png' });

      setProgress(95);
      setProgressMessage('Fitting to 4500×5400 canvas...');

      // Resize to target dimensions
      imageBlob = await resizeToTarget(imageBlob);
      
      setPreviewUrl(URL.createObjectURL(imageBlob));
      setFinalBlob(imageBlob);

      // Complete
      setStep('complete');
      setCurrentStepIndex(4);
      setProgress(100);
      setProgressMessage('Complete!');
      toast.success('Your high-quality design is ready!');

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
