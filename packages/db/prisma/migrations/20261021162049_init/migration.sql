-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('Filled', 'Open', 'PartiallyFilled', 'Cancelled');

-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('Bid', 'Ask');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('market', 'Limit');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "imgUrl" TEXT NOT NULL,

    CONSTRAINT "market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "orderSide" "OrderSide" NOT NULL,
    "price" TEXT NOT NULL,
    "slippage" INTEGER NOT NULL,
    "qty" TEXT NOT NULL,
    "filledQty" TEXT NOT NULL,
    "initialMargin" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fill" (
    "id" TEXT NOT NULL,
    "maker_id" TEXT NOT NULL,
    "taker_id" TEXT NOT NULL,
    "qty" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "maker_order_id" TEXT NOT NULL,
    "taker_order_id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fill_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fill" ADD CONSTRAINT "fill_maker_id_fkey" FOREIGN KEY ("maker_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fill" ADD CONSTRAINT "fill_taker_id_fkey" FOREIGN KEY ("taker_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fill" ADD CONSTRAINT "fill_taker_order_id_fkey" FOREIGN KEY ("taker_order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fill" ADD CONSTRAINT "fill_maker_order_id_fkey" FOREIGN KEY ("maker_order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
