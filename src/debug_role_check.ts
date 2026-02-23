import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './modules/users/entities/user.entity';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const userRepository = app.get(getRepositoryToken(User));

    const users = await userRepository.find();
    console.log('--- USER ROLE REPORT ---');
    users.forEach(u => {
        console.log(`User: ${u.name || 'No Name'} (${u.email || u.phone}) - Role: ${u.role} - Active: ${u.isActive}`);
    });
    console.log('------------------------');

    await app.close();
}

bootstrap();
