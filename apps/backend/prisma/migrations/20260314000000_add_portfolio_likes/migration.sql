-- CreateTable
CREATE TABLE "portfolio_likes" (
    "user_id" UUID NOT NULL,
    "portfolio_item_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_likes_pkey" PRIMARY KEY ("user_id","portfolio_item_id")
);

-- AddForeignKey
ALTER TABLE "portfolio_likes" ADD CONSTRAINT "portfolio_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_likes" ADD CONSTRAINT "portfolio_likes_portfolio_item_id_fkey" FOREIGN KEY ("portfolio_item_id") REFERENCES "portfolio_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
