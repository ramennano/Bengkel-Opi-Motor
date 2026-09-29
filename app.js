// ISI DENGAN CREDENTIALS SUPABASE ANDA
const SUPABASE_URL = 'https://XXXX.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// Secondary client untuk create user tanpa logout admin yang sedang aktif
const supabaseAdminCreate = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let currentUser = null;
let currentRole = null;
let cart = [];

// ================== INIT & SETTINGS ==================
window.onload = async () => {
    await loadSettings();
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        await checkUserRole(session.user);
    }
};

async function loadSettings() {
    const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).single();
    if (data) {
        if(data.wallpaper_url) document.getElementById('app-body').style.backgroundImage = `url('${data.wallpaper_url}')`;
        if(data.logo_url) {
            document.getElementById('login-logo').src = data.logo_url;
            document.getElementById('dash-logo').src = data.logo_url;
        }
        document.getElementById('login-hours').innerText = `Jam Operasional: ${data.work_hours}`;
        document.getElementById('set-hours').value = data.work_hours;
        document.getElementById('print-hours').innerText = `Jam Operasional: ${data.work_hours}`;
    }
}

// ================== AUTHENTICATION (Bypass Email) ==================
async function handleLogin() {
    const userIn = document.getElementById('login-username').value;
    const passIn = document.getElementById('login-password').value;
    const pinIn = document.getElementById('login-pin').value;
    
    // Trik Bypass: Mengubah username menjadi format email internal
    const fakeEmail = `${userIn}@opimotor.local`;

    const { data, error } = await supabase.auth.signInWithPassword({ email: fakeEmail, password: passIn });
    if (error) return Swal.fire('Error', 'Username atau Password salah!', 'error');

    // Cek PIN 2FA di database profil
    const { data: profile } = await supabase.from('user_profiles').select('pin_2fa, role').eq('id', data.user.id).single();
    
    if (profile.pin_2fa && profile.pin_2fa !== pinIn) {
        await supabase.auth.signOut();
        return Swal.fire('2FA Required', 'PIN 2FA salah atau belum dimasukkan!', 'warning');
    }

    await checkUserRole(data.user);
}

async function checkUserRole(user) {
    currentUser = user;
    const { data } = await supabase.from('user_profiles').select('role, username').eq('id', user.id).single();
    currentRole = data ? data.role : 'kasir';
    
    document.getElementById('user-role-display').innerText = `${data.username} (${currentRole})`;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');

    if (currentRole === 'admin') {
        document.getElementById('admin-menus').classList.remove('hidden');
    } else {
        document.getElementById('admin-menus').classList.add('hidden');
    }
    
    showTab('pos');
    loadStock();
    loadUsers();
}

async function handleLogout() {
    await supabase.auth.signOut();
    location.reload();
}

// ================== UI NAVIGATION ==================
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
}

// ================== ADMIN: SETTINGS ==================
async function uploadFile(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const { data, error } = await supabase.storage.from('opimotor-assets').upload(fileName, file);
    if (error) return null;
    return `${SUPABASE_URL}/storage/v1/object/public/opimotor-assets/${fileName}`;
}

async function saveSettings() {
    const logoFile = document.getElementById('set-logo').files[0];
    const bgFile = document.getElementById('set-bg').files[0];
    const hours = document.getElementById('set-hours').value;

    let updates = { work_hours: hours };
    Swal.fire({title: 'Menyimpan...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});

    if (logoFile) updates.logo_url = await uploadFile(logoFile);
    if (bgFile) updates.wallpaper_url = await uploadFile(bgFile);

    await supabase.from('app_settings').update(updates).eq('id', 1);
    Swal.fire('Sukses', 'Pengaturan berhasil disimpan!', 'success').then(() => location.reload());
}

// ================== ADMIN: USER MANAGEMENT ==================
async function loadUsers() {
    if(currentRole !== 'admin') return;
    const { data } = await supabase.from('user_profiles').select('*');
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '';
    data.forEach(u => {
        tbody.innerHTML += `
            <tr class="border-b">
                <td class="p-4 font-bold">${u.username}</td>
                <td class="p-4">${u.role}</td>
                <td class="p-4">${u.pin_2fa ? 'Aktif 🟢' : 'Tidak 🔴'}</td>
                <td class="p-4">
                    <button onclick="reset2FA('${u.id}')" class="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600">Reset 2FA</button>
                    <button onclick="deleteUser('${u.id}')" class="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 ml-2">Hapus</button>
                    ${!u.pin_2fa ? `<button onclick="set2FA('${u.id}')" class="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600 ml-2">Set PIN 2FA</button>` : ''}
                </td>
            </tr>
        `;
    });
}

async function createUser() {
    const userIn = document.getElementById('new-user-name').value;
    const passIn = document.getElementById('new-user-pass').value;
    const roleIn = document.getElementById('new-user-role').value;
    
    const fakeEmail = `${userIn}@opimotor.local`;
    
    Swal.fire({title: 'Membuat User...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
    
    // Gunakan client kedua agar admin tidak ter-logout
    const { data, error } = await supabaseAdminCreate.auth.signUp({ email: fakeEmail, password: passIn });
    if(error) return Swal.fire('Error', error.message, 'error');

    await supabase.from('user_profiles').insert([{ id: data.user.id, username: userIn, role: roleIn }]);
    Swal.fire('Sukses', 'User berhasil dibuat', 'success');
    loadUsers();
}

async function reset2FA(userId) {
    await supabase.from('user_profiles').update({ pin_2fa: null }).eq('id', userId);
    Swal.fire('Sukses', '2FA User telah di-reset (dinonaktifkan).', 'success');
    loadUsers();
}

async function set2FA(userId) {
    const { value: pin } = await Swal.fire({
        title: 'Buat PIN 2FA (6 Angka)',
        input: 'text',
        inputAttributes: { maxlength: 6 },
        showCancelButton: true
    });
    if (pin) {
        await supabase.from('user_profiles').update({ pin_2fa: pin }).eq('id', userId);
        Swal.fire('Sukses', 'PIN 2FA berhasil dipasang', 'success');
        loadUsers();
    }
}

async function deleteUser(userId) {
    // Note: Penghapusan dari auth.users via frontend terbatas, kita hapus profilnya agar akses hilang
    await supabase.from('user_profiles').delete().eq('id', userId);
    Swal.fire('Sukses', 'Profil User dihapus (Akses dicabut)', 'success');
    loadUsers();
}

// ================== STOCK & INVOICE / POS ==================
async function addStock() {
    const name = document.getElementById('stk-name').value;
    const price = document.getElementById('stk-price').value;
    const qty = document.getElementById('stk-qty').value;
    const imgFile = document.getElementById('stk-img').files[0];

    Swal.fire({title: 'Menyimpan Barang...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
    let img_url = null;
    if (imgFile) img_url = await uploadFile(imgFile);

    await supabase.from('spare_parts').insert([{ name, price, stock: qty, image_url: img_url }]);
    Swal.fire('Sukses', 'Barang ditambahkan', 'success');
    loadStock();
}

async function loadStock() {
    const { data } = await supabase.from('spare_parts').select('*');
    
    // Render for Stock Tab
    const grid = document.getElementById('stock-grid');
    grid.innerHTML = '';
    
    // Render for POS Tab
    const posList = document.getElementById('pos-item-list');
    posList.innerHTML = '';

    data.forEach(item => {
        const img = item.image_url ? `<img src="${item.image_url}" class="h-32 w-full object-cover rounded mb-2">` : '<div class="h-32 bg-gray-200 rounded mb-2 flex items-center justify-center text-gray-500">No Image</div>';
        
        // Stock Tab UI
        grid.innerHTML += `
            <div class="bg-white p-4 rounded shadow border text-center">
                ${img}
                <h4 class="font-bold">${item.name}</h4>
                <p class="text-blue-600 font-bold">Rp ${Number(item.price).toLocaleString('id-ID')}</p>
                <p class="text-sm text-gray-500">Stok: ${item.stock}</p>
                ${currentRole === 'admin' ? `<button onclick="deleteStock('${item.id}')" class="mt-2 text-xs bg-red-100 text-red-600 px-2 py-1 rounded">Hapus</button>` : ''}
            </div>
        `;

        // POS Tab UI
        posList.innerHTML += `
            <div class="flex justify-between items-center p-2 hover:bg-gray-50 border-b cursor-pointer" onclick="addToCart('${item.id}', '${item.name}', ${item.price})">
                <div><p class="font-bold">${item.name}</p><p class="text-xs text-gray-500">Stok: ${item.stock}</p></div>
                <div class="font-bold text-blue-600">Rp ${Number(item.price).toLocaleString('id-ID')}</div>
            </div>
        `;
    });
}

async function deleteStock(id) {
    await supabase.from('spare_parts').delete().eq('id', id);
    loadStock();
}

// -- Cart Logic --
function addToCart(id, name, price) {
    const existing = cart.find(i => i.id === id);
    if(existing) existing.qty += 1;
    else cart.push({ id, name, price, qty: 1 });
    renderCart();
}

function renderCart() {
    const cDiv = document.getElementById('pos-cart');
    cDiv.innerHTML = '';
    let total = 0;
    cart.forEach((item, index) => {
        const sub = item.price * item.qty;
        total += sub;
        cDiv.innerHTML += `
            <div class="flex justify-between items-center bg-gray-50 p-2 rounded border">
                <div>
                    <p class="font-bold text-sm">${item.name}</p>
                    <p class="text-xs text-gray-500">${item.qty} x Rp ${Number(item.price).toLocaleString('id-ID')}</p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="font-bold text-sm">Rp ${sub.toLocaleString('id-ID')}</span>
                    <button onclick="cart.splice(${index}, 1); renderCart()" class="text-red-500 text-xl font-bold px-2">&times;</button>
                </div>
            </div>
        `;
    });
    document.getElementById('pos-total').innerText = `Rp ${total.toLocaleString('id-ID')}`;
}

function printInvoice() {
    if(cart.length === 0) return Swal.fire('Kosong', 'Keranjang masih kosong!', 'error');
    
    const pBody = document.getElementById('print-items');
    pBody.innerHTML = '';
    let total = 0;
    
    cart.forEach(item => {
        const sub = item.price * item.qty;
        total += sub;
        pBody.innerHTML += `
            <tr class="border-b">
                <td class="py-2">${item.name}</td>
                <td>${item.qty}</td>
                <td>Rp ${Number(item.price).toLocaleString('id-ID')}</td>
                <td>Rp ${sub.toLocaleString('id-ID')}</td>
            </tr>
        `;
    });
    
    document.getElementById('print-total').innerText = `Rp ${total.toLocaleString('id-ID')}`;
    
    // Panggil fungsi print bawaan browser
    window.print();
}