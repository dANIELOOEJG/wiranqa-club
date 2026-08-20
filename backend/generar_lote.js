const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Conexión a Supabase vía API REST
const supabaseUrl = 'https://qwjjrwiurhyoszhlsdgd.supabase.co';
const supabaseKey = 'sb_publishable_anVzBkFajT9kGwtt8ZtA_L_avh...'; // Pon tu llave real aquí
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  headers: { 'apikey': supabaseKey }
});

const CANTIDAD = 1000;
const CARPETA_QR = './qr_generados';
const PREFIJO = "LOTE:Q002-2026";

// Función para esperar (pausa)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function generateLot() {
    console.log(`🚀 Generando lote de ${CANTIDAD} botellas en Supabase...`);
    
    if (!fs.existsSync(CARPETA_QR)){
        fs.mkdirSync(CARPETA_QR);
    }

    let successCount = 0;
    let errorCount = 0;

    try {
        console.log('🧹 Limpiando tablas viejas...');
        await supabase.from('bottles').delete().neq('id', 0);
        await supabase.from('rewards').delete().neq('id', 0);

        console.log('🍺 Insertando botellas y generando imágenes QR...');

        // Insertar en lotes de 50 para no saturar la API gratuita
        for (let i = 1; i <= CANTIDAD; i++) {
            const code = `${PREFIJO}+${i}`;
            
            const { error } = await supabase
                .from('bottles')
                .insert({ unique_code: code });

            if (error) {
                console.error(`❌ Error insertando ${code}:`, error.message);
                errorCount++;
            } else {
                successCount++;
            }

            // Generar imagen QR
            const filePath = path.join(CARPETA_QR, `botella_${i}.png`);
            await QRCode.toFile(filePath, code, {
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            });

            // PAUSA DE SEGURIDAD: Cada 50 inserciones, esperamos 1 segundo
            if (i % 50 === 0) {
                console.log(`⏳ Pausa de 1 segundo para evitar bloqueos de Supabase... (${i}/${CANTIDAD})`);
                await sleep(1000);
            }
        }

        console.log('🎁 Insertando premios de prueba...');
        await supabase.from('rewards').insert([
            { name: 'Cerveza WIRANQA', cost: 6 },
            { name: 'Vaso Shop WIRANQA', cost: 3 },
            { name: 'Combo Amigos', cost: 30 }
        ]);

        console.log('\n📊 --- INFORME FINAL DE GENERACIÓN ---');
        console.log(`✅ ${successCount} códigos insertados correctamente en Supabase.`);
        console.log(`❌ ${errorCount} errores de inserción.`);
        console.log(`📁 Las ${CANTIDAD} imágenes QR se guardaron en: ${CARPETA_QR}`);
        console.log(`💡 Códigos generados: ${PREFIJO}+1 al +${CANTIDAD}.`);
        console.log('✅ Proceso finalizado con éxito.');

    } catch (err) {
        console.error('❌ Error grave en el proceso de generación:', err.message);
    }
}

generateLot();