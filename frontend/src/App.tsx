import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import QrReader from 'react-qr-scanner';

function App() {
  // 🚀 CONFIGURACIÓN GLOBAL
  const API_URL = import.meta.env.VITE_API_URL || 'https://wiranqa-backend.onrender.com';
  const ADMIN_PASSWORD = 'wiranqa2026'; // Contraseña del Panel Admin

  const [points, setPoints] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [backendStatus, setBackendStatus] = useState('Desconocido');
  const [scanning, setScanning] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [nickname, setNickname] = useState('Viajero WIRANQA');
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [userData, setUserData] = useState({ name: '', dni: '', phone: '', email: '' });
  const [isRegistered, setIsRegistered] = useState(false);
  const [activeCard, setActiveCard] = useState(null);
  const [totalCompletedCards, setTotalCompletedCards] = useState(0);
  const [rewards, setRewards] = useState([]);

  // Estados del Admin
  const [view, setView] = useState('home');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [isAdminLogged, setIsAdminLogged] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminStats, setAdminStats] = useState({
    availableQrs: 0,
    usedQrs: 0,
    completedCards: 0,
    totalUsers: 0,
    qrs: [],
    cards: [],
    history: []
  });

  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const cameraMode = isMobile ? 'environment' : 'user';
  const isProcessing = useRef(false);

  const getDeviceId = () => {
    let id = localStorage.getItem('wiranqa_device_id');
    if (!id) {
      id = 'device_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('wiranqa_device_id', id);
    }
    return id;
  };

  // 🚀 KEEP ALIVE (Carga rápida)
  useEffect(() => {
    const keepAlive = async () => {
      try { await fetch(`${API_URL}/health`); } catch (e) {}
    };
    keepAlive();
    const interval = setInterval(keepAlive, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);
    checkBackend(id);
    fetchRewards();
  }, []);

  const checkBackend = async (id) => {
    try {
      const res = await fetch(`${API_URL}/health`);
      if (res.ok) {
        setBackendStatus('Online');
        fetchUserData(id);
        return true;
      }
    } catch { setBackendStatus('Offline'); }
    return false;
  };

  const fetchUserData = async (id) => {
    try {
      const res = await fetch(`${API_URL}/api/user/${id}`);
      const data = await res.json();
      if (data.activeCard) {
        setActiveCard(data.activeCard);
        setPoints(data.activeCard.current_progress);
        setTotalCompletedCards(data.totalCompletedCards);
      }
      setNickname(data.nickname);
      if (data.name) setIsRegistered(true);
    } catch (e) { console.error(e); }
  };

  const fetchRewards = async () => {
    try {
      const res = await fetch(`${API_URL}/api/rewards`);
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
    if (isProcessing.current) return;
    isProcessing.current = true;
    setLoading(true);
    setMessage('⏳ Verificando tu WIRANQA...');
    const cleanCode = code.trim();
    try {
      const res = await fetch(`${API_URL}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cleanCode, deviceId: id })
      });
      const data = await res.json();
      setLoading(false);
      
      if (data.success) {
        setActiveCard(data.data.card);
        setPoints(data.data.card.current_progress);
        setMessage(data.message);
        setScanning(false);
      } else {
        setMessage(data.message || '❌ Ocurrió un error.');
        setScanning(false);
      }
    } catch (error) {
      setLoading(false);
      setScanning(false);
      setMessage('❌ No pudimos conectar con el servidor.');
    } finally {
      setTimeout(() => setMessage(''), 4000);
      isProcessing.current = false;
    }
  };

  const handleScan = (data) => {
    if (data && data.text && deviceId && !isProcessing.current) {
      processScan(data.text, deviceId);
    }
  };

  const updateNickname = async () => {
    if (!nickname.trim()) return;
    setIsEditingNickname(false);
    try {
      await fetch(`${API_URL}/api/user/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, nickname: nickname.trim() })
      });
    } catch (e) { console.error(e); }
  };

  const handleRegister = async () => {
    const { name, dni, phone, email } = userData;
    if (!name || !dni || !phone || !email) {
      setMessage('❌ Todos los campos son obligatorios.');
      setTimeout(() => setMessage(''), 4000);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/user/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, name, dni, phone, email })
      });
      const data = await res.json();
      if (data.success) {
        setIsRegistered(true);
        setShowRegisterForm(false);
        setMessage('✅ Registro completado.');
        setTimeout(() => setMessage(''), 4000);
      } else {
        setMessage(data.error || '❌ Error al registrar.');
        setTimeout(() => setMessage(''), 4000);
      }
    } catch (e) {
      setMessage('❌ Error de conexión.');
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const handleRedeem = async (rewardId) => {
    if (!isRegistered) {
      setShowRegisterForm(true);
      setMessage('📝 Para canjear debes registrarte.');
      setTimeout(() => setMessage(''), 4000);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, rewardId })
      });
      const data = await res.json();
      if (data.success) {
        setActiveCard(data.data.newCard);
        setPoints(0);
        setTotalCompletedCards(prev => prev + 1);
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

  // --- FUNCIONES DEL ADMIN ---
  const handleAdminLogin = async () => {
    if (adminPassword === ADMIN_PASSWORD) {
      setIsAdminLogged(true);
      setShowAdminLogin(false);
      await fetchAdminData();
    } else {
      setMessage('❌ Contraseña incorrecta.');
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const fetchAdminData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard`);
      const data = await res.json();
      setAdminStats(data);
    } catch (e) { console.error(e); }
  };

  const handleGenerateQr = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/generate-qrs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 5 })
      });
      const data = await res.json();
      if (data.success) {
        setMessage('✅ 5 QRs generados.');
        setTimeout(() => setMessage(''), 4000);
        await fetchAdminData();
      }
    } catch (e) { console.error(e); }
  };

  // --- RENDER DE INTERFAZ ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 border border-amber-200 relative overflow-hidden">
        <div className="relative z-10 text-center">
          <div className="flex flex-col items-center mb-4">
            <img src="/logo.png" alt="WIRANQA" className="h-20 object-contain mb-2" />
            <h1 className="text-2xl font-bold text-amber-700 tracking-wider">WIRANQA CLUB</h1>
            <p className="text-xs text-slate-500 font-medium tracking-widest">Cerveza Artesanal Ayacuchana</p>
          </div>

          <div className={`mb-4 p-3 rounded-xl transition-all duration-500 ease-in-out ${backendStatus === 'Online' ? 'bg-emerald-50 border border-emerald-300 shadow-sm' : 'bg-slate-50 border border-slate-200'}`}>
            <h2 className={`text-lg font-bold transition-colors duration-300 ${backendStatus === 'Online' ? 'text-emerald-700' : 'text-slate-500'}`}>
              {backendStatus === 'Online' ? '🍺 ¡Bienvenido, WIRANQERO!' : '🍺 Preparando tu experiencia WIRANQA...'}
            </h2>
          </div>

          {!isAdminLogged ? (
            <>
              <div className="flex justify-center gap-4 mb-4 flex-wrap">
                <button onClick={() => setView('home')} className={`text-sm font-bold px-3 py-1 rounded-lg ${view === 'home' ? 'bg-amber-600 text-white' : 'text-slate-500'}`}>🏠 Inicio</button>
                <button onClick={() => setView('rewards')} className={`text-sm font-bold px-3 py-1 rounded-lg ${view === 'rewards' ? 'bg-amber-600 text-white' : 'text-slate-500'}`}>🎁 Premios</button>
                <button onClick={() => setView('profile')} className={`text-sm font-bold px-3 py-1 rounded-lg ${view === 'profile' ? 'bg-amber-600 text-white' : 'text-slate-500'}`}>👤 Perfil</button>
              </div>

              {view === 'home' && (
                <>
                  {/* TARJETA WIRANQA PREMIUM */}
                  <div className="bg-gradient-to-br from-amber-100 to-amber-50 rounded-3xl p-6 border-2 border-amber-300 mb-6 shadow-lg relative overflow-hidden">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <img src="/logo.png" alt="WIRANQA" className="h-10 object-contain" />
                        <span className="font-bold text-amber-800">TARJETA WIRANQA</span>
                      </div>
                      <span className="text-xs text-amber-700 font-semibold bg-amber-200 px-2 py-1 rounded-full">
                        {activeCard ? `${activeCard.current_progress}/${activeCard.total_slots}` : '0/8'}
                      </span>
                    </div>

                    {/* ICONOS DE CERVEZA */}
                    <div className="grid grid-cols-4 gap-2 justify-items-center mb-4">
                      {Array.from({ length: 8 }).map((_, index) => (
                        <div key={index} className={`w-10 h-10 flex items-center justify-center rounded-full border-2 ${activeCard && index < activeCard.current_progress ? 'bg-amber-500 border-amber-600' : 'bg-white border-gray-300'}`}>
                          <span className={`text-xl ${activeCard && index < activeCard.current_progress ? 'text-white' : 'text-gray-300'}`}>🍺</span>
                        </div>
                      ))}
                    </div>

                    {/* BOTÓN CANJE */}
                    {activeCard && activeCard.is_completed ? (
                      <button 
                        onClick={() => setView('rewards')}
                        className="w-full py-4 bg-green-600 hover:bg-green-700 text-white text-lg font-bold rounded-2xl shadow-lg transition-all animate-pulse"
                      >
                        🎁 ¡TARJETA LLENA! CANJEAR PREMIO
                      </button>
                    ) : (
                      <button onClick={() => setScanning(true)} disabled={loading || backendStatus !== 'Online'} className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white text-lg font-bold rounded-2xl shadow-lg transition-all active:scale-95">
                        {loading ? '⏳ Procesando...' : '📷 Escanear tu WIRANQA'}
                      </button>
                    )}
                  </div>

                  {scanning ? (
                    <div className="rounded-xl overflow-hidden border-2 border-amber-600 bg-black relative">
                      <QrReader delay={300} onError={console.error} onScan={handleScan} style={{ width: '100%', height: '250px', objectFit: 'cover' }} constraints={{ video: { facingMode: cameraMode } }} />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-44 h-44 border-2 border-amber-500 rounded-xl opacity-80"></div></div>
                      <button onClick={() => setScanning(false)} className="w-full py-3 bg-slate-900 text-white font-bold">Cancelar</button>
                    </div>
                  ) : null}
                </>
              )}

              {view === 'rewards' && (
                <div className="mt-4">
                  <h3 className="text-lg font-bold text-slate-800 mb-2">🎁 Catálogo de Premios</h3>
                  <p className="text-sm text-slate-500 mb-4">Tienes ⭐ {points} estrellas (Progreso de tarjeta)</p>

                  <div className="space-y-3">
                    {rewards.length === 0 ? <p className="text-sm text-slate-400">Cargando premios...</p> : (
                      rewards.map((reward) => (
                        <div key={reward.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                          <div className="text-left">
                            <h4 className="font-bold text-slate-800">{reward.name}</h4>
                            <p className="text-sm text-slate-500">Costo: ⭐ {reward.cost}</p>
                            {reward.description && <p className="text-xs text-amber-600">{reward.description}</p>}
                          </div>
                          <button 
                            onClick={() => handleRedeem(reward.id)} 
                            disabled={loading || !(activeCard && activeCard.is_completed)} 
                            className={`px-4 py-2 rounded-lg font-bold text-sm transition ${(activeCard && activeCard.is_completed) ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}
                          >
                            {activeCard && activeCard.is_completed ? 'Canjear' : 'Tarjeta no llena'}
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
                    <label className="block text-sm font-bold text-slate-700 mb-1">Tarjetas Canjeadas</label>
                    <div className="flex items-center gap-2">
                      <span className="text-3xl">🎁</span>
                      <span className="text-3xl font-bold text-slate-800">{totalCompletedCards}</span>
                    </div>
                  </div>

                  <div className="mb-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
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

              {/* BOTÓN OCULTO DEL ADMIN */}
              <div className="mt-6 pt-4 border-t border-slate-200">
                <button 
                  onClick={() => setShowAdminLogin(true)}
                  className="w-full py-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 text-xs font-bold"
                >
                  🔒
                </button>
              </div>
            </>
          ) : (
            /* PANEL DEL ADMIN */
            <div className="mt-4 text-left">
              <h3 className="text-xl font-bold text-slate-800 text-center mb-4">🔒 Panel de Administración</h3>
              
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-white p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-xs text-slate-500">📱 QRs Disponibles</p>
                  <p className="text-2xl font-bold text-slate-800">{adminStats.availableQrs}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-xs text-slate-500">✅ QRs Usados</p>
                  <p className="text-2xl font-bold text-slate-800">{adminStats.usedQrs}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-xs text-slate-500">🎁 Tarjetas Completadas</p>
                  <p className="text-2xl font-bold text-slate-800">{adminStats.completedCards}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-xs text-slate-500">👥 Total Usuarios</p>
                  <p className="text-2xl font-bold text-slate-800">{adminStats.totalUsers}</p>
                </div>
              </div>

              <button 
                onClick={handleGenerateQr}
                className="w-full py-3 bg-amber-600 text-white font-bold rounded hover:bg-amber-700 mb-4"
              >
                + Generar 5 Nuevos QRs
              </button>

              <button 
                onClick={() => setIsAdminLogged(false)}
                className="w-full py-2 text-slate-500 hover:text-slate-700 text-sm"
              >
                ← Cerrar Sesión Admin
              </button>
            </div>
          )}

          {showAdminLogin && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                <h3 className="text-xl font-bold text-slate-800 mb-4">🔒 Acceso Administrador</h3>
                <div className="space-y-3">
                  <input 
                    type="password" 
                    value={adminPassword} 
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:border-amber-500"
                    placeholder="Contraseña"
                  />
                  <button onClick={handleAdminLogin} className="w-full py-3 bg-amber-600 text-white font-bold rounded hover:bg-amber-700">Ingresar</button>
                  <button onClick={() => setShowAdminLogin(false)} className="w-full py-2 text-slate-500 hover:text-slate-700 text-sm">Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {showRegisterForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                <h3 className="text-xl font-bold text-slate-800 mb-4">📝 Registro para canjear</h3>
                <div className="space-y-3">
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Nombre completo</label><input type="text" value={userData.name} onChange={(e) => setUserData({...userData, name: e.target.value})} className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:border-amber-500" placeholder="Nombre completo" /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">DNI</label><input type="text" value={userData.dni} onChange={(e) => setUserData({...userData, dni: e.target.value})} className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:border-amber-500" placeholder="N° DNI" /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">N° Celular</label><input type="text" value={userData.phone} onChange={(e) => setUserData({...userData, phone: e.target.value})} className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:border-amber-500" placeholder="N° Celular" /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Correo electrónico</label><input type="email" value={userData.email} onChange={(e) => setUserData({...userData, email: e.target.value})} className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:border-amber-500" placeholder="correo@ejemplo.com" /></div>
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