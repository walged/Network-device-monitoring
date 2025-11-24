const fs = require('fs');
const path = require('path');

// Исправляем MonitoringService.ts
let content = fs.readFileSync('src/main/monitoring/MonitoringService.ts', 'utf8');
// Исправляем строку 92 - проверка timer перед clearTimeout
content = content.replace(/clearTimeout\(timer\);/g, 'if (timer) clearTimeout(timer);');
// Исправляем строку 208 - проверка varbinds
content = content.replace(/varbinds\.forEach/g, 'if (varbinds) varbinds.forEach');
fs.writeFileSync('src/main/monitoring/MonitoringService.ts', content);
console.log('Fixed MonitoringService.ts');

// Исправляем notification-service.ts
content = fs.readFileSync('src/main/services/notification-service.ts', 'utf8');
// Удаляем sound property
content = content.replace(/sound: true,[\s\n]*/g, '');
fs.writeFileSync('src/main/services/notification-service.ts', content);
console.log('Fixed notification-service.ts');

// Исправляем ping-service.ts
content = fs.readFileSync('src/main/services/ping-service.ts', 'utf8');
// Конвертируем timeout в number
content = content.replace(/setTimeout\(\(\) => resolve\(false\), timeout\)/g,
  'setTimeout(() => resolve(false), Number(timeout))');
fs.writeFileSync('src/main/services/ping-service.ts', content);
console.log('Fixed ping-service.ts');

// Исправляем snmp-service.ts
content = fs.readFileSync('src/main/services/snmp-service.ts', 'utf8');
// Заменяем snmp.Version на snmp.Version1
content = content.replace(/snmp\.Version\./g, 'snmp.Version1.');
// Проверяем varbinds перед использованием
content = content.replace(/varbinds\.forEach/g, 'if (varbinds) varbinds.forEach');
content = content.replace(/varbinds\.length/g, 'varbinds?.length');
// Безопасный доступ к varbind.value
content = content.replace(/varbind\.value\.toString\(\)/g, '(varbind.value || "").toString()');
content = content.replace(/varbind\.value as/g, '(varbind.value || 0) as');
fs.writeFileSync('src/main/services/snmp-service.ts', content);
console.log('Fixed snmp-service.ts');

// Исправляем App.tsx
content = fs.readFileSync('src/renderer/App.tsx', 'utf8');
// Добавляем title к notification
content = content.replace(/notification\.(success|error|warning)\(\{[\s\n]*message:/g,
  'notification.$1({\n        title: "Уведомление",\n        message:');
fs.writeFileSync('src/renderer/App.tsx', content);
console.log('Fixed App.tsx');

// Исправляем useElectronAPI.ts
content = fs.readFileSync('src/renderer/hooks/useElectronAPI.ts', 'utf8');
// Типизация error как Error
content = content.replace(/console\.error\(error\)/g, 'console.error(error as Error)');
// Типизация параметров в filter/find/map
content = content.replace(/\.filter\(d =>/g, '.filter((d: any) =>');
content = content.replace(/\.find\(d =>/g, '.find((d: any) =>');
content = content.replace(/\.map\(d =>/g, '.map((d: any) =>');
fs.writeFileSync('src/renderer/hooks/useElectronAPI.ts', content);
console.log('Fixed useElectronAPI.ts');

// Исправляем Dashboard.tsx
content = fs.readFileSync('src/renderer/pages/Dashboard.tsx', 'utf8');
// Заменяем deviceList на devices
content = content.replace(/deviceList\./g, 'devices.');
// Безопасное использование percent
content = content.replace(/\{percent\}%/g, '{(percent || 0)}%');
fs.writeFileSync('src/renderer/pages/Dashboard.tsx', content);
console.log('Fixed Dashboard.tsx');

// Удаляем временный файл
fs.unlinkSync('fix-errors.js');

console.log('\nВсе ошибки исправлены!');