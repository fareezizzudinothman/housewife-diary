-- CreateEnum
CREATE TYPE "time_of_day" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');

-- CreateTable
CREATE TABLE "moods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "moods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diary_entries" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "time_of_day" "time_of_day" NOT NULL DEFAULT 'EVENING',
    "mood_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diary_tags" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diary_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diary_entry_tags" (
    "entry_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "diary_entry_tags_pkey" PRIMARY KEY ("entry_id","tag_id")
);

-- CreateTable
CREATE TABLE "diary_attachments" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diary_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diary_entries_household_id_user_id_entry_date_idx" ON "diary_entries"("household_id", "user_id", "entry_date" DESC);

-- CreateIndex
CREATE INDEX "diary_tags_user_id_idx" ON "diary_tags"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "diary_tags_household_id_user_id_normalized_key" ON "diary_tags"("household_id", "user_id", "normalized");

-- CreateIndex
CREATE UNIQUE INDEX "diary_attachments_stored_name_key" ON "diary_attachments"("stored_name");

-- CreateIndex
CREATE INDEX "diary_attachments_entry_id_idx" ON "diary_attachments"("entry_id");

-- AddForeignKey
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_mood_id_fkey" FOREIGN KEY ("mood_id") REFERENCES "moods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_tags" ADD CONSTRAINT "diary_tags_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_tags" ADD CONSTRAINT "diary_tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_entry_tags" ADD CONSTRAINT "diary_entry_tags_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "diary_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_entry_tags" ADD CONSTRAINT "diary_entry_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "diary_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_attachments" ADD CONSTRAINT "diary_attachments_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "diary_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the reusable mood catalog (id doubles as the stable API slug).
INSERT INTO "moods" ("id", "name", "sort_order") VALUES
  ('happy', 'Happy', 1),
  ('calm', 'Calm', 2),
  ('loved', 'Loved', 3),
  ('excited', 'Excited', 4),
  ('neutral', 'Neutral', 5),
  ('tired', 'Tired', 6),
  ('sad', 'Sad', 7),
  ('stressed', 'Stressed', 8),
  ('angry', 'Angry', 9),
  ('anxious', 'Anxious', 10);
