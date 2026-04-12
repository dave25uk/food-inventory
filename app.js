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
        .select(`id, expiry_date, quantity, location, products (name, brand, category)`)
        .eq('location', currentLocation)
        .order('expiry_date', { ascending: true });

    if (error || !inventory) return;

    // 1. Separate into Priority and Categorized
    const priorityItems = [];
    const categorizedItems = {};

    inventory.forEach(item => {
        const status = getExpiryStatus(item.expiry_date);
        
        // If it's Red, Orange, or Yellow, it goes to Priority
        if (status === 'status-expired' || status === 'status-7-days' || status === 'status-30-days') {
            priorityItems.push(item);
        } else {
            // Otherwise, group by category
            const cat = item.products.category || 'Other';
            if (!categorizedItems[cat]) categorizedItems[cat] = [];
            categorizedItems[cat].push(item);
        }
    });

    let html = '';

    // 2. Render Priority Section
    if (priorityItems.length > 0) {
        html += `<div class="section-header priority-header">Attention Required</div>`;
        priorityItems.forEach(item => html += generateSlimCard(item));
    }

    // 3. Render Categorized Sections
    for (const [category, items] of Object.entries(categorizedItems)) {
        html += `<div class="section-header">${category}</div>`;
        items.forEach(item => html += generateSlimCard(item));
    }

    listContainer.innerHTML = html || `<div class="empty-state">No items in ${currentLocation}</div>`;
}

// Helper function to keep code clean
function generateSlimCard(item) {
    // This line is key: it calculates if it's red, orange, or yellow
    const statusClass = getExpiryStatus(item.expiry_date); 
    const dateLabel = new Date(item.expiry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    return `
        <div class="inventory-card ${statusClass}">
            <div class="item-info">
                <h3>${item.products.name}</h3>
                <p>${item.products.brand || ''} • Exp: ${dateLabel}</p>
            </div>
            <div class="button-group">
                <span class="item-qty" style="background:none; font-size:16px; margin-right:10px;">x${item.quantity}</span>
                <button class="use-btn" style="padding: 5px 10px; font-size: 12px;" onclick="consumeItem('${item.id}', ${item.quantity})">Use</button>
            </div>
        </div>
    `;
}

function guessCategory(name) {
    const productName = name.toLowerCase();
    
    // Keyword mappings
    const keywords = {
        'Dairy': ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'egg'],
        'Raw Meat': ['chicken', 'beef', 'steak', 'pork', 'mince', 'lamb', 'turkey', 'raw'],
        'Cooked Meat': ['ham', 'salami', 'chorizo', 'roast', 'cooked', 'deli'],
        'Vegetables': ['carrot', 'potato', 'onion', 'pepper', 'lettuce', 'broccoli', 'salad', 'fruit', 'apple', 'banana']
    };

    for (const [category, words] of Object.entries(keywords)) {
        if (words.some(word => productName.includes(word))) {
            return category;
        }
    }
    
    return 'Other'; // Fallback
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
    
    document.getElementById('scanned-item-name').innerText = `Add ${product.name}`;
    
    // Perform the auto-guess
    const suggestedCategory = guessCategory(product.name);
    document.getElementById('category-input').value = suggestedCategory;
    
    document.getElementById('location-input').value = currentLocation;
    document.getElementById('expiry-input').valueAsDate = new Date();
    document.getElementById('details-modal').style.display = 'block';

    document.getElementById('save-batch-btn').onclick = async () => {
        const expiry = document.getElementById('expiry-input').value;
        const location = document.getElementById('location-input').value;
        const category = document.getElementById('category-input').value;

        // 1. Update the Product category if it's new or changed
        await _supabase
            .from('products')
            .update({ category: category })
            .eq('id', activeProduct.id);

        // 2. Insert into inventory
        const { error } = await _supabase
            .from('inventory')
            .insert([{
                product_id: activeProduct.id,
                expiry_date: expiry,
                location: location,
                quantity: 1
            }]);

        if (!error) {
            closeDetails();
            renderUI();
        }
    };
}

window.closeDetails = () => {
    document.getElementById('details-modal').style.display = 'none';
    activeProduct = null;
};

window.addManualItem = async () => {
    // 1. Stop the camera
    Quagga.stop();
    document.getElementById('scanner-modal').style.display = 'none';

    // 2. Ask for the name
    const itemName = prompt("Enter item name (e.g., 'Loose Carrots' or 'Leftover Pasta'):");
    if (!itemName) return;

    // 3. Check if we already have a 'Manual' entry for this name
    // We'll use a specific flag or just null for barcode to identify manual items
    let { data: product } = await _supabase
        .from('products')
        .select('*')
        .eq('name', itemName)
        .is('barcode', null)
        .maybeSingle();

    if (!product) {
        // Create a new product entry without a barcode
        const { data: newP, error } = await _supabase
            .from('products')
            .insert([{ 
                name: itemName, 
                brand: "Manual Entry",
                barcode: null // Important: set to null for manual items
            }])
            .select()
            .single();
        
        if (error) {
            console.error("Error creating manual product:", error);
            return;
        }
        product = newP;
    }

    // 4. Open the details modal just like we do for scanned items
    askForDetails(product);
};

init();