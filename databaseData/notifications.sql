-- Убедимся, что используется правильная схема
SET search_path TO workout_app;

-- Создаем перечисление для типов уведомлений (если еще не создано)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
        CREATE TYPE notification_type AS ENUM ('info', 'success', 'warning', 'error', 'invitation');
    END IF;
END$$;

-- Создаем таблицу для уведомлений (если еще не создана)
CREATE TABLE IF NOT EXISTS notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_uuid UUID NOT NULL REFERENCES users(user_uuid) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    type notification_type NOT NULL DEFAULT 'info',
    related_entity_id UUID NULL, -- UUID связанной сущности (например, приглашения)
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Создаем индексы для улучшения производительности
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_uuid);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_uuid) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- Добавляем ограничение срока хранения (удалять старые уведомления через 30 дней)
-- Функция для автоматической очистки старых уведомлений
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS TRIGGER AS $$
BEGIN
    -- Удаляем прочитанные уведомления старше 30 дней
    DELETE FROM notifications 
    WHERE is_read = TRUE AND created_at < NOW() - INTERVAL '30 days';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Триггер для регулярной очистки
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cleanup_old_notifications') THEN
        CREATE TRIGGER trg_cleanup_old_notifications
        AFTER INSERT ON notifications
        FOR EACH STATEMENT
        EXECUTE FUNCTION cleanup_old_notifications();
    END IF;
END$$;

-- Убедиться, что у пользователя есть хотя бы тестовое уведомление
INSERT INTO notifications (user_uuid, title, message, type, is_read)
SELECT 
    user_uuid, 
    'Добро пожаловать', 
    'Приветствуем в приложении для тренировок! Теперь вы будете получать уведомления в реальном времени.',
    'info',
    FALSE
FROM users
WHERE NOT EXISTS (
    SELECT 1 FROM notifications n WHERE n.user_uuid = users.user_uuid
)
LIMIT 10; -- Ограничиваем количество добавляемых записей 