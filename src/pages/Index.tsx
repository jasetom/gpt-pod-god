import { Shirt } from "lucide-react";
import { PromptInput } from "@/components/PromptInput";
import { ProgressStepper, Step } from "@/components/ProgressStepper";
import { ImagePreview } from "@/components/ImagePreview";
import { useDesignGenerator, STEPS } from "@/hooks/useDesignGenerator";

const Index = () => {
  const {
    step,
    currentStepIndex,
    designs,
    generate,
    downloadStandard,
    downloadEsrgan,
    isProcessing,
    getStepDescription,
    progress,
    progressMessage,
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

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
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

          {/* Preview Section - Two columns when complete */}
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Standard Output */}
            <ImagePreview
              imageUrl={designs.standard?.previewUrl || null}
              isProcessing={isProcessing}
              onDownload={downloadStandard}
              currentStepLabel={getCurrentStepLabel()}
              progress={progress}
              progressMessage={progressMessage}
              title="Standard (Client Upscale)"
              dimensions="4500×5400px"
              ratio="4:5 Ratio"
            />

            {/* ESRGAN Output */}
            <ImagePreview
              imageUrl={designs.esrgan?.previewUrl || null}
              isProcessing={isProcessing}
              onDownload={downloadEsrgan}
              currentStepLabel={getCurrentStepLabel()}
              progress={progress}
              progressMessage={progressMessage}
              title="ESRGAN (6x AI Upscale)"
              dimensions="4500×5400px"
              ratio="2:3 Ratio"
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
