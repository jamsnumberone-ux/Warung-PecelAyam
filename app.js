import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const urlParams = new URLSearchParams(window.location.search);
const noMeja = urlParams.get('meja') || 'Bungkus / Kasir';
document.getElementById('info-meja').innerText = `Meja: ${noMeja}`;

let cart = [];
let menus = [];

// Load menu real-time
onSnapshot(collection(db, "menus"), (snapshot) => {
    const menuContainer = document.getElementById('menu-list');
    menuContainer.innerHTML = '';
    menus = [];
    
    snapshot.forEach((docData) => {
        const data = docData.data();
        menus.push({ id: docData.id, ...data });
        
        if(data.tersedia !== false) {
            menuContainer.innerHTML += `
                <div class="card">
                    <h4>${data.nama}</h4>
                    <p>Rp ${data.harga}</p>
                    <button onclick="addToCart('${docData.id}')">Tambah</button>
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
});

window.addToCart = (id) => {
    const item = menus.find(m => m.id === id);
    cart.push(item);
    renderCart();
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
                ${item.nama} - Rp ${item.harga}
                <button class="btn-delete" onclick="removeFromCart(${index})">X</button>
            </li>
        `;
    });
    document.getElementById('total-price').innerText = total;
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
        
        // Sembunyikan menu, tampilkan tracking
        document.getElementById('main-content').style.display = 'none';
        document.getElementById('order-tracking').style.display = 'block';
        document.getElementById('track-items').innerText = cart.map(i => i.nama).join(', ');
        document.getElementById('track-total').innerText = totalHarga;
        document.getElementById('track-payment').innerText = payment;
        
        if(payment === 'QRIS') document.getElementById('qris-info').style.display = 'block';
        
        trackOrder(orderRef.id);
    } catch (e) {
        console.error(e);
        btn.innerText = 'Kirim ke Dapur';
    }
};

function trackOrder(orderId) {
    onSnapshot(doc(db, "orders", orderId), (docData) => {
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
