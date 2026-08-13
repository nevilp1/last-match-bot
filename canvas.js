import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';

export async function generateItemRow(itemPaths) {
    if (!itemPaths || itemPaths.length === 0) return null;

    const width = 66;
    const height = 48;
    const gap = 6;

    const canvas = createCanvas(itemPaths.length * (width + gap), height);
    const ctx = canvas.getContext('2d');

    // Load all local images concurrently from the hard drive
    const loadedImages = await Promise.all(itemPaths.map(async (imagePath) => {
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

    // Draw the row
    for (let i = 0; i < loadedImages.length; i++) {
        const x = i * (width + gap);
        const img = loadedImages[i];

        // 1. ALWAYS draw the empty dark grey slot base first
        ctx.fillStyle = '#1c242d';
        ctx.fillRect(x, 0, width, height);

        ctx.strokeStyle = '#323c48';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, 0, width, height);

        // 2. Draw the item image if we successfully loaded it
        if (img) {
            ctx.drawImage(img, x, 0, width, height);
        } 
        // 3. ONLY draw the '?' if there WAS an item path, but the image failed to load.
        // If itemPaths[i] is null (meaning the player has no item here), it skips this and leaves the clean grey box!
        else if (itemPaths[i]) {
            ctx.fillStyle = '#6c7a89';
            ctx.font = 'bold 18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', x + width / 2, height / 2);
        }
    }

    return canvas.toBuffer();
}