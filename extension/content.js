chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // 1. Clean Capture
  if (request.action === "CAPTURE_VIDEO") {
    try {
      const video = document.querySelector('video');
      if (!video) {
        sendResponse({ status: "error", message: "No video found." });
        return;
      }
      
      const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer') || document.querySelector('#title h1'); 
      const videoTitle = titleElement ? titleElement.innerText.trim() : "YouTube Video";

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        sendResponse({ status: "success", dataUrl: dataUrl, title: videoTitle });
      } catch (e) {
        sendResponse({ status: "error", message: "Security Error (CORS). Try reloading." });
      }
    } catch (err) {
      sendResponse({ status: "error", message: err.message });
    }
    return true; 
  }

  // 2. Timestamp
  if (request.action === "GET_TIME") {
    const video = document.querySelector('video');
    const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer') || document.querySelector('#title h1');
    const videoTitle = titleElement ? titleElement.innerText.trim() : "YouTube Video";

    const time = video ? Math.floor(video.currentTime) : 0;
    const url = new URL(window.location.href);
    url.searchParams.set('t', time + 's');
    
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    const timeStr = `${min}:${sec < 10 ? '0' + sec : sec}`;
    
    sendResponse({ 
      title: videoTitle,
      time: timeStr, 
      url: url.toString() 
    });
  }
});