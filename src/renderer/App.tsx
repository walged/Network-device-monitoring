import React, { useState, useEffect } from 'react';
import { Layout, Menu, Badge, theme, notification } from 'antd';
import {
  DashboardOutlined,
  DatabaseOutlined,
  SettingOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  WifiOutlined,
  AlertOutlined
} from '@ant-design/icons';
import { Dashboard } from './pages/Dashboard';
import { DeviceList } from './pages/DeviceList';
import { Settings } from './pages/Settings';
import { EventLog } from './pages/EventLog';
import { useElectronAPI } from './hooks/useElectronAPI';
import './styles/App.css';

const { Header, Sider, Content } = Layout;

type MenuKey = 'dashboard' | 'devices' | 'events' | 'settings';

export const App: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [currentPage, setCurrentPage] = useState<MenuKey>('dashboard');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const { api } = useElectronAPI();
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
    const themeValue = response.success && response.data ? response.data : 'light'; // По умолчанию светлая тема

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
      title: "Уведомление", message: data.new_status === 'online' ? 'Устройство в сети' : 'Устройство недоступно',
      description: data.message,
      placement: 'topRight',
      duration: 5,
    });
  };

  const handleStatusChange = (data: any) => {
    // Обновляем UI при изменении статуса устройства
    // Это будет обработано в компонентах через их собственные подписки
  };

  const toggleMonitoring = async () => {
    if (!api) return;

    try {
      if (isMonitoring) {
        await api.monitoring.stopMonitoring();
        notification.info({
          title: "Уведомление", message: 'Мониторинг остановлен',
          placement: 'topRight',
        });
      } else {
        await api.monitoring.startMonitoring();
        notification.success({
          title: "Уведомление", message: 'Мониторинг запущен',
          placement: 'topRight',
        });
      }
      setIsMonitoring(!isMonitoring);
    } catch (error) {
      notification.error({
        title: "Уведомление", message: 'Ошибка',
        description: 'Не удалось изменить статус мониторинга',
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
      case 'events':
        return <EventLog />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  const menuItems = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: 'Панель управления',
    },
    {
      key: 'devices',
      icon: <DatabaseOutlined />,
      label: 'Устройства',
    },
    {
      key: 'events',
      icon: <AlertOutlined />,
      label: (
        <Badge count={alertCount} offset={[10, 0]}>
          <span>События</span>
        </Badge>
      ),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Настройки',
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
          {!collapsed && <span>Network Monitor</span>}
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
            title={isMonitoring ? 'Остановить мониторинг' : 'Запустить мониторинг'}
          >
            {isMonitoring ? (
              <>
                <PauseCircleOutlined />
                {!collapsed && <span>Остановить</span>}
              </>
            ) : (
              <>
                <PlayCircleOutlined />
                {!collapsed && <span>Запустить</span>}
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
              text={isMonitoring ? 'Мониторинг активен' : 'Мониторинг остановлен'}
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