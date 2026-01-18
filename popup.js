// Popup UI logic for managing stored data

let storedData = {};

async function loadData() {
    const result = await chrome.storage.local.get(['formfillData', 'autoFillEnabled']);
    storedData = result.formfillData || {};
    const autoFillEnabled = result.autoFillEnabled !== false;

    document.getElementById('autoFillToggle').checked = autoFillEnabled;
    displayData();
    updateStatus();
}

function displayData() {
    const dataList = document.getElementById('dataList');

    if (Object.keys(storedData).length === 0) {
        dataList.innerHTML = '<div class="empty-state">No data stored yet</div>';
        return;
    }

    dataList.innerHTML = '';

    for (const [key, value] of Object.entries(storedData)) {
        const item = document.createElement('div');
        item.className = 'data-item';

        const displayValue = value.length > 30 ? value.substring(0, 27) + '...' : value;

        item.innerHTML = `
      <span class="data-key">${key}</span>
      <span class="data-value" title="${value.replace(/"/g, '&quot;')}">${displayValue}</span>
      <span class="data-copy" data-key="${key}" title="Copy value">❐</span>
      <span class="data-delete" data-key="${key}" title="Delete">×</span>
    `;

        dataList.appendChild(item);
    }

    document.querySelectorAll('.data-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            deleteData(btn.getAttribute('data-key'));
        });
    });

    document.querySelectorAll('.data-copy').forEach(btn => {
        btn.addEventListener('click', async () => {
            const key = btn.getAttribute('data-key');
            const value = storedData[key];
            if (value) {
                try {
                    await navigator.clipboard.writeText(value);
                    // Visual feedback
                    const originalText = btn.textContent;
                    btn.textContent = '✓';
                    btn.style.color = '#28a745';
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.color = '';
                    }, 1500);
                } catch (err) {
                    console.error('Failed to copy', err);
                }
            }
        });
    });
}

function updateStatus() {
    const status = document.getElementById('status');
    const autoFillEnabled = document.getElementById('autoFillToggle').checked;
    const dataCount = Object.keys(storedData).length;

    if (!autoFillEnabled) {
        status.textContent = '⏸️ Auto-fill is disabled';
        status.className = 'status inactive';
    } else if (dataCount === 0) {
        status.textContent = '⚠️ No data stored - add your information below';
        status.className = 'status inactive';
    } else {
        status.textContent = `✓ Ready to fill ${dataCount} fields`;
        status.className = 'status';
    }
}

async function addData() {
    const keyInput = document.getElementById('newKey');
    const valueInput = document.getElementById('newValue');

    const key = keyInput.value.trim();
    const value = valueInput.value.trim();

    if (!key || !value) {
        alert('Please enter both key and value');
        return;
    }

    storedData[key] = value;
    await chrome.storage.local.set({ formfillData: storedData });

    keyInput.value = '';
    valueInput.value = '';

    displayData();
    updateStatus();

    const status = document.getElementById('status');
    const originalText = status.textContent;
    status.textContent = `✓ Added: ${key}`;
    setTimeout(() => {
        updateStatus();
    }, 2000);
}

async function deleteData(key) {
    if (confirm(`Delete "${key}"?`)) {
        delete storedData[key];
        await chrome.storage.local.set({ formfillData: storedData });
        displayData();
        updateStatus();
    }
}

async function clearAll() {
    if (confirm('Clear ALL data? This cannot be undone.')) {
        storedData = {};
        await chrome.storage.local.set({ formfillData: {} });
        displayData();
        updateStatus();
    }
}

async function toggleAutoFill() {
    const enabled = document.getElementById('autoFillToggle').checked;
    await chrome.storage.local.set({ autoFillEnabled: enabled });
    updateStatus();
}

async function fillNow() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.tabs.sendMessage(tab.id, { type: 'FILL_FORM' }, (response) => {
        if (chrome.runtime.lastError) {
            alert('Cannot fill form on this page. Try reloading the page.');
        } else {
            const status = document.getElementById('status');
            status.textContent = '✓ Filling form...';
            setTimeout(() => updateStatus(), 2000);
        }
    });
}

document.getElementById('addDataBtn').addEventListener('click', addData);
document.getElementById('clearAllBtn').addEventListener('click', clearAll);
document.getElementById('autoFillToggle').addEventListener('change', toggleAutoFill);
document.getElementById('fillNowBtn').addEventListener('click', fillNow);

document.getElementById('newValue').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addData();
    }
});

loadData();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FORM_FILLED') {
        const status = document.getElementById('status');
        status.textContent = `✓ Filled ${message.count} fields!`;
        status.className = 'status';

        setTimeout(() => updateStatus(), 3000);
    }
});
