import { runbookDetector } from "./runbookDetector.js";
window.runbookDetector = runbookDetector;

let lastFocusedElement;
function trapFocus(modal) {
    const focusable = modal.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    modal.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    });
}

function openModal(modal) {
    lastFocusedElement = document.activeElement;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    trapFocus(modal);
    const focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus();
}
let DCO_API_CONFIG = null;
let runbookData = [];
let detectionTimeout;
let autoRefreshInterval = null;
const REFRESH_INTERVAL = 3 * 60 * 1000; // 3 minutes

function updateLastRefreshed() {
    const el = document.getElementById('lastRefreshed');
    if (el) {
        const now = new Date();
        el.textContent = `Last refreshed: ${now.toLocaleTimeString()}`;
    }
}

const state = {
    currentTab: 'dashboard',
    adminUnlocked: false,
    adminCurrentTab: 'bookmarks',
    bookmarkTab: 'bookmarks',
    allData: {
        bookmarks: [],
        dcose: [],
        toolkit: [],
        knowledge: [],
        flags: []
    },
    filters: {
        toolkit: { category: '', sub_category: '', sort: 'asc' },
        knowledge: { category: '', sub_category: '', search: '' }
    },
    searchTimer: null,
    pagination: {
        bookmarks: { page: 1, size: 10 },
        dcose: { page: 1, size: 10 },
        toolkit: { page: 1, size: 10 },
        knowledge: { page: 1, size: 10 }
    }
};

// --- DOM Elements ---
const DOMElements = {
    navLinks: document.querySelectorAll('.nav-link'),
    mobileMenuButton: document.getElementById('mobile-menu-button'),
    mobileMenu: document.getElementById('mobile-menu'),
    adminButton: document.getElementById('admin-button'),
    modalContainer: document.getElementById('modal-container'),
    toastContainer: document.getElementById('toast-container'),
    globalSearchBar: document.getElementById('globalSearchBar'),
    globalSearchClear: document.getElementById('globalSearchClear'),
    tabContents: document.querySelectorAll('.tab-content')
};

// --- Main Application Logic ---
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    // console.log("Initializing DCO Garage v3.0...");
    await loadApiConfig();
    await loadRunbookData();
    setupEventListeners();
    await fetchAllData();
    switchTab('dashboard');
    
    // Start auto-refresh after 5 seconds
    setTimeout(() => {
        startAutoRefresh();
    }, 5000);
}

// Load API endpoints
async function loadApiConfig() {
    const configUrl = 'https://raw.githubusercontent.com/hashpotlia/dcogarage-api/main/api-endpoints.json';
    try {
        const res = await fetch(configUrl);
        if (!res.ok) throw new Error("Failed to fetch API config.");
        DCO_API_CONFIG = await res.json();
        // console.log("✅ API config loaded");
    } catch (e) {
        console.error("❌ API config fetch error:", e);
        // Fallback to hardcoded endpoints
        DCO_API_CONFIG = {
            bookmarks: 'https://dco-garage.vercel.app/api/bookmarks',
            dcose: 'https://dco-garage.vercel.app/api/dcose',
            toolkit: 'https://dco-garage.vercel.app/api/toolkit',
            knowledge: 'https://dco-garage.vercel.app/api/knowledge',
            flags: 'https://dco-garage.vercel.app/api/system_info',
            runbooks: 'https://raw.githubusercontent.com/hashpotlia/dcogarage-api/main/runbooks.json'
        };
    }
}

// Load runbook data for smart search
async function loadRunbookData() {
    try {
        const res = await fetch(DCO_API_CONFIG?.runbooks || 'https://raw.githubusercontent.com/hashpotlia/dcogarage-api/main/runbooks.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch runbook data`);
        const data = await res.json();
        runbookData = data.runbooks || [];
        // console.log("✅ Loaded runbook data:", runbookData.length, "runbooks");
        showToast(`🎯 Loaded ${runbookData.length} runbooks successfully!`, 'success');
        updateLastRefreshed();
    } catch (e) {
        console.error("❌ Runbook data fetch error:", e);
        runbookData = [];
        showToast("⚠️ Using offline runbook data", 'error');
    }
}

function setupEventListeners() {
    DOMElements.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = e.currentTarget.dataset.tab;
            switchTab(tab);
            DOMElements.mobileMenu.classList.add('hidden');
        });
    });

    DOMElements.mobileMenuButton.addEventListener('click', () => {
        DOMElements.mobileMenu.classList.toggle('hidden');
    });

    DOMElements.adminButton.addEventListener('click', () => {
        if (state.adminUnlocked) {
            switchTab('admin');
        } else {
            showAdminLogin();
        }
    });

    DOMElements.globalSearchBar.addEventListener('input', (e) => {
        const value = e.target.value;
        DOMElements.globalSearchClear.style.display = value ? 'block' : 'none';
        
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(() => {
            performGlobalSearch(value);
        }, 300);
    });
    
    DOMElements.globalSearchBar.addEventListener('focus', (e) => {
        if(e.target.value) performGlobalSearch(e.target.value);
    });

    DOMElements.globalSearchClear.addEventListener('click', () => {
        DOMElements.globalSearchBar.value = '';
        DOMElements.globalSearchClear.style.display = 'none';
        closeModal('search-results-modal');
        DOMElements.globalSearchBar.focus();
    });

    document.addEventListener('keydown', e => {
if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    DOMElements.globalSearchBar.focus();
}
if (e.key === 'Escape') {
    // Close search results first, then other modals
    if (document.getElementById('search-results-modal')) {
        closeModal('search-results-modal');
        return; // Don't process other escape actions
    }
    
    const runbookSearch = document.getElementById('smart-runbook-search');
    if (runbookSearch && document.activeElement === runbookSearch) {
        runbookSearch.value = '';
        hideRunbookSuggestions();
    }
}
if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    const runbookSearch = document.getElementById('smart-runbook-search');
    if (runbookSearch) {
        switchTab('knowledge');
        setTimeout(() => {
            runbookSearch.focus();
            runbookSearch.select();
        }, 100);
    }
}
});

}

async function fetchAllData(force = false) {
    if (!force && state.allData.bookmarks.length > 0) return;
    // console.log("Fetching all data...");

    const fetchData = async (url, key) => {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`Fetch failed for ${url} with status: ${response.status}`);
                return [];
            }
            const data = await response.json();
            return Array.isArray(data[key]) ? data[key] : [];
        } catch (e) {
            console.error("Fetch/JSON parsing error:", e, "for URL:", url);
            return [];
        }
    };
    
    const [bookmarks, dcose, toolkit, knowledge, flags] = await Promise.all([
        fetchData(DCO_API_CONFIG.bookmarks, 'bookmarks'),
        fetchData(DCO_API_CONFIG.dcose, 'bookmarks'), // Note: dcose uses 'bookmarks' key
        fetchData(DCO_API_CONFIG.toolkit, 'toolkit'),
        fetchData(DCO_API_CONFIG.knowledge, 'knowledge'),
        (async () => {
try {
    const response = await fetch(DCO_API_CONFIG.flags);
    if (!response.ok) return [];
    const data = await response.json();
    // Return the array directly since your API returns flags as an array
    return Array.isArray(data) ? data : (data.flags || []);
} catch (e) {
    console.error("Flags fetch error:", e);
    return [];
}
})()
    ]);
    
    state.allData = { bookmarks, dcose, toolkit, knowledge, flags };
    // console.log("✅ All data loaded");
}

function switchTab(tabId) {
    state.currentTab = tabId;

    DOMElements.navLinks.forEach(link => {
        link.classList.toggle('active', link.dataset.tab === tabId);
    });

    DOMElements.tabContents.forEach(content => {
        content.classList.toggle('hidden', content.id !== `tab-${tabId}`);
    });
    
    const container = document.getElementById(`tab-${tabId}`);
    if(container) container.innerHTML = ''; // Always clear to re-render with fresh state

    renderCurrentTab();
}

function renderCurrentTab() {
    const container = document.getElementById(`tab-${state.currentTab}`);
    if (!container) return;

    switch(state.currentTab) {
        case 'dashboard': renderDashboard(container); break;
        case 'bookmarks': renderBookmarks(container); break;
        case 'toolkit': renderToolkit(container); break;
        case 'knowledge': renderKnowledge(container); break;
        case 'labs': renderLabs(container); break;
        case 'admin': renderAdmin(container); break;
    }
}

// --- Rendering Functions ---

function renderPageHeader(title, subtitle, iconSvg) {
    return `
        <div class="mb-8">
            <div class="flex items-center space-x-3 mb-2">
                ${iconSvg}
                <h2 class="text-3xl font-bold text-slate-100">${title}</h2>
                <span class="text-3xl font-semibold text-indigo-400 caret">_</span>
            </div>
            <p class="text-slate-400">${subtitle}</p>
        </div>
    `;
}

function renderDashboard(container) {
    const icon = `<svg class="w-8 h-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>`;
    
    container.innerHTML = renderPageHeader('Dashboard', 'Welcome to your command center.', icon) +
    `
    <!-- OnCall Status Section -->
    <div class="mb-8 bg-gradient-to-r from-purple-900/20 to-indigo-900/20 border border-purple-800/30 rounded-lg p-6">
        <div class="flex items-center space-x-3 mb-4">
            <svg class="w-6 h-6 text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
            </svg>
            <h3 class="text-xl font-bold text-slate-100">OnCall Status</h3>
        </div>
        <p class="text-slate-400 mb-4">Quick access to current OnCall engineers and managers across DCO, DCEO, DCOSE, Logistics, DCM and Security teams.</p>
			<p class="decoration-slate-50 mb-4"><b>/ Because 3 AM emergencies need the right person, not a guessing game.</b></p>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <!-- DCO Section -->
            <div class="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <div class="flex items-center space-x-2 mb-3">
                    <span class="text-lg">🔧</span>
                    <span class="font-bold text-slate-200">DCO</span>
                </div>
                <div class="space-y-2">
                    <div class="flex gap-2">
                        <a href="https://oncall.corp.amazon.com/#/view/akl53-datatech-primary/schedule" target="_blank" class="oncall-badge flex items-center space-x-2 p-2 bg-slate-700/50 rounded-md hover:bg-slate-600/50 transition-all text-sm flex-1">
                            <img src="https://prod.badges.tools.amazon.dev/oncall/akl53-datatech-primary.svg?label=AKL53" alt="AKL53" class="h-4">
                            <span>OnCall</span>
                        </a>
                        <a href="https://t.corp.amazon.com/issues/?q=extensions.tt.status%3A%28Assigned%20OR%20Researching%20OR%20%22Work%20In%20Progress%22%20OR%20Pending%29%20AND%20extensions.tt.assignedGroup%3A%22AKL53%20Data%20Tech%22" target="_blank" class="oncall-badge flex items-center space-x-2 p-2 bg-slate-700/50 rounded-md hover:bg-slate-600/50 transition-all text-sm">
                            <img src="https://prod.badges.tools.amazon.dev/sim_folder/1d2b74fd-cf73-4470-86e9-411f9c1416e8.svg?label=TICKETS" alt="AKL53 Tickets" class="h-4">
                        </a>
                    </div>
                    <div class="flex gap-2">
                        <a href="https://oncall.corp.amazon.com/#/view/akl55-datatech-primary/schedule" target="_blank" class="oncall-badge flex items-center space-x-2 p-2 bg-slate-700/50 rounded-md hover:bg-slate-600/50 transition-all text-sm flex-1">
                            <img src="https://prod.badges.tools.amazon.dev/oncall/akl55-datatech-primary.svg?label=AKL55" alt="AKL55" class="h-4">
                            <span>OnCall</span>
                        </a>
                        <a href="https://t.corp.amazon.com/issues/?q=extensions.tt.status%3A%28Assigned%20OR%20Researching%20OR%20%22Work%20In%20Progress%22%20OR%20Pending%29%20AND%20extensions.tt.assignedGroup%3A%22AKL55%20Data%20Tech%22" target="_blank" class="oncall-badge flex items-center space-x-2 p-2 bg-slate-700/50 rounded-md hover:bg-slate-600/50 transition-all text-sm">
                            <img src="https://prod.badges.tools.amazon.dev/sim_folder/945514be-b919-4aea-aaa5-0302038ff045.svg?label=TICKETS" alt="AKL55 Tickets" class="h-4">
                        </a>
                    </div>
                    <div class="flex gap-2">
                        <a href="https://oncall.corp.amazon.com/#/view/akl56-datatech-primary/schedule" target="_blank" class="oncall-badge flex items-center space-x-2 p-2 bg-slate-700/50 rounded-md hover:bg-slate-600/50 transition-all text-sm flex-1">
                            <img src="https://prod.badges.tools.amazon.dev/oncall/akl56-datatech-primary.svg?label=AKL56" alt="AKL56" class="h-4">
                            <span>OnCall</span>
                        </a>
                        <a href="https://t.corp.amazon.com/issues/?q=extensions.tt.status%3A%28Assigned%20OR%20Researching%20OR%20%22Work%20In%20Progress%22%20OR%20Pending%29%20AND%20extensions.tt.assignedGroup%3A%22AKL56%20Data%20Tech%22" target="_blank" class="oncall-badge flex items-center space-x-2 p-2 bg-slate-700/50 rounded-md hover:bg-slate-600/50 transition-all text-sm">
                            <img src="https://prod.badges.tools.amazon.dev/sim_folder/65c6a158-1b1d-4bbd-953b-42af608025a1.svg?label=TICKETS" alt="AKL56 Tickets" class="h-4">
                        </a>
                    </div>
                    <div class="flex gap-2">
                        <a href="https://oncall.corp.amazon.com/#/view/akl60-datatech-primary/schedule" target="_blank" class="oncall-badge flex items-center space-x-2 p-2 bg-slate-700/50 rounded-md hover:bg-slate-600/50 transition-all text-sm flex-1">
                            <img src="https://prod.badges.tools.amazon.dev/oncall/akl60-datatech-primary.svg?label=AKL60" alt="AKL60" class="h-4">
                            <span>OnCall</span>
                        </a>
                        <a href="https://t.corp.amazon.com/issues/?q=extensions.tt.status%3A%28Assigned%20OR%20Researching%20OR%20%22Work%20In%20Progress%22%20OR%20Pending%29%20AND%20extensions.tt.assignedGroup%3A%22AKL60%20Data%20Tech%22" target="_blank" class="oncall-badge flex items-center space-x-2 p-2 bg-slate-700/50 rounded-md hover:bg-slate-600/50 transition-all text-sm">
                            <img src="https://prod.badges.tools.amazon.dev/sim_folder/55a7bab7-b4d0-4cf9-b202-459006854c45.svg?label=TICKETS" alt="AKL60 Tickets" class="h-4">
                        </a>
                    </div>
                    <div class="flex gap-2">
                        <a href="https://oncall.corp.amazon.com/#/view/akl70-data-tech-primary/schedule" target="_blank" class="oncall-badge flex items-center space-x-2 p-2 bg-slate-700/50 rounded-md hover:bg-slate-600/50 transition-all text-sm flex-1">
                            <img src="https://prod.badges.tools.amazon.dev/oncall/akl70-data-tech-primary.svg?label=AKL70" alt="AKL70" class="h-4">
                            <span>OnCall</span>
                        </a>
                        <a href="https://t.corp.amazon.com/issues/?q=extensions.tt.status%3A%28Assigned%20OR%20Researching%20OR%20%22Work%20In%20Progress%22%20OR%20Pending%29%20AND%20extensions.tt.assignedGroup%3A%22AKL70%20Data%20Tech%22" target="_blank" class="oncall-badge flex items-center space-x-2 p-2 bg-slate-700/50 rounded-md hover:bg-slate-600/50 transition-all text-sm">
                            <img src="https://prod.badges.tools.amazon.dev/sim_folder/ce1662ab-ad60-4be3-addf-8d35c98db2d2.svg?label=TICKETS" alt="AKL70 Tickets" class="h-4">
                        </a>
                    </div>
                </div>
            </div>
            
            <!-- DCEO Section -->
            <div class="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <div class="flex items-center space-x-2 mb-3">
                    <span class="text-lg">⚡</span>
                    <span class="font-bold text-slate-200">DCEO</span>
                </div>
                <a href="https://oncall.corp.amazon.com/#/view/dceo-akl55-primary" target="_blank" class="oncall-badge flex items-center space-x-2 p-2 bg-slate-700/50 rounded-md hover:bg-slate-600/50 transition-all text-sm">
                    <img src="https://prod.badges.tools.amazon.dev/oncall/dceo-akl55-primary.svg?label=AKL DCEO" alt="DCEO AKL" class="h-4">
                    <span>OnCall</span>
                </a>
            </div>
            
            <!-- DCOSE Section -->
            <div class="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <div class="flex items-center space-x-2 mb-3">
                    <span class="text-lg">🛡️</span>
                    <span class="font-bold text-slate-200">DCOSE</span>
                </div>
                <a href="https://oncall.corp.amazon.com/#/view/dcose" target="_blank" class="oncall-badge flex items-center space-x-2 p-2 bg-slate-700/50 rounded-md hover:bg-slate-600/50 transition-all text-sm">
                    <img src="https://prod.badges.tools.amazon.dev/oncall/dcose.svg?label=DCOSE" alt="DCOSE" class="h-4">
                    <span>OnCall</span>
                </a>
            </div>

            <!-- Logistics Section -->
            <div class="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <div class="flex items-center space-x-2 mb-3">
                    <span class="text-lg">🏗️</span>
                    <span class="font-bold text-slate-200">LOGISTICS</span>
                </div>
                <a href="https://oncall.corp.amazon.com/#/view/akl-logistics-primary" target="_blank" class="oncall-badge flex items-center space-x-2 p-2 bg-slate-700/50 rounded-md hover:bg-slate-600/50 transition-all text-sm">
                    <img src="https://prod.badges.tools.amazon.dev/oncall/akl-logistics-primary.svg?label=AKL LOGISTICS" alt="LOGISTICS" class="h-4">
                    <span>OnCall</span>
                </a>
            </div>

            <!-- DCM Section -->
            <div class="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <div class="flex items-center space-x-2 mb-3">
                    <span class="text-lg">📢</span>
                    <span class="font-bold text-slate-200">DCM</span>
                </div>
                <a href="https://oncall.corp.amazon.com/#/view/akl-dco-escalation" target="_blank" class="oncall-badge flex items-center space-x-2 p-2 bg-slate-700/50 rounded-md hover:bg-slate-600/50 transition-all text-sm">
                    <img src="https://prod.badges.tools.amazon.dev/oncall/akl-dco-escalation.svg?label=AKL DCM" alt="DCM" class="h-4">
                    <span>OnCall</span>
                </a>
            </div>

            <!-- Security Section -->
            <div class="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <div class="flex items-center space-x-2 mb-3">
                    <span class="text-lg">🚨</span>
                    <span class="font-bold text-slate-200">SECURITY</span>
                </div>
                <a href="https://oncall.corp.amazon.com/#/view/akl-dc-sec" target="_blank" class="oncall-badge flex items-center space-x-2 p-2 bg-slate-700/50 rounded-md hover:bg-slate-600/50 transition-all text-sm">
                    <img src="https://prod.badges.tools.amazon.dev/oncall/akl-dc-sec.svg?label=AKL SECURITY" alt="SECURITY" class="h-4">
                    <span>OnCall</span>
                </a>
            </div>
        </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div class="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
            <h3 class="font-bold text-lg text-slate-200">Total Bookmarks</h3>
            <p class="text-4xl font-extrabold text-indigo-400 mt-2">${state.allData.bookmarks.length + state.allData.dcose.length}</p>
        </div>
        <div class="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
            <h3 class="font-bold text-lg text-slate-200">Toolkit Commands</h3>
            <p class="text-4xl font-extrabold text-indigo-400 mt-2">${state.allData.toolkit.length}</p>
        </div>
        <div class="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
            <h3 class="font-bold text-lg text-slate-200">Knowledge Entries</h3>
            <p class="text-4xl font-extrabold text-indigo-400 mt-2">${state.allData.knowledge.length}</p>
        </div>
        <div class="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
            <h3 class="font-bold text-lg text-slate-200">Lab Experiments</h3>
            <p class="text-4xl font-extrabold text-indigo-400 mt-2">9</p>
        </div>
    </div>

    <!-- Quick Actions -->
    <div class="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
        <h3 class="font-bold text-lg text-slate-200 mb-4">Quick Actions</h3>
        <div class="flex flex-wrap gap-4">

<button onclick="goToKnowledgeSearch()" class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Search Runbooks</button>

<button onclick="DOMElements.globalSearchBar.focus()" class="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Start a Search</button>
            ${state.adminUnlocked ? `<button onclick="switchTab('admin')" class="bg-green-600 hover:bg-green-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Go to Admin Panel</button>` : `<button onclick="showAdminLogin()" class="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Unlock Admin</button>`}
        </div>
    </div>
    `;
}

function goToKnowledgeSearch() {
// Switch to knowledge tab
switchTab('knowledge');

// Wait a moment for the tab to load, then focus on runbook search
setTimeout(() => {
    const runbookSearchInput = document.getElementById('smart-runbook-search');
    if (runbookSearchInput) {
        // Clear any existing text first
        runbookSearchInput.value = '';
        
        // Focus the input so cursor is active and ready for typing
        runbookSearchInput.focus();
        
        // Optional: Add a subtle highlight effect to show it's active
        runbookSearchInput.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.3)';
        setTimeout(() => {
            runbookSearchInput.style.boxShadow = '';
        }, 2000);
        
        // Optional: Scroll the runbook search into view
        runbookSearchInput.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });
    }
}, 150); // Slightly longer timeout to ensure tab is fully loaded
}




function renderBookmarks(container) {
    const icon = `<svg class="w-8 h-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.5 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>`;
    let content = `
        ${renderPageHeader('Bookmarks', 'Your collection of essential links and resources.', icon)}
        <div id="bookmark-tabs" class="mb-6 flex border-b border-slate-700">
            <button data-bm-tab="bookmarks" class="bm-tab-btn py-2 px-4 text-slate-400 font-semibold border-b-2 border-transparent hover:text-slate-200 hover:border-slate-500 transition-all">DCO</button>
            <button data-bm-tab="dcose" class="bm-tab-btn py-2 px-4 text-slate-400 font-semibold border-b-2 border-transparent hover:text-slate-200 hover:border-slate-500 transition-all">DCOSE</button>
        </div>
        <div id="bookmark-content"></div>
        <div id="bookmark-pagination" class="mt-6"></div>
    `;
    container.innerHTML = content;
    
    const bookmarkTabs = container.querySelectorAll('.bm-tab-btn');
    bookmarkTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            state.bookmarkTab = btn.dataset.bmTab;
            state.pagination[state.bookmarkTab].page = 1; // Reset pagination
            renderBookmarkContent(container);
            bookmarkTabs.forEach(t => t.classList.remove('text-indigo-400', 'border-indigo-400'));
            btn.classList.add('text-indigo-400', 'border-indigo-400');
        });
    });
    
    bookmarkTabs[0].click();
}

function renderBookmarkContent(container) {
    const list = state.allData[state.bookmarkTab] || [];
    const contentEl = container.querySelector('#bookmark-content');
    const paginationEl = container.querySelector('#bookmark-pagination');
    
    if (list.length === 0) {
        contentEl.innerHTML = `<div class="text-center py-12 text-slate-500">No bookmarks found in this category.</div>`;
        paginationEl.innerHTML = '';
        return;
    }

    // Pagination logic
    const { page, size } = state.pagination[state.bookmarkTab];
    const totalPages = Math.ceil(list.length / size);
    const start = (page - 1) * size;
    const paginatedList = list.slice(start, start + size);

    const listHtml = paginatedList.map(item => `
        <div class="bg-slate-800/50 border border-slate-800 rounded-lg p-4 flex items-center justify-between hover:border-indigo-600 transition-colors">
            <div>
                <a href="${item.link || item.url}" target="_blank" class="font-bold text-slate-200 hover:text-indigo-400 transition-colors text-lg">${item.name || item.title}</a>
                <p class="text-sm text-slate-400 mt-1">${item.description || item.alt || item.details || 'No description'}</p>
            </div>
            <a href="${item.link || item.url}" target="_blank" class="p-2 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
            </a>
        </div>
    `).join('');
    
    contentEl.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${listHtml}</div>`;

    // Render pagination
    if (totalPages > 1) {
        paginationEl.innerHTML = `
            <div class="flex justify-center items-center space-x-4">
                <button onclick="changeBookmarkPage(${page - 1})" ${page === 1 ? 'disabled' : ''} class="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
                <span class="text-slate-400">Page ${page} of ${totalPages}</span>
                <button onclick="changeBookmarkPage(${page + 1})" ${page === totalPages ? 'disabled' : ''} class="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
            </div>
        `;
    } else {
        paginationEl.innerHTML = '';
    }
}

function changeBookmarkPage(newPage) {
    const list = state.allData[state.bookmarkTab] || [];
    const totalPages = Math.ceil(list.length / state.pagination[state.bookmarkTab].size);
    
    if (newPage >= 1 && newPage <= totalPages) {
        state.pagination[state.bookmarkTab].page = newPage;
        const container = document.getElementById('tab-bookmarks');
        renderBookmarkContent(container);
    }
}

// --- Toolkit Rendering ---
function renderToolkit(container) {
    const icon = `<svg class="w-8 h-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>`;
    
    const categories = [...new Set(state.allData.toolkit.map(item => item.category))];
    const subCategories = [...new Set(state.allData.toolkit.map(item => item.sub_category).filter(Boolean))];

    let filterHtml = `
        <div class="mb-6 flex flex-wrap gap-4 items-center">
            <select id="toolkit-cat-filter" class="bg-slate-800 border border-slate-700 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                <option value="">All Categories</option>
                ${categories.map(cat => `<option value="${cat}" ${state.filters.toolkit.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
            </select>
            <select id="toolkit-subcat-filter" class="bg-slate-800 border border-slate-700 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                <option value="">All Sub-categories</option>
                 ${subCategories.map(sub => `<option value="${sub}" ${state.filters.toolkit.sub_category === sub ? 'selected' : ''}>${sub}</option>`).join('')}
            </select>
            <select id="toolkit-sort" class="bg-slate-800 border border-slate-700 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                <option value="asc" ${state.filters.toolkit.sort === 'asc' ? 'selected' : ''}>Sort A-Z</option>
                <option value="desc" ${state.filters.toolkit.sort === 'desc' ? 'selected' : ''}>Sort Z-A</option>
            </select>
        </div>
    `;

    container.innerHTML = renderPageHeader('DCO Toolkit', 'A searchable repository of essential commands and tools.', icon) + filterHtml + `<div id="toolkit-list"></div><div id="toolkit-pagination" class="mt-6"></div>`;
    
    const catFilter = container.querySelector('#toolkit-cat-filter');
    const subCatFilter = container.querySelector('#toolkit-subcat-filter');
    const sortFilter = container.querySelector('#toolkit-sort');
    
    const applyToolkitFilters = () => {
        state.filters.toolkit.category = catFilter.value;
        state.filters.toolkit.sub_category = subCatFilter.value;
        state.filters.toolkit.sort = sortFilter.value;
        state.pagination.toolkit.page = 1; // Reset pagination
        renderToolkitList(container);
    };

    catFilter.addEventListener('change', applyToolkitFilters);
    subCatFilter.addEventListener('change', applyToolkitFilters);
    sortFilter.addEventListener('change', applyToolkitFilters);

    renderToolkitList(container);
}

function renderToolkitList(container) {
    const listContainer = container.querySelector('#toolkit-list');
    const paginationContainer = container.querySelector('#toolkit-pagination');
    
    let filteredList = [...state.allData.toolkit];

    if (state.filters.toolkit.category) {
        filteredList = filteredList.filter(item => item.category === state.filters.toolkit.category);
    }
    if (state.filters.toolkit.sub_category) {
        filteredList = filteredList.filter(item => item.sub_category === state.filters.toolkit.sub_category);
    }

    filteredList.sort((a, b) => {
        const titleA = (a.details || '').toLowerCase();
        const titleB = (b.details || '').toLowerCase();
        if (state.filters.toolkit.sort === 'asc') {
            return titleA.localeCompare(titleB);
        }
        return titleB.localeCompare(titleA);
    });

    if (filteredList.length === 0) {
        listContainer.innerHTML = `<div class="text-center py-12 text-slate-500">No toolkit items match the current filters.</div>`;
        paginationContainer.innerHTML = '';
        return;
    }

    // Pagination
    const { page, size } = state.pagination.toolkit;
    const totalPages = Math.ceil(filteredList.length / size);
    const start = (page - 1) * size;
    const paginatedList = filteredList.slice(start, start + size);

    const listHtml = paginatedList.map(item => `
        <div class="bg-slate-800/50 border border-slate-800 rounded-lg mb-4 overflow-hidden">
            <div class="p-4">
                <div class="flex justify-between items-start">
                    <h3 class="text-lg font-bold text-slate-100">${item.details}</h3>
                    <div class="flex-shrink-0 ml-4 space-x-2">
                        ${item.category ? `<span class="bg-slate-700 text-indigo-300 text-xs font-semibold px-2.5 py-1 rounded-full">${item.category}</span>` : ''}
                        ${item.sub_category ? `<span class="bg-slate-700 text-green-300 text-xs font-semibold px-2.5 py-1 rounded-full">${item.sub_category}</span>` : ''}
                    </div>
                </div>
                <p class="text-sm text-slate-400 mt-2">${item.description}</p>
                <details class="mt-4">
                    <summary class="cursor-pointer font-semibold text-indigo-400 hover:text-indigo-300">View Commands</summary>
                    <div class="mt-2 bg-slate-900/70 p-4 border-t border-slate-800">
                        <pre class="bg-slate-900 p-3 rounded-md text-sm text-slate-300 overflow-x-auto"><code>${escapeHtml(item.commands)}</code></pre>
                        <button onclick="copyToClipboard(\`${escapeHtml(item.commands).replace(/`/g, '\\`')}\`)" class="mt-2 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-md transition-colors">Copy Commands</button>
                    </div>
                </details>
            </div>
        </div>
    `).join('');
    
    listContainer.innerHTML = listHtml;

    // Render pagination
    if (totalPages > 1) {
        paginationContainer.innerHTML = `
            <div class="flex justify-center items-center space-x-4">
                <button onclick="changeToolkitPage(${page - 1})" ${page === 1 ? 'disabled' : ''} class="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
                <span class="text-slate-400">Page ${page} of ${totalPages}</span>
                <button onclick="changeToolkitPage(${page + 1})" ${page === totalPages ? 'disabled' : ''} class="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
            </div>
        `;
    } else {
        paginationContainer.innerHTML = '';
    }
}

function changeToolkitPage(newPage) {
    let filteredList = [...state.allData.toolkit];
    if (state.filters.toolkit.category) {
        filteredList = filteredList.filter(item => item.category === state.filters.toolkit.category);
    }
    if (state.filters.toolkit.sub_category) {
        filteredList = filteredList.filter(item => item.sub_category === state.filters.toolkit.sub_category);
    }
    
    const totalPages = Math.ceil(filteredList.length / state.pagination.toolkit.size);
    
    if (newPage >= 1 && newPage <= totalPages) {
        state.pagination.toolkit.page = newPage;
        const container = document.getElementById('tab-toolkit');
        renderToolkitList(container);
    }
}

// --- Knowledge Base Rendering ---
function renderKnowledge(container) {
    const icon = `<svg class="w-8 h-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>`;
    
    let content = `
        ${renderPageHeader('Knowledge Base', 'Curated insights, playbooks, and how-to guides.', icon)}
        
        <!-- Smart Runbook Search -->
        <div class="mb-8 bg-gradient-to-r from-indigo-900/20 to-purple-900/20 border border-indigo-800/30 rounded-lg p-6">
            <div class="flex items-center justify-between mb-4">
                <div class="flex items-center space-x-3">
                    <span class="bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">BETA</span>
                    <h3 class="text-lg font-bold text-slate-100">🚀 Smart Runbook Search</h3>
                </div>
                <button onclick="showRunbookInfo()" class="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded-md transition-colors">ℹ️ INFO</button>
            </div>
            <div class="relative">
                <input type="text" id="smart-runbook-search" placeholder="🔍 Search Runbooks: Paste ticket title, [HOST_TYPE], e.g. [EC2IS4IEXN19]; more ways coming soon... (ESC to clear, Ctrl+R to focus)" class="w-full bg-slate-800 border border-slate-700 rounded-md py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500" autocomplete="off">
                <div id="runbook-detection-status" class="absolute right-3 top-1/2 -translate-y-1/2 hidden">
                    <div class="flex items-center space-x-2 text-sm text-slate-400">
                        <div class="w-2 h-2 bg-yellow-500 rounded-full pulse-dot"></div>
                        <span>Analyzing...</span>
                    </div>
                </div>
            </div>
            <div id="runbook-suggestions" class="mt-4 hidden">
                <h4 class="text-white font-bold mb-3 flex items-center space-x-2">
                    <span>🎯</span>
                    <span>Suggested Runbooks</span>
                </h4>
                <div id="runbook-suggestions-list"></div>
            </div>
        </div>
        
        <div class="mb-4 flex flex-wrap gap-2 items-center" id="knowledge-pills"></div>
        <div class="mb-6">
            <input type="search" id="knowledge-search" value="${escapeHtml(state.filters.knowledge.search)}" placeholder="Search knowledge base..." class="w-full bg-slate-800 border border-slate-700 rounded-md py-2 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
        </div>
        <div id="knowledge-list"></div>
        <div id="knowledge-pagination" class="mt-6"></div>
    `;
    
    container.innerHTML = content;
    
    const searchInput = container.querySelector('#knowledge-search');
    const runbookSearchInput = container.querySelector('#smart-runbook-search');
    
    searchInput.addEventListener('input', () => {
        state.filters.knowledge.search = searchInput.value;
        state.pagination.knowledge.page = 1; // Reset pagination
        renderKnowledgeList(container);
    });

    // Setup runbook search
    runbookSearchInput.addEventListener('input', (e) => {
        detectRunbooks(e.target.value);
    });

    renderKnowledgeList(container);
}

function renderKnowledgeList(container) {
    const listContainer = container.querySelector('#knowledge-list');
    const pillsContainer = container.querySelector('#knowledge-pills');
    const paginationContainer = container.querySelector('#knowledge-pagination');
    
    let filteredList = [...state.allData.knowledge];
    const { category, sub_category, search } = state.filters.knowledge;

    // Apply category filters
    if (category) {
        filteredList = filteredList.filter(item => item.category === category);
    }
    if (sub_category) {
        filteredList = filteredList.filter(item => item.sub_category === sub_category);
    }

    // Apply search query
    const query = search.toLowerCase();
    if (query) {
        filteredList = filteredList.filter(item => 
            Object.values(item).some(val => val && val.toString().toLowerCase().includes(query))
        );
    }

    // --- Render Pills ---
    const categories = [...new Set(state.allData.knowledge.map(i => i.category).filter(Boolean))];
    let pillsHtml = '';

    if(category || sub_category || search) {
        pillsHtml += `<button class="clear-filter-btn text-xs font-semibold px-3 py-1 rounded-full bg-red-600 text-white hover:bg-red-500 transition-colors">Clear All Filters</button>`;
    }
    
    if (!category) {
         categories.forEach(cat => {
            pillsHtml += `<button data-category="${cat}" class="pill-btn text-xs font-semibold px-3 py-1 rounded-full bg-slate-700 text-indigo-300 hover:bg-slate-600 transition-colors">${cat}</button>`;
        });
    } else {
        pillsHtml += `<span class="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-600 text-white">${category}</span>`;
        const subCategories = [...new Set(state.allData.knowledge.filter(i => i.category === category).map(i => i.sub_category).filter(Boolean))];
         subCategories.forEach(sub => {
            const isActive = sub_category === sub;
            pillsHtml += `<button data-subcategory="${sub}" class="pill-btn text-xs font-semibold px-3 py-1 rounded-full ${isActive ? 'bg-green-600 text-white' : 'bg-slate-700 text-green-300 hover:bg-slate-600'} transition-colors">${sub}</button>`;
        });
    }
    pillsContainer.innerHTML = pillsHtml;

    // Pagination
    const { page, size } = state.pagination.knowledge;
    const totalPages = Math.ceil(filteredList.length / size);
    const start = (page - 1) * size;
    const paginatedList = filteredList.slice(start, start + size);

    // --- Render List ---
    if (paginatedList.length === 0) {
        listContainer.innerHTML = `<div class="text-center py-12 text-slate-500">No knowledge entries match your search or filters.</div>`;
        paginationContainer.innerHTML = '';
    } else {
        const listHtml = paginatedList.map(item => `
        <div class="bg-slate-800/50 border border-slate-800 rounded-lg mb-4 relative">
            <div class="p-4">
                <h3 class="text-lg font-bold text-slate-100">${item.details}</h3>
                <div class="flex-shrink-0 mt-2 space-x-2">
                    ${item.category ? `<span class="bg-slate-700 text-indigo-300 text-xs font-semibold px-2.5 py-1 rounded-full">${item.category}</span>` : ''}
                    ${item.sub_category ? `<span class="bg-slate-700 text-green-300 text-xs font-semibold px-2.5 py-1 rounded-full">${item.sub_category}</span>` : ''}
                </div>
                <p class="text-sm text-slate-400 mt-3">${item.description}</p>
                <details class="mt-4 text-sm">
                    <summary class="cursor-pointer font-semibold text-indigo-400 hover:text-indigo-300">View Content</summary>
                    <div class="mt-2 p-3 bg-slate-900 rounded-md border border-slate-700 prose prose-invert prose-sm max-w-none" style="white-space: pre-wrap; line-height: 1.6;">${renderHtmlContent(item.commands)}</div>

		
		<button onclick="copyToClipboard(\`${escapeHtml(item.commands).replace(/`/g, '\\`')}\`)" class="mt-2 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-md transition-colors">Copy Content</button>
                </details>
            </div>
            <button title="Flag this entry" class="flag-btn absolute top-3 right-3 p-2 text-slate-500 hover:text-red-500 rounded-full transition-colors" data-id="${item.id}" data-title="${escapeHtml(item.details)}">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M3.71 2.86c.2-.2.45-.31.72-.31h10.14c.27 0 .52.11.72.31.2.2.31.45.31.72v7.16c0 .27-.11.52-.31.72l-4.08 4.08c-.2.2-.45.31-.72.31H6.5c-.27 0-.52-.11-.72-.31l-2.07-2.07a1.018 1.018 0 0 1-.31-.72V3.58c0-.27.11-.52.31-.72zM4.5 12.5l2 2h3.08l4.08-4.08V4.5H4.5v8z"></path></svg>
            </button>
        </div>
    `).join('');
        listContainer.innerHTML = listHtml;

        // Render pagination
        if (totalPages > 1) {
            paginationContainer.innerHTML = `
                <div class="flex justify-center items-center space-x-4">
                    <button onclick="changeKnowledgePage(${page - 1})" ${page === 1 ? 'disabled' : ''} class="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
                    <span class="text-slate-400">Page ${page} of ${totalPages}</span>
                    <button onclick="changeKnowledgePage(${page + 1})" ${page === totalPages ? 'disabled' : ''} class="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                </div>
            `;
        } else {
            paginationContainer.innerHTML = '';
        }
    }

    // Add event listeners for pills and flags
    pillsContainer.querySelectorAll('.pill-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.currentTarget.dataset.category) {
                state.filters.knowledge.category = e.currentTarget.dataset.category;
                state.filters.knowledge.sub_category = ''; // Reset sub-category
            }
            if (e.currentTarget.dataset.subcategory) {
                state.filters.knowledge.sub_category = e.currentTarget.dataset.subcategory;
            }
            state.pagination.knowledge.page = 1; // Reset pagination
            renderKnowledgeList(container);
        });
    });
    
    if (pillsContainer.querySelector('.clear-filter-btn')) {
        pillsContainer.querySelector('.clear-filter-btn').addEventListener('click', () => {
            state.filters.knowledge = { category: '', sub_category: '', search: '' };
            container.querySelector('#knowledge-search').value = '';
            state.pagination.knowledge.page = 1; // Reset pagination
            renderKnowledgeList(container);
        });
    }
    
    listContainer.querySelectorAll('.flag-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const { id, title } = e.currentTarget.dataset;
            openFlagModal(id, title);
        });
    });
}

function changeKnowledgePage(newPage) {
    let filteredList = [...state.allData.knowledge];
    const { category, sub_category, search } = state.filters.knowledge;

    if (category) {
        filteredList = filteredList.filter(item => item.category === category);
    }
    if (sub_category) {
        filteredList = filteredList.filter(item => item.sub_category === sub_category);
    }

    const query = search.toLowerCase();
    if (query) {
        filteredList = filteredList.filter(item => 
            Object.values(item).some(val => val && val.toString().toLowerCase().includes(query))
        );
    }
    
    const totalPages = Math.ceil(filteredList.length / state.pagination.knowledge.size);
    
    if (newPage >= 1 && newPage <= totalPages) {
        state.pagination.knowledge.page = newPage;
        const container = document.getElementById('tab-knowledge');
        renderKnowledgeList(container);
    }
}

function renderLabs(container) {
    const icon = `<svg class="w-8 h-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 3.75H6A2.25 2.25 0 0 0 3.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0 1 20.25 6v1.5m0 9V18A2.25 2.25 0 0 1 18 20.25h-1.5m-9 0H6A2.25 2.25 0 0 1 3.75 18v-1.5M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" d="M10.04 15.625l-1.32.793M10.04 8.375l-1.32-.793m3.24 8.043-1.32-.793m1.32.793 1.32.793m-3.24-8.043 1.32.793m-1.32-.793-1.32-.793m6.52 3.293.793-1.32m-.793 1.32-.793 1.32m-3.24-8.043.793 1.32m-.793-1.32-.793-1.32" /></svg>`;
    const labs = [
        { id: 'host-console-id', title: 'Host Console IP', placeholder: 'Host Asset ID', action: 'checkHostConsoleIP' },
        { id: 'rack-psc-health', title: 'Rack PSC Health', placeholder: 'Rack Asset ID', action: 'checkRackPSCHealth' },
        { id: 'host-bom-report', title: 'Host BOM Report', placeholder: 'Host HWID', action: 'checkHostBOMReport' },
        { id: 'host-bom-failure', title: 'Host BOM Failures', placeholder: 'Host HWID', action: 'checkHostBOMFailureReport' },
        { id: 'host-hwmon-record', title: 'Host HWMon Record', placeholder: 'Host HWID', action: 'checkHostHWMonRecord' },
        { id: 'rack-handoff', title: 'Rack Datatech Handoff', placeholder: 'Rack Asset ID', action: 'checkRackHandoff' },
        { id: 'rack-deployed', title: 'Rack Deployed (Strider)', placeholder: 'Rack Asset ID', action: 'checkRackDeployed' },
        { id: 'akl-nsm', title: 'AKL NSM (Hostname)', placeholder: 'Device Hostname', action: 'checkNSMHostname' },
        { id: 'akl-happoshu', title: 'Happoshu (Hostname)', placeholder: 'Device Hostname', action: 'checkHapposhuHostname' },
    ];

    const labsHtml = labs.map(lab => `
        <div class="bg-slate-800/50 border border-slate-800 rounded-lg p-4">
            <h3 class="font-bold text-slate-100">${lab.title}</h3>
            <div class="flex gap-2 mt-3">
                <input type="text" id="${lab.id}" placeholder="${lab.placeholder}" class="flex-grow bg-slate-800 border border-slate-700 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                <button onclick="LAB_ACTIONS.${lab.action}('${lab.id}')" class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm">Check</button>
            </div>
        </div>
    `).join('');

    container.innerHTML = `
        ${renderPageHeader('DCO Labs', 'A playground for experimental tools and prototypes.', icon)}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${labsHtml}
        </div>
    `;
}

function renderAdmin(container) {
    if (!state.adminUnlocked) {
        container.innerHTML = `<div class="text-center py-12"><p class="text-slate-500">Admin access required.</p><button onclick="showAdminLogin()" class="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Login</button></div>`;
        return;
    }

    const icon = `<svg class="w-8 h-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" /></svg>`;
    container.innerHTML = `
        ${renderPageHeader('Admin Panel', 'Manage all DCO Garage data.', icon)}
        <div class="flex flex-col md:flex-row gap-8">
            <div class="md:w-1/4">
                <nav id="admin-nav" class="flex flex-col space-y-2">
                    <button data-admin-tab="bookmarks" class="admin-nav-link text-left w-full py-2 px-4 rounded-md font-semibold hover:bg-slate-700 transition-colors">Bookmarks</button>
                    <button data-admin-tab="dcose" class="admin-nav-link text-left w-full py-2 px-4 rounded-md font-semibold hover:bg-slate-700 transition-colors">DCOSE</button>
                    <button data-admin-tab="toolkit" class="admin-nav-link text-left w-full py-2 px-4 rounded-md font-semibold hover:bg-slate-700 transition-colors">Toolkit</button>
                    <button data-admin-tab="knowledge" class="admin-nav-link text-left w-full py-2 px-4 rounded-md font-semibold hover:bg-slate-700 transition-colors">Knowledge</button>
                    <button data-admin-tab="flags" class="admin-nav-link text-left w-full py-2 px-4 rounded-md font-semibold hover:bg-slate-700 transition-colors">Flags</button>
                </nav>
            </div>
            <div id="admin-content" class="md:w-3/4"></div>
        </div>
    `;

    container.querySelectorAll('.admin-nav-link').forEach(link => {
        link.addEventListener('click', () => {
            state.adminCurrentTab = link.dataset.adminTab;
            renderAdminContent();
            container.querySelectorAll('.admin-nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    // Event delegation for the admin content area
    container.querySelector('#admin-content').addEventListener('click', e => {
        const target = e.target.closest('button');
        if (!target) return;

        const { tab, itemId, flagId, entryType, entryId } = target.dataset;

        if (target.classList.contains('add-btn')) {
            showAdminFormModal(null, tab);
        }
        if (target.classList.contains('edit-btn')) {
            const item = state.allData[tab].find(i => i.id == itemId);
            showAdminFormModal(item, tab);
        }
        if (target.classList.contains('delete-btn')) {
            showDeleteConfirmModal(itemId, tab);
        }
        if (target.classList.contains('resolve-flag-btn')) {
            handleResolveFlag(flagId);
        }
        if (target.classList.contains('view-flagged-entry-btn')) {
            handleViewFlaggedEntry(entryType, entryId);
        }
   if (target.classList.contains('unresolve-flag-btn')) {
    handleUnresolveFlag(flagId);
}
if (target.classList.contains('delete-flag-btn')) {
    handleDeleteFlag(flagId);
}
    });

    container.querySelector(`[data-admin-tab="${state.adminCurrentTab}"]`).classList.add('active');
    renderAdminContent();
}

function renderAdminContent() {
    const container = document.getElementById('admin-content');
    if (!container) return;
    const tab = state.adminCurrentTab;
    if (tab === 'flags') {
        renderAdminFlags(container);
    } else {
        renderAdminList(container, tab);
    }
}

function renderAdminList(container, tab) {
    const data = state.allData[tab] || [];
    const listHtml = data.map(item => `
        <div class="bg-slate-800 p-3 rounded-md mb-2 flex justify-between items-center text-sm">
            <span>${escapeHtml(item.name || item.details)}</span>
            <div>
                <button class="edit-btn text-indigo-400 hover:text-indigo-300 font-semibold px-2" data-item-id="${item.id}" data-tab="${tab}">Edit</button>
                <button class="delete-btn text-red-500 hover:text-red-400 font-semibold px-2" data-item-id="${item.id}" data-tab="${tab}">Delete</button>
            </div>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold capitalize">${tab}</h3>
            <button class="add-btn bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm" data-tab="${tab}">Add New ${tab.slice(0, -1)}</button>
        </div>
        <div class="space-y-2">
            ${data.length > 0 ? listHtml : `<p class="text-slate-500 text-center py-8">No items in this section.</p>`}
        </div>
    `;
}

function renderAdminFlags(container) {
// console.log('Rendering admin flags...', state.allData.flags);

// Better error handling for flags data
if (!state.allData.flags) {
    container.innerHTML = `<p class="text-red-500 text-center py-8">Error: No flags data available.</p>`;
    return;
}

if (!Array.isArray(state.allData.flags)) {
    console.error('Flags data is not an array:', state.allData.flags);
    container.innerHTML = `
        <div class="text-red-500 text-center py-8">
            <p>Error: Flags data format is incorrect.</p>
            <p class="text-sm mt-2">Expected array, got: ${typeof state.allData.flags}</p>
            <button onclick="debugFlags()" class="mt-4 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded">Debug Flags Data</button>
        </div>
    `;
    return;
}

// Separate flags by status
const allFlags = state.allData.flags;
const openFlags = allFlags.filter(f => f.flag_status === 'open');
const resolvedFlags = allFlags.filter(f => f.flag_status === 'resolved');

// console.log(`Total flags: ${allFlags.length}, Open flags: ${openFlags.length}, Resolved flags: ${resolvedFlags.length}`);

// Initialize flag view state if not exists
if (!state.flagsView) {
    state.flagsView = 'open'; // Default to open flags
}

const currentFlags = state.flagsView === 'open' ? openFlags : resolvedFlags;

container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
        <h3 class="text-xl font-bold capitalize">Flags Management</h3>
        <button onclick="refreshFlags()" class="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-md transition-colors">
            <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Refresh
        </button>
    </div>
    
    <!-- Flag Status Tabs -->
    <div class="mb-6">
        <div class="flex border-b border-slate-700">
            <button 
                onclick="switchFlagsView('open')" 
                class="flag-tab-btn flex items-center space-x-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all ${state.flagsView === 'open' ? 'text-red-400 border-red-400' : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-500'}"
            >
                <div class="w-2 h-2 bg-red-500 rounded-full ${openFlags.length === 0 ? 'opacity-30' : 'animate-pulse'}"></div>
                <span>Open Flags</span>
                <span class="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full min-w-[20px] text-center">${openFlags.length}</span>
            </button>
            
            <button 
                onclick="switchFlagsView('resolved')" 
                class="flag-tab-btn flex items-center space-x-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all ${state.flagsView === 'resolved' ? 'text-green-400 border-green-400' : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-500'}"
            >
                <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Resolved Flags</span>
                <span class="bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-full min-w-[20px] text-center">${resolvedFlags.length}</span>
            </button>
            
            <button 
                onclick="switchFlagsView('all')" 
                class="flag-tab-btn flex items-center space-x-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all ${state.flagsView === 'all' ? 'text-indigo-400 border-indigo-400' : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-500'}"
            >
                <div class="w-2 h-2 bg-indigo-500 rounded-full"></div>
                <span>All Flags</span>
                <span class="bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-full min-w-[20px] text-center">${allFlags.length}</span>
            </button>
        </div>
    </div>
    
    <!-- Flags Content -->
    <div id="flags-content">
        ${renderFlagsContent(currentFlags, state.flagsView)}
    </div>
`;
}

function renderFlagsContent(flags, viewType) {
if (flags.length === 0) {
    const emptyMessages = {
        'open': {
            icon: '🎉',
            title: 'No Open Flags',
            message: 'Great! All flags have been resolved.',
            color: 'text-green-500'
        },
        'resolved': {
            icon: '📝',
            title: 'No Resolved Flags',
            message: 'No flags have been resolved yet.',
            color: 'text-slate-500'
        },
        'all': {
            icon: '🏷️',
            title: 'No Flags',
            message: 'No flags have been created in the system.',
            color: 'text-slate-500'
        }
    };
    
    const empty = emptyMessages[viewType] || emptyMessages['all'];
    
    return `
		<div class="text-center py-12">
			<div class="text-6xl mb-4">${empty.icon}</div>
			<h4 class="font-semibold text-slate-200">${empty.title}</h4>
			<p class="text-slate-400">${empty.message}</p>
		</div>
	`;

}

const flagsHtml = flags.map(flag => {
    const isResolved = flag.flag_status === 'resolved';
    const statusColor = isResolved ? 'bg-green-600' : 'bg-red-600';
    const statusText = isResolved ? 'RESOLVED' : 'OPEN';
    
    return `
        <div class="bg-slate-800 border ${isResolved ? 'border-green-800/30' : 'border-red-800/30'} rounded-lg p-4 mb-3 transition-all hover:border-opacity-60">
            <div class="flex justify-between items-start mb-3">
                <div class="flex-1">
                    <div class="flex items-center space-x-3 mb-2">
                        <h4 class="font-semibold text-slate-200">${escapeHtml(flag.entry_title || getEntryTitleById(flag.entry_type, flag.entry_id))}</h4>

                        <span class="text-xs px-2 py-1 rounded-full ${statusColor} text-white font-bold">
                            ${statusText}
                        </span>
                        <span class="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-300">
                            ${escapeHtml(flag.entry_type || 'Unknown')}
                        </span>
                    </div>
                    
                    ${flag.flag_reason ? `
                        <div class="mb-3">
                            <p class="text-xs font-medium text-slate-400 mb-1">Reason:</p>
                            <p class="text-sm text-slate-300 bg-slate-900/50 rounded p-2 border-l-2 ${isResolved ? 'border-green-500' : 'border-yellow-500'}">${escapeHtml(flag.flag_reason)}</p>
                        </div>
                    ` : ''}
                    
                    <div class="flex flex-wrap gap-4 text-xs text-slate-500">
                        ${flag.flag_time ? `
                            <div class="flex items-center space-x-1">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                                <span>Flagged: ${new Date(flag.flag_time).toLocaleString()}</span>
                            </div>
                        ` : ''}
                        
                        ${isResolved && flag.resolved_time ? `
                            <div class="flex items-center space-x-1 text-green-400">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                                </svg>
                                <span>Resolved: ${new Date(flag.resolved_time).toLocaleString()}</span>
                            </div>
                        ` : ''}
                        
                        ${flag.resolved_by ? `
                            <div class="flex items-center space-x-1 text-green-400">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                </svg>
                                <span>By: ${escapeHtml(flag.resolved_by)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
            
            <div class="flex gap-2 pt-3 border-t border-slate-700">
                ${!isResolved ? `
                    <button class="resolve-flag-btn text-xs bg-green-600 hover:bg-green-500 text-white font-semibold py-2 px-3 rounded-md transition-colors flex items-center space-x-1" data-flag-id="${flag.id}">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                        <span>Resolve</span>
                    </button>
                ` : `
                    <button class="unresolve-flag-btn text-xs bg-yellow-600 hover:bg-yellow-500 text-white font-semibold py-2 px-3 rounded-md transition-colors flex items-center space-x-1" data-flag-id="${flag.id}">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                        <span>Reopen</span>
                    </button>
                `}
                
                <button class="view-flagged-entry-btn text-xs bg-slate-600 hover:bg-slate-500 text-white font-semibold py-2 px-3 rounded-md transition-colors flex items-center space-x-1" data-entry-type="${flag.entry_type}" data-entry-id="${flag.entry_id}">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                    </svg>
                    <span>View Entry</span>
                </button>
                
                ${viewType === 'all' ? `
                    <button class="delete-flag-btn text-xs bg-red-600 hover:bg-red-500 text-white font-semibold py-2 px-3 rounded-md transition-colors flex items-center space-x-1" data-flag-id="${flag.id}">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                        <span>Delete</span>
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}).join('');

return `<div class="space-y-3">${flagsHtml}</div>`;
}

function switchFlagsView(viewType) {
state.flagsView = viewType;
renderAdminContent(); // Re-render the admin content
}

async function handleUnresolveFlag(flagId) {
const flag = state.allData.flags.find(f => f.id == flagId);
if (!flag) {
    showToast('Flag not found', 'error');
    return;
}

try {
    showToast('🔄 Reopening flag...', 'info');

    const response = await fetch(`${DCO_API_CONFIG.flags}/${flagId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            flag_status: 'open',
            reopened_time: new Date().toISOString(),
            reopened_by: 'admin'
        })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    // Update local state
    const flagIndex = state.allData.flags.findIndex(f => f.id == flagId);
    if (flagIndex > -1) {
        state.allData.flags[flagIndex].flag_status = 'open';
        state.allData.flags[flagIndex].reopened_time = new Date().toISOString();
        delete state.allData.flags[flagIndex].resolved_time;
    }

    renderAdminContent();
    showToast('🔄 Flag reopened successfully!', 'success');

} catch (error) {
    console.error('Failed to reopen flag:', error);
    showToast(`❌ Failed to reopen flag: ${error.message}`, 'error');
}
}

async function handleDeleteFlag(flagId) {
const flag = state.allData.flags.find(f => f.id == flagId);
if (!flag) {
    showToast('Flag not found', 'error');
    return;
}

// Show confirmation modal (you can create a similar one to the resolve modal)
const confirmed = confirm(`Are you sure you want to permanently delete this flag?\n\nEntry: ${flag.entry_title || 'Unknown'}\nThis action cannot be undone.`);
if (!confirmed) return;

try {
    showToast('🗑️ Deleting flag...', 'info');

    const response = await fetch(`${DCO_API_CONFIG.flags}/${flagId}`, {
        method: 'DELETE'
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    // Remove from local state
    state.allData.flags = state.allData.flags.filter(f => f.id !== flagId);

    renderAdminContent();
    showToast('🗑️ Flag deleted successfully!', 'success');

} catch (error) {
    console.error('Failed to delete flag:', error);
    showToast(`❌ Failed to delete flag: ${error.message}`, 'error');
}
}


// Add these functions to help debug the flags issue
function debugFlags() {
// console.log('=== FLAGS DEBUG INFO ===');
// console.log('Raw API response:', state.allData.flags);
// console.log('Data type:', typeof state.allData.flags);
// console.log('Is array:', Array.isArray(state.allData.flags));

if (Array.isArray(state.allData.flags)) {
    // console.log('Length:', state.allData.flags.length);
    // console.log('Sample items:', state.allData.flags.slice(0, 3));
    // console.log('All statuses:', state.allData.flags.map(f => f.flag_status));
}

// Show in modal for easier viewing
const debugData = JSON.stringify(state.allData.flags, null, 2);
const modalHtml = `
    <div id="debug-modal" class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
            <h3 class="text-xl font-bold text-slate-100 mb-4">Flags Debug Data</h3>
            <pre class="bg-slate-900 p-4 rounded-md text-sm text-slate-300 overflow-x-auto">${escapeHtml(debugData)}</pre>
            <button onclick="closeModal('debug-modal')" class="mt-4 bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-md">Close</button>
        </div>
    </div>
`;
DOMElements.modalContainer.innerHTML = modalHtml;
}

async function refreshFlags() {
showToast('Refreshing flags data...', 'info');
try {
    const response = await fetch(DCO_API_CONFIG.flags);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    
    // console.log('Fresh flags data:', data);
    
    // Handle both array and object responses
    if (Array.isArray(data)) {
        state.allData.flags = data;
    } else if (data.flags && Array.isArray(data.flags)) {
        state.allData.flags = data.flags;
    } else {
        console.warn('Unexpected flags data format:', data);
        state.allData.flags = [];
    }
    
    renderAdminContent(); // Re-render the admin content
    showToast(`Refreshed: ${state.allData.flags.length} flags loaded`, 'success');
} catch (error) {
    console.error('Failed to refresh flags:', error);
    showToast('Failed to refresh flags data', 'error');
}
}



// --- UI Components (Modals, Toasts) & CRUD Handlers ---

async function handleResolveFlag(flagId) {
const flag = state.allData.flags.find(f => f.id == flagId);
if (!flag) {
    showToast('Flag not found', 'error');
    return;
}

// Show custom confirmation modal instead of browser confirm()
showResolveConfirmModal(flag, flagId);
}

function showResolveConfirmModal(flag, flagId) {
const modalHtml = `
    <div id="resolve-confirm-modal" class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-0 w-full max-w-md modal-fade-in overflow-hidden">
            <!-- Header with gradient -->
            <div class="bg-gradient-to-r from-green-600 to-emerald-600 p-6 text-white">
                <div class="flex items-center space-x-3">
                    <div class="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                    <div>
                        <h3 class="text-xl font-bold">Resolve Flag</h3>
                        <p class="text-green-100 text-sm">Mark this flag as resolved</p>
                    </div>
                </div>
            </div>
            
            <!-- Content -->
            <div class="p-6">
                <div class="mb-6">
                    <div class="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                        <div class="flex items-start space-x-3">
                            <div class="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2h4a1 1 0 110 2h-1v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6H3a1 1 0 110-2h4z"></path>
                                </svg>
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="font-semibold text-slate-200 mb-1">${escapeHtml(flag.entry_title || 'Unknown Entry')}</p>
                                <p class="text-sm text-slate-400 mb-2">
                                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-700 text-slate-300">
                                        ${escapeHtml(flag.entry_type || 'Unknown')}
                                    </span>
                                </p>
                                ${flag.flag_reason ? `
                                    <div class="mt-3">
                                        <p class="text-xs font-medium text-slate-400 mb-1">Reason:</p>
                                        <p class="text-sm text-slate-300 bg-slate-800 rounded p-2 border-l-2 border-yellow-500">${escapeHtml(flag.flag_reason)}</p>
                                    </div>
                                ` : ''}
                                ${flag.flag_time ? `
                                    <p class="text-xs text-slate-500 mt-2">
                                        <svg class="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                        </svg>
                                        Flagged: ${new Date(flag.flag_time).toLocaleString()}
                                    </p>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <div class="flex items-start space-x-3">
                        <svg class="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <div>
                            <p class="text-sm font-medium text-green-800">This action will:</p>
                            <ul class="text-sm text-green-700 mt-1 space-y-1">
                                <li>• Mark the flag as resolved</li>
                                <li>• Remove it from the active flags list</li>
                                <li>• Record the resolution timestamp</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Actions -->
            <div class="bg-slate-900/30 px-6 py-4 flex gap-3 justify-end">
                <button id="resolve-cancel" class="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 bg-slate-700 hover:bg-slate-600 rounded-lg transition-all duration-200 border border-slate-600 hover:border-slate-500">
                    <svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                    Cancel
                </button>
                <button id="resolve-confirm" class="px-6 py-2 text-sm font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105">
                    <svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    Resolve Flag
                </button>
            </div>
        </div>
    </div>
`;

DOMElements.modalContainer.innerHTML = modalHtml;

// Add event listeners
document.getElementById('resolve-cancel').addEventListener('click', () => {
    closeModal('resolve-confirm-modal');
});

document.getElementById('resolve-confirm').addEventListener('click', () => {
    closeModal('resolve-confirm-modal');
    performFlagResolution(flagId);
});

// Close on escape key
const handleEscape = (e) => {
    if (e.key === 'Escape') {
        closeModal('resolve-confirm-modal');
        document.removeEventListener('keydown', handleEscape);
    }
};
document.addEventListener('keydown', handleEscape);

// Close on backdrop click
document.getElementById('resolve-confirm-modal').addEventListener('click', (e) => {
    if (e.target.id === 'resolve-confirm-modal') {
        closeModal('resolve-confirm-modal');
    }
});
}

async function performFlagResolution(flagId) {
try {
    // Show loading toast
    showToast('🔄 Resolving flag...', 'info');

    // Make API call
    const response = await fetch(`${DCO_API_CONFIG.flags}/${flagId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            flag_status: 'resolved',
            resolved_time: new Date().toISOString(),
            resolved_by: 'admin'
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    // Update local state
    const flagIndex = state.allData.flags.findIndex(f => f.id == flagId);
    if (flagIndex > -1) {
        state.allData.flags[flagIndex].flag_status = 'resolved';
        state.allData.flags[flagIndex].resolved_time = new Date().toISOString();
        state.allData.flags[flagIndex].resolved_by = 'admin';
    }

    // Re-render and show success
    renderAdminContent();
    showToast('✅ Flag resolved successfully!', 'success');

} catch (error) {
    console.error('Failed to resolve flag:', error);
    showToast(`❌ Failed to resolve flag: ${error.message}`, 'error');
}
}



function handleViewFlaggedEntry(entryType, entryId) {
// console.log('🔍 Looking for flagged entry:', { entryType, entryId });

// Map entry types to dataset keys
const typeToDatasetMap = {
    'Knowledge': 'knowledge',
    'knowledge': 'knowledge',
    'Toolkit': 'toolkit', 
    'toolkit': 'toolkit',
    'Bookmark': 'bookmarks',
    'bookmark': 'bookmarks',
    'bookmarks': 'bookmarks',
    'DCOSE': 'dcose',
    'dcose': 'dcose'
};

const dataSetKey = typeToDatasetMap[entryType];
// console.log('📊 Dataset key:', dataSetKey);

if (!dataSetKey) {
    console.error('❌ Unknown entry type:', entryType);
    showToast(`Unknown entry type: ${entryType}`, 'error');
    return;
}

const dataSet = state.allData[dataSetKey];
// console.log('📋 Dataset:', dataSet?.length, 'items');

if (!dataSet || !Array.isArray(dataSet)) {
    console.error('❌ Dataset not found or invalid:', dataSetKey);
    showToast(`Dataset not found: ${dataSetKey}`, 'error');
    return;
}

// Try both string and number comparison for ID
const entry = dataSet.find(item => item.id == entryId || item.id === entryId || item.id === String(entryId) || item.id === Number(entryId));
// console.log('🎯 Found entry:', entry);

if (entry) {
    // Get the entry title/name for better UX
    const entryTitle = entry.name || entry.details || entry.title || `${entryType} Entry`;
    showAdminFormModal(entry, dataSetKey);
    showToast(`📝 Opening: ${entryTitle}`, 'success');
} else {
    console.error('❌ Entry not found in dataset:', { entryId, dataSetKey, availableIds: dataSet.map(i => i.id) });
    showToast(`Could not find entry with ID ${entryId} in ${dataSetKey}`, 'error');
}
}



async function handleAdminFormSubmit(e, item, tab) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());
    const isEditing = item !== null;

    const url = isEditing ? `${DCO_API_CONFIG[tab]}/${item.id}` : DCO_API_CONFIG[tab];
    const method = isEditing ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `API error: ${response.statusText}`);
        }

        showToast(`${tab.slice(0, -1)} ${isEditing ? 'updated' : 'added'} successfully!`, 'success');
        await fetchAllData(true);
        renderAdminContent(); 
        closeModal('admin-form-modal');

    } catch (error) {
        console.error('Failed to submit form:', error);
        showToast(`Error: ${error.message}`, 'error');
    }
}

function getEntryTitleById(entryType, entryId) {
const typeToDatasetMap = {
    'Knowledge': 'knowledge',
    'knowledge': 'knowledge',
    'Toolkit': 'toolkit', 
    'toolkit': 'toolkit',
    'Bookmark': 'bookmarks',
    'bookmark': 'bookmarks',
    'bookmarks': 'bookmarks',
    'DCOSE': 'dcose',
    'dcose': 'dcose'
};

const dataSetKey = typeToDatasetMap[entryType];
if (!dataSetKey) return `${entryType} Entry`;

const dataSet = state.allData[dataSetKey];
if (!dataSet || !Array.isArray(dataSet)) return `${entryType} Entry`;

const entry = dataSet.find(item => item.id == entryId);
if (!entry) return `${entryType} Entry (ID: ${entryId})`;

return entry.name || entry.details || entry.title || `${entryType} Entry`;
}




function showAdminFormModal(item, tab) {
    const isEditing = item !== null;
    const title = isEditing ? `Edit ${tab.slice(0,-1)}` : `Add ${tab.slice(0,-1)}`;

    const fieldDefinitions = {
        bookmarks: [ { name: 'name', label: 'Name', required: true }, { name: 'link', label: 'Link', required: true }, { name: 'description', label: 'Description', type: 'textarea' } ],
        dcose: [ { name: 'name', label: 'Name', required: true }, { name: 'link', label: 'Link', required: true }, { name: 'description', label: 'Description', type: 'textarea' } ],
        toolkit: [ { name: 'details', label: 'Title', required: true }, { name: 'category', label: 'Category', required: true }, { name: 'sub_category', label: 'Sub-category' }, { name: 'description', label: 'Description', type: 'textarea' }, { name: 'commands', label: 'Commands', type: 'textarea', required: true } ],
        knowledge: [ { name: 'details', label: 'Title', required: true }, { name: 'category', label: 'Category', required: true }, { name: 'sub_category', label: 'Sub-category' }, { name: 'description', label: 'Description', type: 'textarea' }, { name: 'commands', label: 'Content', type: 'textarea', required: true } ]
    };
    
    const fields = fieldDefinitions[tab] || [];
    
    const formFieldsHtml = fields.map(field => {
        const value = isEditing && item[field.name] ? escapeHtml(item[field.name]) : '';
        if (field.type === 'textarea') {
            return `<div class="mb-4">
                        <label for="form-${field.name}" class="block text-sm font-medium text-slate-400 mb-1">${field.label}</label>
                        <textarea id="form-${field.name}" name="${field.name}" rows="5" class="w-full bg-slate-900 border border-slate-700 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" ${field.required ? 'required' : ''}>${value}</textarea>
                    </div>`;
        }
        return `<div class="mb-4">
                    <label for="form-${field.name}" class="block text-sm font-medium text-slate-400 mb-1">${field.label}</label>
                    <input type="text" id="form-${field.name}" name="${field.name}" value="${value}" class="w-full bg-slate-900 border border-slate-700 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" ${field.required ? 'required' : ''}>
                </div>`;
    }).join('');

    const modalHtml = `
        <div id="admin-form-modal" class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <form id="admin-form" class="bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-8 w-full max-w-lg modal-fade-in max-h-[90vh] overflow-y-auto">
                <h3 class="text-2xl font-bold text-slate-100 mb-6">${title}</h3>
                ${formFieldsHtml}
                <div class="flex gap-4 justify-end mt-6">
                    <button type="button" id="admin-form-cancel" class="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Cancel</button>
                    <button type="submit" class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Save Changes</button>
                </div>
            </form>
        </div>
    `;
    DOMElements.modalContainer.innerHTML = modalHtml;

    document.getElementById('admin-form-cancel').addEventListener('click', () => closeModal('admin-form-modal'));
    document.getElementById('admin-form').addEventListener('submit', (e) => handleAdminFormSubmit(e, item, tab));
}

async function showDeleteConfirmModal(itemId, tab) {
    const item = state.allData[tab].find(i => i.id == itemId);
    if (!item) return;

    const modalHtml = `
        <div id="delete-confirm-modal" class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-8 w-full max-w-md modal-fade-in">
                <h3 class="text-2xl font-bold text-slate-100 mb-2">Confirm Deletion</h3>
                <p class="text-slate-400 mb-6">Are you sure you want to delete "${escapeHtml(item.name || item.details)}"? This action cannot be undone.</p>
                <div class="flex gap-4 justify-end">
                    <button id="delete-cancel" class="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Cancel</button>
                    <button id="delete-confirm" class="bg-red-600 hover:bg-red-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Delete</button>
                </div>
            </div>
        </div>
    `;
    DOMElements.modalContainer.innerHTML = modalHtml;

    document.getElementById('delete-cancel').addEventListener('click', () => closeModal('delete-confirm-modal'));
    document.getElementById('delete-confirm').addEventListener('click', async () => {
        try {
            const response = await fetch(`${DCO_API_CONFIG[tab]}/${itemId}`, { method: 'DELETE' });
             if (!response.ok) {
                throw new Error(`API error: ${response.statusText}`);
            }
            showToast('Item deleted successfully!', 'success');
            await fetchAllData(true);
            renderAdminContent();
            closeModal('delete-confirm-modal');
        } catch (error) {
            console.error('Failed to delete item:', error);
            showToast(`Error: Could not delete item.`, 'error');
        }
    });
}

function showAdminLogin() {
    const modalHtml = `
        <div id="admin-login-modal" class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-8 w-full max-w-sm modal-fade-in">
                <h3 class="text-2xl font-bold text-center text-slate-100 mb-6">Admin Access</h3>
                <input type="password" id="admin-password-input" placeholder="Enter password" class="w-full text-center bg-slate-900 border border-slate-700 rounded-md py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4">
                <div class="flex gap-4">
                    <button id="admin-cancel" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Cancel</button>
                    <button id="admin-unlock" class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Unlock</button>
                </div>
            </div>
        </div>
    `;
    DOMElements.modalContainer.innerHTML = modalHtml;

    const passwordInput = document.getElementById('admin-password-input');
    
    document.getElementById('admin-unlock').addEventListener('click', () => {
        if (passwordInput.value === 'AKL@060') { // Hardcoded password
            state.adminUnlocked = true;
            closeModal('admin-login-modal');
            showToast('Admin access granted!', 'success');
            switchTab('admin');
        } else {
            showToast('Incorrect password.', 'error');
            passwordInput.value = '';
            passwordInput.focus();
        }
    });

    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('admin-unlock').click();
        }
    });

    document.getElementById('admin-cancel').addEventListener('click', () => closeModal('admin-login-modal'));
    passwordInput.focus();
}

async function openFlagModal(entryId, entryTitle) {
    const modalHtml = `
        <div id="flag-modal" class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-8 w-full max-w-md modal-fade-in">
                <h3 class="text-2xl font-bold text-slate-100 mb-2">Flag Content</h3>
                <p class="text-slate-400 mb-4">You are flagging: <strong>${entryTitle}</strong></p>
                <textarea id="flag-reason" placeholder="Please provide a reason for flagging (optional)..." class="w-full bg-slate-900 border border-slate-700 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4" rows="4"></textarea>
                <div class="flex gap-4 justify-end">
                    <button id="flag-cancel" class="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Cancel</button>
                    <button id="flag-submit" class="bg-red-600 hover:bg-red-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Submit Flag</button>
                </div>
            </div>
        </div>
    `;
    DOMElements.modalContainer.innerHTML = modalHtml;
    document.getElementById('flag-submit').addEventListener('click', async () => {
const submitButton = document.getElementById('flag-submit');
const originalText = submitButton.textContent;

try {
    // Show loading state
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';
    
    // Determine the entry type based on current tab or context
    let entryType = 'Knowledge'; // Default
    if (state.currentTab === 'toolkit') {
        entryType = 'Toolkit';
    } else if (state.currentTab === 'bookmarks') {
        entryType = 'Bookmark';
    } else if (state.currentTab === 'knowledge') {
        entryType = 'Knowledge';
    }
    
    const payload = {
        entry_id: entryId,
        entry_title: entryTitle, // This should already contain the proper title
        entry_type: entryType,
        flag_reason: document.getElementById('flag-reason').value,
        flag_status: 'open',
        flag_time: new Date().toISOString(),
        flagged_by: 'user'
    };
    
    // console.log('🚩 Submitting flag:', payload);
    
    const response = await fetch(DCO_API_CONFIG.flags, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to submit flag');
    }
    
    // Refresh the flags data
    await fetchAllData(true);
    showToast('Content flagged successfully. Thank you for your feedback.', 'success');
    closeModal('flag-modal');
    
} catch(error) {
    console.error('Flag submission error:', error);
    showToast(`Error submitting flag: ${error.message}`, 'error');
    
    // Reset button
    submitButton.disabled = false;
    submitButton.textContent = originalText;
}
});



    document.getElementById('flag-cancel').addEventListener('click', () => closeModal('flag-modal'));
}

function showToast(message, type = 'success') {
const colors = {
    success: 'from-green-500 to-emerald-500',
    error: 'from-red-500 to-rose-500',
    info: 'from-blue-500 to-indigo-500',
    warning: 'from-yellow-500 to-orange-500'
};

const icons = {
    success: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`,
    error: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`,
    info: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
    warning: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"></path></svg>`
};

const toast = document.createElement('div');
toast.className = `toast-animate text-white font-medium py-3 px-4 rounded-lg shadow-xl bg-gradient-to-r ${colors[type]} border border-white/20 backdrop-blur-sm`;
toast.innerHTML = `
    <div class="flex items-center space-x-3">
        <div class="flex-shrink-0">${icons[type]}</div>
        <span>${message}</span>
    </div>
`;

DOMElements.toastContainer.appendChild(toast);
setTimeout(() => toast.remove(), 4000);
}


function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.remove();
    document.body.style.overflow = 'auto';
    if (lastFocusedElement) {
        lastFocusedElement.focus();
        lastFocusedElement = null;
    }
}

function performGlobalSearch(query) {
    if (!query.trim()) {
        closeModal('search-results-modal');
        return;
    }

    const q = query.toLowerCase();
    let results = [];

    const match = (fields) => fields.some(f => f && f.toLowerCase().includes(q));
    
    state.allData.bookmarks.forEach(i => { if (match([i.name, i.link, i.description])) results.push({ type: 'Bookmark', ...i }); });
    state.allData.dcose.forEach(i => { if (match([i.name, i.link, i.description])) results.push({ type: 'DCOSE', ...i }); });
    state.allData.toolkit.forEach(i => { if (match([i.details, i.category, i.description, i.commands])) results.push({ type: 'Toolkit', ...i }); });
    state.allData.knowledge.forEach(i => { if (match([i.details, i.category, i.description, i.commands])) results.push({ type: 'Knowledge', ...i }); });
    
    showSearchResults(results, q);
}

function showSearchResults(results, query) {
if (!query.trim()) {
    closeModal('search-results-modal');
    return;
}

const resultsHtml = results.length === 0 
    ? `<div class="text-center py-12 text-slate-500">No results found for <strong>${escapeHtml(query)}</strong> 😓</div>`
    : results.map((item, index) => {
        let body = `
            <div class="flex items-center space-x-2 mb-2">
                <span class="text-xs font-semibold px-2 py-1 rounded-full bg-slate-700 text-indigo-300">${item.type}</span>
            </div>
            <h4 class="font-bold text-slate-100 mb-1">${highlight(item.name || item.details, query)}</h4>
        `;
        
        if (item.description) {
            body += `<p class="text-sm text-slate-400 mb-2">${highlight(item.description, query)}</p>`;
        }
        
        // Different behavior based on content type
        if (item.type === 'Bookmark' || item.type === 'DCOSE') {
            // Clickable links - open in new tab
            body += `<div class="mt-2"><a href="${item.link || item.url}" target="_blank" class="text-xs text-indigo-400 hover:text-indigo-300 underline">${escapeHtml(item.link || item.url || '')}</a></div>`;
            
            return `
                <div class="search-result-card bg-slate-800/50 border border-slate-700 rounded-lg p-4 mb-3 cursor-pointer hover:border-indigo-500 transition-all" onclick="window.open('${item.link || item.url}', '_blank'); showToast('🚀 Opening: ${escapeHtml(item.name || item.details)}', 'success');">
                    ${body}
                </div>
            `;
        } else {
            // Toolkit/Knowledge - show view content button
            body += `
                <div class="mt-3">
                    <button class="btn text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-md transition-colors" onclick="toggleSearchCardContent(this, event)">View Content</button>
                    <span class="copy-btn-wrap ml-2" style="display:none;">
                        <button class="btn copy-btn text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded-md transition-colors" onclick="copySearchCardContent(this, event)">Copy</button>
                    </span>
                </div>
                <div class="search-content" style="display:none; margin-top:12px; font-size:14px; border-top:1px solid #374151; padding-top:8px; white-space: pre-wrap; line-height: 1.6; max-height:300px; overflow-y:auto; background: #1e293b; padding: 12px; border-radius: 6px;">
                    ${renderHtmlContent(item.commands || item.content || '')}
                </div>
            `;
            
            return `
                <div class="search-result-card bg-slate-800/50 border border-slate-700 rounded-lg p-4 mb-3">
                    ${body}
                </div>
            `;
        }
    }).join('');

const modalHtml = `
    <div id="search-results-modal" class="fixed inset-0 z-30 flex items-start justify-center pt-20">
        <!-- Backdrop that doesn't cover navbar -->
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onclick="closeModal('search-results-modal')"></div>
        
        <!-- Search Results Container -->
        <div class="relative bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[75vh] overflow-hidden modal-fade-in mx-4">
            <!-- Header -->
            <div class="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white sticky top-0 z-10">
                <div class="flex justify-between items-center">
                    <div class="flex items-center space-x-3">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                        </svg>
                        <h3 class="text-lg font-bold">Search Results</h3>
                    </div>
                    <div class="flex items-center space-x-3">
                        <span class="text-indigo-100 text-sm">${results.length} result(s) found</span>
                        <button onclick="closeModal('search-results-modal')" class="text-white hover:text-gray-200 text-2xl font-bold leading-none">&times;</button>
                    </div>
                </div>
                
                <!-- Search Query Display -->
                <div class="mt-3 flex items-center space-x-2 bg-white/10 rounded-lg px-3 py-2">
                    <svg class="w-4 h-4 text-indigo-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                    <span class="text-indigo-100 text-sm">Searching for: <strong>"${escapeHtml(query)}"</strong></span>
                    <button onclick="focusSearchBar()" class="text-indigo-200 hover:text-white text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded transition-colors">
                        Edit Search
                    </button>
                </div>
            </div>
            
            <!-- Results Content -->
            <div class="p-6 overflow-y-auto" style="max-height: calc(75vh - 140px);">
                ${resultsHtml}
            </div>
            
            <!-- Footer with helpful tips -->
            <div class="bg-slate-900/50 px-6 py-3 border-t border-slate-700 text-xs text-slate-400">
                <div class="flex items-center justify-between">
                    <span>💡 Tip: Use the search bar above to refine your search</span>
                    <span>Press <kbd class="bg-slate-700 px-1 rounded">Esc</kbd> to close</span>
                </div>
            </div>
        </div>
    </div>
`;

DOMElements.modalContainer.innerHTML = modalHtml;
}

// Add this helper function to focus back on the search bar
function focusSearchBar() {
closeModal('search-results-modal');
DOMElements.globalSearchBar.focus();
DOMElements.globalSearchBar.select(); // Select all text for easy editing
}


// Add these helper functions for the search content toggle
function toggleSearchCardContent(btn, event) {
event.stopPropagation();

// Find elements more reliably
const searchCard = btn.closest('.search-result-card');
const contentDiv = searchCard.querySelector('.search-content');
const copyWrap = searchCard.querySelector('.copy-btn-wrap');

if (!contentDiv || !copyWrap) {
    showToast('Content elements not found', 'error');
    return;
}

const isShowing = contentDiv.style.display === 'block';

contentDiv.style.display = isShowing ? 'none' : 'block';
copyWrap.style.display = isShowing ? 'none' : 'inline-block';
btn.textContent = isShowing ? 'View Content' : 'Hide Content';

// Add smooth transition effect
if (!isShowing) {
    contentDiv.style.opacity = '0';
    setTimeout(() => {
        contentDiv.style.opacity = '1';
        contentDiv.style.transition = 'opacity 0.3s ease';
    }, 10);
}
}


function copySearchCardContent(copyBtn, event) {
event.stopPropagation();

// Find the content div more reliably
const searchCard = copyBtn.closest('.search-result-card');
const contentDiv = searchCard.querySelector('.search-content');

if (!contentDiv) {
    showToast('Content not found', 'error');
    return;
}

const text = contentDiv.textContent || contentDiv.innerText || '';

if (!text.trim()) {
    showToast('No content to copy', 'error');
    return;
}

navigator.clipboard.writeText(text).then(() => {
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    copyBtn.style.backgroundColor = '#059669'; // Green color
    
    setTimeout(() => { 
        copyBtn.textContent = originalText;
        copyBtn.style.backgroundColor = ''; // Reset to original
    }, 1500);
    
    showToast('Content copied to clipboard! 📋', 'success');
}).catch(() => {
    // Fallback for older browsers
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        showToast('Content copied to clipboard! 📋', 'success');
    } catch (err) {
        showToast('Failed to copy content', 'error');
    }
});
}


// Also add this helper function for highlighting
function highlight(text, query) {
if (!text || !query) return escapeHtml(text || '');
const regex = new RegExp(`(${query.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|\#\s]/g, '\\$&')})`, 'gi');
return escapeHtml(text).replace(regex, '<span class="bg-yellow-500/30 text-yellow-300">$1</span>');
}


// ✅ NEW: Toggle content in search results
function toggleSearchCardContent(btn, event) {
event.stopPropagation();

// Find elements more reliably
const searchCard = btn.closest('.search-result-card');
const contentDiv = searchCard.querySelector('.search-content');
const copyWrap = searchCard.querySelector('.copy-btn-wrap');

if (!contentDiv || !copyWrap) {
    showToast('Content elements not found', 'error');
    return;
}

const isShowing = contentDiv.style.display === 'block';

contentDiv.style.display = isShowing ? 'none' : 'block';
copyWrap.style.display = isShowing ? 'none' : 'inline-block';
btn.textContent = isShowing ? 'View Content' : 'Hide Content';

// Add smooth transition effect
if (!isShowing) {
    contentDiv.style.opacity = '0';
    setTimeout(() => {
        contentDiv.style.opacity = '1';
        contentDiv.style.transition = 'opacity 0.3s ease';
    }, 10);
}
}


// ✅ NEW: Copy content from search results
function copySearchCardContent(copyBtn, event) {
event.stopPropagation();

// Find the content div more reliably
const searchCard = copyBtn.closest('.search-result-card');
const contentDiv = searchCard.querySelector('.search-content');

if (!contentDiv) {
    showToast('Content not found', 'error');
    return;
}

const text = contentDiv.textContent || contentDiv.innerText || '';

if (!text.trim()) {
    showToast('No content to copy', 'error');
    return;
}

navigator.clipboard.writeText(text).then(() => {
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    copyBtn.style.backgroundColor = '#059669'; // Green color
    
    setTimeout(() => { 
        copyBtn.textContent = originalText;
        copyBtn.style.backgroundColor = ''; // Reset to original
    }, 1500);
    
    showToast('Content copied to clipboard! 📋', 'success');
}).catch(() => {
    // Fallback for older browsers
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        showToast('Content copied to clipboard! 📋', 'success');
    } catch (err) {
        showToast('Failed to copy content', 'error');
    }
});
}


// ✅ UPDATE: Only handle bookmark/dcose clicks
function globalSearchResultClick(item) {
// Only handle clickable items (bookmarks/dcose)
if(item.type === 'Bookmark' || item.type === 'DCOSE') {
    if(item.url) {
        window.open(item.url,'_blank');
        showToast(`🚀 Opening: ${item.title}`, true);
    }
}
// Do nothing for Toolkit/Knowledge items
}


	// HYBRID RUNBOOK DETECTION ENGINE
	const runbookDetector = {
		patterns: {
			hostType: /\[(EC2[a-zA-Z0-9]*)\]/,
			hardwareId: /(((FOX)|(SNX)|(QCI)|(ZT)|(JBL)|(WYN))\.[a-zA-Z0-9]*)/,
			region: /([A-Z]{3}\d{2,3})/,
			deviceName: /([a-z]{3}[0-9]{2}-[a-z0-9\-]*)/g,
			issueType: /VETTING_([A-Z_]+)/,
			workDefinitionId: /Work-Definition-ID = (\d+)/,
			rackId: /RACK[_-]([A-Z0-9]+)/,
			pscId: /PSC[_-]([A-Z0-9]+)/,
			vendor: /^(FOX|SNX|QCI|ZT|JBL|WYN)/,
			component: /(PSU|DIMM|NIC|PSC|BMC|CPU|MEMORY|DISK|SSD)/i
		},

		extractInfo: function(searchText) {
			const info = {};

			Object.entries(this.patterns).forEach(([key, pattern]) => {
const match = searchText.match(pattern);
if (match) {
	if (key === 'deviceName') {
		info[key] = match;
	} else {
		info[key] = match[1] || match[0];
	}
}
			});

			return info;
		},

		suggestRunbooks: function(extractedInfo, originalSearchText = '') {
			const suggestions = [];

			// PHASE 1: Database-driven suggestions (high confidence)
			runbookData.forEach(runbook => {
let score = 0;
let matchReasons = [];

// Host type matching (highest priority)
if (extractedInfo.hostType && runbook.hostTypes && 
	runbook.hostTypes.includes(extractedInfo.hostType)) {
	score += 40;
	matchReasons.push(`Host Type: ${extractedInfo.hostType}`);
}

// Issue type matching
if (extractedInfo.issueType && runbook.issueTypes && 
	runbook.issueTypes.includes(`VETTING_${extractedInfo.issueType}`)) {
	score += 30;
	matchReasons.push(`Issue: ${extractedInfo.issueType}`);
}

// Vendor matching
if (extractedInfo.vendor && runbook.vendors && 
	runbook.vendors.includes(extractedInfo.vendor)) {
	score += 20;
	matchReasons.push(`Vendor: ${extractedInfo.vendor}`);
}

// Component matching
if (extractedInfo.component && runbook.components && 
	runbook.components.includes(extractedInfo.component.toUpperCase())) {
	score += 25;
	matchReasons.push(`Component: ${extractedInfo.component}`);
}

// Tag matching (fuzzy)
if (runbook.tags) {
	const searchLower = originalSearchText.toLowerCase();
	const extractedLower = Object.values(extractedInfo).join(' ').toLowerCase();
	
	runbook.tags.forEach(tag => {
		const tagLower = tag.toLowerCase();
		// Check both original search text AND extracted info
		if (searchLower.includes(tagLower) || extractedLower.includes(tagLower)) {
			score += 15; // Increased score for tag matches
			matchReasons.push(`Tag: ${tag}`);
		}
	});
}

if (score > 0) {
	suggestions.push({
		...runbook,
		matchScore: score,
		matchReasons: matchReasons,
		finalConfidence: Math.min(95, runbook.confidence + score),
		source: 'database'
	});
}
			});

			// PHASE 2: Auto-Generated fallback (medium to high confidence)
			if (extractedInfo.hostType) {
const fallbackRunbook = this.generateFallbackRunbook(extractedInfo);

// Only add if we don't already have a database match for this host type
const hasExactMatch = suggestions.some(s => 
	s.hostTypes && s.hostTypes.includes(extractedInfo.hostType)
);

if (!hasExactMatch) {
	suggestions.push(fallbackRunbook);
}
			}

			// PHASE 3: Generic fallbacks (low confidence)
			if (suggestions.length === 0) {
suggestions.push(...this.generateGenericFallbacks(extractedInfo));
			}

			return suggestions
.sort((a, b) => b.matchScore - a.matchScore)
.slice(0, 6); // Top 6 suggestions
		},

		generateFallbackRunbook: function(extractedInfo) {
			const hostType = extractedInfo.hostType;
			const matchReasons = [`Host Type: ${hostType} (Auto-Generated)`];

			if (extractedInfo.vendor) {
matchReasons.push(`Vendor: ${extractedInfo.vendor}`);
			}
			if (extractedInfo.issueType) {
matchReasons.push(`Issue: ${extractedInfo.issueType}`);
			}

			return {
id: `fallback-${hostType.toLowerCase()}`,
title: `${hostType} Standard Vetting Runbook`,
url: `https://w.amazon.com/bin/view/VettingDCORunbook/${hostType}`,
matchScore: 35,
finalConfidence: 85,
icon: '📖',
category: 'Standard Runbook',
matchReasons: matchReasons,
source: 'fallback',
hostTypes: [hostType]
			};
		},

		generateGenericFallbacks: function(extractedInfo) {
			const fallbacks = [];

			// Vendor-specific fallback
			if (extractedInfo.vendor) {
fallbacks.push({
	id: `vendor-${extractedInfo.vendor.toLowerCase()}`,
	title: `${this.getVendorName(extractedInfo.vendor)} Hardware Guide`,
	url: `https://w.amazon.com/bin/view/HardwareRunbooks/${this.getVendorName(extractedInfo.vendor)}`,
	matchScore: 25,
	finalConfidence: 65,
	icon: '🔧',
	category: 'Vendor Guide',
	matchReasons: [`Vendor: ${extractedInfo.vendor}`],
	source: 'generic'
});
			}

			// Issue-specific fallback
			if (extractedInfo.issueType) {
fallbacks.push({
	id: `issue-${extractedInfo.issueType.toLowerCase()}`,
	title: `${extractedInfo.issueType.replace('_', ' ')} Troubleshooting Guide`,
	url: `https://w.amazon.com/bin/view/DCOSE/Documentation/Runbooks/${extractedInfo.issueType}`,
	matchScore: 20,
	finalConfidence: 60,
	icon: '🔍',
	category: 'Issue Guide',
	matchReasons: [`Issue Type: ${extractedInfo.issueType}`],
	source: 'generic'
});
			}
 
			return fallbacks;
		},

		getVendorName: function(vendorCode) {
			const vendorMap = {
'FOX': 'Foxconn',
'SNX': 'Supermicro', 
'QCI': 'Quanta',
'ZT': 'ZT_Systems',
'JBL': 'Jabil',
'WYN': 'Wiwynn'
			};
			return vendorMap[vendorCode] || vendorCode;
		}
	};

	// DETECTION FUNCTIONS
	function detectRunbooks(searchText) {
		clearTimeout(detectionTimeout);
		
		const statusDiv = document.getElementById('runbook-detection-status');
		const suggestionsDiv = document.getElementById('runbook-suggestions');
		
		if (!searchText.trim()) {
			if (statusDiv) statusDiv.style.display = 'none';
			if (suggestionsDiv) suggestionsDiv.style.display = 'none';
			return;
		}
		
		if (statusDiv) {
			statusDiv.style.display = 'flex';
			statusDiv.innerHTML = '<div class="flex items-center space-x-2 text-sm text-slate-400"><div class="w-2 h-2 bg-yellow-500 rounded-full pulse-dot"></div><span>Analyzing...</span></div>';
		}
		
		detectionTimeout = setTimeout(() => {
			performRunbookDetection(searchText);
		}, 300);
	}

	function performRunbookDetection(searchText) {
		const statusDiv = document.getElementById('runbook-detection-status');
		const suggestionsDiv = document.getElementById('runbook-suggestions');
		const suggestionsList = document.getElementById('runbook-suggestions-list');
		
		try {
			const extractedInfo = runbookDetector.extractInfo(searchText);
			// console.log('🔍 Extracted info:', extractedInfo);

			const suggestions = runbookDetector.suggestRunbooks(extractedInfo, searchText);
			// console.log('💡 Hybrid suggestions:', suggestions);

			if (suggestions.length > 0) {
const dbSuggestions = suggestions.filter(s => s.source === 'database').length;
let statusText = `Found ${suggestions.length} runbook(s)`;
if (dbSuggestions > 0) statusText += ` (${dbSuggestions} verified)`;

if (statusDiv) {
	statusDiv.innerHTML = `<div class="flex items-center space-x-2 text-sm text-slate-400"><div class="w-2 h-2 bg-green-500 rounded-full"></div><span>${statusText}</span></div>`;
}

if (suggestionsList) {
	suggestionsList.innerHTML = suggestions.map((suggestion, index) => {
		const confidenceClass = suggestion.finalConfidence >= 80 ? 'high-confidence' : 
							   suggestion.finalConfidence >= 60 ? 'medium-confidence' : 'low-confidence';
		
		const sourceLabel = {
			'database': 'VERIFIED',
			'fallback': 'STANDARD', 
			'generic': 'GENERAL'
		}[suggestion.source] || 'UNKNOWN';
		
		const sourceClass = `source-${suggestion.source}`;
		
		return `
			<div class="suggestion-card ${confidenceClass} bg-slate-800/50 border border-slate-700 rounded-lg p-4 mb-3 cursor-pointer hover:border-indigo-500 transition-all" onclick="openRunbook('${suggestion.url}', '${escapeHtml(suggestion.title)}')" style="animation-delay: ${index * 0.1}s">
				<div class="flex justify-between items-start mb-2">
					<div class="flex items-center space-x-2">
						<span class="text-lg">${suggestion.icon || '📖'}</span>
						<span class="font-bold text-slate-100">${escapeHtml(suggestion.title)}</span>
					</div>
					<div class="flex items-center space-x-2">
						<span class="text-xs font-bold px-2 py-1 rounded-full ${sourceClass === 'source-database' ? 'bg-green-600 text-white' : sourceClass === 'source-fallback' ? 'bg-yellow-600 text-white' : 'bg-gray-600 text-white'}">${sourceLabel}</span>
						<span class="text-xs font-bold px-2 py-1 rounded-full bg-indigo-600 text-white">${suggestion.finalConfidence}%</span>
					</div>
				</div>
				<div class="text-sm text-slate-400 mb-2">${suggestion.category}</div>
				<div class="text-xs text-slate-500">Matched: ${suggestion.matchReasons.join(', ')}</div>
			</div>
		`;
	}).join('');
}

if (suggestionsDiv) suggestionsDiv.style.display = 'block';
			} else {
if (statusDiv) {
	statusDiv.innerHTML = '<div class="flex items-center space-x-2 text-sm text-slate-400"><div class="w-2 h-2 bg-yellow-500 rounded-full"></div><span>No runbooks found</span></div>';
}
if (suggestionsList) {
	suggestionsList.innerHTML = `
		<div class="text-center py-8 text-slate-500">
			<p class="text-lg font-semibold mb-2">🔍 No runbooks found for your query</p>
			<p class="text-sm mb-1">💡 Try including: Host type [EC2XXX], Hardware ID, or Issue type</p>
			<p class="text-sm">📝 Example: "[EC2M6I] FOX.ABC123 VETTING_MEMORY failure"</p>
		</div>
	`;
}
if (suggestionsDiv) suggestionsDiv.style.display = 'block';
			}
		} catch (error) {
			console.error('❌ Detection error:', error);
			if (statusDiv) {
statusDiv.innerHTML = '<div class="flex items-center space-x-2 text-sm text-slate-400"><div class="w-2 h-2 bg-red-500 rounded-full"></div><span>Detection error occurred</span></div>';
			}
			showToast('❌ Runbook detection error', 'error');
		}
	}

	function openRunbook(url, title) {
		window.open(url, '_blank');
		showToast(`🚀 Opening: ${title}`, 'success');
		
		const searchQuery = document.getElementById('smart-runbook-search')?.value;
		// console.log('📖 Runbook opened:', { url, title, searchQuery, timestamp: new Date().toISOString() });
		
		setTimeout(() => {
			const searchInput = document.getElementById('smart-runbook-search');
			if (searchInput) {
searchInput.value = '';
hideRunbookSuggestions();
			}
		}, 2000);
	}

	function hideRunbookSuggestions() {
		const suggestions = document.getElementById('runbook-suggestions');
		const status = document.getElementById('runbook-detection-status');
		if (suggestions) suggestions.style.display = 'none';
		if (status) status.style.display = 'none';
	}


// --- Utility Functions ---

function escapeHtml(str) {
    if (!str) return '';
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

function renderHtmlContent(htmlString) {
if (!htmlString) return '';

// First, let's handle plain text with line breaks
let processedContent = htmlString;

// If it's plain text (no HTML tags), convert line breaks to <br> tags
if (!/<[^>]+>/.test(htmlString)) {
    // Replace multiple consecutive line breaks with paragraph breaks
    processedContent = htmlString
        .split('\n\n')
        .map(paragraph => paragraph.trim())
        .filter(paragraph => paragraph.length > 0)
        .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
        .join('');
}

const tempDiv = document.createElement('div');
tempDiv.innerHTML = processedContent;

// Enhanced allowed tags list
const allowedTags = ['B', 'I', 'P', 'BR', 'IMG', 'STRONG', 'EM', 'UL', 'LI', 'OL', 'DIV', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'CODE', 'PRE'];

const elements = tempDiv.querySelectorAll('*');
elements.forEach(el => {
    if (!allowedTags.includes(el.tagName.toUpperCase())) {
        // Instead of removing, replace with span to preserve content
        const span = document.createElement('span');
        span.innerHTML = el.innerHTML;
        el.parentNode.replaceChild(span, el);
    } else if (el.tagName.toUpperCase() === 'IMG') {
        el.style.maxWidth = '100%';
        el.style.height = 'auto';
        el.style.borderRadius = '0.5rem';
        el.style.marginTop = '0.5rem';
        el.style.marginBottom = '0.5rem';
    } else if (el.tagName.toUpperCase() === 'P') {
        el.style.marginBottom = '0.75rem';
    } else if (el.tagName.toUpperCase() === 'PRE') {
        el.style.whiteSpace = 'pre-wrap';
        el.style.backgroundColor = '#1e293b';
        el.style.padding = '0.75rem';
        el.style.borderRadius = '0.375rem';
        el.style.fontSize = '0.875rem';
        el.style.overflowX = 'auto';
    }
});

return tempDiv.innerHTML;
}


function highlight(text, query) {
    if (!text || !query) return escapeHtml(text);
    const regex = new RegExp(`(${query.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|\#\s]/g, '\\$&')})`, 'gi');
    return escapeHtml(text).replace(regex, '<span class="bg-yellow-500/30 text-yellow-300">$1</span>');
}
	
	// Copy to Clipboard Function
	function copyToClipboard(text) {
		navigator.clipboard.writeText(text).then(() => {
			showToast('Copied to clipboard!', 'success');
		}).catch(() => {
			// Fallback for older browsers
			const textArea = document.createElement('textarea');
			textArea.value = text;
			document.body.appendChild(textArea);
			textArea.focus();
			textArea.select();
			try {
document.execCommand('copy');
showToast('Copied to clipboard!', 'success');
			} catch (err) {
showToast('Failed to copy', 'error');
			}
			document.body.removeChild(textArea);
		});
	}

	// Beta Modal Functions
        function showRunbookInfo() {
                const modal = document.getElementById('betaModal');
                if (modal) {
                        openModal(modal);
                        document.addEventListener('keydown', handleModalEscape);
                }
        }

        function closeBetaModal() {
                const modal = document.getElementById('betaModal');
                if (modal) {
                        closeModal('betaModal');
                        document.removeEventListener('keydown', handleModalEscape);
                }
        }

	function handleModalEscape(event) {
		if (event.key === 'Escape') {
			closeBetaModal();
		}
	}
	
	// Auto-Refresh System for Runbooks
	function startAutoRefresh() {
		if (autoRefreshInterval) {
			clearInterval(autoRefreshInterval);
		}
		
		// console.log("🚀 Starting smart auto-refresh every 3 minutes...");
		autoRefreshInterval = setInterval(autoRefreshRunbooks, REFRESH_INTERVAL);
		showToast("🔄 Smart auto-refresh enabled: Runbooks will auto-update!", 'success');
	}

	async function autoRefreshRunbooks() {
		// console.log("🔄 Auto-refresh: Refreshing runbook data...");
		
		try {
			// Add timestamp to prevent caching
			const cacheBuster = Date.now();
			const url = `${DCO_API_CONFIG?.runbooks || 'https://raw.githubusercontent.com/hashpotlia/dcogarage-api/main/runbooks.json'}?cb=${cacheBuster}`;

			const res = await fetch(url);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);

			const data = await res.json();

			// Store old data for comparison
			const oldCount = runbookData?.length || 0;
			const oldData = [...(runbookData || [])];

			// Update the data
                        runbookData = data.runbooks || [];
                        const newCount = runbookData.length;
                        updateLastRefreshed();

			// console.log(`✅ Auto-refresh: Updated ${oldCount} → ${newCount} runbooks`);

			// Check if user is currently searching
			const searchInput = document.getElementById('smart-runbook-search');
			const currentSearch = searchInput?.value.trim() || '';

			if (currentSearch) {
// console.log(`🔍 Auto-refresh: User is searching for "${currentSearch}"`);

// Find new matches in updated data
const newMatches = runbookData.filter(runbook => {
	const searchLower = currentSearch.toLowerCase();
	return (
		runbook.title?.toLowerCase().includes(searchLower) ||
		runbook.hostTypes?.some(type => type.toLowerCase().includes(searchLower)) ||
		runbook.issueTypes?.some(type => type.toLowerCase().includes(searchLower)) ||
		runbook.tags?.some(tag => tag.toLowerCase().includes(searchLower)) ||
		runbook.category?.toLowerCase().includes(searchLower)
	);
});

// Check for new runbooks that match the search
const oldMatchIds = oldData
	.filter(runbook => {
		const searchLower = currentSearch.toLowerCase();
		return (
			runbook.title?.toLowerCase().includes(searchLower) ||
			runbook.hostTypes?.some(type => type.toLowerCase().includes(searchLower)) ||
			runbook.issueTypes?.some(type => type.toLowerCase().includes(searchLower)) ||
			runbook.tags?.some(tag => tag.toLowerCase().includes(searchLower)) ||
			runbook.category?.toLowerCase().includes(searchLower)
		);
	})
	.map(r => r.id);

const newMatchIds = newMatches.map(r => r.id);
const brandNewMatches = newMatches.filter(r => !oldMatchIds.includes(r.id));

// Show notification about new matches
if (brandNewMatches.length > 0) {
	// console.log(`🎉 Found ${brandNewMatches.length} new matches for "${currentSearch}":`, brandNewMatches.map(r => r.title));
	showToast(`🎉 Found ${brandNewMatches.length} new matches for "${currentSearch}"!`, 'success');
}

// Trigger search update
// console.log(`🔍 Auto-refresh: Updating search results (${newMatches.length} total matches)`);
setTimeout(() => {
	if (searchInput) {
		detectRunbooks(currentSearch);
	}
}, 100);

// Show general refresh notification
showToast(`🔄 Auto-refreshed: ${newCount} runbooks (${newMatches.length} match "${currentSearch}")`, 'success');

			} else {
// No active search - just show general update
showToast(`🔄 Auto-refreshed: ${newCount} runbooks loaded!`, 'success');
			}

		} catch (e) {
			//console.error("❌ Auto-refresh failed:", e);
			// Silent fail for auto-refresh - don't show error toast to avoid spam
		}
	}



	function hideRunbookSuggestions() {
		const suggestions = document.getElementById('runbook-suggestions');
		const status = document.getElementById('runbook-detection-status');
		if (suggestions) suggestions.style.display = 'none';
		if (status) status.style.display = 'none';
	}



// --- Lab Actions ---
const LAB_ACTIONS = {
    openUrl: (baseUrl, inputId) => {
        const input = document.getElementById(inputId);
        const value = input.value.trim();
        if (!value) {
            showToast('Please enter a value.', 'error');
            return;
        }
        const url = baseUrl.replace('{VALUE}', encodeURIComponent(value));
        window.open(url, '_blank');
        input.value = '';
    },
    checkHostConsoleIP: id => LAB_ACTIONS.openUrl('https://tavern.corp.amazon.com/iws/api/akl/consoles?asset_id={VALUE}', id),
    checkRackPSCHealth: id => LAB_ACTIONS.openUrl('https://provisioning-web.amazon.com/rack_psc_health?rack_asset_id={VALUE}', id),
    checkHostBOMReport: id => LAB_ACTIONS.openUrl('https://hwmon-api-akl.aka.amazon.com/bom_report/{VALUE}', id),
    checkHostBOMFailureReport: id => LAB_ACTIONS.openUrl('https://hwmon-api-akl.aka.amazon.com/bom_failures/{VALUE}', id),
    checkHostHWMonRecord: id => LAB_ACTIONS.openUrl('https://hwmon-api-akl.aka.amazon.com/host_record/{VALUE}', id),
    checkRackHandoff: id => LAB_ACTIONS.openUrl('https://infrastructure.amazon.com/automation/rackHandoff.cgi?vetting_status=on&navigation=rack_asset_id&rack_asset_id={VALUE}', id),
    checkRackDeployed: id => LAB_ACTIONS.openUrl('https://racks.aka.amazon.com/racks/{VALUE}', id),
    checkNSMHostname: id => LAB_ACTIONS.openUrl('https://nsm-akl.aka.corp.amazon.com/?query={VALUE}', id),
    checkHapposhuHostname: id => LAB_ACTIONS.openUrl('https://tavern.corp.amazon.com/happoshu?all_sources=true&partial_match=true&all_devices_in_rack=false&show_deleted=false&device_names={VALUE}&region=AKL#search', id)
};

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js');
  });
}
