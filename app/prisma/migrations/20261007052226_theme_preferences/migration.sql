-- CreateEnum
CREATE TYPE "theme_mode" AS ENUM ('LIGHT', 'DARK', 'BOTH');

-- CreateEnum
CREATE TYPE "color_mode" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "density" AS ENUM ('COMPACT', 'COMFORTABLE');

-- CreateEnum
CREATE TYPE "nav_style" AS ENUM ('SIDEBAR', 'BOTTOM');

-- CreateTable
CREATE TABLE "themes" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mood" TEXT,
    "mode" "theme_mode" NOT NULL DEFAULT 'BOTH',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "tokens" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "theme_id" TEXT,
    "theme_overrides" JSONB,
    "color_mode" "color_mode" NOT NULL DEFAULT 'SYSTEM',
    "density" "density" NOT NULL DEFAULT 'COMFORTABLE',
    "nav_style" "nav_style" NOT NULL DEFAULT 'SIDEBAR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "themes_slug_key" ON "themes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SeedData (built-in theme presets — source of truth: docs/theme-system.md)
INSERT INTO "themes" ("id", "slug", "name", "mood", "mode", "is_default", "sort_order", "tokens", "updated_at") VALUES
  ('rose_garden', 'rose_garden', 'Rose Garden', 'Warm, classic and romantic — roses on cream.', 'BOTH', true, 1, '{"light":{"--color-primary":"#aa4d72","--color-secondary":"#7d9b77","--color-accent":"#d9a441","--color-background":"#faf6f1","--color-surface":"#ffffff","--color-surface-alt":"#f5eee7","--color-text":"#3d3833","--color-text-muted":"#6e655d","--color-border":"#eadfd6","--color-success":"#3a8052","--color-warning":"#a06a26","--color-danger":"#b04a4a","--color-info":"#3d7287"},"dark":{"--color-primary":"#e08cab","--color-secondary":"#9dbd97","--color-accent":"#e5b765","--color-background":"#201a1d","--color-surface":"#2a2327","--color-surface-alt":"#332b30","--color-text":"#f2e9ea","--color-text-muted":"#b7a7ad","--color-border":"#453941","--color-success":"#6fbf8b","--color-warning":"#dda35c","--color-danger":"#e07a7a","--color-info":"#7ab3cc"}}'::jsonb, CURRENT_TIMESTAMP),
  ('soft_pink', 'soft_pink', 'Soft Pink', 'Gentle, light and airy — blush on white.', 'BOTH', false, 2, '{"light":{"--color-primary":"#a84e74","--color-secondary":"#c48aa6","--color-accent":"#c98a3f","--color-background":"#fdf8fa","--color-surface":"#ffffff","--color-surface-alt":"#f9eff3","--color-text":"#3b3237","--color-text-muted":"#6f636a","--color-border":"#ecd4de","--color-success":"#3a8052","--color-warning":"#a06a26","--color-danger":"#b04a4a","--color-info":"#3d7287"},"dark":{"--color-primary":"#e796b7","--color-secondary":"#cfb1c1","--color-accent":"#e0b166","--color-background":"#211a1e","--color-surface":"#2b2328","--color-surface-alt":"#352c32","--color-text":"#f4ebee","--color-text-muted":"#bdaeb5","--color-border":"#463a41","--color-success":"#6fbf8b","--color-warning":"#dda35c","--color-danger":"#e07a7a","--color-info":"#7ab3cc"}}'::jsonb, CURRENT_TIMESTAMP),
  ('sage_garden', 'sage_garden', 'Sage Garden', 'Calm, natural and grounded — sage on warm ivory.', 'BOTH', false, 3, '{"light":{"--color-primary":"#526e4e","--color-secondary":"#a3b18a","--color-accent":"#c99537","--color-background":"#f7f5ee","--color-surface":"#ffffff","--color-surface-alt":"#eef0e6","--color-text":"#33372e","--color-text-muted":"#63685a","--color-border":"#dfe2d4","--color-success":"#3a8052","--color-warning":"#a06a26","--color-danger":"#b04a4a","--color-info":"#3d7287"},"dark":{"--color-primary":"#9dc493","--color-secondary":"#b9c9a9","--color-accent":"#ddb75e","--color-background":"#1c1f1a","--color-surface":"#242821","--color-surface-alt":"#2c312a","--color-text":"#edf1e7","--color-text-muted":"#aab3a2","--color-border":"#3b4238","--color-success":"#74c187","--color-warning":"#d9a65c","--color-danger":"#df8080","--color-info":"#7ab8cf"}}'::jsonb, CURRENT_TIMESTAMP),
  ('lavender', 'lavender', 'Lavender', 'Soft, airy and dreamy — lavender on pale lilac.', 'BOTH', false, 4, '{"light":{"--color-primary":"#7359ab","--color-secondary":"#b3a5d8","--color-accent":"#d4a24f","--color-background":"#f8f6fc","--color-surface":"#ffffff","--color-surface-alt":"#f0ecf8","--color-text":"#35303f","--color-text-muted":"#665f75","--color-border":"#e4def2","--color-success":"#3a8052","--color-warning":"#a06a26","--color-danger":"#b04a55","--color-info":"#4e6db5"},"dark":{"--color-primary":"#b9a5ec","--color-secondary":"#cfc4ea","--color-accent":"#e2ba72","--color-background":"#1b1922","--color-surface":"#232030","--color-surface-alt":"#2b2739","--color-text":"#efeaf8","--color-text-muted":"#aea6c4","--color-border":"#3c3650","--color-success":"#7fc495","--color-warning":"#dcab63","--color-danger":"#e28b96","--color-info":"#8aa8e8"}}'::jsonb, CURRENT_TIMESTAMP),
  ('peach', 'peach', 'Peach', 'Cozy, sunny and inviting — peach on cream.', 'BOTH', false, 5, '{"light":{"--color-primary":"#9e552e","--color-secondary":"#e8a87c","--color-accent":"#cf8a3c","--color-background":"#fcf6ee","--color-surface":"#ffffff","--color-surface-alt":"#faefe4","--color-text":"#3c332b","--color-text-muted":"#6f6257","--color-border":"#ecd8c4","--color-success":"#3a8052","--color-warning":"#a06a26","--color-danger":"#b04a4a","--color-info":"#3d7287"},"dark":{"--color-primary":"#f0a878","--color-secondary":"#e6bf9d","--color-accent":"#e0a95c","--color-background":"#211c18","--color-surface":"#2a2420","--color-surface-alt":"#332c26","--color-text":"#f4ece4","--color-text-muted":"#c2b3a7","--color-border":"#463c33","--color-success":"#79c18d","--color-warning":"#ddab60","--color-danger":"#e28479","--color-info":"#7db7cd"}}'::jsonb, CURRENT_TIMESTAMP),
  ('warm_coffee', 'warm_coffee', 'Warm Coffee', 'Rich, grounded and toasty — coffee on latte.', 'BOTH', false, 6, '{"light":{"--color-primary":"#7a4f38","--color-secondary":"#b08968","--color-accent":"#c48a3e","--color-background":"#f6f1ea","--color-surface":"#fffdfa","--color-surface-alt":"#efe6db","--color-text":"#362d26","--color-text-muted":"#6b5f54","--color-border":"#e5d9cc","--color-success":"#3a8052","--color-warning":"#a06a26","--color-danger":"#b04a4a","--color-info":"#3d7287"},"dark":{"--color-primary":"#d8a67f","--color-secondary":"#cdb096","--color-accent":"#e0b166","--color-background":"#1e1a17","--color-surface":"#272220","--color-surface-alt":"#302a27","--color-text":"#f1eae3","--color-text-muted":"#c0b3a8","--color-border":"#413833","--color-success":"#7cc08e","--color-warning":"#dca75f","--color-danger":"#e08378","--color-info":"#7fb8cd"}}'::jsonb, CURRENT_TIMESTAMP),
  ('ocean', 'ocean', 'Ocean', 'Fresh, clear and breezy — teal on seafoam.', 'BOTH', false, 7, '{"light":{"--color-primary":"#2f6f8f","--color-secondary":"#7fb6c9","--color-accent":"#d97f5a","--color-background":"#f2f8f8","--color-surface":"#ffffff","--color-surface-alt":"#e9f2f2","--color-text":"#2b383c","--color-text-muted":"#5b6d73","--color-border":"#cfe1e1","--color-success":"#3a8052","--color-warning":"#a06a26","--color-danger":"#b04a4a","--color-info":"#37739a"},"dark":{"--color-primary":"#6cb6d9","--color-secondary":"#9fcde0","--color-accent":"#eb9873","--color-background":"#132029","--color-surface":"#1a2a35","--color-surface-alt":"#213441","--color-text":"#e6f1f5","--color-text-muted":"#a4bcc6","--color-border":"#2e4552","--color-success":"#6dbf8b","--color-warning":"#dba45c","--color-danger":"#e58585","--color-info":"#5aa7d4"}}'::jsonb, CURRENT_TIMESTAMP),
  ('midnight', 'midnight', 'Midnight', 'Dark, elegant and quiet — slate blue on deep navy.', 'DARK', false, 8, '{"dark":{"--color-primary":"#97ade8","--color-secondary":"#8791bb","--color-accent":"#d8b45a","--color-background":"#0d111a","--color-surface":"#141a26","--color-surface-alt":"#1b2231","--color-text":"#e7ebf5","--color-text-muted":"#a3adc8","--color-border":"#2a3247","--color-success":"#64b982","--color-warning":"#d4a35c","--color-danger":"#dd7a85","--color-info":"#6aaee0"}}'::jsonb, CURRENT_TIMESTAMP),
  ('minimal', 'minimal', 'Minimal', 'Clean, quiet and modern — charcoal on white.', 'BOTH', false, 9, '{"light":{"--color-primary":"#2f3335","--color-secondary":"#8a9296","--color-accent":"#55708a","--color-background":"#f7f7f6","--color-surface":"#ffffff","--color-surface-alt":"#f0f0ee","--color-text":"#26292b","--color-text-muted":"#63686b","--color-border":"#dbdbd7","--color-success":"#3a8052","--color-warning":"#a06a26","--color-danger":"#ab4848","--color-info":"#3d7287"},"dark":{"--color-primary":"#e6e8ea","--color-secondary":"#9ba2a6","--color-accent":"#8fa8bf","--color-background":"#141516","--color-surface":"#1b1d1e","--color-surface-alt":"#232527","--color-text":"#eceeed","--color-text-muted":"#a5a9ab","--color-border":"#303336","--color-success":"#6cbf8b","--color-warning":"#d3a45c","--color-danger":"#dd7d7d","--color-info":"#72a8cc"}}'::jsonb, CURRENT_TIMESTAMP);
