import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UploadService {
    private readonly s3Client: S3Client;
    private readonly bucket: string;
    private readonly region: string;
    private readonly logger = new Logger(UploadService.name);

    constructor(private readonly configService: ConfigService) {
        this.region = this.configService.get<string>('aws.region') || 'ap-south-1';
        this.bucket = this.configService.get<string>('aws.s3Bucket') || '';

        this.s3Client = new S3Client({
            region: this.region,
            credentials: {
                accessKeyId: this.configService.get<string>('aws.accessKeyId') || '',
                secretAccessKey: this.configService.get<string>('aws.secretAccessKey') || '',
            },
        });
    }

    /**
     * Upload a file buffer to S3.
     * Returns the public URL of the uploaded file.
     */
    async uploadFile(
        fileBuffer: Buffer,
        originalName: string,
        mimeType: string,
        salonId: string,
        stage: string,
    ): Promise<string> {
        const ext = originalName.split('.').pop() || 'jpg';
        const key = `salon-photos/${salonId}/${stage}/${uuidv4()}.${ext}`;

        await this.s3Client.send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: fileBuffer,
                ContentType: mimeType,
            }),
        );

        const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
        this.logger.log(`Uploaded photo: ${url}`);
        return url;
    }

    /**
     * Delete a file from S3 by URL.
     */
    async deleteFile(url: string): Promise<void> {
        try {
            // Extract key from URL
            const urlObj = new URL(url);
            const key = urlObj.pathname.substring(1); // Remove leading /

            await this.s3Client.send(
                new DeleteObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                }),
            );
            this.logger.log(`Deleted photo: ${key}`);
        } catch (error) {
            this.logger.error(`Failed to delete photo: ${url}`, error);
        }
    }
}
