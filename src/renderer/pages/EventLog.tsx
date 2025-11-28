import React, { useState, useEffect } from 'react';
import {
  Table,
  Card,
  Tag,
  Button,
  Space,
  DatePicker,
  Select,
  Input,
  Row,
  Col,
  message,
  Empty
} from 'antd';
import {
  ReloadOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
  ClearOutlined,
  ExportOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { EventLog as EventLogType } from '@shared/types';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Search } = Input;

export const EventLog: React.FC = () => {
  const { api } = useElectronAPI();
  const [events, setEvents] = useState<EventLogType[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<EventLogType[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    eventType: 'all',
    searchText: '',
    dateRange: null as [dayjs.Dayjs, dayjs.Dayjs] | null,
  });
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    loadEvents();

    if (api) {
      api.on('alert', handleNewEvent);

      return () => {
        api.removeListener('alert', handleNewEvent);
      };
    }
  }, [api]);

  useEffect(() => {
    applyFilters();
  }, [events, filters]);

  const loadEvents = async () => {
    if (!api) return;

    setLoading(true);
    try {
      const response = await api.database.getEvents(500);
      if (response.success) {
        setEvents(response.data || []);
      } else {
        message.error('Ошибка загрузки событий');
      }
    } catch (error) {
      console.error('Error loading events:', error);
      message.error('Ошибка загрузки событий');
    } finally {
      setLoading(false);
    }
  };

  const clearEvents = async () => {
    if (!api) return;

    try {
      const response = await api.database.clearEvents();
      if (response.success) {
        setEvents([]);
        message.success('Журнал событий очищен');
      } else {
        message.error('Ошибка очистки журнала');
      }
    } catch (error) {
      console.error('Error clearing events:', error);
      message.error('Ошибка очистки журнала');
    }
  };

  const handleNewEvent = (data: any) => {
    // Добавляем новое событие в начало списка
    const newEvent: EventLogType = {
      id: Date.now(),
      device_id: data.device?.id,
      device_name: data.device?.name,
      device_ip: data.device?.ip,
      event_type: data.new_status === 'online' ? 'info' : 'error',
      message: data.message,
      timestamp: new Date().toISOString(),
    };

    setEvents(prev => [newEvent, ...prev]);
  };

  const applyFilters = () => {
    let filtered = [...events];

    // Фильтр по типу события
    if (filters.eventType !== 'all') {
      filtered = filtered.filter(e => e.event_type === filters.eventType);
    }

    // Фильтр по тексту
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      filtered = filtered.filter(e =>
        e.message.toLowerCase().includes(searchLower) ||
        e.device_name?.toLowerCase().includes(searchLower) ||
        e.device_ip?.includes(filters.searchText)
      );
    }

    // Фильтр по дате
    if (filters.dateRange) {
      const [start, end] = filters.dateRange;
      filtered = filtered.filter(e => {
        const eventDate = dayjs(e.timestamp);
        return eventDate.isAfter(start) && eventDate.isBefore(end);
      });
    }

    setFilteredEvents(filtered);
  };

  const clearFilters = () => {
    setFilters({
      eventType: 'all',
      searchText: '',
      dateRange: null,
    });
  };

  const exportEvents = async () => {
    if (!api) return;

    try {
      const response = await api.system.exportData('json');
      if (response.success) {
        message.success(`События экспортированы: ${response.data}`);
      }
    } catch (error) {
      message.error('Ошибка экспорта');
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'info':
        return <InfoCircleOutlined style={{ color: '#1890ff' }} />;
      case 'warning':
        return <WarningOutlined style={{ color: '#faad14' }} />;
      case 'error':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'critical':
        return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return <InfoCircleOutlined />;
    }
  };

  const getEventTag = (type: string) => {
    const typeMap = {
      info: { color: 'blue', text: 'Информация' },
      warning: { color: 'orange', text: 'Предупреждение' },
      error: { color: 'red', text: 'Ошибка' },
      critical: { color: 'red', text: 'Критично' },
    };

    const config = typeMap[type as keyof typeof typeMap] || { color: 'default', text: type };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const columns = [
    {
      title: '',
      dataIndex: 'event_type',
      key: 'icon',
      width: 40,
      render: (type: string) => getEventIcon(type),
    },
    {
      title: 'Время',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (timestamp: string) => dayjs(timestamp).format('DD.MM.YYYY HH:mm:ss'),
      sorter: (a: EventLogType, b: EventLogType) =>
        dayjs(a.timestamp).unix() - dayjs(b.timestamp).unix(),
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Тип',
      dataIndex: 'event_type',
      key: 'event_type',
      width: 150,
      render: (type: string) => getEventTag(type),
      filters: [
        { text: 'Информация', value: 'info' },
        { text: 'Предупреждение', value: 'warning' },
        { text: 'Ошибка', value: 'error' },
        { text: 'Критично', value: 'critical' },
      ],
      onFilter: (value: any, record: EventLogType) => record.event_type === value,
    },
    {
      title: 'Устройство',
      dataIndex: 'device_name',
      key: 'device_name',
      render: (name: string, record: EventLogType) => (
        <div>
          <strong>{name || 'Система'}</strong>
          {record.device_ip && (
            <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
              <code>{record.device_ip}</code>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Сообщение',
      dataIndex: 'message',
      key: 'message',
      render: (message: string, record: EventLogType) => (
        <div>
          {message}
          {record.details && (
            <div style={{ fontSize: '12px', color: '#8c8c8c', marginTop: '4px' }}>
              {record.details}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <Card
        title="Журнал событий"
        extra={
          <Space>
            <Button icon={<ExportOutlined />} onClick={exportEvents}>
              Экспорт
            </Button>
            <Button icon={<DeleteOutlined />} onClick={clearEvents} danger>
              Очистить
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadEvents}>
              Обновить
            </Button>
          </Space>
        }
      >
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={6}>
            <Select
              style={{ width: '100%' }}
              placeholder="Все события"
              value={filters.eventType}
              onChange={(value) => setFilters({ ...filters, eventType: value })}
            >
              <Option value="all">Все события</Option>
              <Option value="info">Информация</Option>
              <Option value="warning">Предупреждения</Option>
              <Option value="error">Ошибки</Option>
              <Option value="critical">Критичные</Option>
            </Select>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Search
              placeholder="Поиск по событиям"
              value={filters.searchText}
              onChange={(e) => setFilters({ ...filters, searchText: e.target.value })}
              onSearch={(value) => setFilters({ ...filters, searchText: value })}
            />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <RangePicker
              style={{ width: '100%' }}
              showTime
              format="DD.MM.YYYY HH:mm"
              value={filters.dateRange}
              onChange={(dates) => setFilters({ ...filters, dateRange: dates as any })}
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Button
              icon={<ClearOutlined />}
              onClick={clearFilters}
              style={{ width: '100%' }}
            >
              Сбросить
            </Button>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={filteredEvents}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: pageSize,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total) => `Всего событий: ${total}`,
            onShowSizeChange: (_, size) => setPageSize(size),
          }}
          locale={{
            emptyText: <Empty description="Нет событий" />,
          }}
        />
      </Card>
    </div>
  );
};