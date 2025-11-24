import { Client } from 'ssh2';

export interface SSHConnectionOptions {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  timeout?: number;
}

export interface SSHResult {
  success: boolean;
  connected?: boolean;
  output?: string;
  error?: string;
  deviceInfo?: {
    hostname?: string;
    version?: string;
    uptime?: string;
    model?: string;
  };
}

export class SSHService {
  private static instance: SSHService;

  private constructor() {}

  public static getInstance(): SSHService {
    if (!SSHService.instance) {
      SSHService.instance = new SSHService();
    }
    return SSHService.instance;
  }

  /**
   * Test SSH connectivity to a device
   */
  public async testConnection(options: SSHConnectionOptions): Promise<SSHResult> {
    return new Promise((resolve) => {
      const conn = new Client();
      const timeout = options.timeout || 10000;

      const timer = setTimeout(() => {
        conn.end();
        resolve({
          success: false,
          connected: false,
          error: 'Connection timeout',
        });
      }, timeout);

      conn
        .on('ready', () => {
          clearTimeout(timer);
          conn.end();
          resolve({
            success: true,
            connected: true,
          });
        })
        .on('error', (err) => {
          clearTimeout(timer);
          resolve({
            success: false,
            connected: false,
            error: err.message,
          });
        })
        .connect({
          host: options.host,
          port: options.port || 22,
          username: options.username,
          password: options.password,
          privateKey: options.privateKey,
          readyTimeout: timeout,
        });
    });
  }

  /**
   * Execute a command on the device
   */
  public async executeCommand(
    options: SSHConnectionOptions,
    command: string
  ): Promise<SSHResult> {
    return new Promise((resolve) => {
      const conn = new Client();
      const timeout = options.timeout || 10000;

      const timer = setTimeout(() => {
        conn.end();
        resolve({
          success: false,
          error: 'Connection timeout',
        });
      }, timeout);

      conn
        .on('ready', () => {
          clearTimeout(timer);
          conn.exec(command, (err, stream) => {
            if (err) {
              conn.end();
              resolve({
                success: false,
                error: err.message,
              });
              return;
            }

            let output = '';
            let errorOutput = '';

            stream
              .on('close', () => {
                conn.end();
                resolve({
                  success: !errorOutput,
                  output: output || errorOutput,
                  error: errorOutput ? 'Command failed' : undefined,
                });
              })
              .on('data', (data: Buffer) => {
                output += data.toString();
              })
              .stderr.on('data', (data: Buffer) => {
                errorOutput += data.toString();
              });
          });
        })
        .on('error', (err) => {
          clearTimeout(timer);
          resolve({
            success: false,
            error: err.message,
          });
        })
        .connect({
          host: options.host,
          port: options.port || 22,
          username: options.username,
          password: options.password,
          privateKey: options.privateKey,
          readyTimeout: timeout,
        });
    });
  }

  /**
   * Get device information via SSH
   */
  public async getDeviceInfo(options: SSHConnectionOptions): Promise<SSHResult> {
    const commands = {
      // Common commands for different vendors
      cisco: 'show version',
      tplink: 'show system-info',
      generic: 'hostname && uptime',
      linux: 'hostname && uptime && cat /proc/version',
    };

    // Try to detect vendor-specific command or use generic
    let command = commands.generic;

    const result = await this.executeCommand(options, command);

    if (result.success && result.output) {
      const deviceInfo = this.parseDeviceInfo(result.output);
      return {
        ...result,
        deviceInfo,
      };
    }

    return result;
  }

  /**
   * Parse device information from command output
   */
  private parseDeviceInfo(output: string): any {
    const info: any = {};

    // Try to extract hostname
    const hostnameMatch = output.match(/hostname[:\s]+(\S+)/i);
    if (hostnameMatch) {
      info.hostname = hostnameMatch[1];
    }

    // Try to extract uptime
    const uptimeMatch = output.match(/uptime[:\s]+(.+?)(?:\n|$)/i);
    if (uptimeMatch) {
      info.uptime = uptimeMatch[1].trim();
    } else if (output.includes('load average')) {
      // Linux uptime format
      const linuxUptimeMatch = output.match(/up\s+(.+?),\s+\d+\s+user/);
      if (linuxUptimeMatch) {
        info.uptime = linuxUptimeMatch[1];
      }
    }

    // Try to extract version
    const versionMatch = output.match(/version[:\s]+(.+?)(?:\n|$)/i);
    if (versionMatch) {
      info.version = versionMatch[1].trim();
    }

    // Try to extract model
    const modelMatch = output.match(/model[:\s]+(.+?)(?:\n|$)/i);
    if (modelMatch) {
      info.model = modelMatch[1].trim();
    }

    return info;
  }

  /**
   * Check if port 22 is open (quick connectivity test)
   */
  public async checkPort(host: string, port: number = 22): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();

      socket.setTimeout(3000);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        resolve(false);
      });

      socket.connect(port, host);
    });
  }
}