import { Neurosity, WebBluetoothTransport, STREAMING_MODE, STREAMING_TYPE, BLUETOOTH_CONNECTION } from "@neurosity/sdk";
import { BehaviorSubject } from "rxjs";

export const neurosity = new Neurosity({
  autoSelectDevice: true,
  bluetoothTransport: new WebBluetoothTransport({ autoConnect: false }),
  streamingMode: STREAMING_MODE.BLUETOOTH_WITH_WIFI_FALLBACK
});

export type StreamingState = {
  connected: boolean;
  activeMode: STREAMING_TYPE;
  streamingMode: STREAMING_MODE;
};

export const streamingState$ = new BehaviorSubject<StreamingState>({
  connected: false,
  activeMode: STREAMING_TYPE.WIFI,
  streamingMode: STREAMING_MODE.BLUETOOTH_WITH_WIFI_FALLBACK
});

export const bluetoothConnection$ = new BehaviorSubject<BLUETOOTH_CONNECTION>(BLUETOOTH_CONNECTION.DISCONNECTED);

neurosity.streamingState().subscribe((s) => streamingState$.next(s));
neurosity.bluetooth.connection().subscribe((c) => bluetoothConnection$.next(c));

async function tryCloudLoginAndSelectDevice() {
  const email = import.meta.env.VITE_NEUROSITY_EMAIL as string | undefined;
  const password = import.meta.env.VITE_NEUROSITY_PASSWORD as string | undefined;
  const deviceId = import.meta.env.VITE_NEUROSITY_DEVICE_ID as string | undefined;
  if (!email || !password) {
    console.warn('[Neurosity] Cloud login skipped: VITE_NEUROSITY_EMAIL/PASSWORD not set');
    return;
  }
  // check if already logged in
  const alreadyLoggedIn = await new Promise<boolean>((resolve) => {
    const sub = neurosity.onAuthStateChanged().subscribe((user) => {
      sub.unsubscribe();
      resolve(!!user);
    });
  });
  if (alreadyLoggedIn) {
    console.log('[Neurosity] Already logged in; skipping login');
  } else {
  try {
    await neurosity.login({ email, password });
    console.log('[Neurosity] Logged in to cloud API');
  } catch (err) {
    console.warn('[Neurosity] Cloud login failed:', err);
  }
  }
  // Try to select device if possible
  try {
    if (deviceId) {
      await neurosity.selectDevice((devices) => {
        const match = devices.find((d) => d.deviceId === deviceId);
        return match ?? devices[0];
      });
      console.log('[Neurosity] Device selected by ID:', deviceId);
    } else {
      await neurosity.selectDevice((devices) => devices[0]);
      console.log('[Neurosity] Device auto-selected (first in list)');
    }
  } catch (err) {
    console.warn('[Neurosity] Device selection failed (possibly offline):', err);
  }
}

export async function connectBluetooth(): Promise<void> {
  console.log('[Neurosity] Starting Bluetooth connection...');
  try {
    await neurosity.bluetooth.connect();
    console.log('[Neurosity] Bluetooth connection successful!');
    
    // Log current streaming state to confirm transport
    const stateSub = neurosity.streamingState().subscribe((state) => {
      console.log('[Neurosity] Streaming state (activeMode:', state.activeMode, ', connected:', state.connected, ')');
      stateSub.unsubscribe();
    });
    
    // Try to login and select device (if env provided)
    await tryCloudLoginAndSelectDevice();

    // Do not call bluetooth.getInfo() here to avoid concurrent GATT ops.
  } catch (error) {
    console.error('[Neurosity] Bluetooth connection failed:', error);
    throw error;
  }
}

export async function disconnectAll(): Promise<void> {
  console.log('[Neurosity] Disconnecting...');
  try {
    await neurosity.bluetooth.disconnect();
    console.log('[Neurosity] Bluetooth disconnected');
  } catch (err) {
    console.warn('[Neurosity] Bluetooth disconnect error:', err);
  }
  try {
    await neurosity.disconnect();
    console.log('[Neurosity] All connections closed');
  } catch (err) {
    console.warn('[Neurosity] Disconnect error:', err);
  }
}


