const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
require('dotenv').config();

// Conexión a Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const CANTIDAD = 1000; // <--- CAMBIA ESTO SI QUIERES MÁS O MENOS
const CARPETA_QR = './qr_generados';
const PREFIJO = "LOTE:Q002-2026";

async function generateLot() {
    console.log(`🚀 Generando lote de ${CANTIDAD} botellas en Supabase...`);
    
    // Crear carpeta si no existe
    if (!fs.existsSync(CARPETA_QR)){
        fs.mkdirSync(CARPETA_QR);
    }

    try {
        // Limpiar base de datos
        await pool.query('DROP TABLE IF EXISTS bottles');
        await pool.query('DROP TABLE IF EXISTS rewards');

        await pool.query(`
            CREATE TABLE bottles (
                id SERIAL PRIMARY KEY,
                unique_code TEXT UNIQUE NOT NULL,
                is_redeemed BOOLEAN DEFAULT FALSE,
                redeemed_by TEXT,
                redeemed_at TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE rewards (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                cost INTEGER NOT NULL,
                is_active BOOLEAN DEFAULT TRUE
            )
        `);

        console.log('🍺 Insertando botellas y generando imágenes QR...');

        for (let i = 1; i <= CANTIDAD; i++) {
            const code = `${PREFIJO}+${i}`;
            
            // Insertar en BD
            await pool.query(
                'INSERT INTO bottles (unique_code) VALUES ($1)',
                [code]
            );

            // Generar imagen QR
            const filePath = path.join(CARPETA_QR, `botella_${i}.png`);
            await QRCode.toFile(filePath, code, {
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            });

            // Mostrar progreso cada 100
            if (i % 100 === 0) {
                console.log(`✅ Generadas ${i} imágenes...`);
            }
        }

        // Insertar premios
        console.log('🎁 Insertando premios de prueba...');
        await pool.query(
            `INSERT INTO rewards (name, cost) VALUES 
            ('Cerveza WIRANQA', 6),
            ('Vaso Shop WIRANQA', 3),
            ('Combo Amigos', 30)`
        );

        console.log(`✅ Lote de ${CANTIDAD} botellas y premios insertados en Supabase.`);
        console.log(`📁 Las ${CANTIDAD} imágenes QR se guardaron en: ${CARPETA_QR}`);
        console.log(`💡 Códigos generados: ${PREFIJO}+1 al +${CANTIDAD}.`);
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await pool.end();
    }
}

generateLot();