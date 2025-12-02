import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  Button,
  Select,
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  Tooltip,
  Empty,
  Spin,
  Space,
  Popconfirm,
  Tag,
  List,
  Badge
} from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  SaveOutlined,
  ApiOutlined,
  VideoCameraOutlined,
  DesktopOutlined,
  CloudServerOutlined,
  QuestionOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DragOutlined,
  ZoomInOutlined,
  ZoomOutOutlined
} from '@ant-design/icons';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { Device } from '@shared/types';

const { Option } = Select;

interface FloorMap {
  id: number;
  name: string;
  image_path?: string;
  width: number;
  height: number;
}

interface DeviceOnMap extends Device {
  map_x?: number;
  map_y?: number;
  floor_map_id?: number;
}

export const VisualMap: React.FC = () => {
  const { api } = useElectronAPI();
  const canvasRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [maps, setMaps] = useState<FloorMap[]>([]);
  const [selectedMapId, setSelectedMapId] = useState<number | null>(null);
  const [selectedMap, setSelectedMap] = useState<FloorMap | null>(null);
  const [mapImage, setMapImage] = useState<string | null>(null);
  const [devicesOnMap, setDevicesOnMap] = useState<DeviceOnMap[]>([]);
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [availableDevices, setAvailableDevices] = useState<Device[]>([]);

  // Modal states
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [editingMap, setEditingMap] = useState<FloorMap | null>(null);
  const [form] = Form.useForm();

  // Drag state
  const [draggingDevice, setDraggingDevice] = useState<DeviceOnMap | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Zoom state
  const [zoom, setZoom] = useState(1);
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 800, height: 600 });

  // Ref для контейнера карты (для wheel event)
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMaps();
    loadAllDevices();
  }, [api]);

  useEffect(() => {
    if (selectedMapId) {
      loadMapDetails(selectedMapId);
    } else {
      setSelectedMap(null);
      setMapImage(null);
      setDevicesOnMap([]);
      setZoom(1);
    }
  }, [selectedMapId]);

  useEffect(() => {
    // Вычисляем устройства, которые можно добавить на карту
    const onMapIds = new Set(devicesOnMap.map(d => d.id));
    setAvailableDevices(allDevices.filter(d => !onMapIds.has(d.id)));
  }, [allDevices, devicesOnMap]);

  const loadMaps = async () => {
    if (!api) return;
    try {
      const response = await api.maps.getAll();
      if (response.success) {
        setMaps(response.data);
        if (response.data.length > 0 && !selectedMapId) {
          setSelectedMapId(response.data[0].id);
        }
      }
    } catch (error) {
      console.error('Error loading maps:', error);
    }
  };

  const loadAllDevices = async () => {
    if (!api) return;
    try {
      const response = await api.database.getDevices();
      if (response.success) {
        setAllDevices(response.data);
      }
    } catch (error) {
      console.error('Error loading devices:', error);
    }
  };

  const loadMapDetails = async (mapId: number) => {
    if (!api) return;
    setLoading(true);
    try {
      // Загружаем карту
      const mapResponse = await api.maps.get(mapId);
      if (mapResponse.success && mapResponse.data) {
        setSelectedMap(mapResponse.data);

        // Загружаем изображение если есть
        if (mapResponse.data.image_path) {
          const imageResponse = await api.maps.getImage(mapResponse.data.image_path);
          if (imageResponse.success) {
            setMapImage(imageResponse.data);
            // Загружаем изображение для определения его размеров
            const img = new Image();
            img.onload = () => {
              setImageNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
            };
            img.src = `data:image/jpeg;base64,${imageResponse.data}`;
          }
        } else {
          setMapImage(null);
          setImageNaturalSize({ width: 800, height: 600 });
        }
      }

      // Загружаем устройства на карте
      const devicesResponse = await api.maps.getDevices(mapId);
      if (devicesResponse.success) {
        setDevicesOnMap(devicesResponse.data);
      }
    } catch (error) {
      console.error('Error loading map details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMap = async (values: any) => {
    if (!api) return;
    try {
      if (editingMap) {
        await api.maps.update(editingMap.id, values);
        message.success('Карта обновлена');
      } else {
        const response = await api.maps.add(values);
        if (response.success) {
          setSelectedMapId(response.data.id);
        }
        message.success('Карта создана');
      }
      setMapModalVisible(false);
      form.resetFields();
      setEditingMap(null);
      loadMaps();
    } catch (error) {
      message.error('Ошибка сохранения карты');
    }
  };

  const handleDeleteMap = async (mapId: number) => {
    if (!api) return;
    try {
      await api.maps.delete(mapId);
      message.success('Карта удалена');
      if (selectedMapId === mapId) {
        setSelectedMapId(null);
      }
      loadMaps();
    } catch (error) {
      message.error('Ошибка удаления карты');
    }
  };

  const handleUploadImage = async () => {
    if (!api || !selectedMapId) return;
    try {
      const response = await api.maps.uploadImage(selectedMapId);
      if (response.success) {
        message.success('Изображение загружено');
        loadMapDetails(selectedMapId);
      }
    } catch (error) {
      message.error('Ошибка загрузки изображения');
    }
  };

  const handleAddDeviceToMap = async (deviceId: number) => {
    if (!api || !selectedMapId || !selectedMap) return;

    // Добавляем устройство в центр карты
    const x = Math.floor(selectedMap.width / 2);
    const y = Math.floor(selectedMap.height / 2);

    try {
      await api.maps.updateDevicePosition(deviceId, selectedMapId, x, y);
      message.success('Устройство добавлено на карту');
      loadMapDetails(selectedMapId);
      loadAllDevices();
    } catch (error) {
      message.error('Ошибка добавления устройства');
    }
  };

  const handleRemoveDeviceFromMap = async (deviceId: number) => {
    if (!api) return;
    try {
      await api.maps.removeDevice(deviceId);
      message.success('Устройство удалено с карты');
      if (selectedMapId) {
        loadMapDetails(selectedMapId);
      }
      loadAllDevices();
    } catch (error) {
      message.error('Ошибка удаления устройства');
    }
  };

  // Zoom handlers
  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.25));
  };

  const handleZoomReset = () => {
    setZoom(1);
  };

  // Обработчик колесика мыши с passive: false
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        setZoom(prev => Math.min(prev + 0.25, 3));
      } else {
        setZoom(prev => Math.max(prev - 0.25, 0.25));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Drag and drop handlers с использованием refs для доступа к актуальным значениям
  const draggingDeviceRef = useRef<DeviceOnMap | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const devicesOnMapRef = useRef<DeviceOnMap[]>([]);

  // Синхронизируем ref с state
  useEffect(() => {
    devicesOnMapRef.current = devicesOnMap;
  }, [devicesOnMap]);

  const handleMouseDown = (e: React.MouseEvent, device: DeviceOnMap) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const offset = {
      x: e.clientX - rect.left - (device.map_x || 0) * zoom,
      y: e.clientY - rect.top - (device.map_y || 0) * zoom
    };

    setDraggingDevice(device);
    draggingDeviceRef.current = device;
    setDragOffset(offset);
    dragOffsetRef.current = offset;
  };

  // Используем document-level события для надежного перетаскивания
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!draggingDeviceRef.current || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      let newX = (e.clientX - rect.left - dragOffsetRef.current.x) / zoom;
      let newY = (e.clientY - rect.top - dragOffsetRef.current.y) / zoom;

      // Ограничиваем координаты
      newX = Math.max(0, Math.min(imageNaturalSize.width - 40, newX));
      newY = Math.max(0, Math.min(imageNaturalSize.height - 40, newY));

      // Обновляем позицию в state для плавного перемещения
      setDevicesOnMap(prev => prev.map(d =>
        d.id === draggingDeviceRef.current?.id ? { ...d, map_x: newX, map_y: newY } : d
      ));
    };

    const handleGlobalMouseUp = async () => {
      if (!draggingDeviceRef.current || !api || !selectedMapId) {
        setDraggingDevice(null);
        draggingDeviceRef.current = null;
        return;
      }

      const device = devicesOnMapRef.current.find(d => d.id === draggingDeviceRef.current?.id);
      if (device && device.map_x !== undefined && device.map_y !== undefined) {
        try {
          await api.maps.updateDevicePosition(device.id!, selectedMapId, device.map_x, device.map_y);
        } catch (error) {
          console.error('Error updating device position:', error);
        }
      }

      setDraggingDevice(null);
      draggingDeviceRef.current = null;
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [api, selectedMapId, zoom, imageNaturalSize]);

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'switch':
      case 'router':
        return <ApiOutlined />;
      case 'camera':
        return <VideoCameraOutlined />;
      case 'server':
        return <CloudServerOutlined />;
      default:
        return <DesktopOutlined />;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'online': return '#52c41a';
      case 'offline': return '#ff4d4f';
      case 'warning': return '#faad14';
      default: return '#d9d9d9';
    }
  };

  // Рисуем линии связи между коммутаторами и камерами
  const renderConnections = () => {
    const lines: React.ReactNode[] = [];

    devicesOnMap.forEach(device => {
      if (device.type === 'camera' && device.parent_device_id) {
        const parentSwitch = devicesOnMap.find(d => d.id === device.parent_device_id);
        if (parentSwitch && parentSwitch.map_x !== undefined && parentSwitch.map_y !== undefined &&
            device.map_x !== undefined && device.map_y !== undefined) {
          const color = device.current_status === 'online' ? '#52c41a' : '#ff4d4f';
          lines.push(
            <line
              key={`line-${device.id}`}
              x1={(parentSwitch.map_x + 20) * zoom}
              y1={(parentSwitch.map_y + 20) * zoom}
              x2={(device.map_x + 20) * zoom}
              y2={(device.map_y + 20) * zoom}
              stroke={color}
              strokeWidth={2 * zoom}
              strokeDasharray={device.current_status === 'offline' ? `${5 * zoom},${5 * zoom}` : undefined}
            />
          );
        }
      }
    });

    return lines;
  };

  return (
    <div>
      <Card
        title="Визуальная карта сети"
        extra={
          <Space>
            <Select
              style={{ width: 200 }}
              placeholder="Выберите карту"
              value={selectedMapId}
              onChange={setSelectedMapId}
              allowClear
            >
              {maps.map(map => (
                <Option key={map.id} value={map.id}>{map.name}</Option>
              ))}
            </Select>
            <Button
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingMap(null);
                form.resetFields();
                setMapModalVisible(true);
              }}
            >
              Новая карта
            </Button>
            {selectedMap && (
              <>
                <Button
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditingMap(selectedMap);
                    form.setFieldsValue(selectedMap);
                    setMapModalVisible(true);
                  }}
                />
                <Button
                  icon={<UploadOutlined />}
                  onClick={handleUploadImage}
                >
                  Загрузить план
                </Button>
                <Popconfirm
                  title="Удалить карту?"
                  onConfirm={() => handleDeleteMap(selectedMap.id)}
                  okText="Да"
                  cancelText="Нет"
                >
                  <Button danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => {
              loadMaps();
              loadAllDevices();
              if (selectedMapId) loadMapDetails(selectedMapId);
            }}>
              Обновить
            </Button>
            {selectedMap && (
              <>
                <Button icon={<ZoomOutOutlined />} onClick={handleZoomOut} disabled={zoom <= 0.25} />
                <Button onClick={handleZoomReset}>{Math.round(zoom * 100)}%</Button>
                <Button icon={<ZoomInOutlined />} onClick={handleZoomIn} disabled={zoom >= 3} />
              </>
            )}
          </Space>
        }
      >
        <Spin spinning={loading}>
          {!selectedMap ? (
            <Empty
              description="Выберите или создайте карту"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <div style={{ display: 'flex', gap: 16, maxHeight: 'calc(100vh - 250px)' }}>
              {/* Панель устройств */}
              <div style={{ width: 250, flexShrink: 0, overflow: 'auto' }}>
                <Card size="small" title="Устройства на карте" style={{ marginBottom: 16 }}>
                  <List
                    size="small"
                    dataSource={devicesOnMap}
                    renderItem={device => (
                      <List.Item
                        actions={[
                          <Tooltip title="Удалить с карты">
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => handleRemoveDeviceFromMap(device.id!)}
                            />
                          </Tooltip>
                        ]}
                      >
                        <List.Item.Meta
                          avatar={
                            <Badge
                              status={device.current_status === 'online' ? 'success' : 'error'}
                            />
                          }
                          title={device.name}
                          description={device.ip}
                        />
                      </List.Item>
                    )}
                    locale={{ emptyText: 'Нет устройств' }}
                  />
                </Card>

                <Card size="small" title="Добавить устройство">
                  <List
                    size="small"
                    dataSource={availableDevices}
                    style={{ maxHeight: 300, overflow: 'auto' }}
                    renderItem={device => (
                      <List.Item
                        actions={[
                          <Tooltip title="Добавить на карту">
                            <Button
                              type="text"
                              size="small"
                              icon={<PlusOutlined />}
                              onClick={() => handleAddDeviceToMap(device.id!)}
                            />
                          </Tooltip>
                        ]}
                      >
                        <List.Item.Meta
                          avatar={getDeviceIcon(device.type)}
                          title={device.name}
                          description={device.ip}
                        />
                      </List.Item>
                    )}
                    locale={{ emptyText: 'Все устройства на карте' }}
                  />
                </Card>
              </div>

              {/* Область карты */}
              <div
                ref={mapContainerRef}
                style={{
                  flex: 1,
                  position: 'relative',
                  overflow: 'auto',
                  border: '1px solid #d9d9d9',
                  borderRadius: 8,
                  backgroundColor: '#f5f5f5'
                }}
              >
                <div
                  ref={canvasRef}
                  style={{
                    position: 'relative',
                    width: imageNaturalSize.width * zoom,
                    height: imageNaturalSize.height * zoom,
                    minWidth: 400,
                    minHeight: 400,
                    backgroundImage: (mapImage && mapImage !== 'null' && mapImage.length > 0) ? `url(data:image/jpeg;base64,${mapImage})` : undefined,
                    backgroundSize: `${imageNaturalSize.width * zoom}px ${imageNaturalSize.height * zoom}px`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'top left',
                    cursor: draggingDevice ? 'grabbing' : 'default'
                  }}
                >
                {/* SVG для линий связи */}
                <svg
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none'
                  }}
                >
                  {renderConnections()}
                </svg>

                {/* Устройства */}
                {devicesOnMap.map(device => (
                  <Tooltip
                    key={device.id}
                    title={
                      <div>
                        <div><strong>{device.name}</strong></div>
                        <div>IP: {device.ip}</div>
                        <div>Тип: {device.type}</div>
                        <div>Статус: {device.current_status === 'online' ? 'В сети' : 'Недоступно'}</div>
                        {device.parent_device_name && (
                          <div>Подключена к: {device.parent_device_name}</div>
                        )}
                      </div>
                    }
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: (device.map_x || 0) * zoom,
                        top: (device.map_y || 0) * zoom,
                        width: 40 * zoom,
                        height: 40 * zoom,
                        borderRadius: 8 * zoom,
                        backgroundColor: getStatusColor(device.current_status),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 20 * zoom,
                        cursor: 'grab',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        transition: draggingDevice?.id === device.id ? 'none' : 'box-shadow 0.2s',
                        zIndex: draggingDevice?.id === device.id ? 100 : 1
                      }}
                      onMouseDown={(e) => handleMouseDown(e, device)}
                    >
                      {getDeviceIcon(device.type)}
                    </div>
                  </Tooltip>
                ))}

                {/* Инструкция если нет изображения */}
                {!mapImage && devicesOnMap.length === 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    color: '#8c8c8c'
                  }}>
                    <UploadOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                    <div>Загрузите план здания и добавьте устройства</div>
                  </div>
                )}
                </div>
              </div>
            </div>
          )}
        </Spin>
      </Card>

      {/* Модальное окно создания/редактирования карты */}
      <Modal
        title={editingMap ? 'Редактировать карту' : 'Создать карту'}
        open={mapModalVisible}
        onCancel={() => {
          setMapModalVisible(false);
          setEditingMap(null);
          form.resetFields();
        }}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateMap}
          initialValues={{ width: 800, height: 600 }}
        >
          <Form.Item
            name="name"
            label="Название карты"
            rules={[{ required: true, message: 'Введите название' }]}
          >
            <Input placeholder="Этаж 1" />
          </Form.Item>

          <Form.Item name="width" noStyle initialValue={800}>
            <Input type="hidden" />
          </Form.Item>

          <Form.Item name="height" noStyle initialValue={600}>
            <Input type="hidden" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingMap ? 'Сохранить' : 'Создать'}
              </Button>
              <Button onClick={() => setMapModalVisible(false)}>Отмена</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
