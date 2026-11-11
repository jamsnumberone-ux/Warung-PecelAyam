import { db } from './firebase-config.js';
import { collection, addDoc, deleteDoc, doc, onSnapshot, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let soundEnabled = false;
let isInitialLoad = true;
let currentSelectedOrder = null;

window.toggleAudioAlert = () => {
    const sound = document.getElementById('order-sound');
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('btn-audio-toggle');
    if(soundEnabled) {
        sound.play().then(() => sound.pause());
        btn.innerText = '🔔 Suara Aktif';
        btn.className = 'btn-success';
    } else {
        btn.innerText = '🔕 Suara Mati';
        btn.className = 'btn-warning';
    }
};

// 1. LIVE ORDERS & NOTIFIKASI SUARA
const qOrders = query(collection(db, "orders"), orderBy("timestamp", "desc"));
onSnapshot(qOrders, (snapshot) => {
    const orderContainer = document.getElementById('order-list');
    const completedList = document.getElementById('completed-orders-list');
    
    orderContainer.innerHTML = '';
    completedList.innerHTML = '';
    let totalRevenue = 0;
    let hasNewPending = false;

    snapshot.docChanges().forEach((change) => {
        if (change.type === "added" && change.doc.data().status === "pending") {
            hasNewPending = true;
        }
    });

    if (!isInitialLoad && hasNewPending && soundEnabled) {
        const sound = document.getElementById('order-sound');
        sound.play().catch(e => console.log('Audio autoplay blocked', e));
    }
    isInitialLoad = false;

    snapshot.forEach((docData) => {
        const order = { id: docData.id, ...docData.data() };
        
        // Render rincian item dengan variannya
        const itemDetails = order.items.map(i => {
            return `<li>• ${i.nama} ${i.variantInfo ? `<br><small style="color:#555;">(${i.variantInfo})</small>` : ''} - Rp ${i.harga.toLocaleString('id-ID')}</li>`;
        }).join('');
        
        // Tampilan Live Order Dapur
        if(order.status === 'pending' || order.status === 'dimasak') {
            const btnAksi = order.status === 'pending' 
                ? `<button class="btn-warning" onclick="updateStatus('${order.id}', 'dimasak')">Mulai Masak</button>`
                : `<button class="btn-success" onclick="openCalcModal('${order.id}')">Selesai & Cetak Struk</button>`;
            
            orderContainer.innerHTML += `
                <div class="card order-card">
                    <h3>Meja ${order.meja} <span class="badge badge-${order.status === 'pending' ? 'pending' : 'cooking'}">${order.status.toUpperCase()}</span></h3>
                    <ul style="padding-left:0; margin:10px 0;">${itemDetails}</ul>
                    <p class="notes"><strong>Catatan:</strong> ${order.notes || '-'}</p>
                    <p><strong>Total:</strong> Rp ${order.total.toLocaleString('id-ID')} (${order.payment})</p>
                    ${btnAksi}
                </div>
            `;
        }
        
        // Laporan Penjualan
        if(order.status === 'selesai') {
            totalRevenue += order.total;
            completedList.innerHTML += `
                <li>
                    <span>Meja ${order.meja} (${order.payment})</span>
                    <strong>Rp ${order.total.toLocaleString('id-ID')}</strong>
                </li>
            `;
        }
    });
    
    document.getElementById('total-revenue').innerText = totalRevenue.toLocaleString('id-ID');
});

window.updateStatus = async (id, newStatus) => {
    await updateDoc(doc(db, "orders", id), { status: newStatus });
};

// 2. KALKULATOR KEMBALIAN & PRINT STRUK
let activeOrderForCalc = null;

window.openCalcModal = (orderId) => {
    onSnapshot(doc(db, "orders", orderId), (docData) => {
        activeOrderForCalc = { id: docData.id, ...docData.data() };
        document.getElementById('modal-total-bill').innerText = activeOrderForCalc.total.toLocaleString('id-ID');
        document.getElementById('input-cash').value = activeOrderForCalc.payment === 'QRIS' ? activeOrderForCalc.total : '';
        calculateChange();
        document.getElementById('calc-modal').style.display = 'flex';
    }, { once: true });
};

window.closeCalcModal = () => {
    document.getElementById('calc-modal').style.display = 'none';
    activeOrderForCalc = null;
};

window.calculateChange = () => {
    if(!activeOrderForCalc) return;
    const cash = parseInt(document.getElementById('input-cash').value) || 0;
    const change = cash - activeOrderForCalc.total;
    document.getElementById('modal-change').innerText = change > 0 ? change.toLocaleString('id-ID') : '0';
};

window.processPaymentAndPrint = async () => {
    if(!activeOrderForCalc) return;
    const cash = parseInt(document.getElementById('input-cash').value) || 0;
    
    if(cash < activeOrderForCalc.total && activeOrderForCalc.payment === 'Tunai') {
        return alert('Uang diterima kurang dari total tagihan!');
    }

    const change = cash - activeOrderForCalc.total;

    // Isi template struk sebelum dicetak
    document.getElementById('receipt-meja').innerText = activeOrderForCalc.meja;
    document.getElementById('receipt-date').innerText = new Date().toLocaleString('id-ID');
    document.getElementById('receipt-payment').innerText = activeOrderForCalc.payment;
    document.getElementById('receipt-total').innerText = activeOrderForCalc.total.toLocaleString('id-ID');
    document.getElementById('receipt-cash').innerText = cash.toLocaleString('id-ID');
    document.getElementById('receipt-change').innerText = change > 0 ? change.toLocaleString('id-ID') : '0';

    const itemsContainer = document.getElementById('receipt-items');
    itemsContainer.innerHTML = '';
    activeOrderForCalc.items.forEach(i => {
        itemsContainer.innerHTML += `
            <div style="display:flex; justify-content:space-between;">
                <span>${i.nama}</span>
                <span>Rp ${i.harga.toLocaleString('id-ID')}</span>
            </div>
            ${i.variantInfo ? `<small style="font-size:0.8em; color:#444;">${i.variantInfo}</small><br>` : ''}
        `;
    });

    // Ubah status Firestore ke selesai
    await updateDoc(doc(db, "orders", activeOrderForCalc.id), { status: 'selesai' });
    closeCalcModal();

    // Trigger dialog print bawaan browser
    window.print();
};

// 3. CRUD & TOGGLE MENU
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
                    <strong>${data.nama}</strong> (${data.kategori || 'Makanan'}) - Rp ${data.harga.toLocaleString('id-ID')}<br>
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
    const kategori = document.getElementById('kategori-menu').value;
    
    if(!nama || !harga) return alert("Isi nama dan harga!");

    await addDoc(collection(db, "menus"), { 
        nama, 
        harga: parseInt(harga), 
        kategori: kategori,
        tersedia: true 
    });
    
    document.getElementById('nama-menu').value = '';
    document.getElementById('harga-menu').value = '';
};

window.toggleStok = async (id, statusSaatIni) => {
    const newStatus = statusSaatIni === false ? true : false;
    await updateDoc(doc(db, "menus", id), { tersedia: newStatus });
};

window.hapusMenu = async (id) => {
    if(confirm('Yakin hapus menu ini?')) await deleteDoc(doc(db, "menus", id));
};
