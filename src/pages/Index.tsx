import { Shirt, RefreshCw, AlertCircle } from "lucide-react";
import { PromptInput } from "@/components/PromptInput";
import { ProgressStepper, Step } from "@/components/ProgressStepper";
import { ImagePreview } from "@/components/ImagePreview";
import { useDesignGenerator, STEPS } from "@/hooks/useDesignGenerator";
import { Button } from "@/components/ui/button";

const Index = () => {
  const {
    step,
    currentStepIndex,
    design,
    generate,
    downloadDesign,
    isProcessing,
    getStepDescription,
    progress,
    progressMessage,
    prompt,
    reset,
  } = useDesignGenerator();

  const getStatus = () => {
    if (step === 'complete') return 'complete';
    if (step === 'error') return 'error';
    if (isProcessing) return 'processing';
    return 'idle';
  };

  const getCurrentStepLabel = () => {
    return getStepDescription();
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-[128px]" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="inline-flex items-center justify-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30">
              <Shirt className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">POD Design</span> Generator
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Create stunning print-on-demand t-shirt designs with AI. 
            Get transparent PNGs at high resolution.
          </p>
        </header>

        {/* Error State with Retry Button */}
        {step === 'error' && (
          <div className="mb-8 glass-card rounded-2xl p-6 border-destructive/50">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="p-3 rounded-full bg-destructive/20">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Generation Failed</h3>
                <p className="text-sm text-muted-foreground">Something went wrong. Please try again.</p>
              </div>
              <div className="flex gap-3">
                {prompt && (
                  <Button onClick={() => generate(prompt)} variant="default" className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </Button>
                )}
                <Button onClick={reset} variant="outline">
                  Start Over
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Progress Stepper - Only show when processing */}
        {(isProcessing || step === 'complete') && (
          <div className="mb-8">
            <ProgressStepper
              steps={STEPS as Step[]}
              currentStep={currentStepIndex}
              status={getStatus()}
            />
          </div>
        )}

        {/* Main Content */}
        <div className="space-y-8">
          {/* Input Section */}
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            <PromptInput onSubmit={generate} isLoading={isProcessing} />
            
            {/* Tips */}
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent" />
                Design Tips
              </h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• Use bold, simple concepts that work well on fabric</li>
                <li>• Avoid complex backgrounds - they'll be removed</li>
                <li>• Describe colors and style for best results</li>
                <li>• Think about how it will look on a t-shirt</li>
              </ul>
            </div>
          </div>

          {/* Preview Section - Single Design */}
          <div className="max-w-2xl mx-auto">
            <ImagePreview
              imageUrl={design?.previewUrl || null}
              isProcessing={isProcessing}
              onDownload={downloadDesign}
              currentStepLabel={getCurrentStepLabel()}
              progress={progress}
              progressMessage={progressMessage}
              title="High Resolution Design"
              dimensions="4500×5400px"
              ratio="SeedVR 3x Upscaled"
            />
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-16 text-center">
          <p className="text-xs text-muted-foreground">
            Powered by AI • Images are generated for personal and commercial use
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Index;