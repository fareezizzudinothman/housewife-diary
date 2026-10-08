-- CreateEnum
CREATE TYPE "finance_account_type" AS ENUM ('CASH', 'BANK', 'CREDIT_CARD', 'E_WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "finance_category_type" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "finance_transaction_type" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "finance_transaction_status" AS ENUM ('POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "finance_source_type" AS ENUM ('MANUAL', 'BILL', 'RECURRING');

-- CreateEnum
CREATE TYPE "finance_budget_period" AS ENUM ('MONTHLY');

-- CreateEnum
CREATE TYPE "finance_bill_status" AS ENUM ('UPCOMING', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "finance_recurrence_frequency" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "finance_accounts" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "type" "finance_account_type" NOT NULL DEFAULT 'CASH',
    "currency" VARCHAR(3) NOT NULL,
    "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_categories" (
    "id" TEXT NOT NULL,
    "household_id" TEXT,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "type" "finance_category_type" NOT NULL,
    "icon" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_transactions" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "type" "finance_transaction_type" NOT NULL,
    "status" "finance_transaction_status" NOT NULL DEFAULT 'POSTED',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "category_id" TEXT,
    "account_id" TEXT,
    "counter_account_id" TEXT,
    "transaction_date" DATE NOT NULL,
    "description" TEXT,
    "merchant" TEXT,
    "notes" TEXT,
    "source_type" "finance_source_type" NOT NULL DEFAULT 'MANUAL',
    "source_id" TEXT,
    "recurring_transaction_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_receipts" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_budgets" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "period" "finance_budget_period" NOT NULL DEFAULT 'MONTHLY',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_bills" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "due_date" DATE NOT NULL,
    "category_id" TEXT NOT NULL,
    "account_id" TEXT,
    "status" "finance_bill_status" NOT NULL DEFAULT 'UPCOMING',
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "paid_at" TIMESTAMP(3),
    "paid_transaction_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_recurring_transactions" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "type" "finance_transaction_type" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "category_id" TEXT NOT NULL,
    "account_id" TEXT,
    "description" TEXT,
    "merchant" TEXT,
    "notes" TEXT,
    "frequency" "finance_recurrence_frequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "next_occurrence" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_recurring_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_accounts_household_id_active_idx" ON "finance_accounts"("household_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "finance_accounts_household_id_normalized_key" ON "finance_accounts"("household_id", "normalized");

-- CreateIndex
CREATE INDEX "finance_categories_household_id_type_active_idx" ON "finance_categories"("household_id", "type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "finance_categories_household_id_type_normalized_key" ON "finance_categories"("household_id", "type", "normalized");

-- CreateIndex
CREATE INDEX "financial_transactions_household_id_transaction_date_idx" ON "financial_transactions"("household_id", "transaction_date" DESC);

-- CreateIndex
CREATE INDEX "financial_transactions_household_id_type_transaction_date_idx" ON "financial_transactions"("household_id", "type", "transaction_date");

-- CreateIndex
CREATE INDEX "financial_transactions_household_id_category_id_transaction_idx" ON "financial_transactions"("household_id", "category_id", "transaction_date");

-- CreateIndex
CREATE INDEX "financial_transactions_household_id_account_id_idx" ON "financial_transactions"("household_id", "account_id");

-- CreateIndex
CREATE INDEX "financial_transactions_household_id_status_idx" ON "financial_transactions"("household_id", "status");

-- CreateIndex
CREATE INDEX "financial_transactions_household_id_source_type_source_id_idx" ON "financial_transactions"("household_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_transactions_recurring_transaction_id_transaction_key" ON "financial_transactions"("recurring_transaction_id", "transaction_date");

-- CreateIndex
CREATE UNIQUE INDEX "finance_receipts_transaction_id_key" ON "finance_receipts"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_receipts_stored_name_key" ON "finance_receipts"("stored_name");

-- CreateIndex
CREATE INDEX "finance_budgets_household_id_year_month_idx" ON "finance_budgets"("household_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "finance_budgets_household_id_category_id_period_year_month_key" ON "finance_budgets"("household_id", "category_id", "period", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "finance_bills_paid_transaction_id_key" ON "finance_bills"("paid_transaction_id");

-- CreateIndex
CREATE INDEX "finance_bills_household_id_due_date_idx" ON "finance_bills"("household_id", "due_date");

-- CreateIndex
CREATE INDEX "finance_bills_household_id_status_idx" ON "finance_bills"("household_id", "status");

-- CreateIndex
CREATE INDEX "finance_bills_household_id_category_id_idx" ON "finance_bills"("household_id", "category_id");

-- CreateIndex
CREATE INDEX "finance_recurring_transactions_household_id_active_idx" ON "finance_recurring_transactions"("household_id", "active");

-- CreateIndex
CREATE INDEX "finance_recurring_transactions_household_id_next_occurrence_idx" ON "finance_recurring_transactions"("household_id", "next_occurrence");

-- AddForeignKey
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_counter_account_id_fkey" FOREIGN KEY ("counter_account_id") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_recurring_transaction_id_fkey" FOREIGN KEY ("recurring_transaction_id") REFERENCES "finance_recurring_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_receipts" ADD CONSTRAINT "finance_receipts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "financial_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_budgets" ADD CONSTRAINT "finance_budgets_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_budgets" ADD CONSTRAINT "finance_budgets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_budgets" ADD CONSTRAINT "finance_budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_bills" ADD CONSTRAINT "finance_bills_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_bills" ADD CONSTRAINT "finance_bills_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_bills" ADD CONSTRAINT "finance_bills_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_bills" ADD CONSTRAINT "finance_bills_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_bills" ADD CONSTRAINT "finance_bills_paid_transaction_id_fkey" FOREIGN KEY ("paid_transaction_id") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_recurring_transactions" ADD CONSTRAINT "finance_recurring_transactions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_recurring_transactions" ADD CONSTRAINT "finance_recurring_transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_recurring_transactions" ADD CONSTRAINT "finance_recurring_transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_recurring_transactions" ADD CONSTRAINT "finance_recurring_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
