const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Conexión a Supabase vía API REST (La solución infalible)
const supabaseUrl = 'https://qwjjrwiurhyoszhlsdgd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3ampyd2l1cmh5b3N6aGxzZGdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjQwNzI4MjUsImV4cCI6MjA0MDY0ODgyNX0.h7X7V_7U7V_7U7V_7U7V_7U7V_7U';
const supabase = createClient(supabaseUrl, supabaseKey);

const CANTIDAD = 1000; // Puedes cambiar esto a 1000 cuando estés listo
const CARPETA_QR = './qr_generados';
const PREFIJO = "LOTE:Q002-2026";

async function generateLot() {
    console.log(`🚀 Generando lote de ${CANTIDAD} botellas en Supabase...`);
    
    // Crear carpeta si no existe
    if (!fs.existsSync(CARPETA_QR)){
        fs.mkdirSync(CARPETA_QR);
    }

    try {
        // Limpiar base de datos (API REST)
        console.log('🧹 Limpiando tablas viejas...');
        await supabase.from('bottles').delete().neq('id', 0);
        await supabase.from('rewards').delete().neq('id', 0);

        console.log('🍺 Insertando botellas y generando imágenes QR...');

        for (let i = 1; i <= CANTIDAD; i++) {
            const code = `${PREFIJO}+${i}`;
            
            // Insertar en BD via API REST
            const { error } = await supabase
                .from('bottles')
                .insert({ unique_code: code });

            if (error) {
                console.error(`❌ Error insertando ${code}:`, error.message);
            }

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

        // Insertar premios de prueba
        console.log('🎁 Insertando premios de prueba...');
        await supabase.from('rewards').insert([
            { name: 'Cerveza WIRANQA', cost: 6 },
            { name: 'Vaso Shop WIRANQA', cost: 3 },
            { name: 'Combo Amigos', cost: 30 }
        ]);

        console.log(`✅ Lote de ${CANTIDAD} botellas y premios insertados en Supabase.`);
        console.log(`📁 Las ${CANTIDAD} imágenes QR se guardaron en: ${CARPETA_QR}`);
        console.log(`💡 Códigos generados: ${PREFIJO}+1 al +${CANTIDAD}.`);
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

generateLot();