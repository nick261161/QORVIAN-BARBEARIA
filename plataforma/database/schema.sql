BEGIN;
CREATE SCHEMA IF NOT EXISTS agenda;
REVOKE ALL ON SCHEMA agenda FROM PUBLIC;
CREATE EXTENSION IF NOT EXISTS btree_gist;
SET LOCAL search_path TO agenda, extensions, public;

CREATE TABLE IF NOT EXISTS platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  feature_flags jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(feature_flags) = 'object'),
  limits jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(limits) = 'object')
);
INSERT INTO platform_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 64),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('BARBEARIA','SALAO','ESTETICA')),
  status text NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','SUSPENSO')),
  timezone text NOT NULL DEFAULT 'America/Fortaleza',
  cancellation_minutes integer NOT NULL DEFAULT 120 CHECK (cancellation_minutes BETWEEN 0 AND 10080),
  site_settings jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(site_settings) = 'object'),
  feature_flags jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(feature_flags) = 'object'),
  limits jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(limits) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  role text NOT NULL CHECK (role IN ('SUPER_ADMIN','OWNER','CLIENT')),
  name text NOT NULL,
  phone text NOT NULL CHECK (phone ~ '^\+55[0-9]{10,11}$'),
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'SUPER_ADMIN') = (tenant_id IS NULL)),
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_phone ON users(tenant_id, phone) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_platform_phone ON users(phone) WHERE tenant_id IS NULL;

CREATE TABLE IF NOT EXISTS professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  photo text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  photo text NOT NULL DEFAULT '',
  price_cents integer NOT NULL CHECK (price_cents BETWEEN 0 AND 10000000),
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS professional_services (
  tenant_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  service_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, professional_id, service_id),
  FOREIGN KEY (tenant_id, professional_id) REFERENCES professionals(tenant_id, id),
  FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS professional_services_by_service ON professional_services(tenant_id, service_id);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  photo text NOT NULL DEFAULT '',
  price_cents integer NOT NULL CHECK (price_cents BETWEEN 0 AND 10000000),
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  professional_id uuid,
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  closed boolean NOT NULL DEFAULT false,
  opens_at time,
  closes_at time,
  break_start time,
  break_end time,
  CHECK ((closed AND opens_at IS NULL AND closes_at IS NULL AND break_start IS NULL AND break_end IS NULL)
    OR (NOT closed AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at < closes_at
      AND ((break_start IS NULL AND break_end IS NULL) OR
        (break_start IS NOT NULL AND break_end IS NOT NULL AND opens_at < break_start AND break_start < break_end AND break_end < closes_at)))),
  FOREIGN KEY (tenant_id, professional_id) REFERENCES professionals(tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS working_hours_shop_day ON working_hours(tenant_id, weekday) WHERE professional_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS working_hours_professional_day ON working_hours(tenant_id, professional_id, weekday) WHERE professional_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  professional_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '',
  CHECK (starts_at < ends_at),
  FOREIGN KEY (tenant_id, professional_id) REFERENCES professionals(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS schedule_blocks_interval ON schedule_blocks(tenant_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  professional_id uuid NOT NULL,
  client_id uuid,
  client_name text NOT NULL,
  client_phone text NOT NULL,
  source text NOT NULL CHECK (source IN ('PUBLICO','MANUAL')),
  status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','CONFIRMADO','CONCLUIDO','CANCELADO','NO_SHOW')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  line_items jsonb NOT NULL CHECK (jsonb_typeof(line_items) = 'array' AND jsonb_array_length(line_items) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at AND (source = 'MANUAL' OR client_id IS NOT NULL)),
  FOREIGN KEY (tenant_id, professional_id) REFERENCES professionals(tenant_id, id),
  FOREIGN KEY (tenant_id, client_id) REFERENCES users(tenant_id, id),
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist
    (tenant_id WITH =, professional_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (status IN ('PENDENTE','CONFIRMADO'))
);
CREATE INDEX IF NOT EXISTS appointments_tenant_start ON appointments(tenant_id, starts_at);
CREATE INDEX IF NOT EXISTS appointments_client_start ON appointments(tenant_id, client_id, starts_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES users(id),
  tenant_id uuid REFERENCES tenants(id),
  event text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_actor ON audit_events(actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS schema_versions (version integer PRIMARY KEY);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=2) THEN
    ALTER TABLE users ADD COLUMN professional_id uuid;
    ALTER TABLE users DROP CONSTRAINT users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN','OWNER','STAFF','CLIENT'));
    ALTER TABLE users ADD CONSTRAINT users_staff_assignment CHECK ((role='STAFF') = (professional_id IS NOT NULL));
    ALTER TABLE users ADD CONSTRAINT users_staff_scope FOREIGN KEY (tenant_id,professional_id) REFERENCES professionals(tenant_id,id);
    ALTER TABLE appointments DROP CONSTRAINT appointments_status_check;
    ALTER TABLE appointments ADD CONSTRAINT appointments_status_check CHECK (status IN ('PENDENTE','CONFIRMADO','EM_ATENDIMENTO','CONCLUIDO','CANCELADO','NO_SHOW'));
    ALTER TABLE appointments DROP CONSTRAINT appointments_no_overlap;
    ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap EXCLUDE USING gist
      (tenant_id WITH =, professional_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
      WHERE (status IN ('PENDENTE','CONFIRMADO','EM_ATENDIMENTO'));
    ALTER TABLE appointments ADD CONSTRAINT appointments_tenant_id_unique UNIQUE (tenant_id,id);
    ALTER TABLE appointments ADD COLUMN completed_at timestamptz;
    UPDATE appointments SET completed_at=updated_at WHERE status='CONCLUIDO';
    ALTER TABLE tenants ADD COLUMN slot_minutes integer NOT NULL DEFAULT 15 CHECK (slot_minutes IN (15,30));
    ALTER TABLE professionals ADD COLUMN default_service_commission integer NOT NULL DEFAULT 0 CHECK (default_service_commission BETWEEN 0 AND 10000);
    ALTER TABLE professionals ADD COLUMN default_product_commission integer NOT NULL DEFAULT 0 CHECK (default_product_commission BETWEEN 0 AND 10000);
    ALTER TABLE services ADD COLUMN custom_commission_rate integer CHECK (custom_commission_rate BETWEEN 0 AND 10000);
    ALTER TABLE products ADD COLUMN commission_rate integer CHECK (commission_rate BETWEEN 0 AND 10000);
    ALTER TABLE products ADD COLUMN stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity>=0);
    ALTER TABLE products ADD COLUMN sku text NOT NULL DEFAULT '';
    UPDATE tenants SET feature_flags=(feature_flags - ARRAY['enable_public_booking','enable_product_catalog','enable_site_customization','enable_business_reports'])
      || jsonb_strip_nulls(jsonb_build_object('enable_online_booking',coalesce(feature_flags->'enable_online_booking',feature_flags->'enable_public_booking'),
      'enable_products_store',coalesce(feature_flags->'enable_products_store',feature_flags->'enable_product_catalog'),
      'enable_site_customizer',coalesce(feature_flags->'enable_site_customizer',feature_flags->'enable_site_customization'),
      'enable_reports',coalesce(feature_flags->'enable_reports',feature_flags->'enable_business_reports')));
    UPDATE platform_settings SET feature_flags=(feature_flags - ARRAY['enable_public_booking','enable_product_catalog','enable_site_customization','enable_business_reports'])
      || jsonb_strip_nulls(jsonb_build_object('enable_online_booking',coalesce(feature_flags->'enable_online_booking',feature_flags->'enable_public_booking'),
      'enable_products_store',coalesce(feature_flags->'enable_products_store',feature_flags->'enable_product_catalog'),
      'enable_site_customizer',coalesce(feature_flags->'enable_site_customizer',feature_flags->'enable_site_customization'),
      'enable_reports',coalesce(feature_flags->'enable_reports',feature_flags->'enable_business_reports')));
    INSERT INTO schema_versions VALUES (2);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_staff_assignment_unique ON users(tenant_id,professional_id) WHERE professional_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_sku ON products(tenant_id,lower(sku)) WHERE sku<>'' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL,
  UNIQUE(tenant_id,name)
);
INSERT INTO service_categories(tenant_id,name) SELECT DISTINCT tenant_id,category FROM services WHERE category<>'' AND deleted_at IS NULL ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), client_id uuid NOT NULL,
  professional_id uuid, modality text NOT NULL CHECK(modality IN ('RETIRADA_NO_LOCAL','ENTREGA')), delivery_address text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE','CONCLUIDO','CANCELADO')),
  total_cents bigint NOT NULL CHECK(total_cents>=0), created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  CHECK ((modality='RETIRADA_NO_LOCAL' AND delivery_address='') OR (modality='ENTREGA' AND char_length(delivery_address)>=5)),
  UNIQUE(tenant_id,id), FOREIGN KEY (tenant_id,client_id) REFERENCES users(tenant_id,id), FOREIGN KEY (tenant_id,professional_id) REFERENCES professionals(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS orders_tenant_client ON orders(tenant_id,client_id,created_at DESC);
CREATE INDEX IF NOT EXISTS orders_tenant_completed ON orders(tenant_id,completed_at);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS request_key uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS request_fingerprint text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency ON orders(tenant_id,client_id,request_key) WHERE request_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS order_items (
  tenant_id uuid NOT NULL, order_id uuid NOT NULL, product_id uuid NOT NULL,
  name_snapshot text NOT NULL, sku_snapshot text NOT NULL, unit_cents integer NOT NULL CHECK(unit_cents>=0), quantity integer NOT NULL CHECK(quantity>0),
  PRIMARY KEY (tenant_id,order_id,product_id), FOREIGN KEY (tenant_id,order_id) REFERENCES orders(tenant_id,id),
  FOREIGN KEY (tenant_id,product_id) REFERENCES products(tenant_id,id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), product_id uuid NOT NULL,
  order_id uuid, delta integer NOT NULL CHECK(delta<>0), reason text NOT NULL CHECK(reason IN ('AJUSTE','PEDIDO','CANCELAMENTO')),
  created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY (tenant_id,product_id) REFERENCES products(tenant_id,id),
  FOREIGN KEY (tenant_id,order_id) REFERENCES orders(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS stock_history ON stock_movements(tenant_id,product_id,created_at DESC);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM schema_versions WHERE version=3) THEN
    ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_reason_check;
    ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_reason_check CHECK(reason IN ('AJUSTE','PEDIDO','CANCELAMENTO','FIDELIDADE'));
    INSERT INTO schema_versions VALUES(3);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS commission_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), professional_id uuid NOT NULL,
  appointment_id uuid, order_id uuid, item_id uuid NOT NULL, item_name text NOT NULL, gross_cents bigint NOT NULL CHECK(gross_cents>=0),
  rate_snapshot integer NOT NULL CHECK(rate_snapshot BETWEEN 0 AND 10000), commission_amount bigint NOT NULL CHECK(commission_amount>=0),
  created_at timestamptz NOT NULL DEFAULT now(), CHECK ((appointment_id IS NOT NULL) <> (order_id IS NOT NULL)),
  UNIQUE NULLS NOT DISTINCT (tenant_id,appointment_id,order_id,item_id),
  FOREIGN KEY (tenant_id,professional_id) REFERENCES professionals(tenant_id,id), FOREIGN KEY (tenant_id,appointment_id) REFERENCES appointments(tenant_id,id),
  FOREIGN KEY (tenant_id,order_id) REFERENCES orders(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS commissions_period ON commission_records(tenant_id,created_at,professional_id);
CREATE INDEX IF NOT EXISTS appointments_completed ON appointments(tenant_id,completed_at) WHERE status='CONCLUIDO';

CREATE TABLE IF NOT EXISTS loyalty_config (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
  is_active boolean NOT NULL DEFAULT false, program_name text NOT NULL DEFAULT 'Clube Fidelidade',
  accumulation_type text NOT NULL DEFAULT 'STAMPS_PER_SERVICE' CHECK (accumulation_type IN ('STAMPS_PER_SERVICE','POINTS_PER_CURRENCY')),
  include_products boolean NOT NULL DEFAULT false, points_per_real integer NOT NULL DEFAULT 1 CHECK (points_per_real BETWEEN 1 AND 1000),
  min_spend_amount integer NOT NULL DEFAULT 0 CHECK (min_spend_amount>=0), target_value integer NOT NULL DEFAULT 10 CHECK(target_value>0),
  reward_type text NOT NULL DEFAULT 'DISCOUNT_FIXED' CHECK (reward_type IN ('FREE_SERVICE','DISCOUNT_PERCENT','DISCOUNT_FIXED','FREE_PRODUCT')),
  reward_value integer NOT NULL DEFAULT 1000 CHECK(reward_value>=0), reward_reference_id uuid,
  points_expiration_days integer NOT NULL DEFAULT 0 CHECK(points_expiration_days BETWEEN 0 AND 3650), rules_description text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), client_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('APPOINTMENT','ORDER','ADJUSTMENT','REDEMPTION')), delta integer NOT NULL CHECK(delta<>0),
  source_id uuid, actor_id uuid REFERENCES users(id), reason text NOT NULL DEFAULT '', reward_snapshot jsonb,
  expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,client_id,id), FOREIGN KEY (tenant_id,client_id) REFERENCES users(tenant_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_origin_once ON loyalty_transactions(tenant_id,kind,source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS loyalty_account ON loyalty_transactions(tenant_id,client_id,created_at DESC);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM schema_versions WHERE version=4) THEN
    ALTER TABLE loyalty_transactions ADD COLUMN accumulation_type text NOT NULL DEFAULT 'STAMPS_PER_SERVICE'
      CHECK(accumulation_type IN ('STAMPS_PER_SERVICE','POINTS_PER_CURRENCY'));
    UPDATE loyalty_transactions l SET accumulation_type=c.accumulation_type FROM loyalty_config c WHERE c.tenant_id=l.tenant_id;
    INSERT INTO schema_versions VALUES(4);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS loyalty_allocations (
  tenant_id uuid NOT NULL, client_id uuid NOT NULL, debit_id uuid NOT NULL, credit_id uuid NOT NULL,
  units integer NOT NULL CHECK(units>0), PRIMARY KEY (tenant_id,client_id,debit_id,credit_id),
  FOREIGN KEY (tenant_id,client_id,debit_id) REFERENCES loyalty_transactions(tenant_id,client_id,id),
  FOREIGN KEY (tenant_id,client_id,credit_id) REFERENCES loyalty_transactions(tenant_id,client_id,id)
);
CREATE INDEX IF NOT EXISTS loyalty_credit_used ON loyalty_allocations(tenant_id,client_id,credit_id);

CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  image_key text NOT NULL UNIQUE, driver text NOT NULL CHECK(driver IN ('local','s3')), created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS retired_at timestamptz;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES users(id);
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'catalog' CHECK(profile IN ('catalog','avatar','banner'));
CREATE TABLE IF NOT EXISTS media_cleanup (
  asset_id uuid PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE, due_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0, locked_until timestamptz, last_error text
);
CREATE INDEX IF NOT EXISTS media_cleanup_due ON media_cleanup(due_at);
CREATE INDEX IF NOT EXISTS media_asset_age ON media_assets(created_at) WHERE retired_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), appointment_id uuid NOT NULL,
  recipient text NOT NULL CHECK (recipient IN ('CLIENT','STAFF')),
  event text NOT NULL CHECK (event IN ('CREATED','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW','REMINDER')),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENDING','SENT','FAILED','SKIPPED')),
  due_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz, attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,appointment_id,event,recipient), FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS notifications_ready ON notification_logs(due_at) WHERE status IN ('QUEUED','SENDING');

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key text PRIMARY KEY, count integer NOT NULL CHECK(count>0), reset_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_expiry ON auth_rate_limits(reset_at);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=5) THEN
    UPDATE tenants SET slot_minutes=30 WHERE slot_minutes<>30;
    ALTER TABLE tenants ALTER COLUMN slot_minutes SET DEFAULT 30;
    ALTER TABLE tenants DROP CONSTRAINT tenants_slot_minutes_check;
    ALTER TABLE tenants ADD CONSTRAINT tenants_slot_minutes_check CHECK(slot_minutes=30);
    INSERT INTO schema_versions VALUES(5);
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS business_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
  confirmation_message_template text NOT NULL CHECK(length(confirmation_message_template) BETWEEN 1 AND 2000)
);
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS google_refresh_token text;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS google_email text;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS google_subject text;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS google_connection_id uuid;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_event_id text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_event_subject text;
CREATE TABLE IF NOT EXISTS google_oauth_states (
  state_hash text PRIMARY KEY, tenant_id uuid NOT NULL, professional_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, verifier text NOT NULL, expires_at timestamptz NOT NULL,
  FOREIGN KEY(tenant_id,professional_id) REFERENCES professionals(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS google_oauth_expiry ON google_oauth_states(expires_at);
CREATE TABLE IF NOT EXISTS google_calendar_jobs (
  appointment_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, revision bigint NOT NULL DEFAULT 1,
  due_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz, attempts integer NOT NULL DEFAULT 0,
  FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id)
);
ALTER TABLE google_calendar_jobs ADD COLUMN IF NOT EXISTS claim_id uuid;
CREATE INDEX IF NOT EXISTS google_calendar_jobs_due ON google_calendar_jobs(due_at);
UPDATE tenants SET feature_flags=feature_flags-'enable_whatsapp_bot' WHERE feature_flags ? 'enable_whatsapp_bot';
UPDATE platform_settings SET feature_flags=feature_flags-'enable_whatsapp_bot' WHERE feature_flags ? 'enable_whatsapp_bot';
INSERT INTO schema_versions VALUES(6) ON CONFLICT DO NOTHING;
COMMIT;
