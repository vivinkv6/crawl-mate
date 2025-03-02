const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');

// Helper function to extract contact information
const extractContactInfo = ($) => {
  const contacts = {
    emails: [],
    phones: [],
    whatsapp: []
  };

  // Extract emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  $('body').text().match(emailRegex)?.forEach(email => {
    if (!contacts.emails.includes(email)) contacts.emails.push(email);
  });

  // Extract phone numbers (including WhatsApp)
  const phoneRegex = /(?:\+?\d{1,3}[-. ]?)?(?:\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}|\d{10,12})(?:\s*(?:x|ext)\.?\s*\d{1,5})?/gi;
  const phoneMatches = $('body').text().match(phoneRegex) || [];
  
  phoneMatches.forEach(phone => {
    // Remove all non-digit characters to check the actual number length
    const digits = phone.replace(/\D/g, '');
    // Validate phone number length and format
    if (digits.length >= 10 && digits.length <= 15) {
      // Additional validation to exclude number sequences that are likely not phone numbers
      const isLikelyPhoneNumber = (
        // Check if the number follows common phone number patterns
        /^\+?\d{1,3}?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(phone.trim()) ||
        // Check for international format
        /^\+\d{10,14}$/.test(phone.trim()) ||
        // Check for standard 10-digit format
        /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(phone.trim())
      );

      if (isLikelyPhoneNumber) {
        // Format the phone number consistently
        const formattedPhone = phone.trim();
        if (!contacts.phones.includes(formattedPhone)) {
          contacts.phones.push(formattedPhone);
        }
      }
    }
  });

  // Check for WhatsApp links
  $('a[href*="wa.me"], a[href*="whatsapp.com"]').each((_, element) => {
    const whatsappLink = $(element).attr('href');
    if (!contacts.whatsapp.includes(whatsappLink)) contacts.whatsapp.push(whatsappLink);
  });

  return contacts;
};

// Helper function to extract content
const extractContent = ($) => {
  // Remove script and style elements
  $('script, style').remove();

  const content = [];
  const mainSelectors = ['main', 'article', '.content', '.main-content'];
  let contentContainer = null;

  // Find the main content container
  for (const selector of mainSelectors) {
    if ($(selector).length > 0) {
      contentContainer = $(selector);
      break;
    }
  }

  // If no main content areas found, use body content without header, footer, nav, and aside
  if (!contentContainer) {
    contentContainer = $('body').clone();
    contentContainer.find('header, footer, nav, aside').remove();
  }

  // Process content elements
  contentContainer.children().each((_, element) => {
    const el = $(element);
    const tagName = el.prop('tagName').toLowerCase();

    // Extract headings
    if (/^h[1-6]$/.test(tagName)) {
      content.push({
        type: 'heading',
        level: parseInt(tagName.slice(1)),
        text: el.text().trim()
      });
    }
    // Extract paragraphs
    else if (tagName === 'p') {
      const text = el.text().trim();
      if (text) {
        content.push({
          type: 'paragraph',
          text: text
        });
      }
    }
    // Extract lists
    else if (tagName === 'ul' || tagName === 'ol') {
      const items = [];
      el.find('li').each((_, li) => {
        const $li = $(li);
        const item = {
          text: $li.clone().children('ul, ol').remove().end().text().trim()
        };
        
        // Handle nested lists
        const nestedList = $li.children('ul, ol');
        if (nestedList.length > 0) {
          item.items = [];
          nestedList.find('> li').each((_, nestedLi) => {
            item.items.push($(nestedLi).text().trim());
          });
        }
        
        items.push(item);
      });
      
      if (items.length > 0) {
        content.push({
          type: 'list',
          listType: tagName === 'ol' ? 'ordered' : 'unordered',
          items: items
        });
      }
    }

    // Extract text content from other elements
    else {
      const text = el.text().trim();
      if (text && !['script', 'style', 'noscript'].includes(tagName)) {
        content.push({
          type: 'paragraph',
          text: text
        });
      }
    }
  });

  return content;
};

// Helper function to extract meta tags
const extractMetaTags = ($) => {
  const metaTags = [];
  $('meta').each((_, element) => {
    const meta = {};
    const el = $(element);
    if (el.attr('name')) meta.name = el.attr('name');
    if (el.attr('property')) meta.property = el.attr('property');
    if (el.attr('content')) meta.content = el.attr('content');
    if (Object.keys(meta).length > 0) metaTags.push(meta);
  });
  return metaTags;
};

// Helper function to extract images
const extractImages = ($) => {
  const images = [];
  $('img').each((_, element) => {
    const src = $(element).attr('src');
    if (src && !images.includes(src)) images.push(src);
  });
  return images;
};

// Helper function to extract videos
const extractVideos = ($, baseUrl) => {
  const videos = [];
  
  // YouTube iframes
  $('iframe[src*="youtube.com"], iframe[src*="youtu.be"]').each((_, element) => {
    let src = $(element).attr('src');
    if (src) {
      // Ensure HTTPS protocol
      if (src.startsWith('//')) src = 'https:' + src;
      // Convert youtu.be links to youtube.com embed format
      src = src.replace('youtu.be/', 'youtube.com/embed/');
      if (!videos.includes(src)) videos.push(src);
    }
  });

  // Vimeo iframes
  $('iframe[src*="vimeo.com"]').each((_, element) => {
    let src = $(element).attr('src');
    if (src) {
      if (src.startsWith('//')) src = 'https:' + src;
      if (!videos.includes(src)) videos.push(src);
    }
  });

  // HTML5 videos and sources
  $('video, video source').each((_, element) => {
    let src = $(element).attr('src') || $(element).attr('data-src');
    if (src) {
      // Handle relative paths
      if (src.startsWith('/')) {
        src = new URL(src, baseUrl).href;
      } else if (!src.startsWith('http') && !src.startsWith('//')) {
        src = new URL(src, baseUrl).href;
      }
      if (!videos.includes(src)) videos.push(src);
    }
  });

  // Dailymotion iframes
  $('iframe[src*="dailymotion.com"]').each((_, element) => {
    let src = $(element).attr('src');
    if (src) {
      if (src.startsWith('//')) src = 'https:' + src;
      if (!videos.includes(src)) videos.push(src);
    }
  });

  // Facebook video embeds
  $('iframe[src*="facebook.com/plugins/video"]').each((_, element) => {
    let src = $(element).attr('src');
    if (src) {
      if (src.startsWith('//')) src = 'https:' + src;
      if (!videos.includes(src)) videos.push(src);
    }
  });

  return videos;
};

// Helper function to extract documents
const extractDocuments = ($) => {
  const documents = [];
  $('a[href$=".pdf"], a[href$=".doc"], a[href$=".docx"], a[href$=".xls"], a[href$=".xlsx"], a[href$=".ppt"], a[href$=".pptx"]').each((_, element) => {
    const href = $(element).attr('href');
    if (href && !documents.includes(href)) documents.push(href);
  });
  return documents;
};

// Helper function to extract social media links
const extractSocialMedia = ($) => {
  const socialMedia = [];
  const socialPlatforms = [
    'facebook.com',
    'twitter.com',
    'instagram.com',
    'linkedin.com',
    'youtube.com',
    'pinterest.com',
    'tiktok.com'
  ];

  $('a').each((_, element) => {
    const href = $(element).attr('href');
    if (href) {
      const platform = socialPlatforms.find(platform => href.includes(platform));
      if (platform && !socialMedia.includes(href)) socialMedia.push(href);
    }
  });
  return socialMedia;
};

// Helper function to extract all links
const extractLinks = ($, baseUrl) => {
  const links = [];
  const excludeExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', '.7z'];
  
  $('a').each((_, element) => {
    const href = $(element).attr('href');
    if (href) {
      try {
        // Remove hash fragment from the URL
        const url = new URL(href, baseUrl);
        url.hash = '';
        const absoluteUrl = url.href;
        // Check if URL ends with any excluded extension
        const hasExcludedExtension = excludeExtensions.some(ext => absoluteUrl.toLowerCase().endsWith(ext));
        // Only include links from the same domain and not ending with excluded extensions
        if (absoluteUrl.startsWith(baseUrl) && !hasExcludedExtension && !links.includes(absoluteUrl)) {
          links.push(absoluteUrl);
        }
      } catch (error) {
        // Skip invalid URLs
      }
    }
  });
  return links;
};

// Helper function to scrape entire website
const scrapeWebsite = async (baseUrl, contentType, maxPages = 100) => {
  const visited = new Set();
  const queue = [new URL(baseUrl).href];
  const results = [];
  const failedUrls = new Set();

  while (queue.length > 0 && results.length < maxPages) {
    const url = queue.shift();
    if (visited.has(url) || failedUrls.has(url)) continue;

    try {
      const pageData = await scrapePage(url, contentType);
      results.push(pageData);
      visited.add(url);

      // Extract and normalize new links
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
      const newLinks = extractLinks($, url);
      
      // Filter and normalize URLs before adding to queue
      const normalizedLinks = newLinks
        .map(link => {
          try {
            return new URL(link, url).href;
          } catch {
            return null;
          }
        })
        .filter(link => 
          link && 
          link.startsWith(baseUrl) && 
          !visited.has(link) && 
          !failedUrls.has(link)
        );

      queue.push(...normalizedLinks);
    } catch (error) {
      // Enhanced error handling to match scrapePage function
      let errorMessage;
      if (error.response) {
        // The request was made and the server responded with a status code
        switch (error.response.status) {
          case 400:
            errorMessage = `Bad Request: The provided URL '${url}' is invalid or malformed. Please check the URL and try again.`;
            break;
          case 403:
            errorMessage = `Access Forbidden: The website '${url}' has restricted access to web scraping. This may be due to robots.txt restrictions or server configuration.`;
            break;
          case 413:
            errorMessage = `Content Too Large: The website '${url}' contains too much data to process at once. Try scraping specific pages individually or reduce the amount of content being requested.`;
            break;
          case 500:
            errorMessage = `Internal Server Error: The website '${url}' is experiencing technical difficulties. Please try again later.`;
            break;
          default:
            errorMessage = `Failed to scrape ${url}: ${error.response.status} - ${error.response.statusText}`;
        }
      } else if (error.request) {
        // The request was made but no response was received
        errorMessage = `Network Error: Unable to reach ${url}. Please check your internet connection and verify the website is accessible.`;
      } else {
        // Something happened in setting up the request
        errorMessage = `Error occurred while scraping ${url}: ${error.message.split(':')[0]}`;
      }
      
      console.error(errorMessage);
      failedUrls.add(url);
      results.push({ url, error: errorMessage }); // Include error information in results
    }
  }

  if (results.length === 0) {
    throw new Error(`Unable to scrape any pages from ${baseUrl}. Please check if the website is accessible and allows web scraping.`);
  }

  return results;
};

// Helper function to scrape a single page
const scrapePage = async (url, contentType) => {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const result = { url };

    if (contentType === 'all' || contentType === 'meta') {
      result.meta = extractMetaTags($);
    }
    if (contentType === 'all' || contentType === 'images') {
      result.images = extractImages($);
    }
    if (contentType === 'all' || contentType === 'videos') {
      result.videos = extractVideos($, url);
    }
    if (contentType === 'all' || contentType === 'documents') {
      result.documents = extractDocuments($);
    }
    if (contentType === 'all' || contentType === 'social') {
      result.socialMedia = extractSocialMedia($);
    }
    if (contentType === 'all' || contentType === 'links') {
      result.links = extractLinks($,url);
    }
    if (contentType === 'all' || contentType === 'content') {
      result.content = extractContent($);
    }

    if (contentType === 'all') {
      result.contacts = extractContactInfo($);
    }

    return result;
  } catch (error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      switch (error.response.status) {
        case 400:
          throw new Error(`Bad Request: The provided URL '${url}' is invalid or malformed. Please check the URL and try again.`);
        case 403:
          throw new Error(`Access Forbidden: The website '${url}' has restricted access to web scraping. This may be due to robots.txt restrictions or server configuration.`);
        case 413:
          throw new Error(`Content Too Large: The website '${url}' contains too much data to process at once. Try scraping specific pages individually or reduce the amount of content being requested.`);
        case 500:
          throw new Error(`Internal Server Error: The website '${url}' is experiencing technical difficulties. Please try again later.`);
        default:
          throw new Error(`Failed to scrape ${url}: ${error.response.status} - ${error.response.statusText}`);
      }
    } else if (error.request) {
      // The request was made but no response was received
      throw new Error(`Network Error: Unable to reach ${url}. Please check your internet connection and verify the website is accessible.`);
    } else {
      // Something happened in setting up the request
      throw new Error(`Error occurred while scraping ${url}: ${error.message}`);
    }
  }
};

// POST endpoint for scraping
router.post('/', async (req, res) => {
  try {
    const { url, contentType, scrapeScope } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format. Please provide a valid URL.' });
    }

    if (scrapeScope === 'single') {
      // Scrape single page
      const result = await scrapePage(url, contentType);
      res.json(result);
    } else {
      // Scrape entire website recursively
      const pages = await scrapeWebsite(url, contentType);
      res.json({ pages });
    }
  } catch (error) {
    // Format error message for better client handling
    const errorResponse = {
      error: error.message,
      status: error.response?.status || 500,
      details: error.response?.statusText || 'An error occurred during scraping'
    };
    res.status(errorResponse.status).json(errorResponse);
  }
});

module.exports = router;