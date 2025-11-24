import * as snmp from 'net-snmp';

export interface SNMPResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface PortInfo {
  portNumber: number;
  status: 'up' | 'down' | 'unknown';
  speed?: number;
  description?: string;
  rxPackets?: number;
  txPackets?: number;
  errors?: number;
}

// Common SNMP OIDs
const OIDS = {
  // System info
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysObjectID: '1.3.6.1.2.1.1.2.0',
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  sysName: '1.3.6.1.2.1.1.5.0',
  sysLocation: '1.3.6.1.2.1.1.6.0',

  // Interface info
  ifNumber: '1.3.6.1.2.1.2.1.0', // Number of interfaces
  ifDescr: '1.3.6.1.2.1.2.2.1.2', // Interface description
  ifSpeed: '1.3.6.1.2.1.2.2.1.5', // Interface speed
  ifOperStatus: '1.3.6.1.2.1.2.2.1.8', // Operational status
  ifInOctets: '1.3.6.1.2.1.2.2.1.10', // Incoming traffic
  ifOutOctets: '1.3.6.1.2.1.2.2.1.16', // Outgoing traffic
  ifInErrors: '1.3.6.1.2.1.2.2.1.14', // Input errors
  ifOutErrors: '1.3.6.1.2.1.2.2.1.20', // Output errors
};

export class SNMPService {
  private static instance: SNMPService;

  private constructor() {}

  public static getInstance(): SNMPService {
    if (!SNMPService.instance) {
      SNMPService.instance = new SNMPService();
    }
    return SNMPService.instance;
  }

  /**
   * Get system information via SNMP
   */
  public async getSystemInfo(
    host: string,
    community: string = 'public',
    version: 0 | 1 = 1
  ): Promise<SNMPResult> {
    return new Promise((resolve) => {
      const session = snmp.createSession(host, community, {
        version: version as 0 | 1,
        timeout: 5000,
      });

      const oids = [
        OIDS.sysDescr,
        OIDS.sysName,
        OIDS.sysLocation,
        OIDS.sysUpTime,
      ];

      session.get(oids, (error, varbinds) => {
        session.close();

        if (error) {
          console.error('SNMP error:', error);
          resolve({
            success: false,
            error: error.message,
          });
          return;
        }

        const result: any = {};
        if (!varbinds) {
          resolve({ success: false, error: 'No varbinds returned' });
          return;
        }
        for (const varbind of varbinds) {
          if (snmp.isVarbindError(varbind)) {
            console.error('Varbind error:', snmp.varbindError(varbind));
            continue;
          }

          switch (varbind.oid) {
            case OIDS.sysDescr:
              result.description = (varbind.value || "").toString();
              break;
            case OIDS.sysName:
              result.name = (varbind.value || "").toString();
              break;
            case OIDS.sysLocation:
              result.location = (varbind.value || "").toString();
              break;
            case OIDS.sysUpTime:
              result.uptime = this.formatUptime((varbind.value || 0) as number);
              break;
          }
        }

        resolve({
          success: true,
          data: result,
        });
      });
    });
  }

  /**
   * Get port/interface information
   */
  public async getPortInfo(
    host: string,
    community: string = 'public',
    version: 0 | 1 = 1
  ): Promise<SNMPResult> {
    return new Promise((resolve) => {
      const session = snmp.createSession(host, community, {
        version: version as 0 | 1,
        timeout: 5000,
      });

      const ports: PortInfo[] = [];

      // Get number of interfaces first
      session.get([OIDS.ifNumber], (error, varbinds) => {
        if (error) {
          session.close();
          resolve({
            success: false,
            error: error.message,
          });
          return;
        }

        const numInterfaces = (varbinds && varbinds[0]?.value as number) || 0;

        if (numInterfaces === 0) {
          session.close();
          resolve({
            success: true,
            data: { ports: [] },
          });
          return;
        }

        // Get info for each interface
        const oids: string[] = [];
        for (let i = 1; i <= Math.min(numInterfaces, 48); i++) {
          oids.push(`${OIDS.ifDescr}.${i}`);
          oids.push(`${OIDS.ifOperStatus}.${i}`);
          oids.push(`${OIDS.ifSpeed}.${i}`);
        }

        session.get(oids, (error, varbinds) => {
          session.close();

          if (error) {
            resolve({
              success: false,
              error: error.message,
            });
            return;
          }

          // Parse the results
          const interfaceData: { [key: number]: PortInfo } = {};

          if (!varbinds) {
            resolve({ success: false, error: 'No varbinds returned' });
            return;
          }
          for (const varbind of varbinds) {
            if (snmp.isVarbindError(varbind)) continue;

            const oidParts = varbind.oid.split('.');
            const ifIndex = parseInt(oidParts[oidParts.length - 1]);

            if (!interfaceData[ifIndex]) {
              interfaceData[ifIndex] = {
                portNumber: ifIndex,
                status: 'unknown',
              };
            }

            if (varbind.oid.startsWith(OIDS.ifDescr)) {
              interfaceData[ifIndex].description = (varbind.value || "").toString();
            } else if (varbind.oid.startsWith(OIDS.ifOperStatus)) {
              const status = (varbind.value || 0) as number;
              interfaceData[ifIndex].status = status === 1 ? 'up' : status === 2 ? 'down' : 'unknown';
            } else if (varbind.oid.startsWith(OIDS.ifSpeed)) {
              interfaceData[ifIndex].speed = (varbind.value || 0) as number;
            }
          }

          const portList = Object.values(interfaceData);

          resolve({
            success: true,
            data: {
              ports: portList,
              totalPorts: numInterfaces,
              activePorts: portList.filter(p => p.status === 'up').length,
            },
          });
        });
      });
    });
  }

  /**
   * Get traffic statistics for a specific port
   */
  public async getPortStatistics(
    host: string,
    portNumber: number,
    community: string = 'public',
    version: 0 | 1 = 1
  ): Promise<SNMPResult> {
    return new Promise((resolve) => {
      const session = snmp.createSession(host, community, {
        version: version as 0 | 1,
        timeout: 5000,
      });

      const oids = [
        `${OIDS.ifInOctets}.${portNumber}`,
        `${OIDS.ifOutOctets}.${portNumber}`,
        `${OIDS.ifInErrors}.${portNumber}`,
        `${OIDS.ifOutErrors}.${portNumber}`,
      ];

      session.get(oids, (error, varbinds) => {
        session.close();

        if (error) {
          resolve({
            success: false,
            error: error.message,
          });
          return;
        }

        const stats: any = {
          portNumber,
        };

        if (!varbinds) {
          resolve({ success: false, error: 'No varbinds returned' });
          return;
        }
        for (const varbind of varbinds) {
          if (snmp.isVarbindError(varbind)) continue;

          if (varbind.oid.includes(OIDS.ifInOctets)) {
            stats.rxBytes = varbind.value;
          } else if (varbind.oid.includes(OIDS.ifOutOctets)) {
            stats.txBytes = varbind.value;
          } else if (varbind.oid.includes(OIDS.ifInErrors)) {
            stats.rxErrors = varbind.value;
          } else if (varbind.oid.includes(OIDS.ifOutErrors)) {
            stats.txErrors = varbind.value;
          }
        }

        resolve({
          success: true,
          data: stats,
        });
      });
    });
  }

  /**
   * Format uptime from ticks to readable format
   */
  private formatUptime(ticks: number): string {
    const totalSeconds = Math.floor(ticks / 100);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}д`);
    if (hours > 0) parts.push(`${hours}ч`);
    if (minutes > 0) parts.push(`${minutes}м`);
    if (seconds > 0) parts.push(`${seconds}с`);

    return parts.join(' ') || '0с';
  }

  /**
   * Test SNMP connectivity
   */
  public async testConnection(
    host: string,
    community: string = 'public',
    version: 0 | 1 = 1
  ): Promise<boolean> {
    const result = await this.getSystemInfo(host, community, version);
    return result.success;
  }
}