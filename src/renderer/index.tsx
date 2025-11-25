import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import enUS from 'antd/locale/en_US';
import { App } from './App';
import { LanguageProvider } from './i18n';
import './styles/global.css';
import './styles/theme.css';
import 'antd/dist/reset.css';

// Компонент-обёртка для динамической смены локали Ant Design
const AppWithLocale: React.FC = () => {
  const [locale, setLocale] = React.useState(ruRU);

  React.useEffect(() => {
    const savedLang = localStorage.getItem('app_language');
    setLocale(savedLang === 'en' ? enUS : ruRU);

    // Слушаем изменения языка
    const handleStorageChange = () => {
      const lang = localStorage.getItem('app_language');
      setLocale(lang === 'en' ? enUS : ruRU);
    };

    window.addEventListener('storage', handleStorageChange);

    // Кастомное событие для изменения языка внутри приложения
    window.addEventListener('languageChange', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('languageChange', handleStorageChange);
    };
  }, []);

  return (
    <ConfigProvider locale={locale}>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ConfigProvider>
  );
};

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <AppWithLocale />
  </React.StrictMode>
);
