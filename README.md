# Football Manager Simulator

Одиночная карьера футбольного менеджера: симуляция на клиенте, сервер отдаёт пакеты мира.

## Стек

- **`packages/engine`** — TypeScript-движок (матчи, сезон, новости)
- **`apps/mobile`** — Expo (iOS / Android / web)
- **`apps/api`** — FastAPI, раздача world packs
- **`data/world`** — лиги, клубы-псевдонимы, регламенты, доступ к еврокубкам

## Имена

Клубы — узнаваемые псевдонимы футбольного сообщества (не товарные знаки).  
Игроки и тренеры — процедурная генерация.

## Запуск

```bash
npm install
npm run engine:build
npm run api:dev          # http://localhost:8000
npm run mobile:start     # Expo
```
