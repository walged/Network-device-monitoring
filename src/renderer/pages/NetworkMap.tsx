import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Tag,
  Tooltip,
  Spin,
  Empty,
  Badge,
  Button,
  Collapse,
  Modal,
  Select,
  Popover,
  Switch,
  message,
  Divider,
  Input
} from 'antd';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  QuestionCircleOutlined,
  WarningOutlined,
  ApiOutlined,
  VideoCameraOutlined,
  ExpandOutlined,
  CompressOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  PoweroffOutlined,
  SyncOutlined,
  LoadingOutlined,
  SearchOutlined
} from '@ant-design/icons';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { Device, TFORTIS_MODELS, getTFortisModelConfig } from '@shared/types';

interface PoEPortStatus {
  port: number;
  status: 'on' | 'off' | 'unknown' | 'unsupported';
  power: number;
}

interface PoEStatusResponse {
  ip: string;
  ports: PoEPortStatus[];
  totalPorts: number;
  statusSupported?: boolean;
  message?: string;
}

interface SwitchWithCameras {
  switch: Device;
  cameras: Device[];
}

export const NetworkMap: React.FC = () => {
  const { api } = useElectronAPI();
  const [loading, setLoading] = useState(false);
  const [switchesWithCameras, setSwitchesWithCameras] = useState<SwitchWithCameras[]>([]);
  const [unconnectedCameras, setUnconnectedCameras] = useState<Device[]>([]);
  const [expandAll, setExpandAll] = useState(true);

  // Состояние для модального окна мониторинга камер
  const [monitorModalVisible, setMonitorModalVisible] = useState(false);
  const [monitoringSwitch, setMonitoringSwitch] = useState<SwitchWithCameras | null>(null);
  const [gridColumns, setGridColumns] = useState<number>(2); // Количество колонок в сетке (дефолт 2 для широкоформатных камер)

  // Поиск
  const [searchText, setSearchText] = useState('');

  // Снапшоты камер для монитора (deviceId -> base64 image или error)
  const [cameraSnapshots, setCameraSnapshots] = useState<{ [deviceId: number]: { data?: string; error?: string; loading?: boolean } }>({});

  // Синхронизация monitoringSwitch с актуальными данными switchesWithCameras
  useEffect(() => {
    if (monitoringSwitch && switchesWithCameras.length > 0) {
      const updatedSwitch = switchesWithCameras.find(
        s => s.switch.id === monitoringSwitch.switch.id
      );
      if (updatedSwitch) {
        // Обновляем только если данные изменились
        if (JSON.stringify(updatedSwitch.cameras) !== JSON.stringify(monitoringSwitch.cameras)) {
          setMonitoringSwitch(updatedSwitch);
        }
      }
    }
  }, [switchesWithCameras]);

  // PoE Control State
  const [poeStatus, setPoeStatus] = useState<{ [switchId: number]: PoEPortStatus[] }>({});
  const [poeStatusSupported, setPoeStatusSupported] = useState<{ [switchId: number]: boolean }>({});
  const [poeLoading, setPoeLoading] = useState<{ [key: string]: boolean }>({});
  const [activePopover, setActivePopover] = useState<string | null>(null);

  // Получить URL для снапшота камеры по вендору
  const getSnapshotUrlByVendor = (ip: string, vendor: string): string => {
    const vendorLower = (vendor || '').toLowerCase();
    switch (vendorLower) {
      case 'dahua':
      case 'dh':
        return `http://${ip}/cgi-bin/snapshot.cgi?channel=1`;
      case 'hikvision':
      case 'hik':
        return `http://${ip}/ISAPI/Streaming/channels/101/picture`;
      case 'ltv':
        return `http://${ip}/cgi-bin/snapshot.cgi?channel=1`;
      case 'trassir':
        return `http://${ip}/screenshot.php`;
      case 'wisenet':
      case 'samsung':
        return `http://${ip}/stw-cgi/video.cgi?msubmenu=snapshot&action=view&Profile=1`;
      default:
        return `http://${ip}/cgi-bin/snapshot.cgi?channel=1`;
    }
  };

  // Загрузить снапшот одной камеры
  const loadCameraSnapshot = async (camera: Device) => {
    if (!api || !camera.id) return;

    const deviceId = camera.id;

    // Устанавливаем статус загрузки
    setCameraSnapshots(prev => ({
      ...prev,
      [deviceId]: { loading: true }
    }));

    try {
      const url = camera.stream_url || getSnapshotUrlByVendor(camera.ip, camera.vendor || '');
      const login = camera.camera_login || 'admin';
      const password = camera.camera_password || '';

      console.log(`[Monitor] Loading snapshot for ${camera.name} (${camera.ip})`);

      const result = await api.camera.getSnapshot(url, login, password);

      if (result.success && result.data) {
        setCameraSnapshots(prev => ({
          ...prev,
          [deviceId]: { data: result.data }
        }));
      } else {
        setCameraSnapshots(prev => ({
          ...prev,
          [deviceId]: { error: result.error || 'Не удалось загрузить изображение' }
        }));
      }
    } catch (e: any) {
      console.error(`[Monitor] Error loading snapshot for ${camera.name}:`, e);
      setCameraSnapshots(prev => ({
        ...prev,
        [deviceId]: { error: e.message || 'Ошибка загрузки' }
      }));
    }
  };

  // Загрузить все снапшоты при открытии монитора
  useEffect(() => {
    if (monitorModalVisible && monitoringSwitch) {
      // Загружаем снапшоты для всех онлайн камер
      const onlineCameras = monitoringSwitch.cameras.filter(c => c.current_status === 'online');
      onlineCameras.forEach(camera => {
        loadCameraSnapshot(camera);
      });
    } else if (!monitorModalVisible) {
      // Очищаем снапшоты при закрытии монитора
      setCameraSnapshots({});
    }
  }, [monitorModalVisible, monitoringSwitch]);

  useEffect(() => {
    loadNetworkMap();

    if (api) {
      api.on('device-status-changed', handleStatusUpdate);
      api.on('device-added', loadNetworkMap);
      api.on('device-updated', loadNetworkMap);
      api.on('device-deleted', loadNetworkMap);

      return () => {
        api.removeListener('device-status-changed', handleStatusUpdate);
        api.removeListener('device-added', loadNetworkMap);
        api.removeListener('device-updated', loadNetworkMap);
        api.removeListener('device-deleted', loadNetworkMap);
      };
    }
  }, [api]);

  const loadNetworkMap = async () => {
    if (!api) return;

    setLoading(true);
    try {
      const response = await api.database.getDevices();
      if (response.success) {
        const devices: Device[] = response.data;

        // Получаем коммутаторы
        const switches = devices.filter(d => d.type === 'switch' || d.type === 'router');

        // Получаем все камеры
        const cameras = devices.filter(d => d.type === 'camera');

        // Группируем камеры по коммутаторам
        const switchMap: SwitchWithCameras[] = switches.map(sw => ({
          switch: sw,
          cameras: cameras.filter(cam => cam.parent_device_id === sw.id)
            .sort((a, b) => (a.port_number || 0) - (b.port_number || 0))
        }));

        // Камеры без привязки
        const unconnected = cameras.filter(cam => !cam.parent_device_id);

        setSwitchesWithCameras(switchMap);
        setUnconnectedCameras(unconnected);
      }
    } catch (error) {
      console.error('Error loading network map:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = (data: any) => {
    setSwitchesWithCameras(prev => prev.map(item => ({
      switch: item.switch.id === data.device_id
        ? { ...item.switch, current_status: data.status, last_response_time: data.response_time }
        : item.switch,
      cameras: item.cameras.map(cam =>
        cam.id === data.device_id
          ? { ...cam, current_status: data.status, last_response_time: data.response_time }
          : cam
      )
    })));

    setUnconnectedCameras(prev => prev.map(cam =>
      cam.id === data.device_id
        ? { ...cam, current_status: data.status, last_response_time: data.response_time }
        : cam
    ));
  };

  // PoE Control Functions
  const loadPoEStatus = async (switchId: number) => {
    if (!api) return;

    const key = `load-${switchId}`;
    setPoeLoading(prev => ({ ...prev, [key]: true }));

    console.log(`[PoE] Loading status for switch ID: ${switchId}`);

    try {
      const response = await api.snmp.getPoEStatus(switchId);
      console.log(`[PoE] Response:`, response);

      if (response.success) {
        const data = response.data as PoEStatusResponse;
        setPoeStatus(prev => ({
          ...prev,
          [switchId]: data.ports
        }));

        // Сохраняем информацию о поддержке статуса
        setPoeStatusSupported(prev => ({
          ...prev,
          [switchId]: data.statusSupported !== false
        }));

        if (data.statusSupported === false) {
          message.info(data.message || 'Модель не поддерживает чтение статуса PoE');
        } else {
          message.success('Статус PoE загружен');
        }
      } else {
        console.error(`[PoE] Error:`, response.error);
        message.error(`Ошибка SNMP: ${response.error}`);
      }
    } catch (error) {
      console.error('Error loading PoE status:', error);
      message.error('Ошибка загрузки статуса PoE');
    } finally {
      setPoeLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handlePoEToggle = async (switchId: number, port: number, currentState: boolean) => {
    if (!api) return;

    const key = `toggle-${switchId}-${port}`;
    setPoeLoading(prev => ({ ...prev, [key]: true }));

    try {
      const response = await api.snmp.setPoE(switchId, port, !currentState);
      if (response.success) {
        message.success(`PoE ${!currentState ? 'включен' : 'выключен'} на порту ${port}`);
        // Reload PoE status
        await loadPoEStatus(switchId);
      } else {
        message.error(`Ошибка: ${response.error}`);
      }
    } catch (error) {
      message.error('Ошибка SNMP соединения');
    } finally {
      setPoeLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handlePoEReset = async (switchId: number, port: number, cameraName?: string) => {
    if (!api) return;

    const key = `reset-${switchId}-${port}`;
    setPoeLoading(prev => ({ ...prev, [key]: true }));

    message.loading({
      content: `Перезагрузка PoE на порту ${port}...`,
      key: 'poe-reset',
      duration: 0
    });

    try {
      const response = await api.snmp.resetPoE(switchId, port);
      if (response.success) {
        message.success({
          content: `PoE перезагружен на порту ${port}${cameraName ? ` (${cameraName})` : ''}`,
          key: 'poe-reset'
        });
        // Reload PoE status
        await loadPoEStatus(switchId);
      } else {
        message.error({
          content: `Ошибка: ${response.error}`,
          key: 'poe-reset'
        });
      }
    } catch (error) {
      message.error({
        content: 'Ошибка SNMP соединения',
        key: 'poe-reset'
      });
    } finally {
      setPoeLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const getPortPoEStatus = (switchId: number, port: number): PoEPortStatus | undefined => {
    const switchPoeStatus = poeStatus[switchId];
    if (!switchPoeStatus) return undefined;
    return switchPoeStatus.find(p => p.port === port);
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

  const getStatusColor = (status?: string): 'success' | 'error' | 'warning' | 'default' => {
    switch (status) {
      case 'online': return 'success';
      case 'offline': return 'error';
      case 'warning': return 'warning';
      default: return 'default';
    }
  };

  // Открыть монитор камер для коммутатора
  const openCameraMonitor = (item: SwitchWithCameras) => {
    setMonitoringSwitch(item);
    setMonitorModalVisible(true);
  };

  // Формирование URL потока камеры
  const getCameraStreamUrl = (camera: Device): string => {
    // Если есть заданный stream_url - используем его
    if (camera.stream_url) {
      return camera.stream_url;
    }

    // Автоматическое формирование URL на основе типа потока
    const login = camera.camera_login || 'admin';
    const password = camera.camera_password || '';
    const ip = camera.ip;

    if (camera.stream_type === 'rtsp') {
      // RTSP формат: rtsp://login:password@ip:554/stream
      const auth = password ? `${login}:${password}@` : `${login}@`;
      return `rtsp://${auth}${ip}:554/stream`;
    } else if (camera.stream_type === 'onvif') {
      // ONVIF формат: http://login:password@ip/onvif/snapshot
      const auth = password ? `${login}:${password}@` : '';
      return `http://${auth}${ip}/onvif/snapshot`;
    } else {
      // HTTP формат: http://ip/cgi-bin/snapshot.cgi или /video.mjpg
      // Большинство камер используют snapshot
      const auth = password ? `${login}:${password}@` : '';
      return `http://${auth}${ip}/cgi-bin/snapshot.cgi`;
    }
  };

  // Рендер ячейки камеры в мониторе
  const renderCameraCell = (camera: Device | null, portNumber: number) => {
    if (!camera) {
      // Свободный порт
      return (
        <div
          style={{
            width: '100%',
            aspectRatio: '16/9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: 8,
            color: '#8c8c8c',
            flexDirection: 'column',
            border: '1px dashed rgba(255,255,255,0.1)'
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 8 }}>—</div>
          <div>Порт {portNumber}</div>
          <div style={{ fontSize: 12 }}>Не подключено</div>
        </div>
      );
    }

    // Камера без видео или оффлайн
    if (camera.current_status !== 'online') {
      return (
        <div
          style={{
            width: '100%',
            aspectRatio: '16/9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255, 77, 79, 0.1)',
            borderRadius: 8,
            color: '#ff4d4f',
            flexDirection: 'column',
            border: '1px solid rgba(255, 77, 79, 0.3)'
          }}
        >
          <CloseCircleOutlined style={{ fontSize: 48, marginBottom: 8 }} />
          <div style={{ fontWeight: 500 }}>{camera.name}</div>
          <div style={{ fontSize: 12 }}>Нет связи</div>
        </div>
      );
    }

    // Камера онлайн - показываем изображение через IPC
    const deviceId = camera.id!;
    const snapshot = cameraSnapshots[deviceId];

    // Состояние загрузки
    if (snapshot?.loading) {
      return (
        <div
          style={{
            width: '100%',
            aspectRatio: '16/9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000',
            borderRadius: 8,
            color: '#fff',
            flexDirection: 'column',
            position: 'relative'
          }}
        >
          <Spin indicator={<LoadingOutlined style={{ fontSize: 36 }} spin />} />
          <div style={{ marginTop: 12, fontSize: 12 }}>Загрузка...</div>
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '4px 8px',
              backgroundColor: 'rgba(0,0,0,0.6)',
              color: '#fff',
              fontSize: 12
            }}
          >
            <Badge status="processing" /> {camera.name} (Порт {camera.port_number})
          </div>
        </div>
      );
    }

    // Ошибка загрузки
    if (snapshot?.error) {
      return (
        <div
          style={{
            width: '100%',
            aspectRatio: '16/9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255, 77, 79, 0.1)',
            borderRadius: 8,
            color: '#ff4d4f',
            flexDirection: 'column',
            border: '1px solid rgba(255, 77, 79, 0.3)',
            position: 'relative'
          }}
        >
          <CloseCircleOutlined style={{ fontSize: 36, marginBottom: 8 }} />
          <div style={{ fontWeight: 500, marginBottom: 4 }}>{camera.name}</div>
          <div style={{ fontSize: 11, textAlign: 'center', padding: '0 8px', maxWidth: '100%', overflow: 'hidden' }}>
            {snapshot.error.length > 50 ? snapshot.error.substring(0, 50) + '...' : snapshot.error}
          </div>
          <Button
            size="small"
            type="link"
            icon={<ReloadOutlined />}
            onClick={() => loadCameraSnapshot(camera)}
            style={{ marginTop: 8, color: '#ff4d4f' }}
          >
            Повторить
          </Button>
        </div>
      );
    }

    // Снапшот загружен успешно
    if (snapshot?.data) {
      return (
        <div
          style={{
            width: '100%',
            aspectRatio: '16/9',
            position: 'relative',
            borderRadius: 8,
            overflow: 'hidden',
            backgroundColor: '#000'
          }}
        >
          <img
            src={snapshot.data}
            alt={camera.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain'
            }}
          />
          {/* Кнопка обновления */}
          <Button
            size="small"
            type="text"
            icon={<ReloadOutlined />}
            onClick={() => loadCameraSnapshot(camera)}
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              color: '#fff',
              backgroundColor: 'rgba(0,0,0,0.5)',
              border: 'none'
            }}
          />
          {/* Название камеры */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '4px 8px',
              backgroundColor: 'rgba(0,0,0,0.6)',
              color: '#fff',
              fontSize: 12
            }}
          >
            <Badge status="success" /> {camera.name} (Порт {camera.port_number})
          </div>
        </div>
      );
    }

    // Снапшот еще не загружен - показываем ожидание
    return (
      <div
        style={{
          width: '100%',
          aspectRatio: '16/9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000',
          borderRadius: 8,
          color: '#8c8c8c',
          flexDirection: 'column',
          position: 'relative'
        }}
      >
        <VideoCameraOutlined style={{ fontSize: 36, marginBottom: 8 }} />
        <div style={{ fontSize: 12 }}>Ожидание...</div>
        <Button
          size="small"
          type="link"
          icon={<ReloadOutlined />}
          onClick={() => loadCameraSnapshot(camera)}
          style={{ marginTop: 8 }}
        >
          Загрузить
        </Button>
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '4px 8px',
            backgroundColor: 'rgba(0,0,0,0.6)',
            color: '#fff',
            fontSize: 12
          }}
        >
          <Badge status="default" /> {camera.name} (Порт {camera.port_number})
        </div>
      </div>
    );
  };

  // Check if switch supports PoE control (only TFortis for now)
  const isTFortisSwitch = (sw: Device): boolean => {
    return sw.vendor?.toLowerCase() === 'tfortis';
  };

  // Get TFortis model config for a switch
  const getTFortisConfig = (sw: Device) => {
    if (!isTFortisSwitch(sw)) return null;
    return getTFortisModelConfig(sw.model);
  };

  // PoE Control Popover Content
  const renderPoEPopover = (sw: Device, port: number, camera?: Device) => {
    const switchId = sw.id!;
    const poePort = getPortPoEStatus(switchId, port);
    const isToggleLoading = poeLoading[`toggle-${switchId}-${port}`];
    const isResetLoading = poeLoading[`reset-${switchId}-${port}`];
    const isLoadingStatus = poeLoading[`load-${switchId}`];
    const supportsPoe = isTFortisSwitch(sw);
    const modelConfig = getTFortisConfig(sw);
    const statusSupported = poeStatusSupported[switchId] !== false;

    return (
      <div style={{ width: 250 }}>
        {camera ? (
          <>
            <div style={{ marginBottom: 8 }}>
              <VideoCameraOutlined style={{ marginRight: 6, color: '#1890ff' }} />
              <strong style={{ color: 'inherit' }}>{camera.name}</strong>
            </div>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8 }}>
              <div>IP: {camera.ip}</div>
              <div>Статус: {camera.current_status === 'online' ? '🟢 В сети' : '🔴 Недоступно'}</div>
              {camera.location && <div>Расположение: {camera.location}</div>}
            </div>
          </>
        ) : (
          <div style={{ marginBottom: 8, color: '#8c8c8c' }}>
            Порт {port} - свободен
          </div>
        )}

        {supportsPoe ? (
          <>
            <Divider style={{ margin: '8px 0' }} />

            {/* Model info */}
            {sw.model && (
              <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 8 }}>
                Модель: <Tag style={{ fontSize: 11 }}>{sw.model}</Tag>
              </div>
            )}

            {/* PoE Status */}
            <div style={{ marginBottom: 12 }}>
              <ThunderboltOutlined style={{ marginRight: 6, color: '#faad14' }} />
              <strong style={{ color: 'inherit' }}>PoE управление</strong>
              {isLoadingStatus && <LoadingOutlined style={{ marginLeft: 8 }} spin />}
            </div>

            {poePort ? (
              <>
                {/* Если модель не поддерживает чтение статуса */}
                {poePort.status === 'unsupported' || !statusSupported ? (
                  <>
                    <div style={{
                      backgroundColor: 'rgba(250, 173, 20, 0.1)',
                      padding: '8px 12px',
                      borderRadius: 6,
                      marginBottom: 12,
                      fontSize: 12,
                      color: '#d48806'
                    }}>
                      <WarningOutlined style={{ marginRight: 6 }} />
                      Модель не поддерживает чтение статуса PoE.
                      Доступна только перезагрузка.
                    </div>

                    <Button
                      size="small"
                      type="primary"
                      icon={isResetLoading ? <LoadingOutlined spin /> : <SyncOutlined />}
                      onClick={() => handlePoEReset(switchId, port, camera?.name)}
                      disabled={isResetLoading}
                      block
                    >
                      Перезагрузить PoE
                    </Button>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span>Статус:</span>
                      <Tag color={poePort.status === 'on' ? 'green' : 'red'}>
                        {poePort.status === 'on' ? 'Включен' : 'Выключен'}
                      </Tag>
                    </div>
                    {poePort.power > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span>Мощность:</span>
                        <Tag color="blue">{poePort.power} W</Tag>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        size="small"
                        icon={isToggleLoading ? <LoadingOutlined spin /> : <PoweroffOutlined />}
                        onClick={() => handlePoEToggle(switchId, port, poePort.status === 'on')}
                        disabled={isToggleLoading || isResetLoading}
                        danger={poePort.status === 'on'}
                      >
                        {poePort.status === 'on' ? 'Выкл' : 'Вкл'}
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        icon={isResetLoading ? <LoadingOutlined spin /> : <SyncOutlined />}
                        onClick={() => handlePoEReset(switchId, port, camera?.name)}
                        disabled={isToggleLoading || isResetLoading}
                      >
                        Перезагрузить
                      </Button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <Button
                  size="small"
                  icon={isLoadingStatus ? <LoadingOutlined spin /> : <ReloadOutlined />}
                  onClick={() => loadPoEStatus(switchId)}
                  disabled={isLoadingStatus}
                >
                  Загрузить статус PoE
                </Button>
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c', fontStyle: 'italic' }}>
            <ThunderboltOutlined style={{ marginRight: 4 }} />
            PoE управление доступно только для TFortis
          </div>
        )}
      </div>
    );
  };

  const renderPortGrid = (sw: Device, cameras: Device[]) => {
    const portCount = sw.port_count || 8;
    const ports: React.ReactNode[] = [];

    for (let i = 1; i <= portCount; i++) {
      const camera = cameras.find(c => c.port_number === i);
      const popoverKey = `${sw.id}-${i}`;

      ports.push(
        <Popover
          key={i}
          content={renderPoEPopover(sw, i, camera)}
          title={`Порт ${i}`}
          trigger="click"
          open={activePopover === popoverKey}
          onOpenChange={(open) => {
            if (open) {
              setActivePopover(popoverKey);
              // Load PoE status when opening popover (only for TFortis)
              if (isTFortisSwitch(sw) && !poeStatus[sw.id!]) {
                loadPoEStatus(sw.id!);
              }
            } else {
              setActivePopover(null);
            }
          }}
        >
          <div
            className={`port-slot ${camera ? 'occupied' : 'empty'} ${camera?.current_status || ''}`}
            style={{
              width: 40,
              height: 40,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: 4,
              cursor: 'pointer',
              backgroundColor: camera
                ? (camera.current_status === 'online' ? '#52c41a' :
                   camera.current_status === 'offline' ? '#ff4d4f' : '#d9d9d9')
                : 'transparent',
              border: camera ? 'none' : '2px dashed #d9d9d9',
              color: camera ? '#fff' : '#bfbfbf',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}
          >
            {i}
          </div>
        </Popover>
      );
    }

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 12 }}>
        {ports}
      </div>
    );
  };

  const renderCameraList = (cameras: Device[]) => {
    if (cameras.length === 0) {
      return <div style={{ color: '#8c8c8c', fontStyle: 'italic' }}>Нет подключенных камер</div>;
    }

    return (
      <div style={{ marginTop: 12 }}>
        {cameras.map(camera => (
          <div
            key={camera.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px 12px',
              marginBottom: 8,
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderRadius: 6,
              borderLeft: `3px solid ${camera.current_status === 'online' ? '#52c41a' : '#ff4d4f'}`
            }}
          >
            <Badge status={getStatusColor(camera.current_status)} />
            <VideoCameraOutlined style={{ marginRight: 8, color: '#1890ff' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, color: 'inherit' }}>{camera.name}</div>
              <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                {camera.ip} • Порт {camera.port_number}
                {camera.location && ` • ${camera.location}`}
              </div>
            </div>
            <div>
              {camera.last_response_time && camera.current_status === 'online' && (
                <Tag color="green">{camera.last_response_time}мс</Tag>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Фильтрация данных по поисковому запросу
  const filteredSwitchesWithCameras = switchesWithCameras.filter(item => {
    if (!searchText.trim()) return true;
    const search = searchText.toLowerCase();
    // Поиск по коммутатору
    if (item.switch.name.toLowerCase().includes(search)) return true;
    if (item.switch.ip.toLowerCase().includes(search)) return true;
    if (item.switch.location?.toLowerCase().includes(search)) return true;
    // Поиск по камерам
    return item.cameras.some(cam =>
      cam.name.toLowerCase().includes(search) ||
      cam.ip.toLowerCase().includes(search) ||
      cam.location?.toLowerCase().includes(search)
    );
  });

  const filteredUnconnectedCameras = unconnectedCameras.filter(cam => {
    if (!searchText.trim()) return true;
    const search = searchText.toLowerCase();
    return cam.name.toLowerCase().includes(search) ||
      cam.ip.toLowerCase().includes(search) ||
      cam.location?.toLowerCase().includes(search);
  });

  const getCollapseItems = () => {
    return filteredSwitchesWithCameras.map(item => ({
      key: String(item.switch.id),
      label: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {getStatusIcon(item.switch.current_status)}
            <ApiOutlined style={{ marginLeft: 8, marginRight: 8, color: '#1890ff' }} />
            <span style={{ fontWeight: 500, color: 'inherit' }}>{item.switch.name}</span>
            <span style={{ color: '#8c8c8c', marginLeft: 8 }}>({item.switch.ip})</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              type="primary"
              size="small"
              icon={<EyeOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                openCameraMonitor(item);
              }}
            >
              Монитор
            </Button>
            <Tag color={item.cameras.length > 0 ? 'blue' : 'default'}>
              {item.cameras.length} / {item.switch.port_count || 0} камер
            </Tag>
            {item.switch.location && (
              <Tag>{item.switch.location}</Tag>
            )}
          </div>
        </div>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 16 }}>
            <strong style={{ color: 'inherit' }}>Схема портов:</strong>
            {renderPortGrid(item.switch, item.cameras)}
          </div>
          <div>
            <strong style={{ color: 'inherit' }}>Подключенные камеры:</strong>
            {renderCameraList(item.cameras)}
          </div>
        </div>
      )
    }));
  };

  return (
    <div>
      <Card
        title="Карта сети"
        extra={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input
              placeholder="Поиск..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              style={{ width: 200 }}
            />
            <Button
              icon={expandAll ? <CompressOutlined /> : <ExpandOutlined />}
              onClick={() => setExpandAll(!expandAll)}
            >
              {expandAll ? 'Свернуть все' : 'Развернуть все'}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadNetworkMap}>
              Обновить
            </Button>
          </div>
        }
      >
        <Spin spinning={loading}>
          {switchesWithCameras.length === 0 && unconnectedCameras.length === 0 ? (
            <Empty
              description="Нет устройств для отображения"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : filteredSwitchesWithCameras.length === 0 && filteredUnconnectedCameras.length === 0 && searchText.trim() ? (
            <Empty
              description={`По запросу "${searchText}" ничего не найдено`}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <>
              {/* Статистика */}
              <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={6}>
                  <Card size="small" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff' }}>
                      {filteredSwitchesWithCameras.length}
                    </div>
                    <div style={{ color: '#8c8c8c' }}>Коммутаторов</div>
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a' }}>
                      {filteredSwitchesWithCameras.reduce((acc, item) => acc + item.cameras.length, 0)}
                    </div>
                    <div style={{ color: '#8c8c8c' }}>Подключенных камер</div>
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#faad14' }}>
                      {filteredUnconnectedCameras.length}
                    </div>
                    <div style={{ color: '#8c8c8c' }}>Без привязки</div>
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#722ed1' }}>
                      {filteredSwitchesWithCameras.reduce((acc, item) => acc + (item.switch.port_count || 0), 0)}
                    </div>
                    <div style={{ color: '#8c8c8c' }}>Всего портов</div>
                  </Card>
                </Col>
              </Row>

              {/* Коммутаторы с камерами */}
              {filteredSwitchesWithCameras.length > 0 && (
                <Collapse
                  defaultActiveKey={expandAll ? filteredSwitchesWithCameras.map(item => String(item.switch.id)) : []}
                  activeKey={expandAll ? filteredSwitchesWithCameras.map(item => String(item.switch.id)) : undefined}
                  onChange={() => setExpandAll(false)}
                  items={getCollapseItems()}
                  style={{ marginBottom: 24 }}
                />
              )}

              {/* Камеры без привязки */}
              {filteredUnconnectedCameras.length > 0 && (
                <Card
                  title={
                    <span>
                      <WarningOutlined style={{ color: '#faad14', marginRight: 8 }} />
                      Камеры без привязки к коммутатору
                    </span>
                  }
                  size="small"
                >
                  <Row gutter={[16, 16]}>
                    {filteredUnconnectedCameras.map(camera => (
                      <Col key={camera.id} xs={24} sm={12} md={8} lg={6}>
                        <Card
                          size="small"
                          style={{
                            borderLeft: `3px solid ${camera.current_status === 'online' ? '#52c41a' : '#ff4d4f'}`
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {getStatusIcon(camera.current_status)}
                            <VideoCameraOutlined style={{ marginLeft: 8, color: '#1890ff' }} />
                            <span style={{ marginLeft: 8, fontWeight: 500, color: 'inherit' }}>{camera.name}</span>
                          </div>
                          <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
                            <div>IP: {camera.ip}</div>
                            {camera.location && <div>Расположение: {camera.location}</div>}
                          </div>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                </Card>
              )}
            </>
          )}
        </Spin>
      </Card>

      {/* Модальное окно мониторинга камер */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <EyeOutlined style={{ marginRight: 8 }} />
              Монитор камер: {monitoringSwitch?.switch.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, color: '#8c8c8c' }}>Колонок:</span>
              <Select
                value={gridColumns}
                onChange={setGridColumns}
                size="small"
                style={{ width: 70 }}
                options={[
                  { value: 2, label: '2' },
                  { value: 3, label: '3' },
                  { value: 4, label: '4' },
                  { value: 6, label: '6' },
                ]}
              />
            </div>
          </div>
        }
        open={monitorModalVisible}
        onCancel={() => {
          setMonitorModalVisible(false);
          setMonitoringSwitch(null);
        }}
        footer={null}
        width="95%"
        style={{ top: 20 }}
        styles={{ body: { maxHeight: 'calc(100vh - 200px)', overflow: 'auto' } }}
      >
        {monitoringSwitch && (
          <div>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Tag color="blue">IP: {monitoringSwitch.switch.ip}</Tag>
                {monitoringSwitch.switch.location && (
                  <Tag>{monitoringSwitch.switch.location}</Tag>
                )}
                <Tag color={monitoringSwitch.switch.current_status === 'online' ? 'success' : 'error'}>
                  {monitoringSwitch.switch.current_status === 'online' ? 'В сети' : 'Недоступно'}
                </Tag>
              </div>
              <div style={{ color: 'inherit' }}>
                Камер подключено: {monitoringSwitch.cameras.length} / {monitoringSwitch.switch.port_count || 0}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
                gap: 16,
              }}
            >
              {Array.from({ length: monitoringSwitch.switch.port_count || 0 }, (_, i) => i + 1).map(portNumber => {
                const camera = monitoringSwitch.cameras.find(c => c.port_number === portNumber);
                return (
                  <div key={portNumber}>
                    {renderCameraCell(camera || null, portNumber)}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
