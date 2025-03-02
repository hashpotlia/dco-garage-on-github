async function fetchBookmarks() {
    try {
        const response = await fetch('https://dco-garage.vercel.app/api/bookmarks');
        const data = await response.json();
        const tableBody = document.getElementById('bookmarks-list');
        if (!tableBody) return;
        tableBody.innerHTML = '';
        data.bookmarks.forEach(bookmark => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${bookmark.name}</td>
                <td><a href="${bookmark.link}" target="_blank">${bookmark.alt}</a></td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error fetching bookmarks:', error);
    }
}

document.addEventListener('DOMContentLoaded', fetchBookmarks);