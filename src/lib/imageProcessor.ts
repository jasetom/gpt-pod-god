const TARGET_WIDTH = 4500;
const TARGET_HEIGHT = 5400;
const DESIGN_FILL_RATIO = 0.85;

/**
 * High-quality upscale that preserves alpha channel using multi-step Lanczos-like interpolation
 */
async function upscaleWithAlpha(imageBlob: Blob, targetScale: number): Promise<Blob> {
  const img = await loadImage(imageBlob);
  const srcWidth = img.naturalWidth;
  const srcHeight = img.naturalHeight;
  const dstWidth = Math.round(srcWidth * targetScale);
  const dstHeight = Math.round(srcHeight * targetScale);
  
  console.log(`Upscaling from ${srcWidth}x${srcHeight} to ${dstWidth}x${dstHeight}`);
  
  // Use stepped upscaling for better quality (max 2x per step)
  let currentCanvas = document.createElement('canvas');
  currentCanvas.width = srcWidth;
  currentCanvas.height = srcHeight;
  let currentCtx = currentCanvas.getContext('2d')!;
  currentCtx.drawImage(img, 0, 0);
  
  let currentWidth = srcWidth;
  let currentHeight = srcHeight;
  
  while (currentWidth < dstWidth || currentHeight < dstHeight) {
    const stepScale = Math.min(2, dstWidth / currentWidth, dstHeight / currentHeight);
    const newWidth = Math.round(currentWidth * stepScale);
    const newHeight = Math.round(currentHeight * stepScale);
    
    const newCanvas = document.createElement('canvas');
    newCanvas.width = newWidth;
    newCanvas.height = newHeight;
    const newCtx = newCanvas.getContext('2d')!;
    
    // High quality scaling settings
    newCtx.imageSmoothingEnabled = true;
    newCtx.imageSmoothingQuality = 'high';
    newCtx.drawImage(currentCanvas, 0, 0, newWidth, newHeight);
    
    currentCanvas = newCanvas;
    currentCtx = newCtx;
    currentWidth = newWidth;
    currentHeight = newHeight;
  }
  
  return canvasToBlob(currentCanvas);
}

/**
 * Resize AI-generated image to target dimensions, centering on canvas
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
  const padding = Math.round(Math.max(img.naturalWidth, img.naturalHeight) * 0.01);
  const cropLeft = Math.max(0, bounds.left - padding);
  const cropTop = Math.max(0, bounds.top - padding);
  const cropRight = Math.min(tempCanvas.width - 1, bounds.right + padding);
  const cropBottom = Math.min(tempCanvas.height - 1, bounds.bottom + padding);
  
  const contentWidth = cropRight - cropLeft + 1;
  const contentHeight = cropBottom - cropTop + 1;
  
  // Create cropped canvas
  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = contentWidth;
  croppedCanvas.height = contentHeight;
  const croppedCtx = croppedCanvas.getContext('2d')!;
  croppedCtx.drawImage(
    tempCanvas,
    cropLeft, cropTop, contentWidth, contentHeight,
    0, 0, contentWidth, contentHeight
  );

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

  // Calculate scale factor needed
  const scale = Math.max(finalContentWidth / contentWidth, finalContentHeight / contentHeight);
  
  // Upscale the cropped content while preserving alpha
  const croppedBlob = await canvasToBlob(croppedCanvas);
  const upscaledBlob = await upscaleWithAlpha(croppedBlob, scale);
  const upscaledImg = await loadImage(upscaledBlob);

  // Create final canvas and center the content
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = TARGET_WIDTH;
  finalCanvas.height = TARGET_HEIGHT;
  const finalCtx = finalCanvas.getContext('2d')!;
  
  // Ensure transparent background
  finalCtx.clearRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);

  const offsetX = Math.round((TARGET_WIDTH - upscaledImg.naturalWidth) / 2);
  const offsetY = Math.round((TARGET_HEIGHT - upscaledImg.naturalHeight) / 2);

  finalCtx.drawImage(upscaledImg, offsetX, offsetY);

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
