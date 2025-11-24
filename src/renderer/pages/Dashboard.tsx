import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Progress, Timeline, Tag, Empty, Spin } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  QuestionCircleOutlined,
  WifiOutlined,
  VideoCameraOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { Device, EventLog as EventLogType } from '@shared/types';
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
  const [events, setEvents] = useState<EventLogType[]>([]);
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
      api.on('event-added', handleEventAdded);

      return () => {
        api.removeListener('device-status-changed', handleDeviceStatusChange);
        api.removeListener('event-added', handleEventAdded);
      };
    }
  }, [api]);

  const loadDashboardData = async () => {
    if (!api) return;

    try {
      setLoading(true);

      // Загружаем устройства
      const devicesResponse = await api.database.getDevices();
      if (devicesResponse.success) {
        const deviceList = devicesResponse.data;
        setDevices(deviceList);

        // Вычисляем статистику
        const statistics = {
          total: devices.length,
          online: devices.filter((d: Device) => d.current_status === 'online').length,
          offline: devices.filter((d: Device) => d.current_status === 'offline').length,
          warning: devices.filter((d: Device) => d.current_status === 'warning').length,
          unknown: devices.filter((d: Device) => d.current_status === 'unknown').length,
          uptime: 0,
        };

        if (statistics.total > 0) {
          statistics.uptime = Math.round((statistics.online / statistics.total) * 100);
        }

        setStats(statistics);
      }

      // Загружаем события
      const eventsResponse = await api.database.getEvents();
      if (eventsResponse.success) {
        setEvents(eventsResponse.data.slice(0, 10));
      }

      // Загружаем историю и группируем по часам
      const historyResponse = await api.database.getHistory();
      if (historyResponse.success) {
        const history = historyResponse.data;

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
          online: hourlyData[time].total > 0 ? Math.round((hourlyData[time].online / hourlyData[time].total) * devices.length) : devices.length,
          offline: hourlyData[time].total > 0 ? Math.round((hourlyData[time].offline / hourlyData[time].total) * devices.length) : 0,
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
    loadDashboardData(); // Перезагружаем данные при изменении статуса
  };

  const handleEventAdded = (event: any) => {
    // Добавляем новое событие в начало списка
    setEvents(prevEvents => [event, ...prevEvents].slice(0, 10));
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
    <div>
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

      <Row gutter={[16, 16]} style={{ marginTop: '24px' }}>
        <Col xs={24} md={12}>
          <Card title="Критические устройства">
            {devices
              .filter(d => d.current_status === 'offline')
              .slice(0, 5)
              .map(device => (
                <Card.Grid key={device.id} style={{ width: '100%', padding: '12px' }}>
                  <Row justify="space-between" align="middle">
                    <Col>
                      <strong>{device.name}</strong>
                      <br />
                      <span style={{ color: '#8c8c8c' }}>{device.ip}</span>
                    </Col>
                    <Col>
                      <Tag color="error">Недоступно</Tag>
                    </Col>
                  </Row>
                </Card.Grid>
              ))}
            {devices.filter(d => d.current_status === 'offline').length === 0 && (
              <Empty description="Все устройства в сети" />
            )}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="Последние события">
            {events.length > 0 ? (
              <Timeline>
                {events.map(event => (
                  <Timeline.Item
                    key={event.id}
                    color={
                      event.event_type === 'error' ? 'red' :
                      event.event_type === 'warning' ? 'orange' :
                      event.event_type === 'info' ? 'blue' : 'green'
                    }
                    dot={
                      event.event_type === 'error' ? <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> :
                      event.event_type === 'warning' ? <WarningOutlined style={{ color: '#faad14' }} /> :
                      <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    }
                  >
                    <p style={{ margin: 0, color: '#ffffff' }}>{event.message}</p>
                    <small style={{ color: '#8c8c8c' }}>
                      {event.device_name} • {new Date(event.timestamp || '').toLocaleString('ru-RU')}
                    </small>
                  </Timeline.Item>
                ))}
              </Timeline>
            ) : (
              <Empty description="Нет событий" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};