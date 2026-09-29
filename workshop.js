import { supabase } from './supabase.js';

export async function initWorkshop() {
  loadSpareParts();

  // Tambah Spare Part dengan Upload Gambar
  document.getElementById('part-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('part-name').value;
    const category = document.getElementById('part-category').value;
    const price = document.getElementById('part-price').value;
    const stock = document.getElementById('part-stock').value;
    const imageFile = document.getElementById('part-image').files[0];

    let imageUrl = '';
    if (imageFile) {
      const { data } = await supabase.storage.from('bengkel-assets').upload(`part_${Date.now()}`, imageFile);
      if (data) {
        const { publicUrl } = supabase.storage.from('bengkel-assets').getPublicUrl(data.path);
        imageUrl = publicUrl;
      }
    }

    const { error } = await supabase.from('spare_parts').insert([{ name, category, price, stock, image_url: imageUrl }]);
    if (!error) {
      alert('Spare part berhasil ditambahkan!');
      document.getElementById('part-form').reset();
      loadSpareParts();
    }
  });
}

async function loadSpareParts() {
  const { data } = await supabase.from('spare_parts').select('*');
  const grid = document.getElementById('spare-parts-grid');
  if (!grid) return;

  grid.innerHTML = '';
  data.forEach(part => {
    grid.innerHTML += `
      <div class="bg-white p-4 rounded shadow">
        <img src="${part.image_url || 'https://via.placeholder.com/150'}" class="w-full h-32 object-cover rounded mb-2">
        <h4 class="font-bold">${part.name}</h4>
        <p class="text-sm text-gray-600">Kategori: ${part.category}</p>
        <p class="text-sm text-gray-600">Stok: ${part.stock}</p>
        <p class="text-green-600 font-semibold">Rp ${Number(part.price).toLocaleString()}</p>
      </div>
    `;
  });
}

// Fungsi Cetak Invoice
window.printInvoice = function(invoiceData) {
  document.getElementById('inv-customer').innerText = invoiceData.customer_name;
  document.getElementById('inv-number').innerText = invoiceData.invoice_number;
  document.getElementById('inv-date').innerText = new Date().toLocaleDateString();
  
  let itemsHtml = '';
  invoiceData.items.forEach(item => {
    itemsHtml += `<tr><td>${item.name}</td><td>${item.qty}</td><td>Rp ${item.price}</td></tr>`;
  });
  document.getElementById('inv-items').innerHTML = itemsHtml;
  document.getElementById('inv-total').innerText = invoiceData.total_amount;

  window.print();
}