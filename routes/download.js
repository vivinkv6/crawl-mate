const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');


// Create archive instance per request to prevent queue closure issues
const createArchive = () => archiver('zip', {
  zlib: { level: 9 } // Maximum compression
});
const archive = createArchive(); // Create new archive instance for each request

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
  const { data, contentType, scrapeScope, format = ['json', 'xlsx'] } = req.body;
  const sessionId = uuidv4();
  const uploadsDir = path.join(__dirname, '..', 'uploads', sessionId);
  const archive = createArchive(); // Create new archive instance for each request

  try {
    // Check if data contains error information
    if (scrapeScope === 'single' && data.error) {
      throw new Error(data.error);
    } else if (scrapeScope !== 'single' && data.pages) {
      const allErrors = data.pages.every(page => page.error);
      if (allErrors) {
        throw new Error('Failed to scrape any valid content from the website');
      }
    }

    ensureDirectoryExists(uploadsDir);

    // Handle Excel format
    if (format.includes('xlsx')) {
      const workbook = XLSX.utils.book_new();
      const pages = scrapeScope === 'single' ? [data] : data.pages;

      // Process meta information
      if (contentType === 'all' || contentType === 'meta') {
        // Extract meta tags and create column headers
        const metaHeaders = new Set(['url']);
        pages.forEach(page => {
          if (page.meta) {
            page.meta.forEach(meta => {
              if (meta.name) metaHeaders.add(`meta_${meta.name}`);
              if (meta.property) metaHeaders.add(`og_${meta.property.replace('og:', '')}`);
            });
          }
        });

        // Create meta data with organized columns
        const metaData = pages.map(page => {
          const row = { url: page.url };
          if (page.meta) {
            page.meta.forEach(meta => {
              if (meta.name) row[`meta_${meta.name}`] = meta.content;
              if (meta.property) row[`og_${meta.property.replace('og:', '')}`] = meta.content;
            });
          }
          return row;
        });

        // Create worksheet with headers
        const metaSheet = XLSX.utils.json_to_sheet(metaData, {
          header: Array.from(metaHeaders)
        });

        // Adjust column widths
        const columnWidths = {};
        Array.from(metaHeaders).forEach((header, index) => {
          columnWidths[XLSX.utils.encode_col(index)] = { wch: Math.max(header.length, 15) };
        });
        metaSheet['!cols'] = Object.values(columnWidths);

        XLSX.utils.book_append_sheet(workbook, metaSheet, 'Meta');

      }

      // Process images
      if (contentType === 'all' || contentType === 'images') {
        const imageData = pages.flatMap(page => 
          (page.images || []).map(img => ({
            pageUrl: page.url,
            imageUrl: img
          }))
        );
        const imageSheet = XLSX.utils.json_to_sheet(imageData);
        XLSX.utils.book_append_sheet(workbook, imageSheet, 'Images');
      }

      // Process videos
      if (contentType === 'all' || contentType === 'videos') {
        const videoData = pages.flatMap(page =>
          (page.videos || []).map(video => ({
            pageUrl: page.url,
            videoUrl: video
          }))
        );
        const videoSheet = XLSX.utils.json_to_sheet(videoData);
        XLSX.utils.book_append_sheet(workbook, videoSheet, 'Videos');
      }

      // Process documents
      if (contentType === 'all' || contentType === 'documents') {
        const docData = pages.flatMap(page =>
          (page.documents || []).map(doc => ({
            pageUrl: page.url,
            documentUrl: doc
          }))
        );
        const docSheet = XLSX.utils.json_to_sheet(docData);
        XLSX.utils.book_append_sheet(workbook, docSheet, 'Documents');
      }

      // Process social media
      if (contentType === 'all' || contentType === 'social') {
        const socialData = pages.flatMap(page =>
          (page.socialMedia || []).map(social => ({
            pageUrl: page.url,
            platform: social.platform,
            url: social.url
          }))
        );
        const socialSheet = XLSX.utils.json_to_sheet(socialData);
        XLSX.utils.book_append_sheet(workbook, socialSheet, 'Social Media');
      }

      // Process links
      if (contentType === 'all' || contentType === 'links') {
        const linkData = pages.flatMap(page =>
          (page.links || []).map(link => ({
            pageUrl: page.url,
            link: link
          }))
        );
        const linkSheet = XLSX.utils.json_to_sheet(linkData);
        XLSX.utils.book_append_sheet(workbook, linkSheet, 'Links');
      }

      // Process contacts
      if (contentType === 'all' || contentType === 'contact') {
        const contactData = pages.map(page => ({
          pageUrl: page.url,
          ...page.contacts
        }));
        const contactSheet = XLSX.utils.json_to_sheet(contactData);
        XLSX.utils.book_append_sheet(workbook, contactSheet, 'Contacts');
      }

      // Write Excel file
      const excelPath = path.join(uploadsDir, 'scraped_data.xlsx');
      XLSX.writeFile(workbook, excelPath);
     
      // Always add Excel file to ZIP archive
      archive.file(excelPath, { name: 'scraped_data.xlsx' });
      
      // If only Excel format is requested, send Excel file directly
      if (!format.includes('json')) {
        res.download(excelPath, 'scraped_data.xlsx', (err) => {
          if (err) {
            console.error('Error sending file:', err);
          }
          cleanupUploads(uploadsDir);
        });
        return;
      }
    }

    // Handle JSON format (existing code)
    const pages = scrapeScope === 'single' ? [data] : data.pages;
    const processedData = [];
    const failedImageDownloads = [];

    // Create a write stream for the ZIP file
    const zipPath = path.join(uploadsDir, 'scraped_data.zip');
    const output = fs.createWriteStream(zipPath);
    
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