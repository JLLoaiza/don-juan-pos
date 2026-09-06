-- ============================================================
-- RESTAURANT POS / ERP
-- PostgreSQL DDL
-- ============================================================

BEGIN;

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE inventory_unit AS ENUM (
    'G',
    'KG',
    'ML',
    'L',
    'UNIT'
);

CREATE TYPE product_component_type AS ENUM (
    'INVENTORY_ITEM',
    'ACCOMPANIMENT'
);

CREATE TYPE table_status AS ENUM (
    'AVAILABLE',
    'OCCUPIED',
    'RESERVED'
);

CREATE TYPE account_status AS ENUM (
    'OPEN',
    'PAID',
    'VOID'
);

CREATE TYPE split_type AS ENUM (
    'BY_ITEM',
    'BY_PERCENTAGE'
);

CREATE TYPE payment_method_type AS ENUM (
    'CASH',
    'QR',
    'CARD'
);

CREATE TYPE inventory_movement_type AS ENUM (
    'PURCHASE',
    'SALE',
    'MANUAL_ADJUSTMENT',
    'CORRECTION',
    'RETURN'
);

CREATE TYPE purchase_status AS ENUM (
    'CONFIRMED',
    'VOID'
);

CREATE TYPE discount_type AS ENUM (
    'PERCENTAGE',
    'FIXED'
);

CREATE TYPE discount_scope AS ENUM (
    'ACCOUNT',
    'ITEM'
);

CREATE TYPE cash_session_status AS ENUM (
    'OPEN',
    'CLOSED'
);

CREATE TYPE cash_movement_type AS ENUM (
    'SALE',
    'EXPENSE',
    'WITHDRAWAL',
    'DEPOSIT',
    'ADJUSTMENT'
);

CREATE TYPE employee_shift_status AS ENUM (
    'OPEN',
    'COMPLETED',
    'CANCELLED'
);

CREATE TYPE print_job_status AS ENUM (
    'PENDING',
    'PRINTED',
    'FAILED',
    'CANCELLED'
);

CREATE TYPE printer_type AS ENUM (
    'KITCHEN',
    'CASH',
    'ACCOUNT',
    'PAYMENT'
);

CREATE TYPE print_document_type AS ENUM (
    'KITCHEN_ORDER',
    'ACCOUNT_RECEIPT',
    'PAYMENT_RECEIPT',
    'DAY_CLOSE'
);

CREATE TYPE sync_operation_type AS ENUM (
    'CREATE',
    'UPDATE',
    'VOID',
    'ADJUST'
);

CREATE TYPE sync_operation_status AS ENUM (
    'PENDING',
    'PROCESSING',
    'PROCESSED',
    'FAILED'
);


-- ============================================================
-- GENERIC UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


-- ============================================================
-- COMPANY / BRANCH
-- ============================================================

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name            VARCHAR(150) NOT NULL,
    legal_name      VARCHAR(200),
    tax_id          VARCHAR(50),

    phone           VARCHAR(50),
    email           VARCHAR(150),
    address         VARCHAR(250),

    currency        CHAR(3) NOT NULL DEFAULT 'COP',
    timezone        VARCHAR(100) NOT NULL DEFAULT 'America/Bogota',

    logo_url        TEXT,

    active          BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id      UUID NOT NULL
        REFERENCES companies(id),

    name            VARCHAR(150) NOT NULL,
    code            VARCHAR(50) NOT NULL,

    address         VARCHAR(250),
    phone           VARCHAR(50),

    active          BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (company_id, code)
);

CREATE TRIGGER trg_companies_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_branches_updated_at
BEFORE UPDATE ON branches
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- USERS / ROLES / PERMISSIONS
-- ============================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id),

    username        VARCHAR(100) NOT NULL,
    email           VARCHAR(150),
    password_hash   TEXT NOT NULL,
    display_name    VARCHAR(150) NOT NULL,

    active          BOOLEAN NOT NULL DEFAULT TRUE,

    last_login_at   TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (company_id, username)
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id),

    name            VARCHAR(100) NOT NULL,
    description     TEXT,

    active          BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (company_id, name)
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    key             VARCHAR(150) NOT NULL UNIQUE,
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    module          VARCHAR(100),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
    role_id         UUID NOT NULL
        REFERENCES roles(id)
        ON DELETE CASCADE,

    permission_id   UUID NOT NULL
        REFERENCES permissions(id)
        ON DELETE CASCADE,

    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id         UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    role_id         UUID NOT NULL
        REFERENCES roles(id)
        ON DELETE CASCADE,

    branch_id       UUID
        REFERENCES branches(id),

    PRIMARY KEY (user_id, role_id, branch_id)
);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_roles_updated_at
BEFORE UPDATE ON roles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- BRANCH SETTINGS
-- ============================================================

CREATE TABLE branch_settings (
    branch_id       UUID PRIMARY KEY
        REFERENCES branches(id)
        ON DELETE CASCADE,

    settings        JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_branch_settings_updated_at
BEFORE UPDATE ON branch_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- INVENTORY
-- ============================================================

CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    name            VARCHAR(150) NOT NULL,

    unit            inventory_unit NOT NULL,

    -- Cost per configured base unit.
    -- Example:
    -- onion / G / 2.10
    -- soda / UNIT / 3000.00
    unit_cost       NUMERIC(14, 6) NOT NULL DEFAULT 0,

    current_stock   NUMERIC(18, 6) NOT NULL DEFAULT 0,
    minimum_stock   NUMERIC(18, 6) NOT NULL DEFAULT 0,

    notes           TEXT,

    active          BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (unit_cost >= 0),
    CHECK (minimum_stock >= 0)
);

CREATE INDEX idx_inventory_items_branch
    ON inventory_items(branch_id);

CREATE INDEX idx_inventory_items_low_stock
    ON inventory_items(branch_id, current_stock, minimum_stock)
    WHERE active = TRUE;

CREATE TRIGGER trg_inventory_items_updated_at
BEFORE UPDATE ON inventory_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- ACCOMPANIMENTS
-- ============================================================

CREATE TABLE accompaniments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    name            VARCHAR(150) NOT NULL,

    -- Default price when used as an additional.
    default_price   NUMERIC(14, 2) NOT NULL DEFAULT 0,

    notes           TEXT,

    active          BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (default_price >= 0)
);

CREATE INDEX idx_accompaniments_branch
    ON accompaniments(branch_id);

CREATE TRIGGER trg_accompaniments_updated_at
BEFORE UPDATE ON accompaniments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


CREATE TABLE accompaniment_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    accompaniment_id        UUID NOT NULL
        REFERENCES accompaniments(id)
        ON DELETE CASCADE,

    inventory_item_id       UUID NOT NULL
        REFERENCES inventory_items(id),

    quantity                NUMERIC(18, 6) NOT NULL,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (quantity > 0),

    UNIQUE (accompaniment_id, inventory_item_id)
);


-- ============================================================
-- TAX RATES
-- ============================================================

CREATE TABLE tax_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    name            VARCHAR(100) NOT NULL,
    rate            NUMERIC(7, 4) NOT NULL DEFAULT 0,

    active          BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (rate >= 0 AND rate <= 100)
);

CREATE INDEX idx_tax_rates_branch
    ON tax_rates(branch_id);

CREATE TRIGGER trg_tax_rates_updated_at
BEFORE UPDATE ON tax_rates
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- PRODUCTS
-- ============================================================

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    name            VARCHAR(150) NOT NULL,
    description     TEXT,

    sale_price      NUMERIC(14, 2) NOT NULL DEFAULT 0,

    -- Cached calculated cost.
    -- Source of truth is product_components + inventory_items.
    calculated_cost NUMERIC(14, 6) NOT NULL DEFAULT 0,

    tax_rate_id     UUID
        REFERENCES tax_rates(id),

    image_url       TEXT,
    notes           TEXT,

    active          BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (sale_price >= 0),
    CHECK (calculated_cost >= 0)
);

CREATE INDEX idx_products_branch
    ON products(branch_id);

CREATE INDEX idx_products_active
    ON products(branch_id, active);

CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- PRODUCT COMPONENTS
-- ============================================================

CREATE TABLE product_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    product_id              UUID NOT NULL
        REFERENCES products(id)
        ON DELETE CASCADE,

    component_type          product_component_type NOT NULL,

    inventory_item_id       UUID
        REFERENCES inventory_items(id),

    accompaniment_id        UUID
        REFERENCES accompaniments(id),

    quantity                NUMERIC(18, 6) NOT NULL,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (
        (
            component_type = 'INVENTORY_ITEM'
            AND inventory_item_id IS NOT NULL
            AND accompaniment_id IS NULL
        )
        OR
        (
            component_type = 'ACCOMPANIMENT'
            AND inventory_item_id IS NULL
            AND accompaniment_id IS NOT NULL
        )
    ),

    CHECK (quantity > 0)
);

CREATE INDEX idx_product_components_product
    ON product_components(product_id);

CREATE INDEX idx_product_components_inventory
    ON product_components(inventory_item_id);

CREATE INDEX idx_product_components_accompaniment
    ON product_components(accompaniment_id);


-- ============================================================
-- PRODUCT ADDITIONAL ACCOMPANIMENTS
-- ============================================================

CREATE TABLE product_additional_accompaniments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    product_id              UUID NOT NULL
        REFERENCES products(id)
        ON DELETE CASCADE,

    accompaniment_id        UUID NOT NULL
        REFERENCES accompaniments(id),

    price_override          NUMERIC(14, 2),

    -- Whether UI can explicitly select "no charge".
    allow_free              BOOLEAN NOT NULL DEFAULT TRUE,

    sort_order              INTEGER NOT NULL DEFAULT 0,

    active                  BOOLEAN NOT NULL DEFAULT TRUE,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (
        price_override IS NULL
        OR price_override >= 0
    ),

    UNIQUE (product_id, accompaniment_id)
);

CREATE INDEX idx_product_additional_accompaniments_product
    ON product_additional_accompaniments(product_id);

CREATE TRIGGER trg_product_additional_accompaniments_updated_at
BEFORE UPDATE ON product_additional_accompaniments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- CUSTOMERS
-- ============================================================

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    name            VARCHAR(150) NOT NULL,
    phone           VARCHAR(50),
    email           VARCHAR(150),

    notes           TEXT,

    active          BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_branch
    ON customers(branch_id);

CREATE INDEX idx_customers_phone
    ON customers(branch_id, phone);

CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- DINING AREAS / TABLES
-- ============================================================

CREATE TABLE dining_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    name            VARCHAR(100) NOT NULL,

    active          BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (branch_id, name)
);

CREATE TRIGGER trg_dining_areas_updated_at
BEFORE UPDATE ON dining_areas
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


CREATE TABLE restaurant_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    dining_area_id  UUID NOT NULL
        REFERENCES dining_areas(id),

    name            VARCHAR(100) NOT NULL,
    capacity        INTEGER NOT NULL,

    status          table_status NOT NULL DEFAULT 'AVAILABLE',

    active          BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (capacity > 0),

    UNIQUE (dining_area_id, name)
);

CREATE INDEX idx_restaurant_tables_status
    ON restaurant_tables(dining_area_id, status);

CREATE TRIGGER trg_restaurant_tables_updated_at
BEFORE UPDATE ON restaurant_tables
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- DISCOUNTS / PROMOTIONS
-- ============================================================

CREATE TABLE discount_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    name            VARCHAR(150) NOT NULL,

    discount_type   discount_type NOT NULL,

    value           NUMERIC(14, 4) NOT NULL,

    scope           discount_scope NOT NULL DEFAULT 'ACCOUNT',

    start_at        TIMESTAMPTZ,
    end_at          TIMESTAMPTZ,

    active          BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (
        (
            discount_type = 'PERCENTAGE'
            AND value >= 0
            AND value <= 100
        )
        OR
        (
            discount_type = 'FIXED'
            AND value >= 0
        )
    ),

    CHECK (
        end_at IS NULL
        OR start_at IS NULL
        OR end_at > start_at
    )
);

CREATE INDEX idx_discount_rules_branch
    ON discount_rules(branch_id);

CREATE TRIGGER trg_discount_rules_updated_at
BEFORE UPDATE ON discount_rules
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- PAYMENT METHODS
-- ============================================================

CREATE TABLE payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    name            VARCHAR(100) NOT NULL,
    type            payment_method_type NOT NULL,

    active          BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_methods_branch
    ON payment_methods(branch_id);

CREATE TRIGGER trg_payment_methods_updated_at
BEFORE UPDATE ON payment_methods
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- ACCOUNTS
-- ============================================================

CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    table_id         UUID
        REFERENCES restaurant_tables(id),

    customer_id      UUID
        REFERENCES customers(id),

    opened_by_user_id UUID NOT NULL
        REFERENCES users(id),

    status           account_status NOT NULL DEFAULT 'OPEN',

    opened_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at        TIMESTAMPTZ,

    subtotal         NUMERIC(14, 2) NOT NULL DEFAULT 0,
    discount_total   NUMERIC(14, 2) NOT NULL DEFAULT 0,

    service_percentage NUMERIC(7, 4) NOT NULL DEFAULT 0,
    service_total    NUMERIC(14, 2) NOT NULL DEFAULT 0,

    tax_total        NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total            NUMERIC(14, 2) NOT NULL DEFAULT 0,

    notes            TEXT,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (
        service_percentage >= 0
        AND service_percentage <= 100
    ),

    CHECK (subtotal >= 0),
    CHECK (discount_total >= 0),
    CHECK (service_total >= 0),
    CHECK (tax_total >= 0),
    CHECK (total >= 0)
);

CREATE INDEX idx_accounts_branch_opened_at
    ON accounts(branch_id, opened_at);

CREATE INDEX idx_accounts_table_status
    ON accounts(table_id, status);

CREATE INDEX idx_accounts_customer
    ON accounts(customer_id);

CREATE TRIGGER trg_accounts_updated_at
BEFORE UPDATE ON accounts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- ACCOUNT ITEMS
-- ============================================================

CREATE TABLE account_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    account_id       UUID NOT NULL
        REFERENCES accounts(id)
        ON DELETE CASCADE,

    product_id       UUID NOT NULL
        REFERENCES products(id),

    added_by_user_id UUID
        REFERENCES users(id),

    -- Historical snapshots
    product_name_snapshot VARCHAR(150) NOT NULL,
    unit_price       NUMERIC(14, 2) NOT NULL,
    unit_cost        NUMERIC(14, 6) NOT NULL,

    quantity         NUMERIC(18, 6) NOT NULL,

    discount_total   NUMERIC(14, 2) NOT NULL DEFAULT 0,

    tax_rate_snapshot NUMERIC(7, 4) NOT NULL DEFAULT 0,
    tax_total         NUMERIC(14, 2) NOT NULL DEFAULT 0,

    line_subtotal    NUMERIC(14, 2) NOT NULL DEFAULT 0,
    line_total       NUMERIC(14, 2) NOT NULL DEFAULT 0,

    notes            TEXT,

    -- Exact consumption generated at sale time.
    consumption_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (quantity > 0),
    CHECK (unit_price >= 0),
    CHECK (unit_cost >= 0),
    CHECK (discount_total >= 0),
    CHECK (tax_rate_snapshot >= 0 AND tax_rate_snapshot <= 100),
    CHECK (tax_total >= 0),
    CHECK (line_subtotal >= 0),
    CHECK (line_total >= 0)
);

CREATE INDEX idx_account_items_account
    ON account_items(account_id);

CREATE INDEX idx_account_items_product
    ON account_items(product_id);

CREATE TRIGGER trg_account_items_updated_at
BEFORE UPDATE ON account_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- ACCOUNT ITEM ACCOMPANIMENTS / ADDITIONALS
-- ============================================================

CREATE TABLE account_item_accompaniments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    account_item_id       UUID NOT NULL
        REFERENCES account_items(id)
        ON DELETE CASCADE,

    accompaniment_id     UUID NOT NULL
        REFERENCES accompaniments(id),

    name_snapshot        VARCHAR(150) NOT NULL,

    quantity             NUMERIC(18, 6) NOT NULL DEFAULT 1,

    unit_price            NUMERIC(14, 2) NOT NULL DEFAULT 0,

    -- true when included as part of the original product.
    included              BOOLEAN NOT NULL DEFAULT FALSE,

    -- Explicitly marked as free.
    no_charge             BOOLEAN NOT NULL DEFAULT FALSE,

    total                 NUMERIC(14, 2) NOT NULL DEFAULT 0,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (quantity > 0),
    CHECK (unit_price >= 0),
    CHECK (total >= 0)
);

CREATE INDEX idx_account_item_accompaniments_item
    ON account_item_accompaniments(account_item_id);

CREATE TRIGGER trg_account_item_accompaniments_updated_at
BEFORE UPDATE ON account_item_accompaniments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- ACCOUNT DISCOUNTS
-- ============================================================

CREATE TABLE account_discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    account_id        UUID NOT NULL
        REFERENCES accounts(id)
        ON DELETE CASCADE,

    discount_rule_id  UUID
        REFERENCES discount_rules(id),

    name_snapshot     VARCHAR(150) NOT NULL,

    discount_type     discount_type NOT NULL,
    value             NUMERIC(14, 4) NOT NULL,

    applied_amount    NUMERIC(14, 2) NOT NULL,

    created_by_user_id UUID
        REFERENCES users(id),

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (value >= 0),
    CHECK (applied_amount >= 0)
);


CREATE TABLE account_item_discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    account_item_id   UUID NOT NULL
        REFERENCES account_items(id)
        ON DELETE CASCADE,

    discount_rule_id  UUID
        REFERENCES discount_rules(id),

    name_snapshot     VARCHAR(150) NOT NULL,

    discount_type     discount_type NOT NULL,
    value             NUMERIC(14, 4) NOT NULL,

    applied_amount    NUMERIC(14, 2) NOT NULL,

    created_by_user_id UUID
        REFERENCES users(id),

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (value >= 0),
    CHECK (applied_amount >= 0)
);


-- ============================================================
-- ACCOUNT SPLITS
-- ============================================================

CREATE TABLE account_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    account_id        UUID NOT NULL
        REFERENCES accounts(id)
        ON DELETE CASCADE,

    split_number      INTEGER NOT NULL,

    split_type        split_type NOT NULL,

    percentage        NUMERIC(7, 4),

    subtotal          NUMERIC(14, 2) NOT NULL DEFAULT 0,
    discount_total    NUMERIC(14, 2) NOT NULL DEFAULT 0,

    service_percentage NUMERIC(7, 4) NOT NULL DEFAULT 0,
    service_total     NUMERIC(14, 2) NOT NULL DEFAULT 0,

    tax_total         NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total             NUMERIC(14, 2) NOT NULL DEFAULT 0,

    status            account_status NOT NULL DEFAULT 'OPEN',

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (
        percentage IS NULL
        OR (
            percentage >= 0
            AND percentage <= 100
        )
    ),

    CHECK (
        split_type = 'BY_ITEM'
        OR percentage IS NOT NULL
    ),

    CHECK (subtotal >= 0),
    CHECK (discount_total >= 0),
    CHECK (service_total >= 0),
    CHECK (tax_total >= 0),
    CHECK (total >= 0),

    UNIQUE (account_id, split_number)
);

CREATE INDEX idx_account_splits_account
    ON account_splits(account_id);

CREATE TRIGGER trg_account_splits_updated_at
BEFORE UPDATE ON account_splits
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- SPLIT ITEMS
-- ============================================================

CREATE TABLE account_split_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    account_split_id   UUID NOT NULL
        REFERENCES account_splits(id)
        ON DELETE CASCADE,

    account_item_id    UUID NOT NULL
        REFERENCES account_items(id),

    quantity           NUMERIC(18, 6) NOT NULL,

    subtotal           NUMERIC(14, 2) NOT NULL DEFAULT 0,

    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (quantity > 0),
    CHECK (subtotal >= 0),

    UNIQUE (account_split_id, account_item_id)
);


-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    account_id          UUID NOT NULL
        REFERENCES accounts(id),

    account_split_id    UUID
        REFERENCES account_splits(id),

    payment_method_id   UUID NOT NULL
        REFERENCES payment_methods(id),

    amount              NUMERIC(14, 2) NOT NULL,

    reference           VARCHAR(150),

    received_by_user_id UUID NOT NULL
        REFERENCES users(id),

    received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    notes               TEXT,

    CHECK (amount > 0)
);

CREATE INDEX idx_payments_account
    ON payments(account_id);

CREATE INDEX idx_payments_split
    ON payments(account_split_id);

CREATE INDEX idx_payments_received_at
    ON payments(received_at);

CREATE INDEX idx_payments_method
    ON payments(payment_method_id);


-- ============================================================
-- CASH REGISTERS
-- ============================================================

CREATE TABLE cash_registers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    name            VARCHAR(100) NOT NULL,

    active          BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (branch_id, name)
);

CREATE TRIGGER trg_cash_registers_updated_at
BEFORE UPDATE ON cash_registers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


CREATE TABLE cash_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cash_register_id UUID NOT NULL
        REFERENCES cash_registers(id),

    opened_by_user_id UUID NOT NULL
        REFERENCES users(id),

    opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    opening_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,

    closed_by_user_id UUID
        REFERENCES users(id),

    closed_at      TIMESTAMPTZ,

    expected_cash  NUMERIC(14, 2),
    counted_cash   NUMERIC(14, 2),
    difference     NUMERIC(14, 2),

    status         cash_session_status NOT NULL DEFAULT 'OPEN',

    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (opening_amount >= 0)
);

CREATE INDEX idx_cash_sessions_register
    ON cash_sessions(cash_register_id, status);

CREATE INDEX idx_cash_sessions_opened_at
    ON cash_sessions(opened_at);


CREATE TABLE cash_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cash_session_id UUID NOT NULL
        REFERENCES cash_sessions(id),

    movement_type  cash_movement_type NOT NULL,

    amount         NUMERIC(14, 2) NOT NULL,

    payment_id     UUID
        REFERENCES payments(id),

    expense_id     UUID,

    description    TEXT,

    created_by_user_id UUID NOT NULL
        REFERENCES users(id),

    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (amount > 0)
);

CREATE INDEX idx_cash_movements_session
    ON cash_movements(cash_session_id);

CREATE INDEX idx_cash_movements_created_at
    ON cash_movements(created_at);


-- ============================================================
-- SUPPLIERS
-- ============================================================

CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    name            VARCHAR(150) NOT NULL,

    tax_id          VARCHAR(50),
    phone           VARCHAR(50),
    email           VARCHAR(150),
    address         VARCHAR(250),

    notes           TEXT,

    active          BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suppliers_branch
    ON suppliers(branch_id);

CREATE TRIGGER trg_suppliers_updated_at
BEFORE UPDATE ON suppliers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- PURCHASES
-- ============================================================

CREATE TABLE purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    supplier_id     UUID
        REFERENCES suppliers(id),

    document_number VARCHAR(100),

    purchase_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    subtotal        NUMERIC(14, 2) NOT NULL DEFAULT 0,
    tax_total       NUMERIC(14, 2) NOT NULL DEFAULT 0,
    discount_total  NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total           NUMERIC(14, 2) NOT NULL DEFAULT 0,

    payment_method_id UUID
        REFERENCES payment_methods(id),

    status          purchase_status NOT NULL DEFAULT 'CONFIRMED',

    notes           TEXT,

    created_by_user_id UUID NOT NULL
        REFERENCES users(id),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (subtotal >= 0),
    CHECK (tax_total >= 0),
    CHECK (discount_total >= 0),
    CHECK (total >= 0)
);

CREATE INDEX idx_purchases_branch_date
    ON purchases(branch_id, purchase_date);

CREATE INDEX idx_purchases_supplier
    ON purchases(supplier_id);

CREATE TRIGGER trg_purchases_updated_at
BEFORE UPDATE ON purchases
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


CREATE TABLE purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    purchase_id        UUID NOT NULL
        REFERENCES purchases(id)
        ON DELETE CASCADE,

    inventory_item_id  UUID NOT NULL
        REFERENCES inventory_items(id),

    quantity           NUMERIC(18, 6) NOT NULL,

    unit_cost          NUMERIC(14, 6) NOT NULL,

    subtotal           NUMERIC(14, 2) NOT NULL DEFAULT 0,

    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (quantity > 0),
    CHECK (unit_cost >= 0),
    CHECK (subtotal >= 0)
);

CREATE INDEX idx_purchase_items_purchase
    ON purchase_items(purchase_id);

CREATE INDEX idx_purchase_items_inventory
    ON purchase_items(inventory_item_id);


-- ============================================================
-- EXPENSES
-- ============================================================

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    supplier_id     UUID
        REFERENCES suppliers(id),

    concept         VARCHAR(200) NOT NULL,

    amount          NUMERIC(14, 2) NOT NULL,

    expense_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    payment_method_id UUID
        REFERENCES payment_methods(id),

    cash_session_id UUID
        REFERENCES cash_sessions(id),

    notes           TEXT,

    created_by_user_id UUID NOT NULL
        REFERENCES users(id),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (amount > 0)
);

CREATE INDEX idx_expenses_branch_date
    ON expenses(branch_id, expense_date);

CREATE TRIGGER trg_expenses_updated_at
BEFORE UPDATE ON expenses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- Add FK from cash_movements to expenses after expenses exists.
ALTER TABLE cash_movements
ADD CONSTRAINT fk_cash_movements_expense
FOREIGN KEY (expense_id)
REFERENCES expenses(id);


-- ============================================================
-- INVENTORY MOVEMENTS / KARDEX
-- ============================================================

CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id          UUID NOT NULL
        REFERENCES branches(id),

    inventory_item_id  UUID NOT NULL
        REFERENCES inventory_items(id),

    movement_type      inventory_movement_type NOT NULL,

    quantity           NUMERIC(18, 6) NOT NULL,

    unit_cost          NUMERIC(14, 6) NOT NULL,

    stock_before       NUMERIC(18, 6) NOT NULL,
    stock_after        NUMERIC(18, 6) NOT NULL,

    -- Optional direct relationship with originating record.
    source_type        VARCHAR(50),
    source_id          UUID,

    account_item_id    UUID
        REFERENCES account_items(id),

    purchase_item_id   UUID
        REFERENCES purchase_items(id),

    reason             TEXT,

    metadata           JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_by_user_id UUID NOT NULL
        REFERENCES users(id),

    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (quantity <> 0),
    CHECK (unit_cost >= 0),

    CHECK (stock_before >= 0 OR stock_before < 0),
    CHECK (stock_after >= 0 OR stock_after < 0)
);

CREATE INDEX idx_inventory_movements_item_date
    ON inventory_movements(inventory_item_id, created_at);

CREATE INDEX idx_inventory_movements_branch_date
    ON inventory_movements(branch_id, created_at);

CREATE INDEX idx_inventory_movements_account_item
    ON inventory_movements(account_item_id);

CREATE INDEX idx_inventory_movements_purchase_item
    ON inventory_movements(purchase_item_id);

CREATE INDEX idx_inventory_movements_source
    ON inventory_movements(source_type, source_id);


-- ============================================================
-- IMMUTABILITY OF INVENTORY MOVEMENTS
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_inventory_movement_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'Inventory movements are immutable and cannot be updated or deleted';
END;
$$;

CREATE TRIGGER trg_inventory_movements_immutable_update
BEFORE UPDATE ON inventory_movements
FOR EACH ROW
EXECUTE FUNCTION prevent_inventory_movement_mutation();

CREATE TRIGGER trg_inventory_movements_immutable_delete
BEFORE DELETE ON inventory_movements
FOR EACH ROW
EXECUTE FUNCTION prevent_inventory_movement_mutation();


-- ============================================================
-- EMPLOYEES
-- ============================================================

CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,

    document_number VARCHAR(50),

    phone           VARCHAR(50),
    email           VARCHAR(150),

    position        VARCHAR(100),

    notes           TEXT,

    active          BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employees_branch
    ON employees(branch_id);

CREATE TRIGGER trg_employees_updated_at
BEFORE UPDATE ON employees
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- EMPLOYEE WAGE RATES
-- ============================================================

CREATE TABLE employee_wage_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    employee_id     UUID NOT NULL
        REFERENCES employees(id)
        ON DELETE CASCADE,

    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,

    hourly_rate     NUMERIC(14, 2) NOT NULL,

    active          BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (start_time <> end_time),
    CHECK (hourly_rate >= 0)
);

CREATE INDEX idx_employee_wage_rates_employee
    ON employee_wage_rates(employee_id);

CREATE TRIGGER trg_employee_wage_rates_updated_at
BEFORE UPDATE ON employee_wage_rates
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- EMPLOYEE SHIFTS
-- ============================================================

CREATE TABLE employee_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    employee_id     UUID NOT NULL
        REFERENCES employees(id),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    work_date       DATE NOT NULL,

    clock_in        TIMESTAMPTZ NOT NULL,
    clock_out       TIMESTAMPTZ,

    regular_hours   NUMERIC(10, 4) NOT NULL DEFAULT 0,

    calculated_pay  NUMERIC(14, 2) NOT NULL DEFAULT 0,

    status          employee_shift_status NOT NULL DEFAULT 'OPEN',

    notes           TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (regular_hours >= 0),
    CHECK (calculated_pay >= 0),

    CHECK (
        clock_out IS NULL
        OR clock_out > clock_in
    )
);

CREATE INDEX idx_employee_shifts_employee_date
    ON employee_shifts(employee_id, work_date);

CREATE INDEX idx_employee_shifts_branch_date
    ON employee_shifts(branch_id, work_date);

CREATE TRIGGER trg_employee_shifts_updated_at
BEFORE UPDATE ON employee_shifts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- EMPLOYEE BONUSES
-- ============================================================

CREATE TABLE employee_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    employee_id     UUID NOT NULL
        REFERENCES employees(id),

    shift_id        UUID
        REFERENCES employee_shifts(id),

    bonus_date      DATE NOT NULL,

    amount          NUMERIC(14, 2) NOT NULL,

    comments        TEXT,

    created_by_user_id UUID NOT NULL
        REFERENCES users(id),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (amount > 0)
);

CREATE INDEX idx_employee_bonuses_employee_date
    ON employee_bonuses(employee_id, bonus_date);


-- ============================================================
-- EMPLOYEE PAYMENTS
-- ============================================================

CREATE TABLE employee_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    employee_id      UUID NOT NULL
        REFERENCES employees(id),

    shift_id         UUID NOT NULL
        REFERENCES employee_shifts(id),

    payment_date     DATE NOT NULL,

    base_amount      NUMERIC(14, 2) NOT NULL DEFAULT 0,
    bonus_amount     NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_amount     NUMERIC(14, 2) NOT NULL DEFAULT 0,

    payment_method_id UUID
        REFERENCES payment_methods(id),

    paid_by_user_id  UUID NOT NULL
        REFERENCES users(id),

    notes            TEXT,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (base_amount >= 0),
    CHECK (bonus_amount >= 0),
    CHECK (total_amount >= 0)
);

CREATE INDEX idx_employee_payments_employee_date
    ON employee_payments(employee_id, payment_date);


-- ============================================================
-- KITCHEN ORDERS
-- ============================================================

CREATE TABLE kitchen_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    account_id      UUID NOT NULL
        REFERENCES accounts(id),

    ticket_number   VARCHAR(50) NOT NULL,

    content         JSONB NOT NULL,

    printed_at      TIMESTAMPTZ,

    reprint_count   INTEGER NOT NULL DEFAULT 0,

    created_by_user_id UUID NOT NULL
        REFERENCES users(id),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (reprint_count >= 0)
);

CREATE INDEX idx_kitchen_orders_account
    ON kitchen_orders(account_id);

CREATE INDEX idx_kitchen_orders_branch_date
    ON kitchen_orders(branch_id, created_at);


-- ============================================================
-- PRINT JOBS
-- ============================================================

CREATE TABLE print_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    printer_type    printer_type NOT NULL,

    document_type   print_document_type NOT NULL,

    reference_type  VARCHAR(50),
    reference_id    UUID,

    payload         JSONB NOT NULL,

    status          print_job_status NOT NULL DEFAULT 'PENDING',

    attempts        INTEGER NOT NULL DEFAULT 0,

    error_message   TEXT,

    printed_at      TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (attempts >= 0)
);

CREATE INDEX idx_print_jobs_branch_status
    ON print_jobs(branch_id, status);

CREATE INDEX idx_print_jobs_reference
    ON print_jobs(reference_type, reference_id);


-- ============================================================
-- AUDIT LOG
-- ============================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id      UUID NOT NULL
        REFERENCES companies(id),

    branch_id       UUID
        REFERENCES branches(id),

    user_id         UUID
        REFERENCES users(id),

    action          VARCHAR(100) NOT NULL,

    entity_type     VARCHAR(100) NOT NULL,
    entity_id       UUID,

    before_data     JSONB,
    after_data      JSONB,

    metadata        JSONB NOT NULL DEFAULT '{}'::JSONB,

    ip_address      INET,
    user_agent      TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity
    ON audit_logs(entity_type, entity_id);

CREATE INDEX idx_audit_logs_user_date
    ON audit_logs(user_id, created_at);

CREATE INDEX idx_audit_logs_branch_date
    ON audit_logs(branch_id, created_at);


-- ============================================================
-- OFFLINE DEVICES
-- ============================================================

CREATE TABLE sync_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    branch_id       UUID NOT NULL
        REFERENCES branches(id),

    device_identifier VARCHAR(200) NOT NULL,
    device_name      VARCHAR(150),

    device_type      VARCHAR(50),

    last_sync_at     TIMESTAMPTZ,

    active           BOOLEAN NOT NULL DEFAULT TRUE,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (branch_id, device_identifier)
);


-- ============================================================
-- OFFLINE SYNC OPERATIONS
-- ============================================================

CREATE TABLE sync_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    device_id       UUID NOT NULL
        REFERENCES sync_devices(id),

    operation_id    UUID NOT NULL,

    entity_type     VARCHAR(100) NOT NULL,
    entity_id       UUID NOT NULL,

    operation_type  sync_operation_type NOT NULL,

    payload         JSONB NOT NULL,

    status          sync_operation_status NOT NULL DEFAULT 'PENDING',

    error_message   TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at    TIMESTAMPTZ,

    UNIQUE (operation_id)
);

CREATE INDEX idx_sync_operations_device_status
    ON sync_operations(device_id, status);

CREATE INDEX idx_sync_operations_entity
    ON sync_operations(entity_type, entity_id);


-- ============================================================
-- BACKUP RECORDS
-- ============================================================

CREATE TABLE backup_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id      UUID NOT NULL
        REFERENCES companies(id),

    backup_type     VARCHAR(50) NOT NULL,

    storage_reference TEXT NOT NULL,

    status          VARCHAR(50) NOT NULL,

    size_bytes      BIGINT,

    checksum        VARCHAR(200),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- REPORTING VIEWS
-- ============================================================

-- Product profitability based on current calculated cost.
CREATE VIEW product_profitability AS
SELECT
    p.id,
    p.branch_id,
    p.name,
    p.sale_price,
    p.calculated_cost,

    (p.sale_price - p.calculated_cost) AS profit,

    CASE
        WHEN p.sale_price > 0
            THEN ((p.sale_price - p.calculated_cost) / p.sale_price) * 100
        ELSE 0
    END AS margin_percentage,

    p.active

FROM products p;


-- Current stock alerts.
CREATE VIEW inventory_stock_alerts AS
SELECT
    i.id,
    i.branch_id,
    i.name,
    i.unit,
    i.current_stock,
    i.minimum_stock,

    CASE
        WHEN i.current_stock <= 0 THEN 'OUT_OF_STOCK'
        WHEN i.current_stock < i.minimum_stock THEN 'LOW_STOCK'
        ELSE 'OK'
    END AS alert_status

FROM inventory_items i
WHERE i.active = TRUE;


-- Open tables.
CREATE VIEW table_overview AS
SELECT
    t.id,
    da.branch_id,
    da.id AS dining_area_id,
    da.name AS dining_area_name,
    t.name AS table_name,
    t.capacity,
    t.status,
    t.active
FROM restaurant_tables t
JOIN dining_areas da
    ON da.id = t.dining_area_id
WHERE t.active = TRUE;


-- Daily sales summary.
CREATE VIEW daily_sales_summary AS
SELECT
    a.branch_id,
    DATE(a.closed_at) AS sale_date,
    COUNT(*) AS accounts_count,
    SUM(a.subtotal) AS subtotal,
    SUM(a.discount_total) AS discount_total,
    SUM(a.service_total) AS service_total,
    SUM(a.tax_total) AS tax_total,
    SUM(a.total) AS total
FROM accounts a
WHERE a.status = 'PAID'
GROUP BY
    a.branch_id,
    DATE(a.closed_at);


-- ============================================================
-- INDEXES FOR REPORTING
-- ============================================================

CREATE INDEX idx_accounts_status_closed_at
    ON accounts(branch_id, status, closed_at);

CREATE INDEX idx_account_items_created_at
    ON account_items(created_at);

CREATE INDEX idx_payments_method_date
    ON payments(payment_method_id, received_at);

CREATE INDEX idx_expenses_payment_date
    ON expenses(payment_method_id, expense_date);

CREATE INDEX idx_employee_shifts_status_date
    ON employee_shifts(branch_id, status, work_date);


-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON COLUMN inventory_items.unit_cost IS
'Cost per configured inventory unit. No implicit unit conversion is performed.';

COMMENT ON COLUMN products.calculated_cost IS
'Cached calculated cost. Source of truth is product composition and inventory costs. Must not be manually edited as a business value.';

COMMENT ON COLUMN account_items.consumption_snapshot IS
'Immutable snapshot of inventory consumption generated when the item is sold.';

COMMENT ON TABLE inventory_movements IS
'Immutable Kardex. Corrections are represented by new movements.';

COMMENT ON TABLE sync_operations IS
'Idempotent offline operations. operation_id must be globally unique.';

COMMIT;