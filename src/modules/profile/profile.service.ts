import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from './entities/profile.entity';
import { UpdateProfileDto, StylistProfileDto, FieldAgentProfileDto } from './dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class ProfileService {
    constructor(
        @InjectRepository(Profile)
        private readonly profileRepository: Repository<Profile>,
        private readonly usersService: UsersService,
    ) { }

    async getProfile(userId: string): Promise<{ user: any; profile: Profile | null }> {
        const user = await this.usersService.findById(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const profile = await this.profileRepository.findOne({
            where: { userId },
        });

        const { passwordHash, ...userWithoutPassword } = user;

        return {
            user: userWithoutPassword,
            profile,
        };
    }

    async updateProfile(userId: string, updateProfileDto: UpdateProfileDto): Promise<{ user: any; profile: Profile }> {
        const user = await this.usersService.findById(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Update user name if provided
        if (updateProfileDto.name) {
            await this.usersService.update(userId, { name: updateProfileDto.name });
        }

        // Get or create profile
        let profile = await this.profileRepository.findOne({
            where: { userId },
        });

        if (!profile) {
            profile = this.profileRepository.create({ userId });
        }

        // Update profile fields
        const { name, ...profileFields } = updateProfileDto;
        Object.assign(profile, profileFields);

        const savedProfile = await this.profileRepository.save(profile);
        const updatedUser = await this.usersService.findById(userId);
        const { passwordHash, ...userWithoutPassword } = updatedUser!;

        return {
            user: userWithoutPassword,
            profile: savedProfile,
        };
    }

    async updateStylistProfile(userId: string, stylistProfileDto: StylistProfileDto): Promise<Profile> {
        let profile = await this.profileRepository.findOne({
            where: { userId },
        });

        if (!profile) {
            profile = this.profileRepository.create({ userId });
        }

        Object.assign(profile, stylistProfileDto);
        return this.profileRepository.save(profile);
    }

    async updateFieldAgentProfile(userId: string, fieldAgentProfileDto: FieldAgentProfileDto): Promise<Profile> {
        let profile = await this.profileRepository.findOne({
            where: { userId },
        });

        if (!profile) {
            profile = this.profileRepository.create({ userId });
        }

        Object.assign(profile, fieldAgentProfileDto);
        return this.profileRepository.save(profile);
    }
}
