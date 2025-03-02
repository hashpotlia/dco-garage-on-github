	
	// Below script is for the menu function only!!!
		document.addEventListener("DOMContentLoaded", function() {
			const menuLinks = document.querySelectorAll(".sidebar a"); // Sidebar links
			const topMenuLinks = document.querySelectorAll(".top-menu a"); // Top menu links

			const dcoHomeLink = document.querySelector(".sidebar a:nth-child(2)"); // DCO Home
			const sevMonitorLink = document.querySelector(".sidebar a:nth-child(3)");
			const dcoToolkitLink = document.querySelector(".sidebar a:nth-child(4)");
			const bookmarkManagerLink = document.querySelector(".sidebar a:nth-child(5)");
			const updatesLink = document.querySelector(".sidebar a:nth-child(6)"); // Updates
			const dashboardLink = document.querySelector(".top-menu a:nth-child(1)"); // Dashboard
			const wikiResourcesLink = document.querySelector(".top-menu a:nth-child(2)"); // Wiki Resources
			const dcoseResourceLink = document.querySelector(".top-menu a:nth-child(3)"); // DCOSE Resource

			const dashboardContent = document.getElementById("dashboard-content");
			const wikiResourcesSection = document.getElementById("wiki-resources-section");
			const dcoseResourceSection = document.getElementById("dcose-resource-section"); // New section
			const sevMonitorSection = document.getElementById("sev-monitor-section");
			const dcoToolkitSection = document.getElementById("dco-toolkit-section");
			const bookmarkManagerSection = document.getElementById("bookmark-manager-section");
			const updatesSection = document.getElementById("updates-section");

			function setActiveLinks(activeLinks) {
				menuLinks.forEach(link => link.classList.remove("active"));
				topMenuLinks.forEach(link => link.classList.remove("active"));
				activeLinks.forEach(link => link.classList.add("active"));
			}

			function showSection(event, sectionToShow, activeLinks) {
				event.preventDefault();

				// Hide all sections
				dashboardContent.style.display = "none";
				wikiResourcesSection.style.display = "none";
				dcoseResourceSection.style.display = "none"; // Hide new section
				sevMonitorSection.style.display = "none";
				dcoToolkitSection.style.display = "none";
				bookmarkManagerSection.style.display = "none";
				updatesSection.style.display = "none";

				// Show only the selected section
				sectionToShow.style.display = "block";

				// Set the correct active links
				setActiveLinks(activeLinks);

				// Clear the search bar when switching tabs
				clearSearch();
			}

			function clearSearch() {
				document.getElementById("universalSearch").value = "";
				universalFilter(); // Reset table rows
			}

			// Navigation event listeners
			dcoHomeLink.addEventListener("click", function(event) {
				showSection(event, dashboardContent, [dcoHomeLink, dashboardLink]);
				fetchBookmarks(); // Load bookmarks when opening Dashboard
			});

			dashboardLink.addEventListener("click", function(event) {
				showSection(event, dashboardContent, [dcoHomeLink, dashboardLink]);
				fetchBookmarks(); // Load bookmarks when opening Dashboard
			});

			wikiResourcesLink.addEventListener("click", function(event) {
				showSection(event, wikiResourcesSection, [wikiResourcesLink]);
			});

			dcoseResourceLink.addEventListener("click", function(event) {
				showSection(event, dcoseResourceSection, [dcoseResourceLink]);
				fetchDcose(); // Load DCOSE bookmarks when opening DCOSE Resource
			});

			sevMonitorLink.addEventListener("click", function(event) {
				showSection(event, sevMonitorSection, [sevMonitorLink]);
			});

			dcoToolkitLink.addEventListener("click", function(event) {
				showSection(event, dcoToolkitSection, [dcoToolkitLink]);
			});

			bookmarkManagerLink.addEventListener("click", function(event) {
				showSection(event, bookmarkManagerSection, [bookmarkManagerLink]);
			});

			updatesLink.addEventListener("click", function(event) {
				showSection(event, updatesSection, [updatesLink]);
			});

			// Ensure Dashboard is visible by default with both active states
			showSection(new Event("click"), dashboardContent, [dcoHomeLink, dashboardLink]);
		});


	// Universal Search Function
	function universalFilter() {
		let input = document.getElementById("universalSearch").value.toUpperCase();
		updateUniversalFilter(); // Call the renamed function from fetchToolkit.js
		
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
				let category = entry.querySelector('.toggle-btn').innerText.toUpperCase();
				let match = details.includes(input) || category.includes(input);
				entry.style.display = match ? "" : "none";
			});
		}
	}
	

	
	//Below script is for Toggle Dark Mode!!!
	document.addEventListener("DOMContentLoaded", function() {
		const darkModeToggle = document.getElementById("darkModeToggle");
		const body = document.body;

		// Check user preference from localStorage
		if (localStorage.getItem("theme") === "dark") {
			body.classList.add("dark-mode");
		}

		darkModeToggle.addEventListener("click", function() {
			body.classList.toggle("dark-mode");

			// Save user preference
			let mode = body.classList.contains("dark-mode") ? "dark" : "light";
			localStorage.setItem("theme", mode);
		});
	});
	
	
		//New add button and database validation check function
		  function openBookmarkModal() {
				document.getElementById("bookmark-modal").style.display = "block";
				document.getElementById("modalOverlay").style.display = "block"; // Show overlay
				document.getElementById("modal-name").focus(); // Auto-focus on input field
			}

			function closeBookmarkModal() {
				document.getElementById("bookmark-modal").style.display = "none";
				document.getElementById("modalOverlay").style.display = "none"; // Hide overlay
				document.getElementById("modal-name").value = ""; // Clear inputs
				document.getElementById("modal-link").value = "";
				document.getElementById("modal-alt").value = "";
			}

			function handleBookmarkEnter(event) {
				if (event.key === "Enter") {
					saveBookmark();
				}
			}

			async function saveBookmark() {
				const name = document.getElementById("modal-name").value;
				const link = document.getElementById("modal-link").value;
				const alt = document.getElementById("modal-alt").value;

				if (!name || !link) {
					alert("Name and Link are required fields!");
					return;
				}

				try {
					const response = await fetch('https://dco-garage.vercel.app/api/bookmarks');
					const data = await response.json();
					const existingBookmark = data.bookmarks.find(bookmark => bookmark.link === link || bookmark.name === name);

					if (existingBookmark) {
						alert("This bookmark already exists!");
						return;
					}
				} catch (error) {
					console.error("Error checking existing bookmarks:", error);
					return;
				}

				try {
					await fetch('https://dco-garage.vercel.app/api/bookmarks', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ name, link, alt })
					});

					closeBookmarkModal(); // Close modal after saving
					alert("Bookmark added successfully!"); // Confirmation message
				} catch (error) {
					console.error("Error adding bookmark:", error);
				}
			}

		
		
		//go to dashboard Manager
			async function sha256(message) {
				const encoder = new TextEncoder();
				const data = encoder.encode(message);
				const hashBuffer = await crypto.subtle.digest('SHA-256', data);
				const hashArray = Array.from(new Uint8Array(hashBuffer));
				return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
			}

			function openPasswordModal() {
				document.getElementById("passwordModal").style.display = "block";
				document.getElementById("modalOverlay").style.display = "block"; // Show overlay
				document.getElementById("passwordInput").focus(); // Auto-focus on input
			}

			function closePasswordModal() {
				document.getElementById("passwordModal").style.display = "none";
				document.getElementById("modalOverlay").style.display = "none"; // Hide overlay
				document.getElementById("passwordInput").value = ""; // Clear input
			}

			async function validatePassword() {
				const correctHash = "54136330c3b0429b6890b6a4f8e5c5dcc0e6d992275f9445ace051d009f13610"; // SHA-256 hash of "password"
				const userPassword = document.getElementById("passwordInput").value;

				if (!userPassword) {
					alert("Please enter a password.");
					return;
				}

				const userHash = await sha256(userPassword);

				if (userHash === correctHash) {
					closePasswordModal();
					window.open("https://drive-render.corp.amazon.com/view/hpotlia@/AKLScripts/dashboard.html", "_blank");
				} else {
					alert("Incorrect password! Access denied.");
					document.getElementById("passwordInput").value = ""; // Clear input
				}
			}

			function handleEnter(event) {
				if (event.key === "Enter") {
					validatePassword();
				}
			}
			
			
			//Floating "Scroll to Top" Button
			window.onscroll = function() {
				document.getElementById("scrollTopButton").style.display = window.scrollY > 100 ? "block" : "none";
			};

			function scrollToTop() {
				window.scrollTo({ top: 0, behavior: "smooth" });
			}
			
			// Bookmark Modal Functions (Updated for both bookmarks and dcose)
window.openBookmarkModal = function(type) {
    document.getElementById("bookmark-modal").style.display = "block";
    document.getElementById("modalOverlay").style.display = "block";
    document.getElementById("modal-name").focus();
    window.currentBookmarkType = type; // Store the type (bookmarks or dcose)
};

window.closeBookmarkModal = function() {
    document.getElementById("bookmark-modal").style.display = "none";
    document.getElementById("modalOverlay").style.display = "none";
    document.getElementById("modal-name").value = "";
    document.getElementById("modal-link").value = "";
    document.getElementById("modal-alt").value = "";
};

window.handleBookmarkEnter = function(event) {
    if (event.key === "Enter") {
        saveBookmark();
    }
};

window.saveBookmark = async function() {
    const name = document.getElementById("modal-name").value;
    const link = document.getElementById("modal-link").value;
    const alt = document.getElementById("modal-alt").value;

    if (!name || !link) {
        alert("Name and Link are required fields!");
        return;
    }

    const apiUrl = window.currentBookmarkType === 'dcose' 
        ? 'https://dco-garage.vercel.app/api/dcose' 
        : 'https://dco-garage.vercel.app/api/bookmarks';

    try {
        const response = await fetch(apiUrl);
        const data = await response.json();
        const existingBookmark = data.bookmarks.find(bookmark => bookmark.link === link || bookmark.name === name);

        if (existingBookmark) {
            alert("This bookmark already exists!");
            return;
        }
    } catch (error) {
        console.error(`Error checking existing ${window.currentBookmarkType}:`, error);
        return;
    }

    try {
        await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, link, alt })
        });

        closeBookmarkModal();
        if (window.currentBookmarkType === 'bookmarks') {
            fetchBookmarks(); // Assumes fetchBookmarks is available from fetchBookmarks.js
        } else {
            fetchDcose(); // Assumes fetchDcose is available from fetchDcose.js
        }
        alert("Bookmark added successfully!");
    } catch (error) {
        console.error(`Error adding ${window.currentBookmarkType}:`, error);
    }
};

