import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AdminService } from './modules/admin/admin.service';
import { CreateAdminDto } from './modules/admin/dto/create-admin.dto';
import { UserRole } from './modules/users/enums/user-role.enum';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './modules/users/entities/user.entity';
import * as bcrypt from 'bcrypt';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    // Get repository directly to bypass service checks if needed, or use service
    const userRepository = app.get(getRepositoryToken(User));

    const email = 'admin12@hairoriginals.com';
    const password = 'admin123';

    try {
        const existing = await userRepository.findOne({ where: { email } });

        if (existing) {
            console.log('User exists, updating password...');
            const passwordHash = await bcrypt.hash(password, 10);
            existing.passwordHash = passwordHash;
            existing.role = UserRole.ADMIN; // Ensure role is ADMIN
            await userRepository.save(existing);
            console.log('Admin user updated.');
        } else {
            console.log('Creating new admin user...');
            const passwordHash = await bcrypt.hash(password, 10);
            const admin = userRepository.create({
                email,
                phone: '8506070421',
                name: 'Super Admin',
                passwordHash,
                role: UserRole.ADMIN,
                permissions: ['ALL'],
                isActive: true,
            });
            await userRepository.save(admin);
            console.log('Admin user created.');
        }

        console.log('------------------------------------------------');
        console.log('Admin Credentials:');
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);
        console.log('------------------------------------------------');

    } catch (error) {
        console.error('Error seeding admin:', error);
    }

    await app.close();
}

bootstrap();
