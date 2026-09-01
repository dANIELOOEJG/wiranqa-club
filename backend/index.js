// RUTA DE ADMIN: Generar un nuevo QR y devolver la IMAGEN
app.post('/api/admin/generate-new-qr', async (req, res) => {
  try {
    // Marcar todos los existentes como usados
    await supabase.from('dynamic_qrs').update({ is_used: true }).eq('is_used', false);

    // Generar uno nuevo y guardarlo
    const newCode = `WIRANQA-ADMIN-${Date.now()}`;
    const { error: insertError } = await supabase.from('dynamic_qrs').insert({ code: newCode });
    if (insertError) return res.status(500).json({ error: insertError.message });

    // Generar la imagen QR en base64 (URL CORREGIDA: la cadena está entre comillas)
    const QRCode = require('qrcode');
    const qrImage = await QRCode.toDataURL(`https://wiranqa-club-sepia.vercel.app/?code=${newCode}`);

    // Devolver tanto el código como la imagen
    res.json({ success: true, newCode, qrImage });
  } catch (err) {
    console.error('❌ Error en /api/admin/generate-new-qr:', err.message);
    res.status(500).json({ error: err.message });
  }
});