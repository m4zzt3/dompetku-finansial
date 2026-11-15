const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sizes = [
  { name: 'favicon', w: 32, h: 32 },
  { name: 'logo-192', w: 192, h: 192 },
  { name: 'logo-512', w: 512, h: 512 },
];

async function main() {
  try {
    require.resolve('sharp');
  } catch {
    console.log('sharp belum terinstal. Anda bisa menginstalnya dengan npm i -D sharp jika ingin render PNG lokal.');
    return;
  }

  const sharp = require('sharp');
  const srcDir = __dirname;

  for (const { name, w, h } of sizes) {
    const svgPath = path.join(srcDir, `${name}.svg`);
    const pngPath = path.join(srcDir, `${name}.png`);

    if (!fs.existsSync(svgPath)) {
      continue;
    }

    const svgBuffer = fs.readFileSync(svgPath);
    await sharp(svgBuffer).resize(w, h).png().toFile(pngPath);
    console.log(`Generated ${pngPath} (${w}×${h})`);
  }
}

main().catch(err => {
  console.warn('generate-icons info:', err.message);
});
