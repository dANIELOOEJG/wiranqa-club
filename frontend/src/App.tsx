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
  const [level, setLevel] = useState({ id: 1, title: '🍺 Descubre WIRANQA', defaultNickname: 'Viajero WIRANQA' });
  const [view, setView] = useState('home');
  const [rewards, setRewards] = useState([]);

  // Estados del perfil
  const [nickname, setNickname] = useState('Viajero WIRANQA');
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  
  // Estados del registro
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [userData, setUserData] = useState({ name: '', dni: '', email: '' });
  const [isRegistered, setIsRegistered] = useState(false);

  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const cameraMode = isMobile ? 'environment' : 'user';

  const getDeviceId = () => {
    let id = localStorage.getItem('wiranqa_device_id');
    if (!id) {
      id = 'device_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('wiranqa_device_id', id);
    }
    return id;
  };

  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);
    checkBackend(id);
    fetchRewards();
    handleAutoScanFromURL(id);
  }, []);

  const checkBackend = async (id) => {
    try {
      const res = await fetch('https://wiranqa-backend.onrender.com/health');
      if (res.ok) {
        setBackendStatus('Online');
        fetchUserData(id);
        return true;
      }
    } catch {
      setBackendStatus('Offline');
    }
    return false;
  };

  const fetchUserData = async (id) => {
    try {
      const res = await fetch(`https://wiranqa-backend.onrender.com/api/user/${id}`);
      const data = await res.json();
      
      if (data.points !== undefined) {
        setPoints(data.points);
        setLevel(data.level);
        setNickname(data.nickname);
        if (data.name) setIsRegistered(true);
        if (data.history) setHistory(data.history);
      }
    } catch (e) { console.error(e); }
  };

  const fetchRewards = async () => {
    try {
      const res = await fetch('https://wiranqa-backend.onrender.com/api/rewards');
      const data = await res.json();
      setRewards(data);
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
        setLevel(data.data.level);
        setMessage(data.message);
        if (data.data.history) setHistory(data.data.history);
      } else {
        setMessage(data.message);
        if (data.message.includes('ya fue disfrutada')) setScanning(false);
        else setScanning(true);
      }
    } catch (error) {
      setLoading(false);
      setScanning(false);
      setMessage('❌ Error de conexión. Verifica tu internet.');
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

  const updateNickname = async () => {
    if (!nickname.trim()) return;
    setIsEditingNickname(false);
    try {
      await fetch('https://wiranqa-backend.onrender.com/api/user/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, nickname: nickname.trim() })
      });
    } catch (e) { console.error(e); }
  };

  const handleRegister = async () => {
    const { name, dni, email } = userData;
    if (!name || !dni || !email) {
      setMessage('❌ Todos los campos son obligatorios.');
      setTimeout(() => setMessage(''), 4000);
      return;
    }
    try {
      const res = await fetch('https://wiranqa-backend.onrender.com/api/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, name, dni, email })
      });
      const data = await res.json();
      if (data.success) {
        setIsRegistered(true);
        setShowRegisterForm(false);
        setMessage('✅ Registro completado.');
        setTimeout(() => setMessage(''), 4000);
      } else {
        setMessage('❌ Error al registrar.');
        setTimeout(() => setMessage(''), 4000);
      }
    } catch (e) {
      setMessage('❌ Error de conexión.');
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const handleRedeem = async (rewardId, cost) => {
    if (!isRegistered) {
      setShowRegisterForm(true);
      setMessage('📝 Primero completa tu registro.');
      setTimeout(() => setMessage(''), 4000);
      return;
    }
    if (points < cost) {
      setMessage(`❌ No tienes suficientes estrellas. Necesitas ${cost}.`);
      setTimeout(() => setMessage(''), 4000);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('https://wiranqa-backend.onrender.com/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, rewardId })
      });
      const data = await res.json();
      if (data.success) {
        setPoints(data.data.points);
        setMessage(data.message);
      } else {
        setMessage(data.message);
      }
    } catch (error) {
      setMessage('❌ Error al canjear el premio');
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 border border-amber-200 relative overflow-hidden">
        <div className="relative z-10 text-center">
          <div className="flex flex-col items-center mb-4">
            {/* ✅ LOGO SIN SOMBRA Y CON MÁRGEN AJUSTADO PARA ENCAJAR PERFECTAMENTE */}
            <img src="/logo.png" alt="WIRANQA" className="h-20 object-contain mb-2" />
            <h1 className="text-2xl font-bold text-amber-700 tracking-wider">WIRANQA CLUB</h1>
            <p className="text-xs text-slate-500 font-medium tracking-widest">Cerveza Artesanal Ayacuchana</p>
          </div>

          <div className={`mb-4 p-3 rounded-xl transition-all duration-500 ease-in-out ${
            backendStatus === 'Online' 
              ? 'bg-emerald-50 border border-emerald-300 shadow-sm' 
              : 'bg-slate-50 border border-slate-200'
          }`}>
            <h2 className={`text-lg font-bold transition-colors duration-300 ${
              backendStatus === 'Online' 
                ? 'text-emerald-700' 
                : 'text-slate-500'
            }`}>
              {backendStatus === 'Online' ? '🍺 ¡Bienvenido, WIRANQERO!' : '⏳ Conectando...'}
            </h2>
          </div>

          <div className="flex justify-center gap-4 mb-4 flex-wrap">
            <button onClick={() => setView('home')} className={`text-sm font-bold px-3 py-1 rounded-lg ${view === 'home' ? 'bg-amber-600 text-white' : 'text-slate-500'}`}>🏠 Inicio</button>
            <button onClick={() => setView('catalog')} className={`text-sm font-bold px-3 py-1 rounded-lg ${view === 'catalog' ? 'bg-amber-600 text-white' : 'text-slate-500'}`}>🎁 Premios</button>
            <button onClick={() => setView('profile')} className={`text-sm font-bold px-3 py-1 rounded-lg ${view === 'profile' ? 'bg-amber-600 text-white' : 'text-slate-500'}`}>👤 Perfil</button>
          </div>

          {view === 'home' && (
            <>
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="text-4xl">⭐</span>
                <span className="text-5xl font-extrabold text-slate-800">{points}</span>
              </div>
              <div className="text-sm font-bold uppercase tracking-wider text-amber-600">{level.title}</div>
              <div className="mt-4">
                {scanning ? (
                  <div className="rounded-xl overflow-hidden border-2 border-amber-600 bg-black relative">
                    <QrReader delay={300} onError={console.error} onScan={handleScan} style={{ width: '100%', height: '250px', objectFit: 'cover' }} constraints={{ video: { facingMode: cameraMode } }} />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-44 h-44 border-2 border-amber-500 rounded-xl opacity-80"></div></div>
                    <button onClick={() => setScanning(false)} className="w-full py-3 bg-slate-900 text-white font-bold">Cancelar</button>
                  </div>
                ) : (
                  <button onClick={() => setScanning(true)} disabled={loading || backendStatus !== 'Online'} className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white text-lg font-bold rounded-2xl shadow-lg transition-all active:scale-95">
                    {loading ? '⏳ Procesando...' : '📷 Escanear tu WIRANQA'}
                  </button>
                )}
              </div>
            </>
          )}

          {view === 'catalog' && (
            <div className="mt-4">
              <h3 className="text-lg font-bold text-slate-800 mb-2">🎁 Catálogo de Premios</h3>
              <p className="text-sm text-slate-500 mb-4">Tienes ⭐ {points} estrellas</p>
              <div className="space-y-3">
                {rewards.length === 0 ? <p className="text-sm text-slate-400">Cargando premios...</p> : (
                  rewards.map((reward) => (
                    <div key={reward.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <div className="text-left">
                        <h4 className="font-bold text-slate-800">{reward.name}</h4>
                        <p className="text-sm text-slate-500">Costo: ⭐ {reward.cost}</p>
                        {reward.description && <p className="text-xs text-amber-600">{reward.description}</p>}
                      </div>
                      <button onClick={() => handleRedeem(reward.id, reward.cost)} disabled={loading || points < reward.cost} className={`px-4 py-2 rounded-lg font-bold text-sm transition ${points >= reward.cost ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}>
                        {points >= reward.cost ? 'Canjear' : 'Faltan ⭐'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {view === 'profile' && (
            <div className="mt-4 text-left">
              <h3 className="text-lg font-bold text-slate-800 text-center mb-4">👤 Mi Perfil</h3>
              
              <div className="mb-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <label className="block text-sm font-bold text-slate-700 mb-1">Apodo</label>
                {isEditingNickname ? (
                  <div className="flex gap-2">
                    <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} className="flex-1 p-2 border border-slate-300 rounded focus:outline-none focus:border-amber-500" maxLength={20} />
                    <button onClick={updateNickname} className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm">Guardar</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-slate-800">{nickname}</span>
                    <button onClick={() => setIsEditingNickname(true)} className="text-sm text-amber-600 hover:text-amber-700 underline">Editar</button>
                  </div>
                )}
              </div>

              <div className="mb-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <label className="block text-sm font-bold text-slate-700 mb-1">Nivel</label>
                <div className="flex items-center gap-2"><span className="text-2xl">{level.title.split(' ')[0]}</span><span className="text-lg font-bold text-slate-800">{level.title}</span></div>
                <p className="text-xs text-slate-500 mt-1">Nivel {level.id} de 5</p>
              </div>

              <div className="mb-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <label className="block text-sm font-bold text-slate-700 mb-1">Estrellas</label>
                <div className="flex items-center gap-2"><span className="text-3xl">⭐</span><span className="text-3xl font-bold text-slate-800">{points}</span></div>
              </div>

              <div className="mb-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-bold text-slate-700">Historial</label>
                  <button onClick={() => setShowHistory(!showHistory)} className="text-sm text-amber-600 hover:text-amber-700 flex items-center gap-1">
                    {showHistory ? '👁️ Ocultar' : '👁️ Ver'}
                  </button>
                </div>
                {showHistory && (
                  <div className="space-y-2 max-h-40 overflow-y-auto text-sm">
                    {history.length === 0 ? <p className="text-slate-500 italic text-center py-2">Aún sin registros.</p> : (
                      history.map((item, idx) => (
                        <div key={idx} className="bg-white p-2 rounded border border-slate-100 flex justify-between items-center">
                          <span className="font-mono text-slate-600">{item.unique_code}</span>
                          <span className="text-xs text-slate-400">{new Date(item.redeemed_at).toLocaleString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <label className="block text-sm font-bold text-slate-700 mb-1">Cuenta</label>
                {isRegistered ? <p className="text-green-600 font-medium">✅ Verificada</p> : (
                  <div>
                    <p className="text-amber-600 font-medium mb-2">⚠️ Registro necesario para canjear.</p>
                    <button onClick={() => setShowRegisterForm(true)} className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 text-sm">Registrarse</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {showRegisterForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                <h3 className="text-xl font-bold text-slate-800 mb-4">📝 Registro</h3>
                <div className="space-y-3">
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Nombre</label><input type="text" value={userData.name} onChange={(e) => setUserData({...userData, name: e.target.value})} className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:border-amber-500" placeholder="Nombre completo" /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">DNI</label><input type="text" value={userData.dni} onChange={(e) => setUserData({...userData, dni: e.target.value})} className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:border-amber-500" placeholder="DNI" /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Correo</label><input type="email" value={userData.email} onChange={(e) => setUserData({...userData, email: e.target.value})} className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:border-amber-500" placeholder="correo@ejemplo.com" /></div>
                  <button onClick={handleRegister} className="w-full py-3 bg-green-600 text-white font-bold rounded hover:bg-green-700">Registrar</button>
                  <button onClick={() => setShowRegisterForm(false)} className="w-full py-2 text-slate-500 hover:text-slate-700 text-sm">Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {message && (
            <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${message.includes('✅') || message.includes('🎉') || message.includes('¡') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{message}</div>
          )}

          <div className="mt-6 pt-4 border-t border-slate-200 text-[10px] text-slate-400">
            <span>🍺 Cerveza Artesanal Ayacuchana © 2026</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;