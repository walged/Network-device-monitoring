export interface PingResponse {
  alive: boolean;
  time?: number;
  times?: number[];
  min?: string;
  max?: string;
  avg?: string;
  stddev?: string;
  host?: string;
  output?: string;
  packetLoss?: string;
}