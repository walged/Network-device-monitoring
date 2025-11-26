const pngToIco = require('png-to-ico');
const fs = require('fs');
const sharp = require('sharp');
const path = require('path');

const convert = pngToIco.default || pngToIco;

async function createIco() {
  console.log('Creating proper ICO from scc.png...');

  const sizes = [256, 128, 64, 48, 32, 16];
  const tempFiles = [];

  try {
    // Create resized versions
    for (const size of sizes) {
      const tempFile = path.join(__dirname, `temp_${size}.png`);
      await sharp('scc.png')
        .resize(size, size)
        .png()
        .toFile(tempFile);
      tempFiles.push(tempFile);
      console.log(`Created ${size}x${size} PNG`);
    }

    // Convert all to ICO
    const buf = await convert(tempFiles);
    fs.writeFileSync('scc.ico', buf);
    console.log('Created scc.ico:', buf.length, 'bytes');

    // Cleanup temp files
    for (const f of tempFiles) {
      fs.unlinkSync(f);
    }
    console.log('Cleaned up temp files');

  } catch (e) {
    console.error('Error:', e);
    // Cleanup on error
    for (const f of tempFiles) {
      try { fs.unlinkSync(f); } catch {}
    }
    process.exit(1);
  }
}

createIco();
