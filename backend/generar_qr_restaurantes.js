const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

// Lista de restaurantes con sus códigos únicos (ACTUALIZADOS)
const restaurants = [
  { name: 'Restaurante La Esquina', code: 'WIRANQA-LOCAL-001-NUEVO' },
  { name: 'Bar El Rincón', code: 'WIRANQA-LOCAL-002-NUEVO' }
];

// Carpeta donde se guardarán las imágenes
const outputDir = path.join(__dirname, 'qr_restaurantes');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

async function generateRestaurantQRs() {
  console.log('🚀 Generando QR de los restaurantes...');
  
  for (const restaurant of restaurants) {
    // Generamos el QR con el enlace directo a la página web (con el código del restaurante)
    const url = `https://wiranqa-club-sepia.vercel.app/?code=${restaurant.code}`;
    
    // Creamos el archivo de imagen
    const filePath = path.join(outputDir, `${restaurant.name.replace(/\s+/g, '_')}.png`);
    await QRCode.toFile(filePath, url, {
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    
    console.log(`✅ QR generado para: ${restaurant.name} (Código: ${restaurant.code})`);
    console.log(`   📁 Imagen guardada en: ${filePath}`);
  }
  
  console.log('🎉 Proceso completado. ¡Ahora puedes escanear los QR!');
}

generateRestaurantQRs();