// fetchToolkit.js
let toolkitData = []; // Store the fetched data globally for filtering/sorting

async function fetchToolkit() {
    try {
        const response = await fetch('https://dco-garage.vercel.app/api/toolkit');
        const data = await response.json();
        toolkitData = data.toolkit; // Store data for filtering/sorting
        populateCategoryFilter(); // Populate the filter dropdown
        filterAndSortToolkit(); // Initial render with default filter/sort
    } catch (error) {
        console.error('Error fetching toolkit entries:', error);
    }
}

function populateCategoryFilter() {
    const categoryFilter = document.getElementById('categoryFilter');
    if (!categoryFilter) return;

    // Get unique categories from toolkitData
    const categories = [...new Set(toolkitData.map(entry => entry.category))];
    categories.sort(); // Sort categories alphabetically
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });
}

function filterAndSortToolkit() {
    const categoryFilter = document.getElementById('categoryFilter')?.value || 'all';
    const sortOption = document.getElementById('sortOption')?.value || 'category-asc';
    const container = document.getElementById('toolkit-list');
    if (!container) return;

    // Filter data
    let filteredData = toolkitData;
    if (categoryFilter !== 'all') {
        filteredData = toolkitData.filter(entry => entry.category === categoryFilter);
    }

    // Sort data
    filteredData = [...filteredData]; // Create a copy to avoid mutating the original array
    if (sortOption === 'category-asc') {
        filteredData.sort((a, b) => a.category.localeCompare(b.category));
    } else if (sortOption === 'category-desc') {
        filteredData.sort((a, b) => b.category.localeCompare(a.category));
    } else if (sortOption === 'details-asc') {
        filteredData.sort((a, b) => a.details.localeCompare(b.details));
    } else if (sortOption === 'details-desc') {
        filteredData.sort((a, b) => b.details.localeCompare(a.details));
    }

    // Render filtered and sorted data
    container.innerHTML = '';
    filteredData.forEach((entry, index) => {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'toolkit-entry';
        entryDiv.innerHTML = `
            <div class="toolkit-details"><span class="label-bold">Name: </span>${entry.details}</div>
            <div class="toolkit-category"><span class="label-bold">Category: </span>${entry.category}</div>
            <div class="toolkit-description"><span class="label-bold">Description: </span>${entry.description || 'No description available'}</div>
            <button class="toggle-btn" onclick="toggleCommands(${index})">Commands ▼</button>
            <div id="commands-${index}" class="commands-content" style="display: none;">
                <pre><code class="language-bash">${entry.commands}</code></pre>
                <button class="copy-btn" data-command="${encodeURIComponent(entry.commands)}" onclick="copyToClipboard(this, ${index})">Copy</button>
                <span id="copy-status-${index}" class="copy-status"></span>
            </div><br>
        `;
        container.appendChild(entryDiv);
    });

    // Apply syntax highlighting to all code blocks
    hljs.highlightAll();
}

function toggleCommands(index) {
    const content = document.getElementById(`commands-${index}`);
    const arrow = content.previousElementSibling;
    if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.innerHTML = arrow.innerHTML.replace('▼', '▲');
    } else {
        content.style.display = 'none';
        arrow.innerHTML = arrow.innerHTML.replace('▲', '▼');
    }
}

function copyToClipboard(button, index) {
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
}

function fallbackCopyToClipboard(text, statusElement) {
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
}

// Update universal search to include description field
function updateUniversalFilter() {
    let input = document.getElementById("universalSearch").value.toUpperCase();

    // Filter table-based sections (e.g., Dashboard, Wiki Resources)
    let visibleTables = document.querySelectorAll(".content > div:not([style*='display: none']) table");
    visibleTables.forEach(table => {
        let tr = table.getElementsByTagName("tr");
        for (let i = 1; i < tr.length; i++) {
            let tdArray = tr[i].getElementsByTagName("td");
            let match = false;
            for (let td of tdArray) {
                if (td.innerText.toUpperCase().includes(input)) {
                    match = true;
                    break;
                }
            }
            tr[i].style.display = match ? "" : "none";
        }
    });

    // Filter DCO Toolkit section (div-based)
    let toolkitSection = document.querySelector("#dco-toolkit-section:not([style*='display: none'])");
    if (toolkitSection) {
        let entries = toolkitSection.querySelectorAll('.toolkit-entry');
        entries.forEach(entry => {
            let details = entry.querySelector('.toolkit-details').innerText.toUpperCase();
            let category = entry.querySelector('.toolkit-category').innerText.toUpperCase();
            let description = entry.querySelector('.toolkit-description').innerText.toUpperCase();
            let match = details.includes(input) || category.includes(input) || description.includes(input);
            entry.style.display = match ? "" : "none";
        });
    }
}

// Load toolkit entries on page load
document.addEventListener('DOMContentLoaded', fetchToolkit);