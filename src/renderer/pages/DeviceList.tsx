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
  WarningOutlined,
  GlobalOutlined,
  SearchOutlined
} from '@ant-design/icons';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { useLanguage } from '../i18n';
import { Device, VENDOR_CONFIGS, TFORTIS_MODELS, TFortisModelConfig } from '@shared/types';

const { Option } = Select;

// Интерфейс для коммутатора в списке
interface SwitchOption {
  id: number;
  name: string;
  ip: string;
  port_count: number;
  location?: string;
}

export const DeviceList: React.FC = () => {
  const { api } = useElectronAPI();
  const { t } = useLanguage();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [testingDevice, setTestingDevice] = useState<number | null>(null);
  const [selectedDeviceType, setSelectedDeviceType] = useState<string>('switch');
  const [selectedVendor, setSelectedVendor] = useState<string>('generic');
  const [form] = Form.useForm();

  // Для привязки камер к коммутаторам
  const [switches, setSwitches] = useState<SwitchOption[]>([]);
  const [availablePorts, setAvailablePorts] = useState<number[]>([]);
  const [selectedSwitch, setSelectedSwitch] = useState<number | null>(null);

  // Шаблоны учетных данных
  const [credentialTemplates, setCredentialTemplates] = useState<any[]>([]);

  // Тест видеопотока
  const [videoTestVisible, setVideoTestVisible] = useState(false);
  const [videoTestUrl, setVideoTestUrl] = useState<string>('');
  const [videoTestError, setVideoTestError] = useState<string>('');
  const [videoTestImage, setVideoTestImage] = useState<string>(''); // Base64 image data
  const [videoTestLoading, setVideoTestLoading] = useState(false);

  // Поиск
  const [searchText, setSearchText] = useState('');

  // Динамические списки производителей в зависимости от типа
  const getVendorsByType = (type: string) => {
    switch (type) {
      case 'switch':
      case 'router':
        return [
          { value: 'tfortis', label: 'TFortis' },
          { value: 'tplink', label: 'TP-Link' },
          { value: 'netgear', label: 'Netgear' },
          { value: 'cisco', label: 'Cisco' },
          { value: 'mikrotik', label: 'MikroTik' },
          { value: 'juniper', label: 'Juniper' },
          { value: 'generic', label: 'Другой' },
        ];
      case 'camera':
        return [
          { value: 'ltv', label: 'LTV' },
          { value: 'hikvision', label: 'Hikvision' },
          { value: 'dahua', label: 'Dahua' },
          { value: 'mobotix', label: 'Mobotix' },
          { value: 'axis', label: 'Axis' },
          { value: 'hanwha', label: 'Hanwha' },
          { value: 'generic', label: 'Другой' },
        ];
      case 'server':
        return [
          { value: 'hp', label: 'HP' },
          { value: 'dell', label: 'Dell' },
          { value: 'lenovo', label: 'Lenovo' },
          { value: 'supermicro', label: 'Supermicro' },
          { value: 'ibm', label: 'IBM' },
          { value: 'generic', label: 'Другой' },
        ];
      default:
        return [
          { value: 'generic', label: 'Другой' },
        ];
    }
  };

  useEffect(() => {
    loadDevices();
    loadCredentialTemplates();

    if (api) {
      // Обработчик изменения статуса устройства
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

      // Подписываемся на добавление новых устройств
      const handleDeviceAdded = (device: any) => {
        console.log('Device added event received:', device);
        // Напрямую добавляем устройство в состояние без перезагрузки
        setDevices(prev => [...prev, device]);
      };

      // Подписываемся на изменения статуса устройств
      api.on('device-status-changed', handleStatusUpdate);
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

  // Загрузка списка коммутаторов для привязки камер
  const loadSwitches = async () => {
    if (!api) return;
    try {
      const response = await api.database.getSwitches();
      if (response.success) {
        setSwitches(response.data);
      }
    } catch (error) {
      console.error('Error loading switches:', error);
    }
  };

  const loadCredentialTemplates = async () => {
    if (!api) return;
    try {
      const response = await api.credentials.getAll();
      if (response.success) {
        setCredentialTemplates(response.data || []);
      }
    } catch (error) {
      console.error('Error loading credential templates:', error);
    }
  };

  const handleTemplateSelect = (templateId: number) => {
    const template = credentialTemplates.find(t => t.id === templateId);
    if (template) {
      form.setFieldsValue({
        camera_login: template.login,
        camera_password: template.password,
      });
    }
  };

  // Получение URL снапшота для камеры по производителю
  // LTV камеры могут использовать как Hikvision (ISAPI), так и Dahua (cgi-bin) протокол
  const getSnapshotUrlByVendor = (ip: string, vendor: string, auth: string): string => {
    const vendorLower = (vendor || '').toLowerCase();

    console.log(`[getSnapshotUrlByVendor] vendor="${vendorLower}", ip=${ip}`);

    switch (vendorLower) {
      case 'hikvision':
        return `http://${auth}${ip}/ISAPI/Streaming/channels/101/picture`;

      case 'ltv':
        // LTV камеры используют Dahua CGI протокол (не Hikvision ISAPI!)
        return `http://${auth}${ip}/cgi-bin/snapshot.cgi?channel=1`;

      case 'dahua':
        return `http://${auth}${ip}/cgi-bin/snapshot.cgi?channel=1`;

      case 'axis':
        return `http://${auth}${ip}/axis-cgi/jpg/image.cgi`;

      case 'hanwha': // Samsung/Hanwha
        return `http://${auth}${ip}/stw-cgi/video.cgi?msubmenu=snapshot&action=view&Profile=1`;

      case 'mobotix':
        return `http://${auth}${ip}/cgi-bin/faststream.jpg?stream=full`;

      case 'generic':
      default:
        // Пробуем Dahua формат как наиболее распространенный
        console.log(`[getSnapshotUrlByVendor] Using default Dahua format for vendor="${vendorLower}"`);
        return `http://${auth}${ip}/cgi-bin/snapshot.cgi?channel=1`;
    }
  };

  // Тест видеопотока камеры
  const handleVideoTest = async () => {
    const values = form.getFieldsValue();
    const ip = values.ip;
    const login = values.camera_login || '';
    const password = values.camera_password || '';
    const streamType = values.stream_type || 'http';
    const customUrl = values.stream_url;
    const vendor = values.vendor || '';

    console.log('[Camera Test] Form values:', {
      ip,
      login: login ? '***' : '(empty)',
      password: password ? '***' : '(empty)',
      streamType,
      customUrl,
      vendor
    });

    if (!ip) {
      message.warning('Введите IP-адрес камеры');
      return;
    }

    let testUrl = '';

    if (customUrl) {
      // Если указан кастомный URL - используем его
      testUrl = customUrl.includes('://') ? customUrl : `http://${customUrl}`;
      console.log('[Camera Test] Using custom URL');
    } else {
      // Формируем URL автоматически в зависимости от типа потока (без auth в URL)
      console.log('[Camera Test] Auto-generating URL for vendor:', vendor, 'streamType:', streamType);
      testUrl = getSnapshotUrlByVendor(ip, vendor, ''); // No auth in URL
    }

    // Log URL without credentials for security
    const safeUrl = testUrl.replace(/\/\/[^@]+@/, '//***:***@');
    console.log('[Camera Test] Generated URL:', safeUrl);

    setVideoTestError(''); // Reset previous error
    setVideoTestImage(''); // Reset previous image
    setVideoTestUrl(testUrl);
    setVideoTestVisible(true);
    setVideoTestLoading(true);

    // Try to load via main process (supports Digest Auth)
    if (api && login && password) {
      console.log('[Camera Test] Attempting to load via main process with Digest Auth...');
      try {
        const result = await api.camera.getSnapshot(testUrl, login, password);
        console.log('[Camera Test] Main process result:', { success: result.success, error: result.error });

        if (result.success && result.data) {
          setVideoTestImage(result.data);
          setVideoTestLoading(false);
          return;
        } else {
          console.log('[Camera Test] Main process failed:', result.error);
          setVideoTestError(result.error || 'Неизвестная ошибка');
          setVideoTestLoading(false);
        }
      } catch (e) {
        console.error('[Camera Test] Exception:', e);
        setVideoTestError('Ошибка при загрузке изображения');
        setVideoTestLoading(false);
      }
    } else {
      // No credentials - try direct img loading
      console.log('[Camera Test] No credentials, will try direct img loading');
      setVideoTestLoading(false);
    }
  };

  // Загрузка доступных портов при выборе коммутатора
  const loadAvailablePorts = async (switchId: number) => {
    if (!api) return;
    try {
      const currentCameraId = editingDevice?.id || undefined;
      const response = await api.database.getAvailablePorts(switchId, currentCameraId);
      if (response.success) {
        setAvailablePorts(response.data);
      }
    } catch (error) {
      console.error('Error loading available ports:', error);
      setAvailablePorts([]);
    }
  };

  // Обработчик выбора коммутатора
  const handleSwitchChange = (switchId: number | null) => {
    setSelectedSwitch(switchId);
    if (switchId) {
      loadAvailablePorts(switchId);
    } else {
      setAvailablePorts([]);
      form.setFieldsValue({ port_number: undefined });
    }
  };

  const handleAddEdit = async (values: any) => {
    if (!api) return;

    try {
      if (editingDevice) {
        const response = await api.database.updateDevice(editingDevice.id!, values);
        if (response.success) {
          message.success(t.devices.deviceUpdated);
          // При обновлении нужно перезагрузить список
          await loadDevices();
        } else {
          message.error(t.devices.updateError);
          console.error('Update error:', response.error);
          return;
        }
      } else {
        const response = await api.database.addDevice(values);
        if (response.success) {
          message.success(t.devices.deviceAdded);
          console.log('Device added:', response.data);
          // Не вызываем loadDevices() - событие 'device-added' обновит список
        } else {
          message.error(t.devices.addError);
          console.error('Add error:', response.error);
          return;
        }
      }

      // Закрываем модальное окно
      setModalVisible(false);
      form.resetFields();
      setEditingDevice(null);
    } catch (error) {
      message.error(t.devices.saveError);
      console.error('Save error:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!api) return;

    try {
      const response = await api.database.deleteDevice(id);
      if (response.success) {
        message.success(t.devices.deviceDeleted);
        loadDevices();
      }
    } catch (error) {
      message.error(t.devices.deleteError);
    }
  };

  const handleTest = async (device: Device) => {
    if (!api) return;

    setTestingDevice(device.id!);
    try {
      const response = await api.monitoring.pingDevice(device.ip);
      if (response.success && response.data.alive) {
        message.success(`${device.name} ${t.devices.testOnline} (${response.data.time}ms)`);
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
        message.warning(`${device.name} ${t.devices.testOffline}`);
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
      message.error(t.devices.testError);
    } finally {
      setTestingDevice(null);
    }
  };

  const handleOpenInBrowser = async (device: Device) => {
    if (!api) return;

    try {
      const url = `http://${device.ip}`;
      const response = await api.system.openUrl(url);
      if (response.success) {
        message.success(`Открытие ${url} в браузере`);
      } else {
        message.error('Ошибка открытия URL');
      }
    } catch (error) {
      message.error('Ошибка открытия URL');
    }
  };

  const showModal = async (device?: Device) => {
    // Загружаем список коммутаторов и шаблоны учетных данных
    await loadSwitches();
    await loadCredentialTemplates();

    if (device) {
      setEditingDevice(device);
      setSelectedDeviceType(device.type || 'switch');
      setSelectedVendor(device.vendor || 'generic');
      form.setFieldsValue(device);

      // Если редактируем камеру с привязкой - загружаем доступные порты
      if (device.type === 'camera' && device.parent_device_id) {
        setSelectedSwitch(device.parent_device_id);
        await loadAvailablePorts(device.parent_device_id);
      } else {
        setSelectedSwitch(null);
        setAvailablePorts([]);
      }
    } else {
      setEditingDevice(null);
      setSelectedDeviceType('switch');
      setSelectedVendor('generic');
      setSelectedSwitch(null);
      setAvailablePorts([]);
      form.resetFields();
    }
    setModalVisible(true);
  };

  // Обработчик выбора производителя (vendor)
  const handleVendorChange = (value: string) => {
    setSelectedVendor(value);
    // Если выбран TFortis - сбрасываем модель на первую из списка
    if (value === 'tfortis') {
      const firstModel = TFORTIS_MODELS[0];
      form.setFieldsValue({
        model: firstModel.model,
        port_count: firstModel.ports,
        snmp_version: firstModel.snmpVersion
      });
    } else {
      form.setFieldsValue({ model: undefined });
    }
  };

  // Обработчик выбора модели TFortis
  const handleTFortisModelChange = (modelName: string) => {
    const modelConfig = TFORTIS_MODELS.find(m => m.model === modelName);
    if (modelConfig) {
      form.setFieldsValue({
        port_count: modelConfig.ports,
        snmp_version: modelConfig.snmpVersion
      });
    }
  };

  // Обработчик изменения типа устройства
  const handleDeviceTypeChange = (value: string) => {
    setSelectedDeviceType(value);
    // Сбрасываем производителя при смене типа
    form.setFieldsValue({ vendor: 'generic' });

    // Если не камера - сбрасываем привязку к коммутатору
    if (value !== 'camera') {
      setSelectedSwitch(null);
      setAvailablePorts([]);
      form.setFieldsValue({ parent_device_id: undefined, port_number: undefined });
    }
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
      render: (count: number, record: Device) => {
        // Для коммутаторов показываем занятость портов
        if ((record.type === 'switch' || record.type === 'router') && count) {
          const occupied = record.connected_cameras_count || 0;
          return (
            <Tooltip title={`${occupied} из ${count} портов занято`}>
              <span>{occupied}/{count}</span>
            </Tooltip>
          );
        }
        return count || '-';
      },
    },
    {
      title: 'Подключение',
      key: 'connection',
      render: (_: any, record: Device) => {
        // Для камер показываем к какому коммутатору подключена
        if (record.type === 'camera' && record.parent_device_name) {
          return (
            <Tooltip title={`Подключена к ${record.parent_device_name}, порт ${record.port_number}`}>
              <Tag color="blue">
                {record.parent_device_name}, порт {record.port_number}
              </Tag>
            </Tooltip>
          );
        }
        // Для коммутаторов показываем количество подключенных камер
        if ((record.type === 'switch' || record.type === 'router') && record.connected_cameras_count) {
          return (
            <Tooltip title={`${record.connected_cameras_count} камер подключено`}>
              <Tag color="green">
                {record.connected_cameras_count} камер
              </Tag>
            </Tooltip>
          );
        }
        return '-';
      },
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
      width: 180,
      render: (_: any, record: Device) => (
        <Space size="small">
          <Tooltip title="Открыть в браузере">
            <Button
              type="text"
              icon={<GlobalOutlined />}
              onClick={() => handleOpenInBrowser(record)}
            />
          </Tooltip>
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
            <Input
              placeholder="Поиск..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              style={{ width: 200 }}
            />
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
          dataSource={devices.filter(device => {
            if (!searchText.trim()) return true;
            const search = searchText.toLowerCase();
            return device.name.toLowerCase().includes(search) ||
              device.ip.toLowerCase().includes(search) ||
              device.location?.toLowerCase().includes(search) ||
              device.type.toLowerCase().includes(search) ||
              device.vendor?.toLowerCase().includes(search);
          })}
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
            stream_type: 'http',
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
                <Select onChange={handleDeviceTypeChange}>
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
                <Select onChange={handleVendorChange}>
                  {getVendorsByType(selectedDeviceType).map(vendor => (
                    <Option key={vendor.value} value={vendor.value}>
                      {vendor.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              {/* Для TFortis показываем Select с моделями, для остальных - Input */}
              {selectedVendor === 'tfortis' && (selectedDeviceType === 'switch' || selectedDeviceType === 'router') ? (
                <Form.Item name="model" label="Модель TFortis">
                  <Select onChange={handleTFortisModelChange}>
                    {TFORTIS_MODELS.map(model => (
                      <Option key={model.model} value={model.model}>
                        {model.name} - {model.description}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              ) : (
                <Form.Item name="model" label="Модель">
                  <Input placeholder="TL-SG1024D" />
                </Form.Item>
              )}
            </Col>
            <Col span={12}>
              <Form.Item name="location" label="Расположение">
                <Input placeholder="Серверная, 2 этаж" />
              </Form.Item>
            </Col>
          </Row>

          {/* Привязка камеры к коммутатору - только для типа "camera" */}
          {selectedDeviceType === 'camera' && (
            <>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="parent_device_id" label="Подключена к коммутатору">
                    <Select
                      allowClear
                      placeholder="Выберите коммутатор"
                      onChange={(value) => handleSwitchChange(value)}
                    >
                      {switches.map(sw => (
                        <Option key={sw.id} value={sw.id}>
                          {sw.name} ({sw.ip}) - {sw.port_count} портов
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="port_number" label="Порт">
                    <Select
                      allowClear
                      placeholder="Выберите порт"
                      disabled={!selectedSwitch || availablePorts.length === 0}
                    >
                      {availablePorts.map(port => (
                        <Option key={port} value={port}>
                          Порт {port}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              {credentialTemplates.length > 0 && (
                <Form.Item label="Шаблон учетных данных">
                  <Select
                    placeholder={t.settings.selectCredential}
                    onChange={handleTemplateSelect}
                    allowClear
                  >
                    {credentialTemplates.map(template => (
                      <Option key={template.id} value={template.id}>
                        {template.name}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              )}

              <Form.Item label="Доступ к камере">
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item name="camera_login" noStyle>
                      <Input placeholder="Логин камеры" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="camera_password" noStyle>
                      <Input.Password placeholder="Пароль камеры" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="stream_type" noStyle initialValue="http">
                      <Select placeholder="Тип потока">
                        <Option value="http">HTTP (MJPEG/JPEG)</Option>
                        <Option value="rtsp">RTSP</Option>
                        <Option value="onvif">ONVIF</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
              </Form.Item>

              <Form.Item
                name="stream_url"
                label="URL потока (опционально)"
                tooltip="Оставьте пустым для автоматического формирования URL"
              >
                <Input placeholder="http://IP/video или rtsp://IP:554/stream" />
              </Form.Item>

              <Form.Item>
                <Button
                  type="default"
                  icon={<WifiOutlined />}
                  onClick={handleVideoTest}
                >
                  Проверить видео
                </Button>
              </Form.Item>
            </>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="port_count"
                label="Количество портов"
                style={{ display: selectedDeviceType === 'switch' || selectedDeviceType === 'router' ? 'block' : 'none' }}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              {selectedDeviceType !== 'switch' && selectedDeviceType !== 'router' && (
                <Form.Item label=" " colon={false}>
                  {/* Пустое место для выравнивания */}
                </Form.Item>
              )}
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

      {/* Модальное окно предпросмотра видео */}
      <Modal
        title="Предпросмотр видео"
        open={videoTestVisible}
        onCancel={() => {
          setVideoTestVisible(false);
          setVideoTestError('');
          setVideoTestImage('');
        }}
        footer={[
          <Button key="close" onClick={() => {
            setVideoTestVisible(false);
            setVideoTestError('');
            setVideoTestImage('');
          }}>
            Закрыть
          </Button>
        ]}
        width={700}
      >
        <div style={{ textAlign: 'center' }}>
          <p style={{ marginBottom: 16, wordBreak: 'break-all', fontSize: 12, color: '#666' }}>
            <strong>URL:</strong> {videoTestUrl.replace(/\/\/[^@]+@/, '//***:***@')}
          </p>
          {videoTestLoading ? (
            <div style={{ padding: 60 }}>
              <Spin size="large" tip="Загрузка изображения..." />
            </div>
          ) : videoTestError ? (
            <div style={{ padding: 40, color: '#ff4d4f', background: '#fff2f0', borderRadius: 4 }}>
              <p><strong>Не удалось загрузить изображение</strong></p>
              <p style={{ fontSize: 12 }}>{videoTestError}</p>
              <p style={{ fontSize: 12, marginTop: 16 }}>
                Возможные причины:<br/>
                • Неверный логин/пароль<br/>
                • Камера не поддерживает snapshot по этому URL<br/>
                • Сетевая ошибка или таймаут
              </p>
            </div>
          ) : videoTestImage ? (
            <img
              src={videoTestImage}
              alt="Camera preview"
              style={{
                maxWidth: '100%',
                maxHeight: 400,
                border: '1px solid #d9d9d9',
                borderRadius: 4,
                backgroundColor: '#000'
              }}
            />
          ) : (
            <div style={{ padding: 40, color: '#666' }}>
              <p>Введите логин и пароль камеры для просмотра</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};