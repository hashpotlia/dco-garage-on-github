// fetchDcose.js (Updated to match DCO dashboard)
async function fetchDcose() {
    try {
        const response = await fetch('https://dco-garage.vercel.app/api/dcose');
        const data = await response.json();
        const tableBody = document.getElementById('dcose-list');
        if (!tableBody) return;
        tableBody.innerHTML = '';
        data.bookmarks.forEach(bookmark => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${bookmark.name}</td>
				<td>${bookmark.description}</td>
                <td><a href="${bookmark.link}" target="_blank">${bookmark.alt || 'Click Here'}</a></td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error fetching DCOSE bookmarks:', error);
    }
}

// Load DCOSE bookmarks on page load
document.addEventListener('DOMContentLoaded', fetchDcose);