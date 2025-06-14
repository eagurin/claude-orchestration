# Использование Claude Orchestration без API ключей

## Проблема

У вас есть подписка Claude Code MAX, но нет платного API ключа Anthropic. Это обычная ситуация - подписка Claude Code и API ключи это разные услуги.

## Решение

Система поддерживает два режима работы:

### 1. Subscription Mode (рекомендуется)

Использует вашу существующую подписку Claude Code вместо API ключей.

**Настройка:**

```bash
# 1. Скопируйте файл конфигурации
cp .env.example .env

# 2. Отредактируйте .env файл
CLAUDE_MODE=subscription
# ANTHROPIC_API_KEY=your_api_key_here  # Закомментировано - не нужен
```

**Как это работает:**

- Использует Claude Code агенты через подписку
- Не требует API ключей
- Работает с вашей текущей подпиской MAX
- Поддерживает все паттерны оркестрации

### 2. API Mode (требует ключи)

Использует прямое API Anthropic (требует оплаты).

## Быстрый старт без API ключей

```bash
# 1. Установите зависимости
npm install

# 2. Настройте environment для subscription mode
echo "CLAUDE_MODE=subscription" > .env
echo "CLAUDE_MODEL=claude-3-5-sonnet-20241022" >> .env

# 3. Настройте MCP серверы
npm run setup

# 4. Запустите систему
npm run build
npm start

# 5. Протестируйте в другом терминале
npm run task:submit -- --pattern swarm "Проанализируй этот проект"
```

## Ограничения subscription mode

1. **Производительность**: Может быть медленнее чем прямое API
2. **Параллелизм**: Ограничен возможностями Claude Code
3. **Кастомизация**: Меньше настроек модели

## Преимущества subscription mode

1. **Бесплатно**: Использует существующую подписку
2. **Простота**: Не нужны API ключи
3. **MCP поддержка**: Полная поддержка всех MCP инструментов
4. **Все паттерны**: Swarm, Pipeline, Consensus, MapReduce

## Тестирование системы

```bash
# Тест swarm паттерна
npm run task:submit -- --pattern swarm "Оптимизируй код в src/"

# Тест pipeline паттерна  
npm run task:submit -- --pattern pipeline "Рефактор архитектуры"

# Тест consensus паттерна
npm run task:submit -- --pattern consensus "Проверь качество кода"

# Интерактивный режим
npm run dev
# В другом терминале:
claude-orchestrate interactive
```

## Архитектура без API

```
┌─────────────────────────────────────┐
│         ORCHESTRATOR                │
│  ┌─────────────────────────────────┐│
│  │     Subscription Mode           ││
│  │                                 ││
│  │  ┌───────────┐  ┌─────────────┐ ││
│  │  │Claude Code│  │   Agent     │ ││
│  │  │Agent 1    │  │   Pool      │ ││
│  │  └───────────┘  │  Manager    │ ││
│  │                 └─────────────┘ ││
│  │  ┌───────────┐  ┌─────────────┐ ││
│  │  │Claude Code│  │    Task     │ ││
│  │  │Agent 2    │  │   Queue     │ ││
│  │  └───────────┘  └─────────────┘ ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
            │
            ▼
    ┌──────────────────┐
    │  MCP SERVERS     │
    │ • filesystem     │
    │ • memory (mem0)  │
    │ • github         │
    │ • web-search     │
    └──────────────────┘
```

## Диагностика

Если система не работает:

```bash
# Проверить режим
node -e "console.log('Mode:', process.env.CLAUDE_MODE || 'subscription')"

# Проверить конфигурацию
npm run status

# Проверить MCP серверы
ls -la config/mcp-servers.json

# Дебаг режим
DEBUG=claude-orchestration:* npm start
```

## Переход на API в будущем

Если позже появится API ключ:

```bash
# 1. Добавьте ключ в .env
echo "ANTHROPIC_API_KEY=your_actual_key" >> .env
echo "CLAUDE_MODE=api" >> .env

# 2. Перезапустите систему
npm restart
```

Система автоматически переключится на API режим.

## FAQ

**Q: Будет ли это работать с моей подпиской Claude Code MAX?**
A: Да, система использует ваш существующий доступ к Claude Code.

**Q: Нужно ли что-то особенное устанавливать?**
A: Нет, если у вас уже работает Claude Code, всё готово.

**Q: Можно ли использовать оба режима?**
A: Да, можно переключаться через переменную CLAUDE_MODE.

**Q: Есть ли лимиты в subscription режиме?**
A: Только те, что есть в вашей подписке Claude Code MAX.

**Q: Поддерживаются ли все паттерны оркестрации?**
A: Да, все четыре паттерна работают в subscription режиме.