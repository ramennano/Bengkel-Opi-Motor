// ================= MASUKKAN KREDENSIAL SUPABASE ANDA DI SINI =================
const SUPABASE_URL = 'https://ojlpeqhstbsuzjqccjgk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qbHBlcWhzdGJzdXpqcWNjamdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNjExNTcsImV4cCI6MjEwNTczNzE1N30.hMoVGhKUBUlcktrWhsBaOk5A673irsAsYn_iMdOJKjw';
// ==============================================================================

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentInvoice = [];

// Inisialisasi
document.addEventListener("DOMContentLoaded", () => {
    fetchSettings();
    if (localStorage.getItem('opi_session')) {
        currentUser = JSON.parse(localStorage.getItem('opi_session'));
        showDashboard();
    }

    // Perbaikan: Eksekusi login saat menekan 'Enter' di input password
    document.getElementById('password').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });
    
    // Perbaikan: Eksekusi 2FA saat menekan 'Enter' di input 2FA
    document.getElementById('twofa-pin').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            verify2FA();
        }
    });
});

// Autentikasi (Telah Diperbaiki)
async function handleLogin() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    const btnLogin = document.getElementById('btn-login');

    // Validasi input tidak boleh kosong
    if (!user || !pass) {
        alert("Username dan Password tidak boleh kosong!");
        return;
    }

    // Ubah status tombol menjadi loading
    btnLogin.innerText = "Memproses...";
    btnLogin.disabled = true;
    btnLogin.style.cursor = "not-allowed";

    try {
        const { data, error } = await supabase
            .from('app_users')
            .select('*')
            .eq('username', user)
            .eq('password', pass)
            .single();
        
        if (error) {
            alert("Username atau password salah!");
            console.error(error.message);
        } else if (data) {
            currentUser = data;
            document.getElementById('login-section').classList.add('hidden');
            document.getElementById('twofa-section').classList.remove('hidden');
        }
    } catch (err) {
        alert("Terjadi kesalahan jaringan/server.");
        console.error(err);
    } finally {
        // Kembalikan status tombol
        btnLogin.innerText = "Masuk";
        btnLogin.disabled = false;
        btnLogin.style.cursor = "pointer";
    }
}

function verify2FA() {
    const pin = document.getElementById('twofa-pin').value;
    if (pin === currentUser.two_fa_pin) {
        localStorage.setItem('opi_session', JSON.stringify(currentUser));
        showDashboard();
    } else {
        alert("PIN 2FA Salah!");
    }
}

function cancelLogin() {
    currentUser = null;
    document.getElementById('twofa-section').classList.add('hidden');
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('twofa-pin').value = '';
}

function logout() {
    localStorage.removeItem('opi_session');
    location.reload();
}

// UI Dashboard
function showDashboard() {
    document.getElementById('twofa-section').classList.add('hidden');
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.remove('hidden');
    document.getElementById('dynamic-wallpaper').style.display = 'none';

    // Hak Akses Admin
    const adminElements = document.querySelectorAll('.admin-only');
    adminElements.forEach(el => {
        el.style.display = currentUser.role === 'admin' ? 'block' : 'none';
    });

    loadSpareParts();
    if(currentUser.role === 'admin') loadUsers();
}

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
}

// Pengaturan Admin
async function fetchSettings() {
    const { data } = await supabase.from('app_settings').select('*').single();
    if (data) {
        if(data.wallpaper_url) document.getElementById('dynamic-wallpaper').style.backgroundImage = `url('${data.wallpaper_url}')`;
        if(data.logo_url) {
            document.getElementById('login-logo').src = data.logo_url;
            document.getElementById('login-logo').style.display = 'block';
            document.getElementById('dash-logo').src = data.logo_url;
            document.getElementById('dash-logo').style.display = 'block';
        }
        document.getElementById('op-hours').innerText = data.operational_hours;
        document.getElementById('invoice-hours').innerText = data.operational_hours;
        document.getElementById('set-hours').value = data.operational_hours;
    }
}

async function uploadFile(fileInput) {
    const file = document.getElementById(fileInput).files[0];
    if (!file) return null;
    const fileName = `${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage.from('opimotor_media').upload(fileName, file);
    if (error) { alert("Gagal upload gambar!"); return null; }
    return supabase.storage.from('opimotor_media').getPublicUrl(fileName).data.publicUrl;
}

async function saveSettings() {
    const hours = document.getElementById('set-hours').value;
    let logoUrl = await uploadFile('set-logo');
    let wallpaperUrl = await uploadFile('set-wallpaper');

    const updateData = { operational_hours: hours };
    if (logoUrl) updateData.logo_url = logoUrl;
    if (wallpaperUrl) updateData.wallpaper_url = wallpaperUrl;

    await supabase.from('app_settings').update(updateData).eq('id', 1);
    alert("Pengaturan disimpan!");
    location.reload();
}

// Manajemen Spare Part
async function loadSpareParts() {
    const { data } = await supabase.from('spare_parts').select('*');
    const list = document.getElementById('sparepart-list');
    const select = document.getElementById('invoice-item');
    list.innerHTML = ''; select.innerHTML = '<option value="">-- Pilih Barang --</option>';

    data.forEach(item => {
        list.innerHTML += `
            <div class="item-card">
                <img src="${item.image_url || 'https://via.placeholder.com/150'}" alt="${item.name}">
                <h3>${item.name}</h3>
                <p>Rp ${item.price.toLocaleString('id-ID')}</p>
                <p>Stok: ${item.stock}</p>
                ${currentUser.role === 'admin' ? `<button onclick="deletePart(${item.id})" class="btn-danger" style="padding:5px;">Hapus</button>` : ''}
            </div>
        `;
        select.innerHTML += `<option value='${JSON.stringify(item)}'>${item.name} - Rp ${item.price.toLocaleString('id-ID')}</option>`;
    });
}

async function addSparePart() {
    const name = document.getElementById('sp-name').value;
    const price = document.getElementById('sp-price').value;
    const stock = document.getElementById('sp-stock').value;
    let imgUrl = await uploadFile('sp-image');

    await supabase.from('spare_parts').insert([{ name, price, stock, image_url: imgUrl }]);
    alert("Barang ditambahkan!");
    loadSpareParts();
}

async function deletePart(id) {
    if(confirm("Hapus barang ini?")) {
        await supabase.from('spare_parts').delete().eq('id', id);
        loadSpareParts();
    }
}

// Invoice
function addToInvoice() {
    const itemData = document.getElementById('invoice-item').value;
    if (!itemData) return;
    const item = JSON.parse(itemData);
    const qty = document.getElementById('invoice-qty').value;
    
    currentInvoice.push({ ...item, qty: parseInt(qty), subtotal: item.price * qty });
    renderInvoice();
}

function renderInvoice() {
    const tbody = document.getElementById('invoice-body');
    let total = 0;
    tbody.innerHTML = '';
    currentInvoice.forEach((item, index) => {
        total += item.subtotal;
        tbody.innerHTML += `
            <tr>
                <td>${item.name}</td>
                <td>${item.qty}</td>
                <td>Rp ${item.price.toLocaleString('id-ID')}</td>
                <td>Rp ${item.subtotal.toLocaleString('id-ID')}</td>
            </tr>
        `;
    });
    document.getElementById('invoice-total').innerText = total.toLocaleString('id-ID');
}

function clearInvoice() { currentInvoice = []; renderInvoice(); }

// Manajemen Pengguna (Admin)
async function loadUsers() {
    const { data } = await supabase.from('app_users').select('*');
    const tbody = document.getElementById('users-list');
    tbody.innerHTML = '';
    data.forEach(u => {
        tbody.innerHTML += `
            <tr>
                <td>${u.username}</td>
                <td>${u.role}</td>
                <td>${u.two_fa_pin === '000000' ? 'Default' : 'Telah Diubah'}</td>
                <td>
                    <button onclick="reset2FA(${u.id})" style="padding:5px; background:var(--secondary);">Reset 2FA</button>
                    ${u.username !== 'admin' ? `<button onclick="deleteUser(${u.id})" class="btn-danger" style="padding:5px;">Hapus</button>` : ''}
                </td>
            </tr>
        `;
    });
}

async function addUser() {
    const user = document.getElementById('new-username').value;
    const pass = document.getElementById('new-password').value;
    const role = document.getElementById('new-role').value;
    
    await supabase.from('app_users').insert([{ username: user, password: pass, role: role, two_fa_pin: '000000' }]);
    alert("User ditambahkan dengan PIN 2FA default: 000000");
    loadUsers();
}

async function reset2FA(id) {
    if(confirm("Kembalikan PIN 2FA user ini ke default (000000)?")) {
        await supabase.from('app_users').update({ two_fa_pin: '000000' }).eq('id', id);
        alert("2FA direset!");
        loadUsers();
    }
}

async function deleteUser(id) {
    if(confirm("Hapus user ini?")) {
        await supabase.from('app_users').delete().eq('id', id);
        loadUsers();
    }
}