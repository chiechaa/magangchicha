const { RouterOSAPI } = require('routeros-api');

class MikrotikConfig {
  constructor() {
    // Membaca dari Environment Variables
    this.host = process.env.MIKROTIK_HOST || process.env.MIKROTIK_IP;
    this.user = process.env.MIKROTIK_USER || process.env.MIKROTIK_API_USER;
    this.password = process.env.MIKROTIK_PASSWORD || process.env.MIKROTIK_API_PASSWORD;
    this.port = parseInt(process.env.MIKROTIK_PORT || process.env.MIKROTIK_API_PORT, 10) || 8728;
  }

  // Fungsi membuat koneksi ke MikroTik
  async connect() {
    if (!this.host || !this.user) {
      console.error('Konfigurasi MikroTik (HOST/USER) belum diatur di .env!');
      return null;
    }

    const conn = new RouterOSAPI({
      host: this.host,
      user: this.user,
      password: this.password,
      port: this.port,
      timeout: 10000 // Diperbaiki: 10.000 ms (10 detik)
    });

    try {
      await conn.connect();
      return conn;
    } catch (error) {
      console.error('Gagal terhubung ke MikroTik:', error.message);
      return null;
    }
  }

  // Tes status koneksi API
  async login() {
    const conn = await this.connect();
    if (conn) {
      console.log('Berhasil terhubung ke MikroTik via API!');
      await conn.close();
      return true;
    }
    return false;
  }

  // Validasi login user hotspot secara riil
  async validateLogin(username, password) {
    const conn = await this.connect();
    if (!conn) {
      return { success: false, message: 'Gagal terhubung ke router MikroTik' };
    }

    try {
      const users = await conn.write('/ip/hotspot/user/print', [
        `?name=${username}`
      ]);

      await conn.close();

      if (!users || users.length === 0) {
        return { success: false, message: 'Username tidak ditemukan' };
      }

      const user = users[0];
      if (user.password === password) {
        return { success: true, message: 'Login valid', user };
      } else {
        return { success: false, message: 'Password salah' };
      }
    } catch (error) {
      console.error('Error validasi login:', error.message);
      try { await conn.close(); } catch (e) {}
      return { success: false, message: 'Terjadi kesalahan sistem' };
    }
  }

  // Tambah user ke Hotspot
  async addUserToHotspot(username, password, profile = 'default') {
    const conn = await this.connect();
    if (!conn) {
      return { success: false, message: 'Koneksi ke MikroTik gagal' };
    }

    try {
      await conn.write('/ip/hotspot/user/add', [
        `=name=${username}`,
        `=password=${password}`,
        `=profile=${profile}`
      ]);

      console.log(`Berhasil menambahkan user ${username} ke MikroTik Hotspot!`);
      await conn.close();
      return { success: true, message: 'User added to hotspot' };
    } catch (error) {
      console.error('Error adding user to hotspot:', error.message);
      try { await conn.close(); } catch (e) {}
      return { success: false, message: error.message };
    }
  }

  // Hapus user dari Hotspot
  async removeUserFromHotspot(username) {
    const conn = await this.connect();
    if (!conn) return { success: false, message: 'Koneksi gagal' };

    try {
      const users = await conn.write('/ip/hotspot/user/print', [
        `?name=${username}`
      ]);

      if (users && users.length > 0) {
        const userId = users[0]['.id'];
        await conn.write('/ip/hotspot/user/remove', [
          `=.id=${userId}`
        ]);
        console.log(`Berhasil menghapus user ${username} dari MikroTik.`);
      }

      await conn.close();
      return { success: true, message: 'User removed from hotspot' };
    } catch (error) {
      console.error('Error removing user from hotspot:', error.message);
      try { await conn.close(); } catch (e) {}
      return { success: false, message: error.message };
    }
  }

  // Ambil statistik user realtime
  async getUsersStats() {
    const conn = await this.connect();
    if (!conn) return [];

    try {
      const hotspotUsers = await conn.write('/ip/hotspot/user/print');
      const activeUsers = await conn.write('/ip/hotspot/active/print');

      await conn.close();

      return hotspotUsers.map(user => {
        const active = activeUsers.find(act => act.user === user.name);
        return {
          name: user.name,
          'bytes-in': active ? active['bytes-in'] : (user['bytes-in'] || 0),
          'bytes-out': active ? active['bytes-out'] : (user['bytes-out'] || 0),
          uptime: active ? active.uptime : (user.uptime || 'Off')
        };
      });
    } catch (error) {
      console.error('Error fetching Mikrotik statistics:', error.message);
      try { await conn.close(); } catch (e) {}
      return [];
    }
  }
}

module.exports = new MikrotikConfig();
