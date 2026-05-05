import { createCanvas, loadImage } from 'canvas';

export async function generateItemRow(itemImages) {
    const width = 88;   // wider
    const height = 64;  // shorter
    const gap = 6;

    const canvas = createCanvas(
        itemImages.length * (width + gap),
        height
    );

    const ctx = canvas.getContext('2d');

    for (let i = 0; i < itemImages.length; i++) {
        const img = await loadImage(itemImages[i]);
        ctx.drawImage(img, i * (width + gap), 0, width, height);
    }

    return canvas.toBuffer();
}