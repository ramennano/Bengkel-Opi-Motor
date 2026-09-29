import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const twoFaModal = document.getElementById('two-fa-modal');
  const twoFaForm = document.getElementById('two-fa-form');
  const resetTwoFaBtn = document.getElementById('reset-two-fa-btn');

  let pendingUser = null;

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value.trim();

      // Query ke database Supabase
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .single();

      // Tanpa memunculkan notif "Username atau Password salah!", gunakan penanganan netral
      if (error || !data) {
        showNeutralError();
        return;
      }

      pendingUser = data;

      // Cek apakah 2FA aktif untuk user ini
      if (data.two_fa_enabled) {
        twoFaModal.classList.remove('hidden');
      } else {
        completeLogin(data);
      }
    });
  }

  if (twoFaForm) {
    twoFaForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = document.getElementById('two-fa-code').value.trim();
      
      // Simulasi verifikasi kode 2FA (misal: '123456' atau cocok dengan secret)
      if (code === '123456' || code === pendingUser.two_fa_secret) {
        completeLogin(pendingUser);
      } else {
        alert('Kode 2FA tidak valid.');
      }
    });
  }

  if (resetTwoFaBtn) {
    resetTwoFaBtn.addEventListener('click', async () => {
      const usernameInput = prompt('Masukkan username yang ingin di-reset 2FA-nya:');
      if (!usernameInput) return;

      const { error } = await supabase
        .from('users')
        .update({ two_fa_enabled: false, two_fa_secret: null })
        .eq('username', usernameInput);

      if (!error) {
        alert('2FA berhasil di-reset untuk user: ' + usernameInput);
      } else {
        alert('Gagal mereset 2FA.');
      }
    });
  }
});

function showNeutralError() {
  const alertBox = document.getElementById('error-alert');
  if (alertBox) {
    alertBox.classList.remove('hidden');
    // Pesan netral tanpa menyebutkan detail spesifik credential
    alertBox.innerText = 'Akses tidak diizinkan atau periksa kembali input Anda.';
  }
}

function completeLogin(userData) {
  localStorage.setItem('opi_user', JSON.stringify(userData));
  window.location.href = 'dashboard.html';
}