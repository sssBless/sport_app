import 'fastify';
import {Server} from 'socket.io';
import {NotificationService} from '../src/sockets/services/notificationService';
import {FastifyRequest, FastifyReply, FastifyInstance} from 'fastify';

declare module 'fastify' {
  export interface FastifyInstance {
    io: Server;
    notificationService: NotificationService;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>;
  }

  export interface FastifyRequest {
    user?: {
      uuid: string;
      username: string;
    };
  }
}

export type AuthenticatedRequest = FastifyRequest & {
  user: NonNullable<FastifyRequest['user']>;
};

export interface AuthenticatedFastifyInstance extends FastifyInstance {
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>;
  notificationService?: {
    notifyUser: (userId: string, message: string) => void;
  };
}
