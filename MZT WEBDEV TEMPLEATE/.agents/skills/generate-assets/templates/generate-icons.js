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
    console.log('Installing sharp (one-time)...');
    execSync('npm install sharp --no-save', { stdio: 'inherit' });
    console.log('sharp installed.');
  }

  const sharp = require('sharp');
  const srcDir = __dirname;

  for (const { name, w, h } of sizes) {
    const svgPath = path.join(srcDir, `${name}.svg`);
    const pngPath = path.join(srcDir, `${name}.png`);

    if (!fs.existsSync(svgPath)) {
      console.log(`Skipping ${svgPath} (not found).`);
      continue;
    }

    const svgBuffer = fs.readFileSync(svgPath);
    await sharp(svgBuffer).resize(w, h).png().toFile(pngPath);
    console.log(`Generated ${pngPath} (${w}×${h})`);
  }

  console.log('PNG icons generated successfully.');
}

main().catch(err => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
