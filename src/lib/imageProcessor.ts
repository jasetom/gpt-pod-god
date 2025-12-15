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
  
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 10) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Helper: Calculate crop bounds and target dimensions from original image
 */
function calculateCropAndTarget(originalImg: HTMLImageElement, originalCanvas: HTMLCanvasElement) {
  const originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true })!;
  const originalData = originalCtx.getImageData(0, 0, originalCanvas.width, originalCanvas.height);
  const bounds = findContentBounds(originalData);
  
  const padding = Math.round(Math.max(originalImg.naturalWidth, originalImg.naturalHeight) * 0.025);
  const cropLeft = Math.max(0, bounds.left - padding);
  const cropTop = Math.max(0, bounds.top - padding);
  const cropRight = Math.min(originalCanvas.width - 1, bounds.right + padding);
  const cropBottom = Math.min(originalCanvas.height - 1, bounds.bottom + padding);
  
  const contentWidth = cropRight - cropLeft + 1;
  const contentHeight = cropBottom - cropTop + 1;

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
  
  return {
    cropLeft,
    cropTop,
    contentWidth,
    contentHeight,
    scaledW: Math.round(finalContentWidth),
    scaledH: Math.round(finalContentHeight)
  };
}

/**
 * Helper: Center content on final canvas
 */
function centerOnFinalCanvas(contentCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = TARGET_WIDTH;
  finalCanvas.height = TARGET_HEIGHT;
  const finalCtx = finalCanvas.getContext('2d')!;
  finalCtx.clearRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
  
  const offsetX = Math.round((TARGET_WIDTH - contentCanvas.width) / 2);
  const offsetY = Math.round((TARGET_HEIGHT - contentCanvas.height) / 2);
  
  finalCtx.drawImage(contentCanvas, offsetX, offsetY);
  return finalCanvas;
}

/**
 * Standard: Client-side canvas upscaling only
 * Uses multi-step 2x upscaling for quality
 */
export async function resizeToTarget(imageBlob: Blob): Promise<Blob> {
  console.log('[Standard] Processing with client canvas upscaling...');

  const img = await loadImage(imageBlob);
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = img.naturalWidth;
  tempCanvas.height = img.naturalHeight;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
  tempCtx.drawImage(img, 0, 0);
  
  const { cropLeft, cropTop, contentWidth, contentHeight, scaledW, scaledH } = 
    calculateCropAndTarget(img, tempCanvas);

  const scaledCanvas = multiStepUpscale(
    tempCanvas,
    cropLeft, cropTop, contentWidth, contentHeight,
    scaledW, scaledH
  );
  
  cleanEdges(scaledCanvas);
  const finalCanvas = centerOnFinalCanvas(scaledCanvas);

  console.log('[Standard] Complete: 1024×1536 → 4500×5400');
  return canvasToBlob(finalCanvas);
}

/**
 * ESRGAN 8x: Uses fal-ai/esrgan with scale=8
 * Takes RGB from ESRGAN (8192×12288), alpha from original
 */
export async function processEsrgan8x(
  originalBlob: Blob, 
  esrgan8xBlob: Blob
): Promise<Blob> {
  console.log('[ESRGAN 8x] Processing fal-ai/esrgan scale=8...');
  
  const [originalImg, esrganImg] = await Promise.all([
    loadImage(originalBlob),
    loadImage(esrgan8xBlob)
  ]);

  const originalCanvas = document.createElement('canvas');
  originalCanvas.width = originalImg.naturalWidth;
  originalCanvas.height = originalImg.naturalHeight;
  const originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true })!;
  originalCtx.drawImage(originalImg, 0, 0);
  
  const { cropLeft, cropTop, contentWidth, contentHeight, scaledW, scaledH } = 
    calculateCropAndTarget(originalImg, originalCanvas);

  // Upscale original for colors and alpha
  const originalUpscaledCanvas = multiStepUpscale(
    originalCanvas, cropLeft, cropTop, contentWidth, contentHeight, scaledW, scaledH
  );
  const originalUpscaledCtx = originalUpscaledCanvas.getContext('2d', { willReadFrequently: true })!;
  const originalUpscaledData = originalUpscaledCtx.getImageData(0, 0, scaledW, scaledH);
  
  // Process ESRGAN 8x image (8192×12288)
  const esrganCanvas = document.createElement('canvas');
  esrganCanvas.width = esrganImg.naturalWidth;
  esrganCanvas.height = esrganImg.naturalHeight;
  const esrganCtx = esrganCanvas.getContext('2d', { willReadFrequently: true })!;
  esrganCtx.drawImage(esrganImg, 0, 0);
  
  const esrganScale = esrganImg.naturalWidth / originalImg.naturalWidth; // Should be 8
  const esrganCropLeft = Math.round(cropLeft * esrganScale);
  const esrganCropTop = Math.round(cropTop * esrganScale);
  const esrganCropWidth = Math.round(contentWidth * esrganScale);
  const esrganCropHeight = Math.round(contentHeight * esrganScale);
  
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
  
  // Merge: Original colors with subtle ESRGAN enhancement, original alpha
  const mergedData = scaledEsrganCtx.createImageData(scaledW, scaledH);
  for (let i = 0; i < originalUpscaledData.data.length; i += 4) {
    const alpha = originalUpscaledData.data[i + 3];
    
    if (alpha < 10) {
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
      
      const origLum = 0.299 * origR + 0.587 * origG + 0.114 * origB;
      const esrganLum = 0.299 * esrganR + 0.587 * esrganG + 0.114 * esrganB;
      const lumRatio = origLum > 0 ? esrganLum / origLum : 1;
      const adjustedRatio = Math.max(0.9, Math.min(1.1, 1 + (lumRatio - 1) * 0.1));
      
      mergedData.data[i] = Math.max(0, Math.min(255, Math.round(origR * adjustedRatio)));
      mergedData.data[i + 1] = Math.max(0, Math.min(255, Math.round(origG * adjustedRatio)));
      mergedData.data[i + 2] = Math.max(0, Math.min(255, Math.round(origB * adjustedRatio)));
      mergedData.data[i + 3] = alpha;
    }
  }
  
  const mergedCanvas = document.createElement('canvas');
  mergedCanvas.width = scaledW;
  mergedCanvas.height = scaledH;
  mergedCanvas.getContext('2d')!.putImageData(mergedData, 0, 0);
  
  const finalCanvas = centerOnFinalCanvas(mergedCanvas);
  console.log('[ESRGAN 8x] Complete: 1024×1536 → 8192×12288 → 4500×5400');
  return canvasToBlob(finalCanvas);
}

/**
 * RealESRGAN x4+: Uses fal-ai/esrgan with model=RealESRGAN_x4plus, scale=4
 * Optimized for realistic detail enhancement
 */
export async function processRealEsrganX4(
  originalBlob: Blob, 
  realEsrganBlob: Blob
): Promise<Blob> {
  console.log('[RealESRGAN x4+] Processing fal-ai/esrgan model=RealESRGAN_x4plus...');
  
  const [originalImg, realEsrganImg] = await Promise.all([
    loadImage(originalBlob),
    loadImage(realEsrganBlob)
  ]);

  const originalCanvas = document.createElement('canvas');
  originalCanvas.width = originalImg.naturalWidth;
  originalCanvas.height = originalImg.naturalHeight;
  const originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true })!;
  originalCtx.drawImage(originalImg, 0, 0);
  
  const { cropLeft, cropTop, contentWidth, contentHeight, scaledW, scaledH } = 
    calculateCropAndTarget(originalImg, originalCanvas);

  // Upscale original for colors and alpha
  const originalUpscaledCanvas = multiStepUpscale(
    originalCanvas, cropLeft, cropTop, contentWidth, contentHeight, scaledW, scaledH
  );
  const originalUpscaledCtx = originalUpscaledCanvas.getContext('2d', { willReadFrequently: true })!;
  const originalUpscaledData = originalUpscaledCtx.getImageData(0, 0, scaledW, scaledH);
  
  // Process RealESRGAN x4+ image (4096×6144)
  const realEsrganCanvas = document.createElement('canvas');
  realEsrganCanvas.width = realEsrganImg.naturalWidth;
  realEsrganCanvas.height = realEsrganImg.naturalHeight;
  const realEsrganCtx = realEsrganCanvas.getContext('2d', { willReadFrequently: true })!;
  realEsrganCtx.drawImage(realEsrganImg, 0, 0);
  
  const esrganScale = realEsrganImg.naturalWidth / originalImg.naturalWidth; // Should be 4
  const esrganCropLeft = Math.round(cropLeft * esrganScale);
  const esrganCropTop = Math.round(cropTop * esrganScale);
  const esrganCropWidth = Math.round(contentWidth * esrganScale);
  const esrganCropHeight = Math.round(contentHeight * esrganScale);
  
  const scaledRealEsrganCanvas = document.createElement('canvas');
  scaledRealEsrganCanvas.width = scaledW;
  scaledRealEsrganCanvas.height = scaledH;
  const scaledRealEsrganCtx = scaledRealEsrganCanvas.getContext('2d', { willReadFrequently: true })!;
  scaledRealEsrganCtx.imageSmoothingEnabled = true;
  scaledRealEsrganCtx.imageSmoothingQuality = 'high';
  scaledRealEsrganCtx.drawImage(
    realEsrganCanvas,
    esrganCropLeft, esrganCropTop, esrganCropWidth, esrganCropHeight,
    0, 0, scaledW, scaledH
  );
  
  const realEsrganData = scaledRealEsrganCtx.getImageData(0, 0, scaledW, scaledH);
  
  // Merge: Original colors with RealESRGAN detail, original alpha
  const mergedData = scaledRealEsrganCtx.createImageData(scaledW, scaledH);
  for (let i = 0; i < originalUpscaledData.data.length; i += 4) {
    const alpha = originalUpscaledData.data[i + 3];
    
    if (alpha < 10) {
      mergedData.data[i] = 0;
      mergedData.data[i + 1] = 0;
      mergedData.data[i + 2] = 0;
      mergedData.data[i + 3] = 0;
    } else {
      const origR = originalUpscaledData.data[i];
      const origG = originalUpscaledData.data[i + 1];
      const origB = originalUpscaledData.data[i + 2];
      const realR = realEsrganData.data[i];
      const realG = realEsrganData.data[i + 1];
      const realB = realEsrganData.data[i + 2];
      
      const origLum = 0.299 * origR + 0.587 * origG + 0.114 * origB;
      const realLum = 0.299 * realR + 0.587 * realG + 0.114 * realB;
      const lumRatio = origLum > 0 ? realLum / origLum : 1;
      const adjustedRatio = Math.max(0.9, Math.min(1.1, 1 + (lumRatio - 1) * 0.12));
      
      mergedData.data[i] = Math.max(0, Math.min(255, Math.round(origR * adjustedRatio)));
      mergedData.data[i + 1] = Math.max(0, Math.min(255, Math.round(origG * adjustedRatio)));
      mergedData.data[i + 2] = Math.max(0, Math.min(255, Math.round(origB * adjustedRatio)));
      mergedData.data[i + 3] = alpha;
    }
  }
  
  const mergedCanvas = document.createElement('canvas');
  mergedCanvas.width = scaledW;
  mergedCanvas.height = scaledH;
  mergedCanvas.getContext('2d')!.putImageData(mergedData, 0, 0);
  
  const finalCanvas = centerOnFinalCanvas(mergedCanvas);
  console.log('[RealESRGAN x4+] Complete: 1024×1536 → 4096×6144 → 4500×5400');
  return canvasToBlob(finalCanvas);
}

/**
 * Double Pass: Uses fal-ai/esrgan 4x twice (4x → 4x = 16x total)
 * Maximum AI upscaling before downscale
 */
export async function processDoublePass(
  originalBlob: Blob, 
  doublePassBlob: Blob
): Promise<Blob> {
  console.log('[Double Pass] Processing fal-ai/esrgan 4x × 2...');
  
  const [originalImg, doublePassImg] = await Promise.all([
    loadImage(originalBlob),
    loadImage(doublePassBlob)
  ]);

  const originalCanvas = document.createElement('canvas');
  originalCanvas.width = originalImg.naturalWidth;
  originalCanvas.height = originalImg.naturalHeight;
  const originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true })!;
  originalCtx.drawImage(originalImg, 0, 0);
  
  const { cropLeft, cropTop, contentWidth, contentHeight, scaledW, scaledH } = 
    calculateCropAndTarget(originalImg, originalCanvas);

  // Upscale original for colors and alpha
  const originalUpscaledCanvas = multiStepUpscale(
    originalCanvas, cropLeft, cropTop, contentWidth, contentHeight, scaledW, scaledH
  );
  const originalUpscaledCtx = originalUpscaledCanvas.getContext('2d', { willReadFrequently: true })!;
  const originalUpscaledData = originalUpscaledCtx.getImageData(0, 0, scaledW, scaledH);
  
  // Process Double Pass image (16384×24576)
  const doublePassCanvas = document.createElement('canvas');
  doublePassCanvas.width = doublePassImg.naturalWidth;
  doublePassCanvas.height = doublePassImg.naturalHeight;
  const doublePassCtx = doublePassCanvas.getContext('2d', { willReadFrequently: true })!;
  doublePassCtx.drawImage(doublePassImg, 0, 0);
  
  const dpScale = doublePassImg.naturalWidth / originalImg.naturalWidth; // Should be 16
  const dpCropLeft = Math.round(cropLeft * dpScale);
  const dpCropTop = Math.round(cropTop * dpScale);
  const dpCropWidth = Math.round(contentWidth * dpScale);
  const dpCropHeight = Math.round(contentHeight * dpScale);
  
  const scaledDpCanvas = document.createElement('canvas');
  scaledDpCanvas.width = scaledW;
  scaledDpCanvas.height = scaledH;
  const scaledDpCtx = scaledDpCanvas.getContext('2d', { willReadFrequently: true })!;
  scaledDpCtx.imageSmoothingEnabled = true;
  scaledDpCtx.imageSmoothingQuality = 'high';
  scaledDpCtx.drawImage(
    doublePassCanvas,
    dpCropLeft, dpCropTop, dpCropWidth, dpCropHeight,
    0, 0, scaledW, scaledH
  );
  
  const dpData = scaledDpCtx.getImageData(0, 0, scaledW, scaledH);
  
  // Merge: Original colors with double pass sharpness, original alpha
  const mergedData = scaledDpCtx.createImageData(scaledW, scaledH);
  for (let i = 0; i < originalUpscaledData.data.length; i += 4) {
    const alpha = originalUpscaledData.data[i + 3];
    
    if (alpha < 10) {
      mergedData.data[i] = 0;
      mergedData.data[i + 1] = 0;
      mergedData.data[i + 2] = 0;
      mergedData.data[i + 3] = 0;
    } else {
      const origR = originalUpscaledData.data[i];
      const origG = originalUpscaledData.data[i + 1];
      const origB = originalUpscaledData.data[i + 2];
      const dpR = dpData.data[i];
      const dpG = dpData.data[i + 1];
      const dpB = dpData.data[i + 2];
      
      const origLum = 0.299 * origR + 0.587 * origG + 0.114 * origB;
      const dpLum = 0.299 * dpR + 0.587 * dpG + 0.114 * dpB;
      const lumRatio = origLum > 0 ? dpLum / origLum : 1;
      const adjustedRatio = Math.max(0.88, Math.min(1.12, 1 + (lumRatio - 1) * 0.15));
      
      mergedData.data[i] = Math.max(0, Math.min(255, Math.round(origR * adjustedRatio)));
      mergedData.data[i + 1] = Math.max(0, Math.min(255, Math.round(origG * adjustedRatio)));
      mergedData.data[i + 2] = Math.max(0, Math.min(255, Math.round(origB * adjustedRatio)));
      mergedData.data[i + 3] = alpha;
    }
  }
  
  const mergedCanvas = document.createElement('canvas');
  mergedCanvas.width = scaledW;
  mergedCanvas.height = scaledH;
  mergedCanvas.getContext('2d')!.putImageData(mergedData, 0, 0);
  
  const finalCanvas = centerOnFinalCanvas(mergedCanvas);
  console.log('[Double Pass] Complete: 1024×1536 → 16384×24576 → 4500×5400');
  return canvasToBlob(finalCanvas);
}

/**
 * SeedVR: Uses fal-ai/seedvr/upscale/image with upscale_factor=3
 * High quality AI upscaler with different algorithm
 */
export async function processSeedVR(
  originalBlob: Blob, 
  seedvrBlob: Blob
): Promise<Blob> {
  console.log('[SeedVR] Processing fal-ai/seedvr/upscale/image 3x...');
  
  const [originalImg, seedvrImg] = await Promise.all([
    loadImage(originalBlob),
    loadImage(seedvrBlob)
  ]);

  const originalCanvas = document.createElement('canvas');
  originalCanvas.width = originalImg.naturalWidth;
  originalCanvas.height = originalImg.naturalHeight;
  const originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true })!;
  originalCtx.drawImage(originalImg, 0, 0);
  
  const { cropLeft, cropTop, contentWidth, contentHeight, scaledW, scaledH } = 
    calculateCropAndTarget(originalImg, originalCanvas);

  // Upscale original for colors and alpha
  const originalUpscaledCanvas = multiStepUpscale(
    originalCanvas, cropLeft, cropTop, contentWidth, contentHeight, scaledW, scaledH
  );
  const originalUpscaledCtx = originalUpscaledCanvas.getContext('2d', { willReadFrequently: true })!;
  const originalUpscaledData = originalUpscaledCtx.getImageData(0, 0, scaledW, scaledH);
  
  // Process SeedVR image (3072×4608)
  const seedvrCanvas = document.createElement('canvas');
  seedvrCanvas.width = seedvrImg.naturalWidth;
  seedvrCanvas.height = seedvrImg.naturalHeight;
  const seedvrCtx = seedvrCanvas.getContext('2d', { willReadFrequently: true })!;
  seedvrCtx.drawImage(seedvrImg, 0, 0);
  
  const seedvrScale = seedvrImg.naturalWidth / originalImg.naturalWidth; // Should be 3
  const seedvrCropLeft = Math.round(cropLeft * seedvrScale);
  const seedvrCropTop = Math.round(cropTop * seedvrScale);
  const seedvrCropWidth = Math.round(contentWidth * seedvrScale);
  const seedvrCropHeight = Math.round(contentHeight * seedvrScale);
  
  const scaledSeedvrCanvas = document.createElement('canvas');
  scaledSeedvrCanvas.width = scaledW;
  scaledSeedvrCanvas.height = scaledH;
  const scaledSeedvrCtx = scaledSeedvrCanvas.getContext('2d', { willReadFrequently: true })!;
  scaledSeedvrCtx.imageSmoothingEnabled = true;
  scaledSeedvrCtx.imageSmoothingQuality = 'high';
  scaledSeedvrCtx.drawImage(
    seedvrCanvas,
    seedvrCropLeft, seedvrCropTop, seedvrCropWidth, seedvrCropHeight,
    0, 0, scaledW, scaledH
  );
  
  const seedvrData = scaledSeedvrCtx.getImageData(0, 0, scaledW, scaledH);
  
  // Merge: Original colors with SeedVR enhancement, original alpha
  const mergedData = scaledSeedvrCtx.createImageData(scaledW, scaledH);
  for (let i = 0; i < originalUpscaledData.data.length; i += 4) {
    const alpha = originalUpscaledData.data[i + 3];
    
    if (alpha < 10) {
      mergedData.data[i] = 0;
      mergedData.data[i + 1] = 0;
      mergedData.data[i + 2] = 0;
      mergedData.data[i + 3] = 0;
    } else {
      const origR = originalUpscaledData.data[i];
      const origG = originalUpscaledData.data[i + 1];
      const origB = originalUpscaledData.data[i + 2];
      const seedR = seedvrData.data[i];
      const seedG = seedvrData.data[i + 1];
      const seedB = seedvrData.data[i + 2];
      
      const origLum = 0.299 * origR + 0.587 * origG + 0.114 * origB;
      const seedLum = 0.299 * seedR + 0.587 * seedG + 0.114 * seedB;
      const lumRatio = origLum > 0 ? seedLum / origLum : 1;
      const adjustedRatio = Math.max(0.9, Math.min(1.1, 1 + (lumRatio - 1) * 0.1));
      
      mergedData.data[i] = Math.max(0, Math.min(255, Math.round(origR * adjustedRatio)));
      mergedData.data[i + 1] = Math.max(0, Math.min(255, Math.round(origG * adjustedRatio)));
      mergedData.data[i + 2] = Math.max(0, Math.min(255, Math.round(origB * adjustedRatio)));
      mergedData.data[i + 3] = alpha;
    }
  }
  
  const mergedCanvas = document.createElement('canvas');
  mergedCanvas.width = scaledW;
  mergedCanvas.height = scaledH;
  mergedCanvas.getContext('2d')!.putImageData(mergedData, 0, 0);
  
  const finalCanvas = centerOnFinalCanvas(mergedCanvas);
  console.log('[SeedVR] Complete: 1024×1536 → 3072×4608 → 4500×5400');
  return canvasToBlob(finalCanvas);
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
