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
                <td><a href="${bookmark.link}" target="_blank">${bookmark.alt || 'Click Here'}</a></td>
                <td class="action-buttons">
                    <!--<button onclick="editDcose('${bookmark.id}')">Edit</button>-->
                    <button onclick="deleteDcose('${bookmark.id}')">Delete</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error fetching DCOSE bookmarks:', error);
    }
}

window.editDcose = function(id) {
    const modal = document.createElement('div');
    modal.innerHTML = `
        <div class="modal">
            <h2>Edit DCOSE Bookmark</h2>
            <input type="text" id="edit-name" placeholder="Enter description" required />
            <input type="url" id="edit-link" placeholder="Enter link (e.g., https://example.com)" required />
            <input type="text" id="edit-alt" placeholder="Enter alt text (optional)" />
            <div class="modal-buttons">
                <button onclick="saveDcoseChanges('${id}')">Save</button>
                <button onclick="closeEditModal()">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    // Fetch current bookmark data to populate the form (optional, for better UX)
    fetch(`https://dco-garage.vercel.app/api/dcose?id=${id}`)
        .then(response => response.json())
        .then(data => {
            if (data.bookmarks && data.bookmarks.length > 0) {
                const bookmark = data.bookmarks[0];
                document.getElementById('edit-name').value = bookmark.name;
                document.getElementById('edit-link').value = bookmark.link;
                document.getElementById('edit-alt').value = bookmark.alt || '';
            }
        })
        .catch(error => console.error('Error fetching bookmark:', error));
};

window.closeEditModal = function() {
    const modal = document.querySelector('.modal');
    if (modal) modal.remove();
};

window.saveDcoseChanges = async function(id) {
    const name = document.getElementById('edit-name').value;
    const link = document.getElementById('edit-link').value;
    const alt = document.getElementById('edit-alt').value;

    try {
        const response = await fetch(`https://dco-garage.vercel.app/api/dcose?id=${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name, link, alt })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update DCOSE bookmark');
        }

        closeEditModal();
        fetchDcose();
    } catch (error) {
        console.error('Error updating DCOSE bookmark:', error);
    }
};

window.deleteDcose = async function(id) {
    try {
        const response = await fetch('https://dco-garage.vercel.app/api/dcose', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete DCOSE bookmark');
        }

        fetchDcose();
    } catch (error) {
        console.error('Error deleting DCOSE bookmark:', error);
    }
};

// Load DCOSE bookmarks on page load
document.addEventListener('DOMContentLoaded', fetchDcose);