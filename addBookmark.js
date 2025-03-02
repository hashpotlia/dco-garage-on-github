const form = document.getElementById('bookmark-form');
if (form) {
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = document.getElementById('name').value;
        const link = document.getElementById('link').value;
        const alt = document.getElementById('alt').value;
        
        try {
            await fetch('https://dco-garage.vercel.app/api/bookmarks', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ name, link, alt })
            });
            form.reset();
            fetchBookmarks(); // Refresh bookmark list
        } catch (error) {
            console.error('Error adding bookmark:', error);
        }
    });
}