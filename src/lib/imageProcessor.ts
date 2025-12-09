const TARGET_WIDTH = 4500;
const TARGET_HEIGHT = 5400;
const DESIGN_FILL_RATIO = 0.85;

/**
 * Two-step upscale for better quality (max 2x per step to avoid memory issues)
 */
function twoStepUpscale(
  sourceCanvas: HTMLCanvasElement,
  srcX: number, srcY: number, srcW: number, srcH: number,
  targetW: number, targetH: number
): HTMLCanvasElement {
  const scale = Math.max(targetW / srcW, targetH / srcH);
  
  // If scale is <= 2x, do single pass
  if (scale <= 2) {
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetW;
    finalCanvas.height = targetH;
    const ctx = finalCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceCanvas, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);
    return finalCanvas;
  }
  
  // Otherwise do 2-step: first to 2x, then to final
  const midW = Math.round(srcW * 2);
  const midH = Math.round(srcH * 2);
  
  const midCanvas = document.createElement('canvas');
  midCanvas.width = midW;
  midCanvas.height = midH;
  const midCtx = midCanvas.getContext('2d')!;
  midCtx.imageSmoothingEnabled = true;
  midCtx.imageSmoothingQuality = 'high';
  midCtx.drawImage(sourceCanvas, srcX, srcY, srcW, srcH, 0, 0, midW, midH);
  
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = targetW;
  finalCanvas.height = targetH;
  const finalCtx = finalCanvas.getContext('2d')!;
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.drawImage(midCanvas, 0, 0, midW, midH, 0, 0, targetW, targetH);
  
  return finalCanvas;
}

/**
 * Light cleanup - only remove fully transparent noise without touching semi-transparent edges
 */
function cleanEdges(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  
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
 * Resize image to target dimensions with 2-step upscaling for quality
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

  // Crop to content with small padding
  const padding = Math.round(Math.max(img.naturalWidth, img.naturalHeight) * 0.02);
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

  // Two-step upscale for better quality
  const scaledCanvas = twoStepUpscale(
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
