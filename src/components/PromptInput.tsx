import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type PromptInputProps = {
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
};

export function PromptInput({ onSubmit, isLoading }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && !isLoading) {
      onSubmit(prompt.trim());
    }
  };

  const examplePrompts = [
    "A fierce dragon breathing cosmic fire",
    "Retro sunset with palm trees and mountains",
    "Skull with roses and butterflies",
    "Geometric wolf in neon colors",
  ];

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <div className="glass-card rounded-2xl p-6">
        <label className="block text-sm font-medium text-foreground mb-3">
          Describe your t-shirt design
        </label>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter a description for your print-on-demand design..."
          className="min-h-[120px] resize-none bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
          disabled={isLoading}
        />
        
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">Try:</span>
          {examplePrompts.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="text-xs px-3 py-1.5 rounded-full bg-secondary/70 text-muted-foreground hover:text-foreground hover:bg-secondary transition-all border border-border/50"
              disabled={isLoading}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <Button
        type="submit"
        variant="hero"
        size="xl"
        className="w-full"
        disabled={!prompt.trim() || isLoading}
      >
        <Sparkles className="h-5 w-5" />
        {isLoading ? "Generating..." : "Generate Design"}
      </Button>
    </form>
  );
}
