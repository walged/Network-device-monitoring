import * as ping from 'ping';

export interface PingResult {
  alive: boolean;
  time: number | undefined;
  host: string;
  output?: string;
  error?: string;
}

export class PingService {
  private static instance: PingService;

  private constructor() {}

  public static getInstance(): PingService {
    if (!PingService.instance) {
      PingService.instance = new PingService();
    }
    return PingService.instance;
  }

  public async ping(host: string): Promise<PingResult> {
    try {
      const result = await ping.promise.probe(host, {
        timeout: 5,
        extra: ['-n', '1'], // Windows: отправить только 1 пакет
      });

      return {
        alive: result.alive,
        time: result.alive ? Math.round(parseFloat(String(result.avg)) || 0) : undefined,
        host: result.host,
        output: result.output
      };
    } catch (error) {
      console.error(`Ping error for ${host}:`, error);
      return {
        alive: false,
        time: undefined,
        host: host,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  public async pingMultiple(hosts: string[]): Promise<Map<string, PingResult>> {
    const results = new Map<string, PingResult>();

    // Выполняем пинг параллельно для всех хостов
    const promises = hosts.map(async (host) => {
      const result = await this.ping(host);
      results.set(host, result);
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Непрерывный мониторинг хоста
   */
  public async monitor(
    host: string,
    interval: number = 60000,
    callback: (result: PingResult) => void
  ): Promise<() => void> {
    let isRunning = true;

    const runPing = async () => {
      while (isRunning) {
        const result = await this.ping(host);
        callback(result);

        if (isRunning) {
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      }
    };

    // Запускаем мониторинг
    runPing();

    // Возвращаем функцию для остановки мониторинга
    return () => {
      isRunning = false;
    };
  }
}