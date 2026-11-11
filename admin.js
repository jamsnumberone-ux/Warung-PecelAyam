import { db } from './firebase-config.js';
import { collection, addDoc, deleteDoc, doc, onSnapshot, updateDoc, query, orderBy, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let soundEnabled = false;
let isInitialLoad = true;
let isStoreOpen = true;
let activeOrderForCalc = null;
let currentCompletedOrders = [];

// 1. SAKELAR BUKA / TUTUP WARUNG REAL-TIME
onSnapshot(doc(db, "settings", "store"), (docSnap) => {
    if (docSnap.exists()) {
        isStoreOpen = docSnap.data().isOpen;
    } else {
        setDoc(doc(db, "settings", "store"), { isOpen: true });
        isStoreOpen = true;
    }
    const btn = document.getElementById('btn-store-status');
    if (isStoreOpen) {
        btn.innerText = '🟢 Warung BUKA';
        btn.className = 'btn-success';
    } else {
        btn.innerText = '🔴 Warung TUTUP';
        btn.className = 'btn-delete';
    }
});

window.toggleStoreStatus = async () => {
    await setDoc(doc(db, "settings", "store"), { isOpen: !isStoreOpen });
};

// AUDIO NOTIFIKASI
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

// LIVE ORDERS & REKAP LAPORAN
const qOrders = query(collection(db, "orders"), orderBy("timestamp", "desc"));
onSnapshot(qOrders, (snapshot) => {
    const orderContainer = document.getElementById('order-list');
    const completedList = document.getElementById('completed-orders-list');
    
    orderContainer.innerHTML = '';
    completedList.innerHTML = '';
    let totalRevenue = 0;
    let hasNewPending = false;
    currentCompletedOrders = [];

    snapshot.docChanges().forEach((change) => {
        if (change.type === "added" && change.doc.data().status === "pending") {
            hasNewPending = true;
        }
    });

    if (!isInitialLoad && hasNewPending && soundEnabled) {
        const sound = document.getElementById('order-sound');
        sound.play().catch(e => console.log('Audio blocked', e));
    }
    isInitialLoad = false;

    snapshot.forEach((docData) => {
        const order = { id: docData.id, ...docData.data() };
        
        // 2. Filter pesanan yang sudah di-tutup buku (archived)
        if (order.archived) return;

        const itemDetails = order.items.map(i => {
            return `<li>• ${i.nama} ${i.variantInfo ? `<br><small style="color:#555;">(${i.variantInfo})</small>` : ''} - Rp ${i.harga.toLocaleString('id-ID')}</li>`;
        }).join('');
        
        if(order.status === 'pending' || order.status === 'dimasak') {
            const btnAksi = order.status === 'pending' 
                ? `<button class="btn-warning" onclick="updateStatus('${order.id}', 'dimasak')">Mulai Masak</button>`
                : `<button class="btn-success" onclick="openCalcModal('${order.id}')">Selesai & Cetak Struk</button>`;
            
            // 3. Tampilan Penomoran Meja/Antrean Otomatis
            orderContainer.innerHTML += `
                <div class="card order-card">
                    <h3>${order.meja} <span class="badge badge-${order.status === 'pending' ? 'pending' : 'cooking'}">${order.status.toUpperCase()}</span></h3>
                    <ul style="padding-left:0; margin:10px 0;">${itemDetails}</ul>
                    <p class="notes"><strong>Catatan:</strong> ${order.notes || '-'}</p>
                    <p><strong>Total:</strong> Rp ${order.total.toLocaleString('id-ID')} (${order.payment})</p>
                    ${btnAksi}
                </div>
            `;
        }
        
        if(order.status === 'selesai') {
            totalRevenue += order.total;
            currentCompletedOrders.push(order);
            completedList.innerHTML += `
                <li>
                    <span>${order.meja} (${order.payment})</span>
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

// 2. FITUR TUTUP BUKU / RESET LAPORAN HARIAN
window.tutupBuku = async () => {
    if (currentCompletedOrders.length === 0) {
        return alert("Belum ada transaksi selesai untuk ditutup buku!");
    }

    const totalOmzet = currentCompletedOrders.reduce((sum, o) => sum + o.total, 0);
    const konfirmasi = confirm(`Yakin mau Tutup Buku Hari Ini?\n\nTotal Omzet: Rp ${totalOmzet.toLocaleString('id-ID')}\nTotal Transaksi: ${currentCompletedOrders.length}\n\nLaporan harian akan di-reset ke Rp 0.`);
    
    if (konfirmasi) {
        const tglStr = new Date().toLocaleDateString('id-ID');
        
        // Simpan rekap omzet ke koleksi Firestore daily_reports
        await addDoc(collection(db, "daily_reports"), {
            tanggal: tglStr,
            totalOmzet: totalOmzet,
            totalTransaksi: currentCompletedOrders.length,
            timestamp: new Date()
        });

        // Tandai pesanan yang sudah selesai sebagai archived
        const updatePromises = currentCompletedOrders.map(o => 
            updateDoc(doc(db, "orders", o.id), { archived: true })
        );
        await Promise.all(updatePromises);
        
        alert("Tutup Buku Berhasil! Omzet hari ini telah diarsipkan dan tampilan di-reset ke Rp 0.");
    }
};

// KALKULATOR KEMBALIAN & STRUK
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

    await updateDoc(doc(db, "orders", activeOrderForCalc.id), { status: 'selesai' });
    closeCalcModal();
    window.print();
};

// 5. MANAJEMEN JUMLAH STOK HARIAN (LIST & TAMBAH/EDIT)
onSnapshot(collection(db, "menus"), (snapshot) => {
    const list = document.getElementById('admin-menu-list');
    list.innerHTML = '';
    snapshot.forEach((docData) => {
        const data = docData.data();
        const stokCount = data.stok !== undefined ? parseInt(data.stok) : 0;
        
        list.innerHTML += `
            <li>
                <div>
                    <strong>${data.nama}</strong> (${data.kategori || 'Makanan'}) - Rp ${data.harga.toLocaleString('id-ID')}<br>
                    <small style="color:${stokCount > 0 ? '#2ed573' : '#ff4757'}; font-weight:bold;">
                        Sisa Stok: ${stokCount} porsi
                    </small>
                </div>
                <div style="display:flex; gap:5px;">
                    <button class="btn-warning btn-small" onclick="editStok('${docData.id}', ${stokCount})">Ubah Stok</button>
                    <button class="btn-delete btn-small" onclick="hapusMenu('${docData.id}')">X</button>
                </div>
            </li>
        `;
    });
});

window.tambahMenu = async () => {
    const nama = document.getElementById('nama-menu').value;
    const harga = document.getElementById('harga-menu').value;
    const stok = document.getElementById('stok-menu').value;
    const kategori = document.getElementById('kategori-menu').value;
    
    if(!nama || !harga || stok === '') return alert("Isi nama, harga, dan jumlah stok harian!");

    await addDoc(collection(db, "menus"), { 
        nama, 
        harga: parseInt(harga), 
        stok: parseInt(stok),
        kategori: kategori
    });
    
    document.getElementById('nama-menu').value = '';
    document.getElementById('harga-menu').value = '';
    document.getElementById('stok-menu').value = '';
};

window.editStok = async (id, stokSaatIni) => {
    const inputBaru = prompt("Masukkan jumlah stok baru (porsi):", stokSaatIni);
    if(inputBaru !== null && !isNaN(inputBaru) && inputBaru.trim() !== '') {
        await updateDoc(doc(db, "menus", id), { stok: parseInt(inputBaru) });
    }
};

window.hapusMenu = async (id) => {
    if(confirm('Yakin hapus menu ini?')) await deleteDoc(doc(db, "menus", id));
};
