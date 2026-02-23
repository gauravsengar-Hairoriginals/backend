/**
 * Normalize a phone number to +91XXXXXXXXXX format.
 * Handles:
 *   - Raw 10-digit: 8888888888 → +918888888888
 *   - With 91 prefix: 918888888888 → +918888888888
 *   - Already formatted: +918888888888 → +918888888888
 *   - With leading 0: 08888888888 → +918888888888
 */
export function normalizePhone(phone: string): string {
    if (!phone) return phone;

    // Strip all non-digit characters except leading +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // Remove leading +
    if (cleaned.startsWith('+')) {
        cleaned = cleaned.substring(1);
    }

    // Remove leading 0 (local format)
    if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
    }

    // If 10 digits, prepend 91
    if (cleaned.length === 10) {
        cleaned = '91' + cleaned;
    }

    // If 12 digits starting with 91, it's correct
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
        return '+' + cleaned;
    }

    // Fallback: return with + prefix
    return '+' + cleaned;
}
