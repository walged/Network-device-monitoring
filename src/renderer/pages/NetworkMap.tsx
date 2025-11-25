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
  Select
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
  EyeOutlined
} from '@ant-design/icons';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { Device } from '@shared/types';

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
  const [gridColumns, setGridColumns] = useState<number>(4); // Количество колонок в сетке

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
            height: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f5f5f5',
            borderRadius: 8,
            color: '#bfbfbf',
            flexDirection: 'column'
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
            height: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#fff2f0',
            borderRadius: 8,
            color: '#ff4d4f',
            flexDirection: 'column',
            border: '1px solid #ffccc7'
          }}
        >
          <CloseCircleOutlined style={{ fontSize: 48, marginBottom: 8 }} />
          <div style={{ fontWeight: 500 }}>{camera.name}</div>
          <div style={{ fontSize: 12 }}>Нет видео или связи</div>
        </div>
      );
    }

    // Камера онлайн - показываем изображение
    const streamUrl = getCameraStreamUrl(camera);

    return (
      <div
        style={{
          width: '100%',
          height: 200,
          position: 'relative',
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: '#000'
        }}
      >
        <img
          src={streamUrl}
          alt={camera.name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain'
          }}
          onError={(e) => {
            // При ошибке загрузки показываем заглушку
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
          }}
        />
        <div
          className="hidden"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#fff2f0',
            color: '#ff4d4f',
            flexDirection: 'column'
          }}
        >
          <CloseCircleOutlined style={{ fontSize: 48, marginBottom: 8 }} />
          <div style={{ fontWeight: 500 }}>{camera.name}</div>
          <div style={{ fontSize: 12 }}>Нет видео или связи</div>
        </div>
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
  };

  const renderPortGrid = (sw: Device, cameras: Device[]) => {
    const portCount = sw.port_count || 8;
    const ports: React.ReactNode[] = [];

    for (let i = 1; i <= portCount; i++) {
      const camera = cameras.find(c => c.port_number === i);

      if (camera) {
        ports.push(
          <Tooltip
            key={i}
            title={
              <div>
                <div><strong>{camera.name}</strong></div>
                <div>IP: {camera.ip}</div>
                <div>Статус: {camera.current_status === 'online' ? 'В сети' : 'Недоступно'}</div>
                {camera.location && <div>Расположение: {camera.location}</div>}
              </div>
            }
          >
            <div
              className={`port-slot occupied ${camera.current_status}`}
              style={{
                width: 40,
                height: 40,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: 4,
                cursor: 'pointer',
                backgroundColor: camera.current_status === 'online' ? '#52c41a' :
                  camera.current_status === 'offline' ? '#ff4d4f' : '#d9d9d9',
                color: '#fff',
                fontWeight: 'bold'
              }}
            >
              {i}
            </div>
          </Tooltip>
        );
      } else {
        ports.push(
          <Tooltip key={i} title={`Порт ${i} - свободен`}>
            <div
              className="port-slot empty"
              style={{
                width: 40,
                height: 40,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: 4,
                border: '2px dashed #d9d9d9',
                color: '#bfbfbf'
              }}
            >
              {i}
            </div>
          </Tooltip>
        );
      }
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
              backgroundColor: 'rgba(0,0,0,0.02)',
              borderRadius: 6,
              borderLeft: `3px solid ${camera.current_status === 'online' ? '#52c41a' : '#ff4d4f'}`
            }}
          >
            <Badge status={getStatusColor(camera.current_status)} />
            <VideoCameraOutlined style={{ marginRight: 8, color: '#1890ff' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{camera.name}</div>
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

  const getCollapseItems = () => {
    return switchesWithCameras.map(item => ({
      key: String(item.switch.id),
      label: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {getStatusIcon(item.switch.current_status)}
            <ApiOutlined style={{ marginLeft: 8, marginRight: 8, color: '#1890ff' }} />
            <span style={{ fontWeight: 500 }}>{item.switch.name}</span>
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
            <strong>Схема портов:</strong>
            {renderPortGrid(item.switch, item.cameras)}
          </div>
          <div>
            <strong>Подключенные камеры:</strong>
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
          <div style={{ display: 'flex', gap: 8 }}>
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
          ) : (
            <>
              {/* Статистика */}
              <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={6}>
                  <Card size="small" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff' }}>
                      {switchesWithCameras.length}
                    </div>
                    <div style={{ color: '#8c8c8c' }}>Коммутаторов</div>
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a' }}>
                      {switchesWithCameras.reduce((acc, item) => acc + item.cameras.length, 0)}
                    </div>
                    <div style={{ color: '#8c8c8c' }}>Подключенных камер</div>
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#faad14' }}>
                      {unconnectedCameras.length}
                    </div>
                    <div style={{ color: '#8c8c8c' }}>Без привязки</div>
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#722ed1' }}>
                      {switchesWithCameras.reduce((acc, item) => acc + (item.switch.port_count || 0), 0)}
                    </div>
                    <div style={{ color: '#8c8c8c' }}>Всего портов</div>
                  </Card>
                </Col>
              </Row>

              {/* Коммутаторы с камерами */}
              {switchesWithCameras.length > 0 && (
                <Collapse
                  defaultActiveKey={expandAll ? switchesWithCameras.map(item => String(item.switch.id)) : []}
                  activeKey={expandAll ? switchesWithCameras.map(item => String(item.switch.id)) : undefined}
                  onChange={() => setExpandAll(false)}
                  items={getCollapseItems()}
                  style={{ marginBottom: 24 }}
                />
              )}

              {/* Камеры без привязки */}
              {unconnectedCameras.length > 0 && (
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
                    {unconnectedCameras.map(camera => (
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
                            <span style={{ marginLeft: 8, fontWeight: 500 }}>{camera.name}</span>
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
              <div>
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
