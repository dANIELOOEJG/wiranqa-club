import React, { useState, useEffect } from 'react';
// @ts-ignore
import QrReader from 'react-qr-scanner';

function App() {
  const [points, setPoints] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [backendStatus, setBackendStatus] = useState('Desconocido');
  const [scanning, setScanning] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [level, setLevel] = useState('WIRANQERO NOVATO');

  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const cameraMode = isMobile ? 'environment' : 'user';

  // Generar o recuperar ID del dispositivo
  const getDeviceId = () => {
    let id = localStorage.getItem('wiranqa_device_id');
    if (!id) {
      id = 'device_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('wiranqa_device_id', id);
    }
    return id;
  };

  const getLevelFromPoints = (pts) => {
    if (pts >= 100) return '🏆 LEYENDA AYACUCHANA';
    if (pts >= 50) return '🍺 MAESTRO WIRANQERO';
    if (pts >= 25) return '⭐ WIRANQERO EXPERTO';
    if (pts >= 10) return '🌱 WIRANQERO NOVATO';
    return '🍺 Descubre WIRANQA';
  };

  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);
    checkBackend(id);
    handleAutoScanFromURL(id);
  }, []);

  // CORREGIDO: Se añadió /health al final de la URL
  const checkBackend = async (id) => {
    try {
      const res = await fetch('https://wiranqa-backend.onrender.com/health');
      if (res.ok) {
        setBackendStatus('Online');
        fetchUserPoints(id);
        return true;
      }
    } catch {
      setBackendStatus('Offline');
    }
    return false;
  };

  // CORREGIDO: Se cambió localhost por la URL de Render
  const fetchUserPoints = async (id) => {
    try {
      const res = await fetch(`https://wiranqa-backend.onrender.com/api/user/${id}`);
      const data = await res.json();
      if (data.points !== undefined) {
        setPoints(data.points);
        setLevel(getLevelFromPoints(data.points));
      }
    } catch (e) { console.error(e); }
  };

  const handleAutoScanFromURL = async (id) => {
    const params = new URLSearchParams(window.location.search);
    const qrCode = params.get('code');
    if (qrCode) {
      window.history.replaceState({}, document.title, window.location.pathname);
      await processScan(qrCode, id);
    }
  };

  // CORREGIDO: Se cambió localhost por la URL de Render
  const processScan = async (code, id) => {
    setLoading(true);
    setMessage('⏳ Verificando tu WIRANQA...');
    const cleanCode = code.trim();

    try {
      const res = await fetch('https://wiranqa-backend.onrender.com/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cleanCode, deviceId: id })
      });
      const data = await res.json();
      setLoading(false);
      
      if (data.success) {
        setPoints(data.data.points);
        setLevel(getLevelFromPoints(data.data.points));
        setMessage(data.message);
      } else {
        setMessage(data.message);
      }
    } catch (error) {
      setLoading(false);
      setMessage('❌ Error de conexión');
    } finally {
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const handleScan = (data) => {
    if (data && data.text && deviceId) {
      setScanning(false);
      processScan(data.text, deviceId);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 border border-amber-200 relative overflow-hidden">
        <div className="relative z-10 text-center">
          <div className="flex flex-col items-center mb-4">
            <img src="/logo.png" alt="WIRANQA" className="h-20 object-contain mb-2 drop-shadow-md" />
            <h1 className="text-2xl font-bold text-amber-700 tracking-wider">WIRANQA CLUB</h1>
            <p className="text-xs text-slate-500 font-medium tracking-widest">Cerveza Artesanal Ayacuchana</p>
          </div>

          {backendStatus === 'Online' ? (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-300">
              <h2 className="text-lg font-bold text-emerald-700">🍺 ¡Bienvenido, WIRANQERO!</h2>
            </div>
          ) : (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-300">
              <h2 className="text-lg font-bold text-red-700">⏳ Conectando...</h2>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-4xl">⭐</span>
            <span className="text-5xl font-extrabold text-slate-800">{points}</span>
          </div>
          <div className="text-sm font-bold uppercase tracking-wider text-amber-600">
            {level}
          </div>

          <div className="mt-4">
            {scanning ? (
              <div className="rounded-xl overflow-hidden border-2 border-amber-600 bg-black relative">
                <QrReader
                  delay={300}
                  onError={console.error}
                  onScan={handleScan}
                  style={{ width: '100%', height: '250px', objectFit: 'cover' }}
                  constraints={{ video: { facingMode: cameraMode } }}
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-44 h-44 border-2 border-amber-500 rounded-xl opacity-80"></div>
                </div>
                <button onClick={() => setScanning(false)} className="w-full py-3 bg-slate-900 text-white font-bold">
                  Cancelar
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setScanning(true)} 
                disabled={loading || backendStatus !== 'Online'}
                className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white text-lg font-bold rounded-2xl shadow-lg transition-all active:scale-95">
                {loading ? '⏳ Procesando...' : '📷 Escanear tu WIRANQA'}
              </button>
            )}
          </div>

          {message && (
            <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${message.includes('✅') || message.includes('🎉') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {message}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-slate-200 text-[10px] text-slate-400">
            <span>🍺 Cerveza Artesanal Ayacuchana</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;