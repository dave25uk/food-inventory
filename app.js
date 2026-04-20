const supabaseUrl = 'https://qysscushyrhgrodlpovg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5c3NjdXNoeXJoZ3JvZGxwb3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MjE3NzEsImV4cCI6MjA5MTM5Nzc3MX0.1KMpTrpzmi6d-r3nbPzGunpiYHkAjpUxuB32RtAlJqI';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let currentLocation = 'Fridge'; 

async function init() {
    renderUI();
	checkSubscription();
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
    const existingLegend = listContainer.querySelector('.status-legend')?.outerHTML || '';
    
    listContainer.innerHTML = existingLegend + '<div class="empty-state">Loading...</div>';

    // Fetch EVERYTHING to check for global attention
    const { data: allInventory, error } = await _supabase
        .from('inventory')
        .select(`id, expiry_date, quantity, location, products (name, category)`)
        .order('expiry_date', { ascending: true });

    if (error || !allInventory) return;

    const priorityItems = [];
    const categorizedItems = {};

    allInventory.forEach(item => {
        const expiryData = getExpiryStatus(item.expiry_date);
        const status = expiryData.statusClass;
        
        // 1. If it's urgent, add to priority regardless of location
        if (status === 'status-expired' || status === 'status-7-days') {
            priorityItems.push(item);
        } 
        
        // 2. If it's in the CURRENT location, add to category list
        if (item.location === currentLocation) {
            // We skip adding it here if it's already in priority to avoid duplicates
            if (!(status === 'status-expired' || status === 'status-7-days')) {
                const cat = item.products.category || 'Other';
                if (!categorizedItems[cat]) categorizedItems[cat] = [];
                categorizedItems[cat].push(item);
            }
        }
    });

    let html = '';

    // Render Priority Section (Global)
    if (priorityItems.length > 0) {
        html += `<div class="section-header priority-header">Attention Required (All Locations)</div>`;
        priorityItems.forEach(item => html += generateSlimCard(item, true));
    }

    // Render Categorized Sections (Current Location only)
    for (const [category, items] of Object.entries(categorizedItems)) {
        html += `<div class="section-header">${category}</div>`;
        items.forEach(item => html += generateSlimCard(item, false));
    }

    listContainer.innerHTML = existingLegend + (html || `<div class="empty-state">No items in ${currentLocation}</div>`);
}

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

    listContainer.innerHTML = existingLegend + (html || `<div class="empty-state">No items in ${currentLocation}</div>`);

}

// Helper function to keep code clean
function generateSlimCard(item, showLocation) {
    const expiryData = getExpiryStatus(item.expiry_date); 
    const statusClass = expiryData.statusClass;
    const daysLeft = expiryData.daysLeft;
    
    const dateLabel = new Date(item.expiry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    let daysDisplay = '';
    if (daysLeft < 0) {
        daysDisplay = `<span style="color: #d32f2f; font-weight: bold;">Expired</span>`;
    } else if (daysLeft === 0) {
        daysDisplay = `<span style="color: #ef6c00; font-weight: bold;">Expires Today</span>`;
    } else if (daysLeft <= 7) {
        daysDisplay = `<span style="color: #ef6c00; font-weight: bold;">${daysLeft} days left</span>`;
    } else {
        daysDisplay = `${daysLeft} days left`;
    }

    // Only show location if it's in the global priority list
    const locationTag = showLocation ? `<span style="font-size: 10px; opacity: 0.6; margin-left: 5px;">[${item.location}]</span>` : '';

    return `
        <div class="inventory-card ${statusClass}">
            <div class="item-info">
                <h3>${item.products.name}${locationTag}</h3>
                <p>${daysDisplay} • <small style="opacity: 0.7;">Exp: ${dateLabel}</small></p>
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
        'Raw Meat': ['chicken', 'beef', 'steak', 'pork', 'mince', 'lamb', 'turkey', 'raw', 'bacon', 'sausages'],
        'Cooked Meat': ['ham', 'salami', 'chorizo', 'roast', 'cooked', 'deli'],
        'Vegetables': ['carrot', 'potato', 'onion', 'pepper', 'lettuce', 'broccoli', 'salad', 'fruit', 'apple', 'banana', 'cabbage', 'parsnip', 'sprout', 'swede', 'peas'],
		'Leftovers': ['lasagne', 'spag', 'curry', 'cottage', 'chilli'],
		'Drinks': ['orange', 'apple']
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

    // Determine the CSS class for colors
    let statusClass = '';
    if (diffDays < 0) statusClass = 'status-expired';
    else if (diffDays <= 7) statusClass = 'status-7-days';
    // Removed the 30-day highlight logic here

    return {
        statusClass: statusClass,
        daysLeft: diffDays
    };
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
window.setupNotifications = async () => {
    // 1. Check if browser supports push
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert("Push notifications aren't supported on this browser.");
        return;
    }

    // 2. Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        alert("Permission denied. You can enable it in browser settings.");
        return;
    }

    // 3. Register the subscription
    const registration = await navigator.serviceWorker.ready;
    
    // NOTE: You will need a Public VAPID Key here. 
    // For testing, many use a free service like 'web-push' to generate one.
    // Replace your existing applicationServerKey with this version
const subscribeOptions = {
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array('BHuC6xzlxSG1973K4WD_czEUhyWLQ1BLmjECGxGV6RTS4VSepKYItobdr9brLgIYmNeifb0TBfjRoXxgTrOOwUk') 
};

    const subscription = await registration.pushManager.subscribe(subscribeOptions);

    // 4. Save to Supabase
    const { error } = await _supabase
        .from('push_subscriptions')
        .insert([{ subscription_json: subscription }]);

    if (!error) {
        alert("Alerts enabled! You'll get a nudge for items expiring soon.");
        document.getElementById('notify-btn').style.display = 'none';
    } else {
        console.error(error);
    }
};


function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function checkSubscription() {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        
        // If a subscription exists, hide the button
        if (subscription) {
            console.log("Active subscription found.");
            document.getElementById('notify-btn').style.display = 'none';
        }
    }
}

init();