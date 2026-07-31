ALTER TABLE "User"
ADD COLUMN "chartSingleColor" TEXT NOT NULL DEFAULT '#2f6f9f',
ADD COLUMN "chartSeriesColors" TEXT[] NOT NULL DEFAULT ARRAY['#2f6f9f', '#c98352', '#2f7d5f', '#9a4b5c', '#5a659d', '#a47a2b', '#3f7f8f']::TEXT[];
