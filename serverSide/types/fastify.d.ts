import 'fastify';
import {Server} from 'socket.io';
import {NotificationService} from '../src/sockets/services/notificationService';
import {FastifyRequest, FastifyReply} from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
    notificationService: NotificationService;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>;
  }

  interface FastifyRequest {
    user?: {
      uuid: string;
      username: string;
    };
  }
}
