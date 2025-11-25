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

export const VENDOR_CONFIGS: Record<string, VendorConfig> = {
  tfortis: {
    vendor: 'tfortis',
    default_community: 'public',
    special_features: ['poe_monitoring', 'temperature_monitoring']
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