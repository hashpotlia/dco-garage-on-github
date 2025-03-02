// fetchUpdates.js
let updatesData = []; // Store the fetched updates data globally
let systemInfo = { current_version: 'Unknown', maintenance_tag: 'None' }; // Store system info

async function fetchUpdates() {
    try {
        // Fetch system info (current version and maintenance tag)
        const systemInfoResponse = await fetch('https://dco-garage.vercel.app/api/system_info');
        const systemInfoData = await systemInfoResponse.json();
        systemInfo = systemInfoData;

        // Update the version and maintenance tag in the UI
        const versionElement = document.getElementById('current-version');
        const maintenanceTagElement = document.getElementById('maintenance-tag');
        if (versionElement) versionElement.textContent = `[${systemInfo.current_version}]`;
        if (maintenanceTagElement) maintenanceTagElement.textContent = `[${systemInfo.maintenance_tag}]`;

        // Fetch updates
        const updatesResponse = await fetch('https://dco-garage.vercel.app/api/updates');
        const updatesDataResponse = await updatesResponse.json();
        updatesData = updatesDataResponse.updates; // Store updates data
        renderUpdates(); // Render updates
    } catch (error) {
        console.error('Error fetching updates or system info:', error);
    }
}

function renderUpdates() {
    const container = document.getElementById('updates-list');
    if (!container) return;

    // Sort updates by date (newest to oldest)
    updatesData.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Render updates
    container.innerHTML = '';
    updatesData.forEach((update, index) => {
        // Skip the announcement entry (it’s handled as a fixed section in HTML)
        if (update.category === 'Announcement') return;

        const updateDiv = document.createElement('div');
        updateDiv.className = 'update-entry';
        updateDiv.innerHTML = `
            <div class="update-header">
                <h2>${update.title}</h2>
                <span class="update-version">[${update.version}]</span>
                <span class="update-date"> (${update.date})</span>
                <button class="toggle-btn" onclick="toggleUpdate(${index})">Release Notes ▼</button>
            </div>
            <div id="update-content-${index}" class="update-content" style="display: none;">
                <p>${update.description}</p>
            </div>
        `;
        container.appendChild(updateDiv);
    });
}

window.toggleUpdate = function(index) {
    const content = document.getElementById(`update-content-${index}`);
    const button = content.previousElementSibling.querySelector('.toggle-btn');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        button.innerHTML = 'Release Notes ▲';
    } else {
        content.style.display = 'none';
        button.innerHTML = 'Release Notes ▼';
    }
};

// Load updates on page load
document.addEventListener('DOMContentLoaded', fetchUpdates);