# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Network Monitor - Electron desktop application for monitoring network devices (switches, routers, cameras, servers). Supports vendors: TFortis, TP-Link, LTV, Netgear, Cisco. Russian UI language.

**Stack:** Electron 33 + React 19 + TypeScript 5.3 + Ant Design 6 + SQLite (better-sqlite3)

## Build Commands

```bash
npm run dev              # Development (webpack + electron)
npm run dev:react        # React dev server only (localhost:3000)
npm run build            # Webpack production build
npm run dist:portable    # Create portable exe (no install)
npm run dist:win         # Create Windows installer (NSIS)
```

## Architecture

### Two-Process Model (Electron)

```
Main Process (Node.js)          Renderer Process (Chromium)
├── Database (SQLite)           ├── React UI
├── Monitoring services         ├── useElectronAPI hook
├── IPC handlers                └── Preload bridge (contextBridge)
└── System notifications
```

### Key Directories

- `src/main/` - Main process (Node.js)
  - `index.ts` - Entry point, window creation
  - `preload.ts` - Context bridge for secure IPC
  - `database/DatabaseService.ts` - SQLite operations
  - `monitoring/MonitoringService.ts` - Device polling
  - `services/` - ping, snmp, ssh, notification services
  - `ipc/handlers.ts` - IPC handler registration
- `src/renderer/` - Renderer process (React)
  - `hooks/useElectronAPI.ts` - API wrapper (supports localStorage fallback for browser testing)
  - `pages/` - Dashboard, DeviceList, EventLog, Settings
- `src/shared/types/` - TypeScript interfaces
- `dist/` - Webpack build output
- `release/` - Electron-builder exe output

### IPC Communication

All IPC channels follow pattern: `category:action`

```
db:getDevices, db:addDevice, db:updateDevice, db:deleteDevice
db:getDeviceHistory, db:getEvents, db:getHistory
monitoring:start, monitoring:stop, monitoring:ping, monitoring:snmp
settings:get, settings:set, settings:getAll
```

**Preload bridge (`preload.ts`):** Must add new channels to `validChannels` array for them to work.

### Database

SQLite at `app.getPath('userData')/network-monitor.db`

Key tables: `devices`, `device_status`, `event_logs`, `settings`

### Monitoring Flow

```
MonitoringService.start()
  └─ For each device (every 60s):
      ├─ PingService.ping(ip)
      ├─ If online + switch: SNMPService.getSystemInfo()
      ├─ DatabaseService.addDeviceStatus()
      └─ Emit events to renderer via IPC
```

## Key Patterns

- **Singleton:** PingService, SNMPService, NotificationService
- **EventEmitter:** MonitoringService for status updates
- **Context Isolation:** Preload bridge controls renderer API access
- **Dual-mode hook:** useElectronAPI works in Electron (IPC) and browser (localStorage mock)

## Configuration Files

- `webpack.prod.config.js` - Webpack bundling (entry: src/renderer/index.tsx)
- `electron-builder.json` - App packaging (appId: com.networkmonitor.app)
- `tsconfig.json` - TypeScript (paths: @main/*, @renderer/*, @shared/*)
- `electron-prod.js` - Production Electron entry (CommonJS)

## Type Definitions

Key interfaces in `src/shared/types/index.ts`:
- `Device` - Monitored device with SNMP/SSH config
- `DeviceStatus` - Status snapshot (online/offline, response_time)
- `EventLog` - Application events (info/warning/error/critical)
- `SNMPData` - SNMP query results
