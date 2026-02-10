// 아이콘 클릭 시 사이드패널 열기
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'openSidePanel',
    title: 'Open Dw Canvas',
    contexts: ['all']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'openSidePanel') {
    // 툴바 아이콘을 클릭한 것과 동일한 효과를 줍니다
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});