import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { OtpService } from './services/otp.service';
import { SmsService } from './services/sms.service';
import { normalizePhone } from '../../common/utils/phone.util';

@Injectable()
export class AuthService {
    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly otpService: OtpService,
        private readonly smsService: SmsService,
    ) { }

    async validateUser(email: string, password: string): Promise<any> {
        console.log(`[AuthService] Validating user: ${email}`);
        const user = await this.usersService.findByEmail(email);
        if (user) {
            console.log(`[AuthService] User found: ${user.email}, Role: ${user.role}`);
            const isMatch = await bcrypt.compare(password, user.passwordHash);
            console.log(`[AuthService] Password match: ${isMatch}`);
            if (isMatch) {
                const { passwordHash, ...result } = user;
                return result;
            }
        } else {
            console.log(`[AuthService] User not found for email: ${email}`);
        }
        return null;
    }

    async login(loginDto: LoginDto) {
        console.log(`[AuthService] Login attempt for: ${loginDto.email}`);
        const user = await this.validateUser(loginDto.email, loginDto.password);
        if (!user) {
            console.warn(`[AuthService] Login failed for: ${loginDto.email}`);
            throw new UnauthorizedException('Invalid credentials');
        }

        const payload: JwtPayload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            permissions: user.permissions,
        };

        return {
            accessToken: this.jwtService.sign(payload),
            refreshToken: this.jwtService.sign(payload, {
                expiresIn: this.configService.get('jwt.refreshExpiresIn'),
            }),
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                level: user.level,
            },
        };
    }

    async register(registerDto: RegisterDto) {
        const hashedPassword = await bcrypt.hash(registerDto.password, 12);
        const user = await this.usersService.create({
            ...registerDto,
            passwordHash: hashedPassword,
        });

        const { passwordHash, ...result } = user;
        return result;
    }

    async refreshToken(token: string) {
        try {
            const payload = this.jwtService.verify(token);
            const user = await this.usersService.findById(payload.sub);

            if (!user) {
                throw new UnauthorizedException('User not found');
            }

            const newPayload: JwtPayload = {
                sub: user.id,
                email: user.email,
                role: user.role,
                permissions: user.permissions,
            };

            return {
                accessToken: this.jwtService.sign(newPayload),
            };
        } catch (error) {
            throw new UnauthorizedException('Invalid refresh token');
        }
    }

    // OTP-based authentication methods

    async sendOtp(phone: string): Promise<{ message: string; isNewUser?: boolean }> {
        phone = normalizePhone(phone);
        // Check if user exists with this phone
        let user = await this.usersService.findByPhone(phone);
        let isNewUser = false;

        // Auto-register as STYLIST if user doesn't exist
        if (!user) {
            const randomPassword = Math.random().toString(36).slice(-12);
            const hashedPassword = await bcrypt.hash(randomPassword, 12);

            user = await this.usersService.create({
                phone,
                name: 'Stylist',
                role: 'STYLIST' as any,
                passwordHash: hashedPassword,
            });
            isNewUser = true;
        }

        if (!user.isActive) {
            throw new UnauthorizedException('User account is deactivated');
        }

        // Check if user is locked
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
            throw new UnauthorizedException(`Account locked. Try again in ${remainingMinutes} minutes.`);
        }

        // Send OTP via Twilio Verify (Twilio generates and manages the OTP)
        const sent = await this.smsService.sendOtp(phone);
        if (!sent) {
            throw new BadRequestException('Failed to send OTP. Please try again.');
        }

        return { message: 'OTP sent successfully', isNewUser };
    }

    async verifyOtp(phone: string, otp: string) {
        phone = normalizePhone(phone);
        const user = await this.usersService.findByPhone(phone);
        if (!user) {
            throw new BadRequestException('No user found with this phone number');
        }

        if (!user.isActive) {
            throw new UnauthorizedException('User account is deactivated');
        }

        // Master OTP bypass for development/testing
        const MASTER_OTP = '123456';
        const isDev = process.env.NODE_ENV !== 'production';
        let isValid = false;

        if (isDev && otp === MASTER_OTP) {
            isValid = true;
        } else {
            // Verify OTP via Twilio Verify
            isValid = await this.smsService.verifyOtp(phone, otp);
        }

        if (!isValid) {
            await this.usersService.incrementFailedAttempts(user.id);
            throw new UnauthorizedException('Invalid or expired OTP');
        }

        // Update last login
        await this.usersService.updateLastLogin(user.id);

        // Mark phone as verified if not already
        if (!user.isPhoneVerified) {
            await this.usersService.update(user.id, { isPhoneVerified: true } as any);
        }

        const payload: JwtPayload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            permissions: user.permissions,
        };

        // Check if user profile is incomplete (default name indicates new registration)
        const requiresProfileUpdate = user.name === 'Stylist' || !user.name;

        return {
            accessToken: this.jwtService.sign(payload),
            refreshToken: this.jwtService.sign(payload, {
                expiresIn: this.configService.get('jwt.refreshExpiresIn'),
            }),
            user: {
                id: user.id,
                email: user.email,
                phone: user.phone,
                name: user.name,
                role: user.role,
                level: user.level,
            },
            requiresProfileUpdate,
        };
    }

    async sendTestSms(phone: string, otp: string) {
        if (!phone || !otp) {
            throw new BadRequestException('Phone and OTP are required');
        }
        const result = await this.smsService.sendOtp(phone, otp);
        return { success: result, message: result ? 'SMS sent' : 'Failed to send SMS' };
    }
}
