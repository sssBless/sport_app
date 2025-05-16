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

  private constructor() {}

  public static getInstance(): AuthStore {
    if (!AuthStore.instance) {
      AuthStore.instance = new AuthStore();
    }
    return AuthStore.instance;
  }

  public addUser(uuid: string, username: string, clientInfo: ClientInfo): string {
    const signature = this.generateSignature(uuid);
    
    const user = {
      uuid,
      username,
      signature,
      lastActivity: Date.now(),
      clientInfo
    };
    
    this.users.set(signature, user);
    console.log('Added user to AuthStore:', { username, signature });
    console.log('Current users in store:', Array.from(this.users.keys()));
    
    return signature;
  }

  public getUser(signature: string): AuthenticatedUser | null {
    console.log('Getting user for signature:', signature);
    console.log('Available signatures:', Array.from(this.users.keys()));
    
    const user = this.users.get(signature);
    console.log('Found user:', user);
    
    if (!user) {
      console.log('User not found in store');
      return null;
    }

    if (Date.now() - user.lastActivity > this.TOKEN_EXPIRATION) {
      console.log('User session expired');
      this.removeUser(signature);
      return null;
    }

    user.lastActivity = Date.now();
    return user;
  }

  public removeUser(signature: string): void {
    console.log('Removing user with signature:', signature);
    this.users.delete(signature);
    console.log('Remaining users:', Array.from(this.users.keys()));
  }

  public validateSignature(signature: string, clientInfo: ClientInfo): boolean {
    console.log('Validating signature:', signature);
    console.log('With client info:', clientInfo);
    
    const user = this.users.get(signature);
    if (!user) {
      console.log('No user found for signature');
      return false;
    }

    // Обновляем время последней активности
    user.lastActivity = Date.now();
    console.log('Signature validated successfully');
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
      console.log(`Cleaned up ${cleanedCount} expired sessions`);
    }
  }

  private generateSignature(uuid: string): string {
    const timestamp = Date.now();
    const data = `${uuid}:${timestamp}:${this.SECRET_KEY}`;
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
      uuid: u.uuid,
      lastActivity: new Date(u.lastActivity).toISOString(),
      signatureStart: u.signature.substring(0, 5)
    }));
    
    return JSON.stringify({
      userCount: this.getUserCount(),
      users: activeUsers
    }, null, 2);
  }
} 