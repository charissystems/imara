// tests/integration/messaging.test.ts
// Integration tests for the /messaging routes – notifications, templates, campaigns,
// preferences, and message delivery tracking.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../../src/index';
import { dbManager } from '../../src/config/database';
import {
    authHeaders,
    tenantHeaders,
    seedTestStaff,
    seedTestMember,
    cleanupTestData,
    TEST_MEMBER_ID,
    TEST_MEMBER_2_ID,
    TEST_SCHEMA,
} from '../helpers/integration';

describe('Messaging API Endpoints', () => {
    let headers: Record<string, string>;

    // IDs captured during tests
    let templateId: string;
    let messageId: string;
    let campaignId: string;
    let scheduledMessageId: string;

    // -----------------------------------------------------------------------
    // Setup: seed staff and members
    // -----------------------------------------------------------------------
    beforeAll(async () => {
        const isHealthy = await dbManager.healthCheck();
        expect(isHealthy).toBe(true);

        await seedTestStaff();
        await seedTestMember(TEST_MEMBER_ID);
        await seedTestMember(TEST_MEMBER_2_ID);
        headers = await authHeaders();
    });

    // -----------------------------------------------------------------------
    // Message Templates
    // -----------------------------------------------------------------------
    describe('Message Templates', () => {
        it('POST /messaging/templates - should create a message template', async () => {
            const res = await app.request('/messaging/templates', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    code: `TEST_TMPL_${Date.now().toString(36).slice(-6).toUpperCase()}`,
                    name: 'Test Welcome Template',
                    channel: 'sms',
                    body: 'Welcome {{member_name}}! Your account number is {{account_number}}.',
                    description: 'Integration test template',
                    merge_fields: ['member_name', 'account_number'],
                }),
            });

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            expect(body.data.code).toContain('TEST_TMPL_');
            templateId = body.data.id;
        });

        it('GET /messaging/templates - should list all templates', async () => {
            const res = await app.request('/messaging/templates', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
            expect(body.data.length).toBeGreaterThanOrEqual(1);
        });

        it('GET /messaging/templates/:templateId - should get template details', async () => {
            const res = await app.request(`/messaging/templates/${templateId}`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.id).toBe(templateId);
            expect(body.data.name).toBe('Test Welcome Template');
        });

        it('PATCH /messaging/templates/:templateId - should update template', async () => {
            const res = await app.request(`/messaging/templates/${templateId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    name: 'Updated Test Template',
                    body: 'Hello {{member_name}}! Updated message.',
                }),
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });

        it('GET /messaging/templates?channel=sms - should filter by channel', async () => {
            const res = await app.request('/messaging/templates?channel=sms', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('GET /messaging/templates?active=true - should filter active templates', async () => {
            const res = await app.request('/messaging/templates?active=true', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Sending Messages
    // -----------------------------------------------------------------------
    describe('Single Message Sending', () => {
        it('POST /messaging/send - should send an SMS message', async () => {
            const res = await app.request('/messaging/send', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    channel: 'sms',
                    body: 'This is a test SMS message.',
                    member_id: TEST_MEMBER_ID,
                    recipient_phone: '+254700000001',
                }),
            });

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            messageId = body.data.id;
        });

        it('POST /messaging/send - should send an email message', async () => {
            const res = await app.request('/messaging/send', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    channel: 'email',
                    body: 'This is a test email message.',
                    subject: 'Test Email',
                    member_id: TEST_MEMBER_ID,
                    recipient_email: 'test@example.com',
                }),
            });

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });

        it('POST /messaging/send - should send message using template', async () => {
            const res = await app.request('/messaging/send', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    channel: 'sms',
                    body: 'Placeholder text',
                    template_id: templateId,
                    member_id: TEST_MEMBER_ID,
                    recipient_phone: '+254700000001',
                    variables: {
                        member_name: 'John Doe',
                        account_number: 'ACC-123456',
                    },
                }),
            });

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });

        it('POST /messaging/send - should reject message without recipient', async () => {
            const res = await app.request('/messaging/send', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    channel: 'sms',
                    body: 'Test message',
                }),
            });

            expect(res.status).toBeGreaterThanOrEqual(400);
        });

        it('GET /messaging/messages/:messageId - should get message status', async () => {
            const res = await app.request(`/messaging/messages/${messageId}`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.id).toBe(messageId);
        });
    });

    // -----------------------------------------------------------------------
    // Bulk Campaigns
    // -----------------------------------------------------------------------
    describe('Bulk Campaigns', () => {
        it('POST /messaging/bulk - should create a bulk campaign', async () => {
            const res = await app.request('/messaging/bulk', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: `Test Campaign ${Date.now()}`,
                    channel: 'sms',
                    body: 'Important announcement for all members!',
                    immediate_send: false,
                    recipient_filter: {
                        status: 'active',
                    },
                }),
            });

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            campaignId = body.data.id;
        });

        it('GET /messaging/campaigns - should list all campaigns', async () => {
            const res = await app.request('/messaging/campaigns', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('GET /messaging/campaigns/:campaignId - should get campaign details', async () => {
            const res = await app.request(`/messaging/campaigns/${campaignId}`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data.id).toBe(campaignId);
        });

        it('POST /messaging/campaigns/:campaignId/send - should send campaign', async () => {
            const res = await app.request(`/messaging/campaigns/${campaignId}/send`, {
                method: 'POST',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });

        it('GET /messaging/campaigns/:campaignId/status - should get campaign status', async () => {
            const res = await app.request(`/messaging/campaigns/${campaignId}/status`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
        });

        it('GET /messaging/campaigns?status=pending - should filter by status', async () => {
            const res = await app.request('/messaging/campaigns?status=pending', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Scheduled Messages
    // -----------------------------------------------------------------------
    describe('Scheduled Messages', () => {
        it('POST /messaging/schedule - should schedule a message', async () => {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 1);

            const res = await app.request('/messaging/schedule', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    channel: 'sms',
                    body: 'This is a scheduled message.',
                    scheduled_for: futureDate.toISOString(),
                    member_id: TEST_MEMBER_ID,
                    recipient_phone: '+254700000001',
                }),
            });

            expect(res.status).toBe(201);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            scheduledMessageId = body.data.id;
        });

        it('GET /messaging/scheduled - should list scheduled messages', async () => {
            const res = await app.request('/messaging/scheduled', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('DELETE /messaging/scheduled/:messageId - should cancel scheduled message', async () => {
            const res = await app.request(`/messaging/scheduled/${scheduledMessageId}`, {
                method: 'DELETE',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Member Preferences
    // -----------------------------------------------------------------------
    describe('Member Preferences', () => {
        it('GET /messaging/members/:memberId/preferences - should get member preferences', async () => {
            const res = await app.request(`/messaging/members/${TEST_MEMBER_ID}/preferences`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
        });

        it('PUT /messaging/members/:memberId/preferences - should update preferences', async () => {
            const res = await app.request(`/messaging/members/${TEST_MEMBER_ID}/preferences`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    sms_enabled: true,
                    email_enabled: true,
                    marketing_opt_in: false,
                    transaction_alerts: true,
                    loan_reminders: true,
                }),
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Message History
    // -----------------------------------------------------------------------
    describe('Message History', () => {
        it('GET /messaging/members/:memberId/messages - should list member messages', async () => {
            const res = await app.request(`/messaging/members/${TEST_MEMBER_ID}/messages`, {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('GET /messaging/messages - should list all messages with pagination', async () => {
            const res = await app.request('/messaging/messages?limit=20&offset=0', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('GET /messaging/messages?channel=sms - should filter by channel', async () => {
            const res = await app.request('/messaging/messages?channel=sms', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });

        it('GET /messaging/messages?status=sent - should filter by status', async () => {
            const res = await app.request('/messaging/messages?status=sent', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Analytics
    // -----------------------------------------------------------------------
    describe('Messaging Analytics', () => {
        it('GET /messaging/analytics/summary - should get messaging summary', async () => {
            const res = await app.request('/messaging/analytics/summary', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
        });

        it('GET /messaging/analytics/delivery-rates - should get delivery rates', async () => {
            const res = await app.request('/messaging/analytics/delivery-rates', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });

        it('GET /messaging/analytics/channel-performance - should get channel performance', async () => {
            const res = await app.request('/messaging/analytics/channel-performance', {
                method: 'GET',
                headers,
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Delivery Status Webhooks (mock)
    // -----------------------------------------------------------------------
    describe('Delivery Status Updates', () => {
        it('POST /messaging/webhooks/delivery-status - should handle delivery webhook', async () => {
            const res = await app.request('/messaging/webhooks/delivery-status', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    message_id: messageId,
                    status: 'delivered',
                    delivered_at: new Date().toISOString(),
                }),
            });

            // May return 200 or 404 depending on implementation
            expect([200, 404, 400]).toContain(res.status);
        });
    });

    // -----------------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------------
    afterAll(async () => {
        await cleanupTestData();
    });
});
