import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Space,
  Tag,
  Popconfirm,
  message,
  Tooltip,
  Row,
  Col,
  Card,
  Spin
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  WifiOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  QuestionCircleOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { Device, VENDOR_CONFIGS } from '@shared/types';

const { Option } = Select;

export const DeviceList: React.FC = () => {
  const { api } = useElectronAPI();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [testingDevice, setTestingDevice] = useState<number | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadDevices();

    if (api) {
      // Подписываемся на изменения статуса устройств
      api.on('device-status-changed', handleStatusUpdate);

      // Подписываемся на добавление новых устройств
      const handleDeviceAdded = (device: any) => {
        console.log('Device added event received:', device);
        // Напрямую добавляем устройство в состояние без перезагрузки
        setDevices(prev => [...prev, device]);
      };

      api.on('device-added', handleDeviceAdded);

      return () => {
        api.removeListener('device-status-changed', handleStatusUpdate);
        api.removeListener('device-added', handleDeviceAdded);
      };
    }
  }, [api]);

  const loadDevices = async () => {
    if (!api) return;

    setLoading(true);
    try {
      const response = await api.database.getDevices();
      console.log('Load devices response:', response);
      if (response.success) {
        console.log('Devices loaded:', response.data);
        setDevices(response.data);
      } else {
        console.error('Load devices failed:', response.error);
      }
    } catch (error) {
      console.error('Load devices error:', error);
      message.error('Ошибка загрузки устройств');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = (data: any) => {
    setDevices(prev => prev.map(device => {
      if (device.id === data.device_id) {
        return {
          ...device,
          current_status: data.status,
          last_response_time: data.response_time
        };
      }
      return device;
    }));
  };

  const handleAddEdit = async (values: any) => {
    if (!api) return;

    try {
      if (editingDevice) {
        const response = await api.database.updateDevice(editingDevice.id!, values);
        if (response.success) {
          message.success('Устройство обновлено');
          // При обновлении нужно перезагрузить список
          await loadDevices();
        } else {
          message.error('Ошибка обновления устройства');
          console.error('Update error:', response.error);
          return;
        }
      } else {
        const response = await api.database.addDevice(values);
        if (response.success) {
          message.success('Устройство добавлено');
          console.log('Device added:', response.data);
          // Не вызываем loadDevices() - событие 'device-added' обновит список
        } else {
          message.error('Ошибка добавления устройства');
          console.error('Add error:', response.error);
          return;
        }
      }

      // Закрываем модальное окно
      setModalVisible(false);
      form.resetFields();
      setEditingDevice(null);
    } catch (error) {
      message.error('Ошибка сохранения устройства');
      console.error('Save error:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!api) return;

    try {
      const response = await api.database.deleteDevice(id);
      if (response.success) {
        message.success('Устройство удалено');
        loadDevices();
      }
    } catch (error) {
      message.error('Ошибка удаления устройства');
    }
  };

  const handleTest = async (device: Device) => {
    if (!api) return;

    setTestingDevice(device.id!);
    try {
      const response = await api.monitoring.pingDevice(device.ip);
      if (response.success && response.data.alive) {
        message.success(`${device.name} доступно (${response.data.time}мс)`);
        // Обновляем статус устройства на "online"
        const updatedDevice = {
          ...device,
          status: 'online' as const,
          current_status: 'online',
          last_response_time: response.data.time,
          lastCheck: new Date().toISOString()
        };
        await api.database.updateDevice(device.id!, updatedDevice);
        // Перезагружаем список устройств
        loadDevices();
      } else {
        message.warning(`${device.name} недоступно`);
        // Обновляем статус устройства на "offline"
        const updatedDevice = {
          ...device,
          status: 'offline' as const,
          current_status: 'offline',
          last_response_time: 0,
          lastCheck: new Date().toISOString()
        };
        await api.database.updateDevice(device.id!, updatedDevice);
        // Перезагружаем список устройств
        loadDevices();
      }
    } catch (error) {
      message.error('Ошибка тестирования');
    } finally {
      setTestingDevice(null);
    }
  };

  const showModal = (device?: Device) => {
    if (device) {
      setEditingDevice(device);
      form.setFieldsValue(device);
    } else {
      setEditingDevice(null);
      form.resetFields();
    }
    setModalVisible(true);
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'online':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'offline':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'warning':
        return <WarningOutlined style={{ color: '#faad14' }} />;
      default:
        return <QuestionCircleOutlined style={{ color: '#d9d9d9' }} />;
    }
  };

  const getStatusTag = (status?: string) => {
    switch (status) {
      case 'online':
        return <Tag color="success">В сети</Tag>;
      case 'offline':
        return <Tag color="error">Недоступно</Tag>;
      case 'warning':
        return <Tag color="warning">Предупреждение</Tag>;
      default:
        return <Tag>Неизвестно</Tag>;
    }
  };

  const columns = [
    {
      title: '',
      dataIndex: 'current_status',
      key: 'icon',
      width: 40,
      render: (status: string) => getStatusIcon(status),
    },
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Device) => (
        <div>
          <strong>{text}</strong>
          {record.location && (
            <div style={{ fontSize: '12px', color: '#8c8c8c' }}>{record.location}</div>
          )}
        </div>
      ),
    },
    {
      title: 'IP-адрес',
      dataIndex: 'ip',
      key: 'ip',
      render: (ip: string) => <code>{ip}</code>,
    },
    {
      title: 'Тип',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const typeMap: Record<string, string> = {
          switch: 'Коммутатор',
          router: 'Маршрутизатор',
          camera: 'Камера',
          server: 'Сервер',
          other: 'Другое',
        };
        return typeMap[type] || type;
      },
    },
    {
      title: 'Производитель',
      dataIndex: 'vendor',
      key: 'vendor',
      render: (vendor: string) => vendor ? vendor.toUpperCase() : '-',
    },
    {
      title: 'Модель',
      dataIndex: 'model',
      key: 'model',
      render: (model: string) => model || '-',
    },
    {
      title: 'Порты',
      dataIndex: 'port_count',
      key: 'port_count',
      render: (count: number) => count || '-',
    },
    {
      title: 'Статус',
      dataIndex: 'current_status',
      key: 'status',
      render: (status: string) => getStatusTag(status),
    },
    {
      title: 'Отклик',
      dataIndex: 'last_response_time',
      key: 'response_time',
      render: (time: number) => time ? `${time}мс` : '-',
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 150,
      render: (_: any, record: Device) => (
        <Space size="small">
          <Tooltip title="Тестировать">
            <Button
              type="text"
              icon={<WifiOutlined />}
              onClick={() => handleTest(record)}
              loading={testingDevice === record.id}
            />
          </Tooltip>
          <Tooltip title="Редактировать">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => showModal(record)}
            />
          </Tooltip>
          <Tooltip title="Удалить">
            <Popconfirm
              title="Удалить устройство?"
              description="Это действие нельзя отменить"
              onConfirm={() => handleDelete(record.id!)}
              okText="Да"
              cancelText="Нет"
            >
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title="Управление устройствами"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadDevices}>
              Обновить
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>
              Добавить устройство
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={devices}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Всего: ${total}`,
          }}
        />
      </Card>

      <Modal
        title={editingDevice ? 'Редактировать устройство' : 'Добавить устройство'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingDevice(null);
          form.resetFields();
        }}
        footer={null}
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleAddEdit}
          initialValues={{
            type: 'switch',
            vendor: 'generic',
            snmp_community: 'public',
            snmp_version: '2c',
            monitoring_interval: 60,
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="Название устройства"
                rules={[{ required: true, message: 'Введите название' }]}
              >
                <Input prefix={<SettingOutlined />} placeholder="Switch-01" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="ip"
                label="IP-адрес"
                rules={[
                  { required: true, message: 'Введите IP-адрес' },
                  {
                    pattern: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/,
                    message: 'Неверный формат IP-адреса',
                  },
                ]}
              >
                <Input prefix={<WifiOutlined />} placeholder="192.168.1.1" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="type" label="Тип устройства" rules={[{ required: true }]}>
                <Select>
                  <Option value="switch">Коммутатор</Option>
                  <Option value="router">Маршрутизатор</Option>
                  <Option value="camera">Камера</Option>
                  <Option value="server">Сервер</Option>
                  <Option value="other">Другое</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="vendor" label="Производитель">
                <Select>
                  <Option value="tfortis">TFortis</Option>
                  <Option value="tplink">TP-Link</Option>
                  <Option value="ltv">LTV</Option>
                  <Option value="netgear">Netgear</Option>
                  <Option value="cisco">Cisco</Option>
                  <Option value="generic">Другой</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="model" label="Модель">
                <Input placeholder="TL-SG1024D" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="location" label="Расположение">
                <Input placeholder="Серверная, 2 этаж" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="port_count" label="Количество портов">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="monitoring_interval" label="Интервал мониторинга (сек)">
                <InputNumber min={10} max={3600} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="SNMP настройки">
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="snmp_community" noStyle>
                  <Input placeholder="Community" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="snmp_version" noStyle>
                  <Select>
                    <Option value="1">v1</Option>
                    <Option value="2c">v2c</Option>
                    <Option value="3">v3</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          </Form.Item>

          <Form.Item label="SSH доступ (опционально)">
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="ssh_username" noStyle>
                  <Input placeholder="Логин" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="ssh_password" noStyle>
                  <Input.Password placeholder="Пароль" />
                </Form.Item>
              </Col>
            </Row>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingDevice ? 'Сохранить' : 'Добавить'}
              </Button>
              <Button onClick={() => setModalVisible(false)}>Отмена</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};