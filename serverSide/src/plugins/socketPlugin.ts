import { FastifyPluginAsync } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { NotificationService } from '../sockets/services/notificationService';

const socketPlugin: FastifyPluginAsync = async (fastify) => {
  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: ['*'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  const notificationService = new NotificationService(io);

  fastify.decorate('io', io);
  fastify.decorate('notificationService', notificationService);
};

export default socketPlugin;
