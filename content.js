// Auto-fills forms on every webpage

let autoFillEnabled = true;
let filledFieldsCount = 0;

async function getStoredData() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['formfillData', 'autoFillEnabled'], (result) => {
            autoFillEnabled = result.autoFillEnabled !== false; // Default to true
            resolve(result.formfillData || {});
        });
    });
}

function getFieldCandidates(element) {
    const candidates = [];

    const attrs = ['name', 'id', 'aria-label', 'placeholder', 'data-name', 'data-field'];

    for (const attr of attrs) {
        const value = element.getAttribute(attr);
        if (value && value.trim()) {
            candidates.push(value.trim());
        }
    }

    // Also check associated label
    if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label && label.textContent) {
            candidates.push(label.textContent.trim());
        }
    }

    return candidates;
}

function isFillableInput(element) {
    const tagName = element.tagName.toLowerCase();

    if (tagName === 'textarea') return true;
    if (tagName === 'select') return true;

    if (tagName === 'input') {
        const type = (element.getAttribute('type') || 'text').toLowerCase();
        const skipTypes = ['submit', 'button', 'hidden', 'image', 'reset', 'file'];
        return !skipTypes.includes(type);
    }

    return false;
}

function fillField(element, value) {
    if (!element || !value) return false;

    try {
        // Don't overwrite existing values (unless default/empty/zero)
        if (element.value && element.value.trim() !== '' && element.value !== '0' && element.value !== '-1') {
            return false;
        }

        const tagName = element.tagName.toLowerCase();

        if (tagName === 'select') {
            // FUZZY MATCHING FOR DROPDOWNS
            const userValueRaw = String(value).toLowerCase().trim();
            let bestOption = null;

            for (const option of element.options) {
                const optValue = option.value.toLowerCase();
                const optText = option.text.toLowerCase();

                // 1. Exact Match (Value or Text)
                if (optValue === userValueRaw || optText === userValueRaw) {
                    bestOption = option;
                    break;
                }

                // 2. Contains Match (e.g. "+91" inside "India (+91)")
                if (userValueRaw.length > 1 && (optText.includes(userValueRaw) || optValue.includes(userValueRaw))) {
                    bestOption = option;
                    if (optText.startsWith(userValueRaw)) { // Prefer prefix match
                        element.value = option.value;
                        element.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    }
                }

                // 3. Smart Country Code Match (User: "+91", Option: "India (+91)")
                if (userValueRaw.startsWith('+') || /^\d+$/.test(userValueRaw)) {
                    // Check if option text contains the number (e.g. "91") enclosed in brackets or similar
                    if (optText.includes(userValueRaw) || optText.includes(`(${userValueRaw.replace('+', '')})`)) {
                        bestOption = option;
                    }
                }
            }

            if (bestOption) {
                element.value = bestOption.value;
                element.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }

        } else {
            element.value = value;
            // Trigger events for form validation
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('blur', { bubbles: true }));
            return true;
        }
    } catch (error) {
        console.error('FormFill: Error filling field', error);
    }

    return false;
}

// Detect and fill all forms on the page
async function detectAndFillForms() {
    if (!autoFillEnabled) {
        console.log('FormFill: Auto-fill is disabled');
        return;
    }

    const storedData = await getStoredData();

    if (Object.keys(storedData).length === 0) {
        console.log('FormFill: No data stored');
        return;
    }

    console.log('FormFill: Scanning page for forms...');

    const matcher = new FieldMatcher(storedData);
    const fillableElements = document.querySelectorAll('input, textarea, select');

    let fieldsFound = 0;
    let fieldsFilled = 0;
    const fillResults = [];

    for (const element of fillableElements) {
        if (!isFillableInput(element)) continue;

        fieldsFound++;

        const candidates = getFieldCandidates(element);
        if (candidates.length === 0) continue;

        const primaryCandidate = candidates[0];
        const match = matcher.findMatch(primaryCandidate, candidates.slice(1));

        if (match) {
            const value = matcher.getValue(match.storedKey);
            const filled = fillField(element, value);

            if (filled) {
                fieldsFilled++;
                fillResults.push({
                    field: primaryCandidate,
                    matchedKey: match.storedKey,
                    value: value,
                    confidence: match.confidence,
                    matchType: match.matchType
                });

                // Visual feedback: green outline for 2 seconds
                element.style.outline = '2px solid #4CAF50';
                setTimeout(() => {
                    element.style.outline = '';
                }, 2000);
            }
        }
    }

    if (fieldsFilled > 0) {
        console.log(`FormFill: Filled ${fieldsFilled}/${fieldsFound} fields`);
        console.table(fillResults);

        // Show notification
        showNotification(fieldsFilled, fieldsFound);

        filledFieldsCount = fieldsFilled;

        // Send message to popup
        chrome.runtime.sendMessage({
            type: 'FORM_FILLED',
            count: fieldsFilled,
            total: fieldsFound,
            results: fillResults
        });
    } else {
        console.log(`FormFill: No matching fields found (scanned ${fieldsFound} fields). Raw elements: ${fillableElements.length}`);
    }
}

// Show notification to user
function showNotification(filled, total) {
    if (filled === 0) return;

    const notification = document.createElement('div');
    notification.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 999999;
      font-family: Arial, sans-serif;
      font-size: 14px;
      animation: slideIn 0.3s ease-out;
    ">
      <strong>✓ FormFill</strong><br>
      Filled ${filled} of ${total} fields
    </div>
    <style>
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    </style>
  `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.transition = 'opacity 0.3s';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FILL_FORM') {
        detectAndFillForms();
        sendResponse({ success: true });
    } else if (message.type === 'GET_STATUS') {
        sendResponse({
            enabled: autoFillEnabled,
            filledCount: filledFieldsCount
        });
    }

    return true;
});

// INITIALIZATION LOGIC
let debounceTimer = null;

function scheduleFill() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        detectAndFillForms();
    }, 1000);
}

// 1. Page Load + Retries for SPAs
window.addEventListener('load', () => {
    scheduleFill();
    setTimeout(scheduleFill, 3000); // Retry at 3s
    setTimeout(scheduleFill, 6000); // Retry at 6s
});

// 2. DOM Observer (Aggressive check for inputs)
const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) { // Element node
                    const tagName = node.tagName;
                    // Check for inputs directly OR containers
                    if (tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA' ||
                        tagName === 'FORM' || tagName === 'DIV' || tagName === 'SECTION') {
                        shouldScan = true;
                        break;
                    }
                }
            }
        }
        if (shouldScan) break;
    }

    if (shouldScan) {
        scheduleFill();
    }
});

// Start observing
observer.observe(document.body, {
    childList: true,
    subtree: true
});

console.log('FormFill: Extension loaded and ready');
