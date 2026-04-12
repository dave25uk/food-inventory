const supabaseUrl = 'https://qysscushyrhgrodlpovg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5c3NjdXNoeXJoZ3JvZGxwb3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MjE3NzEsImV4cCI6MjA5MTM5Nzc3MX0.1KMpTrpzmi6d-r3nbPzGunpiYHkAjpUxuB32RtAlJqI';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let currentLocation = 'Fridge'; 

async function init() {
    renderUI();
}

window.switchLocation = (location) => {
    currentLocation = location;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText === location);
    });
    renderUI();
};

async function renderUI() {
    const listContainer = document.getElementById('inventory-list');
    listContainer.innerHTML = '<div class="empty-state">Loading...</div>';

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
                <div class="card-actions">
                    <div class="item-qty">${item.quantity}</div>
                    <div class="button-group">
                        <button class="use-btn" onclick="consumeItem('${item.id}', ${item.quantity})">Use 1</button>
                        <button class="waste-btn" onclick="wasteItem('${item.id}')">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getExpiryStatus(dateString) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(dateString);
    expiry.setHours(0, 0, 0, 0);

    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'status-expired';
    if (diffDays <= 7) return 'status-7-days';
    if (diffDays <= 30) return 'status-30-days';
    return '';
}

window.consumeItem = async (id, currentQty) => {
    if (currentQty > 1) {
        await _supabase.from('inventory').update({ quantity: currentQty - 1 }).eq('id', id);
    } else {
        await _supabase.from('inventory').delete().eq('id', id);
    }
    renderUI();
};

window.wasteItem = async (id) => {
    if (confirm("Remove this entire batch?")) {
        await _supabase.from('inventory').delete().eq('id', id);
        renderUI();
    }
};

// 1. Start the Scanner
window.openScanner = () => {
    document.getElementById('scanner-modal').style.display = 'block';

    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector('#interactive'), // The div in your HTML
            constraints: {
                facingMode: "environment" // Use back camera
            },
        },
        decoder: {
            readers: ["ean_reader", "ean_8_reader"] // Standard grocery barcodes
        }
    }, function(err) {
        if (err) {
            console.error(err);
            alert("Camera error: " + err);
            return;
        }
        Quagga.start();
    });

    // 2. What happens when a code is detected
    Quagga.onDetected(async (data) => {
        const code = data.codeResult.code;
        Quagga.stop(); // Stop scanning once we find one
        
        // Haptic feedback (vibrate) if supported
        if (navigator.vibrate) navigator.vibrate(100);
        
        handleBarcodeFound(code);
    });
};

// 3. Handle the Result
async function handleBarcodeFound(barcode) {
    document.getElementById('scanner-modal').style.display = 'none';
    
    // Check if we already know this product in our Supabase 'products' table
    let { data: product } = await _supabase
        .from('products')
        .select('*')
        .eq('barcode', barcode)
        .maybeSingle();

    if (!product) {
        // Not in our DB? Fetch from Open Food Facts API
        const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
        const result = await response.json();

        if (result.status === 1) {
            const pData = result.product;
            // Save new product to our DB
            const { data: newP, error } = await _supabase
                .from('products')
                .insert([{ 
                    barcode: barcode, 
                    name: pData.product_name || "Unknown Item",
                    brand: pData.brands || "",
                    image_url: pData.image_front_url || ""
                }])
                .select()
                .single();
            product = newP;
        } else {
            // Manually enter if not found in global API
            const manualName = prompt("Product not found. Enter name:");
            if (!manualName) return;
            const { data: newP } = await _supabase
                .from('products')
                .insert([{ barcode: barcode, name: manualName }])
                .select()
                .single();
            product = newP;
        }
    }

    // Now proceed to add this product to a specific location/batch
    askForDetails(product);
}

window.closeScanner = () => {
    Quagga.stop();
    document.getElementById('scanner-modal').style.display = 'none';
};

let activeProduct = null;

async function askForDetails(product) {
    activeProduct = product;
    
    // Set UI elements
    document.getElementById('scanned-item-name').innerText = `Add ${product.name}`;
    document.getElementById('location-input').value = currentLocation; // Default to current tab
    
    // Default the date to today to make it easier to pick
    document.getElementById('expiry-input').valueAsDate = new Date();
    
    // Show modal
    document.getElementById('details-modal').style.display = 'block';

    // Handle Save Button
    document.getElementById('save-batch-btn').onclick = async () => {
        const expiry = document.getElementById('expiry-input').value;
        const location = document.getElementById('location-input').value;

        if (!expiry) {
            alert("Please select an expiry date.");
            return;
        }

        const { error } = await _supabase
            .from('inventory')
            .insert([{
                product_id: activeProduct.id,
                expiry_date: expiry,
                location: location,
                quantity: 1
            }]);

        if (error) {
            console.error("Error saving batch:", error);
            alert("Failed to save item.");
        } else {
            closeDetails();
            renderUI(); // Refresh list to show new item
        }
    };
}

window.closeDetails = () => {
    document.getElementById('details-modal').style.display = 'none';
    activeProduct = null;
};

init();