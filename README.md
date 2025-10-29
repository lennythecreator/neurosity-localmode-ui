# Neurosity Client Setup Guide

## Overview
This file configures our connection to Neurosity brain-computer interface devices. It supports **both Bluetooth and WiFi connectivity** with automatic fallback, allowing the device to switch between connection types seamlessly.

---

## What We're Doing

### 1. **Initial SDK Setup**
```typescript
export const neurosity = new Neurosity({
  autoSelectDevice: true,
  bluetoothTransport: new WebBluetoothTransport({ autoConnect: false }),
  streamingMode: STREAMING_MODE.BLUETOOTH_WITH_WIFI_FALLBACK
});
```

**Purpose:** Create the main Neurosity client instance.

**Key Configuration:**
- `autoSelectDevice: true` - Automatically picks the first available device
- `bluetoothTransport` with `autoConnect: false` - Enables Bluetooth but waits for manual connection (we control when to connect)
- `streamingMode: BLUETOOTH_WITH_WIFI_FALLBACK` - Prefers Bluetooth but falls back to WiFi if Bluetooth disconnects

---

### 2. **State Management with RxJS**

We track two key pieces of state using RxJS `BehaviorSubject` (observable values that other parts of the app can subscribe to):

#### Streaming State
```typescript
export const streamingState$ = new BehaviorSubject<StreamingState>({
  connected: false,
  activeMode: STREAMING_TYPE.WIFI,
  streamingMode: STREAMING_MODE.BLUETOOTH_WITH_WIFI_FALLBACK
});
```
Tracks overall connection status and which transport (Bluetooth/WiFi) is actively streaming data.

#### Bluetooth Connection State
```typescript
export const bluetoothConnection$ = new BehaviorSubject<BLUETOOTH_CONNECTION>(
  BLUETOOTH_CONNECTION.DISCONNECTED
);
```
Tracks specifically the Bluetooth connection status.

**Automatic Updates:**
```typescript
neurosity.streamingState().subscribe((s) => streamingState$.next(s));
neurosity.bluetooth.connection().subscribe((c) => bluetoothConnection$.next(c));
```
These lines keep our state synchronized with the SDK's internal state.

---

### 3. **Cloud Authentication (Optional)**

```typescript
async function tryCloudLoginAndSelectDevice()
```

**Purpose:** Log into Neurosity's cloud API and select a specific device.

**How It Works:**
1. Reads credentials from environment variables:
   - `VITE_NEUROSITY_EMAIL`
   - `VITE_NEUROSITY_PASSWORD`
   - `VITE_NEUROSITY_DEVICE_ID` (optional)

2. Checks if already logged in to avoid unnecessary login attempts

3. Attempts cloud login (fails gracefully if credentials missing)

4. Selects device:
   - If `VITE_NEUROSITY_DEVICE_ID` is set, finds that specific device
   - Otherwise, selects the first available device

**Note:** Cloud login is NOT required for Bluetooth-only connections, but it enables additional features like device management and cloud data sync.

---

### 4. **Connection Functions**

#### Connect to Bluetooth
```typescript
export async function connectBluetooth(): Promise<void>
```

**Steps:**
1. Initiates Bluetooth connection via Web Bluetooth API
2. Logs streaming state to confirm active transport
3. Attempts cloud login and device selection (if credentials provided)

**Important:** We avoid calling `bluetooth.getInfo()` here to prevent concurrent GATT operations (Bluetooth protocol limitation).

#### Disconnect Everything
```typescript
export async function disconnectAll(): Promise<void>
```

**Steps:**
1. Disconnects Bluetooth connection
2. Closes all other connections (WiFi/cloud)
3. Handles errors gracefully with warnings

---

## How to Replicate This Setup

### 1. **Install Dependencies**
```bash
npm install @neurosity/sdk rxjs
```

### 2. **Environment Variables**
Create a `.env` file (optional, for cloud features):
```
VITE_NEUROSITY_EMAIL=your-email@example.com
VITE_NEUROSITY_PASSWORD=your-password
VITE_NEUROSITY_DEVICE_ID=your-device-id
```

### 3. **Import and Use**
```typescript
import { 
  neurosity, 
  connectBluetooth, 
  disconnectAll, 
  streamingState$, 
  bluetoothConnection$ 
} from './neurosityClient';

// Connect
await connectBluetooth();

// Monitor connection state
streamingState$.subscribe((state) => {
  console.log('Connected:', state.connected);
  console.log('Using:', state.activeMode); // BLUETOOTH or WIFI
});

// Disconnect when done
await disconnectAll();
```

---

## Key Concepts

**BehaviorSubject vs Regular Observable:**
- `BehaviorSubject` always has a current value you can access immediately
- Perfect for state that UI components need to read synchronously

**Bluetooth with WiFi Fallback:**
- Provides reliability - if Bluetooth disconnects, WiFi takes over automatically
- Users get uninterrupted data streaming

**Graceful Error Handling:**
- All connection attempts wrapped in try-catch
- Logs warnings instead of throwing errors for non-critical failures
- App continues working even if optional features (like cloud login) fail

---

## Common Issues & Solutions

**Issue:** Bluetooth won't connect
- **Solution:** Ensure user gesture triggered the connection (browser security requirement)
- **Solution:** Check that device is powered on and in range

**Issue:** Cloud login fails
- **Solution:** Verify environment variables are set correctly
- **Solution:** Connection works without cloud login for basic Bluetooth streaming

**Issue:** State not updating in UI
- **Solution:** Make sure you're subscribed to `streamingState$` or `bluetoothConnection$`
- **Solution:** Unsubscribe when component unmounts to prevent memory leaks