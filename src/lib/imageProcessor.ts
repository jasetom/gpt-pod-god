import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

const TARGET_WIDTH = 4500;
const TARGET_HEIGHT = 5400;
const DESIGN_FILL_RATIO = 0.85;
const MAX_IMAGE_DIMENSION = 1024;

let segmenter: any = null;

/**
 * Remove background using in-browser ML model
 */
export async function removeBackground(
  imageBlob: Blob,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  console.log('Starting in-browser background removal...');
  onProgress?.(5);

  // Load the segmentation model (cached after first load)
  if (!segmenter) {
    console.log('Loading segmentation model...');
    onProgress?.(10);
    segmenter = await pipeline('image-segmentation', 'Xenova/segformer-b0-finetuned-ade-512-512', {
      device: 'webgpu',
    });
  }
  onProgress?.(30);

  // Load and prepare image
  const img = await loadImage(imageBlob);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get canvas context');

  // Resize if needed
  let width = img.naturalWidth;
  let height = img.naturalHeight;

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    if (width > height) {
      height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
      width = MAX_IMAGE_DIMENSION;
    } else {
      width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
      height = MAX_IMAGE_DIMENSION;
    }
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);
  onProgress?.(40);

  // Get image data as base64
  const imageData = canvas.toDataURL('image/jpeg', 0.9);
  console.log('Processing with segmentation model...');

  // Process the image
  const result = await segmenter(imageData);
  onProgress?.(70);

  if (!result || !Array.isArray(result) || result.length === 0 || !result[0].mask) {
    throw new Error('Invalid segmentation result');
  }

  // Create output canvas
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = canvas.width;
  outputCanvas.height = canvas.height;
  const outputCtx = outputCanvas.getContext('2d');
  if (!outputCtx) throw new Error('Could not get output canvas context');

  // Draw original image
  outputCtx.drawImage(canvas, 0, 0);

  // Apply the mask
  const outputImageData = outputCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
  const data = outputImageData.data;

  // Invert mask to keep subject instead of background
  for (let i = 0; i < result[0].mask.data.length; i++) {
    const alpha = Math.round((1 - result[0].mask.data[i]) * 255);
    data[i * 4 + 3] = alpha;
  }

  outputCtx.putImageData(outputImageData, 0, 0);
  onProgress?.(90);

  console.log('Background removal complete');

  return new Promise((resolve, reject) => {
    outputCanvas.toBlob(
      (blob) => {
        if (blob) {
          onProgress?.(100);
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      },
      'image/png',
      1.0
    );
  });
}

/**
 * High-quality upscale with sharpening
 */
export async function upscaleImage(imageBlob: Blob): Promise<Blob> {
  console.log('Starting high-quality upscale to', TARGET_WIDTH, 'x', TARGET_HEIGHT);

  const img = await loadImage(imageBlob);
  
  // Find content bounds
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = img.naturalWidth;
  tempCanvas.height = img.naturalHeight;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
  tempCtx.drawImage(img, 0, 0);
  
  const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const bounds = findContentBounds(imageData);

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

  // Multi-step upscaling for quality (1.4x increments)
  let currentCanvas = croppedCanvas;
  let currentWidth = contentWidth;
  let currentHeight = contentHeight;

  const maxStepScale = 1.4;
  
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
  }

  // Apply sharpening
  currentCanvas = sharpenCanvas(currentCanvas, 0.4);

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

  return canvasToBlob(finalCanvas);
}

function sharpenCanvas(canvas: HTMLCanvasElement, strength: number = 0.3): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  
  const result = new Uint8ClampedArray(data);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      
      // Skip transparent pixels
      if (data[idx + 3] < 10) continue;
      
      for (let c = 0; c < 3; c++) {
        const center = data[idx + c];
        
        const top = data[((y - 1) * width + x) * 4 + c];
        const bottom = data[((y + 1) * width + x) * 4 + c];
        const left = data[(y * width + x - 1) * 4 + c];
        const right = data[(y * width + x + 1) * 4 + c];
        
        // Laplacian
        const laplacian = 4 * center - top - bottom - left - right;
        
        result[idx + c] = Math.max(0, Math.min(255, center + laplacian * strength));
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
