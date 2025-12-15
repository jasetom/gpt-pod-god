import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { downloadImage, resizeToTarget, processEsrganWithAlpha } from '@/lib/imageProcessor';
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

export type GeneratedDesigns = {
  standard: { previewUrl: string; blob: Blob } | null;
  esrgan: { previewUrl: string; blob: Blob } | null;
  anime: { previewUrl: string; blob: Blob } | null;
  doublePass: { previewUrl: string; blob: Blob } | null;
  seedvr: { previewUrl: string; blob: Blob } | null;
};

export function useDesignGenerator() {
  const [step, setStep] = useState<GenerationStep>('idle');
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [designs, setDesigns] = useState<GeneratedDesigns>({ standard: null, esrgan: null, anime: null, doublePass: null, seedvr: null });
  const [prompt, setPrompt] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  const reset = useCallback(() => {
    setStep('idle');
    setCurrentStepIndex(-1);
    setDesigns({ standard: null, esrgan: null, anime: null, doublePass: null, seedvr: null });
    setPrompt('');
    setProgress(0);
    setProgressMessage('');
  }, []);

  const generate = useCallback(async (inputPrompt: string) => {
    // Full reset before starting new generation
    setStep('idle');
    setCurrentStepIndex(-1);
    setDesigns({ standard: null, esrgan: null, anime: null, doublePass: null, seedvr: null });
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

      // Helper to convert base64 to blob
      const base64ToBlob = (dataUrl: string): Blob => {
        const base64Data = dataUrl.split(',')[1];
        const binaryData = atob(base64Data);
        const bytes = new Uint8Array(binaryData.length);
        for (let i = 0; i < binaryData.length; i++) {
          bytes[i] = binaryData.charCodeAt(i);
        }
        return new Blob([bytes], { type: 'image/png' });
      };

      // Get original image blob first (needed for both standard and ESRGAN alpha)
      const originalBlob = base64ToBlob(data.imageUrl);

      // Process all images in parallel
      const [standardResult, esrganResult, animeResult, doublePassResult, seedvrResult] = await Promise.all([
        // Standard: client-side upscaling
        (async () => {
          const processedBlob = await resizeToTarget(originalBlob);
          return {
            previewUrl: URL.createObjectURL(processedBlob),
            blob: processedBlob
          };
        })(),
        // ESRGAN 8x: fetch from URL and merge RGB with alpha from original
        (async () => {
          if (!data.esrganImageUrl) return null;
          try {
            console.log('Fetching ESRGAN 8x image from URL...');
            const esrganResponse = await fetch(data.esrganImageUrl);
            if (!esrganResponse.ok) {
              console.error('Failed to fetch ESRGAN image');
              return null;
            }
            const esrganBlob = await esrganResponse.blob();
            console.log('Processing ESRGAN with alpha preservation...');
            const processedBlob = await processEsrganWithAlpha(originalBlob, esrganBlob);
            return {
              previewUrl: URL.createObjectURL(processedBlob),
              blob: processedBlob
            };
          } catch (err) {
            console.error('Failed to process ESRGAN image:', err);
            return null;
          }
        })(),
        // Anime ESRGAN: fetch from URL and merge RGB with alpha from original
        (async () => {
          if (!data.animeEsrganImageUrl) return null;
          try {
            console.log('Fetching Anime ESRGAN image from URL...');
            const animeResponse = await fetch(data.animeEsrganImageUrl);
            if (!animeResponse.ok) {
              console.error('Failed to fetch Anime ESRGAN image');
              return null;
            }
            const animeBlob = await animeResponse.blob();
            console.log('Processing Anime ESRGAN with alpha preservation...');
            const processedBlob = await processEsrganWithAlpha(originalBlob, animeBlob);
            return {
              previewUrl: URL.createObjectURL(processedBlob),
              blob: processedBlob
            };
          } catch (err) {
            console.error('Failed to process Anime ESRGAN image:', err);
            return null;
          }
        })(),
        // Double Pass ESRGAN: fetch from URL and merge RGB with alpha from original
        (async () => {
          if (!data.doublePassImageUrl) return null;
          try {
            console.log('Fetching Double Pass ESRGAN image from URL...');
            const doublePassResponse = await fetch(data.doublePassImageUrl);
            if (!doublePassResponse.ok) {
              console.error('Failed to fetch Double Pass ESRGAN image');
              return null;
            }
            const doublePassBlob = await doublePassResponse.blob();
            console.log('Processing Double Pass ESRGAN with alpha preservation...');
            const processedBlob = await processEsrganWithAlpha(originalBlob, doublePassBlob);
            return {
              previewUrl: URL.createObjectURL(processedBlob),
              blob: processedBlob
            };
          } catch (err) {
            console.error('Failed to process Double Pass ESRGAN image:', err);
            return null;
          }
        })(),
        // SeedVR: fetch from URL and merge RGB with alpha from original
        (async () => {
          if (!data.seedvrImageUrl) return null;
          try {
            console.log('Fetching SeedVR image from URL...');
            const seedvrResponse = await fetch(data.seedvrImageUrl);
            if (!seedvrResponse.ok) {
              console.error('Failed to fetch SeedVR image');
              return null;
            }
            const seedvrBlob = await seedvrResponse.blob();
            console.log('Processing SeedVR with alpha preservation...');
            const processedBlob = await processEsrganWithAlpha(originalBlob, seedvrBlob);
            return {
              previewUrl: URL.createObjectURL(processedBlob),
              blob: processedBlob
            };
          } catch (err) {
            console.error('Failed to process SeedVR image:', err);
            return null;
          }
        })()
      ]);
      
      setProgress(95);
      setProgressMessage('Almost done...');
      
      setDesigns({
        standard: standardResult,
        esrgan: esrganResult,
        anime: animeResult,
        doublePass: doublePassResult,
        seedvr: seedvrResult
      });

      // Complete
      setStep('complete');
      setCurrentStepIndex(3);
      setProgress(100);
      setProgressMessage('Done!');
      toast.success('Your designs are ready!');

    } catch (error) {
      if (progressInterval) clearInterval(progressInterval);
      console.error('Generation error:', error);
      setStep('error');
      setProgress(0);
      setProgressMessage('');
      toast.error(error instanceof Error ? error.message : 'Failed to generate design');
    }
  }, []);

  const downloadStandard = useCallback(() => {
    if (designs.standard?.blob) {
      const timestamp = Date.now();
      const filename = `pod-design-standard-${timestamp}.png`;
      downloadImage(designs.standard.blob, filename);
      toast.success('Standard design downloaded!');
    }
  }, [designs.standard]);

  const downloadEsrgan = useCallback(() => {
    if (designs.esrgan?.blob) {
      const timestamp = Date.now();
      const filename = `pod-design-esrgan-8x-${timestamp}.png`;
      downloadImage(designs.esrgan.blob, filename);
      toast.success('ESRGAN 8x design downloaded!');
    }
  }, [designs.esrgan]);

  const downloadAnime = useCallback(() => {
    if (designs.anime?.blob) {
      const timestamp = Date.now();
      const filename = `pod-design-anime-esrgan-${timestamp}.png`;
      downloadImage(designs.anime.blob, filename);
      toast.success('Anime ESRGAN design downloaded!');
    }
  }, [designs.anime]);

  const downloadDoublePass = useCallback(() => {
    if (designs.doublePass?.blob) {
      const timestamp = Date.now();
      const filename = `pod-design-double-pass-${timestamp}.png`;
      downloadImage(designs.doublePass.blob, filename);
      toast.success('Double Pass design downloaded!');
    }
  }, [designs.doublePass]);

  const downloadSeedvr = useCallback(() => {
    if (designs.seedvr?.blob) {
      const timestamp = Date.now();
      const filename = `pod-design-seedvr-${timestamp}.png`;
      downloadImage(designs.seedvr.blob, filename);
      toast.success('SeedVR design downloaded!');
    }
  }, [designs.seedvr]);

  const getStepDescription = useCallback(() => {
    if (currentStepIndex >= 0 && currentStepIndex < STEPS.length) {
      return STEPS[currentStepIndex].description;
    }
    return undefined;
  }, [currentStepIndex]);

  return {
    step,
    currentStepIndex,
    designs,
    prompt,
    progress,
    progressMessage,
    generate,
    downloadStandard,
    downloadEsrgan,
    downloadAnime,
    downloadDoublePass,
    downloadSeedvr,
    reset,
    getStepDescription,
    isProcessing: step !== 'idle' && step !== 'complete' && step !== 'error',
  };
}
