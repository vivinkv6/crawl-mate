// Function to handle the download process
async function handleDownload(data, contentType, scrapeScope) {
    let originalButtonText = '';
    let downloadButton = document.querySelector('#downloadButton');
    let scrapeButton = document.querySelector('#scrapeButton');
    const notificationSystem = new NotificationSystem();

    // Show initial download notification
    notificationSystem.info('Starting download process...', 3000);

    const updateButtonState = (state) => {
        downloadButton = document.querySelector('#downloadButton');
        scrapeButton = document.querySelector('#scrapeButton');
        
        if (!downloadButton) return;
    
        switch (state) {
            case 'downloading':
                downloadButton.disabled = true;
                downloadButton.classList.remove('d-none');
                downloadButton.innerHTML = '<i class="bi bi-hourglass-split"></i> Downloading...';
                if (scrapeButton) {
                    scrapeButton.disabled = true;
                }
                notificationSystem.info('Downloading scraped data...', 4000);
                break;
            case 'processing':
                downloadButton.disabled = true;
                downloadButton.classList.remove('d-none');
                downloadButton.innerHTML = '<i class="bi bi-cloud-download"></i> Processing...';
                if (scrapeButton) {
                    scrapeButton.disabled = true;
                }
                notificationSystem.info('Processing your download...', 3000);
                break;
            case 'success':
                downloadButton.disabled = false;
                downloadButton.classList.remove('d-none');
                downloadButton.innerHTML = '<i class="bi bi-check-circle"></i> Downloaded!';
                if (scrapeButton) {
                    scrapeButton.disabled = false;
                }
                notificationSystem.success('Download completed successfully!', 3000);
                break;
            case 'error':
                downloadButton.disabled = false;
                downloadButton.classList.remove('d-none');
                downloadButton.innerHTML = originalButtonText || '<i class="bi bi-download"></i> Download';
                if (scrapeButton) {
                    scrapeButton.disabled = false;
                }
                notificationSystem.error('An error occurred during download.');
                break;
            default:
                downloadButton.disabled = false;
                downloadButton.classList.remove('d-none');
                downloadButton.innerHTML = originalButtonText || '<i class="bi bi-download"></i> Download';
                if (scrapeButton) {
                    scrapeButton.disabled = false;
                }
        }
    };

    try {
        if (downloadButton) {
            originalButtonText = downloadButton.innerHTML;
            updateButtonState('downloading');
            downloadButton.classList.remove('d-none');
        }

        if (scrapeButton) {
            scrapeButton.disabled = true;
        }

        const response = await fetch('/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data, contentType, scrapeScope })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const responseContentType = response.headers.get('content-type');

        if (responseContentType && responseContentType.includes('application/json')) {
            const result = await response.json();
            if (result.type === 'error') {
                throw new Error(result.error);
            }
        } else {
            updateButtonState('processing');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'scraped_data.zip';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            updateButtonState('success');
            setTimeout(() => {
                updateButtonState('default');
            }, 2000);
        }

    } catch (error) {
        console.error('Download error:', error);
        notificationSystem.error('Failed to process data. Please try again.', 5000);
        updateButtonState('error');
        if (scrapeButton) {
            scrapeButton.disabled = false;
        }
    } finally {
        downloadButton = document.querySelector('#downloadButton');
        scrapeButton = document.querySelector('#scrapeButton');

        if (scrapeButton) {
            scrapeButton.disabled = false;
        }
    }
}

// Function to update progress UI
function updateProgress(data, container) {
    const progressBar = container.querySelector('.progress');
    const progressText = container.querySelector('.progress-text');
    const currentImage = container.querySelector('.current-image');
    const notificationSystem = new NotificationSystem();

    switch (data.type) {
        case 'progress':
            const percent = Math.round((data.downloaded / data.total) * 100);
            progressBar.style.width = `${percent}%`;
            progressText.textContent = `Downloading images: ${percent}%`;
            currentImage.textContent = `Current: ${data.currentImage}`;
            break;

        case 'error':
            notificationSystem.error(`Error downloading ${data.url}: ${data.error}`);
            break;

        case 'complete':
            progressText.textContent = data.message;
            notificationSystem.success('All images downloaded successfully!');
            setTimeout(() => {
                container.remove();
            }, 3000);
            break;
    }
}

// Function to show error messages
function showError(message) {
    const notificationSystem = new NotificationSystem();
    notificationSystem.error(message, 5000);
}