import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Switch,
  InputNumber,
  Select,
  Button,
  message,
  Tabs,
  Space,
  Divider,
  Alert,
  Row,
  Col,
  Radio
} from 'antd';
import {
  SaveOutlined,
  ReloadOutlined,
  BellOutlined,
  GlobalOutlined,
  ThunderboltOutlined,
  DesktopOutlined,
  ImportOutlined,
  ExportOutlined
} from '@ant-design/icons';
import { useElectronAPI } from '../hooks/useElectronAPI';

const { Option } = Select;
const { TabPane } = Tabs;

export const Settings: React.FC = () => {
  const { api } = useElectronAPI();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Record<string, any>>({});

  useEffect(() => {
    loadSettings();
  }, [api]);

  const loadSettings = async () => {
    if (!api) return;

    setLoading(true);
    try {
      const response = await api.settings.getAll();
      if (response.success) {
        const data = response.data;
        setSettings(data);

        // Преобразуем строковые значения в нужные типы
        form.setFieldsValue({
          theme: data.theme || 'dark',
          language: data.language || 'ru',
          notification_enabled: data.notification_enabled === 'true',
          sound_enabled: data.sound_enabled === 'true',
          monitoring_interval: parseInt(data.monitoring_interval || '60'),
          alert_threshold: parseInt(data.alert_threshold || '3'),
          auto_start: data.auto_start === 'true',
        });
      }
    } catch (error) {
      message.error('Ошибка загрузки настроек');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (values: any) => {
    if (!api) return;

    setLoading(true);
    try {
      // Сохраняем каждую настройку
      for (const [key, value] of Object.entries(values)) {
        await api.settings.set(key, String(value));
      }

      message.success('Настройки сохранены');

      // Применяем тему
      if (values.theme !== settings.theme) {
        applyTheme(values.theme);
      }
    } catch (error) {
      message.error('Ошибка сохранения настроек');
    } finally {
      setLoading(false);
    }
  };

  const applyTheme = (theme: string) => {
    // Здесь можно добавить логику применения темы
    document.body.className = theme === 'dark' ? 'dark-theme' : 'light-theme';
  };

  const handleImport = async () => {
    // Создаем input для выбора файла
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const data = JSON.parse(event.target?.result as string);
            if (api) {
              const response = await api.system.importData(data);
              if (response.success) {
                message.success('Данные успешно импортированы');
                window.location.reload(); // Перезагружаем для применения изменений
              } else {
                message.error('Ошибка импорта данных');
              }
            }
          } catch (error) {
            message.error('Неверный формат файла');
          }
        };
        reader.readAsText(file);
      }
    };

    input.click();
  };

  const handleExport = async () => {
    if (!api) return;

    try {
      const response = await api.system.exportData('json');
      if (response.success) {
        message.success('Конфигурация экспортирована');
      }
    } catch (error) {
      message.error('Ошибка экспорта');
    }
  };

  const resetToDefaults = () => {
    form.setFieldsValue({
      theme: 'dark',
      language: 'ru',
      notification_enabled: true,
      sound_enabled: true,
      monitoring_interval: 60,
      alert_threshold: 3,
      auto_start: true,
    });
    message.info('Настройки сброшены к значениям по умолчанию');
  };

  return (
    <div>
      <Card title="Настройки приложения">
        <Form
          form={form}
          layout="vertical"
          onFinish={saveSettings}
          initialValues={{
            theme: 'dark',
            language: 'ru',
            notification_enabled: true,
            sound_enabled: true,
            monitoring_interval: 60,
            alert_threshold: 3,
            auto_start: true,
          }}
        >
          <Tabs defaultActiveKey="general">
            <TabPane
              tab={
                <span>
                  <DesktopOutlined />
                  Основные
                </span>
              }
              key="general"
            >
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item name="theme" label="Тема оформления">
                    <Radio.Group>
                      <Radio.Button value="light">Светлая</Radio.Button>
                      <Radio.Button value="dark">Тёмная</Radio.Button>
                    </Radio.Group>
                  </Form.Item>

                  <Form.Item name="language" label="Язык интерфейса">
                    <Select>
                      <Option value="ru">Русский</Option>
                      <Option value="en">English</Option>
                    </Select>
                  </Form.Item>

                  <Form.Item
                    name="auto_start"
                    label="Автозапуск при старте Windows"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                </Col>

                <Col span={12}>
                  <Alert
                    message="Информация"
                    description="Некоторые настройки вступят в силу после перезапуска приложения"
                    type="info"
                    showIcon
                  />
                </Col>
              </Row>
            </TabPane>

            <TabPane
              tab={
                <span>
                  <ThunderboltOutlined />
                  Мониторинг
                </span>
              }
              key="monitoring"
            >
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item
                    name="monitoring_interval"
                    label="Интервал проверки по умолчанию (сек)"
                    rules={[{ type: 'number', min: 10, max: 3600 }]}
                  >
                    <InputNumber
                      min={10}
                      max={3600}
                      style={{ width: '100%' }}
                      addonAfter="секунд"
                    />
                  </Form.Item>

                  <Form.Item
                    name="alert_threshold"
                    label="Порог срабатывания алерта"
                    tooltip="Количество неудачных проверок до отправки уведомления"
                  >
                    <InputNumber
                      min={1}
                      max={10}
                      style={{ width: '100%' }}
                      addonAfter="проверок"
                    />
                  </Form.Item>
                </Col>

                <Col span={12}>
                  <Alert
                    message="Рекомендации"
                    description={
                      <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                        <li>Для критичных устройств используйте интервал 30-60 сек</li>
                        <li>Для менее важных устройств достаточно 120-300 сек</li>
                        <li>Слишком частые проверки могут создать нагрузку на сеть</li>
                      </ul>
                    }
                    type="warning"
                    showIcon
                  />
                </Col>
              </Row>
            </TabPane>

            <TabPane
              tab={
                <span>
                  <BellOutlined />
                  Уведомления
                </span>
              }
              key="notifications"
            >
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item
                    name="notification_enabled"
                    label="Системные уведомления"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>

                  <Form.Item
                    name="sound_enabled"
                    label="Звуковые уведомления"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>

                  <Divider />

                  <Alert
                    message="Типы уведомлений"
                    description={
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <div>🔴 Критичные - устройство недоступно</div>
                        <div>🟡 Предупреждения - высокое время отклика</div>
                        <div>🟢 Информационные - устройство снова в сети</div>
                      </Space>
                    }
                    type="info"
                  />
                </Col>

                <Col span={12}>
                  <Card title="Тестирование уведомлений" size="small">
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Button
                        block
                        onClick={() => {
                          if (api) {
                            api.system.showNotification(
                              'Тестовое уведомление',
                              'Это тестовое уведомление от Network Monitor'
                            );
                          }
                        }}
                      >
                        Отправить тестовое уведомление
                      </Button>
                    </Space>
                  </Card>
                </Col>
              </Row>
            </TabPane>

            <TabPane
              tab={
                <span>
                  <GlobalOutlined />
                  Импорт/Экспорт
                </span>
              }
              key="import-export"
            >
              <Row gutter={24}>
                <Col span={12}>
                  <Card title="Экспорт конфигурации" size="small">
                    <p>Сохранить текущую конфигурацию устройств и настроек</p>
                    <Space>
                      <Button icon={<ExportOutlined />} onClick={handleExport}>
                        Экспорт в JSON
                      </Button>
                    </Space>
                  </Card>
                </Col>

                <Col span={12}>
                  <Card title="Импорт конфигурации" size="small">
                    <p>Загрузить конфигурацию из файла</p>
                    <Space>
                      <Button icon={<ImportOutlined />} onClick={handleImport}>
                        Импорт из файла
                      </Button>
                    </Space>
                  </Card>
                </Col>
              </Row>

              <Divider />

              <Alert
                message="Внимание"
                description="При импорте конфигурации текущие настройки будут перезаписаны"
                type="warning"
                showIcon
              />
            </TabPane>
          </Tabs>

          <Divider />

          <Space>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
              Сохранить настройки
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadSettings}>
              Перезагрузить
            </Button>
            <Button onClick={resetToDefaults}>
              Сбросить к значениям по умолчанию
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
};