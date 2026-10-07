-- CreateEnum
CREATE TYPE "meal_type" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');

-- CreateEnum
CREATE TYPE "item_category" AS ENUM ('PRODUCE', 'MEAT', 'SEAFOOD', 'DAIRY', 'PANTRY', 'FROZEN', 'DRINKS', 'HOUSEHOLD', 'OTHER');

-- CreateEnum
CREATE TYPE "inventory_location" AS ENUM ('PANTRY', 'REFRIGERATOR', 'FREEZER', 'HOUSEHOLD', 'OTHER');

-- CreateEnum
CREATE TYPE "inventory_transaction_type" AS ENUM ('PURCHASE', 'CONSUME', 'ADJUST', 'WASTE');

-- CreateTable
CREATE TABLE "recipes" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "servings" INTEGER,
    "prep_minutes" INTEGER,
    "cook_minutes" INTEGER,
    "category" TEXT,
    "cuisine" TEXT,
    "is_favourite" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "quantity" DECIMAL(12,3),
    "unit" TEXT,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plan_entries" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "recipe_id" TEXT,
    "date" DATE NOT NULL,
    "meal_type" "meal_type" NOT NULL,
    "title" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_plan_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_lists" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_list_items" (
    "id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "recipe_id" TEXT,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "quantity" DECIMAL(12,3),
    "unit" TEXT,
    "category" "item_category" NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "purchased_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "category" "item_category" NOT NULL DEFAULT 'OTHER',
    "location" "inventory_location" NOT NULL DEFAULT 'PANTRY',
    "expires_at" DATE,
    "minimum_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "type" "inventory_transaction_type" NOT NULL,
    "quantity_delta" DECIMAL(12,3) NOT NULL,
    "quantity_after" DECIMAL(12,3) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipes_household_id_updated_at_idx" ON "recipes"("household_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "recipes_household_id_is_favourite_idx" ON "recipes"("household_id", "is_favourite");

-- CreateIndex
CREATE INDEX "recipe_ingredients_recipe_id_sort_order_idx" ON "recipe_ingredients"("recipe_id", "sort_order");

-- CreateIndex
CREATE INDEX "recipe_ingredients_normalized_idx" ON "recipe_ingredients"("normalized");

-- CreateIndex
CREATE INDEX "meal_plan_entries_household_id_date_idx" ON "meal_plan_entries"("household_id", "date");

-- CreateIndex
CREATE INDEX "meal_plan_entries_household_id_meal_type_idx" ON "meal_plan_entries"("household_id", "meal_type");

-- CreateIndex
CREATE INDEX "meal_plan_entries_recipe_id_idx" ON "meal_plan_entries"("recipe_id");

-- CreateIndex
CREATE INDEX "shopping_lists_household_id_archived_at_idx" ON "shopping_lists"("household_id", "archived_at");

-- CreateIndex
CREATE INDEX "shopping_list_items_list_id_purchased_at_idx" ON "shopping_list_items"("list_id", "purchased_at");

-- CreateIndex
CREATE INDEX "shopping_list_items_list_id_category_idx" ON "shopping_list_items"("list_id", "category");

-- CreateIndex
CREATE INDEX "shopping_list_items_normalized_idx" ON "shopping_list_items"("normalized");

-- CreateIndex
CREATE INDEX "inventory_items_household_id_normalized_idx" ON "inventory_items"("household_id", "normalized");

-- CreateIndex
CREATE INDEX "inventory_items_household_id_expires_at_idx" ON "inventory_items"("household_id", "expires_at");

-- CreateIndex
CREATE INDEX "inventory_items_household_id_category_idx" ON "inventory_items"("household_id", "category");

-- CreateIndex
CREATE INDEX "inventory_items_household_id_location_idx" ON "inventory_items"("household_id", "location");

-- CreateIndex
CREATE INDEX "inventory_transactions_item_id_created_at_idx" ON "inventory_transactions"("item_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "inventory_transactions_household_id_created_at_idx" ON "inventory_transactions"("household_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "shopping_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
