import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { UserRole } from './modules/users/enums/user-role.enum';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './modules/users/entities/user.entity';
import * as bcrypt from 'bcrypt';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const userRepository = app.get(getRepositoryToken(User));

    const stylists = [
        { email: 'stylist1@example.com', name: 'Alice Smith', phone: '9000000001' },
        { email: 'stylist2@example.com', name: 'Bob Jones', phone: '9000000002' },
        { email: 'stylist3@example.com', name: 'Charlie Brown', phone: '9000000003' },
    ];

    const passwordHash = await bcrypt.hash('stylist123', 10);

    for (const s of stylists) {
        const existing = await userRepository.findOne({ where: { email: s.email } });
        if (!existing) {
            const user = userRepository.create({
                ...s,
                passwordHash,
                role: UserRole.STYLIST,
                isActive: true,
                isPhoneVerified: true,
            });
            await userRepository.save(user);
            console.log(`Created stylist: ${s.name}`);
        } else {
            console.log(`Stylist exists: ${s.name}`);
        }
    }

    await app.close();
}

bootstrap();
