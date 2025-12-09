const TARGET_WIDTH = 4500;
const TARGET_HEIGHT = 5400;
const DESIGN_FILL_RATIO = 0.85;

export type ProgressCallback = (progress: number, message: string) => void;

/**
 * High-quality upscale with edge cleanup and sharpening
 */
export async function upscaleImage(
  imageBlob: Blob, 
  onProgress?: ProgressCallback
): Promise<Blob> {
  console.log('Starting high-quality upscale to', TARGET_WIDTH, 'x', TARGET_HEIGHT);
  onProgress?.(5, 'Loading image...');

  const img = await loadImage(imageBlob);
  onProgress?.(10, 'Analyzing content...');
  
  // Find content bounds
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = img.naturalWidth;
  tempCanvas.height = img.naturalHeight;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
  tempCtx.drawImage(img, 0, 0);
  
  const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const bounds = findContentBounds(imageData);

  onProgress?.(15, 'Cropping to content...');

  // Crop to content
  const padding = 10;
  const cropLeft = Math.max(0, bounds.left - padding);
  const cropTop = Math.max(0, bounds.top - padding);
  const cropRight = Math.min(tempCanvas.width - 1, bounds.right + padding);
  const cropBottom = Math.min(tempCanvas.height - 1, bounds.bottom + padding);
  
  const contentWidth = cropRight - cropLeft + 1;
  const contentHeight = cropBottom - cropTop + 1;
  
  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = contentWidth;
  croppedCanvas.height = contentHeight;
  const croppedCtx = croppedCanvas.getContext('2d')!;
  croppedCtx.drawImage(
    tempCanvas,
    cropLeft, cropTop, contentWidth, contentHeight,
    0, 0, contentWidth, contentHeight
  );

  onProgress?.(20, 'Cleaning up edges...');
  
  // Clean up frizzy edges BEFORE upscaling
  cleanAlphaEdges(croppedCanvas, 2);

  // Calculate target size
  const maxContentWidth = TARGET_WIDTH * DESIGN_FILL_RATIO;
  const maxContentHeight = TARGET_HEIGHT * DESIGN_FILL_RATIO;
  
  const contentRatio = contentWidth / contentHeight;
  const targetRatio = maxContentWidth / maxContentHeight;
  
  let finalContentWidth: number;
  let finalContentHeight: number;
  
  if (contentRatio > targetRatio) {
    finalContentWidth = maxContentWidth;
    finalContentHeight = maxContentWidth / contentRatio;
  } else {
    finalContentHeight = maxContentHeight;
    finalContentWidth = maxContentHeight * contentRatio;
  }

  onProgress?.(30, 'Upscaling image...');

  // Multi-step upscaling for quality (smaller increments for better quality)
  let currentCanvas = croppedCanvas;
  let currentWidth = contentWidth;
  let currentHeight = contentHeight;

  const maxStepScale = 1.3; // Smaller steps = better quality
  let stepCount = 0;
  const totalSteps = Math.ceil(Math.log(finalContentWidth / currentWidth) / Math.log(maxStepScale));
  
  while (currentWidth < finalContentWidth * 0.98 || currentHeight < finalContentHeight * 0.98) {
    const scaleX = finalContentWidth / currentWidth;
    const scaleY = finalContentHeight / currentHeight;
    const step = Math.min(maxStepScale, Math.max(scaleX, scaleY));
    
    const targetW = Math.min(Math.round(finalContentWidth), Math.round(currentWidth * step));
    const targetH = Math.min(Math.round(finalContentHeight), Math.round(currentHeight * step));

    const nextCanvas = document.createElement('canvas');
    nextCanvas.width = targetW;
    nextCanvas.height = targetH;
    const nextCtx = nextCanvas.getContext('2d')!;
    
    nextCtx.imageSmoothingEnabled = true;
    nextCtx.imageSmoothingQuality = 'high';
    nextCtx.drawImage(currentCanvas, 0, 0, targetW, targetH);

    currentCanvas = nextCanvas;
    currentWidth = targetW;
    currentHeight = targetH;
    
    stepCount++;
    const upscaleProgress = 30 + (stepCount / totalSteps) * 40;
    onProgress?.(Math.min(70, upscaleProgress), `Upscaling step ${stepCount}...`);
  }

  onProgress?.(75, 'Enhancing sharpness...');

  // Apply enhanced sharpening with multiple passes
  currentCanvas = sharpenCanvas(currentCanvas, 0.3);
  onProgress?.(80, 'Applying second sharpening pass...');
  currentCanvas = sharpenCanvas(currentCanvas, 0.15);

  onProgress?.(85, 'Final edge cleanup...');
  
  // Final edge cleanup after upscaling
  cleanAlphaEdges(currentCanvas, 1);

  onProgress?.(90, 'Compositing final image...');

  // Final canvas centered
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = TARGET_WIDTH;
  finalCanvas.height = TARGET_HEIGHT;
  const finalCtx = finalCanvas.getContext('2d')!;

  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.clearRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);

  const offsetX = Math.round((TARGET_WIDTH - currentWidth) / 2);
  const offsetY = Math.round((TARGET_HEIGHT - currentHeight) / 2);

  finalCtx.drawImage(currentCanvas, offsetX, offsetY, currentWidth, currentHeight);

  onProgress?.(95, 'Generating final PNG...');
  
  const result = await canvasToBlob(finalCanvas);
  onProgress?.(100, 'Complete!');
  
  return result;
}

/**
 * Clean up frizzy/semi-transparent edges
 * This removes the "fringing" around transparent edges
 */
function cleanAlphaEdges(canvas: HTMLCanvasElement, iterations: number = 2): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  
  for (let iter = 0; iter < iterations; iter++) {
    const result = new Uint8ClampedArray(data);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const alpha = data[idx + 3];
        
        // Target semi-transparent pixels (fringe)
        if (alpha > 10 && alpha < 240) {
          // Count neighbors with high alpha
          let solidNeighbors = 0;
          let transparentNeighbors = 0;
          let avgR = 0, avgG = 0, avgB = 0;
          let solidCount = 0;
          
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nIdx = ((y + dy) * width + (x + dx)) * 4;
              const nAlpha = data[nIdx + 3];
              
              if (nAlpha > 200) {
                solidNeighbors++;
                avgR += data[nIdx];
                avgG += data[nIdx + 1];
                avgB += data[nIdx + 2];
                solidCount++;
              } else if (nAlpha < 30) {
                transparentNeighbors++;
              }
            }
          }
          
          // If mostly surrounded by transparent, make fully transparent
          if (transparentNeighbors >= 5) {
            result[idx + 3] = 0;
          }
          // If mostly surrounded by solid, make solid and blend color
          else if (solidNeighbors >= 5 && solidCount > 0) {
            result[idx] = Math.round(avgR / solidCount);
            result[idx + 1] = Math.round(avgG / solidCount);
            result[idx + 2] = Math.round(avgB / solidCount);
            result[idx + 3] = 255;
          }
          // Edge case: threshold the alpha
          else if (alpha < 128) {
            result[idx + 3] = 0;
          } else {
            result[idx + 3] = 255;
          }
        }
      }
    }
    
    // Copy result back
    for (let i = 0; i < data.length; i++) {
      data[i] = result[i];
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Enhanced sharpening using unsharp mask technique
 */
function sharpenCanvas(canvas: HTMLCanvasElement, strength: number = 0.3): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  
  const result = new Uint8ClampedArray(data);
  
  // Use a 5x5 kernel for smoother sharpening
  const kernel = [
    0, -1, -1, -1, 0,
    -1, 2, -4, 2, -1,
    -1, -4, 24, -4, -1,
    -1, 2, -4, 2, -1,
    0, -1, -1, -1, 0
  ];
  const kernelSum = 8;
  
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const idx = (y * width + x) * 4;
      
      // Skip transparent pixels
      if (data[idx + 3] < 10) continue;
      
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let ki = 0;
        
        for (let ky = -2; ky <= 2; ky++) {
          for (let kx = -2; kx <= 2; kx++) {
            const nIdx = ((y + ky) * width + (x + kx)) * 4 + c;
            sum += data[nIdx] * kernel[ki];
            ki++;
          }
        }
        
        const sharpened = sum / kernelSum;
        const original = data[idx + c];
        const blended = original + (sharpened - original) * strength;
        
        result[idx + c] = Math.max(0, Math.min(255, Math.round(blended)));
      }
    }
  }
  
  ctx.putImageData(new ImageData(result, width, height), 0, 0);
  return canvas;
}

function findContentBounds(imageData: ImageData): { left: number; top: number; right: number; bottom: number } {
  const { data, width, height } = imageData;
  let left = width, top = height, right = 0, bottom = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 20) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (left > right || top > bottom) {
    return { left: 0, top: 0, right: width - 1, bottom: height - 1 };
  }

  return { left, top, right, bottom };
}

function loadImage(source: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (typeof source !== 'string') {
        URL.revokeObjectURL(img.src);
      }
      resolve(img);
    };
    img.onerror = reject;
    img.src = typeof source === 'string' ? source : URL.createObjectURL(source);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob'));
      },
      'image/png',
      1.0
    );
  });
}

export function downloadImage(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
