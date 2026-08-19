const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

// CONFIGURACIÓN
const PREFIJO = "LOTE:Q002-2026";
const CANTIDAD = 20; // Cambia a 1000 cuando estés listo
const CARPETA_QR = "./qr_generados";

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

if (!fs.existsSync(CARPETA_QR)){
    fs.mkdirSync(CARPETA_QR);
}

console.log(`\n🚀 Generando ${CANTIDAD} códigos QR...`);

db.serialize(() => {
    // 1. Crear la tabla desde cero
    db.run("DROP TABLE IF EXISTS bottles");
    db.run(`CREATE TABLE bottles (id INTEGER PRIMARY KEY AUTOINCREMENT, unique_code TEXT UNIQUE NOT NULL, is_redeemed BOOLEAN DEFAULT 0)`);

    const stmt = db.prepare("INSERT INTO bottles (unique_code) VALUES (?)");
    
    // 2. Generar uno por uno
    for (let i = 1; i <= CANTIDAD; i++) {
        const code = `${PREFIJO}+${i}`;
        
        // Insertar en BD
        stmt.run(code);
        
        // Generar imagen
        const nombreArchivo = `${CARPETA_QR}/botella_${i}.png`;
            QRCode.toFile(nombreArchivo, code, { color: { dark: '#000000', light: '#ffffff' } });
        
        // Mostrar progreso
        process.stdout.write(`✅ Generado botella_${i}.png -> Código: ${code}\n`);
    }
    
    stmt.finalize();
    
    console.log(`\n🎉 Proceso completado. ${CANTIDAD} QR generados y guardados en BD.`);
    console.log(`📁 Revisa la carpeta 'backend/qr_generados' para imprimirlos.\n`);
    
    db.close();
});