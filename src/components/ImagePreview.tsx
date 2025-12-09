import { Download, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type ImagePreviewProps = {
  imageUrl: string | null;
  isProcessing: boolean;
  onDownload: () => void;
  currentStepLabel?: string;
  progress?: number;
  progressMessage?: string;
  title?: string;
  hideDownload?: boolean;
  dimensions?: string;
  ratio?: string;
};

export function ImagePreview({ 
  imageUrl, 
  isProcessing, 
  onDownload, 
  currentStepLabel,
  progress = 0,
  progressMessage = '',
  title = 'Preview',
  hideDownload = false,
  dimensions = '4500×5400px',
  ratio = '4:5 Ratio'
}: ImagePreviewProps) {
  return (
    <div className="glass-card rounded-2xl p-6 w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {imageUrl && !isProcessing && !hideDownload && (
          <Button variant="glass" size="sm" onClick={onDownload}>
            <Download className="h-4 w-4" />
            Download PNG
          </Button>
        )}
      </div>

      <div 
        className="relative rounded-xl overflow-hidden bg-[repeating-conic-gradient(hsl(var(--muted))_0%_25%,hsl(var(--secondary))_0%_50%)] bg-[length:20px_20px]"
        style={{ aspectRatio: "4/5" }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Generated design"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-secondary/80">
            {isProcessing ? (
              <ProcessingOverlay 
                progress={progress} 
                progressMessage={progressMessage}
                currentStepLabel={currentStepLabel}
              />
            ) : (
              <>
                <ImageIcon className="h-16 w-16 text-muted-foreground/50 mb-4" />
                <p className="text-sm text-muted-foreground">
                  Your design will appear here
                </p>
              </>
            )}
          </div>
        )}

        {/* Processing overlay when image exists */}
        {isProcessing && imageUrl && (
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center">
            <ProcessingOverlay 
              progress={progress} 
              progressMessage={progressMessage}
              currentStepLabel={currentStepLabel}
              compact
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/50">
          {ratio}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/50">
          {dimensions}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/50">
          PNG
        </span>
      </div>
    </div>
  );
}

type ProcessingOverlayProps = {
  progress: number;
  progressMessage: string;
  currentStepLabel?: string;
  compact?: boolean;
};

function ProcessingOverlay({ progress, progressMessage, currentStepLabel, compact }: ProcessingOverlayProps) {
  return (
    <div className={`text-center space-y-4 flex flex-col items-center justify-center ${compact ? 'p-6 rounded-2xl bg-card/90 border border-border shadow-lg' : ''}`}>
      {/* Circular progress indicator */}
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 80 80">
          {/* Background circle */}
          <circle
            cx="40"
            cy="40"
            r="35"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="6"
          />
          {/* Progress circle */}
          <circle
            cx="40"
            cy="40"
            r="35"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 35}`}
            strokeDashoffset={`${2 * Math.PI * 35 * (1 - progress / 100)}`}
            className="transition-all duration-300 ease-out"
          />
        </svg>
        {/* Percentage text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-primary">
            {Math.round(progress)}%
          </span>
        </div>
      </div>
      
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {currentStepLabel || "Processing..."}
        </p>
        <p className="text-xs text-muted-foreground max-w-[200px]">
          {progressMessage || "This may take a moment"}
        </p>
      </div>
    </div>
  );
}
