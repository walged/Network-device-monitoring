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
import { useLanguage } from '../i18n';

const { Title, Paragraph, Text } = Typography;

export const About: React.FC = () => {
  const { api } = useElectronAPI();
  const { t } = useLanguage();

  const openLink = (url: string) => {
    if (api) {
      api.system.openUrl(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px' }}>
      {/* Заголовок */}
      <div style={{ textAlign: 'center', marginBottom: 20, padding: '16px 0' }}>
        <Title level={2} style={{ marginBottom: 4, fontSize: 28 }}>
          Switch Camera Control
        </Title>
        <Text type="secondary" style={{ fontSize: 16 }}>SCC</Text>
        <div style={{ marginTop: 12 }}>
          <Tag color="blue" style={{ fontSize: 13 }}>
            {t.about.version} 1.0.0
          </Tag>
        </div>
      </div>

      {/* О программе и возможности */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Title level={5} style={{ marginTop: 0 }}>{t.about.title}</Title>
        <Paragraph style={{ fontSize: 14, marginBottom: 12 }}>
          <strong>Switch Camera Control (SCC)</strong> — {t.about.description}
        </Paragraph>

        <Title level={5} style={{ fontSize: 14, marginBottom: 8 }}>{t.about.features}:</Title>
        <Row gutter={[12, 4]}>
          <Col span={12}>
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              <Text style={{ fontSize: 13 }}><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />{t.about.feature1}</Text>
              <Text style={{ fontSize: 13 }}><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />{t.about.feature2}</Text>
              <Text style={{ fontSize: 13 }}><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />{t.about.feature3}</Text>
              <Text style={{ fontSize: 13 }}><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />{t.about.feature4}</Text>
            </Space>
          </Col>
          <Col span={12}>
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              <Text style={{ fontSize: 13 }}><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />{t.about.feature5}</Text>
              <Text style={{ fontSize: 13 }}><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />{t.about.feature6}</Text>
              <Text style={{ fontSize: 13 }}><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />{t.about.feature7}</Text>
              <Text style={{ fontSize: 13 }}><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />{t.about.feature8}</Text>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={16}>
        {/* Цель */}
        <Col xs={24} md={12}>
          <Card size="small" style={{ marginBottom: 16, height: '100%' }}>
            <Title level={5} style={{ marginTop: 0, fontSize: 14 }}>{t.about.goal}</Title>
            <Paragraph style={{ fontSize: 13, marginBottom: 0 }}>
              {t.about.goalDescription}
            </Paragraph>
          </Card>
        </Col>

        {/* Лицензия */}
        <Col xs={24} md={12}>
          <Card
            size="small"
            style={{
              marginBottom: 16,
              height: '100%',
              background: 'linear-gradient(135deg, rgba(24, 144, 255, 0.1) 0%, rgba(82, 196, 26, 0.1) 100%)',
              borderColor: '#1890ff'
            }}
          >
            <Title level={5} style={{ marginTop: 0, fontSize: 14 }}>
              <CopyrightOutlined style={{ marginRight: 6 }} />
              {t.about.license}
            </Title>
            <Paragraph style={{ fontSize: 13, marginBottom: 8 }}>
              <Text strong style={{ color: '#52c41a' }}>
                {t.about.freeForNonCommercial}
              </Text>
            </Paragraph>
            <Paragraph style={{ fontSize: 12, marginBottom: 0 }}>
              {t.about.commercialContact}{' '}
              <Button
                type="link"
                size="small"
                style={{ padding: 0, fontSize: 12 }}
                onClick={() => openLink('https://revium.com')}
              >
                REVIUM.com
              </Button>
            </Paragraph>
          </Card>
        </Col>
      </Row>

      {/* Разработка */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Title level={5} style={{ marginTop: 0, fontSize: 14 }}>{t.about.development}</Title>
        <Row gutter={16}>
          <Col xs={24} sm={8}>
            <div style={{ textAlign: 'center', padding: 8 }}>
              <GlobalOutlined style={{ fontSize: 24, color: '#1890ff', marginBottom: 8 }} />
              <div>
                <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>{t.about.company}</Text>
                <Button
                  type="link"
                  style={{ padding: 0, fontSize: 15, fontWeight: 600 }}
                  onClick={() => openLink('https://arthurdev.ru')}
                >
                  REVIUM
                </Button>
              </div>
            </div>
          </Col>
          <Col xs={24} sm={8}>
            <div style={{ textAlign: 'center', padding: 8 }}>
              <SendOutlined style={{ fontSize: 24, color: '#1890ff', marginBottom: 8 }} />
              <div>
                <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>{t.about.developer}</Text>
                <Button
                  type="link"
                  style={{ padding: 0, fontSize: 15, fontWeight: 600 }}
                  onClick={() => openLink('https://t.me/walged')}
                >
                  WALGED
                </Button>
              </div>
            </div>
          </Col>
          <Col xs={24} sm={8}>
            <div style={{ textAlign: 'center', padding: 8 }}>
              <RobotOutlined style={{ fontSize: 24, color: '#1890ff', marginBottom: 8 }} />
              <div>
                <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>{t.about.poweredBy}</Text>
                <Button
                  type="link"
                  style={{ padding: 0, fontSize: 15, fontWeight: 600 }}
                  onClick={() => openLink('https://claude.ai')}
                >
                  Claude.ai
                </Button>
              </div>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Футер */}
      <div style={{ textAlign: 'center', padding: '12px 0', opacity: 0.6 }}>
        <Text style={{ fontSize: 12 }}>© 2025 </Text>
        <Button
          type="link"
          style={{ padding: 0, fontSize: 12, opacity: 0.6 }}
          onClick={() => openLink('https://arthurdev.ru')}
        >
          REVIUM
        </Button>
      </div>
    </div>
  );
};
