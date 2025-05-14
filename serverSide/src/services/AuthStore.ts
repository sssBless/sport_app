import crypto from 'crypto';

interface AuthenticatedUser {
  uuid: string;
  username: string;
  signature: string;
  lastActivity: number;
}

interface ClientInfo {
  userAgent: string;
  ip: string;
}

export class AuthStore {
  private static instance: AuthStore;
  private users: Map<string, AuthenticatedUser> = new Map();
  private readonly TOKEN_EXPIRATION = 24 * 60 * 60 * 1000; // 24 часа

  private constructor() {}

  public static getInstance(): AuthStore {
    if (!AuthStore.instance) {
      AuthStore.instance = new AuthStore();
    }
    return AuthStore.instance;
  }

  public addUser(uuid: string, username: string, clientInfo: ClientInfo): string {
    const signature = this.generateSignature(uuid, clientInfo);
    
    this.users.set(signature, {
      uuid,
      username,
      signature,
      lastActivity: Date.now()
    });

    return signature;
  }

  public getUser(signature: string): AuthenticatedUser | null {
    const user = this.users.get(signature);
    
    if (!user) return null;

    if (Date.now() - user.lastActivity > this.TOKEN_EXPIRATION) {
      this.removeUser(signature);
      return null;
    }

    user.lastActivity = Date.now();
    return user;
  }

  public removeUser(signature: string): void {
    this.users.delete(signature);
  }

  public validateSignature(signature: string, clientInfo: ClientInfo): boolean {
    const user = this.users.get(signature);
   
    if (!user) return false;

    const expectedSignature = this.generateSignature(user.uuid, clientInfo);
 
    return signature === expectedSignature;
  }

  public cleanup(): void {
    const now = Date.now();
    for (const [signature, user] of this.users.entries()) {
      if (now - user.lastActivity > this.TOKEN_EXPIRATION) {
        this.users.delete(signature);
      }
    }
  }

  private generateSignature(uuid: string, clientInfo: ClientInfo): string {
    const timestamp = Date.now();
    const salt = crypto.randomBytes(16).toString('hex');
    const data = `${uuid}:${clientInfo.userAgent}:${clientInfo.ip}:${timestamp}:${salt}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

} 