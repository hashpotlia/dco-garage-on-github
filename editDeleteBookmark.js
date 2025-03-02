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
                <td class="action-buttons">
                    
                    <button onclick="deleteBookmark('${bookmark.id}')">Delete</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error fetching bookmarks:', error);
    }
}

window.openEditModal = function(id, name, link, alt) {
    const modal = document.createElement('div');
    modal.innerHTML = `
        <div class="modal">
            <h2>Edit Bookmark</h2>
            <label>Name: <input type="text" id="edit-name" value="${name}"></label>
            <label>Link: <input type="text" id="edit-link" value="${link}"></label>
            <label>Alt: <input type="text" id="edit-alt" value="${alt}"></label>
            <button onclick="saveBookmarkChanges('${id}')">Save</button>
            <button onclick="closeEditModal()">Cancel</button>
        </div>
    `;
    document.body.appendChild(modal);
};

window.closeEditModal = function() {
    const modal = document.querySelector('.modal');
    if (modal) modal.remove();
};

window.saveBookmarkChanges = async function(id) {
    const name = document.getElementById('edit-name').value;
    const link = document.getElementById('edit-link').value;
    const alt = document.getElementById('edit-alt').value;

    try {
        await fetch('https://dco-garage.vercel.app/api/bookmarks?id=${id}', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name, link, alt })
        });
        closeEditModal();
        fetchBookmarks();
    } catch (error) {
        console.error('Error updating bookmark:', error);
    }
};

async function saveBookmarkChanges(id) {
    const name = document.getElementById("edit-name").value;
    const link = document.getElementById("edit-link").value;
    const alt = document.getElementById("edit-alt").value;

    try {
        const response = await fetch(`https://dco-garage.vercel.app/api/bookmarks?id=${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, name, link, alt }) // Ensure ID is also included in body
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to update bookmark");
        }

        closeEditModal();
        fetchBookmarks();
    } catch (error) {
        console.error("Error updating bookmark:", error);
    }
}




async function deleteBookmark(id) {
    try {
        const response = await fetch('https://dco-garage.vercel.app/api/bookmarks', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete bookmark');
        }

        fetchBookmarks();
    } catch (error) {
        console.error('Error deleting bookmark:', error);
    }
}


async function editBookmark(id, name, link, alt) {
    document.getElementById('name').value = name;
    document.getElementById('link').value = link;
    document.getElementById('alt').value = alt;

    document.getElementById('bookmark-form').onsubmit = async function(event) {
        event.preventDefault();
        try {
            const response = await fetch('https://dco-garage.vercel.app/api/bookmarks?id=${id}', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    name: document.getElementById('name').value,
                    link: document.getElementById('link').value,
                    alt: document.getElementById('alt').value
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update bookmark');
            }

            fetchBookmarks();
        } catch (error) {
            console.error('Error updating bookmark:', error);
        }

        document.getElementById('bookmark-form').onsubmit = addBookmark;
    };
}


document.addEventListener('DOMContentLoaded', fetchBookmarks);