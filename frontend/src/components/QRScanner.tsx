import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QrScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (error: string) => void;
  onClose: () => void;
}

const QrScanner: React.FC<QrScannerProps> = ({ onScanSuccess, onScanError, onClose }) => {
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'qr-reader-container';

  useEffect(() => {
    const startScanner = async () => {
      try {
        const html5QrCode = new Html5Qrcode(containerId);
        scannerRef.current = html5QrCode;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        };

        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            // Éxito en el escaneo
            setIsScanning(false);
            onScanSuccess(decodedText);
            html5QrCode.stop().catch(console.error);
          },
          (errorMessage) => {
            // Error de escaneo (ignoramos errores comunes)
            if (onScanError && !errorMessage.includes('No MultiFormat Readers')) {
              onScanError(errorMessage);
            }
          }
        );
        setIsScanning(true);
      } catch (err) {
        console.error('Error al iniciar el escáner:', err);
        if (onScanError) {
          onScanError('No se pudo acceder a la cámara. Por favor, verifica los permisos.');
        }
        onClose();
      }
    };

    startScanner();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error);
        scannerRef.current.clear().catch(console.error);
      }
    };
  }, [onScanSuccess, onScanError, onClose]);

  return (
    <div className="relative rounded-xl overflow-hidden border-2 border-amber-500 bg-black">
      <div id={containerId} className="w-full h-64" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-44 h-44 border-2 border-amber-500 rounded-xl opacity-80" />
      </div>
      <button
        onClick={() => {
          if (scannerRef.current) {
            scannerRef.current.stop().catch(console.error);
          }
          onClose();
        }}
        className="w-full py-3 bg-slate-900 text-white font-bold hover:bg-slate-800 transition"
      >
        Cancelar
      </button>
    </div>
  );
};

export default QrScanner;