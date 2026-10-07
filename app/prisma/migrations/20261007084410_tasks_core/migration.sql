-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "task_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "calendar_source_type" AS ENUM ('MANUAL', 'TASK', 'DIARY', 'BILL', 'FAMILY', 'MAINTENANCE', 'MEAL', 'SHOPPING', 'APPOINTMENT');

-- CreateEnum
CREATE TYPE "calendar_category" AS ENUM ('GENERAL', 'FAMILY', 'HOME', 'HEALTH', 'WORK', 'OTHER');

-- CreateTable
CREATE TABLE "task_categories" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "category_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "task_status" NOT NULL DEFAULT 'TODO',
    "priority" "task_priority" NOT NULL DEFAULT 'MEDIUM',
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "recurrence" JSONB,
    "series_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "category" "calendar_category" NOT NULL DEFAULT 'GENERAL',
    "location" TEXT,
    "recurrence" JSONB,
    "reminder_offset_minutes" INTEGER,
    "reminder_enabled" BOOLEAN NOT NULL DEFAULT true,
    "source_type" "calendar_source_type" NOT NULL DEFAULT 'MANUAL',
    "source_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_categories_household_id_idx" ON "task_categories"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_categories_household_id_normalized_key" ON "task_categories"("household_id", "normalized");

-- CreateIndex
CREATE INDEX "tasks_household_id_status_idx" ON "tasks"("household_id", "status");

-- CreateIndex
CREATE INDEX "tasks_household_id_due_at_idx" ON "tasks"("household_id", "due_at");

-- CreateIndex
CREATE INDEX "tasks_household_id_assigned_to_id_idx" ON "tasks"("household_id", "assigned_to_id");

-- CreateIndex
CREATE INDEX "tasks_household_id_created_at_idx" ON "tasks"("household_id", "created_at");

-- CreateIndex
CREATE INDEX "tasks_series_id_idx" ON "tasks"("series_id");

-- CreateIndex
CREATE INDEX "calendar_events_household_id_start_at_idx" ON "calendar_events"("household_id", "start_at");

-- CreateIndex
CREATE INDEX "calendar_events_household_id_end_at_idx" ON "calendar_events"("household_id", "end_at");

-- CreateIndex
CREATE INDEX "calendar_events_household_id_source_type_idx" ON "calendar_events"("household_id", "source_type");

-- CreateIndex
CREATE INDEX "calendar_events_household_id_source_id_idx" ON "calendar_events"("household_id", "source_id");

-- AddForeignKey
ALTER TABLE "task_categories" ADD CONSTRAINT "task_categories_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "task_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
