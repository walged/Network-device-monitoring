import * as notifier from 'node-notifier';
import * as path from 'path';

export interface NotificationOptions {
  title: string;
  message: string;
  icon?: string;
  sound?: boolean;
  wait?: boolean;
  actions?: string[];
}

export class NotificationService {
  private static instance: NotificationService;
  private enabled: boolean = true;
  private soundEnabled: boolean = true;
  private iconPath: string;

  private constructor() {
    // Set default icon path
    this.iconPath = path.join(__dirname, '..', '..', '..', 'assets', 'icons', 'icon.png');
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Show a notification
   */
  public show(options: NotificationOptions): void {
    if (!this.enabled) {
      return;
    }

    const notificationOptions: notifier.Notification = {
      title: options.title,
      message: options.message,
      icon: options.icon || this.iconPath,
      wait: options.wait || false,
    };

    // Add sound option (not part of base Notification type but supported by notifier)
    (notificationOptions as any).sound = options.sound !== undefined ? options.sound : this.soundEnabled;
    (notificationOptions as any).appID = 'Network Monitor';

    // Add Windows-specific options
    if (process.platform === 'win32') {
      (notificationOptions as any).windowsToaster = true;
      (notificationOptions as any).actions = options.actions;
    }

    notifier.notify(notificationOptions, (err, response) => {
      if (err) {
        console.error('Notification error:', err);
      }
    });
  }

  /**
   * Show device offline notification
   */
  public showDeviceOffline(deviceName: string, deviceIp: string): void {
    this.show({
      title: '⚠️ Устройство недоступно',
      message: `${deviceName} (${deviceIp}) не отвечает`,
      // wait: true,
    });
  }

  /**
   * Show device online notification
   */
  public showDeviceOnline(deviceName: string, deviceIp: string): void {
    this.show({
      title: '✅ Устройство в сети',
      message: `${deviceName} (${deviceIp}) снова доступно`,
      sound: false,
    });
  }

  /**
   * Show critical error notification
   */
  public showCriticalError(title: string, message: string): void {
    this.show({
      title: `🔴 ${title}`,
      message: message,
      // wait: true,
    });
  }

  /**
   * Show warning notification
   */
  public showWarning(title: string, message: string): void {
    this.show({
      title: `⚠️ ${title}`,
      message: message,
    });
  }

  /**
   * Show info notification
   */
  public showInfo(title: string, message: string): void {
    this.show({
      title: `ℹ️ ${title}`,
      message: message,
      sound: false,
    });
  }

  /**
   * Show success notification
   */
  public showSuccess(title: string, message: string): void {
    this.show({
      title: `✅ ${title}`,
      message: message,
      sound: false,
    });
  }

  /**
   * Enable/disable notifications
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Enable/disable notification sounds
   */
  public setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
  }

  /**
   * Check if notifications are supported
   */
  public isSupported(): boolean {
    return notifier.notify !== undefined;
  }

  /**
   * Get notification status
   */
  public getStatus(): { enabled: boolean; soundEnabled: boolean; supported: boolean } {
    return {
      enabled: this.enabled,
      soundEnabled: this.soundEnabled,
      supported: this.isSupported(),
    };
  }
}