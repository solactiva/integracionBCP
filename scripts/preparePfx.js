/*
  Script: scripts/preparePfx.js
  Purpose: If PFX_BASE64 is provided, decode it and write it to the path in MTLS_PFX_PATH
  so that the application can use the PFX certificate without committing it to the repo.
*/

const fs = require('fs');
const path = require('path');

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function main() {
  const pfxBase64 = process.env.PFX_BASE64;
  const targetPath = process.env.MTLS_PFX_PATH || path.resolve('./certs/BCP_SANDBOX_OPENBANKING.pfx');

  if (!pfxBase64 || pfxBase64.trim() === '') {
    console.log('[preparePfx] PFX_BASE64 not set; skipping PFX file creation.');
    return;
  }

  try {
    const buffer = Buffer.from(pfxBase64, 'base64');
    ensureDir(targetPath);
    fs.writeFileSync(targetPath, buffer);
    console.log(`[preparePfx] Wrote PFX to ${targetPath} (${buffer.length} bytes).`);
  } catch (err) {
    console.error('[preparePfx] Failed to write PFX file:', err.message);
    process.exitCode = 1;
  }
}

main();
