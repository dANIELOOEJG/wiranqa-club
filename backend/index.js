// backend/index.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
    crossOriginResourcePolicy: false
}));
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
    windowMs: 60 * 1000, 
    max: 50, 
    message: { error: 'Demasiadas peticiones.' }
});
app.use(limiter);

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Tabla de Usuarios
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        points INTEGER DEFAULT 0
    )`);

    // Tabla de Botellas
    db.run(`CREATE TABLE IF NOT EXISTS bottles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unique_code TEXT UNIQUE NOT NULL,
        is_redeemed BOOLEAN DEFAULT 0,
        redeemed_at DATETIME
    )`);

        // Verificar que la base de datos esté lista
    db.get("SELECT COUNT(*) as count FROM bottles", (err, row) => {
        if (err) {
            console.error("❌ Error al verificar la BD:", err.message);
        } else {
            console.log(`✅ Base de datos lista. ${row.count} botellas registradas.`);
        }
    });
});

// --- RUTAS PÚBLICAS ---

// 1. Escaneo de QR
app.post('/api/scan', (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Código QR requerido' });

    db.get("SELECT * FROM bottles WHERE unique_code = ?", [code], (err, bottle) => {
        if (err) return res.status(500).json({ error: 'Error en BD' });
        if (!bottle) return res.status(404).json({ message: '❌ Código QR no válido. No pertenece a este lote.' });
        if (bottle.is_redeemed === 1) return res.status(400).json({ message: '⚠️ Esta botella ya fue canjeada anteriormente.' });

        // Marcar como usada con fecha y hora
        db.run("UPDATE bottles SET is_redeemed = 1 WHERE id = ?", [bottle.id]);
        db.run("UPDATE users SET points = points + 1 WHERE id = 1", function(err) {
            if (err && err.errno === 19) { 
                db.run("INSERT INTO users (id, name, points) VALUES (1, 'Cliente Anónimo', 1)");
            }
            
            db.get("SELECT points FROM users WHERE id = 1", (err, user) => {
                res.json({ success: true, message: `✅ Botella WIRANQA canjeada!`, data: user });
            });
        });
    });
});

// 2. Obtener puntos del usuario
app.get('/api/user', (req, res) => {
    db.get("SELECT points FROM users WHERE id = 1", (err, row) => {
        res.json(row || { points: 0 });
    });
});

// --- RUTAS DEL DASHBOARD (ADMIN) ---

// 1. Estadísticas generales
app.get('/api/dashboard/stats', (req, res) => {
    db.get("SELECT COUNT(*) as totalScans, SUM(points) as totalPoints FROM users", (err, stats) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.get("SELECT COUNT(*) as remainingBottles FROM bottles WHERE is_redeemed = 0", (err, bottlesLeft) => {
            res.json({ ...stats, ...bottlesLeft });
        });
    });
});

// 2. Historial de los últimos 50 escaneos
app.get('/api/dashboard/history', (req, res) => {
    db.all("SELECT unique_code, redeemed_at FROM bottles WHERE is_redeemed = 1 ORDER BY redeemed_at DESC LIMIT 50", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 3. Reiniciar la base de datos (Para empezar un lote nuevo)
app.post('/api/dashboard/reset', (req, res) => {
    db.run("DELETE FROM users");
    db.run("UPDATE bottles SET is_redeemed = 0, redeemed_at = NULL");
    db.run("INSERT INTO users (id, name, points) VALUES (1, 'Cliente Anónimo', 0)");
    res.json({ success: true, message: "✅ Base de datos reiniciada. Todos los QR están disponibles nuevamente." });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend running' });
});

app.listen(PORT, () => {
    console.log(`🚀 WIRANQA CLUB - Sistema 100% terminado en http://localhost:${PORT}`);
});