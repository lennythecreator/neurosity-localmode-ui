import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { neurosity, connectBluetooth, disconnectAll, streamingState$, bluetoothConnection$ } from './neurosityClient'
import { BLUETOOTH_CONNECTION, STREAMING_TYPE } from '@neurosity/sdk'
import type { DeviceInfo, DeviceStatus } from '@neurosity/sdk'

interface LogEntry {
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

function App() {
  const [btState, setBtState] = useState<BLUETOOTH_CONNECTION>(BLUETOOTH_CONNECTION.DISCONNECTED)
  const [activeMode, setActiveMode] = useState<STREAMING_TYPE>(STREAMING_TYPE.WIFI)
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState<DeviceStatus | null>(null)
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null)
  const [powerByBand, setPowerByBand] = useState<unknown>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const infoFetchedRef = useRef(false)
  const metricsSubscribedRef = useRef(false)

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const entry: LogEntry = { timestamp: new Date(), message, type };
    setLogs(prev => [...prev, entry]);
    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  useEffect(() => {
    addLog('App initialized', 'info');
    
    let prevMode: STREAMING_TYPE = STREAMING_TYPE.WIFI;
    
    const sub1 = bluetoothConnection$.subscribe((state) => {
      setBtState(state);
      addLog(`Bluetooth connection state: ${state}`, state === BLUETOOTH_CONNECTION.CONNECTED ? 'success' : 'info');
    });
    
    const sub2 = streamingState$.subscribe((s) => {
      setActiveMode(s.activeMode);
      setConnected(s.connected);
      
      if (prevMode !== s.activeMode) {
        addLog(`Transport changed: ${s.activeMode === STREAMING_TYPE.BLUETOOTH ? 'Bluetooth' : 'Wi-Fi'}`, 
          s.activeMode === STREAMING_TYPE.BLUETOOTH ? 'success' : 'warn');
        prevMode = s.activeMode;
      }
      
      if (s.connected && s.activeMode === STREAMING_TYPE.BLUETOOTH && !infoFetchedRef.current) {
        // Fetch device info once when switching to Bluetooth
        infoFetchedRef.current = true;
        neurosity.bluetooth.getInfo()
          .then((info) => {
            setDeviceInfo(info);
            addLog(`Device info loaded: ${info.deviceNickname} (${info.deviceId})`, 'success');
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : JSON.stringify(err);
            addLog(`Failed to fetch Bluetooth device info: ${msg}`, 'error');
          });
      }
    });
    
    let lastStatusTime = 0;
    const sub3 = neurosity.status().subscribe((s) => {
      setStatus(s);
      // Log status updates but throttle to avoid spam (every 5 seconds)
      if (s && Date.now() - lastStatusTime > 5000) {
        addLog(`Status update: ${s.state}, Battery: ${s.battery}%${s.charging ? ' (charging)' : ''}`, 'info');
        lastStatusTime = Date.now();
      }
    });
    
    let sub4: { unsubscribe: () => void } | null = null
    // dynamically manage metrics subscription based on active transport
    const manageMetrics = (useBt: boolean) => {
      if (!useBt) {
        if (sub4) {
          sub4.unsubscribe();
          sub4 = null;
        }
        metricsSubscribedRef.current = false;
        setPowerByBand(null);
        return;
      }
      if (metricsSubscribedRef.current) return; // already subscribed
      sub4 = neurosity.brainwaves('powerByBand').subscribe((data) => {
        setPowerByBand(data);
      });
      metricsSubscribedRef.current = true;
      addLog('Subscribed to powerByBand (Bluetooth)', 'success');
    }
    
    const sub5 = streamingState$.subscribe((s) => {
      const isBtActive = s.activeMode === STREAMING_TYPE.BLUETOOTH;
      manageMetrics(isBtActive);
    });
    
    return () => {
      sub1.unsubscribe()
      sub2.unsubscribe()
      sub3.unsubscribe()
      if (sub4) sub4.unsubscribe()
      sub5.unsubscribe()
    }
  }, [])

  const isBluetoothActive = useMemo(() => activeMode === STREAMING_TYPE.BLUETOOTH, [activeMode])

  const handleConnect = async () => {
    try {
      addLog('Initiating Bluetooth connection...', 'info');
      await connectBluetooth();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`Connection failed: ${message}`, 'error');
    }
  };

  const handleDisconnect = async () => {
    try {
      addLog('Disconnecting...', 'info');
      await disconnectAll();
      setDeviceInfo(null);
      setPowerByBand(null);
      addLog('Disconnected', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`Disconnect error: ${message}`, 'error');
    }
  };

  return (
    <div className="card" style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <h1>Neurosity Crown - Bluetooth Tester</h1>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
        <button onClick={handleConnect} disabled={connected && isBluetoothActive}>
          {connected && isBluetoothActive ? 'Bluetooth Connected' : 'Pair / Connect via Bluetooth'}
        </button>
        <button onClick={handleDisconnect} disabled={!connected && btState === BLUETOOTH_CONNECTION.DISCONNECTED}>
          Disconnect
        </button>
        <TransportBadge btState={btState} isBluetoothActive={isBluetoothActive} />
      </div>

      {/* Device Info Card */}
      {deviceInfo && (
        <div style={{ 
          marginTop: 20, 
          padding: 16, 
          border: '1px solid #ddd', 
          borderRadius: 8,
          backgroundColor: '#f9f9f9'
        }}>
          <h3 style={{ marginTop: 0 }}>Device Information</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <InfoField label="Device ID" value={deviceInfo.deviceId} />
            <InfoField label="Nickname" value={deviceInfo.deviceNickname || 'N/A'} />
            <InfoField label="Model" value={deviceInfo.model || deviceInfo.modelName || 'N/A'} />
            <InfoField label="Channels" value={deviceInfo.channels.toString()} />
            <InfoField label="Sampling Rate" value={`${deviceInfo.samplingRate}Hz`} />
            <InfoField label="OS Version" value={deviceInfo.osVersion || 'N/A'} />
            <InfoField label="API Version" value={deviceInfo.apiVersion || 'N/A'} />
            <InfoField label="Manufacturer" value={deviceInfo.manufacturer || 'N/A'} />
          </div>
        </div>
      )}

      {/* Device Status Card */}
      {status && (
        <div style={{ 
          marginTop: 20, 
          padding: 16, 
          border: '1px solid #ddd', 
          borderRadius: 8,
          backgroundColor: '#f9f9f9'
        }}>
          <h3 style={{ marginTop: 0 }}>Device Status</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <InfoField 
              label="State" 
              value={status.state} 
              highlight={status.state === 'online' ? 'success' : 'warning'}
            />
            <InfoField 
              label="Battery" 
              value={`${status.battery}%${status.charging ? ' 🔋' : ''}`}
              highlight={status.battery < 20 ? 'error' : status.battery < 50 ? 'warning' : 'success'}
            />
            <InfoField label="Charging" value={status.charging ? 'Yes' : 'No'} />
            <InfoField label="Sleep Mode" value={status.sleepMode ? 'Yes' : 'No'} />
            {status.sleepModeReason && (
              <InfoField label="Sleep Reason" value={status.sleepModeReason} />
            )}
            {status.ssid && (
              <InfoField label="Wi-Fi Network" value={status.ssid} />
            )}
            <InfoField 
              label="Last Heartbeat" 
              value={new Date(status.lastHeartbeat).toLocaleTimeString()} 
            />
          </div>
        </div>
      )}

      {!deviceInfo && !status && connected && (
        <div style={{ marginTop: 20, padding: 12, backgroundColor: '#fff3cd', borderRadius: 8 }}>
          <p>Connecting... Device information will appear shortly.</p>
        </div>
      )}

      {!connected && (
        <div style={{ marginTop: 20, padding: 12, backgroundColor: '#f8f9fa', borderRadius: 8 }}>
          <p>Not connected. Click "Pair / Connect via Bluetooth" to begin.</p>
        </div>
      )}

      {/* Logs Section */}
      <div style={{ marginTop: 20 }}>
        <h3>Connection Logs</h3>
        <div style={{ 
          maxHeight: 300, 
          overflowY: 'auto', 
          border: '1px solid #ddd', 
          borderRadius: 8,
          padding: 12,
          backgroundColor: '#f9f9f9',
          fontFamily: 'monospace',
          fontSize: 12
        }}>
          {logs.length === 0 ? (
            <p style={{ color: '#666' }}>No logs yet...</p>
          ) : (
            logs.slice().reverse().map((log, idx) => (
              <div 
                key={idx} 
                style={{ 
                  padding: '4px 0',
                  color: log.type === 'error' ? '#dc3545' : 
                         log.type === 'warn' ? '#ffc107' : 
                         log.type === 'success' ? '#28a745' : '#333'
                }}
              >
                <span style={{ opacity: 0.6 }}>[{log.timestamp.toLocaleTimeString()}]</span> {log.message}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Power By Band */}
      <div style={{ marginTop: 20 }}>
        <h3>Power By Band (Bluetooth only)</h3>
        {powerByBand ? (
          <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', padding: 12, backgroundColor: '#f9f9f9', borderRadius: 8 }}>
            {JSON.stringify(powerByBand, null, 2)}
          </pre>
        ) : (
          <p style={{ padding: 12, backgroundColor: '#f8f9fa', borderRadius: 8 }}>
            {isBluetoothActive ? 'Awaiting data…' : 'Switch to Bluetooth to view powerByBand.'}
          </p>
        )}
      </div>
    </div>
  )
}

function InfoField({ label, value, highlight }: { label: string; value: string; highlight?: 'success' | 'warning' | 'error' }) {
  const colors = {
    success: '#28a745',
    warning: '#ffc107',
    error: '#dc3545'
  };
  return (
    <div>
      <strong style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#666' }}>{label}:</strong>
      <span style={{ 
        color: highlight ? colors[highlight] : '#333',
        fontWeight: highlight ? 'bold' : 'normal'
      }}>
        {value}
      </span>
    </div>
  );
}

function TransportBadge({ btState, isBluetoothActive }: { btState: BLUETOOTH_CONNECTION; isBluetoothActive: boolean }) {
  const color = isBluetoothActive ? '#0a7' : '#999'
  const label = isBluetoothActive ? 'Bluetooth' : 'Wi‑Fi'
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      border: `1px solid ${color}`,
      color,
      padding: '6px 10px',
      borderRadius: 6
    }}>
      <strong>Transport:</strong> {label}
      <span style={{ fontSize: 12, opacity: 0.8 }}>(BT state: {btState})</span>
    </span>
  )
}

export default App
