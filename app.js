import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, doc, serverTimestamp, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const urlParams = new URLSearchParams(window.location.search);
let rawMeja = urlParams.get('meja');

// 3. Penomoran Antrean Otomatis untuk Takeaway / Bungkus
let noMeja = rawMeja ? `Meja ${rawMeja}` : `Bungkus #B-${Math.floor(100 + Math.random() * 900)}`;
document.getElementById('info-meja').innerText = noMeja;

let cart = [];
let menus = [];
let selectedMenuForVariant = null;
let currentCategory = 'semua';

// 1. Sakelar Buka / Tutup Warung Real-time
onSnapshot(doc(db, "settings", "store"), (docSnap) => {
    const isClosed = docSnap.exists() && docSnap.data().isOpen === false;
    document.getElementById('store-closed-banner').style.display = isClosed ? 'block' : 'none';
    document.getElementById('main-content').style.display = isClosed ? 'none' : 'block';
});

// 5. Load Menu & Manajemen Jumlah Stok Harian Real-time
onSnapshot(collection(db, "menus"), (snapshot) => {
    menus = [];
    snapshot.forEach((docData) => {
        menus.push({ id: docData.id, ...docData.data() });
    });
    renderMenuList();
});

window.filterCategory = (cat) => {
    currentCategory = cat;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    renderMenuList();
};

function renderMenuList() {
    const menuContainer = document.getElementById('menu-list');
    menuContainer.innerHTML = '';
    
    const filteredMenus = menus.filter(m => {
        if(currentCategory === 'semua') return true;
        return m.kategori === currentCategory;
    });

    if(filteredMenus.length === 0) {
        menuContainer.innerHTML = `<p style="grid-column: 1/-1; text-align:center;">Belum ada menu di kategori ini.</p>`;
        return;
    }

    filteredMenus.forEach((data) => {
        const sisaStok = data.stok !== undefined ? parseInt(data.stok) : 0;
        
        // 5. Render stok & status ketersediaan berbasis angka
        if(sisaStok > 0) {
            menuContainer.innerHTML += `
                <div class="card">
                    <h4>${data.nama}</h4>
                    <p class="category-tag">${data.kategori || 'Makanan'}</p>
                    <p class="price">Rp ${data.harga.toLocaleString('id-ID')}</p>
                    <p style="font-size:0.85em; color:#2ed573; font-weight:bold;">Sisa Stok: ${sisaStok} porsi</p>
                    <button onclick="openVariantModal('${data.id}')">Pilih / Tambah</button>
                </div>
            `;
        } else {
            menuContainer.innerHTML += `
                <div class="card out-of-stock">
                    <h4>${data.nama}</h4>
                    <p class="price">Rp ${data.harga.toLocaleString('id-ID')}</p>
                    <p style="color:#ff4757; font-weight:bold;">Stok Habis</p>
                </div>
            `;
        }
    });
}

window.openVariantModal = (id) => {
    selectedMenuForVariant = menus.find(m => m.id === id);
    if(!selectedMenuForVariant) return;

    document.getElementById('modal-item-name').innerText = selectedMenuForVariant.nama;
    document.getElementById('modal-item-stock').innerText = `Sisa Stok Siap Masak: ${selectedMenuForVariant.stok} porsi`;
    
    const isFood = (selectedMenuForVariant.kategori || 'Makanan') === 'Makanan';
    document.getElementById('group-nasi').style.display = isFood ? 'block' : 'none';
    document.getElementById('group-potongan').style.display = isFood ? 'block' : 'none';
    document.getElementById('group-sambal').style.display = isFood ? 'block' : 'none';

    document.getElementById('variant-modal').style.display = 'flex';
};

window.closeVariantModal = () => {
    document.getElementById('variant-modal').style.display = 'none';
    selectedMenuForVariant = null;
};

window.confirmAddToCart = () => {
    if(!selectedMenuForVariant) return;

    let baseHarga = parseInt(selectedMenuForVariant.harga);
    let variantText = [];
    const isFood = (selectedMenuForVariant.kategori || 'Makanan') === 'Makanan';

    if(isFood) {
        const nasi = document.getElementById('opt-nasi').value;
        const potongan = document.getElementById('opt-potongan').value;
        const sambal = document.getElementById('opt-sambal').value;

        if(nasi === 'Nasi Uduk') baseHarga += 2000;
        if(nasi === 'Tanpa Nasi') baseHarga -= 3000;

        variantText.push(nasi, `Potongan: ${potongan}`, sambal);
    }

    cart.push({
        id: selectedMenuForVariant.id,
        nama: selectedMenuForVariant.nama,
        harga: baseHarga,
        variantInfo: variantText.length > 0 ? variantText.join(' | ') : ''
    });

    renderCart();
    closeVariantModal();
};

window.removeFromCart = (index) => {
    cart.splice(index, 1);
    renderCart();
};

function renderCart() {
    const cartList = document.getElementById('cart-list');
    let total = 0;
    cartList.innerHTML = '';
    cart.forEach((item, index) => {
        total += parseInt(item.harga);
        cartList.innerHTML += `
            <li>
                <div>
                    <strong>${item.nama}</strong> - Rp ${item.harga.toLocaleString('id-ID')}
                    ${item.variantInfo ? `<br><small style="color:#666;">(${item.variantInfo})</small>` : ''}
                </div>
                <button class="btn-delete" onclick="removeFromCart(${index})">X</button>
            </li>
        `;
    });
    document.getElementById('total-price').innerText = total.toLocaleString('id-ID');
}

window.checkout = async () => {
    if (cart.length === 0) return alert('Pilih menu dulu bos!');
    
    const notes = document.getElementById('order-notes').value;
    const payment = document.getElementById('payment-method').value;
    const btn = document.getElementById('btn-checkout');
    btn.innerText = 'Memproses...';
    
    try {
        const totalHarga = cart.reduce((sum, item) => sum + parseInt(item.harga), 0);
        
        // Simpan dokumen pesanan ke Firestore
        const orderRef = await addDoc(collection(db, "orders"), {
            meja: noMeja,
            items: cart,
            notes: notes,
            payment: payment,
            total: totalHarga,
            status: 'pending',
            archived: false,
            timestamp: serverTimestamp()
        });

        // 5. Kurangi Jumlah Stok Harian di Firebase Secara Otomatis
        for (let item of cart) {
            if (item.id) {
                await updateDoc(doc(db, "menus", item.id), {
                    stok: increment(-1)
                });
            }
        }
        
        document.getElementById('main-content').style.display = 'none';
        document.getElementById('order-tracking').style.display = 'block';
        document.getElementById('track-meja').innerText = noMeja;
        
        const trackList = document.getElementById('track-items-list');
        trackList.innerHTML = '';
        cart.forEach(i => {
            trackList.innerHTML += `<li>${i.nama} ${i.variantInfo ? `(${i.variantInfo})` : ''} - Rp ${i.harga.toLocaleString('id-ID')}</li>`;
        });

        document.getElementById('track-total').innerText = totalHarga.toLocaleString('id-ID');
        document.getElementById('track-payment').innerText = payment;
        
        if(payment === 'QRIS') document.getElementById('qris-info').style.display = 'block';
        
        trackOrder(orderRef.id);
    } catch (e) {
        console.error(e);
        alert('Gagal mengirim pesanan. Coba lagi!');
        btn.innerText = 'Kirim ke Dapur';
    }
};

// 4. Update Status Pesanan & Indikator Estimasi Waktu Tunggu Real-time
function trackOrder(orderId) {
    onSnapshot(doc(db, "orders", orderId), (docData) => {
        if(!docData.exists()) return;
        const statusData = docData.data().status;
        const badge = document.getElementById('status-badge');
        const estBox = document.getElementById('est-time-box');
        
        if(statusData === 'pending') {
            badge.className = 'badge badge-pending';
            badge.innerText = 'Menunggu Konfirmasi Dapur';
            estBox.innerText = '⏱️ Estimasi Waktu Tunggu: 15 - 20 Menit';
            estBox.style.background = '#eccc68';
        } else if(statusData === 'dimasak') {
            badge.className = 'badge badge-cooking';
            badge.innerText = 'Sedang Dimasak 🍳';
            estBox.innerText = '🔥 Pesanan Lagi Digoreng! Estimasi Disajikan: 5 - 10 Menit Lagi';
            estBox.style.background = '#ffa502';
            estBox.style.color = '#fff';
        } else if(statusData === 'selesai') {
            badge.className = 'badge badge-success';
            badge.innerText = 'Pesanan Selesai / Diantar 🎉';
            estBox.innerText = '✅ Pesanan Siap Dinikmati! Terima Kasih 🙏';
            estBox.style.background = '#2ed573';
            estBox.style.color = '#fff';
        }
    });
}
