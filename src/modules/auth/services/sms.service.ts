import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

@Injectable()
export class SmsService {
    private readonly logger = new Logger(SmsService.name);
    private readonly twilioClient: Twilio;
    private readonly serviceSid: string;
    private readonly fromNumber: string;

    constructor(private readonly configService: ConfigService) {
        const accountSid = this.configService.get<string>('twilio.accountSid');
        const authToken = this.configService.get<string>('twilio.authToken');
        const serviceSid = this.configService.get<string>('twilio.serviceSid');
        const phoneNumber = this.configService.get<string>('twilio.phoneNumber');

        if (!accountSid || !authToken || !serviceSid) {
            this.logger.warn('Twilio credentials not configured. SMS sending will be disabled.');
            this.twilioClient = null as any;
            this.serviceSid = '';
            this.fromNumber = '';
        } else {
            this.twilioClient = new Twilio(accountSid, authToken);
            this.serviceSid = serviceSid;
            this.fromNumber = phoneNumber || '';
        }
    }

    /**
     * Send OTP via Twilio Verify API
     */
    async sendOtp(to: string, _otp?: string): Promise<boolean> {
        if (!this.twilioClient) {
            this.logger.warn(`[DEV MODE] OTP verification to ${to} - Twilio not configured`);
            return true;
        }

        try {
            const verification = await this.twilioClient.verify.v2
                .services(this.serviceSid)
                .verifications.create({
                    to,
                    channel: 'sms',
                });
            this.logger.log(`Twilio Verify OTP sent to ${to}, status: ${verification.status}`);
            return verification.status === 'pending';
        } catch (error: any) {
            this.logger.error(`Failed to send OTP to ${to}: ${error.message}`);
            return false;
        }
    }

    /**
     * Verify OTP via Twilio Verify API
     */
    async verifyOtp(to: string, code: string): Promise<boolean> {
        if (!this.twilioClient) {
            this.logger.warn(`[DEV MODE] OTP verification for ${to} with code ${code} - auto-approved`);
            return true;
        }

        try {
            const verificationCheck = await this.twilioClient.verify.v2
                .services(this.serviceSid)
                .verificationChecks.create({
                    to,
                    code,
                });
            this.logger.log(`Twilio Verify check for ${to}, status: ${verificationCheck.status}`);
            return verificationCheck.status === 'approved';
        } catch (error: any) {
            this.logger.error(`Failed to verify OTP for ${to}: ${error.message}`);
            return false;
        }
    }

    /**
     * Send a raw SMS (non-OTP use cases)
     */
    async sendSms(to: string, message: string): Promise<boolean> {
        if (!this.twilioClient || !this.fromNumber) {
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
        } catch (error: any) {
            this.logger.error(`Failed to send SMS to ${to}: ${error.message}`);
            return false;
        }
    }
}
