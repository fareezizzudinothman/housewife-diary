/*
  Warnings:

  - A unique constraint covering the columns `[source_type,source_id]` on the table `tasks` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "task_source_type" AS ENUM ('MANUAL', 'CLEANING', 'MAINTENANCE', 'IDEA');

-- CreateEnum
CREATE TYPE "cleaning_frequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "cleaning_status" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "laundry_status" AS ENUM ('PENDING', 'WASHING', 'DRYING', 'FOLDED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "maintenance_status" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "document_category" AS ENUM ('INSURANCE', 'WARRANTY', 'RECEIPT', 'CONTRACT', 'PROPERTY', 'SCHOOL', 'MEDICAL', 'FINANCIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "document_reference_type" AS ENUM ('MAINTENANCE', 'FINANCE_TRANSACTION', 'INVENTORY', 'FAMILY_MEMBER');

-- CreateEnum
CREATE TYPE "idea_status" AS ENUM ('IDEA', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "assigned_family_member_id" TEXT,
ADD COLUMN     "source_id" TEXT,
ADD COLUMN     "source_type" "task_source_type" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "family_members" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "linked_user_id" TEXT,
    "date_of_birth" DATE,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_events" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "member_id" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "event_date" DATE NOT NULL,
    "repeats_yearly" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cleaning_definitions" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "frequency" "cleaning_frequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "status" "cleaning_status" NOT NULL DEFAULT 'ACTIVE',
    "last_completed_at" TIMESTAMP(3),
    "next_due_at" DATE,
    "assigned_family_member_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cleaning_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laundry_items" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "laundry_status" NOT NULL DEFAULT 'PENDING',
    "scheduled_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "laundry_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_maintenance" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "room_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "priority" "task_priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "maintenance_status" NOT NULL DEFAULT 'OPEN',
    "scheduled_date" DATE NOT NULL,
    "completed_at" TIMESTAMP(3),
    "transaction_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "document_category" NOT NULL DEFAULT 'OTHER',
    "original_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "expiry_date" DATE,
    "reference_type" "document_reference_type",
    "reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_tags" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_tag_links" (
    "note_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "note_tag_links_pkey" PRIMARY KEY ("note_id","tag_id")
);

-- CreateTable
CREATE TABLE "ideas" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "priority" "task_priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "idea_status" NOT NULL DEFAULT 'IDEA',
    "estimatedCost" DECIMAL(14,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'SGD',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ideas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "family_members_household_id_active_idx" ON "family_members"("household_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "family_members_household_id_normalized_key" ON "family_members"("household_id", "normalized");

-- CreateIndex
CREATE INDEX "family_events_household_id_event_date_idx" ON "family_events"("household_id", "event_date");

-- CreateIndex
CREATE INDEX "rooms_household_id_active_idx" ON "rooms"("household_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_household_id_normalized_key" ON "rooms"("household_id", "normalized");

-- CreateIndex
CREATE INDEX "cleaning_definitions_household_id_status_idx" ON "cleaning_definitions"("household_id", "status");

-- CreateIndex
CREATE INDEX "cleaning_definitions_household_id_next_due_at_idx" ON "cleaning_definitions"("household_id", "next_due_at");

-- CreateIndex
CREATE INDEX "laundry_items_household_id_status_idx" ON "laundry_items"("household_id", "status");

-- CreateIndex
CREATE INDEX "laundry_items_household_id_scheduled_date_idx" ON "laundry_items"("household_id", "scheduled_date");

-- CreateIndex
CREATE UNIQUE INDEX "home_maintenance_transaction_id_key" ON "home_maintenance"("transaction_id");

-- CreateIndex
CREATE INDEX "home_maintenance_household_id_status_idx" ON "home_maintenance"("household_id", "status");

-- CreateIndex
CREATE INDEX "home_maintenance_household_id_scheduled_date_idx" ON "home_maintenance"("household_id", "scheduled_date");

-- CreateIndex
CREATE UNIQUE INDEX "documents_stored_name_key" ON "documents"("stored_name");

-- CreateIndex
CREATE INDEX "documents_household_id_category_idx" ON "documents"("household_id", "category");

-- CreateIndex
CREATE INDEX "documents_household_id_expiry_date_idx" ON "documents"("household_id", "expiry_date");

-- CreateIndex
CREATE INDEX "notes_household_id_pinned_archived_idx" ON "notes"("household_id", "pinned", "archived");

-- CreateIndex
CREATE INDEX "notes_household_id_archived_updated_at_idx" ON "notes"("household_id", "archived", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "note_tags_household_id_normalized_key" ON "note_tags"("household_id", "normalized");

-- CreateIndex
CREATE INDEX "ideas_household_id_status_idx" ON "ideas"("household_id", "status");

-- CreateIndex
CREATE INDEX "tasks_household_id_assigned_family_member_id_idx" ON "tasks"("household_id", "assigned_family_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_source_type_source_id_key" ON "tasks"("source_type", "source_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_family_member_id_fkey" FOREIGN KEY ("assigned_family_member_id") REFERENCES "family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_events" ADD CONSTRAINT "family_events_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_events" ADD CONSTRAINT "family_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_events" ADD CONSTRAINT "family_events_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_definitions" ADD CONSTRAINT "cleaning_definitions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_definitions" ADD CONSTRAINT "cleaning_definitions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_definitions" ADD CONSTRAINT "cleaning_definitions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_definitions" ADD CONSTRAINT "cleaning_definitions_assigned_family_member_id_fkey" FOREIGN KEY ("assigned_family_member_id") REFERENCES "family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_items" ADD CONSTRAINT "laundry_items_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_items" ADD CONSTRAINT "laundry_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_maintenance" ADD CONSTRAINT "home_maintenance_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_maintenance" ADD CONSTRAINT "home_maintenance_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_maintenance" ADD CONSTRAINT "home_maintenance_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_maintenance" ADD CONSTRAINT "home_maintenance_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_tag_links" ADD CONSTRAINT "note_tag_links_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_tag_links" ADD CONSTRAINT "note_tag_links_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "note_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
