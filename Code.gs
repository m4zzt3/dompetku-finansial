/**
 * DompetKu (FinansialKu) — Backend Google Apps Script (GAS)
 * Database: Google Sheets
 * Multi-Dompet & Superadmin User Management
 */

const CACHE_PREFIX = 'DOMPETKU';
const CACHE_TTL_SECONDS = 60;

const ALLOWED_ACTIONS = [
  'getAllData',
  'saveAccount',
  'deleteAccount',
  'saveTransaction',
  'deleteTransaction',
  'saveTransfer',
  'deleteTransfer',
  'saveCategory',
  'deleteCategory',
  'saveSettings',
  'doLogin',
  'setupDatabase',
  'saveWallet',
  'deleteWallet',
  'saveUser',
  'deleteUser',
  'archiveYearData',
  'getArchiveYears',
  'getArchiveData',
  'restoreArchiveData'
];

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  template.serverData = JSON.stringify(getAllData(true));
  return template.evaluate()
    .setTitle('DompetKu — Keuangan Pribadi & Multi-Dompet')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doPost(e) {
  try {
    var contents = e.postData ? e.postData.contents : '';
    if (!contents) {
      return jsonResponse({ success: false, message: 'Payload kosong' });
    }

    var payload = JSON.parse(contents);
    var action = payload.action;
    var args = payload.args || [];

    if (!action || ALLOWED_ACTIONS.indexOf(action) === -1) {
      return jsonResponse({ success: false, message: 'Action not authorized: ' + action });
    }

    var result = this[action].apply(this, args);
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ success: false, message: 'Server error: ' + err.toString() });
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#f3f4f6');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function setupDatabase() {
  var ss = getSpreadsheet();

  // 1. Sheet Wallets (Multi-Dompet)
  var wltSheet = getOrCreateSheet(ss, 'Wallets', [
    'WalletID', 'NamaDompet', 'Deskripsi', 'Ikon', 'Warna', 'OwnerUserID', 'IsActive', 'CreatedAt'
  ]);
  if (wltSheet.getLastRow() <= 1) {
    wltSheet.appendRow(['WLT-1', 'Dompet Pribadi', 'Keuangan Sehari-hari & Personal', 'fa-wallet', '#059669', 'superadmin', 'TRUE', '11/10/2026']);
    wltSheet.appendRow(['WLT-2', 'Bisnis & Toko', 'Operasional Toko & Penjualan', 'fa-shop', '#2563eb', 'superadmin', 'TRUE', '11/10/2026']);
  }

  // 2. Sheet Accounts
  var accSheet = getOrCreateSheet(ss, 'Accounts', [
    'AccountID', 'WalletID', 'NamaAkun', 'TipeAkun', 'NomorAkun', 'SaldoAwal', 'SaldoSekarang', 'Warna', 'Ikon', 'IsActive'
  ]);
  if (accSheet.getLastRow() <= 1) {
    // Dompet Pribadi (WLT-1)
    accSheet.appendRow(['ACC-1', 'WLT-1', 'Dompet Tunai', 'TUNAI', 'Uang Fisik', 500000, 500000, '#059669', 'fa-wallet', 'TRUE']);
    accSheet.appendRow(['ACC-2', 'WLT-1', 'BCA Utama', 'BANK', '1234567890', 5000000, 5000000, '#2563eb', 'fa-building-columns', 'TRUE']);
    accSheet.appendRow(['ACC-3', 'WLT-1', 'GoPay / OVO', 'EWALLET', '08123456789', 350000, 350000, '#0284c7', 'fa-mobile-screen', 'TRUE']);
    accSheet.appendRow(['ACC-4', 'WLT-1', 'Reksadana / Bibit', 'INVESTASI', 'BIBIT-888', 10000000, 10000000, '#7c3aed', 'fa-chart-line', 'TRUE']);
    // Dompet Bisnis (WLT-2)
    accSheet.appendRow(['ACC-B1', 'WLT-2', 'Kas Tunai Toko', 'TUNAI', 'Laci Kasir', 1500000, 1500000, '#059669', 'fa-cash-register', 'TRUE']);
    accSheet.appendRow(['ACC-B2', 'WLT-2', 'Mandiri Bisnis', 'BANK', '9876543210', 14800000, 14800000, '#2563eb', 'fa-building-columns', 'TRUE']);
    accSheet.appendRow(['ACC-B3', 'WLT-2', 'QRIS Merchant', 'EWALLET', '08991234567', 3200000, 3200000, '#0284c7', 'fa-qrcode', 'TRUE']);
  }

  // 3. Sheet Transactions
  getOrCreateSheet(ss, 'Transactions', [
    'TransactionID', 'WalletID', 'Tanggal', 'TipeTransaksi', 'AccountID', 'CategoryID', 'Nominal', 'Deskripsi', 'BuktiUrl', 'KasirUsername'
  ]);

  // 4. Sheet Transfers
  getOrCreateSheet(ss, 'Transfers', [
    'TransferID', 'WalletID', 'Tanggal', 'FromAccountID', 'ToAccountID', 'Nominal', 'BiayaAdmin', 'TotalKeluar', 'Catatan', 'KasirUsername'
  ]);

  // 5. Sheet Categories
  var catSheet = getOrCreateSheet(ss, 'Categories', [
    'CategoryID', 'WalletID', 'NamaKategori', 'Tipe', 'Ikon', 'Warna', 'BudgetBulanan', 'Urutan', 'IsActive'
  ]);
  if (catSheet.getLastRow() <= 1) {
    // Pemasukan WLT-1
    catSheet.appendRow(['CAT-IN-1', 'WLT-1', 'Gaji Bulanan', 'PEMASUKAN', 'fa-money-bill-wave', '#10b981', 0, 1, 'TRUE']);
    catSheet.appendRow(['CAT-IN-2', 'WLT-1', 'Bonus & THR', 'PEMASUKAN', 'fa-gift', '#059669', 0, 2, 'TRUE']);
    catSheet.appendRow(['CAT-IN-3', 'WLT-1', 'Hasil Investasi', 'PEMASUKAN', 'fa-chart-line', '#10b981', 0, 3, 'TRUE']);
    catSheet.appendRow(['CAT-IN-4', 'WLT-1', 'Pemasukan Lain', 'PEMASUKAN', 'fa-coins', '#10b981', 0, 4, 'TRUE']);
    // Pengeluaran WLT-1
    catSheet.appendRow(['CAT-OUT-1', 'WLT-1', 'Makanan & Minuman', 'PENGELUARAN', 'fa-utensils', '#f97316', 2000000, 5, 'TRUE']);
    catSheet.appendRow(['CAT-OUT-2', 'WLT-1', 'Transportasi & Bensin', 'PENGELUARAN', 'fa-car', '#0284c7', 600000, 6, 'TRUE']);
    catSheet.appendRow(['CAT-OUT-3', 'WLT-1', 'Belanja Kebutuhan', 'PENGELUARAN', 'fa-cart-shopping', '#e11d48', 1500000, 7, 'TRUE']);
    catSheet.appendRow(['CAT-OUT-4', 'WLT-1', 'Tagihan & Listrik', 'PENGELUARAN', 'fa-bolt', '#eab308', 800000, 8, 'TRUE']);
    catSheet.appendRow(['CAT-OUT-5', 'WLT-1', 'Hiburan & Hobi', 'PENGELUARAN', 'fa-gamepad', '#8b5cf6', 500000, 9, 'TRUE']);
    catSheet.appendRow(['CAT-OUT-6', 'WLT-1', 'Kesehatan', 'PENGELUARAN', 'fa-heart-pulse', '#ef4444', 300000, 10, 'TRUE']);
    // Kategori Sistem Baku WLT-1 (Operasional, Bagi Hasil, Admin Bank)
    catSheet.appendRow(['CAT-OUT-SYS-1', 'WLT-1', 'Operasional', 'PENGELUARAN', 'fa-briefcase', '#0284c7', 500000, 11, 'TRUE']);
    catSheet.appendRow(['CAT-OUT-SYS-2', 'WLT-1', 'Bagi Hasil', 'PENGELUARAN', 'fa-hand-holding-dollar', '#0d9488', 500000, 12, 'TRUE']);
    catSheet.appendRow(['CAT-OUT-7', 'WLT-1', 'Admin Bank', 'PENGELUARAN', 'fa-receipt', '#64748b', 100000, 13, 'TRUE']);
    // Kategori WLT-2 (Bisnis & Toko)
    catSheet.appendRow(['CAT-B-IN-1', 'WLT-2', 'Penjualan Produk', 'PEMASUKAN', 'fa-bag-shopping', '#10b981', 0, 1, 'TRUE']);
    catSheet.appendRow(['CAT-B-IN-2', 'WLT-2', 'Jasa & Layanan', 'PEMASUKAN', 'fa-handshake', '#059669', 0, 2, 'TRUE']);
    catSheet.appendRow(['CAT-B-OUT-1', 'WLT-2', 'Kulakan & Stok Barang', 'PENGELUARAN', 'fa-boxes-stacked', '#e11d48', 10000000, 3, 'TRUE']);
    // Kategori Sistem Baku WLT-2 (Operasional, Bagi Hasil, Admin Bank)
    catSheet.appendRow(['CAT-B-OUT-2', 'WLT-2', 'Operasional', 'PENGELUARAN', 'fa-briefcase', '#0284c7', 1500000, 4, 'TRUE']);
    catSheet.appendRow(['CAT-B-OUT-3', 'WLT-2', 'Gaji Karyawan', 'PENGELUARAN', 'fa-users', '#8b5cf6', 4000000, 5, 'TRUE']);
    catSheet.appendRow(['CAT-B-OUT-4', 'WLT-2', 'Promosi & Iklan', 'PENGELUARAN', 'fa-bullhorn', '#f97316', 1000000, 6, 'TRUE']);
    catSheet.appendRow(['CAT-B-OUT-5', 'WLT-2', 'Admin Bank', 'PENGELUARAN', 'fa-receipt', '#64748b', 100000, 7, 'TRUE']);
    catSheet.appendRow(['CAT-B-OUT-6', 'WLT-2', 'Bagi Hasil', 'PENGELUARAN', 'fa-hand-holding-dollar', '#0d9488', 2500000, 8, 'TRUE']);
  }

  // 6. Sheet Users (Superadmin & Multi-User)
  var usrSheet = getOrCreateSheet(ss, 'Users', [
    'UserID', 'Username', 'Password', 'Role', 'FullName', 'Pin', 'IsActive', 'AssignedWallets'
  ]);
  if (usrSheet.getLastRow() <= 1) {
    usrSheet.appendRow(['USR-1', 'superadmin', 'admin123', 'superadmin', 'Super Administrator', '123456', 'TRUE', '*']);
    usrSheet.appendRow(['USR-2', 'admin', 'admin123', 'admin', 'Manajer Keuangan', '123456', 'TRUE', 'WLT-1,WLT-2']);
    usrSheet.appendRow(['USR-3', 'kasir', 'user123', 'user', 'Kasir Toko', '123456', 'TRUE', 'WLT-2']);
  }

  // 7. Sheet Settings
  var setSheet = getOrCreateSheet(ss, 'Settings', ['SettingKey', 'SettingValue']);
  if (setSheet.getLastRow() <= 1) {
    setSheet.appendRow(['NamaAplikasi', 'DompetKu']);
    setSheet.appendRow(['MataUang', 'IDR']);
    setSheet.appendRow(['SimbolMataUang', 'Rp']);
    setSheet.appendRow(['DefaultRole', 'user']);
  }

  clearDataCache();
  return { success: true, message: 'Database DompetKu (Multi-Dompet & Superadmin) berhasil diinisialisasi!' };
}

function clearDataCache() {
  try {
    var cache = CacheService.getScriptCache();
    cache.remove(CACHE_PREFIX + '_DATA_ADMIN');
    cache.remove(CACHE_PREFIX + '_DATA_PUBLIC');
  } catch (e) {}
}

function getSheetData(sheetName) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  var headers = values[0];
  var tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  var result = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var item = {};
    for (var j = 0; j < headers.length; j++) {
      var val = row[j];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, tz, 'dd/MM/yyyy HH:mm');
      }
      item[headers[j]] = val;
    }
    result.push(item);
  }
  return result;
}

function getAllData(isAdmin) {
  var cacheKey = CACHE_PREFIX + (isAdmin ? '_DATA_ADMIN' : '_DATA_PUBLIC');
  var cache = CacheService.getScriptCache();
  var cached = cache.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }

  var data = {
    wallets: getSheetData('Wallets'),
    accounts: getSheetData('Accounts'),
    transactions: getSheetData('Transactions'),
    transfers: getSheetData('Transfers'),
    categories: getSheetData('Categories'),
    settings: getSheetData('Settings')
  };

  // Fallback default wallet jika sheet Wallets masih kosong
  if (!data.wallets || data.wallets.length === 0) {
    data.wallets = [
      {
        WalletID: 'WLT-1',
        NamaDompet: 'Dompet Pribadi',
        Deskripsi: 'Keuangan Sehari-hari & Personal',
        Ikon: 'fa-wallet',
        Warna: '#059669',
        OwnerUserID: 'superadmin',
        IsActive: 'TRUE',
        CreatedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'dd/MM/yyyy')
      }
    ];
  }

  // Normalisasi WalletID fallback jika ada baris data lama yang belum memiliki WalletID
  if (data.accounts) {
    data.accounts.forEach(function(a) { if (!a.WalletID) a.WalletID = 'WLT-1'; });
  }
  if (data.transactions) {
    data.transactions.forEach(function(t) { if (!t.WalletID) t.WalletID = 'WLT-1'; });
  }
  if (data.transfers) {
    data.transfers.forEach(function(tr) { if (!tr.WalletID) tr.WalletID = 'WLT-1'; });
  }
  if (data.categories) {
    data.categories.forEach(function(c) { if (!c.WalletID) c.WalletID = '*'; });
  }

  // Pastikan transaksi pengeluaran biaya admin dari transfer ada di data.transactions agar tertarik di laporan
  if (data.transfers && data.transactions) {
    var existingTxnIds = {};
    data.transactions.forEach(function(t) { existingTxnIds[String(t.TransactionID)] = true; });
    data.transfers.forEach(function(tr) {
      var fee = Number(tr.BiayaAdmin) || 0;
      var admId = 'TXN-ADM-' + tr.TransferID;
      if (fee > 0 && !existingTxnIds[admId]) {
        var wId = tr.WalletID || 'WLT-1';
        var admCat = data.categories ? data.categories.find(function(c) {
          var n = String(c.NamaKategori || '').toLowerCase();
          return (c.WalletID === wId || c.WalletID === '*') && (n === 'admin bank' || n.indexOf('admin') !== -1);
        }) : null;
        var catId = admCat ? admCat.CategoryID : 'CAT-OUT-7';
        data.transactions.push({
          TransactionID: admId,
          WalletID: wId,
          Tanggal: tr.Tanggal,
          TipeTransaksi: 'PENGELUARAN',
          AccountID: tr.FromAccountID,
          CategoryID: catId,
          Nominal: fee,
          Deskripsi: 'Biaya Admin Transfer: ' + (tr.Catatan || 'Pindah Dana'),
          BuktiUrl: '',
          KasirUsername: tr.KasirUsername || 'superadmin'
        });
      }
    });
  }

  // Berikan data users untuk Superadmin / Admin
  if (isAdmin) {
    var users = getSheetData('Users');
    data.users = users.map(function(u) {
      return {
        UserID: u.UserID,
        Username: u.Username,
        Role: u.Role,
        FullName: u.FullName,
        Pin: u.Pin,
        IsActive: u.IsActive,
        AssignedWallets: u.AssignedWallets || '*'
      };
    });
  }

  try {
    cache.put(cacheKey, JSON.stringify(data), CACHE_TTL_SECONDS);
  } catch (e) {}

  return data;
}

function doLogin(username, password) {
  var users = getSheetData('Users');
  
  // Default fallback jika belum ada user di sheet
  if (users.length === 0 && (username === 'superadmin' || username === 'admin') && password === 'admin123') {
    return {
      success: true,
      message: 'Login berhasil (default superadmin)',
      data: {
        userId: 'USR-1',
        username: 'superadmin',
        role: 'superadmin',
        fullName: 'Super Administrator',
        assignedWallets: '*'
      }
    };
  }

  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (String(u.Username).toLowerCase() === String(username).toLowerCase() &&
        String(u.Password) === String(password) &&
        String(u.IsActive).toUpperCase() === 'TRUE') {
      return {
        success: true,
        message: 'Login berhasil',
        data: {
          userId: u.UserID,
          username: u.Username,
          role: u.Role || 'user',
          fullName: u.FullName,
          assignedWallets: u.AssignedWallets || '*'
        }
      };
    }
  }

  return { success: false, message: 'Username atau password salah' };
}

function updateAccountBalance(accountId, deltaAmount) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Accounts');
  if (!sheet) return false;

  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return false;

  var headers = values[0];
  var idCol = headers.indexOf('AccountID') + 1;
  var balCol = headers.indexOf('SaldoSekarang') + 1;

  if (idCol <= 0 || balCol <= 0) return false;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol - 1]) === String(accountId)) {
      var currentBal = Number(values[i][balCol - 1]) || 0;
      var newBal = currentBal + Number(deltaAmount);
      sheet.getRange(i + 1, balCol).setValue(newBal);
      return true;
    }
  }
  return false;
}

function saveAccount(data) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Accounts');
  if (!sheet) return { success: false, message: 'Sheet Accounts belum dibuat' };

  var accountId = data.AccountID || data.accountId || ('ACC-' + new Date().getTime());
  var walletId = data.WalletID || data.walletId || 'WLT-1';
  var nama = data.NamaAkun || data.namaAkun || 'Akun Baru';
  var tipe = data.TipeAkun || data.tipeAkun || 'TUNAI';
  var noAkun = data.NomorAkun || data.nomorAkun || '-';
  var saldoAwal = Number(data.SaldoAwal || data.saldoAwal) || 0;
  var saldoSekarang = Number(data.SaldoSekarang !== undefined ? data.SaldoSekarang : (data.saldoSekarang !== undefined ? data.saldoSekarang : saldoAwal));
  var warna = data.Warna || data.warna || '#059669';
  var ikon = data.Ikon || data.ikon || 'fa-wallet';
  var isActive = data.IsActive !== undefined ? String(data.IsActive).toUpperCase() : 'TRUE';

  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var rowIndex = -1;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(accountId)) {
      rowIndex = i + 1;
      break;
    }
  }

  var hasWalletCol = headers.indexOf('WalletID') !== -1;
  var rowData;
  if (hasWalletCol) {
    rowData = [accountId, walletId, nama, tipe, noAkun, saldoAwal, saldoSekarang, warna, ikon, isActive];
  } else {
    rowData = [accountId, nama, tipe, noAkun, saldoAwal, saldoSekarang, warna, ikon, isActive];
  }

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  clearDataCache();
  return { success: true, message: 'Akun berhasil disimpan', data: { AccountID: accountId } };
}

function deleteAccount(accountId, requesterRole) {
  if (requesterRole && String(requesterRole).toLowerCase() === 'user') {
    return { success: false, message: 'Akses ditolak: Peran Pengguna (User) tidak diizinkan menghapus akun.' };
  }
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Accounts');
  if (!sheet) return { success: false, message: 'Sheet Accounts tidak ditemukan' };

  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(accountId)) {
      sheet.deleteRow(i + 1);
      clearDataCache();
      return { success: true, message: 'Akun berhasil dihapus' };
    }
  }
  return { success: false, message: 'Akun tidak ditemukan' };
}

function saveTransaction(data) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Transactions');
  if (!sheet) return { success: false, message: 'Sheet Transactions belum dibuat' };

  var txnId = data.TransactionID || data.transactionId || ('TXN-' + new Date().getTime());
  var walletId = data.WalletID || data.walletId || 'WLT-1';
  var tanggal = data.Tanggal || data.tanggal || Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'dd/MM/yyyy HH:mm');
  var tipe = String(data.TipeTransaksi || data.tipeTransaksi).toUpperCase();
  var accountId = data.AccountID || data.accountId;
  var categoryId = data.CategoryID || data.categoryId;
  var nominal = Number(data.Nominal || data.nominal) || 0;
  var deskripsi = data.Deskripsi || data.deskripsi || '-';
  var buktiUrl = data.BuktiUrl || data.buktiUrl || '';
  var username = data.KasirUsername || data.kasirUsername || 'superadmin';

  if (!accountId || nominal <= 0) {
    return { success: false, message: 'Akun dan nominal transaksi harus valid' };
  }

  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var rowIndex = -1;
  var oldNominal = 0;
  var oldTipe = '';
  var oldAccountId = '';

  var idCol = headers.indexOf('TransactionID');
  var tipeCol = headers.indexOf('TipeTransaksi');
  var accCol = headers.indexOf('AccountID');
  var nomCol = headers.indexOf('Nominal');

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(txnId)) {
      rowIndex = i + 1;
      oldTipe = String(values[i][tipeCol]);
      oldAccountId = String(values[i][accCol]);
      oldNominal = Number(values[i][nomCol]) || 0;
      break;
    }
  }

  // Handle balance adjustment
  if (rowIndex > 0) {
    var revertDelta = (oldTipe === 'PEMASUKAN') ? -oldNominal : oldNominal;
    updateAccountBalance(oldAccountId, revertDelta);
  }

  // Apply new transaction balance
  var newDelta = (tipe === 'PEMASUKAN') ? nominal : -nominal;
  updateAccountBalance(accountId, newDelta);

  var hasWalletCol = headers.indexOf('WalletID') !== -1;
  var rowData;
  if (hasWalletCol) {
    rowData = [txnId, walletId, tanggal, tipe, accountId, categoryId, nominal, deskripsi, buktiUrl, username];
  } else {
    rowData = [txnId, tanggal, tipe, accountId, categoryId, nominal, deskripsi, buktiUrl, username];
  }

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  clearDataCache();
  return { success: true, message: 'Transaksi berhasil disimpan', data: { TransactionID: txnId } };
}

function deleteTransaction(transactionId) {
  if (String(transactionId).indexOf('TXN-ADM-') === 0) {
    return { success: false, message: 'Transaksi biaya admin ini terikat dengan Pindah Dana. Silakan batalkan transaksi melalui menu data Pindah Dana terkait.' };
  }
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Transactions');
  if (!sheet) return { success: false, message: 'Sheet Transactions tidak ditemukan' };

  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var idCol = headers.indexOf('TransactionID');
  var tipeCol = headers.indexOf('TipeTransaksi');
  var accCol = headers.indexOf('AccountID');
  var nomCol = headers.indexOf('Nominal');

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(transactionId)) {
      var tipe = String(values[i][tipeCol]);
      var accountId = String(values[i][accCol]);
      var nominal = Number(values[i][nomCol]) || 0;

      var revertDelta = (tipe === 'PEMASUKAN') ? -nominal : nominal;
      updateAccountBalance(accountId, revertDelta);

      sheet.deleteRow(i + 1);
      clearDataCache();
      return { success: true, message: 'Transaksi berhasil dihapus dan saldo akun disesuaikan' };
    }
  }
  return { success: false, message: 'Transaksi tidak ditemukan' };
}

function saveTransfer(data) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Transfers');
  if (!sheet) return { success: false, message: 'Sheet Transfers belum dibuat' };

  var trfId = data.TransferID || data.transferId || ('TRF-' + new Date().getTime());
  var walletId = data.WalletID || data.walletId || 'WLT-1';
  var tanggal = data.Tanggal || data.tanggal || Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'dd/MM/yyyy HH:mm');
  var fromAccId = data.FromAccountID || data.fromAccountId;
  var toAccId = data.ToAccountID || data.toAccountId;
  var nominal = Number(data.Nominal || data.nominal) || 0;
  var biayaAdmin = Number(data.BiayaAdmin || data.biayaAdmin) || 0;
  var catatan = data.Catatan || data.catatan || 'Pindah Dana';
  var username = data.KasirUsername || data.kasirUsername || 'superadmin';

  if (!fromAccId || !toAccId) {
    return { success: false, message: 'Akun asal dan akun tujuan wajib dipilih' };
  }
  if (fromAccId === toAccId) {
    return { success: false, message: 'Akun asal dan tujuan tidak boleh sama' };
  }
  if (nominal <= 0) {
    return { success: false, message: 'Nominal transfer harus lebih besar dari 0' };
  }

  var totalKeluar = nominal + biayaAdmin;

  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var idCol = headers.indexOf('TransferID');
  var fromCol = headers.indexOf('FromAccountID');
  var toCol = headers.indexOf('ToAccountID');
  var nomCol = headers.indexOf('Nominal');
  var admCol = headers.indexOf('BiayaAdmin');
  var totCol = headers.indexOf('TotalKeluar');

  var rowIndex = -1;
  var oldFromId = '';
  var oldToId = '';
  var oldNominal = 0;
  var oldBiayaAdmin = 0;
  var oldTotalKeluar = 0;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(trfId)) {
      rowIndex = i + 1;
      oldFromId = String(values[i][fromCol]);
      oldToId = String(values[i][toCol]);
      oldNominal = Number(values[i][nomCol]) || 0;
      oldBiayaAdmin = Number(values[i][admCol]) || 0;
      oldTotalKeluar = Number(values[i][totCol]) || (oldNominal + oldBiayaAdmin);
      break;
    }
  }

  if (rowIndex > 0) {
    updateAccountBalance(oldFromId, oldTotalKeluar);
    updateAccountBalance(oldToId, -oldNominal);
  }

  updateAccountBalance(fromAccId, -totalKeluar);
  updateAccountBalance(toAccId, nominal);

  var hasWalletCol = headers.indexOf('WalletID') !== -1;
  var rowData;
  if (hasWalletCol) {
    rowData = [trfId, walletId, tanggal, fromAccId, toAccId, nominal, biayaAdmin, totalKeluar, catatan, username];
  } else {
    rowData = [trfId, tanggal, fromAccId, toAccId, nominal, biayaAdmin, totalKeluar, catatan, username];
  }

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  // Sinkronkan transaksi biaya admin ke sheet Transactions agar tercatat & ditarik di laporan
  var txnSheet = ss.getSheetByName('Transactions');
  if (txnSheet) {
    var txnAdmId = 'TXN-ADM-' + trfId;
    var txnValues = txnSheet.getDataRange().getValues();
    var txnHeaders = txnValues[0];
    var txnIdCol = txnHeaders.indexOf('TransactionID');
    var txnRowIndex = -1;
    for (var k = 1; k < txnValues.length; k++) {
      if (String(txnValues[k][txnIdCol]) === String(txnAdmId)) {
        txnRowIndex = k + 1;
        break;
      }
    }

    if (biayaAdmin > 0) {
      var adminCatId = getOrCreateAdminBankCategoryId(ss, walletId);
      var txnDesc = 'Biaya Admin Transfer: ' + (catatan || 'Pindah Dana');
      var txnRow;
      if (txnHeaders.indexOf('WalletID') !== -1) {
        txnRow = [txnAdmId, walletId, tanggal, 'PENGELUARAN', fromAccId, adminCatId, biayaAdmin, txnDesc, '', username];
      } else {
        txnRow = [txnAdmId, tanggal, 'PENGELUARAN', fromAccId, adminCatId, biayaAdmin, txnDesc, '', username];
      }

      if (txnRowIndex > 0) {
        txnSheet.getRange(txnRowIndex, 1, 1, txnRow.length).setValues([txnRow]);
      } else {
        txnSheet.appendRow(txnRow);
      }
    } else if (biayaAdmin === 0 && txnRowIndex > 0) {
      txnSheet.deleteRow(txnRowIndex);
    }
  }

  clearDataCache();
  return { 
    success: true, 
    message: 'Pindah dana sebesar Rp ' + nominal.toLocaleString('id-ID') + ' berhasil ' + (rowIndex > 0 ? 'diperbarui!' : 'diproses!'),
    data: { TransferID: trfId }
  };
}

function deleteTransfer(transferId) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Transfers');
  if (!sheet) return { success: false, message: 'Sheet Transfers tidak ditemukan' };

  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var idCol = headers.indexOf('TransferID');
  var fromCol = headers.indexOf('FromAccountID');
  var toCol = headers.indexOf('ToAccountID');
  var nomCol = headers.indexOf('Nominal');
  var admCol = headers.indexOf('BiayaAdmin');
  var totCol = headers.indexOf('TotalKeluar');

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(transferId)) {
      var fromAccId = String(values[i][fromCol]);
      var toAccId = String(values[i][toCol]);
      var nominal = Number(values[i][nomCol]) || 0;
      var biayaAdmin = Number(values[i][admCol]) || 0;
      var totalKeluar = Number(values[i][totCol]) || (nominal + biayaAdmin);

      updateAccountBalance(fromAccId, totalKeluar);
      updateAccountBalance(toAccId, -nominal);

      sheet.deleteRow(i + 1);

      // Hapus juga transaksi biaya admin terkait di sheet Transactions
      var txnSheet = ss.getSheetByName('Transactions');
      if (txnSheet) {
        var txnAdmId = 'TXN-ADM-' + transferId;
        var txnValues = txnSheet.getDataRange().getValues();
        var txnIdCol = txnValues[0].indexOf('TransactionID');
        if (txnIdCol !== -1) {
          for (var t = 1; t < txnValues.length; t++) {
            if (String(txnValues[t][txnIdCol]) === String(txnAdmId)) {
              txnSheet.deleteRow(t + 1);
              break;
            }
          }
        }
      }

      clearDataCache();
      return { success: true, message: 'Data pindah dana berhasil dibatalkan dan saldo telah dikembalikan' };
    }
  }
  return { success: false, message: 'Data pindah dana tidak ditemukan' };
}

function isSystemCategoryName(name) {
  if (!name) return false;
  var n = String(name).trim().toLowerCase();
  return n === 'operasional' || n === 'bagi hasil' || n === 'admin bank' ||
         n === 'biaya admin' || n === 'biaya admin bank' || n === 'biaya admin transfer';
}

function getOrCreateAdminBankCategoryId(ss, walletId) {
  var catSheet = ss.getSheetByName('Categories');
  if (!catSheet) return 'CAT-OUT-7';
  var values = catSheet.getDataRange().getValues();
  var headers = values[0];
  var idCol = headers.indexOf('CategoryID');
  var wCol = headers.indexOf('WalletID');
  var nameCol = headers.indexOf('NamaKategori');
  var tipeCol = headers.indexOf('Tipe');

  for (var i = 1; i < values.length; i++) {
    var cWId = wCol !== -1 ? String(values[i][wCol]) : '*';
    var cTipe = String(values[i][tipeCol]).toUpperCase();
    var cName = String(values[i][nameCol]).toLowerCase();
    if (cTipe === 'PENGELUARAN' && (cWId === walletId || cWId === '*') && (cName === 'admin bank' || cName.indexOf('admin') !== -1)) {
      return String(values[i][idCol]);
    }
  }

  var newCatId = 'CAT-' + walletId + '-SYS-ADM';
  var newRow;
  if (wCol !== -1) {
    newRow = [newCatId, walletId, 'Admin Bank', 'PENGELUARAN', 'fa-receipt', '#64748b', 100000, 99, 'TRUE'];
  } else {
    newRow = [newCatId, 'Admin Bank', 'PENGELUARAN', 'fa-receipt', '#64748b', 100000, 99, 'TRUE'];
  }
  catSheet.appendRow(newRow);
  return newCatId;
}

function saveCategory(data) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Categories');
  if (!sheet) return { success: false, message: 'Sheet Categories belum dibuat' };

  var catId = data.CategoryID || data.categoryId || ('CAT-' + new Date().getTime());
  var walletId = data.WalletID || data.walletId || '*';
  var nama = data.NamaKategori || data.namaKategori || 'Kategori Baru';
  var tipe = String(data.Tipe || data.tipe).toUpperCase();
  var ikon = data.Ikon || data.ikon || 'fa-tag';
  var warna = data.Warna || data.warna || '#059669';
  var budget = Number(data.BudgetBulanan || data.budgetBulanan) || 0;
  var urutan = Number(data.Urutan || data.urutan) || 1;
  var isActive = data.IsActive !== undefined ? String(data.IsActive).toUpperCase() : 'TRUE';

  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var rowIndex = -1;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(catId)) {
      rowIndex = i + 1;
      break;
    }
  }

  // Lindungi kategori sistem baku agar tidak dapat diedit
  if (rowIndex > 0) {
    var nameCol = headers.indexOf('NamaKategori');
    if (nameCol !== -1) {
      var oldName = String(values[rowIndex - 1][nameCol]);
      if (isSystemCategoryName(oldName)) {
        return { success: false, message: 'Kategori baku sistem dilindungi secara permanen dan tidak dapat diubah.' };
      }
    }
  } else {
    if (isSystemCategoryName(nama)) {
      return { success: false, message: 'Nama kategori "' + nama + '" merupakan kategori baku sistem yang sudah dipesan.' };
    }
  }

  var hasWalletCol = headers.indexOf('WalletID') !== -1;
  var rowData;
  if (hasWalletCol) {
    rowData = [catId, walletId, nama, tipe, ikon, warna, budget, urutan, isActive];
  } else {
    rowData = [catId, nama, tipe, ikon, warna, budget, urutan, isActive];
  }

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  clearDataCache();
  return { success: true, message: 'Kategori berhasil disimpan' };
}

function deleteCategory(categoryId, requesterRole) {
  if (requesterRole && String(requesterRole).toLowerCase() === 'user') {
    return { success: false, message: 'Akses ditolak: Peran Pengguna (User) tidak diizinkan menghapus kategori.' };
  }
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Categories');
  if (!sheet) return { success: false, message: 'Sheet Categories tidak ditemukan' };

  var values = sheet.getDataRange().getValues();
  var nameCol = values[0].indexOf('NamaKategori');
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(categoryId)) {
      var catName = nameCol !== -1 ? String(values[i][nameCol]) : '';
      if (isSystemCategoryName(catName)) {
        return { success: false, message: 'Akses ditolak: Kategori sistem baku (' + catName + ') tidak dapat dihapus.' };
      }
      sheet.deleteRow(i + 1);
      clearDataCache();
      return { success: true, message: 'Kategori berhasil dihapus' };
    }
  }
  return { success: false, message: 'Kategori tidak ditemukan' };
}

// ================= MULTI-DOMPET (WALLETS) CRUD =================

function saveWallet(data, requesterRole) {
  var ss = getSpreadsheet();
  var sheet = getOrCreateSheet(ss, 'Wallets', [
    'WalletID', 'NamaDompet', 'Deskripsi', 'Ikon', 'Warna', 'OwnerUserID', 'IsActive', 'CreatedAt'
  ]);

  var walletId = data.WalletID || data.walletId || ('WLT-' + new Date().getTime());
  var nama = data.NamaDompet || data.namaDompet || 'Dompet Baru';
  var deskripsi = data.Deskripsi || data.deskripsi || '';
  var ikon = data.Ikon || data.ikon || 'fa-wallet';
  var warna = data.Warna || data.warna || '#059669';
  var owner = data.OwnerUserID || data.ownerUserId || 'superadmin';
  var isActive = data.IsActive !== undefined ? String(data.IsActive).toUpperCase() : 'TRUE';
  var createdAt = data.CreatedAt || Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'dd/MM/yyyy');

  var values = sheet.getDataRange().getValues();
  var rowIndex = -1;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(walletId)) {
      rowIndex = i + 1;
      break;
    }
  }

  // Hanya Superadmin yang boleh membuat dompet baru
  if (rowIndex === -1 && requesterRole && String(requesterRole).toLowerCase() !== 'superadmin') {
    return { success: false, message: 'Akses ditolak: Hanya Super Administrator yang dapat membuat dompet baru.' };
  }

  var rowData = [walletId, nama, deskripsi, ikon, warna, owner, isActive, createdAt];

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  // Jika dompet baru dibuat oleh pengguna non-superadmin, tambahkan ke AssignedWallets pengguna tersebut
  if (rowIndex === -1 && owner && owner !== 'superadmin') {
    var usrSheet = ss.getSheetByName('Users');
    if (usrSheet) {
      var uVals = usrSheet.getDataRange().getValues();
      for (var u = 1; u < uVals.length; u++) {
        if (String(uVals[u][1]).toLowerCase() === String(owner).toLowerCase()) {
          var currentAssigned = String(uVals[u][7] || '');
          if (currentAssigned && currentAssigned !== '*') {
            var splitted = currentAssigned.split(',').map(function(s) { return s.trim(); });
            if (splitted.indexOf(walletId) === -1) {
              splitted.push(walletId);
              usrSheet.getRange(u + 1, 8).setValue(splitted.join(','));
            }
          }
          break;
        }
      }
    }
  }

  // Jika dompet baru dan diminta inisialisasi akun & kategori default
  if (rowIndex === -1 && data.initDefaults) {
    var accSheet = ss.getSheetByName('Accounts');
    if (accSheet) {
      accSheet.appendRow(['ACC-' + walletId + '-1', walletId, 'Kas Tunai ' + nama, 'TUNAI', 'Uang Fisik', 0, 0, warna, 'fa-wallet', 'TRUE']);
      accSheet.appendRow(['ACC-' + walletId + '-2', walletId, 'Rekening Bank ' + nama, 'BANK', '-', 0, 0, '#2563eb', 'fa-building-columns', 'TRUE']);
    }
    var cSheet = ss.getSheetByName('Categories');
    if (cSheet) {
      cSheet.appendRow(['CAT-' + walletId + '-IN1', walletId, 'Pemasukan ' + nama, 'PEMASUKAN', 'fa-money-bill-wave', '#10b981', 0, 1, 'TRUE']);
      cSheet.appendRow(['CAT-' + walletId + '-SYS-OPS', walletId, 'Operasional', 'PENGELUARAN', 'fa-briefcase', '#0284c7', 1000000, 2, 'TRUE']);
      cSheet.appendRow(['CAT-' + walletId + '-SYS-BGH', walletId, 'Bagi Hasil', 'PENGELUARAN', 'fa-hand-holding-dollar', '#0d9488', 1000000, 3, 'TRUE']);
      cSheet.appendRow(['CAT-' + walletId + '-SYS-ADM', walletId, 'Admin Bank', 'PENGELUARAN', 'fa-receipt', '#64748b', 100000, 4, 'TRUE']);
    }
  }

  clearDataCache();
  return { success: true, message: 'Dompet berhasil disimpan', data: { WalletID: walletId } };
}

function deleteWallet(walletId, requesterRole) {
  if (requesterRole && String(requesterRole).toLowerCase() === 'user') {
    return { success: false, message: 'Akses ditolak: Peran Pengguna (User) tidak diizinkan menghapus dompet.' };
  }
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Wallets');
  if (!sheet) return { success: false, message: 'Sheet Wallets tidak ditemukan' };

  var values = sheet.getDataRange().getValues();
  if (values.length <= 2) {
    return { success: false, message: 'Tidak dapat menghapus dompet. Minimal harus ada 1 dompet aktif.' };
  }

  var deleted = false;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(walletId)) {
      sheet.deleteRow(i + 1);
      deleted = true;
      break;
    }
  }

  if (!deleted) {
    return { success: false, message: 'Dompet tidak ditemukan' };
  }

  // Bersihkan data di Accounts, Transactions, Transfers yang terikat dengan dompet ini
  var cleanupSheets = ['Accounts', 'Transactions', 'Transfers', 'Categories'];
  cleanupSheets.forEach(function(sName) {
    var s = ss.getSheetByName(sName);
    if (!s) return;
    var sValues = s.getDataRange().getValues();
    if (sValues.length <= 1) return;
    var headers = sValues[0];
    var wCol = headers.indexOf('WalletID');
    if (wCol === -1) return;
    for (var r = sValues.length - 1; r >= 1; r--) {
      if (String(sValues[r][wCol]) === String(walletId)) {
        s.deleteRow(r + 1);
      }
    }
  });

  clearDataCache();
  return { success: true, message: 'Dompet dan data di dalamnya berhasil dihapus' };
}

// ================= USER MANAGEMENT CRUD (SUPERADMIN) =================

function saveUser(data) {
  var ss = getSpreadsheet();
  var sheet = getOrCreateSheet(ss, 'Users', [
    'UserID', 'Username', 'Password', 'Role', 'FullName', 'Pin', 'IsActive', 'AssignedWallets'
  ]);

  var userId = data.UserID || data.userId || ('USR-' + new Date().getTime());
  var username = String(data.Username || data.username || '').trim();
  var password = data.Password || data.password || '';
  var role = data.Role || data.role || 'user';
  var fullName = data.FullName || data.fullName || username;
  var pin = data.Pin || data.pin || '123456';
  var isActive = data.IsActive !== undefined ? String(data.IsActive).toUpperCase() : 'TRUE';
  var assignedWallets = data.AssignedWallets || data.assignedWallets || '*';

  if (!username) {
    return { success: false, message: 'Username tidak boleh kosong' };
  }

  var values = sheet.getDataRange().getValues();
  var rowIndex = -1;
  var existingPassword = '';

  for (var i = 1; i < values.length; i++) {
    var rowId = String(values[i][0]);
    var rowUser = String(values[i][1]).toLowerCase();

    if (rowId === String(userId)) {
      rowIndex = i + 1;
      existingPassword = String(values[i][2]);
      break;
    } else if (rowUser === username.toLowerCase()) {
      return { success: false, message: 'Username "' + username + '" sudah digunakan oleh akun lain' };
    }
  }

  // Pertahankan password lama jika tidak diisi password baru pada form edit
  var finalPassword = password ? password : (existingPassword ? existingPassword : 'user123');
  var rowData = [userId, username, finalPassword, role, fullName, pin, isActive, assignedWallets];

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  clearDataCache();
  return { success: true, message: 'Pengguna berhasil disimpan', data: { UserID: userId } };
}

function deleteUser(userId) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  if (!sheet) return { success: false, message: 'Sheet Users tidak ditemukan' };

  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(userId)) {
      var role = String(values[i][3]).toLowerCase();
      var username = String(values[i][1]).toLowerCase();
      if (role === 'superadmin' || username === 'superadmin' || String(userId) === 'USR-1') {
        return { success: false, message: 'Akun Superadmin utama tidak dapat dihapus demi keamanan sistem' };
      }
      sheet.deleteRow(i + 1);
      clearDataCache();
      return { success: true, message: 'Pengguna berhasil dihapus' };
    }
  }
  return { success: false, message: 'Pengguna tidak ditemukan' };
}

// ================= SETTINGS =================

function saveSettings(data) {
  var ss = getSpreadsheet();
  var sheet = getOrCreateSheet(ss, 'Settings', ['SettingKey', 'SettingValue']);

  var values = sheet.getDataRange().getValues();
  var existingKeys = {};
  for (var i = 1; i < values.length; i++) {
    existingKeys[String(values[i][0])] = i + 1;
  }

  for (var key in data) {
    if (data.hasOwnProperty(key)) {
      if (existingKeys[key]) {
        sheet.getRange(existingKeys[key], 2).setValue(data[key]);
      } else {
        sheet.appendRow([key, data[key]]);
      }
    }
  }

  clearDataCache();
  return { success: true, message: 'Pengaturan sistem berhasil disimpan' };
}

// ================= CADANGAN & ARSIP TAHUNAN (TUTUP BUKU) =================

function extractYearFromDate(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date) {
    return dateVal.getFullYear();
  }
  var str = String(dateVal).trim();
  // Format dd/MM/yyyy atau dd-MM-yyyy
  var parts = str.split(' ')[0].split('/');
  if (parts.length === 3) {
    var y = parseInt(parts[2], 10);
    if (!isNaN(y)) return y;
  }
  var dashParts = str.split(' ')[0].split('-');
  if (dashParts.length === 3) {
    if (dashParts[0].length === 4) return parseInt(dashParts[0], 10);
    return parseInt(dashParts[2], 10);
  }
  var parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.getFullYear();
  return null;
}

function archiveYearData(targetYear, operatorUsername) {
  var ss = getSpreadsheet();
  var year = parseInt(targetYear, 10);
  if (isNaN(year) || year < 2000 || year > 2100) {
    return { success: false, message: 'Tahun arsip tidak valid (' + targetYear + ')' };
  }

  var txnSheet = ss.getSheetByName('Transactions');
  var trfSheet = ss.getSheetByName('Transfers');

  var txnHeaders = txnSheet ? txnSheet.getDataRange().getValues()[0] : [
    'TransactionID', 'WalletID', 'Tanggal', 'TipeTransaksi', 'AccountID', 'CategoryID', 'Nominal', 'Deskripsi', 'BuktiUrl', 'KasirUsername'
  ];
  var trfHeaders = trfSheet ? trfSheet.getDataRange().getValues()[0] : [
    'TransferID', 'WalletID', 'Tanggal', 'FromAccountID', 'ToAccountID', 'Nominal', 'BiayaAdmin', 'TotalKeluar', 'Catatan', 'KasirUsername'
  ];

  // 1. Temukan baris transaksi yang sesuai tahun target
  var txnMatchingRows = [];
  var txnMatchingIndices = [];
  if (txnSheet && txnSheet.getLastRow() > 1) {
    var txnValues = txnSheet.getDataRange().getValues();
    var tglCol = txnValues[0].indexOf('Tanggal');
    if (tglCol !== -1) {
      for (var i = 1; i < txnValues.length; i++) {
        var rowYear = extractYearFromDate(txnValues[i][tglCol]);
        if (rowYear === year) {
          txnMatchingRows.push(txnValues[i]);
          txnMatchingIndices.push(i + 1); // 1-indexed row number
        }
      }
    }
  }

  // 2. Temukan baris transfer yang sesuai tahun target
  var trfMatchingRows = [];
  var trfMatchingIndices = [];
  if (trfSheet && trfSheet.getLastRow() > 1) {
    var trfValues = trfSheet.getDataRange().getValues();
    var trfTglCol = trfValues[0].indexOf('Tanggal');
    if (trfTglCol !== -1) {
      for (var j = 1; j < trfValues.length; j++) {
        var trfRowYear = extractYearFromDate(trfValues[j][trfTglCol]);
        if (trfRowYear === year) {
          trfMatchingRows.push(trfValues[j]);
          trfMatchingIndices.push(j + 1); // 1-indexed row number
        }
      }
    }
  }

  if (txnMatchingRows.length === 0 && trfMatchingRows.length === 0) {
    return {
      success: false,
      message: 'Tidak ditemukan transaksi atau pindah dana pada tahun ' + year + ' untuk diarsipkan.'
    };
  }

  // 3. Simpan ke sheet arsip tahunan (Archive_Transactions_YYYY & Archive_Transfers_YYYY)
  var arcTxnSheet = getOrCreateSheet(ss, 'Archive_Transactions_' + year, txnHeaders);
  for (var t = 0; t < txnMatchingRows.length; t++) {
    arcTxnSheet.appendRow(txnMatchingRows[t]);
  }

  var arcTrfSheet = getOrCreateSheet(ss, 'Archive_Transfers_' + year, trfHeaders);
  for (var r = 0; r < trfMatchingRows.length; r++) {
    arcTrfSheet.appendRow(trfMatchingRows[r]);
  }

  // 4. Hapus baris yang telah diarsipkan dari sheet aktif (dari baris paling bawah ke atas)
  if (txnSheet && txnMatchingIndices.length > 0) {
    for (var k = txnMatchingIndices.length - 1; k >= 0; k--) {
      txnSheet.deleteRow(txnMatchingIndices[k]);
    }
  }
  if (trfSheet && trfMatchingIndices.length > 0) {
    for (var m = trfMatchingIndices.length - 1; m >= 0; m--) {
      trfSheet.deleteRow(trfMatchingIndices[m]);
    }
  }

  // 5. Tutup Buku Saldo: Saldo Sekarang dijadikan Saldo Awal baru pada semua akun
  var accSheet = ss.getSheetByName('Accounts');
  if (accSheet && accSheet.getLastRow() > 1) {
    var accValues = accSheet.getDataRange().getValues();
    var accHeaders = accValues[0];
    var saCol = accHeaders.indexOf('SaldoAwal') + 1;
    var ssCol = accHeaders.indexOf('SaldoSekarang') + 1;
    if (saCol > 0 && ssCol > 0) {
      for (var a = 1; a < accValues.length; a++) {
        var currentBal = accValues[a][ssCol - 1];
        accSheet.getRange(a + 1, saCol).setValue(currentBal);
      }
    }
  }

  // 6. Catat log arsip ke sheet Archives
  var arcLogSheet = getOrCreateSheet(ss, 'Archives', [
    'ArchiveID', 'Tahun', 'TanggalArsip', 'TotalTransaksi', 'TotalPindahDana', 'Operator', 'Status'
  ]);
  var arcId = 'ARC-' + year + '-' + new Date().getTime();
  var tglArsip = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'dd/MM/yyyy HH:mm');
  arcLogSheet.appendRow([
    arcId,
    year,
    tglArsip,
    txnMatchingRows.length,
    trfMatchingRows.length,
    operatorUsername || 'superadmin',
    'TERARSIP'
  ]);

  clearDataCache();

  return {
    success: true,
    message: 'Tutup buku & arsip tahun ' + year + ' berhasil! ' +
             txnMatchingRows.length + ' transaksi & ' + trfMatchingRows.length +
             ' pindah dana berhasil dipindahkan ke tab arsip.',
    year: year,
    archivedTxn: txnMatchingRows.length,
    archivedTrf: trfMatchingRows.length,
    archiveDate: tglArsip
  };
}

function getArchiveYears() {
  var ss = getSpreadsheet();
  var sheets = ss.getSheets();
  var years = [];
  var prefix = 'Archive_Transactions_';
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (name.indexOf(prefix) === 0) {
      var yr = parseInt(name.replace(prefix, ''), 10);
      if (!isNaN(yr) && years.indexOf(yr) === -1) {
        years.push(yr);
      }
    }
  }

  var archivesMeta = getSheetData('Archives');
  if (archivesMeta && archivesMeta.length > 0) {
    archivesMeta.forEach(function(item) {
      var y = parseInt(item.Tahun, 10);
      if (!isNaN(y) && years.indexOf(y) === -1) {
        years.push(y);
      }
    });
  }

  years.sort(function(a, b) { return b - a; });

  return {
    success: true,
    years: years,
    archives: archivesMeta
  };
}

function getArchiveData(targetYear) {
  var year = parseInt(targetYear, 10);
  if (isNaN(year)) {
    return { success: false, message: 'Tahun arsip tidak valid' };
  }

  var txns = getSheetData('Archive_Transactions_' + year);
  var trfs = getSheetData('Archive_Transfers_' + year);

  return {
    success: true,
    year: year,
    transactions: txns,
    transfers: trfs
  };
}

function restoreArchiveData(targetYear) {
  var ss = getSpreadsheet();
  var year = parseInt(targetYear, 10);
  if (isNaN(year)) {
    return { success: false, message: 'Tahun tidak valid' };
  }

  var arcTxnSheet = ss.getSheetByName('Archive_Transactions_' + year);
  var arcTrfSheet = ss.getSheetByName('Archive_Transfers_' + year);

  if (!arcTxnSheet && !arcTrfSheet) {
    return { success: false, message: 'Sheet arsip tahun ' + year + ' tidak ditemukan' };
  }

  var txnSheet = getOrCreateSheet(ss, 'Transactions');
  var trfSheet = getOrCreateSheet(ss, 'Transfers');

  var restoredTxnCount = 0;
  if (arcTxnSheet && arcTxnSheet.getLastRow() > 1) {
    var txData = arcTxnSheet.getDataRange().getValues();
    for (var i = 1; i < txData.length; i++) {
      txnSheet.appendRow(txData[i]);
      restoredTxnCount++;
    }
    ss.deleteSheet(arcTxnSheet);
  }

  var restoredTrfCount = 0;
  if (arcTrfSheet && arcTrfSheet.getLastRow() > 1) {
    var trData = arcTrfSheet.getDataRange().getValues();
    for (var j = 1; j < trData.length; j++) {
      trfSheet.appendRow(trData[j]);
      restoredTrfCount++;
    }
    ss.deleteSheet(arcTrfSheet);
  }

  // Update status di sheet Archives
  var arcLogSheet = ss.getSheetByName('Archives');
  if (arcLogSheet && arcLogSheet.getLastRow() > 1) {
    var logValues = arcLogSheet.getDataRange().getValues();
    for (var row = 1; row < logValues.length; row++) {
      if (parseInt(logValues[row][1], 10) === year) {
        arcLogSheet.getRange(row + 1, 7).setValue('DIPULIHKAN');
      }
    }
  }

  clearDataCache();

  return {
    success: true,
    message: 'Data arsip tahun ' + year + ' berhasil dipulihkan ke sheet aktif (' +
             restoredTxnCount + ' transaksi, ' + restoredTrfCount + ' pindah dana).',
    restoredTxn: restoredTxnCount,
    restoredTrf: restoredTrfCount
  };
}

