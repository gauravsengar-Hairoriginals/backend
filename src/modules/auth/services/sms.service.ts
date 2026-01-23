import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

@Injectable()
export class SmsService {
    private readonly logger = new Logger(SmsService.name);
    private readonly twilioClient: Twilio;
    private readonly fromNumber: string;

    constructor(private readonly configService: ConfigService) {
        const accountSid = this.configService.get<string>('twilio.accountSid');
        const authToken = this.configService.get<string>('twilio.authToken');
        const phoneNumber = this.configService.get<string>('twilio.phoneNumber');

        if (!accountSid || !authToken || !phoneNumber) {
            this.logger.warn('Twilio credentials not configured. SMS sending will be disabled.');
            this.twilioClient = null as any;
            this.fromNumber = '';
        } else {
            this.twilioClient = new Twilio(accountSid, authToken);
            this.fromNumber = phoneNumber;
        }
    }

    async sendSms(to: string, message: string): Promise<boolean> {
        if (!this.twilioClient) {
            this.logger.warn(`[DEV MODE] SMS to ${to}: ${message}`);
            return true;
        }

        try {
            await this.twilioClient.messages.create({
                to,
                from: this.fromNumber,
                body: message,
            });
            this.logger.log(`SMS sent successfully to ${to}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to send SMS to ${to}:`, error);
            return false;
        }
    }

    async sendOtp(to: string, otp: string): Promise<boolean> {
        const message = `Your Hair Originals verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`;
        return this.sendSms(to, message);
    }
}
