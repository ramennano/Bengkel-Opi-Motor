// Konfigurasi Supabase (Ganti dengan URL dan Anon Key project Supabase Anda)
const SUPABASE_URL = 'https://ojlpeqhstbsuzjqccjgk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qbHBlcWhzdGJzdXpqcWNjamdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNjExNTcsImV4cCI6MjEwNTczNzE1N30.hMoVGhKUBUlcktrWhsBaOk5A673irsAsYn_iMdOJKjw';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State Aplikasi
let currentUser = null;
let pendingUser = null; // untuk tahap 2FA
let cart = [];
let sparePartsCache = [];

document.addEventListener('DOMContentLoaded', () => {
    loadAppSettings();
    setupEventListeners();
});

// Load Global Settings (Logo, Wallpaper, Working Hours)
async function loadAppSettings() {
    try {
        const { data, error } = await supabaseClient.from('app_settings').select('*');
        if (data) {
            const settings = {};
            data.forEach(row => settings[row.key] = row.value);

            if (settings.shop_name) {
                document.getElementById('login-shop-title').innerText = settings.shop_name;
                document.getElementById('app-shop-title').innerText = settings.shop_name;
                document.getElementById('setting-shop-name').value = settings.shop_name;
            }
            if (settings.logo_url) {
                document.getElementById('login-logo').src = settings.logo_url;
                document.getElementById('app-logo').src = settings.logo_url;
            }
            if (settings.wallpaper_url) {
                document.getElementById('body-bg').style.backgroundImage = `linear-gradient(rgba(17, 24, 39, 0.85), rgba(17, 24, 39, 0.85)), url('${settings.wallpaper_url}')`;
                document.getElementById('body-bg').style.backgroundSize = 'cover';
                document.getElementById('body-bg').style.backgroundPosition = 'center';
            }
            if (settings.working_hours) {
                document.getElementById('app-working-hours').innerHTML = `<i class="fa-regular fa-clock mr-1"></i> ${settings.working_hours}`;
                document.getElementById('setting-working-hours').value = settings.working_hours;
            }
        }
    } catch (err) {
        console.error('Gagal memuat pengaturan:', err);
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Login Form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value.trim();

        const { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .single();

        if (error || !data) {
            alert('Username atau Password salah!');
            return;
        }

        pendingUser = data;
        
        // Cek jika 2FA aktif
        if (data.is_2fa_enabled) {
            document.getElementById('login-form').classList.add('hidden');
            document.getElementById('auth-2fa-container').classList.remove('hidden');
        } else {
            completeLogin(data);
        }
    });

    // Verify 2FA
    document.getElementById('btn-verify-2fa').addEventListener('click', () => {
        const inputCode = document.getElementById('input-2fa-code').value.trim();
        if (inputCode === pendingUser.two_factor_code) {
            completeLogin(pendingUser);
        } else {
            alert('Kode 2FA salah! (Default kode: 123456)');
        }
    });

    // Reset 2FA Request helper
    document.getElementById('btn-reset-2fa-req').addEventListener('click', async () => {
        const uname = document.getElementById('login-username').value.trim();
        if (!uname) {
            alert('Masukkan username terlebih dahulu pada form login.');
            return;
        }
        const { error } = await supabaseClient
            .from('users')
            .update({ two_factor_code: '123456' })
            .eq('username', uname);

        if (!error) {
            alert('Kode 2FA telah direset ke default: 123456');
        } else {
            alert('Gagal mereset 2FA.');
        }
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => {
        currentUser = null;
        pendingUser = null;
        document.getElementById('app-container').classList.add('hidden');
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('login-form').reset();
        document.getElementById('auth-2fa-container').classList.add('hidden');
        document.getElementById('input-2fa-code').value = '';
    });

    // POS Search filter
    document.getElementById('pos-search').addEventListener('input', (e) => {
        renderPOSCatalog(e.target.value);
    });

    // Checkout / Print Invoice
    document.getElementById('btn-checkout').addEventListener('click', processCheckout);

    // Sparepart Form Submit
    document.getElementById('item-form').addEventListener('submit', handleSaveItem);

    // New User Form Submit
    document.getElementById('new-user-form').addEventListener('submit', handleCreateUser);

    // Settings Form Submit
    document.getElementById('settings-form').addEventListener('submit', handleSaveSettings);
}

// Selesaikan Proses Login
function completeLogin(user) {
    currentUser = user;
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    document.getElementById('user-welcome').innerHTML = `<i class="fa-solid fa-user-shield mr-1 text-orange-400"></i> ${user.username} (${user.role.toUpperCase()})`;

    // Otoritas Menu Admin
    if (user.role === 'admin') {
        document.getElementById('nav-users').classList.remove('hidden');
        document.getElementById('nav-settings').classList.remove('hidden');
    } else {
        document.getElementById('nav-users').classList.add('hidden');
        document.getElementById('nav-settings').classList.add('hidden');
    }

    fetchSpareParts();
    if (user.role === 'admin') fetchUsersList();
}

// Tab Switching
function switchTab(targetId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('border-orange-500', 'text-orange-400');
        btn.classList.add('border-transparent', 'text-gray-400');
    });

    document.getElementById(targetId).classList.remove('hidden');
    const activeBtn = document.querySelector(`[data-target="${targetId}"]`);
    if (activeBtn) {
        activeBtn.classList.add('border-orange-500', 'text-orange-400');
        activeBtn.classList.remove('border-transparent', 'text-gray-400');
    }
}

// --- MODULE: SPAREPARTS & POS ---
async function fetchSpareParts() {
    const { data, error } = await supabaseClient.from('spare_parts').select('*').order('name', { ascending: true });
    if (data) {
        sparePartsCache = data;
        renderPOSCatalog();
        renderInventoryTable();
    }
}

function renderPOSCatalog(filter = '') {
    const grid = document.getElementById('pos-catalog-grid');
    grid.innerHTML = '';

    const filtered = sparePartsCache.filter(item => item.name.toLowerCase().includes(filter.toLowerCase()) || item.code.toLowerCase().includes(filter.toLowerCase()));

    if (filtered.length === 0) {
        grid.innerHTML = `<p class="col-span-full text-center text-gray-500 text-sm py-10">Tidak ada barang ditemukan</p>`;
        return;
    }

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = `bg-gray-900 border ${item.stock > 0 ? 'border-gray-700 hover:border-orange-500 cursor-pointer' : 'border-red-900/50 opacity-60'} rounded-lg p-3 flex flex-col justify-between transition`;
        card.innerHTML = `
            <div>
                <img src="${item.image_url || 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=150'}" class="w-full h-24 object-cover rounded-md mb-2">
                <span class="text-[10px] bg-gray-800 text-orange-400 px-2 py-0.5 rounded">${item.category}</span>
                <h4 class="font-bold text-sm mt-1 truncate">${item.name}</h4>
                <p class="text-xs text-gray-400">Stok: ${item.stock}</p>
            </div>
            <div class="mt-2 flex justify-between items-center">
                <span class="text-xs font-bold text-orange-400">Rp ${Number(item.price).toLocaleString('id-ID')}</span>
                ${item.stock > 0 ? `<button onclick="addToCart(${item.id})" class="bg-orange-600 hover:bg-orange-500 text-white p-1.5 rounded text-xs"><i class="fa-solid fa-cart-plus"></i></button>` : `<span class="text-[10px] text-red-400">Habis</span>`}
            </div>
        `;
        grid.appendChild(card);
    });
}

function addToCart(id) {
    const item = sparePartsCache.find(i => i.id === id);
    if (!item || item.stock <= 0) return;

    const existing = cart.find(c => c.id === id);
    if (existing) {
        if (existing.qty < item.stock) {
            existing.qty++;
        } else {
            alert('Stok tidak mencukupi!');
        }
    } else {
        cart.push({ ...item, qty: 1 });
    }
    renderCart();
}

function renderCart() {
    const list = document.getElementById('cart-items-list');
    const totalEl = document.getElementById('cart-total');
    list.innerHTML = '';

    if (cart.length === 0) {
        list.innerHTML = `<p class="text-gray-500 text-sm text-center py-10">Keranjang masih kosong</p>`;
        totalEl.innerText = 'Rp 0';
        return;
    }

    let total = 0;
    cart.forEach((item, index) => {
        total += item.price * item.qty;
        const div = document.createElement('div');
        div.className = 'bg-gray-900 p-2 rounded-lg flex justify-between items-center text-xs';
        div.innerHTML = `
            <div class="flex-1 pr-2">
                <p class="font-bold truncate">${item.name}</p>
                <p class="text-orange-400">Rp ${Number(item.price).toLocaleString('id-ID')} x ${item.qty}</p>
            </div>
            <div class="flex items-center space-x-1">
                <button onclick="updateQty(${index}, -1)" class="bg-gray-700 px-2 py-0.5 rounded">-</button>
                <span class="px-1">${item.qty}</span>
                <button onclick="updateQty(${index}, 1)" class="bg-gray-700 px-2 py-0.5 rounded">+</button>
                <button onclick="removeFromCart(${index})" class="text-red-400 hover:text-red-300 ml-2"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        list.appendChild(div);
    });

    totalEl.innerText = `Rp ${total.toLocaleString('id-ID')}`;
}

function updateQty(index, delta) {
    cart[index].qty += delta;
    if (cart[index].qty <= 0) {
        cart.splice(index, 1);
    }
    renderCart();
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
}

// --- CHECKOUT & PRINT INVOICE ---
async function processCheckout() {
    if (cart.length === 0) {
        alert('Keranjang masih kosong!');
        return;
    }
    const custName = document.getElementById('cust-name').value.trim() || 'Umum';
    const custPhone = document.getElementById('cust-phone').value.trim() || '-';
    const invoiceNo = 'INV-' + Date.now();
    const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    // Simpan ke database invoice
    const { error } = await supabaseClient.from('invoices').insert([{
        invoice_no: invoiceNo,
        customer_name: custName,
        customer_phone: custPhone,
        items: cart,
        total_amount: totalAmount,
        created_by: currentUser.username
    }]);

    if (error) {
        alert('Gagal memproses transaksi: ' + error.message);
        return;
    }

    // Update stok di database
    for (const item of cart) {
        const newStock = item.stock - item.qty;
        await supabaseClient.from('spare_parts').update({ stock: newStock }).eq('id', item.id);
    }

    // Persiapkan template cetak
    document.getElementById('inv-print-no').innerText = invoiceNo;
    document.getElementById('inv-print-date').innerText = new Date().toLocaleString('id-ID');
    document.getElementById('inv-print-cust').innerText = custName;
    document.getElementById('inv-print-phone').innerText = custPhone;
    document.getElementById('inv-print-cashier').innerText = currentUser.username;
    document.getElementById('inv-print-shop').innerText = document.getElementById('app-shop-title').innerText;
    document.getElementById('inv-print-hours').innerText = document.getElementById('app-working-hours').innerText;

    const printItemsBody = document.getElementById('inv-print-items');
    printItemsBody.innerHTML = '';
    cart.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="py-1">${item.name}</td>
            <td class="text-center py-1">${item.qty}</td>
            <td class="text-right py-1">${Number(item.price).toLocaleString('id-ID')}</td>
            <td class="text-right py-1">${Number(item.price * item.qty).toLocaleString('id-ID')}</td>
        `;
        printItemsBody.appendChild(tr);
    });
    document.getElementById('inv-print-total').innerText = `Rp ${totalAmount.toLocaleString('id-ID')}`;

    // Cetak browser
    window.print();

    // Reset keranjang
    cart = [];
    document.getElementById('cust-name').value = '';
    document.getElementById('cust-phone').value = '';
    renderCart();
    fetchSpareParts();
}

// --- MODULE: INVENTORY & IMAGE UPLOAD ---
function renderInventoryTable() {
    const tbody = document.getElementById('inventory-table-body');
    tbody.innerHTML = '';

    sparePartsCache.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-750';
        tr.innerHTML = `
            <td class="p-3"><img src="${item.image_url || 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=150'}" class="w-10 h-10 object-cover rounded"></td>
            <td class="p-3 font-mono text-xs">${item.code}</td>
            <td class="p-3 font-bold">${item.name}</td>
            <td class="p-3"><span class="bg-gray-900 text-orange-400 px-2 py-0.5 rounded text-xs">${item.category}</span></td>
            <td class="p-3">Rp ${Number(item.price).toLocaleString('id-ID')}</td>
            <td class="p-3">${item.stock}</td>
            <td class="p-3 text-center space-x-2">
                <button onclick="editItem(${item.id})" class="text-blue-400 hover:text-blue-300"><i class="fa-solid fa-pen-to-square"></i></button>
                <button onclick="deleteItem(${item.id})" class="text-red-400 hover:text-red-300"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openItemModal(itemId = null) {
    document.getElementById('item-form').reset();
    document.getElementById('item-id').value = '';
    if (itemId) {
        const item = sparePartsCache.find(i => i.id === itemId);
        if (item) {
            document.getElementById('item-modal-title').innerText = 'Edit Sparepart';
            document.getElementById('item-id').value = item.id;
            document.getElementById('item-code').value = item.code;
            document.getElementById('item-name').value = item.name;
            document.getElementById('item-category').value = item.category;
            document.getElementById('item-price').value = item.price;
            document.getElementById('item-stock').value = item.stock;
        }
    } else {
        document.getElementById('item-modal-title').innerText = 'Tambah Sparepart Baru';
    }
    document.getElementById('item-modal').classList.remove('hidden');
}

function closeItemModal() {
    document.getElementById('item-modal').classList.add('hidden');
}

async function handleSaveItem(e) {
    e.preventDefault();
    const id = document.getElementById('item-id').value;
    const code = document.getElementById('item-code').value.trim();
    const name = document.getElementById('item-name').value.trim();
    const category = document.getElementById('item-category').value.trim();
    const price = parseFloat(document.getElementById('item-price').value);
    const stock = parseInt(document.getElementById('item-stock').value);
    const imageFile = document.getElementById('item-image-file').files[0];

    let imageUrl = null;
    if (imageFile) {
        const fileName = `item-${Date.now()}-${imageFile.name}`;
        const { data: uploadData, error: uploadError } = await supabaseClient.storage.from('workshop-assets').upload(fileName, imageFile);
        if (!uploadError) {
            const { data: publicUrlData } = supabaseClient.storage.from('workshop-assets').getPublicUrl(fileName);
            imageUrl = publicUrlData.publicUrl;
        }
    }

    const payload = { code, name, category, price, stock };
    if (imageUrl) payload.image_url = imageUrl;

    if (id) {
        await supabaseClient.from('spare_parts').update(payload).eq('id', id);
    } else {
        await supabaseClient.from('spare_parts').insert([payload]);
    }

    closeItemModal();
    fetchSpareParts();
}

async function deleteItem(id) {
    if (confirm('Yakin ingin menghapus barang ini?')) {
        await supabaseClient.from('spare_parts').delete().eq('id', id);
        fetchSpareParts();
    }
}

function editItem(id) {
    openItemModal(id);
}

// --- MODULE: USER & 2FA MANAGEMENT (ADMIN ONLY) ---
async function fetchUsersList() {
    const { data, error } = await supabaseClient.from('users').select('*');
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '';

    if (data) {
        data.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="p-3 font-bold">${u.username}</td>
                <td class="p-3"><span class="px-2 py-0.5 rounded text-xs ${u.role === 'admin' ? 'bg-orange-900 text-orange-300' : 'bg-gray-700 text-gray-300'}">${u.role.toUpperCase()}</span></td>
                <td class="p-3">${u.is_2fa_enabled ? '<span class="text-green-400"><i class="fa-solid fa-check mr-1"></i> Aktif</span>' : 'Nonaktif'}</td>
                <td class="p-3 font-mono text-xs text-orange-400">${u.two_factor_code || '-'}</td>
                <td class="p-3 text-center space-x-2">
                    <button onclick="resetUser2FA(${u.id})" class="bg-blue-600/80 hover:bg-blue-600 text-white px-2.5 py-1 rounded text-xs"><i class="fa-solid fa-key mr-1"></i> Reset 2FA</button>
                    ${u.username !== 'admin' ? `<button onclick="deleteUser(${u.id})" class="bg-red-600/80 hover:bg-red-600 text-white px-2.5 py-1 rounded text-xs"><i class="fa-solid fa-trash mr-1"></i> Hapus</button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function openUserModal() {
    document.getElementById('new-user-form').reset();
    document.getElementById('user-modal').classList.remove('hidden');
}

function closeUserModal() {
    document.getElementById('user-modal').classList.add('hidden');
}

async function handleCreateUser(e) {
    e.preventDefault();
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value.trim();
    const role = document.getElementById('new-role').value;

    const { error } = await supabaseClient.from('users').insert([{
        username,
        password,
        role,
        is_2fa_enabled: true,
        two_factor_code: '123456'
    }]);

    if (error) {
        alert('Gagal menambah user: ' + error.message);
    } else {
        alert('User berhasil ditambahkan dengan kode 2FA default: 123456');
        closeUserModal();
        fetchUsersList();
    }
}

async function resetUser2FA(userId) {
    if (confirm('Reset kode 2FA user ini menjadi "123456"?')) {
        const { error } = await supabaseClient.from('users').update({ two_factor_code: '123456' }).eq('id', userId);
        if (!error) {
            alert('Kode 2FA berhasil direset ke "123456"');
            fetchUsersList();
        }
    }
}

async function deleteUser(userId) {
    if (confirm('Yakin ingin menghapus user ini?')) {
        await supabaseClient.from('users').delete().eq('id', userId);
        fetchUsersList();
    }
}

// --- MODULE: ADMIN SETTINGS (LOGO, WALLPAPER, HOURS) ---
async function handleSaveSettings(e) {
    e.preventDefault();
    const shopName = document.getElementById('setting-shop-name').value.trim();
    const workingHours = document.getElementById('setting-working-hours').value.trim();
    const logoFile = document.getElementById('setting-logo-file').files[0];
    const wallpaperFile = document.getElementById('setting-wallpaper-file').files[0];

    // Update shop name & working hours
    await supabaseClient.from('app_settings').upsert({ key: 'shop_name', value: shopName }, { onConflict: 'key' });
    await supabaseClient.from('app_settings').upsert({ key: 'working_hours', value: workingHours }, { onConflict: 'key' });

    // Handle Logo Upload
    if (logoFile) {
        const fileName = `logo-${Date.now()}-${logoFile.name}`;
        const { error: uploadErr } = await supabaseClient.storage.from('workshop-assets').upload(fileName, logoFile);
        if (!uploadErr) {
            const { data } = supabaseClient.storage.from('workshop-assets').getPublicUrl(fileName);
            await supabaseClient.from('app_settings').upsert({ key: 'logo_url', value: data.publicUrl }, { onConflict: 'key' });
        }
    }

    // Handle Wallpaper Upload
    if (wallpaperFile) {
        const fileName = `wallpaper-${Date.now()}-${wallpaperFile.name}`;
        const { error: uploadErr } = await supabaseClient.storage.from('workshop-assets').upload(fileName, wallpaperFile);
        if (!uploadErr) {
            const { data } = supabaseClient.storage.from('workshop-assets').getPublicUrl(fileName);
            await supabaseClient.from('app_settings').upsert({ key: 'wallpaper_url', value: data.publicUrl }, { onConflict: 'key' });
        }
    }

    alert('Pengaturan berhasil diperbarui!');
    loadAppSettings();
}