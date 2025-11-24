import * as ping from 'ping';
import * as snmp from 'net-snmp';
import { EventEmitter } from 'events';
import { DatabaseService } from '../database/DatabaseService';
import { Device, DeviceStatus, SNMPData, PortStatus } from '@shared/types';
import { PingResponse } from '@shared/types/ping';

export class MonitoringService extends EventEmitter {
  private db: DatabaseService;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private deviceTimers: Map<number, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  constructor(database: DatabaseService) {
    super();
    this.db = database;
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startMonitoringCycle();
    this.emit('monitoring-started');
  }

  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Очищаем все таймеры
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.deviceTimers.forEach(timer => clearInterval(timer));
    this.deviceTimers.clear();

    this.emit('monitoring-stopped');
  }

  private startMonitoringCycle() {
    // Получаем все устройства и запускаем мониторинг для каждого
    const devices = this.db.getAllDevices();

    devices.forEach(device => {
      this.startDeviceMonitoring(device);
    });
  }

  private startDeviceMonitoring(device: Device) {
    if (!device.id) return;

    // Если уже есть таймер для этого устройства, очищаем его
    const existingTimer = this.deviceTimers.get(device.id);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    // Запускаем мониторинг сразу
    this.monitorDevice(device);

    // Устанавливаем интервал
    const interval = (device.monitoring_interval || 60) * 1000;
    const timer = setInterval(() => {
      if (this.isRunning) {
        this.monitorDevice(device);
      }
    }, interval);

    this.deviceTimers.set(device.id, timer);
  }

  private async monitorDevice(device: Device) {
    if (!device.id) return;

    try {
      // Пингуем устройство
      const pingResult = await this.pingDevice(device.ip);

      const status: DeviceStatus = {
        device_id: device.id,
        status: 'unknown',
        response_time: undefined,
        packet_loss: undefined
      };

      if (pingResult.alive) {
        status.status = 'online';
        status.response_time = pingResult.time !== undefined ? Math.round(pingResult.time) : 0;
        status.packet_loss = 0;

        // Если устройство онлайн и это коммутатор, пробуем получить SNMP данные
        if (device.type === 'switch' && device.snmp_community) {
          try {
            const snmpData = await this.getSNMPData(device.ip, device.snmp_community);
            this.emit('snmp-data', { device_id: device.id, data: snmpData });
          } catch (error) {
            console.error(`SNMP error for ${device.name}:`, error);
          }
        }
      } else {
        status.status = 'offline';
        status.packet_loss = 100;
      }

      // Сохраняем статус в БД
      this.db.addDeviceStatus(device.id, status);

      // Проверяем, изменился ли статус
      if (device.current_status !== status.status) {
        this.handleStatusChange(device, status.status);
      }

      // Отправляем событие обновления
      this.emit('device-status-update', {
        device_id: device.id,
        status: status.status,
        response_time: status.response_time,
        packet_loss: status.packet_loss
      });

    } catch (error) {
      console.error(`Monitoring error for ${device.name}:`, error);

      const status: DeviceStatus = {
        device_id: device.id,
        status: 'unknown',
        response_time: undefined,
        packet_loss: undefined
      };

      this.db.addDeviceStatus(device.id, status);
      this.emit('device-status-update', {
        device_id: device.id,
        status: 'unknown'
      });
    }
  }

  private handleStatusChange(device: Device, newStatus: string) {
    const message = newStatus === 'online'
      ? `Устройство ${device.name} (${device.ip}) снова в сети`
      : `Устройство ${device.name} (${device.ip}) недоступно`;

    const eventType = newStatus === 'online' ? 'info' : 'error';

    // Записываем событие
    this.db.addEventLog({
      device_id: device.id,
      event_type: eventType,
      message: message,
      details: `Статус изменен с ${device.current_status} на ${newStatus}`
    });

    // Отправляем уведомление
    this.emit('status-changed', {
      device,
      old_status: device.current_status,
      new_status: newStatus,
      message
    });
  }

  async pingDevice(ip: string): Promise<PingResponse> {
    return new Promise((resolve) => {
      ping.promise.probe(ip, {
        timeout: 5,
        extra: ['-n', '1'] // Для Windows: отправляем только 1 пакет
      }).then(result => {
        resolve(result as any);
      }).catch(error => {
        resolve({
          host: ip,
          alive: false,
          time: 0,
          min: '0',
          max: '0',
          avg: '0',
          stddev: '0',
          output: error.message
        } as PingResponse);
      });
    });
  }

  async getSNMPData(ip: string, community: string): Promise<SNMPData> {
    return new Promise((resolve, reject) => {
      const session = snmp.createSession(ip, community);
      const data: SNMPData = {};

      // OIDs для базовой информации
      const oids = [
        '1.3.6.1.2.1.1.5.0', // sysName
        '1.3.6.1.2.1.1.1.0', // sysDescr
        '1.3.6.1.2.1.1.3.0', // sysUpTime
      ];

      session.get(oids, (error: Error | null, varbinds?: any[]) => {
        if (error) {
          session.close();
          reject(error);
          return;
        }

        if (varbinds) varbinds.forEach((vb, index) => {
          if (!snmp.isVarbindError(vb)) {
            switch (index) {
              case 0:
                data.system_name = vb.value.toString();
                break;
              case 1:
                data.system_description = vb.value.toString();
                break;
              case 2:
                data.uptime = this.formatUptime(vb.value);
                break;
            }
          }
        });

        // Пытаемся получить информацию о портах
        this.getSNMPPorts(session).then(ports => {
          data.ports = ports;
          session.close();
          resolve(data);
        }).catch(() => {
          session.close();
          resolve(data);
        });
      });
    });
  }

  private getSNMPPorts(session: any): Promise<PortStatus[]> {
    return new Promise((resolve, reject) => {
      const ports: PortStatus[] = [];
      const ifTable = '1.3.6.1.2.1.2.2.1';

      // Получаем статус портов
      session.tableColumns(ifTable, [2, 5, 7, 8], (error: Error | null, table: any) => {
        if (error) {
          reject(error);
          return;
        }

        for (const index in table) {
          const entry = table[index];
          if (entry[2]) { // ifDescr
            const port: PortStatus = {
              port_number: parseInt(index),
              description: entry[2].toString(),
              status: entry[8] === 1 ? 'up' : 'down', // ifOperStatus
              speed: entry[5] ? `${entry[5] / 1000000} Mbps` : undefined
            };

            // Фильтруем только физические порты
            if (port.description && !port.description.toLowerCase().includes('vlan')) {
              ports.push(port);
            }
          }
        }

        resolve(ports);
      });
    });
  }

  private formatUptime(ticks: number): string {
    const totalSeconds = Math.floor(ticks / 100);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (days > 0) {
      return `${days}д ${hours}ч ${minutes}м`;
    } else if (hours > 0) {
      return `${hours}ч ${minutes}м`;
    } else {
      return `${minutes}м`;
    }
  }

  // Публичные методы для IPC
  async testPing(ip: string): Promise<PingResponse> {
    return this.pingDevice(ip);
  }

  async testSNMP(ip: string, community: string): Promise<SNMPData> {
    return this.getSNMPData(ip, community);
  }

  getStatus(): { isRunning: boolean, monitoredDevices: number } {
    return {
      isRunning: this.isRunning,
      monitoredDevices: this.deviceTimers.size
    };
  }

  // Методы для управления устройствами
  addDeviceToMonitoring(device: Device) {
    if (this.isRunning) {
      this.startDeviceMonitoring(device);
    }
  }

  removeDeviceFromMonitoring(deviceId: number) {
    const timer = this.deviceTimers.get(deviceId);
    if (timer) {
      clearInterval(timer);
      this.deviceTimers.delete(deviceId);
    }
  }

  updateDeviceMonitoring(device: Device) {
    if (!device.id) return;

    this.removeDeviceFromMonitoring(device.id);
    if (this.isRunning) {
      this.startDeviceMonitoring(device);
    }
  }
}