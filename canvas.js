import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';

export async function generateItemRow(itemPaths) {
    if (!itemPaths || itemPaths.length === 0) return null;

    const width = 66;
    const height = 48;
    const gap = 6;

    const canvas = createCanvas(itemPaths.length * (width + gap), height);
    const ctx = canvas.getContext('2d');

    // 1. Load all local images concurrently from the hard drive
    const loadedImages = await Promise.all(itemPaths.map(async (imagePath) => {
        // Double-check the file actually exists before trying to load it
        if (imagePath && fs.existsSync(imagePath)) {
            try {
                return await loadImage(imagePath);
            } catch (err) {
                console.error(`Error reading image ${imagePath}:`, err.message);
                return null;
            }
        }
        return null;
    }));

    // 2. Draw the loaded images
    for (let i = 0; i < loadedImages.length; i++) {
        const x = i * (width + gap);
        const img = loadedImages[i];

        if (img) {
            // Successfully loaded from disk!
            ctx.drawImage(img, x, 0, width, height);
        } else {
            // --- FALLBACK DRAWING (If file is missing or corrupted) ---
            // Fill background (dark grey empty slot)
            ctx.fillStyle = '#1c242d';
            ctx.fillRect(x, 0, width, height);

            // Add border
            ctx.strokeStyle = '#323c48';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, 0, width, height);

            // Draw a question mark
            ctx.fillStyle = '#6c7a89';
            ctx.font = 'bold 18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', x + width / 2, height / 2);
        }
    }

    return canvas.toBuffer();
}