import { registerAs } from '@nestjs/config';

export default registerAs('twilio', () => ({
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    serviceSid: process.env.TWILIO_SERVICE_SID,
    otpMessageFormat: process.env.TWILIO_OTP_MESSAGE_FORMAT,
}));
