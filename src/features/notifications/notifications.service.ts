import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../common/logger/app.logger';

export enum NotificationChannel {
  Sms = 'sms',
  Email = 'email',
  Push = 'push',
}

/** Shape returned by every send* method. */
export interface NotificationResult {
  provider: 'msg91' | 'resend' | 'firebase';
  channel: NotificationChannel;
  status: 'mock' | 'sent';
  to: string;
  messageId: string;
  mock: boolean;
}

/**
 * Shared, tenant-agnostic notification infrastructure.
 *
 * Lives in the application scope (not inside any tenant schema) because
 * notification credentials and provider configuration are application-level,
 * not per-school.
 *
 * Currently in PLACEHOLDER/MOCK mode: none of the provider SDKs are wired up
 * yet (no real API keys configured). Each method validates that its required
 * environment variable exists, logs what WOULD be sent via AppLogger, and
 * returns a mock success response. When `NOTIFICATIONS_MOCK_MODE=false`, a
 * missing env var raises a clear error instead of silently succeeding.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  /** Mock mode is on by default; off only when explicitly set to 'false'. */
  private get isMockMode(): boolean {
    return (
      this.configService.get<string>('NOTIFICATIONS_MOCK_MODE', 'true') !==
      'false'
    );
  }

  /**
   * Resolves a provider env var. In mock mode a missing value is logged as a
   * warning and returns undefined; outside mock mode it throws a clear error.
   */
  private requireConfig(
    envVar: string,
    providerName: string,
    channel: NotificationChannel,
  ): string | undefined {
    const value = this.configService.get<string>(envVar);
    if (!value) {
      if (this.isMockMode) {
        this.logger.warn(
          `[Notifications] ${envVar} is not set — ${channel} will be mocked (no real provider call).`,
        );
        return undefined;
      }
      throw new Error(
        `${envVar} environment variable is required to send ${channel} notifications via ${providerName}.`,
      );
    }
    return value;
  }

  /**
   * Sends an SMS via MSG91.
   * @param to      Recipient phone number in international format, e.g. "+15550001000".
   * @param message Plain-text message body.
   *
   * Placeholder implementation — logs the message and returns a mock response.
   * The MSG91_API_KEY resolved by requireConfig() below is what the real call
   * would use.
   *
   * TODO(notifications): Replace the mock below with the real MSG91 SDK call,
   * e.g. once a key is configured (make this method async again when you do):
   *   const msg91 = new Msg91({ authkey: apiKey, senderId: MSG91_SENDER_ID });
   *   await msg91.send({ mobile: to, message, route: '4' });
   */
  sendSms(to: string, message: string): Promise<NotificationResult> {
    this.requireConfig('MSG91_API_KEY', 'MSG91', NotificationChannel.Sms);

    this.logger.log(
      `[Notifications][mock] SMS would be sent to ${to}: "${message}"`,
    );
    return Promise.resolve({
      provider: 'msg91',
      channel: NotificationChannel.Sms,
      status: 'mock',
      to,
      messageId: `mock-sms-${Date.now()}`,
      mock: true,
    });
  }

  /**
   * Sends an email via Resend.
   * @param to      Recipient email address.
   * @param subject Email subject line.
   * @param body    Email body (plain text for now).
   *
   * Placeholder implementation — logs the email and returns a mock response.
   * The RESEND_API_KEY resolved by requireConfig() below is what the real
   * call would use.
   *
   * TODO(notifications): Replace the mock below with the real Resend SDK call,
   * e.g. once a key is configured (make this method async again when you do):
   *   const resend = new Resend(apiKey);
   *   await resend.emails.send({ from: RESEND_FROM_EMAIL, to, subject, text: body });
   */
  sendEmail(
    to: string,
    subject: string,
    body: string,
  ): Promise<NotificationResult> {
    this.requireConfig('RESEND_API_KEY', 'Resend', NotificationChannel.Email);

    this.logger.log(
      `[Notifications][mock] Email would be sent to ${to} — subject: "${subject}" body: "${body}"`,
    );
    return Promise.resolve({
      provider: 'resend',
      channel: NotificationChannel.Email,
      status: 'mock',
      to,
      messageId: `mock-email-${Date.now()}`,
      mock: true,
    });
  }

  /**
   * Sends a push notification via Firebase Cloud Messaging (Admin SDK).
   * @param deviceToken FCM registration token of the target device.
   * @param title       Notification title.
   * @param body        Notification body.
   *
   * Placeholder implementation — logs the notification and returns a mock
   * response. The FIREBASE_SERVICE_ACCOUNT_JSON resolved by requireConfig()
   * below is what the real call would use.
   *
   * TODO(notifications): Replace the mock below with the real Firebase Admin
   * SDK call, e.g. once a service account is configured (make this method
   * async again when you do):
   *   const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
   *   await app.messaging().send({ token: deviceToken, notification: { title, body } });
   */
  sendPushNotification(
    deviceToken: string,
    title: string,
    body: string,
  ): Promise<NotificationResult> {
    this.requireConfig(
      'FIREBASE_SERVICE_ACCOUNT_JSON',
      'Firebase Cloud Messaging',
      NotificationChannel.Push,
    );

    this.logger.log(
      `[Notifications][mock] Push would be sent to token ${deviceToken} — title: "${title}" body: "${body}"`,
    );
    return Promise.resolve({
      provider: 'firebase',
      channel: NotificationChannel.Push,
      status: 'mock',
      to: deviceToken,
      messageId: `mock-push-${Date.now()}`,
      mock: true,
    });
  }
}
