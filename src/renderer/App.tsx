import React, { useState, useEffect } from 'react';
import { Layout, Menu, Badge, theme, notification } from 'antd';
import {
  DashboardOutlined,
  DatabaseOutlined,
  SettingOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  WifiOutlined,
  AlertOutlined,
  ApartmentOutlined,
  PictureOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { Dashboard } from './pages/Dashboard';
import { DeviceList } from './pages/DeviceList';
import { Settings } from './pages/Settings';
import { EventLog } from './pages/EventLog';
import { NetworkMap } from './pages/NetworkMap';
import { VisualMap } from './pages/VisualMap';
import { About } from './pages/About';
import { useElectronAPI } from './hooks/useElectronAPI';
import { useLanguage } from './i18n';
import './styles/App.css';

const { Header, Sider, Content } = Layout;

type MenuKey = 'dashboard' | 'devices' | 'network-map' | 'visual-map' | 'events' | 'settings' | 'about';

export const App: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [currentPage, setCurrentPage] = useState<MenuKey>('dashboard');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const { api } = useElectronAPI();
  const { t } = useLanguage();
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  useEffect(() => {
    // Инициализируем тему при загрузке
    initializeTheme();

    // Получаем статус мониторинга при запуске
    checkMonitoringStatus();

    // Подписываемся на события
    if (api) {
      api.on('alert', handleAlert);
      api.on('device-status-changed', handleStatusChange);

      return () => {
        api.removeListener('alert', handleAlert);
        api.removeListener('device-status-changed', handleStatusChange);
      };
    }
  }, [api]);

  const initializeTheme = async () => {
    if (!api) return;

    const response = await api.settings.get('theme');
    const themeValue = response.success && response.data ? response.data : 'light';

    document.documentElement.setAttribute('data-theme', themeValue);
    if (themeValue === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  };

  const checkMonitoringStatus = async () => {
    if (!api) return;

    const response = await api.monitoring.getStatus();
    if (response.success) {
      setIsMonitoring(response.data.isRunning);
    }
  };

  const handleAlert = (data: any) => {
    setAlertCount(prev => prev + 1);

    notification[data.new_status === 'online' ? 'success' : 'error']({
      message: t.common.notification,
      description: data.message,
      placement: 'topRight',
      duration: 5,
    });
  };

  const handleStatusChange = (data: any) => {
    // Обновляем UI при изменении статуса устройства
  };

  const toggleMonitoring = async () => {
    if (!api) return;

    try {
      if (isMonitoring) {
        await api.monitoring.stopMonitoring();
        notification.info({
          message: t.monitoring.stoppedMsg,
          placement: 'topRight',
        });
      } else {
        await api.monitoring.startMonitoring();
        notification.success({
          message: t.monitoring.started,
          placement: 'topRight',
        });
      }
      setIsMonitoring(!isMonitoring);
    } catch (error) {
      notification.error({
        message: t.common.error,
        placement: 'topRight',
      });
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'devices':
        return <DeviceList />;
      case 'network-map':
        return <NetworkMap />;
      case 'visual-map':
        return <VisualMap />;
      case 'events':
        return <EventLog />;
      case 'settings':
        return <Settings />;
      case 'about':
        return <About />;
      default:
        return <Dashboard />;
    }
  };

  const menuItems = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: t.menu.dashboard,
    },
    {
      key: 'devices',
      icon: <DatabaseOutlined />,
      label: t.menu.devices,
    },
    {
      key: 'network-map',
      icon: <ApartmentOutlined />,
      label: t.menu.networkMap,
    },
    {
      key: 'visual-map',
      icon: <PictureOutlined />,
      label: t.menu.visualMap,
    },
    {
      key: 'events',
      icon: <AlertOutlined />,
      label: (
        <Badge count={alertCount} offset={[10, 0]}>
          <span>{t.menu.events}</span>
        </Badge>
      ),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: t.menu.settings,
    },
    {
      key: 'about',
      icon: <InfoCircleOutlined />,
      label: t.menu.about,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        style={{
          background: colorBgContainer,
        }}
      >
        <div className="logo">
          <WifiOutlined style={{ fontSize: '24px', marginRight: '8px' }} />
          {!collapsed && <span>SCC</span>}
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[currentPage]}
          items={menuItems}
          onClick={({ key }) => {
            setCurrentPage(key as MenuKey);
            if (key === 'events') {
              setAlertCount(0);
            }
          }}
        />
        <div className="monitoring-control">
          <button
            className={`monitoring-btn ${isMonitoring ? 'active' : ''}`}
            onClick={toggleMonitoring}
            title={isMonitoring ? t.monitoring.stop : t.monitoring.start}
          >
            {isMonitoring ? (
              <>
                <PauseCircleOutlined />
                {!collapsed && <span>{t.monitoring.stop}</span>}
              </>
            ) : (
              <>
                <PlayCircleOutlined />
                {!collapsed && <span>{t.monitoring.start}</span>}
              </>
            )}
          </button>
        </div>
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <button
            className="trigger"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? '☰' : '☰'}
          </button>
          <div className="header-status">
            <Badge
              status={isMonitoring ? 'processing' : 'default'}
              text={isMonitoring ? t.monitoring.active : t.monitoring.stopped}
            />
          </div>
        </Header>
        <Content
          style={{
            margin: '24px',
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
            overflow: 'auto',
          }}
        >
          {renderPage()}
        </Content>
      </Layout>
    </Layout>
  );
};
