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
        const user = await this.usersService.findByEmail(email);
        if (user && (await bcrypt.compare(password, user.passwordHash))) {
            const { passwordHash, ...result } = user;
            return result;
        }
        return null;
    }

    async login(loginDto: LoginDto) {
        const user = await this.validateUser(loginDto.email, loginDto.password);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const payload: JwtPayload = {
            sub: user.id,
            email: user.email,
            role: user.role,
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
            };

            return {
                accessToken: this.jwtService.sign(newPayload),
            };
        } catch (error) {
            throw new UnauthorizedException('Invalid refresh token');
        }
    }

    // OTP-based authentication methods

    async sendOtp(phone: string): Promise<{ message: string }> {
        // Check if user exists with this phone
        const user = await this.usersService.findByPhone(phone);
        if (!user) {
            throw new BadRequestException('No user found with this phone number');
        }

        if (!user.isActive) {
            throw new UnauthorizedException('User account is deactivated');
        }

        // Check if user is locked
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
            throw new UnauthorizedException(`Account locked. Try again in ${remainingMinutes} minutes.`);
        }

        // Generate and store OTP
        const otp = this.otpService.generateOtp();
        await this.otpService.storeOtp(phone, otp);

        // Send OTP via SMS
        const sent = await this.smsService.sendOtp(phone, otp);
        if (!sent) {
            throw new BadRequestException('Failed to send OTP. Please try again.');
        }

        return { message: 'OTP sent successfully' };
    }

    async verifyOtp(phone: string, otp: string) {
        const user = await this.usersService.findByPhone(phone);
        if (!user) {
            throw new BadRequestException('No user found with this phone number');
        }

        if (!user.isActive) {
            throw new UnauthorizedException('User account is deactivated');
        }

        // Verify OTP
        const isValid = await this.otpService.verifyOtp(phone, otp);
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
        };

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
            },
        };
    }
}
