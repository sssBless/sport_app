CREATE SCHEMA workout_app;
SET search_path TO workout_app;

-- Домены для валидации
CREATE DOMAIN email_address AS VARCHAR(320)
CHECK (VALUE ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$');

CREATE DOMAIN password_hash AS CHAR(60); -- BCrypt

-- Типы перечислений
CREATE TYPE user_role AS ENUM ('creator', 'participant');
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired');

-- Основные таблицы
CREATE TABLE users (
    user_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(30) UNIQUE NOT NULL CHECK (username ~ '^[a-zA-Z0-9_]{3,30}$'),
    display_name VARCHAR(100) NOT NULL,
    email email_address UNIQUE NOT NULL,
    password_hash password_hash NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workouts (
    workout_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(100) NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES users(user_uuid) ON DELETE CASCADE,
    scheduled_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    CHECK (scheduled_time > created_at)
);

CREATE TABLE workout_participants (
    workout_uuid UUID REFERENCES workouts(workout_uuid) ON DELETE CASCADE,
    user_uuid UUID REFERENCES users(user_uuid) ON DELETE CASCADE,
    role user_role NOT NULL,
    PRIMARY KEY (workout_uuid, user_uuid)
);

CREATE TABLE exercises (
    exercise_id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    muscle_group VARCHAR(30),
    description TEXT
);

CREATE TABLE workout_exercises (
    workout_uuid UUID NOT NULL REFERENCES workouts(workout_uuid) ON DELETE CASCADE,
    exercise_id INT NOT NULL REFERENCES exercises(exercise_id) ON DELETE CASCADE,
    sets SMALLINT NOT NULL CHECK (sets BETWEEN 1 AND 20),
    reps SMALLINT NOT NULL CHECK (reps BETWEEN 1 AND 100),
    rest_seconds SMALLINT CHECK (rest_seconds BETWEEN 0 AND 600),
    sort_order SMALLINT NOT NULL,
    PRIMARY KEY (workout_uuid, exercise_id, sort_order)
);

CREATE TABLE invitations (
    invitation_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_uuid UUID NOT NULL REFERENCES workouts(workout_uuid) ON DELETE CASCADE,
    sender_uuid UUID NOT NULL REFERENCES users(user_uuid) ON DELETE CASCADE,
    recipient_uuid UUID NOT NULL REFERENCES users(user_uuid) ON DELETE CASCADE,
    status invitation_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    CHECK (sender_uuid <> recipient_uuid)
);

-- Индексы
CREATE INDEX idx_workouts_scheduled ON workouts(scheduled_time);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_invitations_expiring ON invitations(expires_at) WHERE status = 'pending';
CREATE INDEX idx_active_workouts ON workouts(scheduled_time) WHERE is_completed = FALSE;
CREATE UNIQUE INDEX idx_unique_pending_invitations 
ON invitations(workout_uuid, recipient_uuid) 
WHERE status = 'pending';

CREATE OR REPLACE FUNCTION update_invitation_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Автоматически помечаем просроченные приглашения
    IF NEW.expires_at < NOW() AND NEW.status = 'pending' THEN
        NEW.status := 'expired';
    END IF;
    
    -- Обновляем время истечения при изменении статуса
    IF NEW.status <> OLD.status THEN
        NEW.updated_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для обработки вставок и обновлений
CREATE TRIGGER trg_auto_update_invitation_status
BEFORE INSERT OR UPDATE ON invitations
FOR EACH ROW EXECUTE FUNCTION update_invitation_status();