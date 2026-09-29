import { supabase } from './supabase.js';

export async function initAdminPanel() {
  const user = JSON.parse(localStorage.getItem('opi_user'));
  if (!user || user.role !== 'admin') return;

  loadSettings();
  loadUserList();

  // Handle Update Pengaturan (Logo, Wallpaper, Jam Operasional)
  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const workingHours = document.getElementById('working-hours-input').value;
    const logoFile = document.getElementById('logo-file').files[0];
    const wallpaperFile = document.getElementById('wallpaper-file').files[0];

    let logoUrl = document.getElementById('current-logo').value;
    let wallpaperUrl = document.getElementById('current-wallpaper').value;

    if (logoFile) {
      const { data } = await supabase.storage.from('bengkel-assets').upload(`logo_${Date.now()}`, logoFile);
      if (data) {
        const { publicUrl } = supabase.storage.from('bengkel-assets').getPublicUrl(data.path);
        logoUrl = publicUrl;
      }
    }

    if (wallpaperFile) {
      const { data } = await supabase.storage.from('bengkel-assets').upload(`wall_${Date.now()}`, wallpaperFile);
      if (data) {
        const { publicUrl } = supabase.storage.from('bengkel-assets').getPublicUrl(data.path);
        wallpaperUrl = publicUrl;
      }
    }

    await supabase.from('settings').upsert([
      { key: 'logo_url', value: logoUrl },
      { key: 'wallpaper_url', value: wallpaperUrl },
      { key: 'working_hours', value: workingHours }
    ], { onConflict: 'key' });

    alert('Pengaturan bengkel berhasil diperbarui!');
    loadSettings();
  });

  // Handle Tambah User Baru
  document.getElementById('add-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('new-username').value;
    const password = document.getElementById('new-password').value;
    const role = document.getElementById('new-role').value;

    const { error } = await supabase.from('users').insert([{ username, password, role }]);
    if (!error) {
      alert('User baru berhasil ditambahkan!');
      document.getElementById('add-user-form').reset();
      loadUserList();
    } else {
      alert('Gagal menambah user.');
    }
  });
}

async function loadSettings() {
  const { data } = await supabase.from('settings').select('*');
  if (data) {
    data.forEach(item => {
      if (item.key === 'logo_url') {
        document.getElementById('brand-logo').src = item.value;
        document.getElementById('current-logo').value = item.value;
      }
      if (item.key === 'wallpaper_url') {
        document.getElementById('app-wallpaper').style.backgroundImage = `url('${item.value}')`;
        document.getElementById('current-wallpaper').value = item.value;
      }
      if (item.key === 'working_hours') {
        document.getElementById('working-hours-display').innerText = item.value;
        document.getElementById('working-hours-input').value = item.value;
      }
    });
  }
}

async function loadUserList() {
  const { data } = await supabase.from('users').select('*');
  const container = document.getElementById('user-list-container');
  if (!container) return;

  container.innerHTML = '';
  data.forEach(u => {
    container.innerHTML += `
      <div class="flex justify-between items-center p-2 border-b">
        <span>${u.username} (${u.role})</span>
        ${u.username !== 'admin' ? `<button onclick="deleteUser(${u.id})" class="text-red-500 hover:underline">Hapus</button>` : ''}
      </div>
    `;
  });
}

window.deleteUser = async function(id) {
  if (confirm('Yakin ingin menghapus user ini?')) {
    await supabase.from('users').delete().eq('id', id);
    loadUserList();
  }
}