import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) { }

    async create(createUserDto: CreateUserDto & { passwordHash: string }): Promise<User> {
        // Check if user exists
        const existingUser = await this.userRepository.findOne({
            where: [
                { email: createUserDto.email },
                { phone: createUserDto.phone },
            ],
        });

        if (existingUser) {
            throw new ConflictException('User with this email or phone already exists');
        }

        const user = this.userRepository.create(createUserDto);
        return this.userRepository.save(user);
    }

    async findAll(): Promise<User[]> {
        return this.userRepository.find({
            select: ['id', 'email', 'phone', 'name', 'role', 'department', 'isActive', 'createdAt'],
        });
    }

    async findById(id: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { id } });
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { email } });
    }

    async findByPhone(phone: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { phone } });
    }

    async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
        const user = await this.findById(id);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        Object.assign(user, updateUserDto);
        return this.userRepository.save(user);
    }

    async updateLastLogin(id: string): Promise<void> {
        await this.userRepository.update(id, {
            lastLoginAt: new Date(),
            failedLoginAttempts: 0,
        });
    }

    async incrementFailedAttempts(id: string): Promise<void> {
        const user = await this.findById(id);
        if (user) {
            user.failedLoginAttempts += 1;
            if (user.failedLoginAttempts >= 5) {
                user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
            }
            await this.userRepository.save(user);
        }
    }

    async deactivate(id: string): Promise<void> {
        await this.userRepository.update(id, { isActive: false });
    }

    async activate(id: string): Promise<void> {
        await this.userRepository.update(id, { isActive: true });
    }

    async assignRole(id: string, role: string): Promise<User> {
        const user = await this.findById(id);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        user.role = role as any;
        return this.userRepository.save(user);
    }
}
