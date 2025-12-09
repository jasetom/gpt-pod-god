import { Download, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type ImagePreviewProps = {
  imageUrl: string | null;
  isProcessing: boolean;
  onDownload: () => void;
  currentStepLabel?: string;
};

export function ImagePreview({ imageUrl, isProcessing, onDownload, currentStepLabel }: ImagePreviewProps) {
  return (
    <div className="glass-card rounded-2xl p-6 w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Preview</h3>
        {imageUrl && !isProcessing && (
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
              <div className="text-center space-y-4 flex flex-col items-center justify-center">
                <div className="relative w-16 h-16 mx-auto">
                  <div className="w-16 h-16 rounded-full border-4 border-muted animate-spin border-t-primary" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="h-6 w-6 text-primary animate-pulse" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground animate-pulse">
                  {currentStepLabel || "Processing..."}
                </p>
              </div>
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

        {/* Processing overlay */}
        {isProcessing && imageUrl && (
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center space-y-4 p-6 rounded-2xl bg-card/80 border border-border shadow-lg flex flex-col items-center">
              <div className="relative w-16 h-16 mx-auto">
                <div className="w-16 h-16 rounded-full border-4 border-muted animate-spin border-t-primary" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-primary animate-pulse" />
                </div>
              </div>
              <p className="text-sm font-medium text-foreground">
                {currentStepLabel || "Processing..."}
              </p>
              <p className="text-xs text-muted-foreground">
                This may take a moment
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/50">
          4:5 Ratio
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/50">
          4500×5400px
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/50">
          PNG
        </span>
      </div>
    </div>
  );
}

function Sparkles(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}
