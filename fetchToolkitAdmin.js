// fetchToolkitAdmin.js
let editingToolkitId = null; // Track the ID of the entry being edited
let toolkitData = []; // Store the fetched data globally for searching

async function fetchToolkitAdmin() {
    try {
        const response = await fetch('https://dco-garage.vercel.app/api/toolkit');
        const data = await response.json();
        toolkitData = data.toolkit; // Store data for searching
        renderToolkitEntries(toolkitData); // Initial render
    } catch (error) {
        console.error('Error fetching toolkit entries:', error);
    }
}

function renderToolkitEntries(entries) {
    const container = document.getElementById('toolkit-list');
    if (!container) return;
    container.innerHTML = '';
    entries.forEach((entry, index) => {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'toolkit-entry';
        entryDiv.innerHTML = `
            <div class="toolkit-details"><span class="label-bold">Name: </span>${entry.details}</div>
            <div class="toolkit-category"><span class="label-bold">Category: </span>${entry.category}</div>
            <div class="toolkit-description"><span class="label-bold">Description: </span>${entry.description || 'No description available'}</div>
            <button class="toggle-btn" onclick="toggleAdminCommands(${index})">Commands ▼</button>
            <div id="commands-${index}" class="commands-content" style="display: none;">
                <pre><code class="language-bash">${entry.commands}</code></pre>
                <button class="copy-btn" data-command="${encodeURIComponent(entry.commands)}" onclick="copyToClipboard(this, ${index})">Copy</button>
                <span id="copy-status-${index}" class="copy-status"></span>
            </div>
            <div class="action-buttons">
                <button class="edit-button" onclick="editToolkit('${entry.id}')">Edit</button>
                <button class="delete-button" onclick="deleteToolkit('${entry.id}')">Delete</button>
            </div>
        `;
        container.appendChild(entryDiv);
    });

    // Apply syntax highlighting to all code blocks
    hljs.highlightAll();
}

window.searchToolkit = function() {
    const input = document.getElementById('toolkitSearch').value.toUpperCase();
    const filteredData = toolkitData.filter(entry => {
        const details = entry.details.toUpperCase();
        const category = entry.category.toUpperCase();
        const description = (entry.description || '').toUpperCase();
        const commands = entry.commands.toUpperCase();
        return details.includes(input) || category.includes(input) || description.includes(input) || commands.includes(input);
    });
    renderToolkitEntries(filteredData);
};

window.toggleAdminCommands = function(index) {
    const content = document.getElementById(`commands-${index}`);
    const arrow = content.previousElementSibling;
    if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.innerHTML = arrow.innerHTML.replace('▼', '▲');
    } else {
        content.style.display = 'none';
        arrow.innerHTML = arrow.innerHTML.replace('▲', '▼');
    }
};

window.copyToClipboard = function(button, index) {
    const text = decodeURIComponent(button.getAttribute('data-command'));
    const statusElement = document.getElementById(`copy-status-${index}`);
    try {
        navigator.clipboard.writeText(text).then(() => {
            statusElement.textContent = 'Copied!';
            setTimeout(() => { statusElement.textContent = ''; }, 2000);
        }).catch(err => {
            console.error('Clipboard API failed:', err);
            fallbackCopyToClipboard(text, statusElement);
        });
    } catch (err) {
        console.error('Error accessing clipboard:', err);
        fallbackCopyToClipboard(text, statusElement);
    }
};

window.fallbackCopyToClipboard = function(text, statusElement) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        statusElement.textContent = 'Copied!';
        setTimeout(() => { statusElement.textContent = ''; }, 2000);
    } catch (err) {
        console.error('Fallback copy failed:', err);
        statusElement.textContent = 'Copy failed!';
    } finally {
        document.body.removeChild(textarea);
    }
};

window.openToolkitModal = function(id = null) {
    console.log('openToolkitModal called with id:', id); // Debugging log
    editingToolkitId = id;
    const modal = document.getElementById('toolkit-modal');
    const nameInput = document.getElementById('toolkit-name');
    const categoryInput = document.getElementById('toolkit-category');
    const descriptionInput = document.getElementById('toolkit-description');
    const commandsInput = document.getElementById('toolkit-commands');

    if (!modal) {
        console.error('Toolkit modal not found!');
        return;
    }

    if (id) {
        // Edit mode: populate fields with existing data
        fetch(`https://dco-garage.vercel.app/api/toolkit?id=${id}`)
            .then(response => response.json())
            .then(data => {
                const entry = data.toolkit.find(item => item.id === id);
                if (entry) {
                    nameInput.value = entry.details;
                    categoryInput.value = entry.category;
                    descriptionInput.value = entry.description || '';
                    commandsInput.value = entry.commands;
                }
            })
            .catch(error => {
                console.error('Error fetching toolkit entry for edit:', error);
            });
    } else {
        // Add mode: clear fields
        nameInput.value = '';
        categoryInput.value = '';
        descriptionInput.value = '';
        commandsInput.value = '';
    }

    modal.style.display = 'flex';
    console.log('Modal display set to flex'); // Debugging log
};

window.closeToolkitModal = function() {
    console.log('closeToolkitModal called'); // Debugging log
    const modal = document.getElementById('toolkit-modal');
    modal.style.display = 'none';
    editingToolkitId = null;
};

window.saveToolkit = async function() {
    console.log('saveToolkit called'); // Debugging log
    const name = document.getElementById('toolkit-name').value.trim();
    const category = document.getElementById('toolkit-category').value.trim();
    const description = document.getElementById('toolkit-description').value.trim();
    const commands = document.getElementById('toolkit-commands').value.trim();

    // Validation
    if (!name || !category || !commands) {
        alert('Name, Category, and Commands are required fields!');
        return;
    }

    const apiUrl = 'https://dco-garage.vercel.app/api/toolkit';
    const payload = { category, details: name, description: description || null, commands };
    console.log('Payload being sent to API:', payload); // Debugging log

    try {
        if (editingToolkitId) {
            // Edit existing entry
            const response = await fetch(`${apiUrl}?id=${editingToolkitId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error('Failed to update toolkit entry');
            alert('Toolkit entry updated successfully!');
        } else {
            // Add new entry
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error('Failed to add toolkit entry');
            alert('Toolkit entry added successfully!');
        }

        closeToolkitModal();
        fetchToolkitAdmin(); // Refresh the table
    } catch (error) {
        console.error('Error saving toolkit entry:', error);
        alert('Failed to save toolkit entry. Please try again.');
    }
};

window.editToolkit = async function(id) {
    console.log('editToolkit called with id:', id); // Debugging log
    openToolkitModal(id);
};

window.deleteToolkit = async function(id) {
    console.log('deleteToolkit called with id:', id); // Debugging log
    if (!confirm('Are you sure you want to delete this toolkit entry?')) return;
    try {
        await fetch(`https://dco-garage.vercel.app/api/toolkit?id=${id}`, {
            method: 'DELETE'
        });
        alert('Toolkit entry deleted successfully!');
        fetchToolkitAdmin(); // Refresh the table
    } catch (error) {
        console.error('Error deleting toolkit entry:', error);
        alert('Failed to delete toolkit entry. Please try again.');
    }
};

// Load toolkit entries on page load
document.addEventListener('DOMContentLoaded', fetchToolkitAdmin);