import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

import { FieldForceSalon } from './entities/field-force-salon.entity';
import { UserRole } from './enums/user-role.enum';

import * as bcrypt from 'bcrypt';
import { normalizePhone } from '../../common/utils/phone.util';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(FieldForceSalon)
        private readonly fieldForceSalonRepository: Repository<FieldForceSalon>,
    ) { }

    async create(createUserDto: CreateUserDto & { passwordHash: string }): Promise<User> {
        // Normalize phone before checking/creating
        if (createUserDto.phone) {
            createUserDto.phone = normalizePhone(createUserDto.phone);
        }
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

    async createStylist(dto: { name: string; phone: string; salonId: string }): Promise<User> {
        const normalizedPhone = normalizePhone(dto.phone);
        const existingUser = await this.findByPhone(normalizedPhone);
        if (existingUser) {
            throw new ConflictException('User with this phone already exists');
        }

        const passwordHash = await bcrypt.hash('123456', 10); // Default password

        const user = this.userRepository.create({
            name: dto.name,
            phone: normalizedPhone,
            salonId: dto.salonId,
            role: UserRole.STYLIST,
            passwordHash,
            isActive: true,
            isPhoneVerified: true
        });

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
        return this.userRepository.findOne({ where: { phone: normalizePhone(phone) } });
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

    // Field Force Management

    async createFieldAgent(createUserDto: CreateUserDto & { passwordHash: string }): Promise<User> {
        // Force role to FIELD_AGENT if not specified or override
        // Actually, the controller should set the role. But we can ensure it here if we want dedicated method.
        // For now, reuse create() but we might need specific validation.
        return this.create(createUserDto);
    }

    async listFieldAgents(): Promise<any[]> {
        const agents = await this.userRepository.find({
            where: { role: 'FIELD_AGENT' as any },
            select: ['id', 'name', 'phone', 'email', 'isActive', 'createdAt'],
            order: { createdAt: 'DESC' }
        });

        // Get salon counts
        const agentsWithCounts = await Promise.all(agents.map(async (agent) => {
            const count = await this.fieldForceSalonRepository.count({
                where: { agentId: agent.id, status: 'active' }
            });
            return {
                ...agent,
                assignedSalonsCount: count
            };
        }));

        return agentsWithCounts;
    }

    async assignSalonsToAgent(agentId: string, salonIds: string[]): Promise<void> {
        const agent = await this.findById(agentId);
        if (!agent) throw new NotFoundException('Agent not found');

        // Verify agent role?
        // if (agent.role !== 'FIELD_AGENT' && agent.role !== 'FIELD_FORCE_TEAM_LEAD') ...

        // active status
        const status = 'active';

        // Bulk insert or upsert?
        // Iterate and save to handle potential duplicates or reactivations
        for (const salonId of salonIds) {
            const existing = await this.fieldForceSalonRepository.findOne({
                where: { agentId, salonId }
            });

            if (existing) {
                if (existing.status !== status) {
                    existing.status = status;
                    await this.fieldForceSalonRepository.save(existing);
                }
            } else {
                const mapping = this.fieldForceSalonRepository.create({
                    agentId,
                    salonId,
                    status
                });
                await this.fieldForceSalonRepository.save(mapping);
            }
        }
    }

    async getAgentSalons(agentId: string): Promise<FieldForceSalon[]> {
        return this.fieldForceSalonRepository.find({
            where: { agentId, status: 'active' },
            relations: ['salon', 'salon.owner'],
            order: { assignedAt: 'DESC' }
        });
    }
}
