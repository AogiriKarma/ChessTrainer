-- CreateTable
CREATE TABLE "players" (
    "id" UUID NOT NULL,
    "lichess_id" TEXT,
    "chesscom_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "pgn" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "analyzed" BOOLEAN NOT NULL DEFAULT false,
    "analyzed_at" TIMESTAMP(3),

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mistakes" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "move_number" INTEGER NOT NULL,
    "fen" TEXT NOT NULL,
    "played_move" TEXT NOT NULL,
    "best_move" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "theme" TEXT,
    "eval_loss" INTEGER NOT NULL,

    CONSTRAINT "mistakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" UUID NOT NULL,
    "mistake_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "fen_start" TEXT NOT NULL,
    "solution" JSONB NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "solved_at" TIMESTAMP(3),

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weakness_profiles" (
    "player_id" UUID NOT NULL,
    "tactical_score" DOUBLE PRECISION NOT NULL,
    "endgame_score" DOUBLE PRECISION NOT NULL,
    "opening_score" DOUBLE PRECISION NOT NULL,
    "positional_score" DOUBLE PRECISION NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weakness_profiles_pkey" PRIMARY KEY ("player_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_lichess_id_key" ON "players"("lichess_id");

-- CreateIndex
CREATE UNIQUE INDEX "players_chesscom_id_key" ON "players"("chesscom_id");

-- CreateIndex
CREATE UNIQUE INDEX "exercises_mistake_id_key" ON "exercises"("mistake_id");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_mistake_id_fkey" FOREIGN KEY ("mistake_id") REFERENCES "mistakes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weakness_profiles" ADD CONSTRAINT "weakness_profiles_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
