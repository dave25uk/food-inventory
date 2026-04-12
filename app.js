const supabaseUrl = 'https://qysscushyrhgrodlpovg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5c3NjdXNoeXJoZ3JvZGxwb3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MjE3NzEsImV4cCI6MjA5MTM5Nzc3MX0.1KMpTrpzmi6d-r3nbPzGunpiYHkAjpUxuB32RtAlJqI';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let currentLocation = 'Fridge'; // Default view

async function init() {
    renderUI();
}

// 1. Tab Switching Logic
window.switchLocation = (location) => {
    currentLocation = location;
    
    // Update UI Active State
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText === location);
    });

    renderUI();
};

async function renderUI() {
    const listContainer = document.getElementById('inventory-list');
    listContainer.innerHTML = '<div class="empty-state">Loading...</div>';

    // 2. Fetch data filtered by location and sorted by expiry (FIFO)
    const { data: inventory, error } = await _supabase
        .from('inventory')
        .select(`
            id,
            expiry_date,
            quantity,
            location,
            products (name, brand)
        `)
        .eq('location', currentLocation)
        .order('expiry_date', { ascending: true });

    if (error) {
        console.error("Error fetching inventory:", error);
        return;
    }

    if (!inventory || inventory.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state" style="text-align:center; padding:40px; color:#8e8e93;">
                Your ${currentLocation} is currently empty.
            </div>`;
        return;
    }

    // 3. Render Cards
    listContainer.innerHTML = inventory.map(item => {
        const statusClass = getExpiryStatus(item.expiry_date);
        const formattedDate = new Date(item.expiry_date).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric'
        });

        return `
            <div class="inventory-card ${statusClass}">
                <div class="item-info">
                    <h3>${item.products.name}</h3>
                    <p>${item.products.brand || ''}</p>
                    <p>Expires: <strong>${formattedDate}</strong></p>
                </div>
                <div class="item-qty">${item.quantity}</div>
            </div>
        `;
    }).join('');
}

// 4. Color-Coding Logic
function getExpiryStatus(dateString) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(dateString);
    expiry.setHours(0, 0, 0, 0);

    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'status-expired';      // Red
    if (diffDays <= 7) return 'status-7-days';     // Orange
    if (diffDays <= 30) return 'status-30-days';   // Yellow
    return ''; // Normal (Default border)
}

// Placeholder for the Scanner
window.openScanner = () => {
    alert("Scanner logic is next! Ready to connect the camera?");
};

init();