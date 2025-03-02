const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');

const ensureDirectoryExists = (dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (error) {
    console.error(`Error ensuring directory exists: ${dirPath}`, error);
  }
};

// Helper function to resolve image URL to absolute URL without affecting other functionality
const resolveImageUrl = (url, baseUrl) => {
  try {
    if (!url) return null;

    let resolvedUrl;

    // If URL is already absolute (contains http/https), return as is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      resolvedUrl = url;
    } else if (url.startsWith('//')) {
      // Convert protocol-relative URL to absolute
      resolvedUrl = 'https:' + url;
    } else {
      try {
        // Decode URL to properly interpret special characters like `%2F`
        let decodedUrl = decodeURIComponent(url);

        // If it's a query-based image path (e.g., `/next/image?url=...`), extract the actual image URL
        const urlParams = new URLSearchParams(decodedUrl);
        if (urlParams.has('url')) {
          decodedUrl = decodeURIComponent(urlParams.get('url'));
        }

        // Construct absolute URL using the base URL
        resolvedUrl = new URL(decodedUrl, baseUrl).href;
      } catch (error) {
        console.error(`Invalid URL combination: ${url} with base ${baseUrl}`, error.message);
        return null;
      }
    }

    return resolvedUrl;
  } catch (error) {
    console.error(`Error resolving URL ${url}:`, error.message);
    return null;
  }
};


// Helper function to clean up uploads directory without crashing
const cleanupUploads = () => {
  try {
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) return;

    const files = fs.readdirSync(uploadsDir);

    files.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      try {
        if (fs.lstatSync(filePath).isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error(`Error removing ${filePath}:`, err.message);
      }
    });

    // Only remove uploads directory if empty to avoid unnecessary errors
    if (fs.readdirSync(uploadsDir).length === 0) {
      fs.rmdirSync(uploadsDir);
      fs.mkdirSync(uploadsDir);
    }
  } catch (error) {
    console.error(`Error cleaning up uploads directory:`, error.message);
  }
};

// POST endpoint for processing scraped data
router.post('/', async (req, res) => {
  const { data, contentType, scrapeScope } = req.body;
  const sessionId = uuidv4();
  const uploadsDir = path.join(__dirname, '..', 'uploads', sessionId);

  try {
    // Check if data contains error information
    if (scrapeScope === 'single' && data.error) {
      throw new Error(data.error);
    } else if (scrapeScope !== 'single' && data.pages) {
      // Check if all pages have errors
      const allErrors = data.pages.every(page => page.error);
      if (allErrors) {
        throw new Error('Failed to scrape any valid content from the website');
      }
    }

    ensureDirectoryExists(uploadsDir);

    const pages = scrapeScope === 'single' ? [data] : data.pages;
    const processedData = [];
    const failedImageDownloads = [];

    // Create a write stream for the ZIP file
    const zipPath = path.join(uploadsDir, 'scraped_data.zip');
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Listen for archive errors
    archive.on('error', (err) => {
      throw err;
    });

    // Pipe archive data to the file
    archive.pipe(output);

    // Process each page
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      
      // Skip pages with errors
      if (page.error) {
        console.error(`Skipping page ${i + 1} due to error: ${page.error}`);
        processedData.push({ url: page.url, error: page.error });
        continue;
      }
  
      // Create metadata for the page
      const metadata = {
        url: page.url,
        timestamp: new Date().toISOString(),
        failedImageDownloads: []
      };

      if (contentType === 'all' || contentType === 'meta') {
        metadata.meta = page.meta;
      }

      // Process images
      if ((contentType === 'all' || contentType === 'images') && page.images && page.images.length > 0) {
        const pageDir = path.join(uploadsDir, new URL(page.url).hostname.replace(/[^a-zA-Z0-9]/g, '_'));
        ensureDirectoryExists(pageDir);

        metadata.images = [];
        for (const imageUrl of page.images) {
          try {
            console.log(imageUrl,page.url);
            
            const resolvedUrl = resolveImageUrl(imageUrl, page.url);
            if (!resolvedUrl) {
              metadata.failedImageDownloads.push({ url: imageUrl, error: 'Invalid URL format' });
              continue;
            }

            const response = await axios({
              method: 'get',
              url: resolvedUrl,
              responseType: 'stream'
            });

            // Extract filename and extension
            let fileName = path.basename(resolvedUrl);
            // Get the extension
            const extMatch = fileName.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)($|\?|#)/i);
            const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
            // Clean the filename by removing everything after the extension
            fileName = fileName.split('.')[0] + '.' + ext;
            
            // Ensure unique filename
            let uniqueFileName = fileName;
            let counter = 1;
            while (fs.existsSync(path.join(pageDir, uniqueFileName))) {
                const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
                uniqueFileName = `${nameWithoutExt}_${counter}.${ext}`;
                counter++;
            }
            
            const filePath = path.join(pageDir, uniqueFileName);
            
            // Add file to ZIP archive
            const fileStream = fs.createWriteStream(filePath);
            response.data.pipe(fileStream);
            
            await new Promise((resolve, reject) => {
              fileStream.on('finish', resolve);
              fileStream.on('error', reject);
            });

            archive.file(filePath, { name: `${new URL(page.url).hostname}/${fileName}` });
            metadata.images.push({ url: resolvedUrl, fileName });

          } catch (error) {
            metadata.failedImageDownloads.push({ url: imageUrl, error: error.message });
          }
        }
      }

      // Save videos information
      if ((contentType === 'all' || contentType === 'videos') && page.videos) {
        metadata.videos = page.videos;
      }

      // Save documents information
      if ((contentType === 'all' || contentType === 'documents') && page.documents) {
        metadata.documents = page.documents;
      }

      // Save social media information
      if ((contentType === 'all' || contentType === 'social') && page.socialMedia) {
        metadata.socialMedia = page.socialMedia;
      }

      // Save links information
      if ((contentType === 'all' || contentType === 'links') && page.links) {
        metadata.links = page.links;
      }

      // Save contacts information
      if (contentType === 'all' && page.contacts) {
        metadata.contacts = page.contacts;
      }

      processedData.push(metadata);
    }

    // Add metadata to the ZIP file
    const metadataContent = JSON.stringify(scrapeScope === 'single' ? processedData[0] : { pages: processedData }, null, 2);
    archive.append(metadataContent, { name: 'metadata.json' });

    // Finalize the archive
    await archive.finalize();

    // Wait for the output stream to finish
    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });

    // Stream the ZIP file to the client
    res.download(zipPath, 'scraped_data.zip', (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      // Clean up the uploads directory after sending the file
      cleanupUploads(uploadsDir);
    });

  } catch (error) {
    // Clean up on error
    cleanupUploads(uploadsDir);
    
    // Send error response
    res.status(500).json({ 
      type: 'error',
      error: error.message || 'Failed to process request',
      details: 'An error occurred while processing the scraped data.'
    });
  }
});

module.exports = router;