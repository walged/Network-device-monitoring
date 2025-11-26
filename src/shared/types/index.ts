export interface Device {
  id?: number;
  name: string;
  ip: string;
  type: 'switch' | 'router' | 'camera' | 'server' | 'other';
  vendor?: string;
  model?: string;
  location?: string;
  port_count?: number;
  parent_device_id?: number;  // ID коммутатора, к которому подключена камера
  port_number?: number;       // Номер порта на коммутаторе
  snmp_community?: string;
  snmp_version?: string;
  ssh_username?: string;
  ssh_password?: string;
  monitoring_interval?: number;
  current_status?: 'online' | 'offline' | 'warning' | 'unknown';
  last_response_time?: number;
  created_at?: string;
  updated_at?: string;
  // Поля для камер
  camera_login?: string;      // Логин для доступа к камере
  camera_password?: string;   // Пароль для доступа к камере
  stream_url?: string;        // URL потока (формируется автоматически или вручную)
  stream_type?: 'http' | 'rtsp' | 'onvif'; // Тип потока (http по умолчанию)
  // Координаты на визуальной карте
  map_x?: number;
  map_y?: number;
  floor_map_id?: number;
  // Вычисляемые поля для отображения
  parent_device_name?: string; // Имя родительского коммутатора
  connected_cameras_count?: number; // Количество подключенных камер (для коммутаторов)
}

export interface Camera {
  id?: number;
  name: string;
  ip: string;
  device_id?: number;
  port_number?: number;
  type?: string;
  location?: string;
  status?: 'online' | 'offline' | 'unknown';
  created_at?: string;
}

export interface DeviceStatus {
  id?: number;
  device_id: number;
  status: 'online' | 'offline' | 'warning' | 'unknown';
  response_time?: number;
  packet_loss?: number;
  timestamp?: string;
}

export interface EventLog {
  id?: number;
  device_id?: number;
  device_name?: string;
  device_ip?: string;
  event_type: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  details?: string;
  timestamp?: string;
}

export interface PortStatus {
  port_number: number;
  status: 'up' | 'down' | 'unknown';
  speed?: string;
  description?: string;
  traffic_in?: number;
  traffic_out?: number;
  errors?: number;
  connected_device?: string;
}

export interface SNMPData {
  system_name?: string;
  system_description?: string;
  uptime?: string;
  ports?: PortStatus[];
  cpu_usage?: number;
  memory_usage?: number;
  temperature?: number;
}

export interface MonitoringConfig {
  interval: number;
  timeout: number;
  retry_count: number;
  alert_threshold: number;
  notification_enabled: boolean;
  sound_enabled: boolean;
}

export interface NotificationSettings {
  enabled: boolean;
  sound_enabled: boolean;
  critical_only: boolean;
  email_notifications?: boolean;
  email_address?: string;
}

export interface CredentialTemplate {
  id?: number;
  name: string;
  login: string;
  password: string;
  created_at?: string;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  language: 'ru' | 'en';
  auto_start: boolean;
  minimize_to_tray: boolean;
  monitoring_config: MonitoringConfig;
  notifications: NotificationSettings;
}

export interface DashboardStats {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  warning_devices: number;
  total_cameras: number;
  online_cameras: number;
  recent_events: EventLog[];
  uptime_percentage: number;
}

// Типы для IPC коммуникации
export interface IPCResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Vendor-специфичные конфигурации
export interface VendorConfig {
  vendor: 'tfortis' | 'tplink' | 'ltv' | 'netgear' | 'cisco' | 'generic';
  default_community: string;
  default_oids?: Record<string, string>;
  port_mapping?: Record<number, string>;
  special_features?: string[];
}

// TFortis Model Configuration - определяет возможности каждой модели
export interface TFortisModelConfig {
  model: string;
  name: string;
  ports: number;
  poeSupport: boolean;
  snmpGetStatus: boolean;  // Поддержка чтения статуса PoE через SNMP GET
  snmpSetPoe: boolean;     // Поддержка управления PoE через SNMP SET
  snmpVersion: '1' | '2c';
  mibVersion: 'v1.3' | 'v2.3'; // Какой MIB файл использовать
  description: string;
}

// OID-ы для разных версий MIB
export const TFORTIS_OIDS = {
  // MIB v2.3 (PSW-2G8F+, PSW-2G6F+, etc.) - полная поддержка SNMP
  v23: {
    poeControl: '1.3.6.1.4.1.42019.3.2.1.3.1.1.2',   // SET: enabled(1), disabled(2)
    poeStatus: '1.3.6.1.4.1.42019.3.2.2.5.1.1.2',    // GET: up(1), down(2)
    poePower: '1.3.6.1.4.1.42019.3.2.2.5.1.1.3',     // GET: power in mW
  },
  // MIB v1.3 (PSW-2G, PSW-2G4F) - только SET (OID другой структуры!)
  v13: {
    // Порты FE1-FE3 (1-3), GE1-GE2 (4-5)
    poeControl: {
      1: '1.3.6.1.4.1.42019.3.2.1.2.0.1.4', // FE1
      2: '1.3.6.1.4.1.42019.3.2.1.2.0.2.4', // FE2
      3: '1.3.6.1.4.1.42019.3.2.1.2.0.3.4', // FE3
      4: '1.3.6.1.4.1.42019.3.2.1.2.0.4.4', // GE1
      5: '1.3.6.1.4.1.42019.3.2.1.2.0.5.4', // GE2
    } as Record<number, string>,
  },
};

// Все модели TFortis с их возможностями
export const TFORTIS_MODELS: TFortisModelConfig[] = [
  // Старые модели (MIB v1.3) - только TRAP + SET, нет GET статуса
  {
    model: 'PSW-2G',
    name: 'PSW-2G',
    ports: 5,  // 3 FE + 2 GE
    poeSupport: true,
    snmpGetStatus: false,
    snmpSetPoe: true,
    snmpVersion: '1',
    mibVersion: 'v1.3',
    description: 'Базовая модель 5 портов (3 FE PoE + 2 GE)'
  },
  {
    model: 'PSW-2G4F',
    name: 'PSW-2G4F',
    ports: 6,  // 4 FE + 2 GE/SFP
    poeSupport: true,
    snmpGetStatus: false,
    snmpSetPoe: true,
    snmpVersion: '1',
    mibVersion: 'v1.3',
    description: '6 портов (4 FE PoE + 2 GE/SFP)'
  },
  {
    model: 'PSW-2G4F-Box',
    name: 'PSW-2G4F-Box',
    ports: 6,
    poeSupport: true,
    snmpGetStatus: false,
    snmpSetPoe: true,
    snmpVersion: '1',
    mibVersion: 'v1.3',
    description: '6 портов в уличном исполнении'
  },
  // Новые модели (MIB v2.3) - полная поддержка SNMP GET/SET
  {
    model: 'PSW-2G+',
    name: 'PSW-2G+',
    ports: 6,
    poeSupport: true,
    snmpGetStatus: true,
    snmpSetPoe: true,
    snmpVersion: '2c',
    mibVersion: 'v2.3',
    description: '6 портов с расширенным SNMP'
  },
  {
    model: 'PSW-2G6F+',
    name: 'PSW-2G6F+',
    ports: 8,  // 6 FE + 2 GE/SFP
    poeSupport: true,
    snmpGetStatus: true,
    snmpSetPoe: true,
    snmpVersion: '2c',
    mibVersion: 'v2.3',
    description: '8 портов (6 FE PoE + 2 GE/SFP)'
  },
  {
    model: 'PSW-2G8F+',
    name: 'PSW-2G8F+',
    ports: 10,  // 8 FE + 2 GE/SFP
    poeSupport: true,
    snmpGetStatus: true,
    snmpSetPoe: true,
    snmpVersion: '2c',
    mibVersion: 'v2.3',
    description: '10 портов (8 FE PoE + 2 GE/SFP)'
  },
  {
    model: 'PSW-2G+UPS',
    name: 'PSW-2G+UPS',
    ports: 6,
    poeSupport: true,
    snmpGetStatus: true,
    snmpSetPoe: true,
    snmpVersion: '2c',
    mibVersion: 'v2.3',
    description: '6 портов с UPS модулем'
  },
  {
    model: 'PSW-2G8F+UPS',
    name: 'PSW-2G8F+UPS',
    ports: 10,
    poeSupport: true,
    snmpGetStatus: true,
    snmpSetPoe: true,
    snmpVersion: '2c',
    mibVersion: 'v2.3',
    description: '10 портов с UPS модулем'
  },
  // Прочие/неизвестные модели
  {
    model: 'other',
    name: 'Другая модель',
    ports: 8,
    poeSupport: true,
    snmpGetStatus: false,  // По умолчанию считаем что нет
    snmpSetPoe: true,
    snmpVersion: '2c',
    mibVersion: 'v2.3',
    description: 'Другая модель TFortis'
  },
];

// Получить конфигурацию модели TFortis
export function getTFortisModelConfig(model?: string): TFortisModelConfig | undefined {
  if (!model) return undefined;
  return TFORTIS_MODELS.find(m => m.model.toLowerCase() === model.toLowerCase());
}

export const VENDOR_CONFIGS: Record<string, VendorConfig> = {
  tfortis: {
    vendor: 'tfortis',
    default_community: 'public',
    special_features: ['poe_monitoring', 'temperature_monitoring', 'poe_control']
  },
  tplink: {
    vendor: 'tplink',
    default_community: 'public',
    special_features: ['vlan_support', 'qos']
  },
  ltv: {
    vendor: 'ltv',
    default_community: 'public',
    special_features: ['camera_integration']
  },
  netgear: {
    vendor: 'netgear',
    default_community: 'public',
    special_features: ['advanced_vlan', 'stacking']
  },
  cisco: {
    vendor: 'cisco',
    default_community: 'public',
    special_features: ['advanced_routing', 'vlan_trunking', 'spanning_tree']
  },
  generic: {
    vendor: 'generic',
    default_community: 'public'
  }
};