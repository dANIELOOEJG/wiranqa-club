// RUTA DE ADMIN: Obtener el QR actual
app.get('/api/admin/current-qr', async (req, res) => {
  try {
    const { data } = await supabase
      .from('dynamic_qrs')
      .select('code')
      .eq('is_used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({ code: data?.code || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RUTA DE ADMIN: Generar un nuevo QR (El anterior muere)
app.post('/api/admin/generate-new-qr', async (req, res) => {
  try {
    // Marcar todos los QRs existentes como usados (para que el anterior muera)
    await supabase.from('dynamic_qrs').update({ is_used: true }).eq('is_used', false);

    // Generar uno nuevo
    const newCode = `WIRANQA-ADMIN-${Date.now()}`;
    const { error } = await supabase.from('dynamic_qrs').insert({ code: newCode });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, newCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});