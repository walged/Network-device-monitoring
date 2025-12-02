import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Empty, Spin } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  WifiOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { Device } from '@shared/types';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

export const Dashboard: React.FC = () => {
  const { api } = useElectronAPI();
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<Device[]>([]);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    online: 0,
    offline: 0,
    warning: 0,
    unknown: 0,
    uptime: 0,
  });

  useEffect(() => {
    loadDashboardData();

    if (api) {
      api.on('device-status-changed', handleDeviceStatusChange);

      return () => {
        api.removeListener('device-status-changed', handleDeviceStatusChange);
      };
    }
  }, [api]);

  const loadDashboardData = async () => {
    if (!api) return;

    try {
      setLoading(true);
      let deviceList: Device[] = [];

      // Загружаем устройства
      const devicesResponse = await api.database.getDevices();
      if (devicesResponse.success) {
        deviceList = devicesResponse.data || [];
        setDevices(deviceList);

        // Вычисляем статистику (используем deviceList, а не devices!)
        const statistics = {
          total: deviceList.length,
          online: deviceList.filter((d: Device) => d.current_status === 'online').length,
          offline: deviceList.filter((d: Device) => d.current_status === 'offline').length,
          warning: deviceList.filter((d: Device) => d.current_status === 'warning').length,
          unknown: deviceList.filter((d: Device) => d.current_status === 'unknown' || !d.current_status).length,
          uptime: 0,
        };

        if (statistics.total > 0) {
          statistics.uptime = Math.round((statistics.online / statistics.total) * 100);
        }

        setStats(statistics);
      }

      // Загружаем историю и группируем по часам
      const historyResponse = await api.database.getHistory();
      if (historyResponse.success) {
        const history = historyResponse.data || [];

        // Группируем по часам
        const hourlyData: { [key: string]: { online: number, offline: number, total: number } } = {};

        // Создаем массив часов за последние 24 часа
        for (let i = 23; i >= 0; i--) {
          const hour = new Date(Date.now() - i * 60 * 60 * 1000);
          const hourKey = `${hour.getHours()}:00`;
          hourlyData[hourKey] = { online: 0, offline: 0, total: 0 };
        }

        // Заполняем данными из истории
        history.forEach((h: any) => {
          const date = new Date(h.timestamp);
          const hourKey = `${date.getHours()}:00`;
          if (hourlyData[hourKey]) {
            if (h.status === 'online') {
              hourlyData[hourKey].online++;
            } else {
              hourlyData[hourKey].offline++;
            }
            hourlyData[hourKey].total++;
          }
        });

        // Преобразуем в массив для графика
        const chartData = Object.keys(hourlyData).map(time => ({
          time,
          online: hourlyData[time].online,
          offline: hourlyData[time].offline,
        }));

        setHistoryData(chartData);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceStatusChange = (data: any) => {
    // Оптимизация: обновляем только конкретное устройство вместо полной перезагрузки
    setDevices(prevDevices => {
      const updatedDevices = prevDevices.map(device => {
        if (device.id === data.device_id) {
          return {
            ...device,
            current_status: data.status,
            last_response_time: data.response_time
          };
        }
        return device;
      });

      // Пересчитываем статистику на основе обновленных устройств
      const statistics = {
        total: updatedDevices.length,
        online: updatedDevices.filter(d => d.current_status === 'online').length,
        offline: updatedDevices.filter(d => d.current_status === 'offline').length,
        warning: updatedDevices.filter(d => d.current_status === 'warning').length,
        unknown: updatedDevices.filter(d => d.current_status === 'unknown' || !d.current_status).length,
        uptime: 0,
      };

      if (statistics.total > 0) {
        statistics.uptime = Math.round((statistics.online / statistics.total) * 100);
      }

      setStats(statistics);

      return updatedDevices;
    });
  };

  const pieData = [
    { name: 'В сети', value: stats.online, color: '#52c41a' },
    { name: 'Недоступно', value: stats.offline, color: '#ff4d4f' },
    { name: 'Предупреждение', value: stats.warning, color: '#faad14' },
    { name: 'Неизвестно', value: stats.unknown, color: '#d9d9d9' },
  ].filter(item => item.value > 0);


  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ maxHeight: 'calc(100vh - 100px)', overflowY: 'auto', overflowX: 'hidden', paddingRight: '8px' }}>
      <h1 style={{ marginBottom: '24px' }}>Панель управления</h1>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Всего устройств"
              value={stats.total}
              prefix={<WifiOutlined />}
              styles={{ content: { color: '#1890ff' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="В сети"
              value={stats.online}
              prefix={<CheckCircleOutlined />}
              styles={{ content: { color: '#52c41a' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Недоступно"
              value={stats.offline}
              prefix={<CloseCircleOutlined />}
              styles={{ content: { color: '#ff4d4f' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Доступность"
              value={stats.uptime}
              suffix="%"
              prefix={<ClockCircleOutlined />}
              styles={{ content: { color: stats.uptime >= 95 ? '#52c41a' : '#faad14' } }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: '24px' }}>
        <Col xs={24} md={12}>
          <Card title="Статус устройств">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }: { name?: string; percent?: number }) => `${name || ''}: ${((percent || 0) * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="Нет данных" />
            )}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="История доступности (24ч)">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={historyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="online" stroke="#52c41a" name="В сети" />
                <Line type="monotone" dataKey="offline" stroke="#ff4d4f" name="Недоступно" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

    </div>
  );
};