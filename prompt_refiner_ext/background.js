// Context menu: right-click selected text → Refine
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'refine-selection',
    title: 'Refine with PromptRefiner',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'refine-selection' && info.selectionText) {
    // Store the selected text so popup can grab it
    chrome.storage.local.set({ pendingText: info.selectionText.trim() });
    // Open popup (can't programmatically open popup, so we open as a new small window)
    chrome.windows.create({
      url: chrome.runtime.getURL('popup.html') + '?fromContext=1',
      type: 'popup',
      width: 440,
      height: 620,
      focused: true
    });
  }
});
