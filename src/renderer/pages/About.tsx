import React from 'react';
import { Card, Typography, Divider, Space, Tag, Row, Col, Button } from 'antd';
import {
  GlobalOutlined,
  SendOutlined,
  RobotOutlined,
  CheckCircleOutlined,
  CopyrightOutlined
} from '@ant-design/icons';
import { useElectronAPI } from '../hooks/useElectronAPI';

const { Title, Paragraph, Text } = Typography;

export const About: React.FC = () => {
  const { api } = useElectronAPI();

  const openLink = (url: string) => {
    if (api) {
      api.system.openUrl(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Заголовок */}
      <div style={{ textAlign: 'center', marginBottom: 32, padding: '24px 0' }}>
        <Title level={1} style={{ marginBottom: 8, fontSize: 32 }}>
          Switch Camera Control
        </Title>
        <Title level={4} style={{ margin: 0, fontWeight: 400, opacity: 0.7 }}>
          SCC
        </Title>
        <div style={{ marginTop: 16 }}>
          <Tag color="blue" style={{ fontSize: 14, padding: '4px 12px' }}>
            Версия 1.0.0
          </Tag>
        </div>
      </div>

      {/* О программе */}
      <Card style={{ marginBottom: 24 }}>
        <Title level={4}>О программе</Title>
        <Paragraph style={{ fontSize: 15, lineHeight: 1.8 }}>
          <strong>Switch Camera Control (SCC)</strong> — комплексное решение для мониторинга
          сетевых устройств и управления IP-камерами видеонаблюдения.
        </Paragraph>

        <Title level={5} style={{ marginTop: 24 }}>Возможности:</Title>
        <Row gutter={[16, 8]}>
          <Col span={12}>
            <Space direction="vertical" size={4}>
              <Text><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />Мониторинг устройств в реальном времени</Text>
              <Text><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />Привязка камер к портам коммутаторов</Text>
              <Text><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />Визуальная карта сети</Text>
              <Text><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />План территорий с устройствами</Text>
            </Space>
          </Col>
          <Col span={12}>
            <Space direction="vertical" size={4}>
              <Text><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />Просмотр видеопотоков (HTTP/RTSP)</Text>
              <Text><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />Журнал событий и уведомления</Text>
              <Text><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />Поддержка SNMP</Text>
              <Text><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />Экспорт/импорт конфигурации</Text>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Цель */}
      <Card style={{ marginBottom: 24 }}>
        <Title level={4}>Цель проекта</Title>
        <Paragraph style={{ fontSize: 15, lineHeight: 1.8 }}>
          Создание программы мониторинга с наглядной архитектурой сети и визуальным
          расположением коммутаторов и камер видеонаблюдения. Программа позволяет
          системным администраторам эффективно контролировать состояние сетевой
          инфраструктуры и оперативно реагировать на изменения.
        </Paragraph>
      </Card>

      {/* Разработка */}
      <Card style={{ marginBottom: 24 }}>
        <Title level={4}>Разработка</Title>
        <Row gutter={[24, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} sm={8}>
            <div style={{ textAlign: 'center', padding: 16 }}>
              <GlobalOutlined style={{ fontSize: 32, color: '#1890ff', marginBottom: 12 }} />
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Компания</Text>
                <Button
                  type="link"
                  style={{ padding: 0, fontSize: 18, fontWeight: 600 }}
                  onClick={() => openLink('https://revium.com')}
                >
                  REVIUM
                </Button>
              </div>
            </div>
          </Col>
          <Col xs={24} sm={8}>
            <div style={{ textAlign: 'center', padding: 16 }}>
              <SendOutlined style={{ fontSize: 32, color: '#1890ff', marginBottom: 12 }} />
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Разработчик</Text>
                <Button
                  type="link"
                  style={{ padding: 0, fontSize: 18, fontWeight: 600 }}
                  onClick={() => openLink('https://t.me/walged')}
                >
                  @walged
                </Button>
              </div>
            </div>
          </Col>
          <Col xs={24} sm={8}>
            <div style={{ textAlign: 'center', padding: 16 }}>
              <RobotOutlined style={{ fontSize: 32, color: '#1890ff', marginBottom: 12 }} />
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>При помощи</Text>
                <Button
                  type="link"
                  style={{ padding: 0, fontSize: 18, fontWeight: 600 }}
                  onClick={() => openLink('https://claude.ai')}
                >
                  Claude.ai
                </Button>
              </div>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Лицензия */}
      <Card
        style={{
          marginBottom: 24,
          background: 'linear-gradient(135deg, rgba(24, 144, 255, 0.1) 0%, rgba(82, 196, 26, 0.1) 100%)',
          borderColor: '#1890ff'
        }}
      >
        <Title level={4}>
          <CopyrightOutlined style={{ marginRight: 8 }} />
          Лицензия
        </Title>
        <Paragraph style={{ fontSize: 15, marginBottom: 16 }}>
          <Text strong style={{ color: '#52c41a', fontSize: 16 }}>
            Бесплатно для некоммерческих организаций
          </Text>
        </Paragraph>
        <Paragraph style={{ fontSize: 14, marginBottom: 0 }}>
          Для получения разрешения на коммерческое использование обращайтесь
          по контактам, указанным на сайте{' '}
          <Button
            type="link"
            style={{ padding: 0 }}
            onClick={() => openLink('https://revium.com')}
          >
            REVIUM.com
          </Button>
        </Paragraph>
      </Card>

      {/* Футер */}
      <div style={{ textAlign: 'center', padding: '16px 0', opacity: 0.6 }}>
        <Text>© 2024 REVIUM. Все права защищены.</Text>
      </div>
    </div>
  );
};
