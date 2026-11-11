import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const urlParams = new URLSearchParams(window.location.search);
const noMeja = urlParams.get('meja') || 'Bungkus / Kasir';
document.getElementById('info-meja').innerText = `Meja: ${noMeja}`;

let cart = [];
let menus = [];
let selectedMenuForVariant = null;
let currentCategory = 'semua';

// Load menu real-time dari Firebase
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
        if(data.tersedia !== false) {
            menuContainer.innerHTML += `
                <div class="card">
                    <h4>${data.nama}</h4>
                    <p class="category-tag">${data.kategori || 'Makanan'}</p>
                    <p class="price">Rp ${data.harga.toLocaleString('id-ID')}</p>
                    <button onclick="openVariantModal('${data.id}')">Pilih / Tambah</button>
                </div>
            `;
        } else {
            menuContainer.innerHTML += `
                <div class="card out-of-stock">
                    <h4>${data.nama}</h4>
                    <p>Habis</p>
                </div>
            `;
        }
    });
}

window.openVariantModal = (id) => {
    selectedMenuForVariant = menus.find(m => m.id === id);
    if(!selectedMenuForVariant) return;

    document.getElementById('modal-item-name').innerText = selectedMenuForVariant.nama;
    
    // Tampilkan opsi varian spesifik jika berupa Makanan Utama (Ayam/Bebek/Lele)
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

    const itemToAdd = {
        id: selectedMenuForVariant.id,
        nama: selectedMenuForVariant.nama,
        harga: baseHarga,
        variantInfo: variantText.length > 0 ? variantText.join(' | ') : ''
    };

    cart.push(itemToAdd);
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
        const orderRef = await addDoc(collection(db, "orders"), {
            meja: noMeja,
            items: cart,
            notes: notes,
            payment: payment,
            total: totalHarga,
            status: 'pending',
            timestamp: serverTimestamp()
        });
        
        document.getElementById('main-content').style.display = 'none';
        document.getElementById('order-tracking').style.display = 'block';
        
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

function trackOrder(orderId) {
    onSnapshot(doc(db, "orders", orderId), (docData) => {
        if(!docData.exists()) return;
        const statusData = docData.data().status;
        const badge = document.getElementById('status-badge');
        
        if(statusData === 'pending') {
            badge.className = 'badge badge-pending';
            badge.innerText = 'Menunggu Dapur';
        } else if(statusData === 'dimasak') {
            badge.className = 'badge badge-cooking';
            badge.innerText = 'Sedang Dimasak';
        } else if(statusData === 'selesai') {
            badge.className = 'badge badge-success';
            badge.innerText = 'Pesanan Selesai / Diantar';
        }
    });
}
