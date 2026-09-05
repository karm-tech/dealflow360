-- A draft cannot promise a date, but it does know the one the customer asked
-- for, so slippage is measured against the request.
ALTER TABLE "Quotation" RENAME COLUMN "promisedDeliveryDate" TO "requestedDeliveryDate";

-- When the customer got in touch, as opposed to when the quotation was written.
ALTER TABLE "Quotation" ADD COLUMN "inquiryDate" DATETIME;

-- One discount per line. A blanket discount is applied by writing it to every
-- line, so the figure on a line is the whole story.
ALTER TABLE "Quotation" DROP COLUMN "orderDiscountPct";
