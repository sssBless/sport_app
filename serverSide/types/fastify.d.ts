import 'fastify';
import {Server} from 'socket.io';
import {NotificationService} from '../src/sockets/services/notificationService';

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
    notificationService: NotificationService;
  }
}
