import { DatabaseService } from './services/databaseService';
import { config } from '../../config';

export const initialize = async (): Promise<void> => {
  try {
    console.log('Инициализация соединения с БД...');
    
    // Регистрируем клиент для основного подключения к БД
    DatabaseService.registerClient('main', config.databases.main);
    
    // Получаем клиент и подключаемся к БД
    const mainDbClient = DatabaseService.getClient('main');
    await mainDbClient.connect();
    
    console.log('Соединение с БД установлено успешно');
  } catch (error) {
    console.error('Ошибка при инициализации БД:', error);
    throw error;
  }
}; 