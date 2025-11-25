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
  BellOutlined,
  GlobalOutlined,
  ThunderboltOutlined,
  DesktopOutlined,
  ImportOutlined,
  ExportOutlined
} from '@ant-design/icons';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { useLanguage, Language } from '../i18n';

const { Option } = Select;
const { TabPane } = Tabs;

export const Settings: React.FC = () => {
  const { api } = useElectronAPI();
  const { t, language, setLanguage } = useLanguage();
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
          language: data.language || language,
          notification_enabled: data.notification_enabled === 'true',
          sound_enabled: data.sound_enabled === 'true',
          monitoring_interval: parseInt(data.monitoring_interval || '60'),
          alert_threshold: parseInt(data.alert_threshold || '3'),
          auto_start: data.auto_start === 'true',
        });
      }
    } catch (error) {
      message.error(t.common.error);
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

      message.success(t.settings.saved);

      // Применяем тему
      if (values.theme !== settings.theme) {
        applyTheme(values.theme);
      }

      // Применяем язык
      if (values.language !== language) {
        handleLanguageChange(values.language);
      }
    } catch (error) {
      message.error(t.common.error);
    } finally {
      setLoading(false);
    }
  };

  const applyTheme = (theme: string) => {
    document.body.className = theme === 'dark' ? 'dark-theme' : 'light-theme';
  };

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    // Отправляем событие для обновления локали Ant Design
    window.dispatchEvent(new Event('languageChange'));
  };

  const handleImport = async () => {
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
                message.success(t.settings.importSuccess);
                window.location.reload();
              } else {
                message.error(t.common.error);
              }
            }
          } catch (error) {
            message.error(t.common.error);
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
        message.success(t.settings.exportSuccess);
      }
    } catch (error) {
      message.error(t.common.error);
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
    message.info(t.settings.resetDone);
  };

  return (
    <div>
      <Card title={t.settings.title}>
        <Form
          form={form}
          layout="vertical"
          onFinish={saveSettings}
          initialValues={{
            theme: 'dark',
            language: language,
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
                  {t.settings.general}
                </span>
              }
              key="general"
            >
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item name="theme" label={t.settings.theme}>
                    <Radio.Group onChange={(e) => applyTheme(e.target.value)}>
                      <Radio.Button value="light">{t.settings.themeLight}</Radio.Button>
                      <Radio.Button value="dark">{t.settings.themeDark}</Radio.Button>
                    </Radio.Group>
                  </Form.Item>

                  <Form.Item name="language" label={t.settings.language}>
                    <Select onChange={(value) => handleLanguageChange(value as Language)}>
                      <Option value="ru">Русский</Option>
                      <Option value="en">English</Option>
                    </Select>
                  </Form.Item>

                  <Form.Item
                    name="auto_start"
                    label={t.settings.autoStart}
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                </Col>

                <Col span={12}>
                  <Alert
                    message={t.common.info}
                    description={language === 'ru'
                      ? "Некоторые настройки вступят в силу после перезапуска приложения"
                      : "Some settings will take effect after restarting the application"
                    }
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
                  {t.settings.monitoring}
                </span>
              }
              key="monitoring"
            >
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item
                    name="monitoring_interval"
                    label={t.settings.monitoringInterval}
                    rules={[{ type: 'number', min: 10, max: 3600 }]}
                  >
                    <InputNumber
                      min={10}
                      max={3600}
                      style={{ width: '100%' }}
                      addonAfter={language === 'ru' ? 'секунд' : 'sec'}
                    />
                  </Form.Item>

                  <Form.Item
                    name="alert_threshold"
                    label={t.settings.alertThreshold}
                    tooltip={language === 'ru'
                      ? "Количество неудачных проверок до отправки уведомления"
                      : "Number of failed checks before sending notification"
                    }
                  >
                    <InputNumber
                      min={1}
                      max={10}
                      style={{ width: '100%' }}
                      addonAfter={language === 'ru' ? 'проверок' : 'checks'}
                    />
                  </Form.Item>
                </Col>

                <Col span={12}>
                  <Alert
                    message={language === 'ru' ? 'Рекомендации' : 'Recommendations'}
                    description={
                      <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                        <li>{language === 'ru'
                          ? 'Для критичных устройств используйте интервал 30-60 сек'
                          : 'For critical devices use interval 30-60 sec'}</li>
                        <li>{language === 'ru'
                          ? 'Для менее важных устройств достаточно 120-300 сек'
                          : 'For less important devices 120-300 sec is enough'}</li>
                        <li>{language === 'ru'
                          ? 'Слишком частые проверки могут создать нагрузку на сеть'
                          : 'Too frequent checks can create network load'}</li>
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
                  {t.settings.notifications}
                </span>
              }
              key="notifications"
            >
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item
                    name="notification_enabled"
                    label={t.settings.systemNotifications}
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>

                  <Form.Item
                    name="sound_enabled"
                    label={t.settings.soundNotifications}
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>

                  <Divider />

                  <Alert
                    message={language === 'ru' ? 'Типы уведомлений' : 'Notification types'}
                    description={
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <div>🔴 {language === 'ru' ? 'Критичные - устройство недоступно' : 'Critical - device unavailable'}</div>
                        <div>🟡 {language === 'ru' ? 'Предупреждения - высокое время отклика' : 'Warnings - high response time'}</div>
                        <div>🟢 {language === 'ru' ? 'Информационные - устройство снова в сети' : 'Info - device back online'}</div>
                      </Space>
                    }
                    type="info"
                  />
                </Col>

                <Col span={12}>
                  <Card title={language === 'ru' ? 'Тестирование уведомлений' : 'Test notifications'} size="small">
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Button
                        block
                        onClick={() => {
                          if (api) {
                            api.system.showNotification(
                              language === 'ru' ? 'Тестовое уведомление' : 'Test notification',
                              language === 'ru' ? 'Это тестовое уведомление от SCC' : 'This is a test notification from SCC'
                            );
                          }
                        }}
                      >
                        {t.settings.testNotification}
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
                  {t.settings.importExport}
                </span>
              }
              key="import-export"
            >
              <Row gutter={24}>
                <Col span={12}>
                  <Card title={language === 'ru' ? 'Экспорт конфигурации' : 'Export configuration'} size="small">
                    <p>{language === 'ru'
                      ? 'Сохранить текущую конфигурацию устройств и настроек'
                      : 'Save current device configuration and settings'}</p>
                    <Space>
                      <Button icon={<ExportOutlined />} onClick={handleExport}>
                        {t.settings.export}
                      </Button>
                    </Space>
                  </Card>
                </Col>

                <Col span={12}>
                  <Card title={language === 'ru' ? 'Импорт конфигурации' : 'Import configuration'} size="small">
                    <p>{language === 'ru'
                      ? 'Загрузить конфигурацию из файла'
                      : 'Load configuration from file'}</p>
                    <Space>
                      <Button icon={<ImportOutlined />} onClick={handleImport}>
                        {t.settings.import}
                      </Button>
                    </Space>
                  </Card>
                </Col>
              </Row>

              <Divider />

              <Alert
                message={t.common.warning}
                description={language === 'ru'
                  ? 'При импорте конфигурации текущие настройки будут перезаписаны'
                  : 'Importing configuration will overwrite current settings'
                }
                type="warning"
                showIcon
              />
            </TabPane>
          </Tabs>

          <Divider />

          <Space>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
              {t.settings.save}
            </Button>
            <Button onClick={resetToDefaults}>
              {t.settings.reset}
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
};
