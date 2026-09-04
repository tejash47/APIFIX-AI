const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// Security limits configurable via environment variables
const MAX_UPLOAD_SIZE_BYTES = parseInt(process.env.MAX_UPLOAD_SIZE_BYTES || `${50 * 1024 * 1024}`, 10); // 50 MB
const MAX_EXTRACTED_SIZE_BYTES = parseInt(process.env.MAX_EXTRACTED_SIZE_BYTES || `${150 * 1024 * 1024}`, 10); // 150 MB
const MAX_FILE_COUNT = parseInt(process.env.MAX_FILE_COUNT || '5000', 10); // 5000 files

/**
 * Validates whether a file is a valid ZIP archive
 * @param {string} filePath - Absolute path to the uploaded file
 */
function validateZipHeader(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('Upload file does not exist on disk.');
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    throw new Error('Empty project: uploaded file is 0 bytes.');
  }

  if (stats.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error(`Archive too large: upload size (${(stats.size / 1024 / 1024).toFixed(1)}MB) exceeds limit of ${(MAX_UPLOAD_SIZE_BYTES / 1024 / 1024).toFixed(0)}MB.`);
  }

  // Check magic bytes (ZIP starts with 'PK\x03\x04', 'PK\x05\x06' (empty), or 'PK\x07\x08')
  const buffer = Buffer.alloc(4);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 4, 0);
  fs.closeSync(fd);

  const isZip = (buffer[0] === 0x50 && buffer[1] === 0x4B && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07));
  if (!isZip) {
    throw new Error('Invalid or corrupted archive: file is not a valid ZIP archive.');
  }

  return true;
}

/**
 * Safely extracts a ZIP archive into a destination directory, enforcing
 * strict protection against Zip Slip, path traversal, Zip Bombs, and symlink attacks.
 * 
 * @param {string} zipFilePath - Path to source ZIP file
 * @param {string} destinationDir - Absolute path to target extraction directory
 * @returns {object} Extraction summary { fileCount, totalBytesExtracted, rootDir }
 */
function safeExtractZip(zipFilePath, destinationDir) {
  validateZipHeader(zipFilePath);

  const resolvedDest = path.resolve(destinationDir);
  if (!fs.existsSync(resolvedDest)) {
    fs.mkdirSync(resolvedDest, { recursive: true });
  }

  let zip;
  try {
    zip = new AdmZip(zipFilePath);
  } catch (err) {
    throw new Error(`Invalid or corrupted archive: ${err.message}`);
  }

  const zipEntries = zip.getEntries();
  if (!zipEntries || zipEntries.length === 0) {
    throw new Error('Empty project: archive contains no entries.');
  }

  if (zipEntries.length > MAX_FILE_COUNT) {
    throw new Error(`Archive rejected for security reasons: entry count (${zipEntries.length}) exceeds safety limit of ${MAX_FILE_COUNT} files.`);
  }

  let totalExtractedBytes = 0;
  let fileCount = 0;

  for (const entry of zipEntries) {
    const rawEntryName = entry.entryName;

    // Reject absolute paths or paths containing drive letters on Windows (e.g. C:\)
    if (path.isAbsolute(rawEntryName) || /^[a-zA-Z]:/.test(rawEntryName)) {
      throw new Error(`Archive rejected for security reasons: absolute path detected in archive entry "${rawEntryName}".`);
    }

    // Check for directory traversal / Zip Slip segments
    if (rawEntryName.split(/[/\\]/).includes('..')) {
      throw new Error(`Archive rejected for security reasons: path traversal / Zip Slip attempt detected in entry "${rawEntryName}".`);
    }

    const targetPath = path.resolve(resolvedDest, rawEntryName);

    // Zip Slip check: resolved path MUST be strictly inside resolvedDest
    const relativePath = path.relative(resolvedDest, targetPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`Archive rejected for security reasons: path traversal / Zip Slip attempt detected in entry "${rawEntryName}".`);
    }

    // Zip Bomb protection: check uncompressed size against running total
    const uncompressedSize = entry.header ? entry.header.size : entry.getData().length;
    totalExtractedBytes += uncompressedSize;

    if (totalExtractedBytes > MAX_EXTRACTED_SIZE_BYTES) {
      throw new Error(`Archive too large: extracted content size exceeds ${(MAX_EXTRACTED_SIZE_BYTES / 1024 / 1024).toFixed(0)}MB safety limit.`);
    }

    if (entry.isDirectory) {
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }
    } else {
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // Check if entry is a symlink (attribute check)
      const isSymlink = entry.attr ? ((entry.attr >>> 16) & 0o170000) === 0o120000 : false;
      if (isSymlink) {
        // Skip or disallow raw symlink extraction to prevent pointing outside workspace
        console.warn(`[ZIP Security] Skipping symlink entry for security: ${rawEntryName}`);
        continue;
      }

      // Write file contents safely
      const data = entry.getData();
      fs.writeFileSync(targetPath, data);
      fileCount++;
    }
  }

  return {
    success: true,
    fileCount,
    totalBytesExtracted: totalExtractedBytes,
    destinationDir: resolvedDest
  };
}

module.exports = {
  MAX_UPLOAD_SIZE_BYTES,
  MAX_EXTRACTED_SIZE_BYTES,
  MAX_FILE_COUNT,
  validateZipHeader,
  safeExtractZip
};
