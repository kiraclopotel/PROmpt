// Content script for PromptRefiner
// Enables the extension to interact with page content (text selection, textarea content)
// The actual logic runs in popup.js via chrome.scripting.executeScript

// Listen for messages from the extension popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getSelection') {
    sendResponse({ text: window.getSelection().toString() });
  }
  if (msg.action === 'getTextarea') {
    const el = document.activeElement;
    if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) {
      sendResponse({ text: el.isContentEditable ? el.innerText : el.value });
    } else {
      sendResponse({ text: null });
    }
  }
  if (msg.action === 'replaceText') {
    const el = document.activeElement;
    if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
      el.value = msg.text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      sendResponse({ ok: true });
    } else if (el && el.isContentEditable) {
      el.innerText = msg.text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false });
    }
  }
  return true; // keep channel open for async
});
