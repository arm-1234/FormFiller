// Background service worker
chrome.runtime.onInstalled.addListener(() => {
    console.log('FormFill Extension installed');

    chrome.storage.local.set({ autoFillEnabled: true });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FORM_FILLED') {
        chrome.action.setBadgeText({
            text: message.count.toString(),
            tabId: sender.tab.id
        });

        chrome.action.setBadgeBackgroundColor({
            color: '#4CAF50',
            tabId: sender.tab.id
        });

        setTimeout(() => {
            // Check if tab exists before clearing badge to avoid "No tab with id" errors
            if (sender?.tab?.id) {
                chrome.tabs.get(sender.tab.id, () => {
                    if (!chrome.runtime.lastError) {
                        chrome.action.setBadgeText({
                            text: '',
                            tabId: sender.tab.id
                        });
                    }
                });
            }
        }, 5000);
    }

    return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        chrome.action.setBadgeText({ text: '', tabId: tabId });
    }
});
