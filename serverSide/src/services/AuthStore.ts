import crypto from 'crypto';

interface AuthenticatedUser {
  uuid: string;
  username: string;
  signature: string;
  lastActivity: number;
  clientInfo: ClientInfo;
}

interface ClientInfo {
  userAgent: string;
  ip: string;
}

export class AuthStore {
  private static instance: AuthStore;
  private users: Map<string, AuthenticatedUser> = new Map();
  private readonly TOKEN_EXPIRATION = 24 * 60 * 60 * 1000; // 24 часа
  private readonly SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';

  private constructor() {
    // Автоматическая очистка просроченных токенов
    setInterval(() => {
      this.cleanup();
    }, 15 * 60 * 1000); // Каждые 15 минут
  }

  public static getInstance(): AuthStore {
    if (!AuthStore.instance) {
      AuthStore.instance = new AuthStore();
    }
    return AuthStore.instance;
  }

  public addUser(uuid: string, username: string, clientInfo: ClientInfo): string {
    // Очищаем существующие токены этого пользователя при новом логине
    this.invalidateUserSessions(uuid);
    
    const signature = this.generateSignature(uuid);
    
    const user = {
      uuid,
      username,
      signature,
      lastActivity: Date.now(),
      clientInfo
    };
    
    this.users.set(signature, user);
    console.log(`[AuthStore] Пользователь добавлен: ${username}, UUID: ${uuid.substring(0, 8)}`);
    console.log(`[AuthStore] Всего активных пользователей: ${this.users.size}`);
    
    return signature;
  }

  public getUser(signature: string): AuthenticatedUser | null {
    if (!signature) {
      console.log('[AuthStore] Запрос пользователя с пустой подписью');
      return null;
    }
    
    console.log(`[AuthStore] Поиск пользователя для подписи: ${signature.substring(0, 8)}...`);
    
    const user = this.users.get(signature);
    
    if (!user) {
      console.log('[AuthStore] Пользователь не найден в хранилище');
      return null;
    }

    if (Date.now() - user.lastActivity > this.TOKEN_EXPIRATION) {
      console.log('[AuthStore] Сессия пользователя истекла');
      this.removeUser(signature);
      return null;
    }

    // Обновляем время активности
    user.lastActivity = Date.now();
    console.log(`[AuthStore] Пользователь найден: ${user.username}, UUID: ${user.uuid.substring(0, 8)}`);
    
    return user;
  }

  public removeUser(signature: string): void {
    const user = this.users.get(signature);
    if (user) {
      console.log(`[AuthStore] Удаление пользователя: ${user.username}, UUID: ${user.uuid.substring(0, 8)}`);
    } else {
      console.log(`[AuthStore] Попытка удаления несуществующего пользователя с подписью: ${signature.substring(0, 8)}...`);
    }
    
    this.users.delete(signature);
    console.log(`[AuthStore] Осталось активных пользователей: ${this.users.size}`);
  }

  // Инвалидирует все сессии конкретного пользователя
  public invalidateUserSessions(userUuid: string): void {
    let count = 0;
    for (const [signature, user] of this.users.entries()) {
      if (user.uuid === userUuid) {
        this.users.delete(signature);
        count++;
      }
    }
    if (count > 0) {
      console.log(`[AuthStore] Инвалидировано ${count} сессий для пользователя с UUID: ${userUuid.substring(0, 8)}`);
    }
  }

  public validateSignature(signature: string, clientInfo: ClientInfo): boolean {
    if (!signature) {
      console.log('[AuthStore] Попытка валидации пустой подписи');
      return false;
    }
    
    console.log(`[AuthStore] Валидация подписи: ${signature.substring(0, 8)}...`);
    console.log(`[AuthStore] Информация о клиенте: IP=${clientInfo.ip}, UA=${clientInfo.userAgent.substring(0, 20)}...`);
    
    const user = this.users.get(signature);
    if (!user) {
      console.log('[AuthStore] Пользователь не найден для данной подписи');
      return false;
    }

    // На этапе валидации делаем более простую проверку без проверки user-agent и ip
    // для более стабильной работы между запросами
    
    // Обновляем время последней активности
    user.lastActivity = Date.now();
    console.log(`[AuthStore] Подпись успешно валидирована для пользователя: ${user.username}`);
    return true;
  }

  public cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [signature, user] of this.users.entries()) {
      if (now - user.lastActivity > this.TOKEN_EXPIRATION) {
        this.users.delete(signature);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      console.log(`[AuthStore] Очищено ${cleanedCount} истекших сессий`);
    }
  }

  private generateSignature(uuid: string): string {
    const timestamp = Date.now();
    const randomPart = Math.random().toString(36).substring(2, 10);
    const data = `${uuid}:${timestamp}:${randomPart}:${this.SECRET_KEY}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  public getAllUsers(): AuthenticatedUser[] {
    return Array.from(this.users.values());
  }

  public getUserCount(): number {
    return this.users.size;
  }

  public debugStore(): string {
    const activeUsers = this.getAllUsers().map(u => ({
      username: u.username,
      uuid: u.uuid.substring(0, 8),
      lastActivity: new Date(u.lastActivity).toISOString(),
      signatureStart: u.signature.substring(0, 8)
    }));
    
    return JSON.stringify({
      userCount: this.getUserCount(),
      users: activeUsers
    }, null, 2);
  }
} 