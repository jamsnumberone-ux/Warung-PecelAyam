import { db } from './firebase-config.js';
import { collection, addDoc, deleteDoc, doc, onSnapshot, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 1. LIVE ORDERS & REPORTS
const qOrders = query(collection(db, "orders"), orderBy("timestamp", "desc"));
onSnapshot(qOrders, (snapshot) => {
    const orderContainer = document.getElementById('order-list');
    const completedList = document.getElementById('completed-orders-list');
    
    orderContainer.innerHTML = '';
    completedList.innerHTML = '';
    let totalRevenue = 0;

    snapshot.forEach((docData) => {
        const order = docData.data();
        const items = order.items.map(i => i.nama).join(', ');
        
        // Tampilan Live Order (Dapur)
        if(order.status === 'pending' || order.status === 'dimasak') {
            const btnAksi = order.status === 'pending' 
                ? `<button class="btn-warning" onclick="updateStatus('${docData.id}', 'dimasak')">Mulai Masak</button>`
                : `<button class="btn-success" onclick="updateStatus('${docData.id}', 'selesai')">Selesai & Antar</button>`;
            
            orderContainer.innerHTML += `
                <div class="card order-card">
                    <h3>Meja ${order.meja} <span class="badge">${order.status.toUpperCase()}</span></h3>
                    <p><strong>Menu:</strong> ${items}</p>
                    <p class="notes"><strong>Catatan:</strong> ${order.notes || '-'}</p>
                    <p><strong>Bayar:</strong> ${order.payment}</p>
                    ${btnAksi}
                </div>
            `;
        }
        
        // Tampilan Laporan Penjualan
        if(order.status === 'selesai') {
            totalRevenue += order.total;
            completedList.innerHTML += `
                <li>
                    Meja ${order.meja} (${order.payment})
                    <span>Rp ${order.total}</span>
                </li>
            `;
        }
    });
    
    document.getElementById('total-revenue').innerText = totalRevenue;
});

window.updateStatus = async (id, newStatus) => {
    await updateDoc(doc(db, "orders", id), { status: newStatus });
};

// 2. CRUD & TOGGLE MENU
onSnapshot(collection(db, "menus"), (snapshot) => {
    const list = document.getElementById('admin-menu-list');
    list.innerHTML = '';
    snapshot.forEach((docData) => {
        const data = docData.data();
        const stokText = data.tersedia === false ? 'Stok Habis' : 'Tersedia';
        const toggleClass = data.tersedia === false ? 'btn-warning' : 'btn-success';
        
        list.innerHTML += `
            <li>
                <div>
                    <strong>${data.nama}</strong> - Rp ${data.harga}<br>
                    <small>Status: ${stokText}</small>
                </div>
                <div style="display:flex; gap:5px;">
                    <button class="${toggleClass} btn-small" onclick="toggleStok('${docData.id}', ${data.tersedia})">Toggle</button>
                    <button class="btn-delete btn-small" onclick="hapusMenu('${docData.id}')">X</button>
                </div>
            </li>
        `;
    });
});

window.tambahMenu = async () => {
    const nama = document.getElementById('nama-menu').value;
    const harga = document.getElementById('harga-menu').value;
    if(!nama || !harga) return alert("Isi nama dan harga!");

    await addDoc(collection(db, "menus"), { nama, harga: parseInt(harga), tersedia: true });
    document.getElementById('nama-menu').value = '';
    document.getElementById('harga-menu').value = '';
};

window.toggleStok = async (id, statusSaatIni) => {
    // Kalau undfined/true jadi false, kalau false jadi true
    const newStatus = statusSaatIni === false ? true : false;
    await updateDoc(doc(db, "menus", id), { tersedia: newStatus });
};

window.hapusMenu = async (id) => {
    if(confirm('Yakin hapus?')) await deleteDoc(doc(db, "menus", id));
};
