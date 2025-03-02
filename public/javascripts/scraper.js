document.addEventListener("DOMContentLoaded", () => {
  let currentImages = [];
  let currentImageIndex = 0;

  // Get all required DOM elements
  const scrapeForm = document.getElementById("scrapeForm");
  const urlInput = document.getElementById("urlInput");
  const scrapeButton = document.getElementById("scrapeButton");
  const resultCard = document.getElementById("resultCard");
  const errorAlert = document.getElementById("errorAlert");
  const downloadButton = document.getElementById("downloadButton");
  const scrapedDataAccordion = document.getElementById("scrapedDataAccordion");
  const spinner = document.querySelector(".spinner-border");
  let contentTypeSelect = document.getElementById("contentType");

  // Helper functions for UI state management
  const showLoading = () => {
    spinner.classList.remove("d-none");
    scrapeButton.disabled = true;
    resultCard.classList.add("d-none");
    errorAlert.classList.add("d-none");
    downloadButton.disabled = true;
    notificationSystem.info('Starting web scraping process...');
  };

  const hideLoading = () => {
    spinner.classList.add("d-none");
    scrapeButton.disabled = false;
    notificationSystem.success('Scraping completed successfully!');
  };

  const showError = (message) => {
    errorAlert.textContent = message;
    errorAlert.classList.remove("d-none");
    resultCard.classList.add("d-none");
    downloadButton.disabled = true;
    notificationSystem.error(message);
  };

  // Helper function for document icons
  const getDocumentIcon = (type) => {
    switch (type.toLowerCase()) {
      case "pdf":
        return "pdf";
      case "doc":
      case "docx":
        return "word";
      case "xls":
      case "xlsx":
        return "excel";
      case "ppt":
      case "pptx":
        return "powerpoint";
      case "txt":
        return "text";
      default:
        return "file";
    }
  };

  // Helper function for social media icons
  const getSocialMediaIcon = (platform) => {
    switch (platform.toLowerCase()) {
      case "facebook":
        return "facebook";
      case "twitter":
      case "x":
        return "twitter-x";
      case "instagram":
        return "instagram";
      case "linkedin":
        return "linkedin";
      case "youtube":
        return "youtube";
      case "pinterest":
        return "pinterest";
      case "tiktok":
        return "tiktok";
      case "github":
        return "github";
      case "snapchat":
        return "snapchat";
      case "reddit":
        return "reddit";
      case "twitch":
        return "twitch";
      case "discord":
        return "discord";
      case "telegram":
        return "telegram";
      case "medium":
        return "medium";
      case "vimeo":
        return "vimeo";
      case "behance":
        return "behance";
      case "dribbble":
        return "dribbble";
      default:
        return "link";
    }
  };

  // Create accordion item for each content type
  const createAccordionItem = (title, content, id, itemCount) => {
    const accordionItem = document.createElement('div');
    accordionItem.className = 'accordion-item';

    const header = document.createElement('h2');
    header.className = 'accordion-header';

    const button = document.createElement('button');
    button.className = 'accordion-button collapsed';
    button.type = 'button';
    button.setAttribute('data-bs-toggle', 'collapse');
    button.setAttribute('data-bs-target', `#${id}`);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', id);
    button.textContent = `${title} (${itemCount})`;

    const collapseDiv = document.createElement('div');
    collapseDiv.id = id;
    collapseDiv.className = 'accordion-collapse collapse';

    const body = document.createElement('div');
    body.className = 'accordion-body';
    body.appendChild(content);

    header.appendChild(button);
    collapseDiv.appendChild(body);
    accordionItem.appendChild(header);
    accordionItem.appendChild(collapseDiv);

    return accordionItem;
  };

  // Create content sections
  const createMetaTagsSection = (metaTags) => {
    const container = document.createElement('div');
    if (!metaTags || metaTags.length === 0) {
      container.textContent = 'No meta tags found';
      return container;
    }

    const table = document.createElement('table');
    table.className = 'table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Type</th>
          <th>Value</th>
          <th>Content</th>
        </tr>
      </thead>
      <tbody>
        ${metaTags.map(tag => `
          <tr>
            <td>${tag.name ? 'name' : 'property'}</td>
            <td>${tag.name || tag.property}</td>
            <td>${tag.content}</td>
          </tr>
        `).join('')}
      </tbody>
    `;
    container.appendChild(table);
    return container;
  };

  // Initialize image modal
  const imageModal = new bootstrap.Modal(document.getElementById('imageModal'));
  const modalImage = document.getElementById('modalImage');
  const prevImageBtn = document.getElementById('prevImage');
  const nextImageBtn = document.getElementById('nextImage');

  // Image navigation handlers
  const updateImageModal = (src) => {
    if (!src) return;
    // Convert relative URL to absolute URL if needed
    const absoluteUrl = src.startsWith('/') ? window.location.origin + src : src;
    modalImage.src = absoluteUrl;
    // Update navigation button states
    prevImageBtn.disabled = currentImageIndex === 0;
    nextImageBtn.disabled = currentImageIndex === currentImages.length - 1;
  };

  const handlePrevImage = () => {
    if (currentImageIndex > 0) {
      currentImageIndex--;
      updateImageModal(currentImages[currentImageIndex]);
    }
  };

  const handleNextImage = () => {
    if (currentImageIndex < currentImages.length - 1) {
      currentImageIndex++;
      updateImageModal(currentImages[currentImageIndex]);
    }
  };

  // Add event listeners for image navigation
  prevImageBtn.addEventListener('click', handlePrevImage);
  nextImageBtn.addEventListener('click', handleNextImage);

  // Reset image modal when it's hidden
  const imageModalElement = document.getElementById('imageModal');
  imageModalElement.addEventListener('hidden.bs.modal', () => {
    modalImage.src = '';
  });

  // Helper function to resolve image URL to absolute URL
  const resolveImageUrl = (url, baseUrl) => {
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      } else if (url.startsWith('//')) {
        return 'https:' + url;
      } else {
        // Handle both absolute and relative paths
        return new URL(url, baseUrl).href;
      }
    } catch (error) {
      console.error(`Error resolving URL ${url}:`, error.message);
      return null;
    }
  };

  const createImagesSection = (images) => {
    const container = document.createElement('div');
    if (!images || images.length === 0) {
      container.textContent = 'No images found';
      return container;
    }

    const baseUrl = urlInput.value.trim();
    container.className = 'row row-cols-1 row-cols-md-3 g-4';
    images.forEach((src, index) => {
      // Resolve image URL to absolute URL
      const absoluteUrl = resolveImageUrl(src, baseUrl) || src;

      const col = document.createElement('div');
      col.className = 'col';
      col.innerHTML = `
        <div class="card h-100 image-card" role="button">
          <img src="${absoluteUrl}" class="card-img-top" alt="Scraped image" 
               onerror="this.onerror=null; this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PVwiLjNlbVwiIGZpbGw9IiNhYWEiPkltYWdlPC90ZXh0Pjwvc3ZnPg=='">
          <div class="card-body">
            <p class="card-text small text-truncate">${absoluteUrl}</p>
          </div>
        </div>
      `;

      // Add click handler for image cards
      col.querySelector('.image-card').addEventListener('click', () => {
        currentImages = images.map(imgSrc => resolveImageUrl(imgSrc, baseUrl) || imgSrc);
        currentImageIndex = index;
        updateImageModal(absoluteUrl);
        imageModal.show();
      });

      container.appendChild(col);
    });
    return container;
  };

  let currentVideos = [];
  let currentVideoIndex = 0;

  // Initialize video modal
  const videoModal = new bootstrap.Modal(document.getElementById('videoModal'));
  const videoContainer = document.getElementById('videoContainer');
  const prevVideo = document.getElementById('prevVideo');
  const nextVideo = document.getElementById('nextVideo');

  // Video navigation handlers
  const updateVideoModal = (src) => {
    if (!src) return;
    videoContainer.innerHTML = `<iframe src="${src}" allowfullscreen></iframe>`;
    // Update navigation button states
    prevVideo.disabled = currentVideoIndex === 0;
    nextVideo.disabled = currentVideoIndex === currentVideos.length - 1;
  };

  const handlePrevVideo = () => {
    if (currentVideoIndex > 0) {
      currentVideoIndex--;
      updateVideoModal(currentVideos[currentVideoIndex]);
    }
  };

  const handleNextVideo = () => {
    if (currentVideoIndex < currentVideos.length - 1) {
      currentVideoIndex++;
      updateVideoModal(currentVideos[currentVideoIndex]);
    }
  };

  // Add event listeners for video navigation
  prevVideo.addEventListener('click', handlePrevVideo);
  nextVideo.addEventListener('click', handleNextVideo);

  // Reset video modal when it's hidden
  const videoModalElement = document.getElementById('videoModal');
  videoModalElement.addEventListener('hidden.bs.modal', () => {
    videoContainer.innerHTML = '';
  });

  const createVideosSection = (videos) => {
    const container = document.createElement('div');
    if (!videos || videos.length === 0) {
      container.textContent = 'No videos found';
      return container;
    }

    container.className = 'row row-cols-1 row-cols-md-2 g-4';
    videos.forEach((src, index) => {
      const col = document.createElement('div');
      col.className = 'col';
      col.innerHTML = `
        <div class="card h-100 video-card" role="button">
          <div class="ratio ratio-16x9 position-relative">
            <div class="video-thumbnail d-flex align-items-center justify-content-center">
              <i class="bi bi-play-circle-fill display-1 text-white"></i>
            </div>
          </div>
          <div class="card-body">
            <p class="card-text small text-truncate">${src}</p>
          </div>
        </div>
      `;

      // Add click handler for video cards
      col.querySelector('.video-card').addEventListener('click', () => {
        currentVideos = [...videos]; // Update currentVideos array
        currentVideoIndex = index;
        updateVideoModal(src);
        videoModal.show();
      });

      container.appendChild(col);
    });
    return container;
  };

  const createDocumentsSection = (documents) => {
    const container = document.createElement('div');
    if (!documents || documents.length === 0) {
      container.textContent = 'No documents found';
      return container;
    }

    const list = document.createElement('div');
    list.className = 'list-group';
    documents.forEach(doc => {
      const ext = doc.split('.').pop().toLowerCase();
      const icon = getDocumentIcon(ext);
      list.innerHTML += `
        <a href="${doc}" class="list-group-item list-group-item-action" target="_blank">
          <i class="bi bi-file-earmark-${icon} me-2"></i>
          ${doc}
        </a>
      `;
    });
    container.appendChild(list);
    return container;
  };

  const createSocialMediaSection = (socialLinks) => {
    const container = document.createElement('div');
    if (!socialLinks || socialLinks.length === 0) {
      container.textContent = 'No social media links found';
      return container;
    }

    const list = document.createElement('div');
    list.className = 'list-group';
    socialLinks.forEach(link => {
      const platform = link.match(/(?:https?:\/\/)?(?:www\.)?([^\/]+)/)[1].split('.')[0];
      const icon = getSocialMediaIcon(platform);
      list.innerHTML += `
        <a href="${link}" class="list-group-item list-group-item-action" target="_blank">
          <i class="bi bi-${icon} me-2"></i>
          ${link}
        </a>
      `;
    });
    container.appendChild(list);
    return container;
  };

  const createLinksSection = (links) => {
    const container = document.createElement('div');
    if (!links || links.length === 0) {
      container.textContent = 'No links found';
      return container;
    }

    const list = document.createElement('div');
    list.className = 'list-group';
    links.forEach(link => {
      list.innerHTML += `
        <a href="${link}" class="list-group-item list-group-item-action" target="_blank">
          <i class="bi bi-link-45deg me-2"></i>
          ${link}
        </a>
      `;
    });
    container.appendChild(list);
    return container;
  };

  const createContentSection = (content) => {
    const container = document.createElement('div');
    if (!content || content.length === 0) {
      container.textContent = 'No content found';
      return container;
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'content-text';

    content.forEach(item => {
      if (!item || !item.type) return;

      try {
        switch (item.type.toLowerCase()) {
          case 'heading':
            if (item.level >= 1 && item.level <= 6 && item.text) {
              const heading = document.createElement(`h${item.level}`);
              heading.innerHTML = item.text.trim();
              contentDiv.appendChild(heading);
            }
            break;

          case 'paragraph':
            if (item.text) {
              const paragraph = document.createElement('p');
              paragraph.innerHTML = item.text.trim();
              contentDiv.appendChild(paragraph);
            }
            break;

          case 'list':
            if (item.items && Array.isArray(item.items)) {
              const list = document.createElement(item.listType === 'ordered' ? 'ol' : 'ul');
              list.className = 'content-list';

              const createListItems = (items, parent) => {
                items.forEach(listItem => {
                  const li = document.createElement('li');
                  
                  if (typeof listItem === 'object' && listItem.items) {
                    // Handle nested lists
                    li.innerHTML = listItem.text.trim();
                    const nestedList = document.createElement(item.listType === 'ordered' ? 'ol' : 'ul');
                    createListItems(listItem.items, nestedList);
                    li.appendChild(nestedList);
                  } else if (typeof listItem === 'string') {
                    li.innerHTML = listItem.trim();
                  }
                  
                  parent.appendChild(li);
                });
              };

              createListItems(item.items, list);
              contentDiv.appendChild(list);
            }
            break;
        }
      } catch (error) {
        console.error('Error creating content element:', error);
      }
    });

    container.appendChild(contentDiv);
    return container;
  };

  const createContactsSection = (contacts) => {
    const container = document.createElement('div');
    if (!contacts || (contacts.emails.length === 0 && contacts.phones.length === 0 && contacts.whatsapp.length === 0)) {
      container.textContent = 'No contact information found';
      return container;
    }

    const list = document.createElement('div');
    list.className = 'list-group';

    // Add emails
    contacts.emails.forEach(email => {
      list.innerHTML += `
        <a href="mailto:${email}" class="list-group-item list-group-item-action">
          <i class="bi bi-envelope me-2"></i>
          ${email}
        </a>
      `;
    });

    // Add phone numbers
    contacts.phones.forEach(phone => {
      list.innerHTML += `
        <a href="tel:${phone}" class="list-group-item list-group-item-action">
          <i class="bi bi-telephone me-2"></i>
          ${phone}
        </a>
      `;
    });

    // Add WhatsApp links
    contacts.whatsapp.forEach(whatsapp => {
      list.innerHTML += `
        <a href="${whatsapp}" class="list-group-item list-group-item-action" target="_blank">
          <i class="bi bi-whatsapp me-2"></i>
          ${whatsapp}
        </a>
      `;
    });

    container.appendChild(list);
    return container;
  };

  // Create page accordion
  const createPageAccordion = (pageData, pageIndex) => {
    const pageAccordion = document.createElement('div');
    pageAccordion.className = 'accordion mb-3';
    pageAccordion.id = `page-${pageIndex}`;

    // Add sections based on content type
    if (pageData.meta) {
      pageAccordion.appendChild(
        createAccordionItem('Meta Tags', createMetaTagsSection(pageData.meta), `meta-${pageIndex}`, pageData.meta.length)
      );
    }

    if (pageData.images) {
      pageAccordion.appendChild(
        createAccordionItem('Images', createImagesSection(pageData.images), `images-${pageIndex}`, pageData.images.length)
      );
    }

    if (pageData.videos) {
      pageAccordion.appendChild(
        createAccordionItem('Videos', createVideosSection(pageData.videos), `videos-${pageIndex}`, pageData.videos.length)
      );
    }

    if (pageData.documents) {
      pageAccordion.appendChild(
        createAccordionItem('Documents', createDocumentsSection(pageData.documents), `documents-${pageIndex}`, pageData.documents.length)
      );
    }

    if (pageData.socialMedia) {
      pageAccordion.appendChild(
        createAccordionItem('Social Media', createSocialMediaSection(pageData.socialMedia), `social-${pageIndex}`, pageData.socialMedia.length)
      );
    }

    if (pageData.links) {
      pageAccordion.appendChild(
        createAccordionItem('Links', createLinksSection(pageData.links), `links-${pageIndex}`, pageData.links.length)
      );
    }

    if (pageData.content) {
      pageAccordion.appendChild(
        createAccordionItem('Content', createContentSection(pageData.content), `content-${pageIndex}`, 1)
      );
    }

    if (pageData.contacts) {
      const contactsCount = (pageData.contacts.emails.length + pageData.contacts.phones.length + pageData.contacts.whatsapp.length);
      pageAccordion.appendChild(
        createAccordionItem('Contacts', createContactsSection(pageData.contacts), `contacts-${pageIndex}`, contactsCount)
      );
    }

    return pageAccordion;
  };

  // Display scraped data function
  const displayScrapedData = (data) => {
    scrapedDataAccordion.innerHTML = '';
    resultCard.classList.remove('d-none');
    downloadButton.classList.remove('d-none');
    downloadButton.disabled = false;

    if (data.pages) {
      // Multiple pages data
      data.pages.forEach((pageData, index) => {
        const pageTitle = pageData.url || `Page ${index + 1}`;
        const pageId = `page-${index}`;
        const pageContent = document.createElement('div');
        pageContent.className = 'accordion';
        
        // Create the main page accordion item
        const pageAccordionItem = document.createElement('div');
        pageAccordionItem.className = 'accordion-item';
        
        // Create page header
        const pageHeader = document.createElement('h2');
        pageHeader.className = 'accordion-header';
        
        const pageButton = document.createElement('button');
        pageButton.className = 'accordion-button collapsed';
        pageButton.type = 'button';
        pageButton.setAttribute('data-bs-toggle', 'collapse');
        pageButton.setAttribute('data-bs-target', `#${pageId}`);
        pageButton.setAttribute('aria-expanded', 'false');
        pageButton.setAttribute('aria-controls', pageId);
        pageButton.textContent = pageTitle;
        
        // Create page content container
        const pageCollapseDiv = document.createElement('div');
        pageCollapseDiv.id = pageId;
        pageCollapseDiv.className = 'accordion-collapse collapse';
        
        const pageBody = document.createElement('div');
        pageBody.className = 'accordion-body';
        
        // Add nested content type accordions
        const contentAccordion = createPageAccordion(pageData, index);
        pageBody.appendChild(contentAccordion);
        
        // Assemble the page accordion
        pageHeader.appendChild(pageButton);
        pageCollapseDiv.appendChild(pageBody);
        pageAccordionItem.appendChild(pageHeader);
        pageAccordionItem.appendChild(pageCollapseDiv);
        
        scrapedDataAccordion.appendChild(pageAccordionItem);
      });
    } else {
      // Single page data
      const pageAccordion = createPageAccordion(data, 0);
      scrapedDataAccordion.appendChild(pageAccordion);
    }
  };

  // Download handler
  const downloadScrapedData = async (data) => {
    try {
      const response = await fetch('/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data,
          contentType: contentTypeSelect.value,
          scrapeScope: document.querySelector('input[name="crawlScope"]:checked').value
        }),
      }); 

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'scraped-data.zip';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      } else {
        const errorData = await response.json();
        showError(errorData.error || 'Failed to download the scraped data');
      }
    } catch (error) {
      showError('An error occurred while downloading the scraped data');
    }
  };

  // Add click handler for download button
  const handleDownload = async () => {
    downloadButton.disabled = true;
    try {
      await downloadScrapedData(window.scrapedData, contentTypeSelect.value, document.querySelector('input[name="crawlScope"]:checked').value);
    } catch (error) {
      console.error('Download error:', error);
      showError('Failed to process data. Please try again.');
    } finally {
      downloadButton.disabled = false;
    }
  };

  downloadButton.addEventListener('click', handleDownload);

  // Form submission handler
  scrapeForm.addEventListener("submit", async (e) => {
    const handleFormSubmit = async (event) => {
      event.preventDefault();
      const url = urlInput.value.trim();
      const contentType = document.querySelector('input[name="contentType"]:checked').value;
      const scrapeScope = document.querySelector('input[name="crawlScope"]:checked').value;
    
      if (!url) {
        showError('Please enter a valid URL');
        return;
      }
    
      showLoading();
    
      try {
        const response = await fetch('/scrape', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url,
            contentType: contentType === 'all' ? 'all' : contentType,
            scrapeScope
          })
        });
    
        const data = await response.json();
    
        if (response.ok) {
          displayScrapedData(data);
        } else {
          showError(data.error || 'Failed to scrape the website');
        }
      } catch (error) {
        showError('An error occurred while scraping the website');
      } finally {
        hideLoading();
      }
    };
    e.preventDefault();
    const url = urlInput.value;
    const contentType = contentTypeSelect.value;
    const scrapeScope = document.querySelector('input[name="crawlScope"]:checked').value;

    if (!url) {
      showError("Please enter a valid URL");
      return;
    }

    showLoading();

    try {
      const response = await fetch("/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          contentType,
          scrapeScope,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        window.scrapedData = data; // Store the scraped data
        displayScrapedData(data);
      } else {
        showError(data.error || "Failed to scrape the website");
      }
    } catch (error) {
      showError("An error occurred while scraping the website");
    } finally {
      hideLoading();
    }
  });
});
