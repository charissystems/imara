-- ============================================================================
-- MESSAGING CENTRE
-- Omnichannel communications: SMS, email, push notifications, bulk messaging
-- ============================================================================

-- MESSAGE TEMPLATES
CREATE TABLE IF NOT EXISTS template.message_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    code varchar(50) NOT NULL UNIQUE,
    name varchar(100) NOT NULL,
    description text,
    
    -- Channel
    channel varchar(50) CHECK (channel IN ('sms', 'email', 'push', 'in_app')) NOT NULL,
    
    -- Content
    subject varchar(255), -- For email
    body text NOT NULL,
    
    -- Merge Fields (JSON array: ["member_name", "amount", "balance", etc.])
    merge_fields jsonb DEFAULT '[]'::jsonb,
    
    -- Configuration
    is_active boolean DEFAULT true,
    is_system_template boolean DEFAULT false,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS message_templates_code_unique ON template.message_templates(code) WHERE deleted_at IS NULL;

-- MESSAGES QUEUE
CREATE TABLE IF NOT EXISTS template.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Recipient
    member_id uuid REFERENCES template.members(id) ON DELETE SET NULL,
    staff_id uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    recipient_phone varchar(50),
    recipient_email varchar(200),
    
    -- Message Details
    template_id uuid REFERENCES template.message_templates(id) ON DELETE SET NULL,
    channel varchar(50) CHECK (channel IN ('sms', 'email', 'push', 'in_app')) NOT NULL,
    
    -- Content
    subject varchar(255),
    body text NOT NULL,
    
    -- Configuration
    scheduled_for timestamptz,
    
    -- Delivery Status
    status varchar(20) CHECK (status IN ('draft', 'queued', 'sent', 'delivered', 'failed', 'bounced')) DEFAULT 'draft' NOT NULL,
    
    sent_at timestamptz,
    failed_reason text,
    retry_count integer DEFAULT 0,
    
    -- Reference
    source_type varchar(50), -- transaction, loan_app, etc.
    source_id uuid,
    
    -- Context Data
    variables jsonb, -- For merge fields
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS messages_member_idx ON template.messages(member_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS messages_status_idx ON template.messages(status);
CREATE INDEX IF NOT EXISTS messages_channel_idx ON template.messages(channel);
CREATE INDEX IF NOT EXISTS messages_scheduled_idx ON template.messages(scheduled_for) WHERE status = 'queued';

-- MESSAGE DELIVERY LOG
CREATE TABLE IF NOT EXISTS template.message_delivery_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    message_id uuid NOT NULL REFERENCES template.messages(id) ON DELETE CASCADE,
    
    -- Delivery Attempt
    attempt_number integer NOT NULL DEFAULT 1,
    delivery_timestamp timestamptz NOT NULL DEFAULT now(),
    
    -- Provider Response
    provider varchar(50), -- 'twilio', 'africas_talking', 'sendgrid', etc.
    provider_reference varchar(100),
    provider_status varchar(50),
    provider_response jsonb,
    
    -- Status
    status varchar(20) CHECK (status IN ('sent', 'delivered', 'failed', 'bounced')) NOT NULL,
    
    -- Error Details
    error_code varchar(50),
    error_message text,
    
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS delivery_log_message_idx ON template.message_delivery_log(message_id);
CREATE INDEX IF NOT EXISTS delivery_log_status_idx ON template.message_delivery_log(status);

-- BULK MESSAGE CAMPAIGNS
CREATE TABLE IF NOT EXISTS template.bulk_campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    campaign_number varchar(30) NOT NULL UNIQUE,
    
    -- Campaign Details
    name varchar(100) NOT NULL,
    description text,
    
    -- Channel
    channel varchar(50) CHECK (channel IN ('sms', 'email', 'push', 'multi_channel')) NOT NULL,
    
    -- Content
    template_id uuid REFERENCES template.message_templates(id) ON DELETE SET NULL,
    subject varchar(255),
    body text NOT NULL,
    
    -- Recipient Filtering
    recipient_filter jsonb, -- {status: 'active', loan_status: 'in_default', target_group: 'group_id', etc.}
    recipient_count integer,
    
    -- Scheduling
    scheduled_send_date timestamptz,
    immediate_send boolean DEFAULT false,
    
    -- Status
    status varchar(20) CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled')) DEFAULT 'draft' NOT NULL,
    
    -- Results
    messages_sent integer DEFAULT 0,
    messages_delivered integer DEFAULT 0,
    messages_failed integer DEFAULT 0,
    
    -- Audit
    created_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_by uuid REFERENCES template.staff(id) ON DELETE SET NULL,
    approved_at timestamptz,
    
    started_at timestamptz,
    completed_at timestamptz,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS campaigns_number_unique ON template.bulk_campaigns(campaign_number);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON template.bulk_campaigns(status);

-- CAMPAIGN MESSAGES
CREATE TABLE IF NOT EXISTS template.campaign_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    campaign_id uuid NOT NULL REFERENCES template.bulk_campaigns(id) ON DELETE CASCADE,
    message_id uuid NOT NULL REFERENCES template.messages(id) ON DELETE CASCADE,
    
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS campaign_messages_campaign_idx ON template.campaign_messages(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_messages_message_idx ON template.campaign_messages(message_id);

-- MEMBER COMMUNICATION PREFERENCES
CREATE TABLE IF NOT EXISTS template.communication_preferences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    member_id uuid NOT NULL UNIQUE REFERENCES template.members(id) ON DELETE CASCADE,
    
    -- Channel Preferences
    sms_enabled boolean DEFAULT true,
    email_enabled boolean DEFAULT true,
    push_enabled boolean DEFAULT true,
    in_app_enabled boolean DEFAULT true,
    
    -- Communication Categories (opt-out options)
    transaction_alerts boolean DEFAULT true,
    promotional_messages boolean DEFAULT false,
    loan_related boolean DEFAULT true,
    account_statements boolean DEFAULT true,
    system_notifications boolean DEFAULT true,
    
    -- Quiet Hours
    quiet_hours_start time,
    quiet_hours_end time,
    quiet_hours_enabled boolean DEFAULT false,
    
    -- Audit
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS comm_prefs_member_idx ON template.communication_preferences(member_id);

-- LOAN REPAYMENT REMINDERS
CREATE TABLE IF NOT EXISTS template.loan_repayment_reminders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    loan_account_id uuid NOT NULL REFERENCES template.loan_accounts(id) ON DELETE CASCADE,
    schedule_id uuid REFERENCES template.loan_schedules(id) ON DELETE CASCADE,
    
    -- Reminder Configuration
    days_before integer CHECK (days_before > 0), -- Reminder X days before due
    days_after integer DEFAULT 0,                 -- or X days after due (for overdue reminders)
    
    reminder_date date NOT NULL,
    
    -- Message
    template_id uuid REFERENCES template.message_templates(id) ON DELETE SET NULL,
    custom_message text,
    
    -- Delivery Status
    sent_to_member boolean DEFAULT false,
    sent_to_staff boolean DEFAULT false,
    last_sent_at timestamptz,
    send_count integer DEFAULT 0,
    
    -- Configuration
    is_active boolean DEFAULT true,
    
    -- Audit
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS loan_reminders_loan_idx ON template.loan_repayment_reminders(loan_account_id);
CREATE INDEX IF NOT EXISTS loan_reminders_date_idx ON template.loan_repayment_reminders(reminder_date);

-- MATURITY ALERTS (For Fixed Deposits & Loans)
CREATE TABLE IF NOT EXISTS template.maturity_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Association
    alert_type varchar(50) CHECK (alert_type IN ('fixed_deposit', 'loan')) NOT NULL,
    fixed_deposit_id uuid REFERENCES template.fixed_deposits(id) ON DELETE CASCADE,
    loan_account_id uuid REFERENCES template.loan_accounts(id) ON DELETE CASCADE,
    
    member_id uuid NOT NULL REFERENCES template.members(id) ON DELETE CASCADE,
    
    -- Alert Configuration
    days_before integer NOT NULL CHECK (days_before > 0),
    alert_date date NOT NULL,
    maturity_date date NOT NULL,
    
    -- Delivery Status
    sent_to_member boolean DEFAULT false,
    sent_to_staff boolean DEFAULT false,
    sent_at timestamptz,
    
    -- Message
    template_id uuid REFERENCES template.message_templates(id) ON DELETE SET NULL,
    
    is_active boolean DEFAULT true,
    
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS maturity_alerts_member_idx ON template.maturity_alerts(member_id);
CREATE INDEX IF NOT EXISTS maturity_alerts_sent_idx ON template.maturity_alerts(sent_to_member);
