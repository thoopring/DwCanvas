let canvasItems = [];

document.addEventListener('DOMContentLoaded', async () => {
  const list = document.getElementById('canvas-list');
  const btnCapture = document.getElementById('btn-capture');
  const btnTimestamp = document.getElementById('btn-timestamp');
  const btnReset = document.getElementById('btn-reset');
  const btnPdf = document.getElementById('btn-pdf');
  const btnAi = document.getElementById('btn-ai');

  try {
    await loadItems();
  } catch (e) { console.error("Load Failed:", e); }

  // 1. Clean Shot
  if (btnCapture) {
    btnCapture.addEventListener('click', async () => {
      try {
        if (!await isWatchPage()) {
          alert("⚠️ Please open a YouTube video page.");
          return;
        }
        
        btnCapture.disabled = true;
        const originalText = btnCapture.innerText;
        btnCapture.innerText = "📸...";

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        chrome.tabs.sendMessage(tab.id, { action: "CAPTURE_VIDEO" }, (response) => {
          btnCapture.disabled = false;
          btnCapture.innerText = originalText;

          if (chrome.runtime.lastError) {
            alert("Connection lost. Please refresh the YouTube page (F5).");
            return;
          }

          if (response && response.status === "success") {
            const newItem = { 
              id: Date.now(), 
              type: 'image', 
              data: response.dataUrl, 
              title: response.title, 
              text: '' 
            };
            saveItem(newItem);
          } else {
            alert("Capture failed: " + (response ? response.message : "Unknown error"));
          }
        });
      } catch (err) {
        console.error(err);
        btnCapture.disabled = false;
        alert("Error: " + err.message);
      }
    });
  }

  // 2. Timestamp
  if (btnTimestamp) {
    btnTimestamp.addEventListener('click', async () => {
      try {
        if (!await isWatchPage()) {
          alert("⚠️ Only works on YouTube video pages.");
          return;
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.tabs.sendMessage(tab.id, { action: "GET_TIME" }, (res) => {
          if (chrome.runtime.lastError) return;
          if (res) {
            const newItem = { id: Date.now(), type: 'time', data: res, text: '' };
            saveItem(newItem);
          }
        });
      } catch (e) { console.error(e); }
    });
  }

  // 3. List Actions (Copy, Save, Delete)
  if (list) {
    list.addEventListener('click', async (e) => {
      const target = e.target.closest('button');
      if (!target) return;

      const card = target.closest('.card');
      if (!card) return;

      const id = parseInt(card.dataset.id);
      const item = canvasItems.find(i => i.id === id);
      if (!item) return;

      // Delete
      if (target.classList.contains('btn-delete')) {
        canvasItems = canvasItems.filter(i => i.id !== id);
        chrome.storage.local.set({ 'dw_items': canvasItems });
        renderList();
      }

      // Copy (Bug Fixed with PNG conversion)
      if (target.classList.contains('btn-copy')) {
        const originalIcon = target.innerText;
        target.innerText = "⏳";
        
        try {
          if (item.type === 'image') {
            // [해결책] 이미지를 PNG로 변환하여 복사 (가장 안정적)
            await copyImageToClipboard(item.data);
          } else {
            // 텍스트 복사
            const textToCopy = `📌 [${item.data.time}] ${item.data.title}\n🔗 ${item.data.url}`;
            await navigator.clipboard.writeText(textToCopy);
          }
          target.innerText = "✅";
        } catch (err) {
          console.error("Copy failed:", err);
          alert("Copy failed. Try saving the file instead.");
          target.innerText = "❌";
        }
        setTimeout(() => target.innerText = originalIcon, 1500);
      }

      // Save
      if (target.classList.contains('btn-save')) {
        const link = document.createElement('a');
        link.href = item.data;
        const safeTitle = (item.data.title || "capture").replace(/[^a-z0-9]/gi, '_').substring(0, 20);
        link.download = `dw_${safeTitle}_${item.id}.jpg`;
        link.click();
      }
    });

    list.addEventListener('input', (e) => {
      if (e.target.tagName === 'TEXTAREA') {
        const card = e.target.closest('.card');
        const id = parseInt(card.dataset.id);
        const item = canvasItems.find(i => i.id === id);
        if (item) {
          item.text = e.target.value;
          chrome.storage.local.set({ 'dw_items': canvasItems });
        }
      }
    });
  }

  // 4. Reset
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (confirm("Delete all items?")) {
        canvasItems = [];
        chrome.storage.local.set({ 'dw_items': [] });
        renderList();
      }
    });
  }

  // 5. AI Prompt
  if (btnAi) {
    btnAi.addEventListener('click', () => {
      if (canvasItems.length === 0) {
        alert("No items to process.");
        return;
      }
      
      const originalText = btnAi.innerText;
      
      const sortedItems = [...canvasItems].reverse();
      let prompt = "I have collected key moments from a video.\n";
      prompt += "Please Create a LinkedIn Carousel Post based on these:\n\n";

      sortedItems.forEach((item, idx) => {
        prompt += `[Slide ${idx + 1}]\n`;
        if (item.type === 'image') {
          prompt += `Image: ${item.data.title || 'Scene Capture'}\n`;
        } else {
          prompt += `Timestamp: ${item.data.time} (${item.data.title})\nLink: ${item.data.url}\n`;
        }
        if (item.text) prompt += `My Note: ${item.text}\n`;
        prompt += `\n`;
      });

      prompt += `[Instructions]\n1. Strong Hook for Slide 1.\n2. One key insight per slide.\n3. Engaging CTA at the end.`;

      navigator.clipboard.writeText(prompt).then(() => {
        btnAi.innerText = "✅ Copied!";
        setTimeout(() => {
            btnAi.innerText = originalText;
        }, 2000);
      });
    });
  }

  // 6. PDF Export
  if (btnPdf) {
    btnPdf.addEventListener('click', () => {
      if (canvasItems.length === 0) {
        alert("No items to export.");
        return;
      }
      createPrintView();
    });
  }

  // --- Helper Functions ---

  // [핵심 해결 함수] 이미지를 캔버스에 그려서 PNG Blob으로 변환 후 복사
  async function copyImageToClipboard(dataUrl) {
    // 1. 이미지를 로드
    const img = new Image();
    img.src = dataUrl;
    await new Promise(resolve => { img.onload = resolve; });

    // 2. 캔버스 생성 및 그리기
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // 3. PNG Blob으로 변환 (브라우저는 PNG를 좋아함)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

    // 4. 강제 포커스 (사이드패널이 포커스를 잃으면 복사가 안됨)
    window.focus();

    // 5. 클립보드에 쓰기
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);
  }

  async function isWatchPage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab && tab.url && tab.url.includes("youtube.com/watch");
  }

  function saveItem(item) {
    canvasItems.unshift(item);
    chrome.storage.local.set({ 'dw_items': canvasItems });
    renderList();
  }

  async function loadItems() {
    const result = await chrome.storage.local.get(['dw_items']);
    canvasItems = result.dw_items || [];
    renderList();
  }

  function renderList() {
    if (!list) return;
    list.innerHTML = '';
    
    if (canvasItems.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>Capture key moments<br>from the video.</p></div>';
      return;
    }

    canvasItems.forEach(item => {
      const div = document.createElement('div');
      div.className = 'card';
      div.dataset.id = item.id;
      
      let mediaContent = '';
      let actionButtons = '';
      let titleDisplay = item.data.title || (item.title ? item.title : "Video");

      if (item.type === 'image') {
        mediaContent = `<img src="${item.data}">`;
        actionButtons = `
          <button class="icon-btn btn-copy" title="Copy Image">📋</button>
          <button class="icon-btn btn-save" title="Save File">💾</button>
        `;
      } else {
        mediaContent = `
          <div style="font-size:12px; font-weight:bold; color:#333; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${titleDisplay}
          </div>
          <div class="card-header" style="margin-bottom:0;">
            <span class="timestamp-badge">▶ ${item.data.time}</span>
          </div>`;
        actionButtons = `
          <button class="icon-btn btn-copy" title="Copy Link">🔗</button>
        `;
      }

      div.innerHTML = `
        <div class="card-header">
          <span style="font-size:11px; color:#888;">${item.type === 'image' ? 'Image' : 'Time'}</span>
          <div class="card-actions">
            ${actionButtons}
            <button class="icon-btn btn-delete" title="Delete">✕</button>
          </div>
        </div>
        ${mediaContent}
        <textarea placeholder="Add a note...">${item.text || ''}</textarea>
      `;
      list.appendChild(div);
    });
  }

  function createPrintView() {
    const sortedItems = [...canvasItems].reverse();
    const printWindow = window.open('', '_blank');
    
    let htmlContent = `
      <html>
      <head>
        <title>CleanShot Report</title>
        <style>
          body { font-family: sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          h1 { color: #0a66c2; border-bottom: 2px solid #eee; padding-bottom: 10px; }
          .item { margin-bottom: 30px; page-break-inside: avoid; border: 1px solid #eee; padding: 20px; border-radius: 8px; }
          img { max-width: 100%; border: 1px solid #ddd; border-radius: 4px; }
          .meta { color: #666; font-size: 14px; margin-bottom: 10px; }
          .note { background: #f9f9f9; padding: 10px; border-left: 4px solid #0a66c2; margin-top: 10px; }
          .link { color: #0a66c2; text-decoration: none; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 20px; text-align:right;">
           <small>Press Ctrl+P / Cmd+P to save as PDF</small>
        </div>
        <h1>CleanShot Report</h1>
    `;

    sortedItems.forEach((item, idx) => {
      htmlContent += `<div class="item">`;
      if (item.type === 'image') {
        const title = item.data.title || '';
        htmlContent += `<div class="meta">#${idx + 1} Image Capture | ${title}</div>`;
        htmlContent += `<img src="${item.data}">`;
      } else {
        htmlContent += `<div class="meta">#${idx + 1} Timestamp | ${item.data.time}</div>`;
        htmlContent += `<h3><a href="${item.data.url}" class="link" target="_blank">▶ Watch: ${item.data.title} (${item.data.time})</a></h3>`;
      }
      if (item.text) {
        const safeText = item.text.replace(/\n/g, '<br>');
        htmlContent += `<div class="note"><strong>Insight:</strong> ${safeText}</div>`;
      }
      htmlContent += `</div>`;
    });

    htmlContent += `<script>window.onload = function() { window.print(); }</script>`;
    htmlContent += `</body></html>`;
    
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
});