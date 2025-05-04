import {Socket, Server} from 'socket.io';

export class NotificationService {
  private userSockets: Map<string, Socket> = new Map();
  private io: Server;

  constructor(io: Server) {
    this.io = io;
    this.initialize();
  }

  private initialize() {
    this.io.on('connection', (socket: Socket) => {
      console.log('Socket connected:', socket.id);

      socket.on('register', (userUuid: string) => {
        this.registerUser(userUuid, socket);
      });

      socket.on('disconnect', () => {
        this.unregisterUser(socket);
      });
    });
  }

  public registerUser(userUuid: string, socket: Socket) {
    this.userSockets.set(userUuid, socket);
    console.log(`User ${userUuid} registered with socket ${socket.id}`);
  }

  public unregisterUser(socket: Socket) {
    for (const [uuid, s] of this.userSockets.entries()) {
      if (s.id === socket.id) {
        this.userSockets.delete(uuid);
        console.log(`User ${uuid} unregistered`);
        break;
      }
    }
  }

  public notifyUser(userUuid: string, message: string) {
    const socket = this.userSockets.get(userUuid);
    if (socket) {
      socket.emit('notification', message);
    } else {
      console.log(`User ${userUuid} not connected`);
    }
  }

  public notifyAll(message: string) {
    this.io.emit('notification', message);
  }
}
