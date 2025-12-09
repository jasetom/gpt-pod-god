const TARGET_WIDTH = 4500;
const TARGET_HEIGHT = 5400;
const DESIGN_FILL_RATIO = 0.85;

/**
 * High-quality Lanczos-like resampling for alpha channel upscaling
 */
function lanczosUpscale(
  sourceCanvas: HTMLCanvasElement,
  srcX: number, srcY: number, srcW: number, srcH: number,
  targetW: number, targetH: number
): HTMLCanvasElement {
  // Multi-step scaling for better quality (max 2x per step)
  let currentCanvas = document.createElement('canvas');
  currentCanvas.width = srcW;
  currentCanvas.height = srcH;
  const initCtx = currentCanvas.getContext('2d')!;
  initCtx.drawImage(sourceCanvas, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
  
  let currentW = srcW;
  let currentH = srcH;
  
  while (currentW < targetW || currentH < targetH) {
    const nextW = Math.min(currentW * 2, targetW);
    const nextH = Math.min(currentH * 2, targetH);
    
    const nextCanvas = document.createElement('canvas');
    nextCanvas.width = nextW;
    nextCanvas.height = nextH;
    const ctx = nextCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(currentCanvas, 0, 0, currentW, currentH, 0, 0, nextW, nextH);
    
    currentCanvas = nextCanvas;
    currentW = nextW;
    currentH = nextH;
  }
  
  return currentCanvas;
}

/**
 * Extract alpha channel from an image as a grayscale canvas
 */
function extractAlphaChannel(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  
  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = width;
  alphaCanvas.height = height;
  const alphaCtx = alphaCanvas.getContext('2d')!;
  const alphaData = alphaCtx.createImageData(width, height);
  
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    // Store alpha as grayscale
    alphaData.data[i] = alpha;
    alphaData.data[i + 1] = alpha;
    alphaData.data[i + 2] = alpha;
    alphaData.data[i + 3] = 255;
  }
  
  alphaCtx.putImageData(alphaData, 0, 0);
  return alphaCanvas;
}

/**
 * Apply alpha channel from one canvas to another
 */
function applyAlphaChannel(rgbCanvas: HTMLCanvasElement, alphaCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = rgbCanvas.width;
  resultCanvas.height = rgbCanvas.height;
  const resultCtx = resultCanvas.getContext('2d', { willReadFrequently: true })!;
  
  // Draw RGB
  resultCtx.drawImage(rgbCanvas, 0, 0);
  
  // Get both image data
  const rgbData = resultCtx.getImageData(0, 0, resultCanvas.width, resultCanvas.height);
  
  // Scale alpha canvas to match RGB if needed
  const scaledAlpha = document.createElement('canvas');
  scaledAlpha.width = rgbCanvas.width;
  scaledAlpha.height = rgbCanvas.height;
  const scaledCtx = scaledAlpha.getContext('2d')!;
  scaledCtx.imageSmoothingEnabled = true;
  scaledCtx.imageSmoothingQuality = 'high';
  scaledCtx.drawImage(alphaCanvas, 0, 0, alphaCanvas.width, alphaCanvas.height, 0, 0, scaledAlpha.width, scaledAlpha.height);
  
  const alphaData = scaledCtx.getImageData(0, 0, scaledAlpha.width, scaledAlpha.height);
  
  // Apply alpha (stored in R channel of alpha canvas)
  for (let i = 0; i < rgbData.data.length; i += 4) {
    rgbData.data[i + 3] = alphaData.data[i]; // Use R channel as alpha
  }
  
  resultCtx.putImageData(rgbData, 0, 0);
  return resultCanvas;
}

/**
 * Light cleanup - only remove fully transparent noise
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
 * Process AI-upscaled image with original for alpha preservation
 * @param upscaledBlob - AI-upscaled image (may have lost transparency)
 * @param originalBlob - Original image with correct alpha channel
 */
export async function processWithAlphaPreservation(
  upscaledBlob: Blob,
  originalBlob: Blob
): Promise<Blob> {
  console.log('Processing with alpha preservation...');
  
  const [upscaledImg, originalImg] = await Promise.all([
    loadImage(upscaledBlob),
    loadImage(originalBlob)
  ]);
  
  // Create canvases
  const upscaledCanvas = document.createElement('canvas');
  upscaledCanvas.width = upscaledImg.naturalWidth;
  upscaledCanvas.height = upscaledImg.naturalHeight;
  const upscaledCtx = upscaledCanvas.getContext('2d')!;
  upscaledCtx.drawImage(upscaledImg, 0, 0);
  
  const originalCanvas = document.createElement('canvas');
  originalCanvas.width = originalImg.naturalWidth;
  originalCanvas.height = originalImg.naturalHeight;
  const originalCtx = originalCanvas.getContext('2d')!;
  originalCtx.drawImage(originalImg, 0, 0);
  
  // Check if upscaled image still has transparency
  const upscaledData = upscaledCtx.getImageData(0, 0, upscaledCanvas.width, upscaledCanvas.height);
  let hasTransparency = false;
  for (let i = 3; i < upscaledData.data.length; i += 4) {
    if (upscaledData.data[i] < 250) {
      hasTransparency = true;
      break;
    }
  }
  
  let processedCanvas: HTMLCanvasElement;
  
  if (hasTransparency) {
    // AI upscaler preserved transparency, use directly
    console.log('AI upscaler preserved transparency');
    processedCanvas = upscaledCanvas;
  } else {
    // AI upscaler removed transparency, restore from original
    console.log('Restoring transparency from original...');
    
    // Extract and upscale alpha from original
    const alphaCanvas = extractAlphaChannel(originalCanvas);
    const upscaledAlpha = lanczosUpscale(
      alphaCanvas, 0, 0, alphaCanvas.width, alphaCanvas.height,
      upscaledCanvas.width, upscaledCanvas.height
    );
    
    // Apply alpha to upscaled RGB
    processedCanvas = applyAlphaChannel(upscaledCanvas, upscaledAlpha);
  }
  
  // Clean edges
  cleanEdges(processedCanvas);
  
  return canvasToBlob(processedCanvas);
}

/**
 * Resize and center image to target dimensions
 */
export async function resizeToTarget(imageBlob: Blob): Promise<Blob> {
  console.log('Resizing to target:', TARGET_WIDTH, 'x', TARGET_HEIGHT);

  const img = await loadImage(imageBlob);
  
  // Create canvas from image
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = img.naturalWidth;
  sourceCanvas.height = img.naturalHeight;
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })!;
  sourceCtx.drawImage(img, 0, 0);
  
  // Find content bounds
  const imageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const bounds = findContentBounds(imageData);

  // Crop with padding
  const padding = Math.round(Math.max(img.naturalWidth, img.naturalHeight) * 0.02);
  const cropLeft = Math.max(0, bounds.left - padding);
  const cropTop = Math.max(0, bounds.top - padding);
  const cropRight = Math.min(sourceCanvas.width - 1, bounds.right + padding);
  const cropBottom = Math.min(sourceCanvas.height - 1, bounds.bottom + padding);
  
  const contentWidth = cropRight - cropLeft + 1;
  const contentHeight = cropBottom - cropTop + 1;

  // Calculate target content size
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

  // Use high-quality upscaling
  const scaledCanvas = lanczosUpscale(
    sourceCanvas,
    cropLeft, cropTop, contentWidth, contentHeight,
    Math.round(finalContentWidth), Math.round(finalContentHeight)
  );
  
  // Clean edges
  cleanEdges(scaledCanvas);

  // Center on final canvas
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
