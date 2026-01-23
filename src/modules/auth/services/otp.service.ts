import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class OtpService {
    private readonly logger = new Logger(OtpService.name);
    private readonly redis: Redis;
    private readonly OTP_PREFIX = 'otp:';
    private readonly OTP_TTL_SECONDS = 600; // 10 minutes

    constructor(private readonly configService: ConfigService) {
        this.redis = new Redis({
            host: this.configService.get<string>('redis.host'),
            port: this.configService.get<number>('redis.port'),
            password: this.configService.get<string>('redis.password'),
        });
    }

    generateOtp(): string {
        // Generate 6-digit OTP
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    async storeOtp(phone: string, otp: string): Promise<void> {
        const key = `${this.OTP_PREFIX}${phone}`;
        await this.redis.setex(key, this.OTP_TTL_SECONDS, otp);
        this.logger.debug(`OTP stored for ${phone}`);
    }

    async verifyOtp(phone: string, otp: string): Promise<boolean> {
        const key = `${this.OTP_PREFIX}${phone}`;
        const storedOtp = await this.redis.get(key);

        if (!storedOtp) {
            this.logger.debug(`No OTP found for ${phone}`);
            return false;
        }

        if (storedOtp !== otp) {
            this.logger.debug(`OTP mismatch for ${phone}`);
            return false;
        }

        // Delete OTP after successful verification
        await this.redis.del(key);
        this.logger.debug(`OTP verified and deleted for ${phone}`);
        return true;
    }

    async deleteOtp(phone: string): Promise<void> {
        const key = `${this.OTP_PREFIX}${phone}`;
        await this.redis.del(key);
    }
}
