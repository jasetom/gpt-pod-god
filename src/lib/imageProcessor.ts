const TARGET_WIDTH = 4500;
const TARGET_HEIGHT = 5400;
const DESIGN_FILL_RATIO = 0.85;

/**
 * Multi-step upscale for better quality (max 2x per step to preserve details)
 */
function multiStepUpscale(
  sourceCanvas: HTMLCanvasElement,
  srcX: number, srcY: number, srcW: number, srcH: number,
  targetW: number, targetH: number
): HTMLCanvasElement {
  const scaleX = targetW / srcW;
  const scaleY = targetH / srcH;
  const maxScale = Math.max(scaleX, scaleY);
  
  // If scale is <= 2x, do single pass
  if (maxScale <= 2) {
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetW;
    finalCanvas.height = targetH;
    const ctx = finalCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceCanvas, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);
    return finalCanvas;
  }
  
  // Calculate number of 2x steps needed
  const numSteps = Math.ceil(Math.log2(maxScale));
  console.log(`Multi-step upscale: ${numSteps} steps for ${maxScale.toFixed(2)}x scale`);
  
  let currentCanvas = document.createElement('canvas');
  currentCanvas.width = srcW;
  currentCanvas.height = srcH;
  let currentCtx = currentCanvas.getContext('2d')!;
  currentCtx.drawImage(sourceCanvas, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
  
  let currentW = srcW;
  let currentH = srcH;
  
  // Do intermediate 2x steps
  for (let step = 0; step < numSteps - 1; step++) {
    const nextW = Math.min(currentW * 2, targetW);
    const nextH = Math.min(currentH * 2, targetH);
    
    const nextCanvas = document.createElement('canvas');
    nextCanvas.width = nextW;
    nextCanvas.height = nextH;
    const nextCtx = nextCanvas.getContext('2d')!;
    nextCtx.imageSmoothingEnabled = true;
    nextCtx.imageSmoothingQuality = 'high';
    nextCtx.drawImage(currentCanvas, 0, 0, currentW, currentH, 0, 0, nextW, nextH);
    
    currentCanvas = nextCanvas;
    currentW = nextW;
    currentH = nextH;
    
    console.log(`Step ${step + 1}: ${currentW}x${currentH}`);
  }
  
  // Final step to exact target dimensions
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = targetW;
  finalCanvas.height = targetH;
  const finalCtx = finalCanvas.getContext('2d')!;
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.drawImage(currentCanvas, 0, 0, currentW, currentH, 0, 0, targetW, targetH);
  
  console.log(`Final step: ${targetW}x${targetH}`);
  
  return finalCanvas;
}

/**
 * Light cleanup - only remove fully transparent noise without touching semi-transparent edges
 */
function cleanEdges(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  
  // Only zero out RGB for pixels that are nearly transparent (anti-aliasing cleanup)
  // This prevents colored fringe but preserves the design
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 10) {
      // Nearly transparent - zero out color to prevent any color bleeding
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Resize image to target dimensions with multi-step upscaling for quality
 */
export async function resizeToTarget(imageBlob: Blob): Promise<Blob> {
  console.log('Processing image to target canvas:', TARGET_WIDTH, 'x', TARGET_HEIGHT);

  const img = await loadImage(imageBlob);
  
  // Find content bounds (non-transparent pixels)
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = img.naturalWidth;
  tempCanvas.height = img.naturalHeight;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
  tempCtx.drawImage(img, 0, 0);
  
  const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const bounds = findContentBounds(imageData);

  // Crop to content with padding to avoid cutting off edges
  const padding = Math.round(Math.max(img.naturalWidth, img.naturalHeight) * 0.025);
  const cropLeft = Math.max(0, bounds.left - padding);
  const cropTop = Math.max(0, bounds.top - padding);
  const cropRight = Math.min(tempCanvas.width - 1, bounds.right + padding);
  const cropBottom = Math.min(tempCanvas.height - 1, bounds.bottom + padding);
  
  const contentWidth = cropRight - cropLeft + 1;
  const contentHeight = cropBottom - cropTop + 1;

  // Calculate target size to fit within fill ratio
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

  // Multi-step upscale for better quality
  const scaledCanvas = multiStepUpscale(
    tempCanvas,
    cropLeft, cropTop, contentWidth, contentHeight,
    Math.round(finalContentWidth), Math.round(finalContentHeight)
  );
  
  // Clean up edge transparency
  cleanEdges(scaledCanvas);

  // Create final canvas and center the content
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = TARGET_WIDTH;
  finalCanvas.height = TARGET_HEIGHT;
  const finalCtx = finalCanvas.getContext('2d')!;
  finalCtx.clearRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);

  const offsetX = Math.round((TARGET_WIDTH - scaledCanvas.width) / 2);
  const offsetY = Math.round((TARGET_HEIGHT - scaledCanvas.height) / 2);

  finalCtx.drawImage(scaledCanvas, offsetX, offsetY);

  return canvasToBlob(finalCanvas);
}

/**
 * Process ESRGAN image by merging its enhanced details with original colors and alpha
 * ESRGAN provides sharper edges, original provides color accuracy and transparency
 */
export async function processEsrganWithAlpha(
  originalBlob: Blob, 
  esrganBlob: Blob
): Promise<Blob> {
  console.log('Processing ESRGAN with color and alpha preservation...');
  
  const [originalImg, esrganImg] = await Promise.all([
    loadImage(originalBlob),
    loadImage(esrganBlob)
  ]);

  // Create canvas for original (to extract colors and alpha)
  const originalCanvas = document.createElement('canvas');
  originalCanvas.width = originalImg.naturalWidth;
  originalCanvas.height = originalImg.naturalHeight;
  const originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true })!;
  originalCtx.drawImage(originalImg, 0, 0);
  
  // Find content bounds from original
  const originalData = originalCtx.getImageData(0, 0, originalCanvas.width, originalCanvas.height);
  const bounds = findContentBounds(originalData);
  
  // Crop settings
  const padding = Math.round(Math.max(originalImg.naturalWidth, originalImg.naturalHeight) * 0.025);
  const cropLeft = Math.max(0, bounds.left - padding);
  const cropTop = Math.max(0, bounds.top - padding);
  const cropRight = Math.min(originalCanvas.width - 1, bounds.right + padding);
  const cropBottom = Math.min(originalCanvas.height - 1, bounds.bottom + padding);
  
  const contentWidth = cropRight - cropLeft + 1;
  const contentHeight = cropBottom - cropTop + 1;

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
  
  const scaledW = Math.round(finalContentWidth);
  const scaledH = Math.round(finalContentHeight);

  // Step 1: Upscale original (preserves colors and alpha)
  console.log('Upscaling original with colors and alpha...');
  const originalUpscaledCanvas = multiStepUpscale(
    originalCanvas,
    cropLeft, cropTop, contentWidth, contentHeight,
    scaledW, scaledH
  );
  const originalUpscaledCtx = originalUpscaledCanvas.getContext('2d', { willReadFrequently: true })!;
  const originalUpscaledData = originalUpscaledCtx.getImageData(0, 0, scaledW, scaledH);
  
  // Step 2: Create canvas for ESRGAN and scale to same dimensions
  console.log('Processing ESRGAN for edge enhancement...');
  const esrganCanvas = document.createElement('canvas');
  esrganCanvas.width = esrganImg.naturalWidth;
  esrganCanvas.height = esrganImg.naturalHeight;
  const esrganCtx = esrganCanvas.getContext('2d', { willReadFrequently: true })!;
  esrganCtx.drawImage(esrganImg, 0, 0);
  
  // ESRGAN is upscaled, we need to find equivalent crop region
  const esrganScale = esrganImg.naturalWidth / originalImg.naturalWidth;
  const esrganCropLeft = Math.round(cropLeft * esrganScale);
  const esrganCropTop = Math.round(cropTop * esrganScale);
  const esrganCropWidth = Math.round(contentWidth * esrganScale);
  const esrganCropHeight = Math.round(contentHeight * esrganScale);
  
  // Scale ESRGAN to match our target dimensions
  const scaledEsrganCanvas = document.createElement('canvas');
  scaledEsrganCanvas.width = scaledW;
  scaledEsrganCanvas.height = scaledH;
  const scaledEsrganCtx = scaledEsrganCanvas.getContext('2d', { willReadFrequently: true })!;
  scaledEsrganCtx.imageSmoothingEnabled = true;
  scaledEsrganCtx.imageSmoothingQuality = 'high';
  scaledEsrganCtx.drawImage(
    esrganCanvas,
    esrganCropLeft, esrganCropTop, esrganCropWidth, esrganCropHeight,
    0, 0, scaledW, scaledH
  );
  
  const esrganData = scaledEsrganCtx.getImageData(0, 0, scaledW, scaledH);
  
  // Step 3: Blend ESRGAN sharpness with original colors
  // Use original RGB colors but apply subtle luminance sharpening from ESRGAN
  console.log('Blending colors with enhanced edges...');
  const mergedData = scaledEsrganCtx.createImageData(scaledW, scaledH);
  
  for (let i = 0; i < originalUpscaledData.data.length; i += 4) {
    const alpha = originalUpscaledData.data[i + 3];
    
    if (alpha < 10) {
      // Fully transparent - keep as transparent
      mergedData.data[i] = 0;
      mergedData.data[i + 1] = 0;
      mergedData.data[i + 2] = 0;
      mergedData.data[i + 3] = 0;
    } else {
      // Get original and ESRGAN luminance
      const origR = originalUpscaledData.data[i];
      const origG = originalUpscaledData.data[i + 1];
      const origB = originalUpscaledData.data[i + 2];
      
      const esrganR = esrganData.data[i];
      const esrganG = esrganData.data[i + 1];
      const esrganB = esrganData.data[i + 2];
      
      // Calculate luminance for both
      const origLum = 0.299 * origR + 0.587 * origG + 0.114 * origB;
      const esrganLum = 0.299 * esrganR + 0.587 * esrganG + 0.114 * esrganB;
      
      // Calculate luminance adjustment factor (how much ESRGAN sharpened the edges)
      // Apply only subtle enhancement to preserve original colors
      const lumRatio = origLum > 0 ? esrganLum / origLum : 1;
      const blendFactor = 0.15; // Only 15% influence from ESRGAN luminance
      const adjustedRatio = 1 + (lumRatio - 1) * blendFactor;
      
      // Clamp the ratio to prevent extreme changes
      const clampedRatio = Math.max(0.85, Math.min(1.15, adjustedRatio));
      
      // Apply subtle luminance adjustment while keeping original colors
      mergedData.data[i] = Math.max(0, Math.min(255, Math.round(origR * clampedRatio)));
      mergedData.data[i + 1] = Math.max(0, Math.min(255, Math.round(origG * clampedRatio)));
      mergedData.data[i + 2] = Math.max(0, Math.min(255, Math.round(origB * clampedRatio)));
      mergedData.data[i + 3] = alpha;
    }
  }
  
  const mergedCanvas = document.createElement('canvas');
  mergedCanvas.width = scaledW;
  mergedCanvas.height = scaledH;
  const mergedCtx = mergedCanvas.getContext('2d')!;
  mergedCtx.putImageData(mergedData, 0, 0);
  
  // Step 4: Center on final canvas
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = TARGET_WIDTH;
  finalCanvas.height = TARGET_HEIGHT;
  const finalCtx = finalCanvas.getContext('2d')!;
  finalCtx.clearRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
  
  const offsetX = Math.round((TARGET_WIDTH - scaledW) / 2);
  const offsetY = Math.round((TARGET_HEIGHT - scaledH) / 2);
  
  finalCtx.drawImage(mergedCanvas, offsetX, offsetY);
  
  console.log('ESRGAN with color preservation complete!');
  return canvasToBlob(finalCanvas);
}

/**
 * Apply sharpening filter to an image using convolution
 * Uses unsharp mask technique for enhanced edge definition
 */
export async function applySharpeningFilter(
  sourceBlob: Blob,
  strength: number = 1.5
): Promise<Blob> {
  console.log('Applying sharpening filter with strength:', strength);
  
  const img = await loadImage(sourceBlob);
  
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  
  // Create output buffer
  const output = new Uint8ClampedArray(data);
  
  // Sharpening kernel (unsharp mask)
  // Center weight is increased for stronger sharpening
  const center = 1 + 4 * strength;
  const edge = -strength;
  
  // Apply convolution (skip edges to avoid boundary issues)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      
      // Only process pixels with significant alpha
      if (data[idx + 3] < 25) continue;
      
      for (let c = 0; c < 3; c++) { // RGB only, preserve alpha
        const topIdx = ((y - 1) * width + x) * 4 + c;
        const bottomIdx = ((y + 1) * width + x) * 4 + c;
        const leftIdx = (y * width + (x - 1)) * 4 + c;
        const rightIdx = (y * width + (x + 1)) * 4 + c;
        const centerIdx = idx + c;
        
        const value = 
          data[centerIdx] * center +
          data[topIdx] * edge +
          data[bottomIdx] * edge +
          data[leftIdx] * edge +
          data[rightIdx] * edge;
        
        output[centerIdx] = Math.max(0, Math.min(255, Math.round(value)));
      }
      // Keep original alpha
      output[idx + 3] = data[idx + 3];
    }
  }
  
  // Put sharpened data back
  const outputData = new ImageData(output, width, height);
  ctx.putImageData(outputData, 0, 0);
  
  console.log('Sharpening complete!');
  return canvasToBlob(canvas);
}

function findContentBounds(imageData: ImageData): { left: number; top: number; right: number; bottom: number } {
  const { data, width, height } = imageData;
  let left = width, top = height, right = 0, bottom = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 15) {
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
