const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const outputDir = path.join(__dirname, 'public', 'icons');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function drawIcon(ctx, size) {
  const center = size / 2;
  const scale = size / 512;

  // Background circle
  ctx.beginPath();
  ctx.arc(center, center, size * 0.47, 0, 2 * Math.PI);
  ctx.fillStyle = '#faf9f7';
  ctx.fill();
  ctx.strokeStyle = '#e8e4dc';
  ctx.lineWidth = size * 0.015;
  ctx.stroke();

  // Roof
  ctx.beginPath();
  ctx.moveTo(center * 0.47, center * 0.94);
  ctx.lineTo(center, center * 0.39);
  ctx.lineTo(center * 1.53, center * 0.94);
  ctx.closePath();
  const roofGradient = ctx.createLinearGradient(0, center * 0.39, 0, center * 0.94);
  roofGradient.addColorStop(0, '#c96e6e');
  roofGradient.addColorStop(1, '#a85555');
  ctx.fillStyle = roofGradient;
  ctx.fill();

  // House body
  ctx.beginPath();
  const bodyX = center * 0.47;
  const bodyY = center * 0.94;
  const bodyWidth = size * 0.53;
  const bodyHeight = size * 0.375;
  const radius = size * 0.015;
  ctx.roundRect(bodyX, bodyY, bodyWidth, bodyHeight, radius);
  const houseGradient = ctx.createLinearGradient(0, bodyY, 0, bodyY + bodyHeight);
  houseGradient.addColorStop(0, '#faf9f7');
  houseGradient.addColorStop(1, '#f0efe8');
  ctx.fillStyle = houseGradient;
  ctx.fill();
  ctx.strokeStyle = '#e8e4dc';
  ctx.lineWidth = size * 0.008;
  ctx.stroke();

  // Door
  const doorX = center + size * 0.08;
  const doorY = center * 1.25;
  const doorWidth = size * 0.078;
  const doorHeight = size * 0.22;
  ctx.beginPath();
  ctx.roundRect(doorX, doorY, doorWidth, doorHeight, size * 0.008);
  const doorGradient = ctx.createLinearGradient(0, doorY, 0, doorY + doorHeight);
  doorGradient.addColorStop(0, '#8b5a3c');
  doorGradient.addColorStop(1, '#6b4226');
  ctx.fillStyle = doorGradient;
  ctx.fill();

  // Door knob
  ctx.beginPath();
  ctx.arc(doorX + doorWidth * 0.6, doorY + doorHeight * 0.45, size * 0.008, 0, 2 * Math.PI);
  ctx.fillStyle = '#d4a574';
  ctx.fill();

  // Windows
  const windowSize = size * 0.11;
  const windowRadius = size * 0.008;
  
  // Left window
  const leftWindowX = center * 0.6;
  const windowY = center * 1.06;
  ctx.beginPath();
  ctx.roundRect(leftWindowX, windowY, windowSize, windowSize, windowRadius);
  const windowGradient = ctx.createLinearGradient(0, windowY, 0, windowY + windowSize);
  windowGradient.addColorStop(0, '#87ceeb');
  windowGradient.addColorStop(1, '#4682b4');
  ctx.fillStyle = windowGradient;
  ctx.fill();
  
  // Window crossbars
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.006;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(leftWindowX + windowSize / 2, windowY);
  ctx.lineTo(leftWindowX + windowSize / 2, windowY + windowSize);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(leftWindowX, windowY + windowSize / 2);
  ctx.lineTo(leftWindowX + windowSize, windowY + windowSize / 2);
  ctx.stroke();
  ctx.globalAlpha = 1.0;

  // Right window
  const rightWindowX = center * 1.2;
  ctx.beginPath();
  ctx.roundRect(rightWindowX, windowY, windowSize, windowSize, windowRadius);
  ctx.fillStyle = windowGradient;
  ctx.fill();
  
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.006;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(rightWindowX + windowSize / 2, windowY);
  ctx.lineTo(rightWindowX + windowSize / 2, windowY + windowSize);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rightWindowX, windowY + windowSize / 2);
  ctx.lineTo(rightWindowX + windowSize, windowY + windowSize / 2);
  ctx.stroke();
  ctx.globalAlpha = 1.0;

  // Chimney
  const chimneyX = center * 1.4;
  const chimneyY = center * 0.55;
  const chimneyWidth = size * 0.047;
  const chimneyHeight = size * 0.156;
  ctx.beginPath();
  ctx.roundRect(chimneyX, chimneyY, chimneyWidth, chimneyHeight, size * 0.004);
  ctx.fillStyle = '#c96e6e';
  ctx.fill();
  
  // Chimney top
  ctx.beginPath();
  ctx.roundRect(chimneyX - size * 0.008, chimneyY - size * 0.015, chimneyWidth + size * 0.016, size * 0.015, size * 0.004);
  ctx.fillStyle = '#a85555';
  ctx.fill();

  // Heart on door
  ctx.beginPath();
  const heartX = center + size * 0.1;
  const heartY = center * 1.37;
  ctx.moveTo(heartX, heartY - size * 0.02);
  ctx.bezierCurveTo(heartX - size * 0.03, heartY - size * 0.03, heartX - size * 0.04, heartY - size * 0.02, heartX, heartY);
  ctx.bezierCurveTo(heartX + size * 0.04, heartY - size * 0.02, heartX + size * 0.03, heartY - size * 0.03, heartX, heartY - size * 0.02);
  ctx.fillStyle = '#ff6b6b';
  ctx.globalAlpha = 0.8;
  ctx.fill();
  ctx.globalAlpha = 1.0;
}

sizes.forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  drawIcon(ctx, size);
  
  const buffer = canvas.toBuffer('image/png');
  const outputPath = path.join(outputDir, `icon-${size}.png`);
  fs.writeFileSync(outputPath, buffer);
  console.log(`Generated icon-${size}.png`);
});

console.log('All icons generated successfully!');